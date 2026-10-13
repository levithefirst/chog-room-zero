import { createRenderer, createFx, COVER_FLASH_SECONDS, COLLECT_SECONDS } from './render/render';
import { createInput, touchStick } from './input/input';
import { createSummaryGate, overlayInputAllowed } from './input/gate';
import { createAudio } from './audio/audio';
import { fixedSteps } from './sim/sim';
import { createWorld, hears, matchSeconds, player, stepWorld, touchingFull, wants, IDLE_INPUT, type Pickup, type PickupKind, type World } from './sim/world';
import { outsideCircle, zoneAt } from './sim/zone';
import { OnlineSession, serverUrl } from './net/client';
import { MODE_SIZE, type Mode } from './net/protocol';
import { ROOM_ZERO } from './config/map';
import { findPath, sightClear, walkable } from './sim/level';
import { clampMarker } from './render/visibility';
import { muzzleFlashSeen } from './sim/vision';
import { canSee } from './sim/vision';
import { nextPhase, simRuns, type MatchEvent, type Phase } from './sim/match';
import { TUNING } from './config/tuning';
import { HEROES, heroById } from './config/heroes';
import { heroForKey } from './ui/heroKeys';
import { orientationOf, ORIENTATION_QUERY } from './ui/orientation';
import { fullscreenSupported, isFullscreen, layoutStage, rectToStage, requestLandscape, stage, type LaunchResult } from './ui/stage';
import { coverBoxAt } from './sim/cover';
import { adapterFromUrl, resolveIdentity, GUEST, type Identity } from './nft/identity';
import { recordRun, type TokenHistory } from './nft/history';
import { boundIdentity } from './nft/identity';
import { DEMO_COPY, TRAIT_INFO, isTokenId, sampleTokens, traitsFor } from './nft/traits';
import { RECORDS_KEY, loadRecords, recordBest, type Records } from './ui/records';
import { PROFILE_KEY, QUALITY_DPR, STICK_PX, displayName, linkIdentity, loadProfile, loadSettings, saveProfile, saveSettings, togglePin, validateNickname, type Profile, type Settings } from './ui/profile';
import { MEDALS_KEY, awardMedals, loadMedals, type MedalDef, type Unlocked } from './ui/medals';
import { TIPS_KEY, loadShownTips, nextTip, saveShownTips, tipText, type TipId } from './ui/tips';
import { esc, howtoHtml, nickHtml, onlineHtml, onlineResultsHtml, profileHtml, resultsHtml, selectHtml, settingsHtml, titleHtml, type AuthView, type ProfileTab, type ScreenCtx } from './ui/screens';
import { discoverWallets, fetchAuthConfig, fetchSession, googleSignIn, signOut, walletSignIn, type ServerIdentity } from './ui/auth';
import { SIDEGRADES } from './sim/operators';
import { createAutopilot, type Autopilot } from './debug/autopilot';
import { createOnlineDriver } from './debug/onlineDriver';

const $ = (id: string) => document.getElementById(id)!;
const root = $('app');
const stageEl = $('stage');
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

const SPEAKER_ON = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9c1.5 1.5 1.5 4.5 0 6M18.5 6.5c3 3 3 8 0 11"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>';

// The build's commit (Vercel sets VERCEL_GIT_COMMIT_SHA at build time; vite.config.ts injects it), shown in Settings.
declare const __BUILD_SHA__: string;

// Boot screen (RC-7): the real start-up steps, in order, so a slow phone shows progress instead of black. There is
// no server to connect to: every step is local work. A failure shows the reason and a Retry button.
const BOOT_STEPS = ['Loading fonts', 'Starting the renderer', 'Checking your Chog', 'Building the basement'];
function boot(i: number) {
  const fill = document.getElementById('bootfill'), step = document.getElementById('bootstep');
  if (fill) fill.style.width = `${Math.round((i / BOOT_STEPS.length) * 100)}%`;
  if (step) step.textContent = `${i + 1}/${BOOT_STEPS.length} ${BOOT_STEPS[i] ?? ''}`;
}
function bootDone() {
  const b = document.getElementById('boot');
  if (!b) return;
  boot(BOOT_STEPS.length - 1);
  (document.getElementById('bootfill') as HTMLElement).style.width = '100%';
  b.classList.add('done');
  setTimeout(() => b.remove(), 400);
}

