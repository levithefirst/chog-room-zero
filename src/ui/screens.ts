// Menu screens (RC-7) as HTML strings from plain data, so main.ts only routes and every screen reads the same,
// honest sources: device records, medals, the guest profile and settings. No currencies, shop, chests or
// leaderboards: those systems do not exist, so no screen pretends they do.
// Test hooks kept from earlier builds: data-go/data-act/data-hero/data-demo, #idchip, #selchip, #titlepb, #resultpb,
// table.howto, table.stats, the title's h1 (no h2), the results h2.
import { HEROES, heroById, type HeroDef } from '../config/heroes';
import { WEAPONS } from '../config/weapons';
import { TUNING } from '../config/tuning';
import { fmtTime, type Best, type Records } from './records';
import { MEDALS, medalProgress, type MedalDef, type Unlocked } from './medals';
import { displayName, NICK_MAX, STICK_PX, type Profile, type Settings } from './profile';
import { controlsSvg, medalSvg, portraitSvg, RARITY_LABEL, tokenSvg } from './art';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export type ProfileTab = 'player' | 'operators' | 'medals' | 'loadout';

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
}

const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M10.4 2.5h3.2l.5 2.6 1.9.8 2.2-1.5 2.3 2.3-1.5 2.2.8 1.9 2.6.5v3.2l-2.6.5-.8 1.9 1.5 2.2-2.3 2.3-2.2-1.5-1.9.8-.5 2.6h-3.2l-.5-2.6-1.9-.8-2.2 1.5-2.3-2.3 1.5-2.2-.8-1.9-2.6-.5v-3.2l2.6-.5.8-1.9-1.5-2.2 2.3-2.3 2.2 1.5 1.9-.8z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M9 3h6l-1 6 4 4H6l4-4zM12 13v8"/></svg>',
};

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '--');
const careerLine = (b: Best | undefined) => b && b.runs
  ? `${b.runs} run${b.runs === 1 ? '' : 's'} · ${b.wins} clear${b.wins === 1 ? '' : 's'} · best ${fmtTime(b.bestWinSeconds)}`
  : 'Not played yet';

function medalCount(u: Unlocked) {
  return `${Object.keys(u).length}/${MEDALS.length}`;
}

function topbar(title: string, right = '') {
  return `<header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${ICON.back}</button><h2 class="bar-title">${title}</h2><div class="bar-right">${right}</div></header>`;
}

// ---- Main menu ----
export function titleHtml(c: ScreenCtx): string {
  const h = heroById(c.heroId);
  const o = c.records.overall;
  const fav = c.profile.favourite ? HEROES.find((x) => x.id === c.profile.favourite) : null;
  const named = c.profile.nickname !== null;
  return `<div class="screen menu">
<header class="topbar">
  <button class="player-chip" data-act="profile" aria-label="Player card">${tokenSvg(fav ? fav.accent : null, fav?.id)}<span><b>${esc(displayName(c.profile))}</b><small>${named ? `ID ${c.profile.id}` : 'Tap to pick a callsign'}</small></span>${named ? '' : '<i class="new">NEW</i>'}</button>
  <div class="bar-right"><button class="icon-btn" data-act="settings" aria-label="Settings">${ICON.gear}</button></div>
</header>
<div class="menu-body">
  <nav class="menu-nav">
    <button class="navbtn" data-act="profile">Player card</button>
    <button class="navbtn" data-act="medals">Medals <span class="num">${medalCount(c.medals)}</span></button>
    <button class="navbtn" data-act="online">Online <span class="num">1v1 · 3v3 · 5v5</span></button>
    <button class="navbtn" data-act="howto">How to play</button>
    <button class="navbtn" data-act="demo">Chog <span class="demo">DEMO</span></button>
    <button class="navbtn" data-act="settings">Settings</button>
  </nav>
  <div class="showcase">
    <div class="kicker">Chog squad · basement level · lights out</div>
    <h1>CHOG <em>/</em> ROOM ZERO</h1>
    <p class="lede">Five hostiles below. You see only what your lamp touches. Everyone hears everything.</p>
    <button class="op-show" data-go="start" aria-label="Choose operator">${portraitSvg(h, 'm', c.marking)}<span><b>${esc(h.name)}</b><small>${esc(h.role)} · ${esc(WEAPONS[h.weapon].name)} · ${esc(h.ability.name)}</small></span></button>
  </div>
  <div class="menu-act">
    <button class="btn primary play" data-go="start">Play</button>${c.canFs && c.touch ? '<button class="btn small" data-fs>Full screen</button>' : ''}
    <div class="mock" id="idchip">${c.demoChip}</div>
    <p class="pb" id="titlepb">Best clear ${fmtTime(o.bestWinSeconds)} · most kills ${o.mostKills} · ${o.runs} runs <span>· saved on this device only</span></p>
  </div>
</div></div>`;
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
<p>Shown on your player card and results. Saved on this device.</p>
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
  return `<div class="screen select"><header class="topbar"><button class="icon-btn" data-go="quit" aria-label="Back">${ICON.back}</button><h2 class="bar-title">Pick a Chog</h2><div class="bar-right"><div class="mock" id="selchip">${c.demoChip}</div></div></header>
<div class="heroes">${cards}</div>
<footer class="foot"><span class="hint-line">${c.touch ? 'Tap a card, tap again to deploy' : 'Keys 1-4 pick · Enter deploys'}</span><button class="btn" data-go="quit">Back</button><button class="btn primary play" data-go="pick">Deploy</button></footer></div>`;
}

