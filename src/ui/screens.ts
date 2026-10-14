// Menu screens (RC-7, master integration pass) as HTML strings from plain data, so main.ts only routes. Progression
// (records, medals, callsign, favourite, pins) comes from the signed-in account (src/net/account.ts); a guest's lives
// for the session only. The hub itself is src/ui/hub.ts. Nothing is sold; no chests.
// Test hooks kept from earlier builds: data-go/data-act/data-hero/data-demo, #selchip, #resultpb, table.howto,
// table.stats, the results h2.
import { HEROES, type HeroDef } from '../config/heroes';
import { WEAPONS } from '../config/weapons';
import { fmtTime, type Best, type Records } from './records';
import { medalProgress, type MedalDef, type Unlocked } from './medals';
import { displayName, NICK_MAX, STICK_PX, type Profile, type Settings } from './profile';
import { controlsSvg, medalSvg, portraitSvg, RARITY_LABEL } from './art';
import type { AcctView } from './account';
import type { NetProfile } from '../net/protocol';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface AuthView {
  /** null while asking the server; false when there is no auth server at this address. */
  config: { google: boolean; wallet: boolean } | null | false;
  /** Signed-in identities from the server session. */
  session: { provider: 'google' | 'wallet'; subject: string; label: string }[];
  wallets: { name: string; id: string }[];
  busy: boolean;
  message: string;
}

export interface ScreenCtx {
  touch: boolean;
  profile: Profile;
  settings: Settings;
  records: Records;
  medals: Unlocked;
  heroId: string;
  demoChip: string;
  marking: number | null;
  muted: boolean;
  canFs: boolean;
  canVibrate: boolean;
  build: string;
  auth: AuthView;
  acct: AcctView;
  /** What the game server made of this connection (null when not connected). */
  netProfile: NetProfile | null;
  /** The DEMO token number chosen on the DEMO screen, if any. */
  demoToken: string | null;
}

const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M10.4 2.5h3.2l.5 2.6 1.9.8 2.2-1.5 2.3 2.3-1.5 2.2.8 1.9 2.6.5v3.2l-2.6.5-.8 1.9 1.5 2.2-2.3 2.3-2.2-1.5-1.9.8-.5 2.6h-3.2l-.5-2.6-1.9-.8-2.2 1.5-2.3-2.3 1.5-2.2-.8-1.9-2.6-.5v-3.2l2.6-.5.8-1.9-1.5-2.2 2.3-2.3 2.2 1.5 1.9-.8z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8"/></svg>',
};

const careerLine = (b: Best | undefined) => b && b.runs
  ? `${b.runs} run${b.runs === 1 ? '' : 's'} · ${b.wins} clear${b.wins === 1 ? '' : 's'} · best ${fmtTime(b.bestWinSeconds)}`
  : 'Not played yet';

function topbar(title: string, right = '') {
  return `<header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${ICON.back}</button><h2 class="bar-title">${title}</h2><div class="bar-right">${right}</div></header>`;
}

// ---- How to play (first launch; replayable from the menu and Settings) ----
export function howtoHtml(c: ScreenCtx): string {
  const t = c.touch;
  return `<div class="card howto-card"><div class="kicker">How to play</div><h2>Clear Room Zero</h2>
<div class="howto-grid">${controlsSvg(t)}
<table class="howto">
<tr><td>Move</td><td>${t ? 'Left thumb' : 'WASD'}</td></tr>
<tr><td>Aim / shoot</td><td>${t ? 'Right thumb; push past the ring to fire' : 'Mouse; hold left click'}</td></tr>
<tr><td>Creep (quiet)</td><td>${t ? 'Half push on the left stick' : 'Hold Shift'}</td></tr>
<tr><td>Ability</td><td>${t ? 'Ability button' : 'Space'} · reload ${t ? 'button' : 'R'}</td></tr>
<tr><td>Pale rings</td><td>A noise you heard, not saw. Running is loud; enemies hear you too.</td></tr>
<tr><td>Win</td><td>Down all five hostiles. Bots only shoot from inside your sight range.</td></tr></table></div>
<div class="btns"><button class="btn primary" data-act="howto-close">Got it</button></div></div>`;
}

