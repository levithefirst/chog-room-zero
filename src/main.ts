import { createRenderer, createFx } from './render/render';
import { createInput } from './input/input';
import { createSummaryGate } from './input/gate';
import { createAudio } from './audio/audio';
import { fixedSteps } from './sim/sim';
import { createWorld, hears, player, stepWorld, type World } from './sim/world';
import { sightClear, walkable } from './sim/level';
import { clampMarker } from './render/visibility';
import { muzzleFlashSeen } from './sim/vision';
import { canSee } from './sim/vision';
import { nextPhase, simRuns, type MatchEvent, type Phase } from './sim/match';
import { TUNING } from './config/tuning';
import { HEROES, heroById } from './config/heroes';
import { heroForKey } from './ui/heroKeys';
import { WEAPONS } from './config/weapons';
import { adapterFromUrl, resolveIdentity, GUEST, type Identity } from './nft/identity';
import { recordRun, type TokenHistory } from './nft/history';

const $ = (id: string) => document.getElementById(id)!;
const root = $('app');
const overlay = $('overlay');
const hint = $('hint');
// ?debug shows the bot perception overlay; add &nooverlay to keep the debug hook without it.
const DEBUG_OVERLAY = location.search.includes('debug') && !location.search.includes('nooverlay');
const HERO_KEY = 'chog.hero';

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
  const { identity: id, note } = await resolveIdentity(adapterFromUrl(location.search)).catch(() => ({ identity: GUEST, note: 'Playing as guest.' }));
  const identity: Identity = id;

  let phase: Phase = 'title';
  let heroId = (() => {
    try {
      const h = localStorage.getItem(HERO_KEY);
      return h && HEROES.some((x) => x.id === h) ? h : HEROES[0].id;
    } catch {
      return HEROES[0].id;
    }
  })();
  let runIndex = 0;
  let world: World = createWorld({ seed: TUNING.seed, hero: heroId, sidegrade: identity.sidegrade });
  let acc = 0;
  let recapLeft = 0;
  let playTime = 0;
  let history: TokenHistory | null = null;
  let toastLeft = 0;
  const fx = createFx();
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
  function go(e: MatchEvent) {
    if (phase === 'results' && e === 'restart' && !summaryGate.canRestart()) return;
    const next = nextPhase(phase, e);
    if (next === phase) return;
    const from = phase;
    phase = next;
    if (next === 'results') {
      summaryGate.open(performance.now());
      input.takeAction();
    }
    // Resuming never replays the paused time: no catch-up burst of sim steps.
    if (from === 'pause' && next === 'play') {
      acc = 0;
      resumeSkip = true;
    }
    audio.play('ui', 0, 0, 1, false, true);
    render();
  }

  function render() {
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

  function showTitle() {
    card(`<div class="kicker">Basement level · lights out</div>
      <h1>CHOG <em>/</em> ROOM ZERO</h1>
      <p style="margin-top:14px">Five hostiles somewhere below. You see only what your lamp touches. Everyone hears everything.</p>
      <div class="btns"><button class="btn primary" data-go="start">Enter</button></div>
      <div class="mock">${esc(identity.kind === 'bound' ? `${identity.label} · ${identity.sidegrade.name} sidegrade${identity.source === 'mock' ? ' · mock NFT' : ''}` : 'Guest')}</div>
      <p style="font-size:13px">${esc(note)}</p>`);
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
    card(`<h2>Pick a Chog</h2><div class="heroes">${cards}</div>
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
    const accPct = p.shots ? Math.round((p.hits / p.shots) * 100) : 0;
    const left = world.actors.filter((a) => a.team === 'bot' && a.alive).length;
    const k = world.playerKill;
    const why = !won && k ? `<p class="bad">${esc(world.actors[k.killerId].name)} got you with a ${esc(k.weapon.toLowerCase())}, ${Math.hypot(k.fromX - p.x, k.fromY - p.y).toFixed(0)} m ${compass(k.fromX - p.x, k.fromY - p.y)}.</p>` : '<p class="good">Every hostile is down.</p>';
    const hist = history
      ? `<p style="font-size:14px">${esc(identity.label)} on this device: ${history.runs} runs, ${history.wins} cleared, ${history.kills} kills.</p>`
      : '<p style="font-size:14px">Guest run. Nothing was saved.</p>';
    card(`<div class="kicker">${esc(heroById(heroId).name)} · ${esc(p.weapon.name)}</div><h2 class="${won ? 'good' : 'bad'}">${won ? 'Room cleared' : 'Run over'}</h2>${why}
      <table class="stats"><tr><td>Time</td><td>${Math.round(playTime)} s</td></tr>
      <tr><td>Hostiles down</td><td>${p.kills} / ${world.actors.length - 1}${won ? '' : ` (${left} left)`}</td></tr>
      <tr><td>Hits / shots</td><td>${p.hits} / ${p.shots} · ${accPct}%</td></tr>
      <tr><td>Damage dealt</td><td>${Math.round(p.damageDealt)}</td></tr></table>${hist}
      <div class="btns"><button class="btn primary" data-go="restart">Again</button><button class="btn" data-go="quit">Change Chog</button></div>`);
  }

  overlay.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') input.mode = 'touch';
    const t = e.target as HTMLElement;
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
      go(b.dataset.go as MatchEvent);
    }
  });

  function beginWorld() {
    runIndex++;
    world = createWorld({ seed: TUNING.seed + runIndex, hero: heroId, sidegrade: identity.sidegrade });
    renderer.reset(world);
    fx.markers.length = fx.impacts.length = fx.hitMarks.length = fx.corpses.length = fx.damageArcs.length = fx.pings.length = 0;
    for (const s of fx.sparks) s.age = 1;
    fx.shake = 0;
    acc = 0;
    playTime = 0;
    history = null;
    const h = heroById(heroId);
    $('hero').textContent = `${h.name} · ${identity.kind === 'bound' ? `${identity.sidegrade.name}${identity.source === 'mock' ? ' (mock)' : ''}` : 'Guest'}`;
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
  }

  render();
  // Leaving the tab pauses the match: the sim must never run while nobody is watching.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'play') go('pause');
  });
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
    if (phase !== 'select' || e.repeat) return;
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
      audio.play(s.type, dx, dy, s.radius, !own && !sightClear(world.level, p.x, p.y, s.x, s.y), own, s.weapon);
      if (s.type === 'impact') {
        fx.impacts.push({ x: s.x, y: s.y, age: 0, blocked: s.blocked });
        spark(s.x, s.y, s.blocked ? 7 : 3, false);
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
    Object.assign(hook, { renderer, go, setHero: (h: string) => (heroId = h), fx });
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

    if (simRuns(phase)) {
      const p = player(world);
      const ps = renderer.toScreen(p.x, p.y);
      const r = fixedSteps(acc, resumeSkip ? 0 : dt, TUNING.simStepSeconds, TUNING.maxStepsPerFrame);
      resumeSkip = false;
      acc = r.remainder;
      // Only consume input on frames that step the sim, so a latched tap is never lost on a 0-step frame.
      const inp = r.steps > 0 ? input.read(ps.x, ps.y) : null;
      for (let i = 0; inp && i < r.steps && world.outcome === 'playing'; i++) {
        stepWorld(world, inp);
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
      if (phase === 'title') go('start');
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