// ---- Player card + tabs ----
function playerCard(c: ScreenCtx): string {
  const fav = c.profile.favourite ? HEROES.find((x) => x.id === c.profile.favourite) ?? null : null;
  const show = fav ?? heroById(c.heroId);
  const pins = [0, 1, 2].map((i) => {
    const m = MEDALS.find((x) => x.id === c.profile.pinned[i]);
    return m && c.medals[m.id] ? `<span class="pin" title="${esc(m.name)}">${medalSvg(m, true)}</span>` : '<span class="pin empty" title="Pin a medal from the Medals tab">+</span>';
  }).join('');
  const linked = c.profile.linked.map((l) => `<span class="linkchip">${l.provider === 'google' ? 'Google' : 'Wallet'} · ${esc(l.label)}</span>`).join('');
  return `<aside class="pcard"><div class="pcard-head">${tokenSvg(fav ? fav.accent : null, fav?.id)}<span><b>${esc(displayName(c.profile))}</b><small>ID ${c.profile.id}</small></span>
<button class="icon-btn small" data-act="nick" aria-label="Edit callsign">${ICON.edit}</button></div>
<div class="pcard-art">${portraitSvg(show, 'p', show.id === c.heroId ? c.marking : null)}<span class="pcard-op">${fav ? 'Favourite' : 'Current'}: ${esc(show.name)}</span></div>
<div class="pins">${pins}</div>${linked ? `<div class="links">${linked}</div>` : '<div class="links"><span class="linkchip dim">Guest · this device</span></div>'}</aside>`;
}

function rows(list: [string, string][]): string {
  return `<table class="kv">${list.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('')}</table>`;
}

function playerTab(c: ScreenCtx): string {
  const o = c.records.overall;
  return `<div class="tabbody"><h3>Career <small>on this device · no global leaderboard</small></h3>
${rows([
    ['Runs', String(o.runs)], ['Rooms cleared', String(o.wins)], ['Clear rate', pct(o.wins, o.runs)],
    ['Best clear', fmtTime(o.bestWinSeconds)], ['Most kills in a run', String(o.mostKills)], ['Hostiles down', String(o.kills)],
    ['Accuracy', pct(o.hits, o.bullets)], ['Damage dealt / taken', `${Math.round(o.damageDealt)} / ${Math.round(o.damageTaken)}`],
    ['Time in the basement', fmtTime(o.seconds)], ['Pickups', String(o.pickups)], ['Abilities used', String(o.abilities)], ['Medals', medalCount(c.medals)],
  ])}</div>`;
}