// ---- Callsign ----
export function nickHtml(c: ScreenCtx, error: string, saved: boolean): string {
  return `<div class="card dialog"><div class="kicker">Player card</div><h2>Your callsign</h2>
<p>${c.acct.signedIn ? 'Shown in matches, on your career and on the leaderboard. Saved to your account.' : 'Guest: used for this session only. Sign in to keep a callsign on your account.'}</p>
<form data-form="nick" autocomplete="off"><input id="nickin" class="field" maxlength="${NICK_MAX}" spellcheck="false" autocapitalize="off" value="${esc(c.profile.nickname ?? '')}" placeholder="${esc(displayName(c.profile))}" aria-label="Callsign" />
<p class="err" id="nickerr" role="alert">${esc(error)}</p>${saved ? '<p class="ok" id="nickok">Saved.</p>' : ''}
<div class="btns"><button type="button" class="btn" data-act="back">Cancel</button><button type="submit" class="btn primary" data-act="nick-save">Apply</button></div></form></div>`;
}

// ---- Operator select ----
function statBar(label: string, v: number) {
  return `<div class="stat">${label}<s style="--v:${Math.round(Math.max(0.08, Math.min(1, v)) * 100)}%"></s></div>`;
}

export function selectHtml(c: ScreenCtx): string {
  const cards = HEROES.map((h, i) => {
    const w = WEAPONS[h.weapon];
    const dps = (w.damage * w.pellets) / w.fireInterval;
    const fav = c.profile.favourite === h.id;
    return `<button class="hero${h.id === c.heroId ? ' sel' : ''}" data-hero="${h.id}" style="--accent:#${h.accent.toString(16).padStart(6, '0')}">
<div class="hero-art">${portraitSvg(h, `s${i}`, h.id === c.heroId ? c.marking : null)}${fav ? '<i class="fav" title="Favourite">★</i>' : ''}</div>
<div class="role">${i + 1} · ${esc(h.role)}</div><b><i></i>${esc(h.name)}</b><p>${esc(h.blurb)}</p>
${statBar('Health', h.maxHp / 120)}${statBar('Armour', h.maxArmor / 50)}${statBar('Speed', (h.speed - 0.8) / 0.32)}${statBar('Sight', h.vision.range / 12)}${statBar('Punch', dps / 170)}
<div class="wp">${esc(w.name)}</div><div class="ab">${esc(h.ability.name)} <span>· ${esc(h.ability.text)}</span></div>
<div class="career">${careerLine(c.records.heroes[h.id])}</div></button>`;
  }).join('');
  return `<div class="screen select"><header class="topbar"><button class="icon-btn" data-go="quit" aria-label="Back">${ICON.back}</button><h2 class="bar-title">Pick an operator</h2><div class="bar-right"><div class="mock" id="selchip">${c.demoChip}</div></div></header>
<div class="heroes">${cards}</div>
<footer class="foot"><span class="hint-line">${c.touch ? 'Tap a card to pick it' : 'Keys 1-4 pick · Enter starts practice'}</span><button class="btn" data-go="pick">Practice now</button><button class="btn primary play" data-go="quit">Done</button></footer></div>`;
}

// ---- Medal card (Medals screen) ----
export function medalCard(m: MedalDef, c: ScreenCtx): string {
  const got = !!c.medals[m.id];
  const prog = medalProgress(m, c.records, c.medals);
  const pinned = c.profile.pinned.includes(m.id);
  return `<button class="medal${got ? ' got' : ''}${pinned ? ' pinned' : ''}" ${got ? `data-pin="${m.id}"` : 'disabled'} aria-label="${esc(m.name)}${got ? ', earned' : ', locked'}">
${medalSvg(m, got)}<span class="rar ${m.rarity}">${RARITY_LABEL[m.rarity]}</span><b>${esc(m.name)}</b><small>${esc(m.text)}</small>
<span class="prog"><i style="width:${Math.round((prog / m.goal) * 100)}%"></i><em>${got ? (pinned ? 'Pinned' : 'Earned') : `${prog}/${m.goal}`}</em></span></button>`;
}

