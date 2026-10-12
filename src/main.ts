import { createRenderer, createFx, COVER_FLASH_SECONDS } from './render/render';
import { createInput } from './input/input';
import { createSummaryGate, overlayInputAllowed } from './input/gate';
import { createAudio } from './audio/audio';
import { fixedSteps } from './sim/sim';
import { createWorld, hears, player, stepWorld, IDLE_INPUT, type World } from './sim/world';
import { ROOM_ZERO } from './config/map';
import { sightClear, walkable } from './sim/level';
import { clampMarker } from './render/visibility';
import { muzzleFlashSeen } from './sim/vision';
import { canSee } from './sim/vision';
import { nextPhase, simRuns, type MatchEvent, type Phase } from './sim/match';
import { TUNING } from './config/tuning';
import { HEROES, heroById } from './config/heroes';
import { heroForKey } from './ui/heroKeys';
import { orientationOf, rotatePromptShown, ROTATE_QUERY } from './ui/orientation';
import { coverBoxAt } from './sim/cover';
import { WEAPONS } from './config/weapons';
import { adapterFromUrl, resolveIdentity, GUEST, type Identity } from './nft/identity';
import { recordRun, type TokenHistory } from './nft/history';
import { boundIdentity } from './nft/identity';
import { DEMO_COPY, TRAIT_INFO, isTokenId, sampleTokens, traitsFor } from './nft/traits';
import { fmtTime, loadRecords, recordBest, type Records } from './ui/records';
import { SIDEGRADES } from './sim/operators';
import { createAutopilot, type Autopilot } from './debug/autopilot';

const $ = (id: string) => document.getElementById(id)!;
const root = $('app');
const overlay = $('overlay');
const hint = $('hint');
// ?debug shows the bot perception overlay; add &nooverlay to keep the debug hook without it.
const DEBUG_OVERLAY = location.search.includes('debug') && !location.search.includes('nooverlay');
const HERO_KEY = 'chog.hero';
// SCRIPTED autopilot (debug only): ?debug&autoplay=<seed>[&hero=<id>] drives in-match input from src/debug/autopilot.ts
// through the normal game loop. Menus still need real clicks/keys. Never active without ?debug.
const QS = new URLSearchParams(location.search);
const AUTOPLAY_SEED = QS.has('debug') && QS.get('autoplay') !== null ? Number(QS.get('autoplay')) || 1 : null;