function operatorsTab(c: ScreenCtx): string {
  const cards = HEROES.map((h, i) => {
    const b = c.records.heroes[h.id];
    const fav = c.profile.favourite === h.id;
    return `<div class="opmini${fav ? ' fav' : ''}">${portraitSvg(h, `o${i}`)}<div><b>${esc(h.name)}</b><small>${esc(h.role)} · ${esc(WEAPONS[h.weapon].name)}</small>
${rows([['Runs', String(b?.runs ?? 0)], ['Clears', String(b?.wins ?? 0)], ['Best', fmtTime(b?.bestWinSeconds ?? null)], ['Hostiles down', String(b?.kills ?? 0)], ['Accuracy', pct(b?.hits ?? 0, b?.bullets ?? 0)]])}
<button class="btn small${fav ? ' on' : ''}" data-fav="${h.id}">${fav ? '★ Favourite' : 'Set favourite'}</button></div></div>`;
  }).join('');
  return `<div class="tabbody"><h3>Operators <small>tap to pin your favourite to the card</small></h3><div class="opgrid">${cards}</div></div>`;
}

function medalCard(m: MedalDef, c: ScreenCtx): string {
  const got = !!c.medals[m.id];
  const prog = medalProgress(m, c.records, c.medals);
  const pinned = c.profile.pinned.includes(m.id);
  return `<button class="medal${got ? ' got' : ''}${pinned ? ' pinned' : ''}" ${got ? `data-pin="${m.id}"` : 'disabled'} aria-label="${esc(m.name)}${got ? ', earned' : ', locked'}">
${medalSvg(m, got)}<span class="rar ${m.rarity}">${RARITY_LABEL[m.rarity]}</span><b>${esc(m.name)}</b><small>${esc(m.text)}</small>
<span class="prog"><i style="width:${Math.round((prog / m.goal) * 100)}%"></i><em>${got ? (pinned ? 'Pinned' : 'Earned') : `${prog}/${m.goal}`}</em></span></button>`;
}

function medalsTab(c: ScreenCtx): string {
  const sorted = [...MEDALS].sort((a, b) => Number(!!c.medals[b.id]) - Number(!!c.medals[a.id]));
  return `<div class="tabbody"><h3>Medals <span class="num">${medalCount(c.medals)}</span> <small>tap an earned medal to pin it (3 max)</small></h3>
<div class="medals">${sorted.map((m) => medalCard(m, c)).join('')}</div></div>`;
}

function loadoutTab(c: ScreenCtx): string {
  const h = heroById(c.heroId);
  const w = WEAPONS[h.weapon];
  const P = TUNING.pickups;
  return `<div class="tabbody"><h3>Loadout · ${esc(h.name)} <small>every operator plays exactly as listed: no upgrades, no gear</small></h3>
<div class="loadout">${rows([
    ['Weapon', esc(w.name)], ['Damage', w.pellets > 1 ? `${w.damage} x ${w.pellets} pellets` : String(w.damage)],
    ['Fire rate', `${Math.round(60 / w.fireInterval)} / min`], ['Magazine / reserve', `${w.magazine} / ${w.reserve}`], ['Reload', `${w.reloadSeconds} s`],
    ['Through crates', w.piercesCover ? 'Yes' : 'No'], ['Full damage to', `${w.falloffStart} m`],
  ])}
${rows([
    ['Ability', `${esc(h.ability.name)} · ${h.ability.cooldown} s`], ['', esc(h.ability.text)], ['Health / armour', `${h.maxHp} / ${h.maxArmor}`],
    ['Sight', `${h.vision.range} m, ${h.vision.coneDeg}°`],
    ['Pickups', `Health +${P.health.amount} · Armour +${P.armor.amount} · Ammo ${P.ammo.mags} mags`],
  ])}</div><p class="note">Change the operator on the Play screen.</p></div>`;
}