// ---- Settings ----
function seg<T extends string>(name: string, value: T, opts: [T, string][]): string {
  return `<div class="seg" role="radiogroup">${opts.map(([v, l]) => `<button class="${v === value ? 'on' : ''}" role="radio" aria-checked="${v === value}" data-set="${name}" data-val="${v}">${l}</button>`).join('')}</div>`;
}
function toggle(name: string, on: boolean, disabled = false): string {
  return `<button class="toggle${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-set="${name}" data-val="${on ? 'off' : 'on'}"${disabled ? ' disabled' : ''}><i></i>${on ? 'On' : 'Off'}</button>`;
}

function accountRows(c: ScreenCtx): string {
  const a = c.auth;
  if (a.config === null) return '<p class="note">Checking sign-in options…</p>';
  const signedIn = a.session.length ? `<p class="note">Signed in: ${a.session.map((s) => `<span class="linkchip">${s.provider === 'google' ? 'Google' : 'Wallet'} · ${esc(s.label)}</span>`).join(' ')} <button class="btn small" data-act="signout">Sign out</button></p>` : '';
  if (a.config === false) return `${signedIn}<p class="note">Sign-in is not available at this address (no auth server). You play as a guest: nothing is saved.</p>`;
  const google = a.config.google
    ? '<button class="btn signin" data-act="signin-google">Sign in with Google</button>'
    : '<button class="btn signin" disabled>Google sign-in: not set up yet</button>';
  let wallet: string;
  if (!a.config.wallet) wallet = '<button class="btn signin" disabled>Wallet sign-in: not set up yet</button>';
  else if (!a.wallets.length) wallet = '<p class="note">No wallet found in this browser. Open the game in MetaMask, Rabby or Zerion, or install the extension.</p>';
  else wallet = a.wallets.map((w) => `<button class="btn signin" data-wallet="${esc(w.id)}">Sign in with ${esc(w.name)}</button>`).join('');
  return `${signedIn}<div class="signins">${google}${wallet}</div>${a.message ? `<p class="note${a.busy ? '' : ' warn'}" id="authmsg">${esc(a.message)}</p>` : ''}
<p class="note">Your progress is saved to your account on the server: callsign, XP, level, shards, upgrades, rating, career and medals. Sign in on any device with the same Google account or wallet to pick it up. Signing in with a wallet as well links it to the same account and lets the server check, on Monad, which Chog Genesis tokens it holds. Signing is free and sends no transaction.</p>`;
}

export function settingsHtml(c: ScreenCtx, confirmReset: boolean): string {
  const s = c.settings;
  const vol = Math.round(s.volume * 100);
  return `<div class="screen settings">${topbar('Settings')}
<div class="set-body">
<section><h3>Sound</h3>
<div class="row2"><span>Volume</span><div class="stepper"><button class="icon-btn small" data-set="volume" data-val="down" aria-label="Volume down">−</button><span class="meter"><i style="width:${vol}%"></i></span><b class="num">${vol}%</b><button class="icon-btn small" data-set="volume" data-val="up" aria-label="Volume up">+</button></div></div>
<div class="row2"><span>Sound</span>${toggle('sound', !c.muted)}</div>
<p class="note">No music: every sound in Room Zero is a game cue.</p></section>
<section><h3>Controls</h3>
<div class="row2"><span>Touch stick size</span>${seg('stick', s.stick, [['small', `S · ${STICK_PX.small}`], ['medium', `M · ${STICK_PX.medium}`], ['large', `L · ${STICK_PX.large}`]])}</div>
<div class="row2"><span>Vibration</span>${toggle('vibration', s.vibration && c.canVibrate, !c.canVibrate)}</div>
${c.canVibrate ? '<p class="note">A short buzz when you are hit.</p>' : '<p class="note">This browser has no vibration API (iPhone Safari and most desktops).</p>'}
<div class="row2"><span>Tips</span>${toggle('tips', s.tips)}</div>
<div class="row2"><span>Tutorial</span><button class="btn small" data-act="replay">Replay tutorial</button></div></section>
<section><h3>Display</h3>
<div class="row2"><span>Graphics quality</span>${seg('quality', s.quality, [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])}</div>
<p class="note">Sharpness of the arena: Low 1x, Medium 1.5x, High 2x device pixels (capped by your screen). Low is fastest.</p>
${c.canFs && c.touch ? '<div class="row2"><span>Full screen</span><button class="btn small" data-fs>Full screen</button></div>' : ''}</section>
<section><h3>Account</h3>
<div class="row2"><span>${c.acct.signedIn ? 'Account ID' : 'Guest ID (this session)'}</span><b class="num" id="profid">${esc(c.profile.id)}</b></div>
${accountRows(c)}</section>
<section><h3>This device</h3>
<div class="row2"><span>Preferences</span>${confirmReset
    ? '<span class="confirm"><button class="btn small danger" data-act="reset-yes">Clear</button><button class="btn small" data-act="reset-no">Keep</button></span>'
    : '<button class="btn small" data-act="reset">Clear preferences</button>'}</div>
<p class="note">This browser only keeps preferences: sound, controls, graphics, tips, the tutorial and the last operator. Clearing them never touches your account.</p></section>
<section><h3>About</h3><p class="note">Chog: Room Zero, an original game for the Chogathon. Build <span class="num" id="buildsha">${esc(c.build)}</span>. Chog DEMO traits are a demo: no wallet ownership is checked.</p></section>
</div></div>`;
}