function compass(dx: number, dy: number): string {
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const i = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return names[i];
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

const SPEAKER_ON = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9c1.5 1.5 1.5 4.5 0 6M18.5 6.5c3 3 3 8 0 11"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>';

async function start() {
  await Promise.all([document.fonts.load('600 20px "Plex Mono"'), document.fonts.load('600 20px "Barlow Cond"')]).catch(() => undefined);
  const renderer = await createRenderer(root);
  const input = createInput(root);
  const audio = createAudio();
  const resolved = await resolveIdentity(adapterFromUrl(location.search)).catch(() => ({ identity: GUEST, note: 'Playing as guest.' }));
  let identity: Identity = resolved.identity;
  const DEMO_KEY = 'chog.demoToken';
  // NFT DEMO (RC-1): a token number picked on the DEMO screen binds DEMO traits. No wallet, no ownership check.
  if (identity.kind === 'guest') {
    try { const t = localStorage.getItem(DEMO_KEY); if (t && isTokenId(t)) identity = boundIdentity(t, 'mock'); } catch { /* ignore */ }
  }
  function setDemo(token: string | null) {
    identity = token ? boundIdentity(token, 'mock') : GUEST;
    try { if (token) localStorage.setItem(DEMO_KEY, token); else localStorage.removeItem(DEMO_KEY); } catch { /* ignore */ }
  }
  const demoChip = () => identity.kind === 'bound'
    ? `<span class="demo">DEMO</span> Chog #${esc(identity.tokenId!)} · ${esc(identity.sidegrade.name)}`
    : 'Guest';
  // Onboarding: shown once on first launch, re-openable from the title.
  const ONBOARD_KEY = 'chog.onboarded';
  let titleView: 'main' | 'howto' | 'demo' = (() => { try { return localStorage.getItem(ONBOARD_KEY) === '1' ? 'main' : 'howto'; } catch { return 'main'; } })();
  let records: Records = loadRecords(localStorage);
  let lastRun: { newBest: { time: boolean; kills: boolean } } | null = null;

  let phase: Phase = 'title';
  let heroId = (() => {
    const forced = AUTOPLAY_SEED !== null ? QS.get('hero') : null;
    if (forced && HEROES.some((x) => x.id === forced)) return forced;
    try {
      const h = localStorage.getItem(HERO_KEY);
      return h && HEROES.some((x) => x.id === h) ? h : HEROES[0].id;
    } catch {
      return HEROES[0].id;
    }
  })();
  let runIndex = 0;
  let autopilot: Autopilot | null = null;
  let world: World = createWorld({ seed: TUNING.seed, hero: heroId, sidegrade: identity.sidegrade });
  let acc = 0;
  let recapLeft = 0;
  let playTime = 0;
  let history: TokenHistory | null = null;
  let toastLeft = 0;
  const fx = createFx();
  const debugStats = { blockedCues: 0 };
  renderer.reset(world);

  const mute = $('mute') as HTMLButtonElement;
  const paintMute = () => {
    mute.innerHTML = audio.muted ? SPEAKER_OFF : SPEAKER_ON;
    mute.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
  };
  paintMute();
  // Audio may only start on a real user activation. Touch grants it on touchend/click, not on touchstart/pointerdown,
  // so unlock on those events (capture phase, so every tap or key anywhere counts).
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(type, () => audio.unlock(), { capture: true, passive: true });
  mute.onpointerdown = (e) => {
    e.stopPropagation();
    audio.muted = !audio.muted;
    paintMute();
  };
  $('pause').onpointerdown = (e) => {
    e.stopPropagation();
    if (phase === 'play') go('pause');
  };
  $('reload').onpointerdown = (e) => {
    e.stopPropagation();
    input.reload();
  };
  $('ability').onpointerdown = (e) => {
    e.stopPropagation();
    input.ability();
  };

  // Small top hint pill: shown for `seconds`, then fades. Never covers the play centre.
  let hintLeft = 0;
  function showHint(html: string, seconds: number) {
    hint.innerHTML = html;
    hintLeft = seconds;
    hint.style.opacity = seconds > 0 ? '1' : '0';
  }
  // First-match explanation of sound rings, shown once ever (persisted).
  const RING_HINT_KEY = 'chog.hint.rings';
  let ringHintDone = (() => { try { return localStorage.getItem(RING_HINT_KEY) === '1'; } catch { return true; } })();
  function ringHint() {
    if (ringHintDone) return;
    ringHintDone = true;
    try { localStorage.setItem(RING_HINT_KEY, '1'); } catch { /* ignore */ }
    showHint('Gold rings: a noise you <b>heard</b>, not saw. Enemies hear you too: running is loud, creeping is quiet.', 6);
  }

  // HUD panel rects for label avoidance (CHOG-HUD-002). Measured from the DOM, so safe-area insets count; cached
  // and refreshed on resize/orientation change and every 30 frames (cheap) so layout changes are picked up.
  const HUD_IDS = ['vitals', 'foes', 'sys', 'weapon', 'ability', 'reload'];
  let hudCache: { x: number; y: number; w: number; h: number }[] = [];
  let hudAge = 1e9;
  window.addEventListener('resize', () => (hudAge = 1e9));
  function hudRects() {
    if (++hudAge < 30) return hudCache;
    hudAge = 0;
    hudCache = [];
    for (const id of HUD_IDS) {
      const el = document.getElementById(id);
      if (!el || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) hudCache.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    return hudCache;
  }

  function toast(text: string) {
    $('toast').textContent = text;
    toastLeft = 1.4;
  }

  // ---- Flow ----
  // Restart from the summary needs a fresh press after a short lock (CHOG-FLOW-001).
  const summaryGate = createSummaryGate();
  let resumeSkip = false;
  let resultsAt = 0;
  function go(e: MatchEvent) {
    // Post-death protection: nothing on the summary (any button, key or tap) acts until the gate opens.
    if (phase === 'results' && !summaryGate.canRestart()) return;
    const next = nextPhase(phase, e);
    if (next === phase) return;
    const from = phase;
    phase = next;
    if (next === 'results') {
      resultsAt = performance.now();
      summaryGate.open(resultsAt);
      input.takeAction();
    }
    // Resuming never replays the paused time: no catch-up burst of sim steps.
    if (from === 'pause' && next === 'play') {
      acc = 0;
      resumeSkip = true;
    }
    // The click/tap/key that left a menu must never also fire (RC-2): fire needs release-then-press.
    if (next === 'play') input.holdFireUntilRelease();
    audio.play('ui', 0, 0, 1, false, true);
    render();
  }

  // The portrait prompt says what is waiting behind it: a paused run is kept exactly as it was.
  function updateRotateNote() {
    const inRun = phase === 'pause' || phase === 'play';
    const left = world.actors.filter((a) => a.team === 'bot' && a.alive).length;
    $('rotnote').innerHTML = inRun
      ? `<span class="run">Run paused · ${esc(heroById(heroId).name)} · ${left} hostile${left === 1 ? '' : 's'} left</span><br>Nothing is lost. Turn back to landscape, then Resume.`
      : 'Room Zero plays in landscape.';
  }

  function render() {
    updateRotateNote();
    $('hud').classList.toggle('on', phase === 'play' || phase === 'pause' || phase === 'recap');
    switch (phase) {
      case 'title': return showTitle();
      case 'select': return showSelect();
      case 'loading': return showLoading();
      case 'play': overlay.className = 'layer hidden'; return;
      case 'pause': return showPause();
      case 'recap': return showRecap();
      case 'results': return showResults();
    }
  }

  function card(html: string, cls = 'layer') {
    overlay.className = cls;
    overlay.innerHTML = `<div class="card">${html}</div>`;
  }

  function closeHowto() {
    titleView = 'main';
    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* ignore */ }
  }

  function showTitle() {
    if (titleView === 'howto') return showHowto();
    if (titleView === 'demo') return showDemo();
    const o = records.overall;
    card(`<div class="kicker">Chog squad · basement level · lights out</div>
      <h1>CHOG <em>/</em> ROOM ZERO</h1>
      <p style="margin-top:14px">Five hostiles somewhere below. You see only what your lamp touches. Everyone hears everything.</p>
      <div class="btns"><button class="btn primary" data-go="start">Enter</button><button class="btn" data-act="howto">How to play</button><button class="btn" data-act="demo">Chog <span class="demo">DEMO</span></button></div>
      <div class="mock" id="idchip">${demoChip()}</div>
      <p class="pb" id="titlepb">Best clear ${fmtTime(o.bestWinSeconds)} · most kills ${o.mostKills} · ${o.runs} runs <span>· saved on this device only</span></p>`);
  }

  function showHowto() {
    card(`<div class="kicker">How to play</div><h2>Clear Room Zero</h2>
      <table class="howto">
      <tr><td>Move</td><td>${input.mode === 'touch' ? 'Left thumb' : 'WASD'}</td></tr>
      <tr><td>Aim / shoot</td><td>${input.mode === 'touch' ? 'Right thumb; push past the ring to fire' : 'Mouse; hold left click'}</td></tr>
      <tr><td>Creep (quiet)</td><td>${input.mode === 'touch' ? 'Half push on the left stick' : 'Hold Shift'}</td></tr>
      <tr><td>Ability</td><td>${input.mode === 'touch' ? 'Ability button' : 'Space'} · reload ${input.mode === 'touch' ? 'button' : 'R'}</td></tr>
      <tr><td>Gold rings</td><td>A noise you heard, not saw. Running is loud; enemies hear you too.</td></tr>
      <tr><td>Win</td><td>Down all five hostiles. Bots only shoot from inside your sight range.</td></tr></table>
      <div class="btns"><button class="btn primary" data-act="howto-close">Got it</button></div>`);
  }

  function showDemo() {
    const rows = SIDEGRADES.map((sg) => { const t = TRAIT_INFO[sg.id]; return `<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.effect)}</td><td>${esc(t.counterplay)}</td></tr>`; }).join('');
    const picks = sampleTokens().map((t) => `<button class="btn" data-demo="${t}">#${t} · ${esc(traitsFor(t).sidegrade.name)}</button>`).join('');
    card(`<div class="kicker"><span class="demo">DEMO</span> Chog traits</div><h2>Try a Chog</h2>
      <p class="democopy">${esc(DEMO_COPY)} Anyone can play; a Chog changes how you play, never how strong you are.</p>
      <table class="traits"><tr><th>Trait</th><th>Effect</th><th>Counterplay</th></tr>${rows}</table>
      <p style="font-size:13px">Token # maps to a trait (hash of the number, mod 4) and a cosmetic marking colour. Health, armour, damage and speed never change.</p>
      <div class="btns">${picks}<button class="btn" data-demo="">Play as guest</button></div>
      <div class="btns"><button class="btn primary" data-act="demo-close">Back</button></div>`);
  }

  function statBar(label: string, v: number) {
    return `<div class="stat">${label}<s style="--v:${Math.round(Math.max(0.08, Math.min(1, v)) * 100)}%"></s></div>`;
  }

  function showSelect() {
    const cards = HEROES.map((h, i) => {
      const w = WEAPONS[h.weapon];
      const dps = (w.damage * w.pellets) / w.fireInterval;
      return `<button class="hero${h.id === heroId ? ' sel' : ''}" data-hero="${h.id}" style="--accent:#${h.accent.toString(16).padStart(6, '0')}">
        <div class="role">${i + 1} · ${esc(h.role)}</div><b><i></i>${esc(h.name)}</b><p>${esc(h.blurb)}</p>
        ${statBar('Health', h.maxHp / 120)}${statBar('Armour', h.maxArmor / 50)}${statBar('Speed', (h.speed - 0.8) / 0.32)}${statBar('Sight', h.vision.range / 12)}${statBar('Punch', dps / 170)}
        <div class="wp">${esc(w.name)}</div>
        <div class="ab">${esc(h.ability.name)} <span>· ${esc(h.ability.text)}</span></div></button>`;
    }).join('');
    card(`<h2>Pick a Chog</h2><div class="mock" id="selchip">${demoChip()}</div><div class="heroes">${cards}</div>
      <div class="btns"><button class="btn" data-go="quit">Back</button><button class="btn primary" data-go="pick">Deploy</button></div>`);
  }

  function selectHero(id: string) {
    heroId = id;
    try {
      localStorage.setItem(HERO_KEY, heroId);
    } catch {
      /* ignore */
    }
    for (const el of overlay.querySelectorAll<HTMLElement>('.hero')) el.classList.toggle('sel', el.dataset.hero === id);
  }

  function showLoading() {
    card(`<div class="kicker">Deploying ${esc(heroById(heroId).name)}</div><h2>Room Zero</h2><div class="loadbar"><i></i></div>`);
    // Build the world (and bake the map if needed) after the loading card has painted.
    requestAnimationFrame(() => setTimeout(() => {
      beginWorld();
      setTimeout(() => go('loaded'), 350);
    }, 30));
  }

  function showPause() {
    card(`<h2>Paused</h2><p>The basement waits.</p>
      <div class="btns"><button class="btn primary" data-go="resume">Resume</button><button class="btn" data-go="restart">Restart</button><button class="btn" data-go="quit">Quit</button></div>
      <p style="font-size:13px">${input.mode === 'touch' ? '' : 'Esc or P to resume.'}</p>`);
  }

  function showRecap() {
    const k = world.playerKill!;
    const killer = world.actors[k.killerId];
    const p = player(world);
    const d = Math.hypot(k.fromX - p.x, k.fromY - p.y);
    card(`<h2 class="bad">Down</h2><p>${esc(killer.name)} (${esc(killer.hero.name)}, ${esc(k.weapon)}) from ${d.toFixed(0)} m ${compass(k.fromX - p.x, k.fromY - p.y)}.</p>`, 'layer clear');
  }

  function showResults() {
    const won = world.outcome === 'won';
    const p = player(world);
    // Per bullet, so a shotgun's 8 pellets per shot can never read above 100% (RC-3: Brick showed 59/16).
    const accPct = p.bullets ? Math.round((p.hits / p.bullets) * 100) : 0;
    const left = world.actors.filter((a) => a.team === 'bot' && a.alive).length;
    const k = world.playerKill;
    const why = !won && k ? `<p class="bad">${esc(world.actors[k.killerId].name)} got you with a ${esc(k.weapon.toLowerCase())}, ${Math.hypot(k.fromX - p.x, k.fromY - p.y).toFixed(0)} m ${compass(k.fromX - p.x, k.fromY - p.y)}.</p>` : '<p class="good">Every hostile is down.</p>';
    const hb = records.heroes[heroId] ?? { bestWinSeconds: null, mostKills: 0, runs: 0, wins: 0 };
    const nb = lastRun?.newBest;
    const hist = `<p class="pb" id="resultpb">${esc(heroById(heroId).name)} best clear ${fmtTime(hb.bestWinSeconds)}${nb?.time ? ' <b>NEW</b>' : ''} · most kills ${hb.mostKills}${nb?.kills ? ' <b>NEW</b>' : ''} · overall best ${fmtTime(records.overall.bestWinSeconds)} <span>· saved on this device only</span></p>`
      + (history ? `<p style="font-size:13px"><span class="demo">DEMO</span> Chog #${esc(history.tokenId)} on this device: ${history.runs} runs, ${history.wins} cleared, ${history.kills} kills. No ownership checked.</p>` : '');
    card(`<div class="kicker">${esc(heroById(heroId).name)} · ${esc(p.weapon.name)}</div><h2 class="${won ? 'good' : 'bad'}">${won ? 'Room cleared' : 'Run over'}</h2>${why}
      <table class="stats"><tr><td>Chog</td><td>${esc(heroById(heroId).name)}${identity.kind === 'bound' ? ` · <span class="demo">DEMO</span> #${esc(identity.tokenId!)}` : ''}</td></tr>
      <tr><td>Time</td><td>${fmtTime(Math.round(playTime))}</td></tr>
      <tr><td>Hostiles down</td><td>${p.kills} / ${world.actors.length - 1}${won ? '' : ` (${left} left)`}</td></tr>
      <tr><td>Hits / bullets</td><td>${p.hits} / ${p.bullets} · ${accPct}%</td></tr>
      <tr><td>Damage dealt / taken</td><td>${Math.round(p.damageDealt)} / ${Math.round(p.damageTaken)}</td></tr></table>${hist}
      <div class="btns"><button class="btn primary" data-go="restart">Again</button><button class="btn" data-go="quit">Change Chog</button></div>`);
  }

  overlay.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') input.mode = 'touch';
    if (!overlayInputAllowed(phase, summaryGate)) return;
    const t = e.target as HTMLElement;
    const act = t.closest('[data-act]') as HTMLElement | null;
    if (act) {
      e.preventDefault();
      const a = act.dataset.act;
      if (a === 'howto') titleView = 'howto';
      else if (a === 'howto-close') closeHowto();
      else if (a === 'demo') titleView = 'demo';
      else if (a === 'demo-close') titleView = 'main';
      render();
      return;
    }
    const demo = t.closest('[data-demo]') as HTMLElement | null;
    if (demo) {
      e.preventDefault();
      setDemo(demo.dataset.demo || null);
      titleView = 'main';
      render();
      return;
    }
    const hero = t.closest('[data-hero]') as HTMLElement | null;
    if (hero) {
      selectHero(hero.dataset.hero!);
      // A second tap on the selected card deploys.
      if (hero.dataset.armed) go('pick');
      for (const el of overlay.querySelectorAll<HTMLElement>('.hero')) delete el.dataset.armed;
      hero.dataset.armed = '1';
      return;
    }
    const b = t.closest('[data-go]') as HTMLElement | null;
    if (b) {
      e.preventDefault();
      e.stopPropagation(); // a menu press is consumed here and never reaches the game input
      go(b.dataset.go as MatchEvent);
    }
  });

  function beginWorld() {
    runIndex++;
    world = createWorld({ seed: TUNING.seed + runIndex, hero: heroId, sidegrade: identity.sidegrade });
    autopilot = AUTOPLAY_SEED !== null ? createAutopilot(AUTOPLAY_SEED + runIndex) : null;
    renderer.reset(world);
    fx.markers.length = fx.impacts.length = fx.hitMarks.length = fx.corpses.length = fx.damageArcs.length = fx.pings.length = 0;
    for (const s of fx.sparks) s.age = 1;
    fx.shake = 0;
    acc = 0;
    playTime = 0;
    history = null;
    const h = heroById(heroId);
    $('hero').innerHTML = `${esc(h.name)} · ${identity.kind === 'bound' ? `<span class="demo">DEMO</span> #${esc(identity.tokenId!)} ${esc(identity.sidegrade.name)}` : 'Guest'}`;
    $('wname').textContent = world.actors[0].weapon.name;
    $('abl').innerHTML = `${esc(h.ability.name)}<small class="keyhint">Space</small>`;
    $('pips').innerHTML = world.actors.slice(1).map(() => '<i></i>').join('');
    hint.innerHTML = input.mode === 'touch'
      ? 'Left thumb moves, half push creeps. Right thumb aims, push past the ring to fire.'
      : 'WASD move · Shift creep · Mouse aim · Click fire · R reload · Space ability · Esc pause';
    showHint(hint.innerHTML, runIndex === 1 ? 6 : 0);
  }

  function endRun(won: boolean) {
    const p = player(world);
    history = recordRun(localStorage, identity.tokenId, { won, seconds: Math.round(playTime), kills: p.kills, shots: p.shots, hits: p.hits, at: new Date().toISOString() });
    const r = recordBest(localStorage, { hero: heroId, won, seconds: Math.round(playTime), kills: p.kills });
    records = r.records;
    lastRun = { newBest: r.newBest };
  }

  render();
  // Leaving the tab pauses the match: the sim must never run while nobody is watching.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'play') go('pause');
  });
  // Rotating to portrait covers the game with the rotate prompt: pause, so the sim never runs unseen. (The ticker
  // also pauses if play ever starts behind it, e.g. Deploy pressed in portrait.) Any orientation flip releases held
  // sticks and keys: their screen coordinates belong to the old layout.
  let lastOrientation = orientationOf(window.innerWidth, window.innerHeight);
  const checkRotate = () => {
    const o = orientationOf(window.innerWidth, window.innerHeight);
    if (o !== lastOrientation) {
      lastOrientation = o;
      input.releaseAll();
    }
    if (phase === 'play' && rotatePromptShown(window.innerWidth, window.innerHeight)) go('pause');
    updateRotateNote();
  };
  window.addEventListener('resize', checkRotate);
  window.matchMedia?.(ROTATE_QUERY).addEventListener?.('change', checkRotate);
  // Losing window focus (alt-tab, notification shade, another window) pauses too.
  window.addEventListener('blur', () => {
    if (phase === 'play') go('pause');
  });
  // Fresh presses for the summary gate (auto-repeat does not count).
  window.addEventListener('pointerdown', () => summaryGate.press(performance.now()), { capture: true });
  window.addEventListener('keydown', (e) => {
    if (!e.repeat) summaryGate.press(performance.now());
  }, { capture: true });
  // Hero select: 1-4 pick the matching card (CHOG-UI-001). Enter deploys (existing handler).
  window.addEventListener('keydown', (e) => {
    if (phase !== 'select' || e.repeat) return; // keys 1-4 never act on the summary
    const id = heroForKey(e, HEROES);
    if (!id) return;
    selectHero(id);
  });

  function spark(x: number, y: number, n: number, hostile: boolean) {
    for (const s of fx.sparks) {
      if (n <= 0) break;
      if (s.age < 1) continue;
      const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 5;
      s.x = x; s.y = y; s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v; s.age = 0; s.hostile = hostile;
      n--;
    }
  }

  // Per-step presentation: sounds feed audio and heard markers, hits feed feedback.
  function afterStep() {
    const p = player(world);
    const view = p.view;
    for (const s of world.sounds) {
      const own = s.sourceId === 0;
      const dx = s.x - p.x, dy = s.y - p.y;
      if (s.type === 'sonar') fx.pings.push({ x: s.x, y: s.y, age: 0, hostile: !own });
      // The one reveal rule (docs/design/bots.md): a muzzle flash with wall line of sight shows the shooter
      // briefly, at any range. Bots get the same signal from the player's flash.
      if (s.type === 'shot' && !own && s.team === 'bot' && muzzleFlashSeen(world.level, p.x, p.y, s.x, s.y))
        fx.threats[s.sourceId] = TUNING.perception.flashSeconds;
      const heard = own || hears(world.level, p.x, p.y, s);
      if (!heard) continue;
      if (s.type === 'impact' && s.blocked) debugStats.blockedCues++;
      audio.play(s.type === 'impact' && s.blocked ? 'blocked' : s.type, dx, dy, s.radius, !own && !sightClear(world.level, p.x, p.y, s.x, s.y), own, s.weapon);
      if (s.type === 'impact') {
        fx.impacts.push({ x: s.x, y: s.y, age: 0, blocked: s.blocked });
        spark(s.x, s.y, s.blocked ? 7 : 3, false);
        // Blocked by half cover: the crate/slab outline flashes briefly so the cover reads as what stopped it.
        if (s.blocked) {
          const box = coverBoxAt(world.level.coverBoxes, s.x, s.y);
          if (box) fx.coverFlashes.push({ box, age: 0 });
        }
      }
      if (own && s.type === 'pickup') toast('Picked up');
      if (own || s.team !== 'bot') continue;
      const src = world.actors[s.sourceId];
      if (src.alive && canSee(world.level, p.x, p.y, p.facing, view, src.x, src.y)) continue;
      const err = Math.hypot(dx, dy) * 0.08;
      const m = clampMarker(world.level, s.x + (Math.random() * 2 - 1) * err, s.y + (Math.random() * 2 - 1) * err, src.x, src.y, walkable);
      ringHint();
      fx.markers.push({ x: m.x, y: m.y, age: 0, life: TUNING.sound.markerLife, big: s.type === 'shot' || s.type === 'death' || s.type === 'sonar' });
    }
    for (const h of world.hits) {
      if (h.by === 0) {
        fx.hitMarks.push({ x: h.x, y: h.y, age: 0, kill: h.killed });
        spark(h.x, h.y, h.killed ? 10 : 4, true);
        if (h.killed) toast(`${world.actors[h.target].name} down`);
      }
      if (h.target === 0) {
        fx.shake = TUNING.render.shakeSeconds;
        fx.damageArcs.push({ ang: Math.atan2(h.fromY - p.y, h.fromX - p.x), age: 0 });
        // Fairness rule: every hit comes from within your sight range with line of sight, so the shooter is
        // always shown (ringed) for the reveal window, even when it stands outside the lamp cone.
        fx.threats[h.by] = TUNING.perception.flashSeconds;
        audio.play('hurt', 0, 0, 1, false, true);
        ($('hurt') as HTMLElement).style.opacity = '1';
        setTimeout(() => (($('hurt') as HTMLElement).style.opacity = '0'), 90);
      }
      if (h.killed) fx.corpses.push({ x: world.actors[h.target].x, y: world.actors[h.target].y, hostile: h.target !== 0 });
    }
  }

  let fpsAcc = 0, fpsFrames = 0;
  // Test hook for the scripted browser run. Only in dev builds or with ?debug in the URL.
  const hook = { fps: 0 } as { fps: number } & Record<string, unknown>;
  if (import.meta.env.DEV || location.search.includes('debug')) {
    Object.defineProperties(hook, { world: { get: () => world }, phase: { get: () => phase } });
    Object.assign(hook, { renderer, go, setHero: (h: string) => (heroId = h), fx, records: () => records, identity: () => identity, resultsAt: () => resultsAt, autoplay: AUTOPLAY_SEED, hero: () => heroId, stats: debugStats,
      // Debug lab: the bundled sim, so headless checks can run sim sweeps against the exact deployed code.
      lab: { createWorld, stepWorld, IDLE_INPUT, ROOM_ZERO, HEROES } });
    (window as unknown as { __chog: unknown }).__chog = hook;
  }

  const ringFill = $('ringfill') as unknown as SVGCircleElement;
  const pipsEl = $('pips');
  let lastHud = '';

  renderer.app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 1) {
      hook.fps = fpsFrames / fpsAcc;
      fpsAcc = 0;
      fpsFrames = 0;
    }
    document.body.classList.toggle('touch', input.mode === 'touch');
    const action = input.takeAction();
    if (input.takePause()) {
      if (phase === 'play') go('pause');
      else if (phase === 'pause') go('resume');
    }

    if (phase === 'play' && rotatePromptShown(window.innerWidth, window.innerHeight)) go('pause');
    if (simRuns(phase)) {
      const p = player(world);
      const ps = renderer.toScreen(p.x, p.y);
      const r = fixedSteps(acc, resumeSkip ? 0 : dt, TUNING.simStepSeconds, TUNING.maxStepsPerFrame);
      resumeSkip = false;
      acc = r.remainder;
      // Only consume input on frames that step the sim, so a latched tap is never lost on a 0-step frame.
      const inp = r.steps > 0 ? input.read(ps.x, ps.y) : null;
      for (let i = 0; inp && i < r.steps && world.outcome === 'playing'; i++) {
        stepWorld(world, autopilot ? autopilot.next(world) : inp);
        inp.reload = false;
        inp.ability = false;
        // A tap fires exactly once: after the first step, firing follows the real button state.
        if (!input.fireHeld()) inp.firing = false;
        afterStep();
        playTime += TUNING.simStepSeconds;
      }
      if (world.outcome === 'dead') {
        recapLeft = TUNING.render.deathFreeze;
        endRun(false);
        go('died');
      } else if (world.outcome === 'won') {
        endRun(true);
        go('won');
      }
    } else if (phase === 'recap') {
      // The world keeps its death animation going; the sim is frozen for the player.
      for (const a of world.actors) if (!a.alive) a.deadFor += dt;
      recapLeft -= dt;
      if (recapLeft <= 0) go('recapDone');
    } else if (action) {
      if (phase === 'title' && titleView !== 'main') { if (titleView === 'howto') closeHowto(); else titleView = 'main'; render(); }
      else if (phase === 'title') go('start');
      else if (phase === 'select') go('pick');
      else if (phase === 'results') go('restart');
    }

    for (const m of fx.markers) m.age += dt;
    for (const m of fx.impacts) m.age += dt;
    for (const m of fx.hitMarks) m.age += dt;
    for (const m of fx.damageArcs) m.age += dt;
    for (const m of fx.pings) m.age += dt;
    for (let i = 0; i < fx.threats.length; i++) if (fx.threats[i] > 0) fx.threats[i] -= dt;
    for (const s of fx.sparks) {
      if (s.age >= 1) continue;
      s.age += dt * 3;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    fx.markers = fx.markers.filter((m) => m.age < m.life);
    fx.impacts = fx.impacts.filter((m) => m.age < 0.25);
    for (const c of fx.coverFlashes) c.age += dt;
    fx.coverFlashes = fx.coverFlashes.filter((c) => c.age < COVER_FLASH_SECONDS);
    fx.hitMarks = fx.hitMarks.filter((m) => m.age < 0.2);
    fx.damageArcs = fx.damageArcs.filter((m) => m.age < TUNING.render.damageArcSeconds);
    fx.pings = fx.pings.filter((m) => m.age < 0.7);
    fx.shake = Math.max(0, fx.shake - dt);
    toastLeft -= dt;
    if (hintLeft > 0 && phase === 'play') {
      hintLeft -= dt;
      if (hintLeft <= 0) hint.style.opacity = '0';
    }
    $('toast').style.opacity = toastLeft > 0 ? '1' : '0';

    renderer.draw(world, fx, input, dt, { recap: phase === 'recap' || (phase === 'results' && world.outcome === 'dead'), marking: identity.marking, showSticks: phase === 'play' && input.mode === 'touch', playing: phase === 'play', debug: DEBUG_OVERLAY, hud: hudRects() });

    // HUD: only touch the DOM when a value changed.
    const p = player(world);
    const left = world.actors.filter((a) => a.team === 'bot' && a.alive).length;
    const cdShare = p.abilityCd / p.hero.ability.cooldown;
    const reloadShare = p.reloadLeft > 0 ? 1 - p.reloadLeft / p.weapon.reloadSeconds : 0;
    const key = `${Math.ceil(p.hp)}|${Math.ceil(p.armor)}|${p.ammo}|${p.reserve}|${left}|${Math.round(cdShare * 60)}|${Math.round(reloadShare * 40)}`;
    if (key !== lastHud) {
      lastHud = key;
      $('hpn').textContent = String(Math.max(0, Math.ceil(p.hp)));
      const hpEl = $('hpfill');
      hpEl.style.width = `${(p.hp / p.maxHp) * 100}%`;
      hpEl.classList.toggle('low', p.hp / p.maxHp <= TUNING.render.lowHpShare);
      $('arn').textContent = String(Math.ceil(p.armor));
      $('arfill').style.width = `${(p.armor / p.maxArmor) * 100}%`;
      const ammo = $('ammo');
      ammo.innerHTML = p.reloadLeft > 0 ? `--<small> reloading</small>` : `${p.ammo}<small> / ${p.reserve}</small>`;
      ammo.classList.toggle('empty', p.ammo === 0 && p.reserve === 0);
      ringFill.style.strokeDashoffset = String(107 * (1 - (p.reloadLeft > 0 ? reloadShare : p.ammo / p.weapon.magazine)));
      $('foesn').textContent = String(left);
      pipsEl.querySelectorAll('i').forEach((el, i) => el.classList.toggle('down', !world.actors[i + 1].alive));
      const ab = $('ability');
      ab.style.setProperty('--cd', `${(1 - cdShare) * 360}deg`);
      ab.classList.toggle('ready', cdShare === 0);
    }
    const low = p.alive && p.hp / p.maxHp <= TUNING.render.lowHpShare;
    $('vignette').style.opacity = low ? String(0.45 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() / 180))) : '0';
  });
}

start().catch((err) => {
  console.error('Game failed to start', err);
  overlay.innerHTML = `<div class="card"><p>The game could not start: ${esc(String(err))}. Reload the page to try again.</p></div>`;
});