async function start() {
  // Lay the stage out first, so the boot screen and the first frame are already landscape on a phone held upright.
  layoutStage(stageEl);
  boot(0);
  await Promise.all([document.fonts.load('600 20px "Plex Mono"'), document.fonts.load('600 20px "Barlow Cond"')]).catch(() => undefined);
  boot(1);
  const renderer = await createRenderer(root);
  const input = createInput(root);
  const audio = createAudio();
  boot(2);
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
  type TitleView = 'main' | 'howto' | 'demo' | 'profile' | 'settings' | 'nick' | 'online';
  let titleView: TitleView = (() => { try { return localStorage.getItem(ONBOARD_KEY) === '1' ? 'main' : 'howto'; } catch { return 'main'; } })();
  let records: Records = loadRecords(localStorage);
  let lastRun: { newBest: { time: boolean; kills: boolean }; earned: MedalDef[] } | null = null;
  // RC-7: guest profile, settings, medals and tips, all on this device.
  let profile: Profile = loadProfile(localStorage);
  let settings: Settings = loadSettings(localStorage);
  let medals: Unlocked = loadMedals(localStorage);
  let shownTips = loadShownTips(localStorage);
  let profileTab: ProfileTab = 'player';
  let confirmReset = false;
  let nickError = '';
  let nickSaved = false;
  let nickReturn: TitleView = 'profile';
  const auth: AuthView = { config: null, session: [], wallets: [], busy: false, message: '' };
  const canVibrate = typeof navigator.vibrate === 'function';
  // Per-run counters for the results screen and medals (the sim does not track these).
  let runPickups = 0, runAbilities = 0;
  // RC-8 online play: the server address (?server=... or the build's VITE_GAME_SERVER_URL; null = not deployed),
  // the session, and whether the current world is an online match (then it is the server's view, not a local sim).
  const NET_URL = serverUrl(location.search, import.meta.env.VITE_GAME_SERVER_URL as string | undefined);
  let net: OnlineSession | null = null;
  let online = false;
  let onlineMode: Mode = '1v1';
  let netKey = '';
  let lastPing = 0;
  // Hosted online tests (debug only): ?debug&online=1v1|3v3|5v5&code=XXXX&drive=1 joins that queue at boot and lets a
  // scripted player (src/debug/onlineDriver.ts) send the controls. A browser service that cannot click can then play.
  const ONLINE_AUTO = QS.has('debug') ? (QS.get('online') as Mode | null) : null;
  const ONLINE_CODE = QS.has('debug') ? (QS.get('code') ?? '') : '';
  const onlineDriver = QS.has('debug') && QS.get('drive') === '1' ? createOnlineDriver() : null;

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
  let suggestPilot: Autopilot | null = null;
  let world: World = createWorld({ seed: TUNING.seed, hero: heroId, sidegrade: identity.sidegrade, zone: true });
  let acc = 0;
  let recapLeft = 0;
  let playTime = 0;
  let history: TokenHistory | null = null;
  let toastLeft = 0;
  const fx = createFx();
  const debugStats = { blockedCues: 0 };
  boot(3);
  renderer.reset(world);

  // Settings that reach into running systems: volume, render sharpness, touch stick travel.
  function applySettings() {
    audio.volume = settings.volume;
    touchStick.radius = STICK_PX[settings.stick];
    const res = Math.min(window.devicePixelRatio || 1, QUALITY_DPR[settings.quality]);
    if (renderer.app.renderer.resolution !== res) renderer.app.renderer.resolution = res;
  }
  applySettings();
  function setSettings(next: Settings) {
    settings = next;
    saveSettings(localStorage, settings);
    applySettings();
  }

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
    if (phase === 'title' && titleView === 'settings') render();
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

  // Fullscreen + landscape lock (src/ui/stage.ts). Tried by itself once, on the first tap of a touch device (the
  // earliest moment a browser allows it: touchend/click carry the user gesture, touchstart does not). Afterwards only
  // the Full screen buttons (HUD, title, pause) ask again, so a player who leaves fullscreen is never fought.
  const canFs = fullscreenSupported();
  let launch: LaunchResult = 'not-tried';
  // One request at a time: a returning player's first tap can be the Full screen button itself, which the auto
  // launch below also sees.
  let asking = false;
  const goLandscape = () => {
    if (asking) return;
    asking = true;
    void requestLandscape().then((r) => { launch = r; asking = false; paintFs(); });
  };
  const paintFs = () => document.body.classList.toggle('canfs', canFs && !isFullscreen());
  paintFs();
  let launchTried = false;
  const autoLaunch = (e: Event) => {
    if (launchTried || !canFs || !matchMedia('(pointer: coarse)').matches) return;
    if (e instanceof PointerEvent && e.pointerType === 'mouse') return;
    launchTried = true; // the click that follows this pointerup does not ask twice
    // A Full screen button makes its own request on click; asking here too would request twice.
    if ((e.target as Element | null)?.closest?.('[data-fs], #fs')) return;
    goLandscape();
  };
  document.addEventListener('pointerup', autoLaunch, { capture: true });
  document.addEventListener('click', autoLaunch, { capture: true });
  $('fs').onpointerdown = (e) => e.stopPropagation();
  $('fs').onclick = goLandscape;

  // Small top hint pill: shown for `seconds`, then fades. Never covers the play centre.
  let hintLeft = 0;
  function showHint(html: string, seconds: number) {
    hint.innerHTML = html;
    hintLeft = seconds;
    sinceHint = 0;
    hint.style.opacity = seconds > 0 ? '1' : '0';
  }
  // First-match explanation of sound rings, shown once ever (persisted).
  const RING_HINT_KEY = 'chog.hint.rings';
  let ringHintDone = (() => { try { return localStorage.getItem(RING_HINT_KEY) === '1'; } catch { return true; } })();
  function ringHint() {
    if (ringHintDone) return;
    ringHintDone = true;
    try { localStorage.setItem(RING_HINT_KEY, '1'); } catch { /* ignore */ }
    showHint('Pale rings: a noise you <b>heard</b>, not saw. Enemies hear you too: running is loud, creeping is quiet.', 6);
  }

  // HUD panel rects for label avoidance (CHOG-HUD-002). Measured from the DOM, so safe-area insets count, and turned
  // into stage coordinates (the stage may be rotated); cached and refreshed on resize/orientation change and every 30
  // frames (cheap) so layout changes are picked up.
  const HUD_IDS = ['vitals', 'foes', 'sys', 'weapon', 'ability', 'reload'];
  let hudCache: { x: number; y: number; w: number; h: number }[] = [];
  let hudAge = 1e9;
  function hudRects() {
    if (++hudAge < 30) return hudCache;
    hudAge = 0;
    hudCache = [];
    for (const id of HUD_IDS) {
      const el = document.getElementById(id);
      if (!el || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height) hudCache.push(rectToStage(stage(), r));
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

  function render() {
    $('hud').classList.toggle('on', phase === 'play' || phase === 'pause' || phase === 'recap');
    switch (phase) {
      case 'title': return showTitle();
      case 'select': return show(selectHtml(ctx()));
      case 'loading': return showLoading();
      case 'play': overlay.className = 'layer hidden'; return;
      case 'pause': return showPause();
      case 'recap': return showRecap();
      case 'results': return online ? showOnlineResults() : show(resultsHtml(ctx(), report()));
    }
  }

  function card(html: string, cls = 'layer') {
    overlay.className = cls;
    overlay.innerHTML = `<div class="card">${html}</div>`;
  }
  // Full-overlay screens (menu, select, profile, settings) bring their own layout.
  function show(html: string) {
    overlay.className = 'layer';
    overlay.innerHTML = html;
  }

  // Everything a screen may show, read fresh each render.
  function ctx(): ScreenCtx {
    return {
      touch: input.mode === 'touch', profile, settings, records, medals, heroId, demoChip: demoChip(), marking: identity.marking,
      muted: audio.muted, canFs: canFs && !isFullscreen(), canVibrate, build: __BUILD_SHA__, auth,
    };
  }

  function closeHowto() {
    titleView = 'main';
    try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* ignore */ }
  }

  function showTitle() {
    const c = ctx();
    switch (titleView) {
      case 'howto': return show(howtoHtml(c));
      case 'demo': return showDemo();
      case 'profile': return show(profileHtml(c, profileTab));
      case 'settings': return show(settingsHtml(c, confirmReset));
      case 'online': return show(onlineHtml(c, { url: NET_URL, state: net?.state ?? 'offline', message: net?.message ?? '', queue: net?.queue ?? null, rtt: net?.rtt ?? 0 }));
      case 'nick': {
        show(nickHtml(c, nickError, nickSaved));
        const inp = document.getElementById('nickin') as HTMLInputElement | null;
        if (inp && !c.touch) { inp.focus(); inp.select(); }
        return;
      }
      default: return show(titleHtml(c));
    }
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
      if (online) beginOnlineWorld(); else beginWorld();
      setTimeout(() => go('loaded'), 350);
    }, 30));
  }

  // Only on touch devices whose browser can go fullscreen and is not fullscreen now. Acts on click (user gesture).
  function fsButton() {
    return input.mode === 'touch' && canFs && !isFullscreen() ? '<button class="btn" data-fs>Full screen</button>' : '';
  }

  function showPause() {
    if (online) {
      card(`<h2>Paused</h2><p>Online: the match keeps going and your operator stands still.</p>
      <div class="btns"><button class="btn primary" data-go="resume">Resume</button><button class="btn" data-go="quit">Leave match</button>${fsButton()}</div>`);
      return;
    }
    card(`<h2>Paused</h2><p>The basement waits.</p>
      <div class="btns"><button class="btn primary" data-go="resume">Resume</button><button class="btn" data-go="restart">Restart</button><button class="btn" data-go="quit">Quit</button>${fsButton()}</div>
      <p style="font-size:13px">${input.mode === 'touch' ? '' : 'Esc or P to resume.'}</p>`);
  }

  function showRecap() {
    const k = world.playerKill!;
    if (k.cause === 'zone') { card('<h2 class="bad">Down</h2><p>The danger zone got you. Stay inside the circle when it closes.</p>', 'layer clear'); return; }
    const killer = world.actors[k.killerId];
    const p = player(world);
    const d = Math.hypot(k.fromX - p.x, k.fromY - p.y);
    card(`<h2 class="bad">Down</h2><p>${esc(killer.name)} (${esc(killer.hero.name)}, ${esc(k.weapon)}) from ${d.toFixed(0)} m ${compass(k.fromX - p.x, k.fromY - p.y)}.</p>`, 'layer clear');
  }

  // The after-action report: only numbers the game tracked this run.
  function report() {
    const won = world.outcome === 'won';
    const p = player(world);
    const k = world.playerKill;
    return {
      won, hero: heroById(heroId), weaponName: p.weapon.name,
      why: !won && k?.cause === 'zone' ? '<p class="bad">The danger zone got you. The circle was closing.</p>' : !won && k ? `<p class="bad">${esc(world.actors[k.killerId].name)} got you with a ${esc(k.weapon.toLowerCase())}, ${Math.hypot(k.fromX - p.x, k.fromY - p.y).toFixed(0)} m ${compass(k.fromX - p.x, k.fromY - p.y)}.</p>` : '<p class="good">Every hostile is down.</p>',
      time: playTime, kills: p.kills, bots: world.actors.length - 1, left: world.actors.filter((a) => a.team === 'bot' && a.alive).length,
      // Per bullet, so a shotgun's 8 pellets per shot can never read above 100% (RC-3: Brick showed 59/16).
      hits: p.hits, bullets: p.bullets, dealt: p.damageDealt, taken: p.damageTaken, pickups: runPickups, abilities: runAbilities,
      newBest: lastRun?.newBest ?? null, earned: lastRun?.earned ?? [],
      demoRow: identity.kind === 'bound' ? ` · <span class="demo">DEMO</span> #${esc(identity.tokenId!)}` : '',
      history: history ? `<p style="font-size:13px"><span class="demo">DEMO</span> Chog #${esc(history.tokenId)} on this device: ${history.runs} runs, ${history.wins} cleared, ${history.kills} kills. No ownership checked.</p>` : '',
    };
  }

  // ---- Menu actions ----
  function setProfile(next: Profile) {
    profile = next;
    saveProfile(localStorage, profile);
  }

  function saveNick() {
    const inp = document.getElementById('nickin') as HTMLInputElement | null;
    const v = validateNickname(inp?.value ?? '');
    if (!v.ok) { nickError = v.error; nickSaved = false; render(); return; }
    setProfile({ ...profile, nickname: v.value });
    nickError = '';
    nickSaved = true;
    render();
    setTimeout(() => { if (titleView === 'nick' && nickSaved) { nickSaved = false; titleView = nickReturn; render(); } }, 700);
  }

  function resetProgress() {
    try {
      for (const k of [RECORDS_KEY, MEDALS_KEY, PROFILE_KEY, TIPS_KEY, DEMO_KEY, RING_HINT_KEY]) localStorage.removeItem(k);
      for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith('chog-room-zero:history:')) localStorage.removeItem(k); }
    } catch { /* storage blocked */ }
    records = loadRecords(localStorage);
    medals = loadMedals(localStorage);
    profile = loadProfile(localStorage);
    shownTips = loadShownTips(localStorage);
    ringHintDone = false;
    setDemo(null);
    confirmReset = false;
  }

  function menuAct(a: string) {
    switch (a) {
      case 'howto': titleView = 'howto'; break;
      case 'howto-close': closeHowto(); break;
      case 'online': titleView = 'online'; if (NET_URL && !net) net = new OnlineSession(NET_URL, () => displayName(profile), () => heroId, sessionStorage); if (net && net.state === 'offline') net.connect(); break;
      case 'online-cancel': net?.leave(); break;
      case 'online-again': online = false; go('menu'); titleView = 'online'; joinOnline(onlineMode); break;
      case 'demo': titleView = 'demo'; break;
      case 'demo-close': titleView = 'main'; break;
      case 'profile': titleView = 'profile'; profileTab = 'player'; break;
      case 'medals': titleView = 'profile'; profileTab = 'medals'; break;
      case 'settings': titleView = 'settings'; confirmReset = false; refreshAuth(); break;
      case 'nick': nickReturn = titleView === 'nick' ? nickReturn : titleView; titleView = 'nick'; nickError = ''; nickSaved = false; break;
      case 'back': if (titleView === 'online') net?.leave(); titleView = titleView === 'nick' ? nickReturn : 'main'; confirmReset = false; break;
      case 'replay':
        shownTips = new Set();
        saveShownTips(localStorage, shownTips);
        ringHintDone = false;
        try { localStorage.removeItem(RING_HINT_KEY); } catch { /* ignore */ }
        if (!settings.tips) setSettings({ ...settings, tips: true });
        titleView = 'howto';
        break;
      case 'reset': confirmReset = true; break;
      case 'reset-no': confirmReset = false; break;
      case 'reset-yes': resetProgress(); break;
      case 'signin-google': googleSignIn(); return;
      case 'signout':
        void signOut().then(() => { auth.session = []; auth.message = 'Signed out on this browser. Your player card keeps its linked names.'; render(); });
        return;
    }
    render();
  }

  function settingAct(name: string, val: string) {
    const s = { ...settings };
    if (name === 'volume') s.volume = Math.round(Math.max(0, Math.min(1, s.volume + (val === 'up' ? 0.1 : -0.1))) * 10) / 10;
    else if (name === 'sound') { audio.muted = val === 'off'; paintMute(); }
    else if (name === 'vibration') s.vibration = val === 'on';
    else if (name === 'tips') s.tips = val === 'on';
    else if (name === 'quality' && (val === 'low' || val === 'medium' || val === 'high')) s.quality = val;
    else if (name === 'stick' && (val === 'small' || val === 'medium' || val === 'large')) s.stick = val;
    setSettings(s);
    if (name === 'vibration' && s.vibration && canVibrate) navigator.vibrate(30);
    render();
  }

  overlay.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') input.mode = 'touch';
    if (!overlayInputAllowed(phase, summaryGate)) return;
    const t = e.target as HTMLElement;
    if ((t as HTMLButtonElement).disabled) return;
    const act = t.closest('[data-act]') as HTMLElement | null;
    if (act) {
      // Apply is a submit button: the form's submit event saves (Enter in the field does too).
      if (act.dataset.act === 'nick-save') return;
      e.preventDefault();
      menuAct(act.dataset.act!);
      return;
    }
    const tab = t.closest('[data-tab]') as HTMLElement | null;
    if (tab) { e.preventDefault(); profileTab = tab.dataset.tab as ProfileTab; render(); return; }
    const fav = t.closest('[data-fav]') as HTMLElement | null;
    if (fav) {
      e.preventDefault();
      setProfile({ ...profile, favourite: profile.favourite === fav.dataset.fav ? null : fav.dataset.fav! });
      render();
      return;
    }
    const pin = t.closest('[data-pin]') as HTMLElement | null;
    if (pin) { e.preventDefault(); setProfile(togglePin(profile, pin.dataset.pin!)); render(); return; }
    const set = t.closest('[data-set]') as HTMLElement | null;
    if (set) { e.preventDefault(); settingAct(set.dataset.set!, set.dataset.val!); return; }
    const wal = t.closest('[data-wallet]') as HTMLElement | null;
    if (wal) { e.preventDefault(); void doWalletSignIn(wal.dataset.wallet!); return; }
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
    const om = t.closest('[data-online]') as HTMLElement | null;
    if (om) { e.preventDefault(); joinOnline(om.dataset.online as Mode); return; }
    const b = t.closest('[data-go]') as HTMLElement | null;
    if (b) {
      if (b.dataset.go === 'menu' || b.dataset.go === 'quit') { if (online) net?.leave(); online = false; }
      e.preventDefault();
      e.stopPropagation(); // a menu press is consumed here and never reaches the game input
      go(b.dataset.go as MatchEvent);
    }
  });

  overlay.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-fs]')) goLandscape();
  });
  overlay.addEventListener('submit', (e) => {
    e.preventDefault();
    if ((e.target as HTMLElement).matches('[data-form="nick"]')) saveNick();
  });

  // ---- Sign-in (optional; the game never waits on it) ----
  function linkAll(ids: ServerIdentity[]) {
    let p = profile;
    for (const id of ids) p = linkIdentity(p, id);
    if (p !== profile) setProfile(p);
  }
  async function refreshAuth() {
    const [config, session, wallets] = await Promise.all([fetchAuthConfig(), fetchSession(), discoverWallets()]);
    auth.config = config;
    auth.session = config ? session : [];
    auth.wallets = wallets;
    linkAll(auth.session);
    if (phase === 'title' && titleView === 'settings') render();
  }
  async function doWalletSignIn(id: string) {
    auth.busy = true;
    auth.message = 'Check your wallet: sign the message to prove this address. It is free and sends nothing.';
    render();
    try {
      const identity = await walletSignIn(id);
      linkAll([identity]);
      auth.session = await fetchSession();
      auth.message = `Signed in as ${identity.label}.`;
    } catch (err) {
      auth.message = err instanceof Error ? err.message : 'Wallet sign-in failed.';
    }
    auth.busy = false;
    if (phase === 'title' && titleView === 'settings') render();
  }
  // Back from Google (?signedin=google or ?signin_error=...): link the identity, open Settings, clean the URL.
  if (QS.has('signedin') || QS.has('signin_error')) {
    titleView = 'settings';
    auth.message = QS.has('signin_error') ? `Google sign-in did not finish (${QS.get('signin_error')}).` : 'Signed in with Google.';
    history_replace();
    void refreshAuth();
  }
  function history_replace() {
    const u = new URL(location.href);
    u.searchParams.delete('signedin');
    u.searchParams.delete('signin_error');
    window.history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
  }

  function beginWorld() {
    runIndex++;
    world = createWorld({ seed: TUNING.seed + runIndex, hero: heroId, sidegrade: identity.sidegrade, zone: true });
    autopilot = AUTOPLAY_SEED !== null ? createAutopilot(AUTOPLAY_SEED + runIndex) : null;
    suggestPilot = null;
    renderer.reset(world);
    fx.markers.length = fx.impacts.length = fx.hitMarks.length = fx.corpses.length = fx.damageArcs.length = fx.pings.length = fx.collects.length = 0;
    for (const s of fx.sparks) s.age = 1;
    fx.shake = 0;
    acc = 0;
    playTime = 0;
    history = null;
    runPickups = runAbilities = 0;
    hurtNow = blockedNow = false;
    sinceHint = 0;
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

  // ---- Online (RC-8) ----
  function joinOnline(mode: Mode) {
    if (!NET_URL) return;
    onlineMode = mode;
    net ??= new OnlineSession(NET_URL, () => displayName(profile), () => heroId, sessionStorage);
    const code = ((document.getElementById('roomcode') as HTMLInputElement | null)?.value ?? ONLINE_CODE).toUpperCase().replace(/[^A-Z0-9]/g, '');
    net.joinQueue(mode, code.length >= 4 ? code.slice(0, 8) : undefined);
    render();
  }

  // The online match's world is the session's view world (you are actor 0); the server moves everything in it.
  function beginOnlineWorld() {
    world = net!.world!;
    renderer.reset(world);
    fx.markers.length = fx.impacts.length = fx.hitMarks.length = fx.corpses.length = fx.damageArcs.length = fx.pings.length = fx.collects.length = 0;
    for (const sp of fx.sparks) sp.age = 1;
    fx.shake = 0;
    fx.threats.length = 0;
    playTime = 0;
    hurtNow = blockedNow = false;
    const me = world.actors[0];
    $('hero').innerHTML = `${esc(me.hero.name)} · <b>Online ${esc(onlineMode)}</b>`;
    $('wname').textContent = me.weapon.name;
    $('abl').innerHTML = `${esc(me.hero.ability.name)}<small class="keyhint">Space</small>`;
    $('pips').innerHTML = world.actors.filter((a) => a.team !== me.team).map(() => '<i></i>').join('');
    lastHud = '';
    showHint(`Online ${esc(onlineMode)}: ${MODE_SIZE[onlineMode] / 2} a side, real players. Your side is ringed green.`, 5);
  }

  function showOnlineResults() {
    const o = net?.over;
    if (!o) { show('<div class="card"><h2>Match over</h2><div class="btns"><button class="btn" data-go="menu">Menu</button></div></div>'); return; }
    const rows = o.results.map((x) => ({ name: x.name, hero: x.hero, team: x.team, kills: x.kills, damageDealt: x.damageDealt, damageTaken: x.damageTaken, alive: x.alive, cause: x.cause, you: x.id === o.you }));
    show(onlineResultsHtml({ mode: o.mode, won: o.winner === null ? null : o.winner === o.team, reason: o.reason, team: o.team, rows }));
  }

  // Watches the session from the frame loop: refreshes the Online screen, enters a found match, ends a finished one.
  function pollOnline() {
    if (!net) return;
    const now = performance.now();
    // Keep-alive pings run on the session's own timer (client.ts). Debug: the connection log on <body data-netlog>.
    if (QS.has('debug')) {
      const nl = `${phase} fps${Math.round(hook.fps)} | ${net.log.slice(-14).join(' | ')}`;
      if (document.body.dataset.netlog !== nl && now - lastPing > 500) { lastPing = now; document.body.dataset.netlog = nl; }
    }
    const key = `${net.state}|${net.queue?.have}|${net.message}|${Math.round(net.rtt / 20)}`;
    if (key !== netKey) {
      netKey = key;
      if (phase === 'title' && titleView === 'online') render();
    }
    if (net.state === 'match' && !online && net.world && phase === 'title') {
      online = true;
      go('start');
      go('pick');
    }
    if (online && net.over && (phase === 'play' || phase === 'pause')) {
      if (phase === 'pause') go('resume');
      go('won');
    }
  }

  // Match end: the one place a run is saved (records, medals, demo token history). Never per frame.
  function endRun(won: boolean) {
    const p = player(world);
    const seconds = Math.round(playTime);
    history = recordRun(localStorage, identity.tokenId, { won, seconds, kills: p.kills, shots: p.shots, hits: p.hits, at: new Date().toISOString() });
    const facts = { hero: heroId, won, seconds, kills: p.kills, bullets: p.bullets, hits: p.hits, damageDealt: p.damageDealt, damageTaken: p.damageTaken, pickups: runPickups, abilities: runAbilities };
    const r = recordBest(localStorage, facts);
    records = r.records;
    const m = awardMedals(localStorage, records, { ...facts, hpLeft: Math.max(0, p.hp) });
    medals = m.unlocked;
    lastRun = { newBest: r.newBest, earned: m.earned };
  }

  applySettings();
  render();
  bootDone();
  // Reload or crash mid online match: this tab still holds its session token, so it quietly asks the server to
  // resume. If the match is still on, the server hands the operator back (pollOnline enters it); if not, nothing shows.
  if (NET_URL && ONLINE_AUTO && MODE_SIZE[ONLINE_AUTO]) { titleView = 'online'; joinOnline(ONLINE_AUTO); }
  else try {
    if (NET_URL && sessionStorage.getItem('chog-room-zero:net-token')) {
      net = new OnlineSession(NET_URL, () => displayName(profile), () => heroId, sessionStorage);
      net.connect();
    }
  } catch { /* storage blocked: no resume */ }
  // The auth server is asked only when Settings opens or Google sends the player back: no request on a normal launch.
  // Leaving the tab pauses the match: the sim must never run while nobody is watching.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'play') go('pause');
  });
  // Every resize re-lays the stage out first (a phone turning upright turns the stage, src/ui/stage.ts), then the
  // canvas follows at once. An orientation flip of the browser mid-run moves every thumb position on the glass, so the
  // run pauses (same run, nothing lost; Resume continues) and every held stick/key is released: their coordinates
  // belong to the old layout. Plain resizes (address bar, window drag) just re-lay out.
  let lastOrientation = orientationOf(window.innerWidth, window.innerHeight);
  const onResize = () => {
    layoutStage(stageEl);
    renderer.app.resize();
    hudAge = 1e9;
    const o = orientationOf(window.innerWidth, window.innerHeight);
    if (o === lastOrientation) return;
    lastOrientation = o;
    input.releaseAll();
    if (phase === 'play') go('pause');
  };
  window.addEventListener('resize', onResize);
  window.matchMedia?.(ORIENTATION_QUERY).addEventListener?.('change', onResize);
  // Entering or leaving fullscreen resizes everything under the thumbs: release all held input. Leaving it mid-run
  // (back gesture, Esc, the system bar) pauses, and the pause card offers Full screen to go back.
  const onFullscreen = () => {
    input.releaseAll();
    hudAge = 1e9;
    paintFs();
    if (!isFullscreen() && phase === 'play') go('pause');
    else if (phase === 'pause' || phase === 'title') render();
  };
  document.addEventListener('fullscreenchange', onFullscreen);
  document.addEventListener('webkitfullscreenchange', onFullscreen);
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

  // A pickup the player just took: what it gave, in its colour, at the player (pages 6-9 of the reference: a named
  // pickup with a ring), instead of a generic "Picked up".
  const PICKUP_LABEL: Record<PickupKind, string> = { health: 'HEALTH', armor: 'ARMOUR', ammo: 'AMMO' };
  function collected(x: number, y: number) {
    const pk = world.pickups.find((q) => q.x === x && q.y === y);
    const p = player(world);
    runPickups++;
    if (!pk) { toast('Picked up'); return; }
    const P = TUNING.pickups;
    const amount = pk.kind === 'health' ? `+${P.health.amount} ` : pk.kind === 'armor' ? `+${P.armor.amount} ` : `+${P.ammo.mags * p.weapon.magazine} `;
    toast(`${amount}${PICKUP_LABEL[pk.kind]}`);
    const pal = TUNING.palette;
    fx.collects.push({ x: p.x, y: p.y, age: 0, color: pk.kind === 'health' ? pal.heal : pk.kind === 'armor' ? pal.armor : pal.ammo });
  }

  // Standing on a pickup you cannot use (full): say so once per contact, so it never reads as "needs another step".
  let fullOn: Pickup | null = null;
  function checkFull() {
    const q = touchingFull(world, player(world));
    if (q && q !== fullOn) toast(`${PICKUP_LABEL[q.kind]} FULL`);
    fullOn = q;
  }

  // Contextual tips (src/ui/tips.ts): what is true this frame.
  let hurtNow = false, blockedNow = false, sinceHint = 0;
  function wantedPickup(): PickupKind | null {
    const p = player(world);
    let best: PickupKind | null = null, bestD = 6;
    for (const q of world.pickups) {
      if (!q.active || !wants(p, q.kind)) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      // Only a pickup in the player's light: a tip about something you cannot see would only confuse.
      if (d < bestD && canSee(world.level, p.x, p.y, p.facing, p.view, q.x, q.y)) { best = q.kind; bestD = d; }
    }
    return best;
  }
  function maybeTip() {
    if (!settings.tips || AUTOPLAY_SEED !== null) { hurtNow = blockedNow = false; return; }
    const p = player(world);
    const id: TipId | null = nextTip({
      t: playTime, sinceLastHint: sinceHint, hintShowing: hintLeft > 0, wantedPickup: world.tick % 6 === 0 ? wantedPickup() : null,
      ammo: p.ammo, magazine: p.weapon.magazine, reserve: p.reserve, reloading: p.reloadLeft > 0, abilityReady: p.abilityCd === 0,
      hurt: hurtNow, blockedShot: blockedNow,
    }, shownTips);
    hurtNow = blockedNow = false;
    if (!id) return;
    shownTips.add(id);
    saveShownTips(localStorage, shownTips);
    showHint(tipText(id, input.mode === 'touch', p.hero.ability), 5);
    sinceHint = 0;
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
      if (s.type === 'shot' && !own && s.team !== p.team && muzzleFlashSeen(world.level, p.x, p.y, s.x, s.y))
        fx.threats[s.sourceId] = TUNING.perception.flashSeconds;
      // RC-7 run facts (results, medals, tips): own ability uses, pickups, shots stopped by cover.
      if (own && (s.type === 'dash' || s.type === 'sonar' || s.type === 'barrier' || s.type === 'mend')) runAbilities++;
      if (own && s.type === 'pickup') collected(s.x, s.y);
      if (own && s.type === 'impact' && s.blocked) blockedNow = true;
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
      if (own || s.team === p.team) continue;
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
        hurtNow = true;
        if (settings.vibration && canVibrate) navigator.vibrate(h.killed ? 80 : 25);
        fx.shake = TUNING.render.shakeSeconds;
        fx.damageArcs.push({ ang: Math.atan2(h.fromY - p.y, h.fromX - p.x), age: 0 });
        // Fairness rule: every hit comes from within your sight range with line of sight, so the shooter is
        // always shown (ringed) for the reveal window, even when it stands outside the lamp cone.
        fx.threats[h.by] = TUNING.perception.flashSeconds;
        audio.play('hurt', 0, 0, 1, false, true);
        ($('hurt') as HTMLElement).style.opacity = '1';
        setTimeout(() => (($('hurt') as HTMLElement).style.opacity = '0'), 90);
      }
      if (h.killed) fx.corpses.push({ x: world.actors[h.target].x, y: world.actors[h.target].y, hostile: world.actors[h.target].team !== p.team });
    }
  }

  let fpsAcc = 0, fpsFrames = 0;
  // Test hook for the scripted browser run. Only in dev builds or with ?debug in the URL.
  const hook = { fps: 0 } as { fps: number } & Record<string, unknown>;
  if (import.meta.env.DEV || location.search.includes('debug')) {
    Object.defineProperties(hook, { world: { get: () => world }, phase: { get: () => phase } });
    Object.assign(hook, { renderer, go, setHero: (h: string) => (heroId = h), fx, records: () => records, identity: () => identity, resultsAt: () => resultsAt, autoplay: AUTOPLAY_SEED, hero: () => heroId, stats: debugStats,
      // Debug lab: the bundled sim, so headless checks can run sim sweeps against the exact deployed code.
      lab: { createWorld, stepWorld, IDLE_INPUT, ROOM_ZERO, HEROES, walkable, sightClear, findPath },
      // RC-5 touch-play check: what the scripted autopilot would do now (NOT applied). tools/rc5-touchplay.mjs turns it
      // into real touch gestures, so a full fight runs through the real touch input. Debug builds/?debug only.
      suggest: () => (suggestPilot ??= createAutopilot(Number(QS.get('pilot')) || 7)).next(world),
      // Landscape stage and launch state (tools/rc6-launch.mjs): how the stage sits on the screen, fullscreen, lock.
      stage: () => ({ ...stage(), fullscreen: isFullscreen(), canFs, launch, orientation: screen.orientation?.type ?? null }),
      // RC-7 menus and progression (tools/rc7-menus.mjs): device profile, settings, medals, shown tips, the open view.
      profile: () => profile, settings: () => settings, medals: () => medals, tips: () => [...shownTips],
      view: () => titleView, runFacts: () => ({ pickups: runPickups, abilities: runAbilities }), stick: () => touchStick.radius,
      resolution: () => renderer.app.renderer.resolution, volume: () => audio.volume,
      // RC-8 online (tools/rc8-online.mjs): the session and whether the shown world is an online match.
      net: () => net, online: () => online });
    (window as unknown as { __chog: unknown }).__chog = hook;
  }

  const ringFill = $('ringfill') as unknown as SVGCircleElement;
  const pipsEl = $('pips');
  let lastHud = '';
  let lastZone = '';
  let zoneTickLeft = 0;

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

    pollOnline();
    if (simRuns(phase) && online && net) {
      // Online: send controls, show the server's state. Nothing here decides a hit, damage or the result.
      const p = player(world);
      const ps = renderer.toScreen(p.x, p.y);
      const inp = onlineDriver ? onlineDriver(world) : input.read(ps.x, ps.y);
      net.sendInput(p.alive ? inp : { ...inp, firing: false, moveX: 0, moveY: 0 }, performance.now());
      net.update(p.alive ? inp.aim : null);
      for (const ev of net.takeEvents()) { world.sounds = ev.sounds; world.hits = ev.hits; afterStep(); }
      playTime += dt;
      if (!p.alive && hintLeft <= 0) showHint('You are down. Your side plays on; the result comes when it ends.', 4);
      if (net.state === 'reconnecting' || net.state === 'error') showHint(esc(net.message), 1);
    } else if (online && net && phase === 'pause') {
      // Paused online, the match goes on: let go of every control so the operator stands still (the server keeps
      // the last controls it got, so a held W would otherwise keep walking).
      net.sendInput({ ...IDLE_INPUT, aim: player(world).facing }, performance.now());
    } else if (simRuns(phase)) {
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
      if (r.steps > 0 && world.outcome === 'playing') { maybeTip(); checkFull(); }
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
    } else if (phase === 'play') sinceHint += dt;
    for (const c of fx.collects) c.age += dt;
    fx.collects = fx.collects.filter((c) => c.age < COLLECT_SECONDS);
    $('toast').style.opacity = toastLeft > 0 ? '1' : '0';

    renderer.draw(world, fx, input, dt, { recap: phase === 'recap' || (phase === 'results' && world.outcome === 'dead'), marking: identity.marking, showSticks: phase === 'play' && input.mode === 'touch', playing: phase === 'play', debug: DEBUG_OVERLAY, hud: hudRects() });

    // HUD: only touch the DOM when a value changed.
    const p = player(world);
    const left = world.actors.filter((a) => a.team !== p.team && a.alive).length;
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
      const foes = world.actors.filter((a) => a.team !== p.team);
      pipsEl.querySelectorAll('i').forEach((el, i) => el.classList.toggle('down', !foes[i]?.alive));
      const ab = $('ability');
      ab.style.setProperty('--cd', `${(1 - cdShare) * 360}deg`);
      ab.classList.toggle('ready', cdShare === 0);
    }
    // Danger zone HUD (RC-8): phase words + countdown; "Outside" and a red edge while it is hurting you.
    if (world.zone) {
      const zv = zoneAt(world.zone, matchSeconds(world));
      const out = p.alive && outsideCircle(zv.circle, p.x, p.y);
      const label = out ? 'Outside zone' : zv.phase === 'safe' ? 'Zone in' : zv.phase === 'warning' ? 'Closes in' : zv.phase === 'shrinking' ? 'Closing' : 'Final zone';
      const secs = zv.left === Infinity ? '' : `${Math.floor(Math.ceil(zv.left) / 60)}:${String(Math.ceil(zv.left) % 60).padStart(2, '0')}`;
      const zkey = `${label}|${secs}|${zv.phase}`;
      if (zkey !== lastZone) {
        lastZone = zkey;
        $('zphase').textContent = label;
        $('ztime').textContent = secs;
        $('zone').classList.toggle('hot', zv.phase !== 'safe');
        $('foes').classList.toggle('outside', out);
      }
      const hurtByZone = out && zv.dps > 0;
      $('zoneedge').style.opacity = hurtByZone ? String(0.55 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() / 140))) : '0';
      if (hurtByZone && phase === 'play') {
        zoneTickLeft -= dt;
        if (zoneTickLeft <= 0) { zoneTickLeft = 0.75; audio.play('hurt', 0, 0, 1, false, true); }
      } else zoneTickLeft = 0;
    }
    const low = p.alive && p.hp / p.maxHp <= TUNING.render.lowHpShare;
    $('vignette').style.opacity = low ? String(0.45 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() / 180))) : '0';
  });
}

start().catch((err) => {
  console.error('Game failed to start', err);
  // Keep the boot screen up with the reason and a way out, instead of a black page.
  const e = document.getElementById('booterr');
  if (e) {
    const webgl = /webgl|context/i.test(String(err));
    e.innerHTML = `The game could not start: ${esc(String(err))}.${webgl ? ' This browser could not open WebGL; try another browser or turn hardware acceleration on.' : ''}
      <div class="btns"><button class="btn primary" onclick="location.reload()">Retry</button></div>`;
  } else overlay.innerHTML = `<div class="card"><p>The game could not start: ${esc(String(err))}. Reload the page to try again.</p></div>`;
});