export function profileHtml(c: ScreenCtx, tab: ProfileTab): string {
  const tabs: [ProfileTab, string][] = [['player', 'Player'], ['operators', 'Operators'], ['medals', 'Medals'], ['loadout', 'Loadout']];
  const body = tab === 'operators' ? operatorsTab(c) : tab === 'medals' ? medalsTab(c) : tab === 'loadout' ? loadoutTab(c) : playerTab(c);
  return `<div class="screen profile">${topbar('Player card')}
<nav class="tabs" role="tablist">${tabs.map(([id, label]) => `<button class="tab${id === tab ? ' on' : ''}" role="tab" aria-selected="${id === tab}" data-tab="${id}">${label}</button>`).join('')}</nav>
<div class="prof-body">${playerCard(c)}${body}</div></div>`;
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
  if (a.config === false) return `${signedIn}<p class="note">Sign-in is not available at this address (no auth server). You play as a guest; progress stays on this device.</p>`;
  const google = a.config.google
    ? '<button class="btn signin" data-act="signin-google">Sign in with Google</button>'
    : '<button class="btn signin" disabled>Google sign-in: not set up yet</button>';
  let wallet: string;
  if (!a.config.wallet) wallet = '<button class="btn signin" disabled>Wallet sign-in: not set up yet</button>';
  else if (!a.wallets.length) wallet = '<p class="note">No wallet found in this browser. Open the game in MetaMask, Rabby or Zerion, or install the extension.</p>';
  else wallet = a.wallets.map((w) => `<button class="btn signin" data-wallet="${esc(w.id)}">Sign in with ${esc(w.name)}</button>`).join('');
  return `${signedIn}<div class="signins">${google}${wallet}</div>${a.message ? `<p class="note${a.busy ? '' : ' warn'}" id="authmsg">${esc(a.message)}</p>` : ''}
<p class="note">Signing in proves who you are and links that identity to this device's player card. Progress is still saved on this device only (no cloud save yet). It never checks Chog ownership.</p>`;
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
<div class="row2"><span>Profile ID</span><b class="num" id="profid">${c.profile.id}</b></div>
${accountRows(c)}</section>
<section><h3>Data</h3>
<div class="row2"><span>Progress on this device</span>${confirmReset
    ? '<span class="confirm"><button class="btn small danger" data-act="reset-yes">Erase everything</button><button class="btn small" data-act="reset-no">Keep</button></span>'
    : '<button class="btn small" data-act="reset">Reset progress</button>'}</div>
<p class="note">Erases records, medals, player card and demo history on this device. Settings stay.</p></section>
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
  history: string;
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
<div class="res-side">${medals}<p class="pb" id="resultpb">${esc(r.hero.name)} best clear ${fmtTime(hb?.bestWinSeconds ?? null)}${nb?.time ? ' <b>NEW</b>' : ''} · most kills ${hb?.mostKills ?? 0}${nb?.kills ? ' <b>NEW</b>' : ''} · overall best ${fmtTime(c.records.overall.bestWinSeconds)} <span>· saved on this device only · personal records, not a global leaderboard</span></p>${r.history}</div></div>
<div class="btns"><button class="btn primary" data-go="restart">Again</button><button class="btn" data-go="quit">Change Chog</button><button class="btn" data-go="menu">Menu</button></div></div>`;
}

// ---- Online (RC-8) ----
export interface OnlineView {
  /** Null when this build has no game server address (not deployed): the screen says so and offers nothing fake. */
  url: string | null;
  state: string;
  message: string;
  queue: { mode: string; have: number; need: number; code: string | null } | null;
  rtt: number;
}

const MODE_TEXT: Record<string, string> = { '1v1': 'One against one', '3v3': 'Three a side', '5v5': 'Five a side' };

export function onlineHtml(c: ScreenCtx, v: OnlineView): string {
  const h = heroById(c.heroId);
  if (!v.url) {
    return `<div class="screen online">${topbar('Online')}<div class="online-body"><section class="online-card">
<h3>Online play is not switched on in this build</h3>
<p class="note">Online matches need the Room Zero game server running somewhere that keeps a connection open. It is
built and tested, but not deployed: hosting it is the owner's decision (free and paid options in the project notes).</p>
<p class="note">Everything else works without it: play solo against bots from the menu.</p>
<div class="btns"><button class="btn primary" data-go="start">Play solo</button></div></section></div></div>`;
  }
  const busy = v.state === 'queued' || v.state === 'connecting';
  const modes = (['1v1', '3v3', '5v5'] as const).map((m) => `<button class="btn mode${v.queue?.mode === m ? ' on' : ''}" data-online="${m}"${busy ? ' disabled' : ''}><b>${m}</b><small>${MODE_TEXT[m]}</small></button>`).join('');
  const status = v.state === 'queued' && v.queue
    ? `<p class="status num">Finding a ${esc(v.queue.mode)} match: ${v.queue.have} / ${v.queue.need} players${v.queue.code ? ` · code ${esc(v.queue.code)}` : ''}</p><div class="loadbar"><i></i></div>
<div class="btns"><button class="btn" data-act="online-cancel">Cancel</button></div>`
    : v.state === 'connecting' ? '<p class="status">Connecting to the game server...</p><div class="loadbar"><i></i></div>'
    : v.state === 'match' ? '<p class="status good">Match found. Deploying...</p>' : '';
  return `<div class="screen online">${topbar('Online', `<span class="linkchip">${esc(displayName(c.profile))} · ${esc(h.name)}</span>`)}
<div class="online-body"><section class="online-card">
<div class="kicker">Real players only · no bots online · the server decides every hit</div>
<div class="modes">${modes}</div>
<label class="row2 code"><span>Private code <small>(optional: friends with the same code play together)</small></span>
<input id="roomcode" class="field small" maxlength="8" placeholder="e.g. CHOG7" autocomplete="off" spellcheck="false"${busy ? ' disabled' : ''} /></label>
${status}${v.message ? `<p class="note warn">${esc(v.message)}</p>` : ''}
<p class="note">You play ${esc(h.name)}; change operator from Play. Teams are split evenly, west against east, with the
same rules, danger zone and pickups as solo. Guest play: no account needed${v.rtt ? ` · ping ${Math.round(v.rtt)} ms` : ''}.</p>
</section></div></div>`;
}

export interface OnlineResult { name: string; hero: string; team: string; kills: number; damageDealt: number; damageTaken: number; alive: boolean; cause: string | null; you: boolean }

export function onlineResultsHtml(r: { mode: string; won: boolean | null; reason: string; team: string; rows: OnlineResult[] }): string {
  const title = r.won === null ? 'Draw' : r.won ? 'Victory' : 'Defeat';
  const why = r.reason === 'time' ? 'Time ran out: the side with more health standing takes it.' : r.won === null ? 'Nobody was left standing.' : r.won ? 'The other side is down.' : 'Your side is down.';
  const row = (x: OnlineResult) => `<tr class="${x.you ? 'me' : ''}"><td>${esc(x.name)}${x.you ? ' (you)' : ''}</td><td>${esc(heroById(x.hero).name)}</td><td class="num">${x.kills}</td><td class="num">${x.damageDealt}</td><td class="num">${x.damageTaken}</td><td>${x.alive ? 'standing' : x.cause === 'zone' ? 'zone' : x.cause === 'left' ? 'left' : 'down'}</td></tr>`;
  const side = (team: string, label: string) => `<h3>${label}</h3><table class="kv online-res"><tr><th>Player</th><th>Operator</th><th>Kills</th><th>Dealt</th><th>Taken</th><th></th></tr>${r.rows.filter((x) => x.team === team).map(row).join('')}</table>`;
  const other = r.team === 'alpha' ? 'bravo' : 'alpha';
  return `<div class="card results"><div class="kicker">Online ${esc(r.mode)} · real players</div><h2 class="${r.won === null ? '' : r.won ? 'good' : 'bad'}">${title}</h2><p>${why}</p>
<div class="res-grid"><div>${side(r.team, 'Your side')}</div><div>${side(other, 'Other side')}</div></div>
<p class="pb">Online matches are not saved to your solo records or medals.</p>
<div class="btns"><button class="btn primary" data-act="online-again">Play ${esc(r.mode)} again</button><button class="btn" data-go="menu">Menu</button></div></div>`;
}