// ---- Results ----
export interface RunReport {
  won: boolean;
  hero: HeroDef;
  weaponName: string;
  why: string;
  time: number;
  kills: number;
  bots: number;
  left: number;
  hits: number;
  bullets: number;
  dealt: number;
  taken: number;
  pickups: number;
  abilities: number;
  newBest: { time: boolean; kills: boolean } | null;
  earned: MedalDef[];
  demoRow: string;
  /** Where the run was saved: account (signed in), session (guest), or still saving. */
  saved: 'account' | 'session' | 'saving' | 'failed';
}

export function resultsHtml(c: ScreenCtx, r: RunReport): string {
  const hb = c.records.heroes[r.hero.id];
  const acc = r.bullets ? Math.round((r.hits / r.bullets) * 100) : 0;
  const nb = r.newBest;
  const medals = r.earned.length
    ? `<div class="earned"><h3>Medal${r.earned.length > 1 ? 's' : ''} earned</h3>${r.earned.map((m) => `<div class="earned-m">${medalSvg(m, true)}<span><b>${esc(m.name)}</b><small>${esc(m.text)}</small></span></div>`).join('')}</div>`
    : '';
  return `<div class="card results"><div class="kicker">${esc(r.hero.name)} · ${esc(r.weaponName)}</div><h2 class="${r.won ? 'good' : 'bad'}">${r.won ? 'Room cleared' : 'Run over'}</h2>${r.why}
<div class="res-grid"><table class="stats"><tr><td>Chog</td><td>${esc(r.hero.name)}${r.demoRow}</td></tr>
<tr><td>Time</td><td>${fmtTime(Math.round(r.time))}</td></tr>
<tr><td>Rooms cleared</td><td>${r.won ? '1' : '0'} / 1</td></tr>
<tr><td>Hostiles down</td><td>${r.kills} / ${r.bots}${r.won ? '' : ` (${r.left} left)`}</td></tr>
<tr><td>Hits / bullets</td><td>${r.hits} / ${r.bullets} · ${acc}%</td></tr>
<tr><td>Damage dealt / taken</td><td>${Math.round(r.dealt)} / ${Math.round(r.taken)}</td></tr>
<tr><td>Pickups · abilities</td><td>${r.pickups} · ${r.abilities}</td></tr></table>
<div class="res-side">${medals}<p class="pb" id="resultpb">${esc(r.hero.name)} best clear ${fmtTime(hb?.bestWinSeconds ?? null)}${nb?.time ? ' <b>NEW</b>' : ''} · most kills ${hb?.mostKills ?? 0}${nb?.kills ? ' <b>NEW</b>' : ''} · overall best ${fmtTime(c.records.overall.bestWinSeconds)}</p>
<p class="note" id="savedwhere">${r.saved === 'account' ? 'Practice run saved to your account (career and medals). Practice never pays XP or shards: play online for those.' : r.saved === 'saving' ? 'Saving to your account…' : r.saved === 'failed' ? 'Could not save this run to your account.' : 'Guest: this run counts for this session only. Sign in to keep your career and medals.'}</p></div></div>
<div class="btns"><button class="btn primary" data-go="restart">Again</button><button class="btn" data-go="menu">Hub</button></div></div>`;
}

