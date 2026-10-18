import { createRenderer, createFx, COVER_FLASH_SECONDS, COLLECT_SECONDS, RING_SECONDS } from './render/render';
import { createInput, touchStick } from './input/input';
import { createSummaryGate, overlayInputAllowed } from './input/gate';
import { createAudio } from './audio/audio';
import { fixedSteps } from './sim/sim';
import { createWorld, hears, wallFactorOf, matchSeconds, player, stepWorld, touchingFull, wants, IDLE_INPUT, type Pickup, type PickupKind, type World } from './sim/world';
import { outsideCircle, zoneAt } from './sim/zone';
import { OnlineSession, serverUrl } from './net/client';
import { MODE_SIZE, type Mode } from './net/protocol';
import { ROOM_ZERO } from './config/map';
import { findPath, sightClear, walkable } from './sim/level';
import { clampMarker } from './render/visibility';
import { muzzleFlashSeen } from './sim/vision';
import { canSee } from './sim/vision';
import { downedCard } from './ui/downed';
import { feedAdd, feedLine, type FeedLine } from './ui/feed';
import type { Brain } from './sim/bots';
import { deviceClass, median, type MatchReport, type ReportCause, type ReportOutcome } from './sim/report';
import { PERKS, type PerkId } from './config/perks';
import { nextPhase, simRuns, type MatchEvent, type Phase } from './sim/match';
import { TUNING } from './config/tuning';
import { HEROES, heroById, heroIdOf, squadFor } from './config/heroes';
import { heroForKey } from './ui/heroKeys';
import { portraitSvg } from './ui/art';
import { WEAPONS } from './config/weapons';
import { orientationOf, ORIENTATION_QUERY } from './ui/orientation';
import { fullscreenSupported, isFullscreen, layoutStage, rectToStage, requestLandscape, stage, toStage, type LaunchResult } from './ui/stage';
import { coverBoxAt } from './sim/cover';
import { adapterFromUrl, resolveIdentity, GUEST, type Identity } from './nft/identity';
import { boundIdentity } from './nft/identity';
import { DEMO_COPY, TRAIT_INFO, isTokenId, sampleTokens, traitsFor } from './nft/traits';
import { loadRecords, recordBest, type Records } from './ui/records';
import { DEFAULT_SETTINGS, QUALITY_DPR, SETTINGS_KEY, STICK_PX, displayName, loadProfile, loadSettings, saveSettings, togglePin, validateNickname, type Profile, type Settings } from './ui/profile';
import { MEDALS, awardMedals, loadMedals, type MedalDef, type Unlocked } from './ui/medals';
import { TIPS_KEY, loadShownTips, nextTip, saveShownTips, tipText, type TipId } from './ui/tips';
import { esc, howtoHtml, medalCard, nickHtml, resultsHtml, selectHtml, settingsHtml, type AuthView } from './ui/screens';
import { authHtml, chogHtml, boardScreenHtml, careerHtml, classOf, hubHtml, medalsScreenHtml, onlineResultsHtml, topbar, upgradesHtml, upgradesReady, type HubCtx, type NetView, type PlayMode } from './ui/hub';
import { docsHtml, filterDocs } from './ui/docs';
import { CHOG_ERRORS, chogConnect, chogEligibility, chogNetwork, chogPickAccount, chogSign, discoverWallets, fetchAuthConfig, fetchSession, googleSignIn, isMobileBrowser, signOut, walletSignIn, watchWallet, MONAD_CHAIN_HEX, type ChogStep } from './ui/auth';
import { SIDEGRADES } from './sim/operators';
import { createAutopilot, type Autopilot } from './debug/autopilot';
import { createOnlineDriver } from './debug/onlineDriver';
import * as account from './net/account';
import { emptyAcct } from './ui/account';
import { SUPERPOWERS } from './config/superpowers';
import { pointInPolygon } from './sim/geom';
import { chogName, powerForToken, signatureFor, tierOfMetadataId, ONE_OF_ONE, TIER_DEFS, type Power } from './config/power';
import { tierEffect } from './ui/account';
import { LAB, applyLab } from './config/lab';
import { OWN_NOISE, markKind } from './render/marks';
import { createIntel, locatesSource, senseFor } from './sim/intel';
import { commsLine, compass } from './ui/comms';
import { createFightRecord, deathInsights, gaitOf, offFacing, trimFight, type Insight } from './sim/insight';
import { rung } from './sim/intel';
import { createTelemetry, stepTelemetry, summary as teleSummary } from './sim/telemetry';
import { PRACTICE_REWARDS, REWARDS, rewardBreakdown } from './config/progression';
import type { RewardView } from './ui/rewards';

// DEMO screen: the first token of each tier in the verified catalogue, plus two 1:1s with different signatures.
const DEMO_TIER_SAMPLES = ['1', '2', '54', '31', '53', '1373'];

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
// CF lab (docs/ROOM_ZERO_CORE_FEEL_AUDIT.md): ?lab=A0,E0 switches experiments off in dev and test-hook builds, never in
// production, so the owner can play the old and new rules side by side. The game server always plays the defaults.
const LAB_ON = (import.meta.env.DEV || __TEST_HOOKS__) && QS.has('lab');
const LAB_SET = LAB_ON ? applyLab(QS.get('lab') ?? '') : [];



const SPEAKER_ON = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9c1.5 1.5 1.5 4.5 0 6M18.5 6.5c3 3 3 8 0 11"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>';

// The build's commit (Vercel sets VERCEL_GIT_COMMIT_SHA at build time; vite.config.ts injects it), shown in Settings.
declare const __BUILD_SHA__: string;
// False in production builds (vite.config.ts): the online test hooks below are then compiled out.
declare const __TEST_HOOKS__: boolean;

// Loading screen (master integration pass): its own full screen, separate from the hub, with the real start-up steps
// in order (fonts, renderer, sign-in, the account, the map), a percentage, rotating game tips, and a transition into
// the hub. A failure shows the reason and a Retry button.
const BOOT_STEPS = ['Loading fonts', 'Starting the renderer', 'Building the basement', 'Checking your sign-in', 'Loading your account'];
const BOOT_TIPS = [
  'Walls block bullets and sight. If you cannot see them, they cannot hit you.',
  'Running is loud. Creep (half push or Shift) and they hear nothing.',
  'Footprints are steps you heard. A tick around you is a noise through a wall.',
  'Stand still and your aim tightens and your lamp reaches further. Run and both loosen.',
  'A downed teammate has 10 s: stand next to them and hold fire for 3 s to get them up.',
  'A health pickup at full health still overheals you for a while.',
  'Your Chog sets your starting class. Your account upgrades take it further.',
  'The ten 1:1 legends each have their own signature, telegraph and counter.',
  'The leaderboard counts kills in saved online matches, then wins.',
];
let bootTipTimer: ReturnType<typeof setInterval> | null = null;
// SB ?perf: milliseconds from navigation to the hub (the real load time a player waits).
let bootAt = 0;
// CF: the same real steps as a checklist (done, now, to come), so the screen says what it is waiting on.
const BOOT_SHORT = ['Fonts', 'Renderer', 'Room', 'Player', 'Account'];
function boot(i: number) {
  const fill = document.getElementById('bootfill'), step = document.getElementById('bootstep'), pctEl = document.getElementById('bootpct');
  const share = Math.round((i / BOOT_STEPS.length) * 100);
  if (fill) fill.style.width = `${share}%`;
  if (pctEl) pctEl.textContent = `${share}%`;
  if (step) step.textContent = BOOT_STEPS[i] ?? '';
  const list = document.getElementById('bootsteps');
  if (list) list.innerHTML = BOOT_SHORT.map((t, k) => `<li class="${k < i ? 'done' : k === i ? 'now' : ''}">${t}</li>`).join('');
  const tip = document.getElementById('boottip');
  if (tip && !bootTipTimer) {
    let k = Math.floor(Math.random() * BOOT_TIPS.length);
    tip.textContent = BOOT_TIPS[k];
    bootTipTimer = setInterval(() => { k = (k + 1) % BOOT_TIPS.length; tip.classList.remove('in'); void tip.offsetWidth; tip.textContent = BOOT_TIPS[k]; tip.classList.add('in'); }, 2200);
  }
}
async function bootDone() {
  const b = document.getElementById('boot');
  if (!b) return;
  (document.getElementById('bootfill') as HTMLElement).style.width = '100%';
  const pctEl = document.getElementById('bootpct');
  if (pctEl) pctEl.textContent = '100%';
  const step = document.getElementById('bootstep');
  if (step) step.textContent = 'Entering Room Zero';
  const list = document.getElementById('bootsteps');
  if (list) list.innerHTML = BOOT_SHORT.map((t) => `<li class="done">${t}</li>`).join('');
  // CF: no minimum display time (the owner: never fake loading). One frame for the bar to land, then the hub.
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  if (bootTipTimer) clearInterval(bootTipTimer);
  b.classList.add('done');
  document.body.classList.add('hub-in');
  setTimeout(() => { b.remove(); document.body.classList.remove('hub-in'); }, 700);
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
  type TitleView = 'main' | 'howto' | 'docs' | 'demo' | 'settings' | 'nick' | 'upgrades' | 'ranks' | 'career' | 'medals' | 'auth' | 'chog';
  // GP Game Docs: the section opened when the screen is shown (the search box filters the rest live).
  let docsOpen: string | null = null;
  document.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement | null;
    if (t?.id !== 'docsq') return;
    const n = filterDocs(document, t.value);
    const none = document.getElementById('docsnone');
    if (none) none.hidden = n > 0;
  });
  let titleView: TitleView = (() => { try { return localStorage.getItem(ONBOARD_KEY) === '1' ? 'main' : 'howto'; } catch { return 'main'; } })();
  let lastRun: { newBest: { time: boolean; kills: boolean }; earned: MedalDef[]; saved: 'account' | 'session' | 'saving' | 'failed'; reward?: RewardView | null } | null = null;
  // The signed start ticket of the current signed-in run (the site pays a run only with it).
  let practiceTicket: { ticket: string; runId: string; run: number } | null = null;
  // Progression belongs to the account (master integration pass): records, medals, callsign, favourite and pins come
  // from the server for a signed-in player. A guest's live in this memory store for the session only. The browser
  // keeps preferences only (settings, tips, onboarding, last operator, last mode, demo pick).
  const mem = new Map<string, string>();
  const guestStore = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  let guestProfile: Profile = loadProfile(guestStore);
  let guestRecords: Records = loadRecords(guestStore);
  let guestMedals: Unlocked = loadMedals(guestStore);
  let settings: Settings = loadSettings(localStorage);
  let shownTips = loadShownTips(localStorage);
  const MODE_KEY = 'chog.mode';
  let playMode: PlayMode = (() => { try { const m = localStorage.getItem(MODE_KEY); return m === '1v1' || m === '3v3' || m === '5v5' || m === 'solo' ? m : 'solo'; } catch { return 'solo'; } })();
  let confirmReset = false;
  let nickError = '';
  let nickSaved = false;
  let nickReturn: TitleView = 'career';
  const auth: AuthView = { config: null, session: [], wallets: [], busy: false, message: '' };
  // Enter with CHOG (CF): where the flow is, which wallet and address it is using.
  let chog: ChogStep = { s: 'pick' };
  let chogWallet: { id: string; name: string } | null = null;
  let chogAddr = '';
  // The flow's generation: a closed sheet, Cancel, Back or a new start moves it on, and a step that answers for an older
  // one is dropped (a wallet that answers late never signs anyone in behind another screen).
  let chogRun = 0;
  /** The window lost focus (blur) and has not got it back. */
  let focusLost = false;
  let chogUnwatch: () => void = () => undefined;
  // The sign-in sheet: shown over the screen that asked for it, and closed back to that screen.
  let pickWallet = false;
  let authReturn: TitleView = 'main';
  const AUTH_RETURN_KEY = 'chog.authReturn';
  // The server account (XP, shards, upgrades, rating, callsign, medals, career), the held Chogs read on Monad, and the
  // ticket choice for online play. Loaded during the loading screen, and again whenever a screen shows it.
  const acct = emptyAcct();
  const signedIn = () => acct.signedIn && !!acct.profile;
  const curRecords = (): Records => (signedIn() ? acct.profile!.practice : guestRecords);
  const curMedals = (): Unlocked => (signedIn() ? acct.profile!.medals : guestMedals);
  /** The player card: the account's (callsign, favourite, pins, linked sign-ins) or this session's guest card. */
  const curProfile = (): Profile => {
    // Signed in while the account service is down: show who you are, never a guest name.
    if (acct.signedIn && !acct.profile) return { ...guestProfile, nickname: null, fallback: acct.identities[0]?.label ?? 'Player' };
    if (!signedIn()) return guestProfile;
    const p = acct.profile!;
    const id = p.account.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
    return { id, nickname: p.callsign, fallback: `Player-${id.slice(0, 4)}`, favourite: p.favourite, pinned: p.pins, linked: acct.identities.map((i) => ({ ...i, subject: '' })) };
  };
  let lastReward: { pending: boolean; reward: account.Reward | null; note: string; matchId: string | null; before: { xp: number; shards: number; rating: number } | null } = { pending: false, reward: null, note: '', matchId: null, before: null };
  const canVibrate = typeof navigator.vibrate === 'function';
  // Per-run counters for the results screen and medals (the sim does not track these).
  let runPickups = 0, runAbilities = 0;
  // RC-8 online play: the server address (?server=... or the build's VITE_GAME_SERVER_URL; null = not deployed),
  // the session, and whether the current world is an online match (then it is the server's view, not a local sim).
  // ?server= points the client at another game server; test builds only, so a link can never send players elsewhere.
  const NET_URL = serverUrl(__TEST_HOOKS__ ? location.search : '', import.meta.env.VITE_GAME_SERVER_URL as string | undefined);
  let net: OnlineSession | null = null;
  let online = false;
  let onlineMode: Mode = '1v1';
  let netKey = '';
  let lastPing = 0;
  // Invite link: ?online=1v1|3v3|5v5[&code=XXXX] opens Online and joins that queue (private room with a code); the player
  // still plays with their own controls. Hosted tests (test builds only, never production): &debug&drive=1 lets a
  // scripted player (src/debug/onlineDriver.ts) send the controls, so a browser service that cannot click can play.
  const ONLINE_AUTO = (Object.keys(MODE_SIZE) as Mode[]).find((m) => m === QS.get('online')) ?? null;
  const ONLINE_CODE = QS.get('code') ?? '';
  const scripted = __TEST_HOOKS__ && QS.has('debug') && QS.get('drive') === '1' ? createOnlineDriver() : null;
  // &driveAfter=<s>: the scripted player stands still for the first s seconds of the match (journey tests need a match
  // past the 20 s reward minimum). Test builds only, like the driver itself.
  const driveAfter = Number(QS.get('driveAfter')) || 0;
  const onlineDriver = scripted ? (w: World) => (matchSeconds(w) >= driveAfter ? scripted(w) : { ...IDLE_INPUT, aim: w.actors[0].facing }) : null;

  let phase: Phase = 'title';
  let heroId = (() => {
    const forced = AUTOPLAY_SEED !== null ? QS.get('hero') : null;
    if (forced && HEROES.some((x) => x.id === forced)) return forced;
    try {
      return heroIdOf(localStorage.getItem(HERO_KEY)) ?? HEROES[0].id;
    } catch {
      return HEROES[0].id;
    }
  })();
  let heroPicked = (() => { try { return !!localStorage.getItem(HERO_KEY); } catch { return false; } })();
  let runIndex = 0;
  let autopilot: Autopilot | null = null;
  let suggestPilot: Autopilot | null = null;
  let world: World = createWorld({ seed: TUNING.seed, hero: heroId, sidegrade: identity.sidegrade, zone: true, power: soloPower() });
  let acc = 0;
  let recapLeft = 0;
  let playTime = 0;
  let toastLeft = 0;
  const fx = createFx();
  const debugStats = { blockedCues: 0, callouts: 0 };
  renderer.reset(world);

  // CF hub backdrop: the real room, live, behind the hub. Your operator stands in the north office under its lamp,
  // sweeping the door; a patrol walks the concourse below, heard through the wall before the lamp catches it. Its
  // input is scripted (it never fights) and the backdrop plays no sound. Nothing here is saved or sent anywhere.
  const MENU_SPOT = { x: 16.5, y: 3.4 };
  const MENU_ROUTE = [{ x: 14.5, y: 8.5 }, { x: 19.5, y: 8.5 }];
  let menuWorld: World | null = null, menuHero = '', menuAcc = 0, menuT = 0, menuLeg = 0, menuWait = 0;
  // SB: what the player believes about each hostile, per world (the hub backdrop has its own).
  let matchIntel = createIntel(), menuIntel = createIntel();
  // SB death insight: the last seconds of the player's fight (hits taken, own shots), and the reasons shown at death.
  let fight = createFightRecord();
  let deathWhy: Insight[] = [];
  // SB telemetry, on the device only (never sent): this match's numbers, and this session's match funnel.
  let tele = createTelemetry();
  const product = { started: 0, completed: 0, won: 0, died: 0, quits: 0, retries: 0 };
  let drawnWorld: World = world;
  function menuWorldNow(): World {
    if (!menuWorld || menuHero !== heroId) {
      menuIntel = createIntel();
      menuWorld = createWorld({ seed: 7, hero: heroId, zone: false, bots: [{ name: 'Rounds', hero: 'tonashiro', patrol: [[20, 5]], flanker: false }] });
      const p = menuWorld.actors[0];
      p.x = MENU_SPOT.x; p.y = MENU_SPOT.y; p.facing = Math.PI / 2; p.hp = p.maxHp = 1e9;
      menuWorld.pickups.length = 0; // the hub shows the operator and the room, not a health crate beside it
      menuHero = heroId;
    }
    return menuWorld;
  }
  function menuPatrol(a: { x: number; y: number }) {
    const t = MENU_ROUTE[menuLeg], dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
    if (d < 0.3) { menuWait += TUNING.simStepSeconds; if (menuWait > 1.6) { menuWait = 0; menuLeg = 1 - menuLeg; } return { ...IDLE_INPUT, aim: Math.PI / 2 }; }
    const k = TUNING.bots.patrolSpeed / d;
    return { ...IDLE_INPUT, moveX: dx * k, moveY: dy * k, aim: Math.atan2(dy, dx) };
  }
  function menuStep(dt: number) {
    const w = menuWorldNow();
    const r = fixedSteps(menuAcc, dt, TUNING.simStepSeconds, 3);
    menuAcc = r.remainder;
    for (let i = 0; i < r.steps; i++) {
      menuT += TUNING.simStepSeconds;
      stepWorld(w, { ...IDLE_INPUT, aim: Math.PI / 2 + 0.85 * Math.sin(menuT * 0.32) }, TUNING.simStepSeconds, (a) => menuPatrol(a));
      const p = w.actors[0];
      p.hp = p.maxHp;
      // The backdrop patrol is heard through the wall the way any hostile is (SB contact intel).
      senseFor(w, p, menuIntel, TUNING.simStepSeconds);
    }
  }

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
  $('nade').onpointerdown = (e) => {
    e.stopPropagation();
    // CF: press and drag to aim the throw (the landing ring shows), release to throw; a tap throws along your aim.
    const pt = toStage(stage(), e.clientX, e.clientY);
    input.nadeDown(e.pointerId, pt.x, pt.y);
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
    showHint('Marks are noises you <b>heard</b>, not saw. A tick around you: through a wall. A red dotted ring: where they could be now.', 6);
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
    if (e === 'restart') product.retries++;
    if (e === 'quit' && (from === 'play' || from === 'pause')) { product.quits++; sendMatchReport('quit'); }
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
    // Browser Back from a sub-screen (upgrades, leaderboard, sign-in...) returns to the hub instead of leaving the game:
    // one history entry is added while away from the hub (see the popstate handler).
    if (phase === 'title' && titleView !== 'main' && !(history.state as { rz?: number } | null)?.rz) { try { history.pushState({ rz: 1 }, ''); } catch { /* ignore */ } }
    // In a match too: the phone's Back (or the browser's) pauses the match instead of leaving the site.
    if ((phase === 'play' || phase === 'loading') && !(history.state as { rz?: number } | null)?.rz) { try { history.pushState({ rz: 1 }, ''); } catch { /* ignore */ } }
    $('hud').classList.toggle('on', phase === 'play' || phase === 'pause' || phase === 'recap');
    overlay.inert = false;
    switch (phase) {
      case 'title': return showTitle();
      case 'select': return show(selectHtml(ctx()));
      case 'loading': return showLoading();
      case 'play': {
        // V2: the hidden card keeps its buttons; make them unreachable (no focus, no key clicks) while playing.
        overlay.className = 'layer hidden';
        if (overlay.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
        overlay.inert = true;
        return;
      }
      case 'pause': return showPause();
      case 'recap': return showRecap();
      case 'results': return online ? showOnlineResults() : show(resultsHtml(ctx(), report()));
      default: return;
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
  function ctx(): HubCtx {
    const nv: NetView = {
      url: NET_URL, state: net?.state ?? 'offline', message: net?.message ?? '', queue: net?.queue ?? null, rtt: net?.rtt ?? 0,
      party: net?.party ?? null, follower: !!net?.follower,
    };
    return {
      touch: input.mode === 'touch', profile: curProfile(), settings, records: curRecords(), medals: curMedals(), heroId, demoChip: demoChip(), marking: identity.marking,
      muted: audio.muted, canFs: canFs && !isFullscreen(), canVibrate, build: __BUILD_SHA__, auth,
      acct, netProfile: net?.profile ?? null, demoToken: identity.kind === 'bound' ? identity.tokenId : null,
      mode: playMode, net: nv,
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
      case 'docs': return show(docsHtml(input.mode === 'touch', docsOpen, topbar('Game Docs')));
      case 'demo': return showDemo();
      case 'settings': return show(settingsHtml(c, confirmReset));
      case 'upgrades': return show(upgradesHtml(c));
      case 'ranks': return show(boardScreenHtml(c));
      case 'career': return show(careerHtml(c));
      case 'medals': return show(medalsScreenHtml(c, (m) => medalCard(m, c)));
      case 'auth': return show(authHtml({ config: auth.config, session: auth.session, wallets: auth.wallets, busy: auth.busy, message: auth.message, pickWallet, mobile: isMobileBrowser(), pageUrl: walletPageUrl() }, location.host));
      case 'chog': return show(chogHtml({ step: chog, wallets: auth.wallets, wallet: chogWallet?.name ?? '', ready: auth.config !== null && walletsReady, off: auth.config === false || (!!auth.config && !auth.config.wallet), mobile: isMobileBrowser(), pageUrl: walletPageUrl() }, location.host));
      case 'nick': {
        show(nickHtml(c, nickError, nickSaved));
        const inp = document.getElementById('nickin') as HTMLInputElement | null;
        if (inp && !c.touch) { inp.focus(); inp.select(); }
        return;
      }
      default: show(hubHtml(c)); overlay.classList.add('hubbg'); return;
    }
  }

  function showDemo() {
    const rows = SIDEGRADES.map((sg) => { const t = TRAIT_INFO[sg.id]; return `<tr><td><b>${esc(t.name)}</b></td><td>${esc(t.effect)}</td><td>${esc(t.counterplay)}</td></tr>`; }).join('');
    const picks = sampleTokens().map((t) => `<button class="btn" data-demo="${t}">#${t} · ${esc(TIER_DEFS[tierOfMetadataId(Number(t)) ?? 'free'].label)} · ${esc(traitsFor(t).sidegrade.name)}</button>`).join('');
    // One real token per tier (from the verified catalogue) and a 1:1 with its signature ability.
    const tiers = DEMO_TIER_SAMPLES.map((t) => { const n = Number(t); const tr = tierOfMetadataId(n)!; const sig = signatureFor(n); return `<tr><td><button class="btn small" data-demo="${t}">Chog #${t}</button></td><td>${esc(TIER_DEFS[tr].label)}</td><td>${esc(sig ? `${sig.name}: ${sig.text}` : tierEffect(tr))}</td></tr>`; }).join('');
    card(`<div class="kicker"><span class="demo">DEMO</span> Chog class system</div><h2>Try a Chog</h2>
      <p class="democopy">${esc(DEMO_COPY)} The tier is the token's real tier from the Chog Genesis catalogue. Demo power plays solo and in demo-only online rooms, and earns nothing.</p>
      <table class="traits"><tr><th>Token</th><th>Tier</th><th>What it does</th></tr>${tiers}</table>
      <table class="traits"><tr><th>Trait</th><th>Effect</th><th>Counterplay</th></tr>${rows}</table>
      <p style="font-size:13px">On top of the tier, the token number picks a play-shape trait (hash of the number, mod 4) and a marking colour. Speed never changes.</p>
      <div class="btns">${picks}<button class="btn" data-demo="">Play as guest</button></div>
      <div class="btns"><button class="btn primary" data-act="demo-close">Back</button></div>`);
  }

  function selectHero(id: string) {
    heroId = id;
    heroPicked = true;
    try {
      localStorage.setItem(HERO_KEY, heroId);
    } catch {
      /* ignore */
    }
    for (const el of overlay.querySelectorAll<HTMLElement>('.hero')) el.classList.toggle('sel', el.dataset.hero === id);
  }

  function showLoading() {
    // Deploy screen: what you are dropping into, full screen, while the world is built.
    const h = heroById(heroId);
    const m = online ? `Online ${onlineMode}` : 'Vs bots · You + 2 AI vs 5';
    const tip = BOOT_TIPS[(runIndex + 3) % BOOT_TIPS.length];
    show(`<div class="screen deploy"><div class="deploy-in"><div class="kicker">${esc(m)}</div><h2>Room Zero</h2>
<div class="deploy-op">${portraitSvg(h, 'dep', identity.marking)}<span><b>${esc(h.name)}</b><small>${esc(h.role)} · ${esc(WEAPONS[h.weapon].name)}</small></span></div>
<div class="loadbar"><i></i></div><p class="deploy-tip">${esc(tip)}</p></div></div>`);
    // Build the world (and bake the map if needed) after the loading card has painted.
    requestAnimationFrame(() => setTimeout(() => {
      if (online) beginOnlineWorld(); else beginWorld();
      // A tab hidden or a window left while the deploy card showed starts the match paused, never unattended.
      setTimeout(() => { go('loaded'); if (phase === 'play' && (document.hidden || focusLost)) go('pause'); }, 350);
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

  /** SB: the one or two reasons this death happened (src/sim/insight.ts), from the player's own fight record. */
  function explainDeath(): Insight[] {
    const p = player(world);
    // Online the view world has no kill record: the last hit you took is the killing one.
    const lastHit = fight.hits[fight.hits.length - 1];
    const k = world.playerKill ?? p.death ?? (online && lastHit ? { cause: 'shot' as const, killerId: lastHit.by, weapon: '', fromX: lastHit.fromX, fromY: lastHit.fromY, toX: p.x, toY: p.y, tick: world.tick } : null);
    if (!k || k.cause !== 'shot' || k.killerId < 0) return [];
    const killer = world.actors[k.killerId];
    return deathInsights(fight, {
      now: matchIntel.now, killer: k.killerId, dist: Math.hypot(k.fromX - p.x, k.fromY - p.y),
      weapon: { name: p.weapon.name, falloffEnd: p.weapon.falloffEnd, pellets: p.weapon.pellets },
      foundBy: killer?.ai ? world.brains.get(k.killerId)?.foundBy ?? null : null, dir: compass(k.fromX - p.x, k.fromY - p.y),
    });
  }
  const whyHtml = () => deathWhy.map((i) => `<p class="insight">${esc(i.text)}</p>`).join('');

  function showRecap() {
    // The death screen speaks alone: no gameplay tip under or over the DOWN headline (mobile overlap, SB).
    hintLeft = 0;
    hint.style.opacity = '0';
    const k = world.playerKill!;
    if (k.cause === 'zone') { card('<h2 class="bad">Down</h2><p>The danger zone got you. Stay inside the circle when it closes.</p>', 'layer clear'); return; }
    const killer = world.actors[k.killerId];
    const p = player(world);
    const d = Math.hypot(k.fromX - p.x, k.fromY - p.y);
    card(`<h2 class="bad">Down</h2><p>${esc(killer.name)} (${esc(killer.hero.name)}, ${esc(k.weapon)}) from ${d.toFixed(0)} m ${compass(k.fromX - p.x, k.fromY - p.y)}.</p>${whyHtml()}`, 'layer clear');
  }

  // The after-action report: only numbers the game tracked this run.
  function report() {
    const won = world.outcome === 'won';
    const p = player(world);
    const k = world.playerKill;
    return {
      won, hero: heroById(heroId), weaponName: p.weapon.name,
      why: !won && k?.cause === 'zone' ? '<p class="bad">Danger zone</p>' : !won && k && k.killerId >= 0 ? `<p class="bad">${esc(world.actors[k.killerId].name)} · ${esc(k.weapon)} · ${Math.hypot(k.fromX - p.x, k.fromY - p.y).toFixed(0)} m ${compass(k.fromX - p.x, k.fromY - p.y)}</p>${whyHtml()}` : '',
      time: playTime, kills: p.kills, teamKills: world.actors.filter((a) => a.team === 'player' && a.ai).reduce((n, a) => n + a.kills, 0),
      bots: world.actors.filter((a) => a.team === 'bot').length, left: world.actors.filter((a) => a.team === 'bot' && a.alive).length,
      // Per bullet, so a shotgun's 8 pellets per shot can never read above 100% (RC-3: Brick showed 59/16).
      hits: p.hits, bullets: p.bullets, dealt: p.damageDealt, taken: p.damageTaken, pickups: runPickups, abilities: runAbilities,
      newBest: lastRun?.newBest ?? null, earned: lastRun?.earned ?? [],
      demoRow: identity.kind === 'bound' ? ` · <span class="demo">DEMO</span> #${esc(identity.tokenId!)}` : '',
      saved: lastRun?.saved ?? 'session',
      reward: lastRun?.reward ?? null,
    };
  }

  // ---- Menu actions ----
  /** Favourite operator and pinned medals: saved on the account when signed in, for the session as a guest. */
  async function setCard(next: { favourite?: string | null; pins?: string[] }) {
    if (!signedIn()) { guestProfile = { ...guestProfile, ...(next.favourite !== undefined ? { favourite: next.favourite } : {}), ...(next.pins ? { pinned: next.pins } : {}) }; render(); return; }
    const p = acct.profile!;
    if (next.favourite !== undefined) p.favourite = next.favourite;
    if (next.pins) p.pins = next.pins;
    render();
    const r = await account.setPrefs(next);
    if (!r?.ok) { acct.message = 'Could not save that to your account.'; await refreshAccount(); }
  }

  async function saveNick() {
    const inp = document.getElementById('nickin') as HTMLInputElement | null;
    const v = validateNickname(inp?.value ?? '');
    if (!v.ok) { nickError = v.error; nickSaved = false; render(); return; }
    if (signedIn()) {
      const r = await account.setCallsign(v.value);
      if (!r?.ok) { nickError = r?.error ?? 'Could not save your callsign right now.'; nickSaved = false; render(); return; }
      acct.profile!.callsign = r.callsign ?? v.value;
      // The next online connection uses the new callsign.
      if (net && net.state !== 'match' && net.state !== 'reconnecting' && net.state !== 'queued') { net.close(); net = null; }
    } else guestProfile = { ...guestProfile, nickname: v.value };
    nickError = '';
    nickSaved = true;
    render();
    setTimeout(() => { if (titleView === 'nick' && nickSaved) { nickSaved = false; titleView = nickReturn; render(); } }, 700);
  }

  /** Clears this browser's preferences. Progress is on the account and is never touched from here. */
  function clearPreferences() {
    try { for (const k of [SETTINGS_KEY, TIPS_KEY, ONBOARD_KEY, RING_HINT_KEY, HERO_KEY, MODE_KEY, DEMO_KEY]) localStorage.removeItem(k); } catch { /* storage blocked */ }
    settings = { ...DEFAULT_SETTINGS };
    applySettings();
    shownTips = loadShownTips(localStorage);
    ringHintDone = false;
    setDemo(null);
    confirmReset = false;
  }

  function setMode(m: PlayMode) {
    playMode = m;
    try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
  }

  /** The hub's PLAY button: practice starts at once; online modes queue (a squad leader queues the squad). */
  function hubPlay() {
    if (playMode === 'solo') { go('start'); go('pick'); return; }
    if (!NET_URL) return;
    joinOnline(playMode);
  }

  function menuAct(a: string) {
    switch (a) {
      case 'howto': titleView = 'howto'; break;
      case 'docs':
        // From the first-launch card, reading the docs counts as having seen it.
        if (titleView === 'howto') { try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* storage blocked */ } }
        titleView = 'docs'; docsOpen = 'how-to-play'; break;
      case 'howto-close': closeHowto(); break;
      case 'play': hubPlay(); return;
      case 'demo-online': if (identity.tokenId && tierOfMetadataId(Number(identity.tokenId))) setChoice({ demo: Number(identity.tokenId) }); break;
      case 'demo-online-off': setChoice(null); break;
      case 'online-cancel': net?.leave(); break;
      case 'settle-retry': if (lastReward.matchId && !lastReward.pending) { settleOnline(lastReward.matchId, false); render(); } return;
      case 'online-again': online = false; go('menu'); titleView = 'main'; if (!net?.follower) joinOnline(onlineMode); break;
      case 'upgrades-from-results': online = false; go('menu'); titleView = 'upgrades'; break;
      case 'squad-create': if (NET_URL) { net ??= newSession(); net.partyOp('create'); } break;
      case 'squad-join': {
        const code = ((document.getElementById('squadcode') as HTMLInputElement | null)?.value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (NET_URL && code.length === 5) { net ??= newSession(); net.partyOp('join', code); }
        break;
      }
      case 'squad-leave': net?.partyOp('leave'); break;
      case 'demo': titleView = 'demo'; break;
      case 'demo-close': titleView = 'main'; break;
      case 'upgrades': titleView = 'upgrades'; void refreshAccount(); break;
      case 'ranks': {
        titleView = 'ranks';
        // Opens on the board you play on (online only so far: Online), until you pick a tab yourself.
        const pr = acct.profile;
        if (!boardPicked) acct.boardTab = pr && pr.matches > 0 && pr.practice.overall.runs === 0 ? 'online' : 'solo';
        acct.boardOffset = 0;
        // The account never loaded (the API was down at boot): load it now; that loads the board too.
        if (!acct.config?.db) void refreshAccount().then(() => render());
        else void loadBoard();
        break;
      }
      // GP leaderboards: Solo / Online tabs, pages, retry, and "show me on the boards".
      case 'board-solo': boardPicked = true; acct.boardTab = 'solo'; acct.boardOffset = 0; void loadBoard(); break;
      case 'board-online': boardPicked = true; acct.boardTab = 'online'; acct.boardOffset = 0; void loadBoard(); break;
      case 'board-next': if (acct.boardOffset + BOARD_PAGE < acct.boardTotal) { acct.boardOffset += BOARD_PAGE; void loadBoard(); } break;
      case 'board-prev': acct.boardOffset = Math.max(0, acct.boardOffset - BOARD_PAGE); void loadBoard(); break;
      case 'board-retry': void loadBoard(); break;
      case 'board-hide': if (acct.boardMe) void account.setPrefs({ hidden: !acct.boardMe.hidden }).then(() => loadBoard()); break;
      case 'career': titleView = 'career'; void refreshAccount(); break;
      case 'medals': titleView = 'medals'; break;
      case 'settings': titleView = 'settings'; confirmReset = false; refreshAuth(); break;
      case 'nick': nickReturn = titleView === 'nick' ? nickReturn : titleView; titleView = 'nick'; nickError = ''; nickSaved = false; break;
      case 'back': if (titleView === 'chog') chogStop(); titleView = titleView === 'nick' ? nickReturn : titleView === 'auth' ? authReturn : 'main'; confirmReset = false; acct.message = ''; break;
      case 'signin':
        if (titleView !== 'auth') authReturn = titleView;
        titleView = 'auth'; pickWallet = false; auth.message = ''; auth.busy = false;
        void refreshAuth();
        break;
      case 'signin-wallet': void walletButton(); return;
      case 'chog':
        if (titleView !== 'chog' && titleView !== 'auth') authReturn = titleView;
        chogStop();
        titleView = 'chog'; chog = { s: 'pick' };
        void refreshAuth();
        break;
      // One wallet request at a time: a second tap while the wallet is asked is ignored (never two prompts).
      case 'chog-switch': if (chogWallet && chog.s === 'network') { const t = chogRun; chogShow({ s: 'switching', wallet: chogWallet.name }); void chogAfterConnect(true, t); } return;
      case 'chog-retry': if (chogWallet) void runChog(chogWallet.id); else chog = { s: 'pick' }; break;
      case 'chog-account': if (chogWallet && chog.s === 'none') void runChog(chogWallet.id, true); return;
      case 'chog-cancel': case 'chog-other': chogStop(); chog = { s: 'pick' }; chogWallet = null; break;
      case 'chog-free': chogStop(); titleView = authReturn === 'chog' || authReturn === 'auth' ? 'main' : authReturn; chog = { s: 'pick' }; break;
      case 'chog-recheck': acct.tokens = null; void refreshAccount(); break;
      case 'wallet-rescan': walletsReady = false; render(); void refreshAuth(); return;
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
      case 'reset-yes': clearPreferences(); break;
      case 'signin-google':
        // Google leaves the page: remember where to come back to (a UI preference, not progress).
        try { sessionStorage.setItem(AUTH_RETURN_KEY, authReturn); } catch { /* ignore */ }
        auth.busy = true; auth.message = 'Opening Google…'; render();
        googleSignIn();
        return;
      case 'signout':
        void signOut().then(async () => {
          auth.session = [];
          auth.message = '';
          titleView = 'main';
          acct.signedIn = false; acct.profile = null; acct.tokens = null; acct.hasWallet = false; acct.identities = []; acct.choice = null;
          if (net && net.state !== 'match') { net.close(); net = null; }
          await refreshAccount();
          render();
        });
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
    else if (name === 'share') s.shareStats = val === 'on';
    else if (name === 'quality' && (val === 'low' || val === 'medium' || val === 'high')) s.quality = val;
    else if (name === 'stick' && (val === 'small' || val === 'medium' || val === 'large')) s.stick = val;
    setSettings(s);
    if (name === 'vibration' && s.vibration && canVibrate) navigator.vibrate(30);
    render();
  }

  // GP: when the last pointer press was (a tap or click acts on press; its own click follows on whatever is under the
  // finger once the screen has changed).
  let pressedAt = -1e9;
  overlay.addEventListener('pointerdown', (e) => { pressedAt = performance.now(); onOverlayPress(e); });
  // A keyboard press of a focused button (Enter or Space: the browser clicks it with detail 0) acts like a tap. A click
  // right after a pointer press is that press's own click (some browsers send it with detail 0 too): ignored, or a
  // tap on Back would also hit the hub button drawn under the finger (it opened Career).
  overlay.addEventListener('click', (e) => { if (e.detail === 0 && performance.now() - pressedAt > 700 && (e.target as HTMLElement).closest('button, [data-act], [data-go]')) onOverlayPress(e); });
  function onOverlayPress(e: Event) {
    if ((e as PointerEvent).pointerType === 'touch') input.mode = 'touch';
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
    const md = t.closest('[data-mode]') as HTMLElement | null;
    if (md) { e.preventDefault(); setMode(md.dataset.mode as PlayMode); render(); return; }
    const tk = t.closest('[data-token]') as HTMLElement | null;
    if (tk) { e.preventDefault(); setChoice(tk.dataset.token ? { tokenId: Number(tk.dataset.token) } : null); render(); return; }
    const sp = t.closest('[data-sp]') as HTMLElement | null;
    if (sp) { e.preventDefault(); setPower(sp.dataset.sp!); return; }
    const up = t.closest('[data-upgrade]') as HTMLElement | null;
    if (up) { e.preventDefault(); void buyUpgrade(up.dataset.upgrade!); return; }
    const fav = t.closest('[data-fav]') as HTMLElement | null;
    if (fav) {
      e.preventDefault();
      const cur = curProfile();
      void setCard({ favourite: cur.favourite === fav.dataset.fav ? null : fav.dataset.fav! });
      return;
    }
    const pin = t.closest('[data-pin]') as HTMLElement | null;
    if (pin) { e.preventDefault(); void setCard({ pins: togglePin(curProfile(), pin.dataset.pin!).pinned }); return; }
    const set = t.closest('[data-set]') as HTMLElement | null;
    if (set) { e.preventDefault(); settingAct(set.dataset.set!, set.dataset.val!); return; }
    const cw = t.closest('[data-chogwallet]') as HTMLElement | null;
    if (cw) { e.preventDefault(); void runChog(cw.dataset.chogwallet!); return; }
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
    if (hero && hero.dataset.pick) { e.preventDefault(); selectHero(hero.dataset.hero!); render(); return; }
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
      if (b.dataset.go === 'menu' || b.dataset.go === 'quit') { if (online) net?.leave(); online = false; }
      e.preventDefault();
      e.stopPropagation(); // a menu press is consumed here and never reaches the game input
      go(b.dataset.go as MatchEvent);
    }
  }

  overlay.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-fs]')) goLandscape();
  });
  overlay.addEventListener('submit', (e) => {
    e.preventDefault();
    if ((e.target as HTMLElement).matches('[data-form="nick"]')) void saveNick();
  });

  // ---- Sign-in (optional; the game never waits on it) ----
  // Linked sign-ins are the account's (the site links every identity in a session to one account): nothing local.
  let walletsReady = false;
  let discovering: Promise<void> | null = null;
  /** This page as a wallet app should open it (its own browser has the wallet built in): path and query kept, no hash. */
  const walletPageUrl = () => location.href.split('#')[0];
  async function refreshAuth() {
    const [config, session, wallets] = await Promise.all([fetchAuthConfig(), fetchSession(), discoverWallets()]);
    auth.config = config;
    auth.session = config ? session : [];
    auth.wallets = wallets;
    walletsReady = true;
    if (phase === 'title' && (titleView === 'settings' || titleView === 'auth' || titleView === 'chog')) render();
  }
  /** Continue with Wallet: one wallet signs straight away; several are listed; none shows how to get one. */
  async function walletButton() {
    // A second tap while wallets are still being found joins the same search (never two connects).
    if (auth.busy) return;
    discovering ??= discoverWallets().then((w) => { auth.wallets = w; walletsReady = true; }).finally(() => { discovering = null; });
    await discovering;
    if (auth.busy) return;
    if (auth.wallets.length === 1) { void doWalletSignIn(auth.wallets[0].id); return; }
    pickWallet = true;
    render();
  }
  async function doWalletSignIn(id: string) {
    if (auth.busy) return;
    auth.busy = true;
    auth.message = 'Approve in your wallet';
    render();
    const who = await walletSignIn(id, () => { auth.message = 'Sign the message in your wallet (free, no transaction)'; if (phase === 'title') render(); });
    if (typeof who === 'string') {
      // The flow's own words, never the wallet's raw error text.
      auth.message = CHOG_ERRORS[who];
      auth.busy = false;
    } else {
      auth.session = await fetchSession();
      auth.message = '';
      // A new identity in the session: reload the account (the same account if one was already signed in) and its Chogs.
      acct.tokens = null;
      acct.choice = null;
      if (net && net.state !== 'match') { net.close(); net = null; }
      await refreshAccount();
      auth.busy = false;
      watchSignedWallet(id);
      if (titleView === 'auth') titleView = authReturn;
    }
    if (phase === 'title') render();
  }
  /**
   * After a wallet sign-in: the session stays on the address that signed (the server's truth). If the wallet switches
   * to another account, say so once, and how to use the new one.
   */
  let signedUnwatch: () => void = () => undefined;
  function watchSignedWallet(id: string) {
    signedUnwatch();
    const signed = new Set(acct.identities.filter((i) => i.provider === 'wallet').map((i) => i.label.toLowerCase()));
    signedUnwatch = watchWallet(id, { accounts: (a) => {
      const now = a[0]?.toLowerCase();
      if (now && ![...signed].some((l) => now.startsWith(l.slice(0, 6)) && now.endsWith(l.slice(-4)))) toast('Your wallet switched account. Enter with CHOG to use the new one.');
    } });
  }
  // ---- Enter with CHOG (CF): connect -> Monad -> CHOG eligibility -> signature -> server session -> your Chog ----
  const chogShow = (st: ChogStep) => {
    chog = st;
    // Test builds: the order of the steps, for tools/cf-chog.mjs (a fast flow outruns any poll).
    if (__TEST_HOOKS__) document.body.dataset.chogTrail = `${document.body.dataset.chogTrail ?? ''}${document.body.dataset.chogTrail ? ',' : ''}${st.s}`;
    if (phase === 'title' && titleView === 'chog') render();
  };
  /** Ends the running flow (if any): later answers from the wallet are ignored, its events unheard. */
  function chogStop() { chogRun++; chogUnwatch(); chogUnwatch = () => undefined; }
  const BUSY_STEPS = new Set<ChogStep['s']>(['connecting', 'switching', 'checking', 'signing', 'verifying', 'loading']);
  async function runChog(id: string, otherAccount = false) {
    // One flow at a time: a wallet tapped while another request is open waits for that one to end or be cancelled.
    if (BUSY_STEPS.has(chog.s)) return;
    chogStop();
    const t = chogRun;
    chogWallet = auth.wallets.find((w) => w.id === id) ?? { id, name: 'Wallet' };
    chogShow({ s: 'connecting', wallet: chogWallet.name });
    const c = otherAccount ? await chogPickAccount(id) : await chogConnect(id);
    if (t !== chogRun) return;
    if (typeof c === 'string') return chogShow({ s: 'error', code: c });
    chogAddr = c.address;
    // The wallet changes under the flow: another account starts over with it; Monad chosen in the wallet continues; a
    // locked or disconnected wallet stops with a way on. Only until the signature is sent.
    chogUnwatch = watchWallet(id, {
      accounts: (a) => {
        if (t !== chogRun || !['network', 'switching', 'checking', 'none', 'signing'].includes(chog.s)) return;
        if (!a[0]) { chogStop(); chogShow({ s: 'error', code: 'no_account' }); return; }
        if (a[0].toLowerCase() === chogAddr.toLowerCase()) return;
        chogAddr = a[0];
        chogStop();
        const t2 = chogRun;
        void chogAfterConnect(false, t2);
      },
      chain: (hex) => {
        if (t !== chogRun || chog.s !== 'network' || parseInt(hex, 16) !== parseInt(MONAD_CHAIN_HEX, 16)) return;
        void chogAfterConnect(false, t);
      },
      disconnect: () => { if (t === chogRun && BUSY_STEPS.has(chog.s) && chog.s !== 'verifying' && chog.s !== 'loading') { chogStop(); chogShow({ s: 'error', code: 'no_account' }); } },
    });
    await chogAfterConnect(false, t);
  }
  async function chogAfterConnect(switchNow: boolean, t: number) {
    const id = chogWallet!.id;
    const n = await chogNetwork(id, switchNow);
    if (t !== chogRun) return;
    if (n === 'wrong') return chogShow({ s: 'network', wallet: chogWallet!.name });
    if (n !== 'ok') return chogShow({ s: 'error', code: n });
    chogShow({ s: 'checking', address: chogAddr });
    const addr = chogAddr;
    const el = await chogEligibility(addr);
    if (t !== chogRun) return;
    if (typeof el === 'string') return chogShow({ s: 'error', code: el });
    if (el.count === 0) return chogShow({ s: 'none', address: addr });
    chogShow({ s: 'signing', count: el.count, best: el.best });
    const who = await chogSign(id, addr, () => { if (t === chogRun) chogShow({ s: 'verifying' }); });
    if (t !== chogRun) return;
    chogUnwatch();
    if (typeof who === 'string') return chogShow({ s: 'error', code: who });
    chogShow({ s: 'loading' });
    auth.session = await fetchSession();
    acct.tokens = null;
    acct.choice = null;
    if (net && net.state !== 'match') { net.close(); net = null; }
    await refreshAccount();
    watchSignedWallet(id);
    const top = (acct.tokens as account.OwnedToken[] | null)?.[0];
    const name = top ? top.oneOfOne ?? `Chog #${top.metadataId}` : 'your Chog';
    chog = { s: 'done', name };
    // Straight into the hub, which now shows the Chog as your identity; the toast says what the server verified.
    if (titleView === 'chog') titleView = authReturn === 'chog' || authReturn === 'auth' ? 'main' : authReturn;
    toast(top ? `CHOG verified · ${name}` : 'Signed in');
    if (phase === 'title') render();
  }

  // Back from Google (?signedin=google or ?signin_error=...): back to the screen sign-in started from (an error reopens
  // the sign-in sheet with the reason).
  if (QS.has('signedin') || QS.has('signin_error')) {
    let back: TitleView = 'main';
    try { back = (sessionStorage.getItem(AUTH_RETURN_KEY) as TitleView | null) ?? 'main'; sessionStorage.removeItem(AUTH_RETURN_KEY); } catch { /* ignore */ }
    authReturn = back === 'auth' ? 'main' : back;
    titleView = QS.has('signin_error') ? 'auth' : authReturn;
    auth.message = QS.has('signin_error') ? 'Google sign-in did not finish' : '';
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
    // The default game: you + 2 AI teammates (other operators than yours) against the five hostile bots.
    world = createWorld({ seed: TUNING.seed + runIndex, hero: heroId, sidegrade: identity.sidegrade, zone: true, power: soloPower(), allies: squadmates() });
    practiceTicket = null;
    if (signedIn() && !LAB_ON) {
      const run = runIndex;
      void account.practiceStart().then((r) => { if (r?.ticket && r.runId && run === runIndex) practiceTicket = { ticket: r.ticket, runId: r.runId, run }; });
    }
    autopilot = AUTOPLAY_SEED !== null ? createAutopilot(AUTOPLAY_SEED + runIndex) : null;
    suggestPilot = null;
    renderer.reset(world);
    drawnWorld = world;
    fx.markers.length = fx.impacts.length = fx.hitMarks.length = fx.corpses.length = fx.damageArcs.length = fx.pings.length = fx.collects.length = fx.rings.length = fx.noise.length = fx.comms.length = 0;
    matchIntel = createIntel();
    wasDowned = false;
    rep = { sent: false, downs: 0, bled: 0, fireAt: -1, firing: false, delays: [] };
    feed = [];
    fight = createFightRecord();
    deathWhy = [];
    tele = createTelemetry();
    product.started++;
    for (const s of fx.sparks) s.age = 1;
    fx.shake = 0;
    acc = 0;
    playTime = 0;
    runPickups = runAbilities = 0;
    hurtNow = blockedNow = false;
    sinceHint = 0;
    const h = heroById(heroId);
    const dp = world.actors[0].power;
    const cls = dp.metadataId ? `${esc(chogName(dp.metadataId))} · ${esc(TIER_DEFS[dp.tier].label)}` : dp.tier !== 'free' ? esc(TIER_DEFS[dp.tier].label) : 'Free class';
    $('hero').innerHTML = `${esc(h.name)} · Vs bots · ${dp.demo ? '<span class="demo">DEMO</span> ' : ''}${cls}`;
    $('wname').textContent = world.actors[0].weapon.name;
    $('abl').innerHTML = `${esc(world.actors[0].ability.name)}<small class="keyhint">Space</small>`;
    $('pips').innerHTML = world.actors.filter((a) => a.team === 'bot').map(() => '<i></i>').join('');
    hint.innerHTML = input.mode === 'touch'
      ? 'Left thumb: move · Right thumb: aim and fire · Grenade button: throw'
      : 'WASD move · Mouse aim · Click fire · Space ability · G grenade · R reload';
    showHint(hint.innerHTML, runIndex === 1 ? 6 : 0);
  }

  /** AI teammates for the default game: the two operators after yours in the roster, with their own names. */
  /** The two AI teammates (heroes.ts squadFor): roster characters from other departments, by their names. */
  const squadmates = () => squadFor(heroId, runIndex);

  // ---- Account and class system (master build) ----
  function newSession(): OnlineSession {
    const s = new OnlineSession(NET_URL!, () => displayName(curProfile()), () => heroId, sessionStorage);
    // Each connection gets a fresh single-use ticket from the site; the game server checks it with the site.
    s.ticketSource = async () => {
      if (!acct.config || (!acct.signedIn && !acct.choice?.demo)) return null;
      const r = await account.fetchTicket({ ...(acct.choice ?? {}), ...(acct.power ? { power: acct.power } : {}) }, displayName(curProfile()));
      acct.ticket = r?.profile ?? null;
      acct.ticketWarning = r?.warning ?? null;
      return r?.ticket ?? null;
    };
    return s;
  }
  /** The superpower to play a multi-power Chog with: a preference, kept on this device. Next connection, like a token. */
  const POWER_KEY = 'chog.power';
  try { acct.power = localStorage.getItem(POWER_KEY); } catch { /* ignore */ }
  function setPower(p: string) {
    acct.power = p;
    try { localStorage.setItem(POWER_KEY, p); } catch { /* ignore */ }
    setChoice(acct.choice);
  }
  /** A new token or demo choice applies from the next connection (a ticket is fixed for its connection). */
  function setChoice(c: { tokenId?: number; demo?: number } | null) {
    acct.choice = c;
    acct.ticketWarning = null;
    if (net && net.state !== 'match' && net.state !== 'reconnecting') { net.close(); net = null; }
    render();
  }
  let accountLoading: Promise<void> | null = null;
  let accountAgain = false;
  /**
   * Reloads the account from the site: the one source of progression. `loaded` runs once the profile is in. A call
   * while a load is running gets one more load after it (that one sees what changed since, e.g. a purchase), and both
   * callers wait for it, so the screen never keeps showing the older account.
   */
  // GP: one page of the open board, with your own rank. A failure keeps what was shown and offers a retry.
  const BOARD_PAGE = 20;
  let boardSeq = 0, boardPicked = false;
  async function loadBoard(draw = true) {
    const seq = ++boardSeq;
    acct.boardLoading = true;
    acct.boardError = false;
    if (draw) render();
    const b = await account.leaderboard(acct.boardTab, acct.boardOffset);
    if (seq !== boardSeq) return;
    acct.boardLoading = false;
    if (!b) acct.boardError = true;
    else { acct.board = b.rows ?? []; acct.boardMe = b.me ?? null; acct.boardTotal = b.total ?? acct.board.length; }
    if (draw) render();
  }

  async function refreshAccount(loaded?: () => void): Promise<void> {
    if (accountLoading) {
      accountAgain = true;
      await accountLoading;
      if (accountLoading) await accountLoading;
      loaded?.();
      return;
    }
    accountLoading = loadAccount(loaded);
    try { await accountLoading; } finally { accountLoading = null; }
    if (accountAgain) { accountAgain = false; await refreshAccount(); }
  }
  async function loadAccount(loaded?: () => void): Promise<void> {
    try {
      acct.config = await account.gameConfig();
      if (!acct.config) return;
      const [p, ids] = await Promise.all([account.loadProfile(), fetchSession()]);
      acct.signedIn = !!p?.signedIn;
      acct.progression = !!p?.progression;
      acct.profile = p?.profile ?? null;
      acct.identities = p?.identities ?? ids.map((i) => ({ provider: i.provider, label: i.label }));
      acct.hasWallet = ids.some((i) => i.provider === 'wallet');
      auth.session = ids;
      loaded?.();
      // A signed-in player plays as their favourite operator unless they picked another one this session.
      if (acct.profile?.favourite && !heroPicked && HEROES.some((x) => x.id === acct.profile!.favourite)) heroId = acct.profile.favourite;
      // The leaderboard is public: loaded whenever the database is on, signed in or not.
      if (acct.config.db) await loadBoard(false);
      // V2: today's challenges (progress when signed in; paid once on the site when done).
      if (acct.config.db) { const d = await account.challenges(); acct.daily = d?.list ?? null; }
      if (acct.hasWallet) {
        const t = await account.loadTokens();
        acct.tokens = t?.tokens ?? [];
        acct.tokensError = t && t.ok === false ? t.error ?? 'chain_unavailable' : t ? null : 'chain_unavailable';
        // Default to the strongest held Chog the first time (the server re-verifies it on every ticket).
        if (!acct.choice && acct.tokens.length) acct.choice = { tokenId: acct.tokens[0].tokenId };
      }
    } finally {
      if (phase === 'title' && titleView !== 'nick' && titleView !== 'howto') render();
    }
  }
  /** V2: ask the site for today's challenges; it pays any newly done one once, and we say so. */
  async function checkDaily() {
    if (!acct.config?.db || !acct.signedIn) return;
    const d = await account.challenges();
    if (!d?.list) return;
    acct.daily = d.list;
    for (const c of d.paidNow ?? []) toast(`DAILY DONE · ${c.text} · +${c.shards} shards`);
    if (d.paidNow?.length) await refreshAccount();
  }
  async function buyUpgrade(id: string) {
    // One purchase at a time (a double tap must never send two; the server also refuses to spend shards twice).
    if (acct.busy) return;
    acct.busy = true; acct.message = ''; render();
    const r = await account.buyUpgrade(id);
    acct.busy = false;
    acct.message = r?.ok ? '' : r?.reason === 'shards' ? 'Not enough shards' : r?.reason === 'maxed' ? 'Maxed' : 'Could not buy, try again';
    acct.justBought = r?.ok ? id : null;
    if (r?.ok) setTimeout(() => { acct.justBought = null; if (phase === 'title' && titleView === 'upgrades') render(); }, 1200);
    await refreshAccount();
  }
  /**
   * Practice power: a labelled DEMO token shows its catalogue tier; otherwise the class the hub shows (the Chog the site
   * verified on Monad, with the account's upgrades), so practice plays like your online operator. It earns nothing.
   */
  function soloPower(): Power {
    const n = Number(identity.tokenId);
    if (identity.kind === 'bound' && tierOfMetadataId(n)) return powerForToken(n, acct.profile?.upgrades ?? null, true, acct.power);
    return classOf(acct).power;
  }

  // ---- Online (RC-8) ----
  /** Queue online. `invite`: the private room code, only from the invite link's own auto-join (never sticks to later
   * queues in this tab, which would make them private and unrewarded). */
  function joinOnline(mode: Mode, invite = '') {
    if (!NET_URL) return;
    onlineMode = mode;
    net ??= newSession();
    const code = invite.toUpperCase().replace(/[^A-Z0-9]/g, '');
    net.joinQueue(mode, code.length >= 4 ? code.slice(0, 8) : undefined);
    render();
  }

  // The online match's world is the session's view world (you are actor 0); the server moves everything in it.
  function beginOnlineWorld() {
    world = net!.world!;
    renderer.reset(world);
    drawnWorld = world;
    fx.markers.length = fx.impacts.length = fx.hitMarks.length = fx.corpses.length = fx.damageArcs.length = fx.pings.length = fx.collects.length = fx.rings.length = fx.noise.length = fx.comms.length = 0;
    matchIntel = createIntel();
    wasDowned = false;
    rep = { sent: false, downs: 0, bled: 0, fireAt: -1, firing: false, delays: [] };
    feed = [];
    fight = createFightRecord();
    deathWhy = [];
    tele = createTelemetry();
    product.started++;
    for (const sp of fx.sparks) sp.age = 1;
    fx.shake = 0;
    fx.threats.length = 0;
    playTime = 0;
    hurtNow = blockedNow = false;
    const me = world.actors[0];
    $('hero').innerHTML = `${esc(me.hero.name)} · <b>Online ${esc(onlineMode)}</b>${net?.match?.demo ? ' · <span class="demo">DEMO</span>' : ''}`;
    $('wname').textContent = me.weapon.name;
    $('abl').innerHTML = `${esc(me.ability.name)}<small class="keyhint">Space</small>`;
    $('pips').innerHTML = world.actors.filter((a) => a.team !== me.team).map(() => '<i></i>').join('');
    lastHud = '';
    const others = (net?.match?.roster ?? []).filter((r) => r.team !== me.team && r.tier !== 'free');
    // Every opponent's power is named up front (owner 2026-10-18: you can learn "this enemy has X-Ray Eyes").
    onlineIntro = `Online ${esc(onlineMode)}: ${MODE_SIZE[onlineMode] / 2} a side, real players. Your side is ringed green.${others.length ? ` Facing: ${others.map((r) => `${esc(r.name)} (${r.tier === 'legendary' ? `1:1, ${esc(r.ability.name)}` : r.sp ? `${esc(r.tier)}, ${esc(SUPERPOWERS[r.sp].name)}` : esc(r.tier)})`).join(', ')}.` : ''}`;
    countShown = 0;
    showHint(onlineIntro, 6);
  }
  // The server's countdown before the first step, shown over the intro hint (nothing moves until it ends).
  let onlineIntro = '', countShown = 0;
  function showCountdown() {
    const k = Math.ceil(net?.startsIn() ?? 0);
    if (k > 0 && k !== countShown) showHint(`<b>Starts in ${k}</b> · ${onlineIntro}`, 6);
    else if (k === 0 && countShown > 0) showHint(`<b>Go</b> · ${onlineIntro}`, 4);
    countShown = k;
  }

  function showOnlineResults() {
    const o = net?.over;
    if (!o) { show('<div class="card"><h2>Match over</h2><div class="btns"><button class="btn" data-go="menu">Hub</button></div></div>'); return; }
    const roster = net?.match?.roster ?? [];
    const rows = o.results.map((x) => {
      const r = roster.find((y) => y.id === x.id);
      return { name: x.name, hero: x.hero, team: x.team, kills: x.kills, damageDealt: x.damageDealt, damageTaken: x.damageTaken, alive: x.alive, cause: x.cause, you: x.id === o.you, tier: r?.tier ?? 'free', demo: !!r?.demo, metadataId: r?.metadataId ?? null };
    });
    // Rewards are settled by the site pulling this match from the game server, once (never from what this page says).
    // The hub's account is reloaded afterwards, so the XP bar, level, shards and upgrades there change at once.
    if (o.settle && o.matchId && lastReward.matchId !== o.matchId) {
      const before = acct.profile ? { xp: acct.profile.xp, shards: acct.profile.shards, rating: acct.profile.rating } : null;
      lastReward = { pending: true, reward: null, note: '', matchId: o.matchId, before };
      settleOnline(o.matchId, true);
    }
    const me = rows.find((x) => x.you);
    const myClass = me && me.metadataId && me.tier === 'legendary' && ONE_OF_ONE[me.metadataId] ? `${ONE_OF_ONE[me.metadataId].name} · 1:1` : `${TIER_DEFS[me?.tier ?? 'free'].label} class`;
    show(onlineResultsHtml({
      mode: o.mode, won: o.winner === null ? null : o.winner === o.team, reason: o.reason, team: o.team, rows, demo: !!net?.match?.demo, signedIn: acct.signedIn, settle: o.settle,
      prog: { before: lastReward.before, reward: lastReward.reward, pending: lastReward.pending, note: lastReward.note, upgradesReady: upgradesReady(acct), upgrades: acct.profile?.upgrades ?? null,
        preview: me ? rewardBreakdown({ won: o.winner !== null && o.winner === o.team, kills: me.kills, damage: me.damageDealt, seconds: Math.round(playTime), leftEarly: false, capped: false, demo: !!net?.match?.demo }, REWARDS) : null },
      myClass, canRequeue: !!NET_URL, follower: !!net?.follower,
    }));
    // A save that failed for a passing reason can be asked for again from here.
    if (settleRetry && !lastReward.pending) overlay.querySelector('.card .btns')?.insertAdjacentHTML('afterbegin', '<button class="btn" data-act="settle-retry" id="settleretry">Retry save</button>');
  }

  // A settle that failed for a passing reason (network, the site or the game server briefly down) is tried once more
  // by itself after a few seconds, can be retried from the results, and is kept in sessionStorage until it is
  // settled, so a reload settles it on the next load (the site settles each match once).
  const PENDING_SETTLE = 'chog-room-zero:pending-settle';
  let settleRetry = false;
  function settleOnline(matchId: string, auto: boolean) {
    try { sessionStorage.setItem(PENDING_SETTLE, matchId); } catch { /* storage blocked */ }
    settleRetry = false;
    lastReward = { ...lastReward, pending: true, note: '' };
    void account.settle(matchId).then(async (r) => {
      if (lastReward.matchId !== matchId) return;
      settleRetry = account.settleRetryable(r);
      if (!settleRetry) { try { sessionStorage.removeItem(PENDING_SETTLE); } catch { /* storage blocked */ } }
      lastReward = { ...lastReward, pending: false, reward: r?.mine ?? null, note: r?.error === 'progression_offline' ? 'Saved progression is offline right now.' : r?.mine ? '' : 'Result not saved to your account.' };
      if (r?.mine && !lastReward.before) lastReward.before = { xp: 0, shards: 0, rating: r.mine.ratingBefore };
      if (settleRetry && auto) setTimeout(() => { if (lastReward.matchId === matchId && settleRetry) { settleOnline(matchId, false); if (phase === 'results' && online) render(); } }, 4000);
      if (r?.mine) void checkDaily();
      await refreshAccount();
      if (phase === 'results' && online) render();
    });
  }

  // Watches the session from the frame loop: refreshes the Online screen, enters a found match, ends a finished one.
  function pollOnline() {
    if (!net) return;
    const now = performance.now();
    // Keep-alive pings run on the session's own timer (client.ts). Debug: the connection log on <body data-netlog>.
    if (__TEST_HOOKS__ && QS.has('debug')) {
      const nl = `${phase} fps${Math.round(hook.fps)} | ${net.log.slice(-14).join(' | ')}`;
      if (document.body.dataset.netlog !== nl && now - lastPing > 500) { lastPing = now; document.body.dataset.netlog = nl; }
    }
    const key = `${net.state}|${net.queue?.have}|${net.message}|${Math.round(net.rtt / 50)}|${JSON.stringify(net.party)}`;
    if (key !== netKey) {
      netKey = key;
      if (phase === 'title' && titleView === 'main') render();
    }
    // A match found from the hub, or a squad leader re-queued while this player looked at any results screen (online
    // or practice): deploy. A new match is a new view world, so the match whose results are showing never re-enters.
    if (net.state === 'match' && net.world && ((phase === 'title' && !online) || (phase === 'results' && net.world !== world))) {
      // A system transition: the summary's fresh-press gate (go) is for the player's own taps, not for this.
      if (phase === 'results') phase = nextPhase(phase, 'menu');
      online = true;
      onlineMode = net.match?.mode ?? onlineMode;
      go('start');
      go('pick');
    }
    if (online && net.over && (phase === 'play' || phase === 'pause')) {
      sendMatchReport(net.over.winner !== null && net.over.winner === player(world).team ? 'won' : 'lost');
      if (phase === 'pause') go('resume');
      go('won');
    }
    // Out of the match with no result: it was cancelled before the start, or the connection could not come back. Back
    // to the hub, where the session's message says what happened (never a frozen match screen).
    if (online && !net.over && (net.state === 'idle' || net.state === 'error' || net.state === 'offline') && (phase === 'play' || phase === 'pause')) {
      sendMatchReport('disconnect');
      online = false;
      if (phase === 'play') go('pause');
      go('quit');
      titleView = 'main';
      render();
    }
  }

  // Match end: the one place a practice run is saved. Signed in: the site stores it on the account and awards medals
  // there. Guest: this session's memory only. Never per frame, never to localStorage.
  function endRun(won: boolean) {
    sendMatchReport(won ? 'won' : 'lost');
    product.completed++;
    if (won) product.won++; else product.died++;
    // The lab room keeps no records anywhere: no progression, no medals (CF lab).
    if (LAB_ON) { lastRun = { newBest: { time: false, kills: false }, earned: [], saved: 'session' }; return; }
    const p = player(world);
    const seconds = Math.round(playTime);
    // GP: revives given and received, loot bags, grenades thrown and AI teammates lost (medals; bounded on the server).
    const alliesLost = world.actors.filter((a) => a !== p && a.team === p.team && !a.alive).length;
    const facts = { hero: heroId, won, seconds, kills: p.kills, bullets: p.bullets, hits: p.hits, damageDealt: Math.round(p.damageDealt), damageTaken: Math.round(p.damageTaken), pickups: runPickups, abilities: runAbilities, hpLeft: Math.max(0, Math.round(p.hp)),
      revives: p.revives, revived: p.revived, loots: p.loots, thrown: p.thrown, alliesLost: Math.min(2, alliesLost) };
    const demo = p.power.demo;
    if (!signedIn()) {
      const r = recordBest(guestStore, facts);
      guestRecords = r.records;
      const m = awardMedals(guestStore, guestRecords, facts);
      guestMedals = m.unlocked;
      // A guest sees what the run would have paid (nothing is kept: progression lives on an account).
      const b = rewardBreakdown({ won, kills: p.kills, damage: p.damageDealt, seconds, leftEarly: false, capped: false, demo }, PRACTICE_REWARDS);
      lastRun = { newBest: r.newBest, earned: m.earned, saved: 'session', reward: { ...b, kept: false, before: null, upgrades: null } };
      return;
    }
    lastRun = { newBest: { time: false, kills: false }, earned: [], saved: 'saving' };
    const t = practiceTicket && practiceTicket.run === runIndex ? practiceTicket : null;
    practiceTicket = null;
    const runId = t?.runId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const before = acct.profile ? { xp: acct.profile.xp, shards: acct.profile.shards } : null;
    const run = runIndex;
    void account.practice({ runId, ticket: t?.ticket, demo, ...facts, seconds: Math.max(1, seconds) }).then(async (r) => {
      // A slow answer for an earlier run never overwrites the results of the run on screen now.
      if (run !== runIndex) { if (r?.reward && (r.reward.xp || r.reward.shards)) await refreshAccount(); return; }
      if (r?.ok && acct.profile) {
        if (r.records) acct.profile.practice = r.records;
        if (r.medals) acct.profile.medals = r.medals;
        // V2: daily challenges this run completed (the site pays each once when asked).
        void checkDaily();
        const rw = r.reward;
        lastRun = { newBest: r.newBest ?? { time: false, kills: false }, earned: MEDALS.filter((m) => r.earned?.includes(m.id)), saved: 'account',
          reward: rw ? { ...rw, kept: true, before, upgrades: acct.profile.upgrades } : null };
        if (rw && (rw.xp || rw.shards)) await refreshAccount();
      } else lastRun = { newBest: { time: false, kills: false }, earned: [], saved: 'failed' };
      if (phase === 'results' && !online) render();
    });
  }

  applySettings();
  // The account is part of loading: the hub opens already showing who you are, your level, shards and Chog.
  boot(3);
  await Promise.race([refreshAccount(() => boot(4)), new Promise((r) => setTimeout(r, 5000))]);
  render();
  bootAt = performance.now();
  void bootDone();
  // CF lab room: straight into a solo room, no hub, with the experiment switches on screen. Each switch reloads.
  if (LAB_ON) {
    const lab = document.createElement('div');
    lab.id = 'lab';
    const keys = Object.entries({ A: 'turn', B: 'steady', C: 'ownNoise', D: 'enemySound', E: 'dark', F: 'pacing' } as const);
    const link = (k: string, on: boolean) => {
      const q = new URLSearchParams(location.search);
      const set = new Map(keys.map(([kk, f]) => [kk, LAB[f]]));
      set.set(k, !on);
      q.set('lab', [...set].map(([kk, v]) => `${kk}${v ? 1 : 0}`).join(','));
      return `?${q.toString()}`;
    };
    lab.innerHTML = `<b>LAB</b>${keys.map(([k, f]) => `<a href="${link(k, LAB[f])}" class="${LAB[f] ? 'on' : ''}" title="${f}">${k}${LAB[f] ? 1 : 0}</a>`).join('')}`;
    document.body.appendChild(lab);
    document.body.dataset.lab = LAB_SET.join(',');
    playMode = 'solo';
    hubPlay();
  }
  // Reload or crash mid online match: this tab still holds its session token, so it quietly asks the server to
  // resume. If the match is still on, the server hands the operator back (pollOnline enters it); if not, nothing shows.
  // Demo invite link (judges, no wallet): ?mockChog=<n>&online=1v1&demo=1[&code=X] joins as that labelled DEMO token,
  // which only ever meets other demo players. The account service is asked first so the ticket can be fetched.
  if (NET_URL && ONLINE_AUTO) {
    titleView = 'main';
    setMode(ONLINE_AUTO);
    const n = Number(identity.tokenId);
    if (QS.get('demo') === '1' && identity.kind === 'bound' && tierOfMetadataId(n)) acct.choice = { demo: n };
    joinOnline(ONLINE_AUTO, ONLINE_CODE);
    // The link has done its job: a reload or a later queue must not join it (or its private code) again.
    try { const u = new URL(location.href); u.searchParams.delete('online'); u.searchParams.delete('code'); history.replaceState(history.state, '', u); } catch { /* no history */ }
  }
  // A result that was not saved before a reload (network, site or game server down) is settled now; the site settles
  // each match once, so asking again never pays twice.
  try {
    const pend = sessionStorage.getItem(PENDING_SETTLE);
    if (pend && acct.signedIn) void account.settle(pend).then(async (r) => { if (!account.settleRetryable(r)) sessionStorage.removeItem(PENDING_SETTLE); if (r?.mine) await refreshAccount(); });
  } catch { /* storage blocked */ }
  // Squad invite link: ?squad=CODE joins that squad from the hub.
  const SQUAD_AUTO = (QS.get('squad') ?? '').toUpperCase();
  if (NET_URL && /^[2-9A-HJ-NP-Z]{5}$/.test(SQUAD_AUTO)) { net ??= newSession(); net.partyOp('join', SQUAD_AUTO); }
  // Hosted checks run in browsers that may render at a few frames per second: in drive mode the scripted player and
  // the snapshot view run on a timer, not the render loop, and the server-reported state goes on <body data-netlog>.
  if (onlineDriver) setInterval(() => {
    if (!net) return;
    if (net.state === 'match' && net.world) { net.update(null); net.sendInput(onlineDriver(net.world), performance.now()); }
    const me = net.world?.actors[0];
    const o = net.over;
    document.body.dataset.netlog = `${phase} fps${Math.round(hook.fps)} state:${net.state} snaps:${net.snapCount} rtt:${Math.round(net.rtt)}`
      + ` me:${me ? `${me.team} ${me.alive ? 'up' : 'down'} hp${Math.round(me.hp)} k${me.kills} @${me.x.toFixed(1)},${me.y.toFixed(1)}` : '-'}`
      + ` over:${o ? `winner=${o.winner} ${o.reason} ${o.results.map((r) => `${r.team}:k${r.kills}:dealt${r.damageDealt}:${r.alive ? 'alive' : r.cause}`).join(',')}` : '-'}`
      + ` | ${net.log.slice(-10).join(' | ')}`;
  }, 50);
  else try {
    if (NET_URL && sessionStorage.getItem('chog-room-zero:net-token')) {
      net = newSession();
      net.connect();
    }
  } catch { /* storage blocked: no resume */ }
  // The auth server is asked only when Settings opens or Google sends the player back: no request on a normal launch.
  window.addEventListener('popstate', () => {
    if (phase === 'title' && titleView !== 'main') { titleView = titleView === 'nick' ? nickReturn : 'main'; confirmReset = false; render(); }
    else if (phase === 'play') go('pause');
    // Back again on the pause card: keep a guard entry, so only the card's own Leave leaves the match.
    if (phase === 'pause') { try { history.pushState({ rz: 1 }, ''); } catch { /* ignore */ } }
  });
  // Leaving the tab pauses the match: the sim must never run while nobody is watching. Online the match goes on, so
  // every control is released at once (SB): the render loop stops with the page and would never send the release.
  const releaseOnline = () => { if (online && net) net.release(player(world).facing); input.releaseAll(); };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseOnline();
    if (document.hidden && phase === 'play') go('pause');
  });
  window.addEventListener('pagehide', releaseOnline);
  // Back from Google by the browser's own Back (page restored from the back-forward cache): the sign-in sheet is
  // usable again, never stuck on "Opening Google".
  window.addEventListener('pageshow', (e) => { if (e.persisted) { auth.busy = false; auth.message = ''; if (phase === 'title') render(); } });
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
  window.addEventListener('focus', () => { focusLost = false; });
  window.addEventListener('blur', () => {
    focusLost = true;
    releaseOnline();
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
  const PICKUP_LABEL: Record<PickupKind, string> = { health: 'HEALTH', armor: 'ARMOUR', ammo: 'AMMO', grenade: 'GRENADE' };
  // What you carried after the last step: a loot bag's take is the difference (the bag's contents are the sim's).
  let kit: { hp: number; armor: number; reserve: number; grenades: number; perk: PerkId | null } = { hp: 0, armor: 0, reserve: 0, grenades: 0, perk: null }, kitBefore = kit;
  function collected(x: number, y: number) {
    const pk = world.pickups.find((q) => q.x === x && q.y === y);
    const p = player(world);
    runPickups++;
    if (!pk) {
      // GP: a loot bag. Say what it gave you, in the order you would look for it.
      const k = kitBefore;
      const got = [p.hp - k.hp >= 1 ? `+${Math.round(p.hp - k.hp)} HEALTH` : '', p.armor - k.armor >= 1 ? `+${Math.round(p.armor - k.armor)} ARMOUR` : '',
        p.reserve > k.reserve ? `+${p.reserve - k.reserve} AMMO` : '', p.grenades > k.grenades ? `+${p.grenades - k.grenades} GRENADE${p.grenades - k.grenades > 1 ? 'S' : ''}` : '',
        p.perk && p.perk !== k.perk ? `PERK ${PERKS[p.perk].name.toUpperCase()}${k.perk ? ` (LEFT ${PERKS[k.perk].name.toUpperCase()})` : ''}` : ''].filter(Boolean);
      toast(got.length ? `LOOT ${got.join(' · ')}` : 'LOOT');
      fx.collects.push({ x: p.x, y: p.y, age: 0, color: TUNING.palette.signal });
      return;
    }
    const P = TUNING.pickups;
    const amount = pk.kind === 'health' ? `+${P.health.amount} ` : pk.kind === 'armor' ? `+${P.armor.amount} ` : pk.kind === 'grenade' ? `+${P.grenade.amount} ` : `+${P.ammo.mags * p.weapon.magazine} `;
    toast(`${amount}${PICKUP_LABEL[pk.kind]}`);
    const pal = TUNING.palette;
    fx.collects.push({ x: p.x, y: p.y, age: 0, color: pk.kind === 'health' ? pal.heal : pk.kind === 'armor' ? pal.armor : pk.kind === 'grenade' ? pal.grenade : pal.ammo });
  }

  // Standing on a pickup you cannot use (full): say so once per contact, so it never reads as "needs another step".
  let fullOn: Pickup | null = null;
  function checkFull() {
    const q = touchingFull(world, player(world));
    if (q && q !== fullOn) toast(`${PICKUP_LABEL[q.kind]} FULL`);
    fullOn = q;
  }

  // Contextual tips (src/ui/tips.ts): what is true this frame.
  let hurtNow = false, blockedNow = false, calledNow = false, sinceHint = 0;
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
    if (!settings.tips || AUTOPLAY_SEED !== null) { hurtNow = blockedNow = calledNow = false; return; }
    const p = player(world);
    const id: TipId | null = nextTip({
      t: playTime, sinceLastHint: sinceHint, hintShowing: hintLeft > 0, wantedPickup: world.tick % 6 === 0 ? wantedPickup() : null,
      ammo: p.ammo, magazine: p.weapon.magazine, reserve: p.reserve, reloading: p.reloadLeft > 0, abilityReady: p.abilityCd === 0,
      hurt: hurtNow, blockedShot: blockedNow, callout: calledNow,
      lostContact: [...matchIntel.contacts.values()].some((c) => c.state === 'last_known' && c.source === 'sight' && c.age > 0.6 && c.age < 3),
    }, shownTips);
    hurtNow = blockedNow = calledNow = false;
    if (!id) return;
    shownTips.add(id);
    saveShownTips(localStorage, shownTips);
    showHint(tipText(id, input.mode === 'touch', p.ability), 5);
    sinceHint = 0;
  }

  // Per-step presentation: sounds feed audio and heard markers, hits feed feedback.
  let wasDowned = false;
  // V2 kill feed (report: "no kill feed"): the last four knock-outs and downs this match, newest first, for 6 s each.
  // Only what the game already tells you (the server sends every knock-out to everyone online, placed only as a spot).
  let feed: FeedLine[] = [], lastFeed = '';
  function feedPush(by: number, target: number, killed: boolean, grenade: boolean) {
    const t = world.actors[target];
    if (t) feed = feedAdd(feed, feedLine(player(world), world.actors[by], t, killed, grenade, playTime));
  }
  // V2 playtest telemetry for this match (src/sim/report.ts): downs, bleed-outs, trigger-to-shot times, sent once.
  let rep = { sent: false, downs: 0, bled: 0, fireAt: -1, firing: false, delays: [] as number[] };
  /** Trigger press seen this frame: the time it went down (the shot that answers it closes the measure). */
  function trackFire(firing: boolean) {
    const p = player(world);
    if (firing && !rep.firing && p.alive && !p.downed && p.ammo > 0 && p.reloadLeft <= 0) rep.fireAt = performance.now();
    rep.firing = firing;
  }
  function anonId(): string {
    try {
      let id = localStorage.getItem('chog-room-zero:anon');
      if (!id || !/^[A-Za-z0-9_-]{16,40}$/.test(id)) {
        const b = crypto.getRandomValues(new Uint8Array(16));
        id = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        localStorage.setItem('chog-room-zero:anon', id);
      }
      return id;
    } catch { return ''; }
  }
  /** The match is over (won, lost, quit, dropped): one anonymous record, if the player shares stats. */
  function sendMatchReport(outcome: ReportOutcome) {
    if (rep.sent || LAB_ON || !settings.shareStats) return;
    rep.sent = true;
    const anon = anonId();
    if (!anon) return;
    const p = player(world);
    const lastHit = fight.hits[fight.hits.length - 1];
    const cause: ReportCause = p.alive ? null : rep.bled ? 'bled' : (online ? !!lastHit && matchIntel.now - lastHit.t < 1.5 : (world.playerKill ?? p.death)?.cause === 'shot') ? 'shot' : 'zone';
    const allies = world.actors.filter((a) => a !== p && a.team === p.team && a.ai);
    const r: MatchReport = {
      v: 1, anon, mode: online ? onlineMode : 'solo', hero: p.hero.id, outcome, seconds: Math.round(playTime), cause,
      killer: cause === 'shot' ? (online ? 'player' : 'bot') : null, noCue: deathWhy.some((i) => i.id === 'blindside'),
      damageTaken: Math.round(p.damageTaken), firstContactS: tele.firstContactS === null ? null : Math.round(tele.firstContactS),
      bullets: p.bullets, hits: p.hits, fireDelayMs: median(rep.delays), kills: p.kills,
      aiKills: allies.reduce((n, a) => n + a.kills, 0), aiRevives: allies.reduce((n, a) => n + a.revives, 0), aiLoots: allies.reduce((n, a) => n + a.loots, 0),
      aiLost: allies.filter((a) => !a.alive).length, revives: p.revives, revived: p.revived, downs: rep.downs, bledOut: rep.bled,
      loots: p.loots, lootExpired: world.lootExpired, zoneDeaths: world.actors.filter((a) => !a.alive && a.death?.cause === 'zone').length,
      perk: p.perk, rttMs: online && net ? Math.round(net.rtt) : null, queueS: online && net ? net.queueS : null,
      device: deviceClass(navigator.userAgent, innerWidth, innerHeight, input.mode === 'touch'),
    };
    void account.sendReport(r);
  }
  function afterStep() {
    const p = player(world);
    const view = p.view;
    // Kit as it was after the last step (a loot take this step is shown as the difference), then today's.
    kitBefore = kit;
    kit = { hp: p.hp, armor: p.armor, reserve: p.reserve, grenades: p.grenades, perk: p.perk };
    for (const s of world.sounds) {
      const own = s.sourceId === 0;
      const dx = s.x - p.x, dy = s.y - p.y;
      const src0 = world.actors[s.sourceId];
      const sigCol = s.sig ? ONE_OF_ONE[s.sig]?.color : undefined;
      if (s.type === 'sonar') fx.pings.push({ x: s.x, y: s.y, age: 0, hostile: !own, r: src0?.ability.radius ?? TUNING.abilities.sonarRadius, color: sigCol });
      if (s.type === 'burst' || s.type === 'scream') fx.rings.push({ x: s.x, y: s.y, age: 0, r: src0?.ability.radius ?? 3, color: sigCol ?? (s.type === 'burst' ? TUNING.palette.hostile : TUNING.palette.armor) });
      // Every other 1:1 signature shows its moment in the Chog's own colour: Halo at its real heal radius, the rest at the body.
      else if (s.sig && sigCol !== undefined && s.type !== 'sonar' && s.type !== 'windup') fx.rings.push({ x: s.x, y: s.y, age: 0, r: s.type === 'mend' && src0?.ability.allies ? src0.ability.radius ?? 1.5 : 1.4, color: sigCol });
      // Grenade blast: the true radius flashes; the screen shakes only when you were inside it (it hurt you or nearly).
      if (s.type === 'boom') {
        fx.rings.push({ x: s.x, y: s.y, age: 0, r: TUNING.grenade.radius, color: s.team === p.team ? TUNING.palette.ammo : TUNING.palette.hostile });
        spark(s.x, s.y, 16, s.team !== p.team);
        if (p.alive && Math.hypot(dx, dy) <= TUNING.grenade.radius + 0.5) fx.shake = TUNING.render.shakeSeconds * 1.6;
      }
      if (s.type === 'downed') toast(s.sourceId === 0 ? 'YOU ARE DOWN · a teammate can revive you' : `${src0?.name ?? 'Someone'} is DOWN`);
      if (s.type === 'revive') toast(s.sourceId === 0 ? 'Revived a teammate' : 'Revived');
      // The one reveal rule (docs/design/bots.md): a muzzle flash with wall line of sight shows the shooter
      // briefly, at any range. Bots get the same signal from the player's flash.
      if (s.type === 'shot' && !own && s.team !== p.team && muzzleFlashSeen(world.level, p.x, p.y, s.x, s.y))
        fx.threats[s.sourceId] = TUNING.perception.flashSeconds;
      // RC-7 run facts (results, medals, tips): own ability uses, pickups, shots stopped by cover.
      if (own && ['dash', 'sonar', 'barrier', 'mend', 'windup', 'scream', 'shield', 'frenzy'].includes(s.type)) runAbilities++;
      if (own && s.type === 'pickup') collected(s.x, s.y);
      if (own && s.type === 'impact' && s.blocked) blockedNow = true;
      if (own && s.type === 'shot') {
        if (rep.fireAt >= 0) { rep.delays.push(performance.now() - rep.fireAt); rep.fireAt = -1; }
        const g = gaitOf(p);
        fight.shots.push({ t: matchIntel.now, gait: g });
        tele.shots[g]++;
        tele.firstShotS ??= +tele.seconds.toFixed(1);
      }
      if (s.type === 'revive' && s.team === p.team) tele.revives++;
      // CF-C: your own noise, drawn out to the radius it is really heard at (steps by speed, reload, abilities).
      if (own && LAB.ownNoise && p.alive && OWN_NOISE.has(s.type)) fx.noise.push({ x: s.x, y: s.y, r: s.radius, age: 0 });
      // Online the server already decided you hear it (an estimate arrives where hearing puts it, not where it was).
      const heard = own || !!s.est || hears(world.level, p.x, p.y, s, wallFactorOf(p));
      if (!heard) continue;
      if (s.type === 'impact' && s.blocked) debugStats.blockedCues++;
      audio.play(s.type === 'impact' && s.blocked ? 'blocked' : s.type, dx, dy, s.radius, !own && (s.est ? s.est === 'wall' : !sightClear(world.level, p.x, p.y, s.x, s.y)), own, s.weapon, s.sig);
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
      ringHint();
      // SB: a sound that says where its maker is becomes (or refreshes) that hostile's contact (senseFor, below). What
      // is left is where something LANDED (an impact, a blast, a death): a mark at that spot, with a clear line only.
      if (locatesSource(s.type) || !sightClear(world.level, p.x, p.y, s.x, s.y)) continue;
      const big = s.type === 'death' || s.type === 'boom';
      const err = Math.hypot(dx, dy) * 0.08;
      const m = clampMarker(world.level, s.x + (Math.random() * 2 - 1) * err, s.y + (Math.random() * 2 - 1) * err, src.x, src.y, walkable);
      fx.markers.push({ x: m.x, y: m.y, age: 0, life: TUNING.sound.markerLife, big, kind: LAB.enemySound ? markKind(s.type) : undefined, ang: Math.atan2(src.vy, src.vx) });
    }
    // SB: AI teammates' call-outs this step: a line above the caller and a squelch from its side (solo only).
    for (const e of world.comms) {
      const from = world.actors[e.from];
      if (!from) continue;
      fx.comms = fx.comms.filter((c) => c.from !== e.from);
      fx.comms.push({ from: e.from, text: commsLine(e, p.x, p.y), age: 0 });
      audio.play('comm', from.x - p.x, from.y - p.y, 40, false, false);
      debugStats.callouts++;
      tele.callouts++;
      calledNow = true;
    }
    // SB contact intel: everything the player now sees, hears or is told, folded into one belief per hostile. Solo it
    // runs once per sim step; online once per snapshot's events (sight and decay then run per frame).
    senseFor(world, p, matchIntel, online ? 0 : TUNING.simStepSeconds);
    trimFight(fight, matchIntel.now);
    if (!online && p.alive) stepTelemetry(tele, gaitOf(p), matchIntel, TUNING.simStepSeconds);
    let confirmed = false;
    for (const h of world.hits) {
      if (h.by === 0) {
        // CF feedback: a tick in your ear for every step a bullet of yours lands (once per step: eight pellets are
        // one tick), a kill sound for the kill. Heard at any range, so a far hit is never in doubt.
        if (h.killed) audio.play('kill', 0, 0, 1, false, true);
        else if (!confirmed) audio.play('confirm', 0, 0, 1, false, true);
        confirmed = true;
        tele.ranges.push(Math.hypot(h.x - p.x, h.y - p.y));
        // An X-Ray beam through a wall tells you it landed, never where (no mark or spark outside your light).
        if (!h.power || pointInPolygon(h.x, h.y, renderer.visPoly())) {
          fx.hitMarks.push({ x: h.x, y: h.y, age: 0, kill: h.killed });
          spark(h.x, h.y, h.killed ? 10 : 4, true);
        }
        if (h.killed) toast(`${world.actors[h.target].name} eliminated`);
        else if (h.downed) toast(`${world.actors[h.target].name} DOWNED · finish or they get revived`);
      }
      if (h.target === 0) {
        hurtNow = true;
        const known = matchIntel.contacts.get(h.by);
        tele.hitsTaken[gaitOf(p)]++;
        tele.firstHitTakenS ??= +tele.seconds.toFixed(1);
        fight.hits.push({ t: matchIntel.now, by: h.by, fromX: h.fromX, fromY: h.fromY, off: offFacing(p.facing, p.x, p.y, h.fromX, h.fromY), gait: gaitOf(p), reloading: p.reloadLeft > 0, grenade: !!h.grenade,
          knew: rung(matchIntel, h.by), knewFor: known && known.state !== 'lost' ? matchIntel.now - known.since : 0 });
        if (settings.vibration && canVibrate) navigator.vibrate(h.killed ? 80 : 25);
        // Shake by how much it hurt (CF): a graze nudges, a shotgun blast shoves. 25 damage = the base shake.
        fx.shake = Math.max(fx.shake, TUNING.render.shakeSeconds * Math.max(0.6, Math.min(1.8, (h.hpDamage + h.armorDamage) / 25)));
        // A shooter outside your sight when it hit you (behind you, or a longer sight than yours online): its distance
        // goes on the arc. Grenades excluded: the arc points at the blast, not the thrower.
        const unseen = !h.grenade && !canSee(world.level, p.x, p.y, p.facing, p.view, h.fromX, h.fromY);
        fx.damageArcs.push({ ang: Math.atan2(h.fromY - p.y, h.fromX - p.x), age: 0, far: unseen ? Math.hypot(h.fromX - p.x, h.fromY - p.y) : 0 });
        // The shooter is shown (ringed) for the reveal window, even outside the lamp cone: solo, bots never fire
        // beyond your sight range; online, the server sends a shooter whose muzzle flash you saw on a clear line. A grenade's
        // source is the blast you saw land (its ring); the thrower behind a wall is not revealed.
        if (!h.grenade) fx.threats[h.by] = TUNING.perception.flashSeconds;
        audio.play('hurt', 0, 0, 1, false, true);
        ($('hurt') as HTMLElement).style.opacity = '1';
        setTimeout(() => (($('hurt') as HTMLElement).style.opacity = '0'), 90);
      }
      if (h.killed) fx.corpses.push({ x: world.actors[h.target].x, y: world.actors[h.target].y, hostile: world.actors[h.target].team !== p.team });
      if (h.killed || h.downed) feedPush(h.by, h.target, h.killed, !!h.grenade);
    }
    // V2: going from downed to out without a killing hit or the zone is the window running out (or the last teammate
    // falling): said plainly, once, so it never reads as a crash or a disconnect.
    if (p.alive && p.downed && !wasDowned) rep.downs++;
    if (wasDowned && !p.alive && !world.hits.some((h) => h.target === 0 && h.killed) && p.death?.cause !== 'zone') {
      const left = world.actors.some((m) => m !== p && m.team === p.team && m.alive && !m.downed);
      rep.bled = 1;
      toast(left ? `BLED OUT · nobody reached you in ${TUNING.revive.bleedSeconds} s` : 'OUT · nobody left standing to revive you');
    }
    wasDowned = p.alive && p.downed;
  }

  let fpsAcc = 0, fpsFrames = 0;
  // SB ?perf: frame times (last 240 frames), load time to the hub, memory, network, and the match telemetry, drawn twice
  // a second in a corner. For playtests on real phones: what the owner reads off the screen, never sent anywhere.
  const PERF_ON = QS.has('perf');
  const frameMs: number[] = [];
  let perfAcc = 0;
  const perfEl = PERF_ON ? Object.assign(document.body.appendChild(document.createElement('pre')), { id: 'perf' }) : null;
  function perfNow() {
    const sorted = [...frameMs].sort((a, b) => a - b);
    const q = (f: number) => sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))].toFixed(1) : 0;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return { fps: +hook.fps.toFixed(0), frameMs50: q(0.5), frameMs95: q(0.95), frameMsMax: q(1), heapMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      bootMs: Math.round(bootAt), dpr: renderer.app.renderer.resolution, rttMs: net ? Math.round(net.rtt) : null, snaps: net?.snapCount ?? null,
      predict: net ? { error: +net.predictor.lastError.toFixed(2), corrections: net.predictor.corrections, snaps: net.predictor.snaps } : null };
  }
  // Test hook for the scripted browser run. Only in dev builds or with ?debug in the URL.
  const hook = { fps: 0 } as { fps: number } & Record<string, unknown>;
  if (import.meta.env.DEV || location.search.includes('debug')) {
    Object.defineProperties(hook, { world: { get: () => world }, phase: { get: () => phase } });
    Object.assign(hook, { renderer, go, setHero: (h: string) => (heroId = h), fx, records: () => curRecords(), identity: () => identity, acct: () => acct, mode: () => playMode, resultsAt: () => resultsAt, autoplay: AUTOPLAY_SEED, hero: () => heroId, stats: debugStats,
      // Debug lab: the bundled sim, so headless checks can run sim sweeps against the exact deployed code.
      lab: { createWorld, stepWorld, IDLE_INPUT, ROOM_ZERO, HEROES, walkable, sightClear, findPath },
      // RC-5 touch-play check: what the scripted autopilot would do now (NOT applied). tools/rc5-touchplay.mjs turns it
      // into real touch gestures, so a full fight runs through the real touch input. Debug builds/?debug only.
      suggest: () => (suggestPilot ??= createAutopilot(Number(QS.get('pilot')) || 7)).next(world),
      // Landscape stage and launch state (tools/rc6-launch.mjs): how the stage sits on the screen, fullscreen, lock.
      stage: () => ({ ...stage(), fullscreen: isFullscreen(), canFs, launch, orientation: screen.orientation?.type ?? null }),
      // RC-7 menus and progression (tools/rc7-menus.mjs): device profile, settings, medals, shown tips, the open view.
      profile: () => curProfile(), settings: () => settings, medals: () => curMedals(), tips: () => [...shownTips],
      view: () => titleView, runFacts: () => ({ pickups: runPickups, abilities: runAbilities }), stick: () => touchStick.radius,
      // SB telemetry (on the device only): this match, the session funnel, frame timing.
      telemetry: () => teleSummary(tele), product: () => ({ ...product }), perf: () => perfNow(),
      resolution: () => renderer.app.renderer.resolution, volume: () => audio.volume,
      // RC-8 online (tools/rc8-online.mjs): the session and whether the shown world is an online match. Test builds only.
      ...(__TEST_HOOKS__ ? { net: () => net, online: () => online } : {}) });
    (window as unknown as { __chog: unknown }).__chog = hook;
  }

  const ringFill = $('ringfill') as unknown as SVGCircleElement;
  const pipsEl = $('pips');
  let lastHud = '';
  let lastZone = '';
  let lastStatus = '', lastDown = '', lastPerk = '';
  let hpGhost = 0, ghostHold = 0, lastGhost = '', abilityWas = 0;
  let zoneTickLeft = 0;

  renderer.app.ticker.add((ticker) => {
    const dt = Math.min(0.1, ticker.deltaMS / 1000);
    frameMs.push(ticker.deltaMS);
    if (frameMs.length > 240) frameMs.shift();
    if (perfEl && (perfAcc += dt) >= 0.5) {
      perfAcc = 0;
      const pf = perfNow(), tm = teleSummary(tele);
      perfEl.textContent = `fps ${pf.fps}  frame ${pf.frameMs50}/${pf.frameMs95}/${pf.frameMsMax} ms  heap ${pf.heapMb ?? '-'} MB  dpr ${pf.dpr}  load ${pf.bootMs} ms`
        + (pf.rttMs !== null ? `\nrtt ${pf.rttMs} ms  snaps ${pf.snaps}  predict err ${pf.predict!.error} u  corr ${pf.predict!.corrections}  snapped ${pf.predict!.snaps}` : '')
        + `\nmatch ${tm.s} s  gait still/creep/run ${tm.gait}  shots ${tm.shotsByGait}  hit-on ${tm.hitsTakenByGait}  range ${tm.fightRange ?? '-'} u`
        + `\nfirst contact ${tm.firstContactS ?? '-'} s  shot ${tm.firstShotS ?? '-'} s  hit ${tm.firstHitTakenS ?? '-'} s  calls ${tm.callouts}  revives ${tm.revives}`
        + `\ninfo ${Object.entries(tm.info as Record<string, number>).map(([k, v]) => `${k} ${v}`).join(' ')}`
        + `\nsession started ${product.started} done ${product.completed} won ${product.won} died ${product.died} quit ${product.quits} again ${product.retries}`;
    }
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
      // Esc closes a sheet or sub-screen of the hub (Back), like its close button.
      else if (phase === 'title' && titleView !== 'main' && overlayInputAllowed(phase, summaryGate)) menuAct('back');
    }

    pollOnline();
    if (simRuns(phase) && online && net) {
      // Online: send controls, show the server's state. Nothing here decides a hit, damage or the result.
      const p = player(world);
      const ps = renderer.toScreen(p.x, p.y);
      const inp = onlineDriver ? onlineDriver(world) : input.read(ps.x, ps.y, renderer.toScreen(p.x + 1, p.y).x - ps.x);
      trackFire(inp.firing);
      net.sendInput(p.alive ? inp : { ...inp, firing: false, moveX: 0, moveY: 0 }, performance.now());
      net.update(p.alive ? inp.aim : null);
      showCountdown();
      for (const ev of net.takeEvents()) { world.sounds = ev.sounds; world.hits = ev.hits; afterStep(); }
      playTime += dt;
      if (!p.alive && !deathWhy.length && fight.hits.length) { deathWhy = explainDeath(); if (deathWhy.length) showHint(esc(deathWhy[0].text), 5); }
      if (!p.alive && hintLeft <= 0) showHint('You are out. Your side plays on; the result comes when it ends.', 4);
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
      const inp = r.steps > 0 ? input.read(ps.x, ps.y, renderer.toScreen(p.x + 1, p.y).x - ps.x) : null;
      if (inp) trackFire(inp.firing);
      for (let i = 0; inp && i < r.steps && world.outcome === 'playing'; i++) {
        stepWorld(world, autopilot ? autopilot.next(world) : inp);
        inp.reload = false;
        inp.ability = false;
        inp.grenade = false;
        // A tap fires exactly once: after the first step, firing follows the real button state.
        if (!input.fireHeld()) inp.firing = false;
        afterStep();
        playTime += TUNING.simStepSeconds;
      }
      if (r.steps > 0 && world.outcome === 'playing') { maybeTip(); checkFull(); }
      if (world.outcome === 'dead') {
        deathWhy = explainDeath();
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
      else if (phase === 'title' && playMode === 'solo') hubPlay();
      else if (phase === 'select') go('pick');
      // Online results have no restart (it would re-enter the finished match): Continue and Again are their buttons.
      else if (phase === 'results' && !online) go('restart');
    }

    for (const m of fx.markers) m.age += dt;
    for (const n of fx.noise) n.age += dt;
    fx.noise = fx.noise.filter((n) => n.age < TUNING.sound.ownNoiseSeconds);
    // Online: sight and decay every frame (snapshot sounds were folded in by afterStep).
    if (online && net && simRuns(phase)) {
      senseFor(world, player(world), matchIntel, dt, [], [], net?.spotted ?? []);
      if (player(world).alive) stepTelemetry(tele, gaitOf(player(world)), matchIntel, dt);
    }
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
    for (const c of fx.comms) c.age += dt;
    fx.comms = fx.comms.filter((c) => c.age < TUNING.comms.chipSeconds);
    for (const c of fx.rings) c.age += dt;
    fx.rings = fx.rings.filter((c) => c.age < RING_SECONDS);
    for (const c of fx.collects) c.age += dt;
    fx.collects = fx.collects.filter((c) => c.age < COLLECT_SECONDS);
    $('toast').style.opacity = toastLeft > 0 ? '1' : '0';

    // The hub draws the live backdrop room (CF); everything else draws the match world.
    const menuOn = phase === 'title' && !online;
    if (menuOn) menuStep(dt);
    const shown = menuOn ? menuWorldNow() : world;
    fx.intel = menuOn ? menuIntel : matchIntel;
    if (shown !== drawnWorld) { renderer.reset(shown); drawnWorld = shown; }
    renderer.draw(shown, fx, input, dt, { recap: phase === 'recap' || (phase === 'results' && world.outcome === 'dead'), marking: identity.marking, showSticks: phase === 'play' && input.mode === 'touch', playing: phase === 'play', debug: DEBUG_OVERLAY && !menuOn, hud: hudRects(), menu: menuOn ? (stage().w < 1000 ? 1.8 : 2) : undefined, beams: online && net ? net.beams : undefined });

    // HUD: only touch the DOM when a value changed.
    const p = player(world);
    const left = world.actors.filter((a) => a.team !== p.team && a.alive).length;
    const cdShare = p.abilityCd / p.ability.cooldown;
    const reloadShare = p.reloadLeft > 0 ? 1 - p.reloadLeft / p.weapon.reloadSeconds : 0;
    const key = `${p.downed ? 'D' : ''}${Math.ceil(p.hp)}|${Math.ceil(p.armor)}|${p.ammo}|${p.reserve}|${left}|${Math.round(cdShare * 60)}|${Math.round(reloadShare * 40)}|${p.grenades}|${p.nadeCd > 0 ? 1 : 0}`;
    if (key !== lastHud) {
      lastHud = key;
      $('hpn').textContent = String(Math.max(0, Math.ceil(p.hp)));
      const hpEl = $('hpfill');
      hpEl.style.width = `${Math.min(100, (p.hp / p.maxHp) * 100)}%`;
      hpEl.classList.toggle('over', p.hp > p.maxHp && !p.downed);
      hpEl.classList.toggle('downed', p.downed);
      hpEl.classList.toggle('low', p.hp / p.maxHp <= TUNING.render.lowHpShare);
      $('arn').textContent = String(Math.ceil(p.armor));
      $('arfill').style.width = `${Math.min(100, (p.armor / p.maxArmor) * 100)}%`;
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
      const nd = $('nade');
      $('naden').textContent = String(p.grenades);
      nd.classList.toggle('empty', p.grenades === 0);
      nd.classList.toggle('cool', p.grenades > 0 && p.nadeCd > 0);
    }
    // GP: timed effects on you and the downed window, in words and seconds (a slow or a crawl is never unexplained).
    {
      // V2: an AI teammate guarding you (src/sim/bots.ts allyGuard) is named under your health.
      const guard = p.alive && !p.downed ? world.actors.find((m) => m.ai && m.team === p.team && m.alive && (world.brains.get(m.id) as Brain | undefined)?.guarding === p.id) : undefined;
      // CHOG superpowers on you, or yours running: what holds you and for how long.
      const st = !p.alive ? ''
        : p.pinLeft > 0 ? `Glued to the wall · ${p.pinLeft.toFixed(1)} s · you can still shoot`
        : p.trapLeft > 0 ? `Caged · ${p.trapLeft.toFixed(1)} s · you can still shoot`
        : p.auraLeft > 0 ? `Aura · untouchable ${p.auraLeft.toFixed(1)} s · press again to drop it`
        : p.slowLeft > 0 ? `Slowed ${Math.round((1 - p.slowMul) * 100)}% · ${p.slowLeft.toFixed(1)} s` : guard ? `${guard.name} covering you` : '';
      if (st !== lastStatus) { lastStatus = st; $('status').textContent = st; }
      feed = feed.filter((f) => playTime - f.t < 6);
      const fh = feed.map((f) => `<li class="${f.mine ? 'mine' : ''}${f.down ? ' down' : ''}">${f.html}</li>`).join('');
      if (fh !== lastFeed) { lastFeed = fh; $('feed').innerHTML = fh; }
      // V2 perk: what you carry, and on a bag holding a different one, how to swap (stand still) and how far along.
      const bag = p.alive && !p.downed && p.perk ? world.loot.find((l) => l.perk && l.perk !== p.perk && Math.hypot(l.x - p.x, l.y - p.y) <= TUNING.pickups.radius) : undefined;
      const pk = !p.alive ? '' : bag?.perk
        ? (p.bagStill > 0 ? `Swapping for ${PERKS[bag.perk].name} · ${Math.min(99, Math.round((p.bagStill / TUNING.perks.swapSeconds) * 100))}%` : `Stand still to swap for ${PERKS[bag.perk].name}`)
        : p.perk ? `Perk · ${PERKS[p.perk].name}` : '';
      if (pk !== lastPerk) { lastPerk = pk; $('perk').textContent = pk; ($('perk') as HTMLElement).title = p.perk ? PERKS[p.perk].text : ''; }
      // You down, or a teammate down next to you (you are the one reviving): one card, one countdown (src/ui/downed.ts).
      const dc = downedCard(world, p, matchIntel);
      let card = '';
      if (dc) {
        card = `${dc.head}|${dc.big}|${dc.why}|${Math.round(dc.share * 100)}|${dc.reviving ? 1 : 0}`;
        if (card !== lastDown) {
          $('downh').textContent = dc.head; $('downt').textContent = dc.big; $('downwhy').textContent = dc.why;
          ($('downbar') as HTMLElement).style.width = `${Math.round(dc.share * 100)}%`;
          ($('downbar') as HTMLElement).style.background = dc.reviving ? 'var(--health)' : 'var(--damage)';
          $('downcard').classList.toggle('save', dc.reviving);
        }
      }
      if (card !== lastDown) { lastDown = card; $('downcard').classList.toggle('on', !!card); }
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
    // CF damage ghost: hold the lost health 0.35 s, then drain it over ~0.5 s.
    if (p.hp >= hpGhost) { hpGhost = p.hp; ghostHold = 0.35; }
    else if ((ghostHold -= dt) <= 0) hpGhost = Math.max(p.hp, hpGhost - p.maxHp * 2 * dt);
    const gw = `${Math.max(0, Math.min(100, (hpGhost / p.maxHp) * 100)).toFixed(1)}%`;
    if (gw !== lastGhost) { lastGhost = gw; ($('hpghost') as HTMLElement).style.width = gw; }
    // CF: the ability coming back off cooldown is heard and the button pulses once.
    if (abilityWas > 0 && p.abilityCd === 0 && p.alive && phase === 'play') { audio.play('ready', 0, 0, 1, false, true); const ab = $('ability'); ab.classList.remove('pulse'); void ab.offsetWidth; ab.classList.add('pulse'); }
    abilityWas = p.abilityCd;
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
