// The hub (master integration pass, owner 2026-10-14): the screen the game lives in between matches. Everything a
// player owns or can do is on it, not buried in tabs: who you are (callsign, account, level, XP), what you have
// (shards, upgrades, your Chog and its class), PLAY with the mode, the leaderboard, your squad, career and medals.
// Plain HTML from plain data, like every other screen; every number comes from the account service, the game server
// or the config files, never from the browser's own guess.
import { HEROES, heroById } from '../config/heroes';
import { WEAPONS } from '../config/weapons';
import { REWARDS, levelOf } from '../config/progression';
import {
  CAPS, ONE_OF_ONE, TIER_DEFS, UPGRADES, UPGRADE_IDS, chogName, powerFor, signatureFor, tierOfMetadataId, type Power, type Tier, type Upgrades,
} from '../config/power';
import type { BoardRow, Reward } from '../net/account';
import type { PartyMember } from '../net/protocol';
import { MEDALS } from './medals';
import { fmtTime } from './records';
import { medalSvg, portraitSvg, tokenSvg } from './art';
import { displayName } from './profile';
import { TICKET_WARN, tierBadge, type AcctView } from './account';
import { esc, type ScreenCtx } from './screens';

export type PlayMode = 'solo' | '1v1' | '3v3' | '5v5';

export interface NetView {
  /** Null when this build has no game server address. */
  url: string | null;
  state: string;
  message: string;
  queue: { mode: string; have: number; need: number; code: string | null } | null;
  rtt: number;
  party: { code: string; members: PartyMember[] } | null;
  /** In a squad and not its leader: the leader starts every match. */
  follower: boolean;
}

export interface HubCtx extends ScreenCtx {
  mode: PlayMode;
  net: NetView;
}

const ICON = {
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M10.4 2.5h3.2l.5 2.6 1.9.8 2.2-1.5 2.3 2.3-1.5 2.2.8 1.9 2.6.5v3.2l-2.6.5-.8 1.9 1.5 2.2-2.3 2.3-2.2-1.5-1.9.8-.5 2.6h-3.2l-.5-2.6-1.9-.8-2.2 1.5-2.3-2.3 1.5-2.2-.8-1.9-2.6-.5v-3.2l2.6-.5.8-1.9-1.5-2.2 2.3-2.3 2.2 1.5 1.9-.8z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  shard: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 2l7 7-7 13-7-13z"/><path d="M5 9h14M12 2v20" opacity=".5"/></svg>',
  star: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" class="ico"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
};

const hexColor = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '--');

function topbar(title: string, right = '') {
  return `<header class="topbar"><button class="icon-btn" data-act="back" aria-label="Back to the hub">${ICON.back}</button><h2 class="bar-title">${title}</h2><div class="bar-right">${right}</div></header>`;
}

// ---- what class am I playing? ----
export interface ClassView {
  /** 'token': a Chog verified on Monad by the site; 'demo': a labelled demo number; 'free': no Chog. */
  source: 'token' | 'demo' | 'free';
  metadataId: number | null;
  tier: Tier;
  /** The tier the token itself has (shown even when NFT combat power is switched off). */
  tokenTier: Tier | null;
  upgrades: Upgrades;
  power: Power;
}

/** The class the next match will use, as far as the browser knows (the server re-verifies it on every ticket). */
export function classOf(a: AcctView): ClassView {
  const up = a.profile?.upgrades ?? { vitality: 0, plating: 0, firepower: 0, focus: 0 };
  const combat = a.config?.nftCombat ?? true;
  if (a.choice?.demo) {
    const t = tierOfMetadataId(a.choice.demo) ?? 'free';
    return { source: 'demo', metadataId: a.choice.demo, tier: t, tokenTier: t, upgrades: up, power: powerFor(t, up, signatureFor(a.choice.demo), true, a.choice.demo) };
  }
  const tk = a.choice?.tokenId ? a.tokens?.find((x) => x.tokenId === a.choice!.tokenId) : undefined;
  if (tk) {
    const t = combat ? tk.tier : 'free';
    return { source: 'token', metadataId: tk.metadataId, tier: t, tokenTier: tk.tier, upgrades: up, power: powerFor(t, up, signatureFor(tk.metadataId), false, tk.metadataId) };
  }
  return { source: 'free', metadataId: null, tier: 'free', tokenTier: null, upgrades: up, power: powerFor('free', up) };
}

/** One line per number the sim applies: health, armour, damage, cooldown. */
function powerRows(p: Power): string {
  const row = (k: string, v: string, share: number) => `<div class="pw"><span>${k}</span><s style="--v:${Math.round(Math.max(0.04, Math.min(1, share)) * 100)}%"></s><b class="num">${v}</b></div>`;
  return row('Health', `+${Math.round((p.hpMul - 1) * 100)}%`, (p.hpMul - 1) / (CAPS.hpMul - 1))
    + row('Armour', `+${p.armor}`, p.armor / CAPS.armor)
    + row('Damage', `+${Math.round((p.damageMul - 1) * 100)}%`, (p.damageMul - 1) / (CAPS.damageMul - 1))
    + row('Ability', `-${Math.round((1 - p.cooldownMul) * 100)}%`, (1 - p.cooldownMul) / (1 - CAPS.cooldownMul));
}

export function upgradesReady(a: AcctView): number {
  const p = a.profile;
  if (!p) return 0;
  return UPGRADE_IDS.filter((id) => p.upgrades[id] < UPGRADES[id].ranks && p.shards >= UPGRADES[id].costs[p.upgrades[id]]).length;
}

// ---- identity strip ----
function identity(c: HubCtx): string {
  const a = c.acct;
  const p = a.profile;
  const fav = c.profile.favourite ? HEROES.find((x) => x.id === c.profile.favourite) : null;
  const name = displayName(c.profile);
  const lv = p ? { level: p.level, into: p.into, next: p.next } : levelOf(0);
  const sub = a.signedIn
    ? (p ? `Level ${lv.level} · ${esc(c.auth.session[0]?.label ?? a.identities[0]?.label ?? 'account')}` : a.progression ? 'Loading your account…' : 'Account saving is offline')
    : 'Guest · nothing is saved';
  return `<div class="ident">
<button class="player-chip" data-act="career" aria-label="Your career">${tokenSvg(fav ? fav.accent : null, fav?.id)}<span><b id="callsign">${esc(name)}</b><small>${sub}</small></span>${a.signedIn && p && !p.callsign ? '<i class="new">NAME</i>' : ''}</button>
<div class="lvl"><div class="lvl-top"><b class="num" id="hublevel">LV ${lv.level}</b><span class="num" id="hubxp">${p ? `${p.into} / ${p.next} XP` : '0 XP'}</span></div><div class="xpbar"><i style="width:${Math.round((lv.into / lv.next) * 100)}%"></i></div></div>
<div class="wallet">
  <button class="cur" data-act="upgrades" aria-label="Shards and upgrades">${ICON.shard}<b class="num" id="hubshards">${p?.shards ?? 0}</b>${upgradesReady(a) ? `<i class="dot num">${upgradesReady(a)}</i>` : ''}</button>
  <button class="cur" data-act="ranks" aria-label="Rating and leaderboard">${ICON.star}<b class="num" id="hubrating">${p?.rating ?? 1000}</b></button>
</div>
${a.signedIn ? '' : '<button class="btn small primary" data-act="settings" id="signin-cta">Sign in to save</button>'}
<button class="icon-btn" data-act="settings" aria-label="Settings">${ICON.gear}</button>
</div>`;
}

// ---- left: the Chog / class panel ----
function chogPanel(c: HubCtx): string {
  const a = c.acct;
  const k = classOf(a);
  const one = k.metadataId ? ONE_OF_ONE[k.metadataId] : undefined;
  const sig = k.metadataId ? signatureFor(k.metadataId) : null;
  const accent = one ? hexColor(one.color) : 'var(--line)';
  const title = k.metadataId ? esc(chogName(k.metadataId)) : 'No Chog';
  const tierLine = k.source === 'free'
    ? '<span class="tier tier-free">Free</span>'
    : `${tierBadge(k.tokenTier ?? k.tier, k.source === 'demo')}${k.source === 'token' ? ' <span class="verified">verified on Monad</span>' : ''}`;
  let note = '';
  if (k.source === 'token' && a.config && !a.config.nftCombat) note = '<p class="note warn">NFT combat power is switched off on this server right now: you play at free power. 5v5 and token history still count.</p>';
  else if (k.source === 'demo') note = '<p class="note">DEMO: no ownership checked. Demo power plays solo and in demo-only rooms and earns nothing.</p>';
  else if (k.source === 'free') note = a.signedIn && !a.hasWallet
    ? '<p class="note">Own a Chog Genesis? Sign in with the wallet that holds it (Settings): its tier sets your starting class and unlocks 5v5.</p>'
    : a.signedIn && a.tokens && !a.tokens.length ? '<p class="note">No Chog Genesis in your signed-in wallet: free class. Upgrades still take you past the lower tiers.</p>'
      : !a.signedIn ? '<p class="note">Free class. Sign in to earn shards and upgrade; sign in with a wallet that holds a Chog to start higher.</p>' : '';
  const picks = a.tokens && a.tokens.length > 1
    ? `<div class="tokpick">${a.tokens.map((t) => `<button class="btn small${a.choice?.tokenId === t.tokenId ? ' on' : ''}" data-token="${t.tokenId}">${esc(t.oneOfOne ?? `#${t.metadataId}`)} ${tierBadge(t.tier)}</button>`).join('')}<button class="btn small${!a.choice ? ' on' : ''}" data-token="">Free</button></div>` : '';
  const sigBox = sig ? `<div class="sig" style="--sig:${accent}"><b>${esc(sig.name)}</b> <span class="num">${Math.round(sig.cooldown * k.power.cooldownMul)} s</span><p>${esc(sig.text)}</p>
<p class="small"><em>Telegraph</em> ${esc(sig.telegraph ?? '')}</p><p class="small"><em>Counter</em> ${esc(sig.counter ?? '')}</p></div>` : '';
  const hist = k.source === 'token' ? a.tokens?.find((t) => t.metadataId === k.metadataId)?.history : null;
  return `<section class="hub-card chog${one ? ' oneofone' : ''}" style="--accent:${accent}" id="chogpanel">
<div class="kicker">Your class</div>
<h3 id="chogname">${title}</h3><div class="tierline">${tierLine}</div>
${one ? `<div class="legend">1:1 LEGEND · ${esc(one.name)}</div>` : ''}
<div class="pwrows">${powerRows(k.power)}</div>
<p class="note small">From your Chog's tier${k.upgrades && Object.values(k.upgrades).some((x) => x) ? ' plus your upgrades' : ''}. Speed never changes.</p>
${sigBox}${hist ? `<p class="note small">This Chog's own history: ${hist.matches} matches, ${hist.wins} wins, ${hist.kills} kills (kept with the token, whoever holds it).</p>` : ''}
${picks}${note}
${c.demoToken && tierOfMetadataId(Number(c.demoToken)) ? (a.choice?.demo ? '<button class="btn small" data-act="demo-online-off">Leave demo</button>' : `<button class="btn small" data-act="demo-online">Use <span class="demo">DEMO</span> #${esc(c.demoToken)}</button>`) : ''}
<div class="btns tight"><button class="btn small" data-act="upgrades">Upgrades${upgradesReady(a) ? ` · ${upgradesReady(a)} ready` : ''}</button></div>
</section>`;
}

// ---- centre: operator + mode + PLAY ----
const MODE_INFO: Record<PlayMode, { label: string; sub: string }> = {
  solo: { label: 'Practice', sub: 'Solo vs 5 bots' },
  '1v1': { label: '1v1', sub: 'Duel' },
  '3v3': { label: '3v3', sub: 'Squads · revive' },
  '5v5': { label: '5v5', sub: 'Holders' },
};

/** Why 5v5 is locked for this player, or null. The server enforces it; this only explains it. */
export function fiveLockReason(a: AcctView): string | null {
  if (a.choice?.demo) return null;
  if (a.choice?.tokenId && a.tokens?.some((t) => t.tokenId === a.choice!.tokenId)) return null;
  if (!a.signedIn) return 'Sign in with the wallet that holds your Chog';
  if (!a.hasWallet) return 'Sign in with your Chog wallet';
  if (a.tokens === null) return 'Checking your wallet on Monad…';
  if (a.tokensError) return 'Monad could not be reached; try again';
  return 'No Chog Genesis in your wallet';
}

function playPanel(c: HubCtx): string {
  const h = heroById(c.heroId);
  const v = c.net;
  const lock = fiveLockReason(c.acct);
  const busy = v.state === 'queued' || v.state === 'connecting';
  const modes = (['solo', '1v1', '3v3', '5v5'] as PlayMode[]).map((m) => {
    const locked = m === '5v5' && !!lock;
    const off = m !== 'solo' && !v.url;
    return `<button class="mode-btn${c.mode === m ? ' on' : ''}${locked ? ' locked' : ''}" data-mode="${m}"${busy ? ' disabled' : ''} aria-pressed="${c.mode === m}">
<b>${locked ? ICON.lock : ''}${MODE_INFO[m].label}</b><small>${locked ? 'CHOG HOLDERS ONLY' : off ? 'Offline' : MODE_INFO[m].sub}</small></button>`;
  }).join('');
  const sel = c.mode;
  let playLabel = sel === 'solo' ? 'Practice' : `Play ${sel}`;
  let playAttr = 'data-act="play"';
  let disabled = false;
  let status = '';
  if (sel === '5v5' && lock) { disabled = true; status = `<p class="status warn" id="lockwhy"><b>CHOG HOLDERS ONLY</b> · ${esc(lock)}. 1v1 and 3v3 are open to everyone.</p>`; }
  if (sel !== 'solo' && !v.url) { disabled = true; status = '<p class="status warn">Online play is not switched on in this build.</p>'; }
  if (v.follower && sel !== 'solo') { disabled = true; status = '<p class="status">Your squad leader starts the match. Stay here: you join automatically.</p>'; }
  if (busy) {
    playLabel = 'Cancel';
    playAttr = 'data-act="online-cancel"';
    disabled = false;
    status = v.state === 'connecting'
      ? `<p class="status" id="queuestatus">${esc(v.message || 'Connecting to the game server…')}</p><div class="loadbar"><i></i></div>`
      : `<p class="status num" id="queuestatus">Finding ${esc(v.queue?.mode ?? sel)}: ${v.queue?.have ?? 0} / ${v.queue?.need ?? 0} players</p><div class="loadbar"><i></i></div>`;
  } else if (v.state === 'match') status = '<p class="status good">Match found. Deploying…</p>';
  else if (v.message && !status) status = `<p class="status warn">${esc(v.message)}</p>`;
  // What the server made of the last ticket (a fail-closed ownership read, a reused ticket): said plainly, never hidden.
  const warn = c.acct.ticketWarning ? TICKET_WARN[c.acct.ticketWarning] ?? c.acct.ticketWarning : c.netProfile?.note ?? '';
  if (warn) status += `<p class="status warn small">${esc(warn)}</p>`;
  const i = HEROES.findIndex((x) => x.id === h.id);
  const prev = HEROES[(i + HEROES.length - 1) % HEROES.length].id, next = HEROES[(i + 1) % HEROES.length].id;
  return `<section class="hub-play">
<div class="op-stage">
  <button class="icon-btn small" data-hero="${prev}" data-pick="1" aria-label="Previous operator">${ICON.prev}</button>
  <button class="op-show" data-go="start" aria-label="Operator details">${portraitSvg(h, 'hub', c.marking)}</button>
  <button class="icon-btn small" data-hero="${next}" data-pick="1" aria-label="Next operator">${ICON.next}</button>
</div>
<div class="op-name"><b>${esc(h.name)}</b><small>${esc(h.role)} · ${esc(WEAPONS[h.weapon].name)} · ${esc(c.acct.choice && classOf(c.acct).power.signature ? classOf(c.acct).power.signature!.name : h.ability.name)}</small></div>
<div class="modes4">${modes}</div>
<button class="btn primary play" ${playAttr}${disabled ? ' disabled' : ''} id="playbtn">${esc(playLabel)}</button>
${status}
${sel !== 'solo' && v.url && !busy ? `<p class="note small">${sel === '3v3' || sel === '5v5' ? 'Teams of real players. A teammate can revive you when you go down. ' : ''}${c.acct.signedIn ? `Saved matches pay ${REWARDS.xpPlay}+ XP and ${REWARDS.shardsPlay}+ shards.` : 'Sign in to earn XP and shards.'}${v.rtt ? ` · ping ${Math.round(v.rtt)} ms` : ''}</p>` : ''}
${sel === 'solo' ? '<p class="note small">Practice runs never pay XP or shards. Signed in, they count for your practice career and medals.</p>' : ''}
</section>`;
}

// ---- right: leaderboard preview + squad ----
const boardRow = (r: BoardRow) => `<tr class="${r.you ? 'me' : ''}"><td class="num">${r.rank}</td><td class="nm">${esc(r.name)}</td><td class="num"><b>${r.kills}</b></td><td>${r.nftTier ? tierBadge(r.nftTier) : ''}</td></tr>`;

function boardPreview(c: HubCtx): string {
  const a = c.acct;
  let body: string;
  if (!a.config) body = '<p class="note">Leaderboard unavailable here.</p>';
  else if (!a.config.db) body = '<p class="note">Saved progression is offline.</p>';
  else if (a.board === null) body = '<p class="note">Loading…</p>';
  else if (!a.board.length) body = '<p class="note">Nobody is ranked yet. Win a saved online match to be first.</p>';
  else {
    const top = a.board.slice(0, 5);
    const me = a.boardMe ?? a.board.find((r) => r.you) ?? null;
    body = `<table class="mini-board"><tr><th>#</th><th>Player</th><th>Kills</th><th></th></tr>${top.map(boardRow).join('')}${me && !top.some((r) => r.you) ? `<tr class="gap"><td colspan="4">…</td></tr>${boardRow(me)}` : ''}</table>`;
  }
  const mine = a.boardMe ?? a.board?.find((r) => r.you);
  return `<section class="hub-card board" id="boardpreview"><div class="card-head"><h3>Leaderboard</h3><button class="btn small" data-act="ranks">All</button></div>
${body}${a.signedIn && !mine && a.board?.length ? '<p class="note small">Play a saved online match to get your rank.</p>' : ''}
<p class="note small">Ranked by kills, then wins. Your Chog never moves you up.</p></section>`;
}

function squadPanel(c: HubCtx): string {
  const v = c.net;
  if (!v.url) return '';
  const p = v.party;
  if (!p || p.members.length === 0) {
    return `<section class="hub-card squad" id="squad"><div class="card-head"><h3>Squad</h3></div>
<p class="note small">Play 3v3 and 5v5 with friends: always on the same team, together between matches.</p>
<div class="squad-row"><button class="btn small" data-act="squad-create">Create squad</button>
<input id="squadcode" class="field small" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="Squad code" />
<button class="btn small" data-act="squad-join">Join</button></div></section>`;
  }
  const me = p.members.find((m) => m.you);
  const rows = p.members.map((m) => `<li class="${m.you ? 'me' : ''}"><span>${m.leader ? '★ ' : ''}${esc(m.name)}${m.you ? ' (you)' : ''}</span><span>${esc(heroById(m.hero).name)} ${tierBadge(m.tier, m.demo)}${m.ready ? '' : ' <em>busy</em>'}</span></li>`).join('');
  return `<section class="hub-card squad" id="squad"><div class="card-head"><h3>Squad <span class="num code" id="squadcodeshown">${esc(p.code)}</span></h3><button class="btn small" data-act="squad-leave">Leave</button></div>
<ul class="squad-list">${rows}</ul>
<p class="note small">${me?.leader ? 'You lead: pick 3v3 or 5v5 and press Play; the squad queues with you.' : 'The leader starts the match; you join automatically.'} Invite: share the code${p.members.length < 5 ? ` (${5 - p.members.length} slots left)` : ''}.</p></section>`;
}

// ---- the hub ----
export function hubHtml(c: HubCtx): string {
  return `<div class="screen hub" id="hub">
<header class="hub-top">${identity(c)}</header>
<div class="hub-body">
  <div class="hub-left">${chogPanel(c)}</div>
  <div class="hub-center">${playPanel(c)}</div>
  <div class="hub-right">${boardPreview(c)}${squadPanel(c)}</div>
</div>
<nav class="hub-nav">
  <button class="navbtn" data-act="upgrades">Upgrades${upgradesReady(c.acct) ? ` <span class="num">${upgradesReady(c.acct)}</span>` : ''}</button>
  <button class="navbtn" data-act="ranks">Leaderboard</button>
  <button class="navbtn" data-act="career">Career</button>
  <button class="navbtn" data-act="medals">Medals <span class="num">${Object.keys(c.medals).length}/${MEDALS.length}</span></button>
  <button class="navbtn" data-act="howto">How to play</button>
  <button class="navbtn" data-act="demo">Chog <span class="demo">DEMO</span></button>
</nav></div>`;
}

// ---- Upgrades ----
export function upgradesHtml(c: ScreenCtx): string {
  const a = c.acct;
  const k = classOf(a);
  const right = `<span class="cur">${ICON.shard}<b class="num">${a.profile?.shards ?? 0}</b></span>`;
  if (!a.signedIn || !a.profile) {
    return `<div class="screen upgrades">${topbar('Upgrades', right)}<div class="up-body"><section class="hub-card"><h3>Upgrades belong to your account</h3>
<p class="note">${a.signedIn ? 'Saved progression is offline right now.' : 'Sign in (Google or wallet) to earn shards in online matches and spend them here. Guests play at their class power with no upgrades.'}</p>
${a.signedIn ? '' : '<div class="btns"><button class="btn primary" data-act="settings">Sign in</button></div>'}</section></div></div>`;
  }
  const p = a.profile;
  const cards = UPGRADE_IDS.map((id) => {
    const d = UPGRADES[id], rank = p.upgrades[id], cost = d.costs[rank];
    const pips = Array.from({ length: d.ranks }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
    const btn = rank >= d.ranks ? '<span class="maxed">MAX</span>'
      : `<button class="btn small${p.shards >= cost ? ' primary' : ''}" data-upgrade="${id}"${p.shards < cost || a.busy ? ' disabled' : ''}>${ICON.shard}<span class="num">${cost}</span></button>`;
    return `<div class="upcard"><div><b>${esc(d.name)}</b><small>${esc(d.text)}</small></div><div class="pips">${pips}</div><div class="num rank">${rank}/${d.ranks}</div>${btn}</div>`;
  }).join('');
  return `<div class="screen upgrades">${topbar('Upgrades', right)}
<div class="up-body">
<section class="hub-card"><h3>Develop your operator</h3>${cards}
${a.message ? `<p class="note warn">${esc(a.message)}</p>` : ''}
<p class="note">Shards come only from saved online matches (${REWARDS.shardsPlay} for playing, ${REWARDS.shardsWin} more for a win). They cannot be bought. Upgrades apply to every operator, online and in practice.</p></section>
<section class="hub-card"><h3>Your class now</h3><div class="pwrows">${powerRows(k.power)}</div>
<p class="note">Your Chog decides your starting class (${k.source === 'free' ? 'Free' : esc(TIER_DEFS[k.tokenTier ?? k.tier].label)}); your account's upgrades decide how far you have developed it. A fully upgraded free operator starts stronger than a Common or Uncommon Chog.</p>
<table class="kv tiers">${(['free', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as Tier[]).map((t) => { const q = powerFor(t); return `<tr class="${t === (k.tokenTier ?? k.tier) ? 'me' : ''}"><td>${tierBadge(t)}</td><td class="num">+${Math.round((q.hpMul - 1) * 100)}% HP</td><td class="num">+${q.armor} AR</td><td class="num">+${Math.round((q.damageMul - 1) * 100)}% DMG</td></tr>`; }).join('')}</table>
</section></div></div>`;
}

// ---- Leaderboard (full) ----
export function boardScreenHtml(c: ScreenCtx): string {
  const a = c.acct;
  const head = '<tr><th>#</th><th>Player</th><th>Kills</th><th>Wins</th><th>Matches</th><th>Level</th><th>Rating</th><th>Chog</th></tr>';
  const row = (r: BoardRow) => `<tr class="${r.you ? 'me' : ''}"><td class="num">${r.rank}</td><td>${esc(r.name)}${r.you ? ' (you)' : ''}</td><td class="num"><b>${r.kills}</b></td><td class="num">${r.wins}</td><td class="num">${r.matches}</td><td class="num">${r.level}</td><td class="num">${r.rating}</td><td>${r.nftTier ? tierBadge(r.nftTier) : '<span class="note">none</span>'}</td></tr>`;
  let body: string;
  if (!a.config?.db) body = '<p class="note warn">Saved progression is offline, so there is no leaderboard right now.</p>';
  else if (a.board === null) body = '<p class="note">Loading…</p>';
  else if (!a.board.length) body = '<p class="note">Nobody has finished a saved online match yet. Sign in and play 1v1, 3v3 or 5v5 to be first.</p>';
  else body = `<table class="kv board">${head}${a.board.map(row).join('')}${a.boardMe && !a.board.some((r) => r.you) ? `<tr class="gap"><td colspan="8">…</td></tr>${row(a.boardMe)}` : ''}</table>`;
  return `<div class="screen ranks">${topbar('Leaderboard')}<div class="scroll-body"><section class="hub-card wide">
<p class="note">Ranked by opponents killed in saved online matches (20 s or longer), then wins, then fewer matches. Public: anyone can see it, no Chog needed. The Chog column is shown for information only and never changes a rank. Rating is matchmaking skill, kept separate.</p>
${body}${a.signedIn ? '' : '<p class="note">Sign in to appear here. Guests and demo matches are not ranked.</p>'}</section></div></div>`;
}

// ---- Career (player card, online and practice) ----
export function careerHtml(c: ScreenCtx): string {
  const a = c.acct;
  const o = a.profile?.online;
  const r = c.records.overall;
  const fav = c.profile.favourite ? HEROES.find((x) => x.id === c.profile.favourite) ?? null : null;
  const show = fav ?? heroById(c.heroId);
  const pins = [0, 1, 2].map((i) => {
    const m = MEDALS.find((x) => x.id === c.profile.pinned[i]);
    return m && c.medals[m.id] ? `<span class="pin" title="${esc(m.name)}">${medalSvg(m, true)}</span>` : '<span class="pin empty" title="Pin a medal on the Medals screen">+</span>';
  }).join('');
  const linked = a.identities.map((l) => `<span class="linkchip">${l.provider === 'google' ? 'Google' : 'Wallet'} · ${esc(l.label)}</span>`).join('');
  const rows = (list: [string, string][]) => `<table class="kv">${list.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('')}</table>`;
  const heroRows = HEROES.map((h) => {
    const b = c.records.heroes[h.id];
    const on = o?.heroes[h.id];
    const isFav = c.profile.favourite === h.id;
    return `<tr><td><b>${esc(h.name)}</b></td><td class="num">${on?.matches ?? 0} / ${on?.wins ?? 0} / ${on?.kills ?? 0}</td><td class="num">${b?.runs ?? 0} / ${b?.wins ?? 0} / ${fmtTime(b?.bestWinSeconds ?? null)}</td>
<td><button class="btn small${isFav ? ' on' : ''}" data-fav="${h.id}">${isFav ? '★ Favourite' : 'Favourite'}</button></td></tr>`;
  }).join('');
  return `<div class="screen career">${topbar('Career')}
<div class="career-body">
<aside class="pcard"><div class="pcard-head">${tokenSvg(fav ? fav.accent : null, fav?.id)}<span><b>${esc(displayName(c.profile))}</b><small>${a.signedIn ? `ID ${esc(c.profile.id)}` : 'Guest'}</small></span>
<button class="icon-btn small" data-act="nick" aria-label="Edit callsign">${ICON.edit}</button></div>
<div class="pcard-art">${portraitSvg(show, 'car', null)}<span class="pcard-op">${fav ? 'Favourite' : 'Current'}: ${esc(show.name)}</span></div>
<div class="pins">${pins}</div><div class="links">${linked || '<span class="linkchip dim">Guest: nothing is saved</span>'}</div></aside>
<div class="scroll-body">
<section class="hub-card"><h3>Online <small>saved to your account</small></h3>
${a.signedIn && a.profile ? rows([
    ['Level', `${a.profile.level} (${a.profile.xp} XP)`], ['Matches', String(a.profile.matches)], ['Wins', `${a.profile.wins} (${pct(a.profile.wins, a.profile.matches)})`],
    ['Kills', String(o?.kills ?? 0)], ['Damage dealt', String(o?.damage ?? 0)], ['Survived to the end', String(o?.survived ?? 0)], ['Rating', String(a.profile.rating)],
  ]) : '<p class="note">Sign in to keep an online career.</p>'}</section>
<section class="hub-card"><h3>Practice <small>${a.signedIn ? 'saved to your account' : 'this session only (guest)'}</small></h3>
${rows([
    ['Runs', String(r.runs)], ['Rooms cleared', `${r.wins} (${pct(r.wins, r.runs)})`], ['Best clear', fmtTime(r.bestWinSeconds)], ['Most kills in a run', String(r.mostKills)],
    ['Hostiles down', String(r.kills)], ['Accuracy', pct(r.hits, r.bullets)], ['Pickups · abilities', `${r.pickups} · ${r.abilities}`],
  ])}</section>
<section class="hub-card"><h3>Operators <small>online matches / wins / kills · practice runs / clears / best</small></h3><table class="kv ops">${heroRows}</table></section>
</div></div></div>`;
}

// ---- Medals ----
export function medalsScreenHtml(c: ScreenCtx, cardHtml: (m: (typeof MEDALS)[number]) => string): string {
  const sorted = [...MEDALS].sort((x, y) => Number(!!c.medals[y.id]) - Number(!!c.medals[x.id]));
  return `<div class="screen medals-screen">${topbar(`Medals <span class="num">${Object.keys(c.medals).length}/${MEDALS.length}</span>`)}
<div class="scroll-body"><p class="note">${c.acct.signedIn ? 'Earned in practice runs and kept on your account. Tap an earned medal to pin it to your card (3 max).' : 'Guest: medals earned now last for this session only. Sign in to keep them on your account.'}</p>
<div class="medals">${sorted.map(cardHtml).join('')}</div></div></div>`;
}

// ---- Online results ----
export interface OnlineRow { name: string; hero: string; team: string; kills: number; damageDealt: number; damageTaken: number; alive: boolean; cause: string | null; you: boolean; tier: Tier; demo: boolean; metadataId: number | null }

export interface ResultProgress {
  /** Account before and after the settlement (null while saving, or when nothing was saved). */
  before: { xp: number; shards: number; rating: number } | null;
  reward: Reward | null;
  pending: boolean;
  note: string;
  upgradesReady: number;
}

export function onlineResultsHtml(r: { mode: string; won: boolean | null; reason: string; team: string; rows: OnlineRow[]; demo: boolean; signedIn: boolean; settle: boolean; prog: ResultProgress; myClass: string; canRequeue: boolean; follower: boolean }): string {
  const title = r.won === null ? 'Draw' : r.won ? 'Victory' : 'Defeat';
  const why = r.reason === 'time' ? 'Time ran out: the side with more health standing takes it.' : r.won === null ? 'Nobody was left standing.' : r.won ? 'The other side is down.' : 'Your side is down.';
  const me = r.rows.find((x) => x.you);
  const row = (x: OnlineRow) => `<tr class="${x.you ? 'me' : ''}"><td>${esc(x.name)}${x.you ? ' (you)' : ''}</td><td>${esc(heroById(x.hero).name)} ${x.metadataId && ONE_OF_ONE[x.metadataId] && x.tier === 'legendary' ? `<span class="legend-chip">${esc(ONE_OF_ONE[x.metadataId].name)}</span>` : tierBadge(x.tier, x.demo)}</td><td class="num">${x.kills}</td><td class="num">${x.damageDealt}</td><td>${x.alive ? 'standing' : x.cause === 'zone' ? 'zone' : x.cause === 'left' ? 'left' : 'out'}</td></tr>`;
  const side = (team: string, label: string) => `<h3>${label}</h3><table class="kv online-res"><tr><th>Player</th><th>Operator</th><th>Kills</th><th>Dealt</th><th></th></tr>${r.rows.filter((x) => x.team === team).map(row).join('')}</table>`;
  const other = r.team === 'alpha' ? 'bravo' : 'alpha';
  const p = r.prog;
  let rewards: string;
  if (r.demo) rewards = '<p class="pb"><span class="demo">DEMO</span> match: no XP, shards or rating.</p>';
  else if (!r.settle) rewards = `<p class="pb">${r.signedIn ? 'Not saved: nobody in this match had a checked account ticket.' : 'Guest: nothing saved. Sign in to earn XP and shards from online matches.'}</p>`;
  else if (p.pending) rewards = '<p class="pb" id="saving">Saving the result to your account…</p>';
  else if (p.reward && p.before) {
    const lb = levelOf(p.before.xp), la = levelOf(p.before.xp + p.reward.xp);
    const d = p.reward.ratingAfter - p.reward.ratingBefore;
    rewards = `<div class="reward-grid" id="rewards">
<div class="rw"><span>XP</span><b class="num">+${p.reward.xp}</b></div>
<div class="rw"><span>Shards</span><b class="num">+${p.reward.shards}</b></div>
<div class="rw"><span>Rating</span><b class="num ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</b><small class="num">${p.reward.ratingBefore} → ${p.reward.ratingAfter}</small></div>
<div class="rw lv"><span>Level ${la.level}${la.level > lb.level ? ' <em class="lvup">LEVEL UP</em>' : ''}</span><div class="xpbar big"><i class="was" style="width:${la.level > lb.level ? 0 : Math.round((lb.into / lb.next) * 100)}%"></i><i class="now" style="width:${Math.round((la.into / la.next) * 100)}%"></i></div><small class="num">${la.into} / ${la.next} XP</small></div>
</div>${p.reward.xp === 0 ? '<p class="note">No reward this time: left early, under 20 s, or the daily limit (20 saved matches a day).</p>' : ''}
${p.upgradesReady ? `<p class="pb good">${p.upgradesReady} upgrade${p.upgradesReady > 1 ? 's' : ''} ready to buy.</p>` : ''}`;
  } else rewards = `<p class="pb">${esc(p.note || 'Result not saved to your account.')}</p>`;
  return `<div class="card results online-results"><div class="kicker">Online ${esc(r.mode)} · ${esc(r.myClass)}</div><h2 class="${r.won === null ? '' : r.won ? 'good' : 'bad'}">${title}</h2><p>${why}${me ? ` You: ${me.kills} kill${me.kills === 1 ? '' : 's'}, ${me.damageDealt} damage.` : ''}</p>
${rewards}
<div class="res-grid"><div>${side(r.team, 'Your side')}</div><div>${side(other, 'Other side')}</div></div>
<div class="btns">${r.follower ? '<p class="note">Your squad leader picks the next match.</p>' : `<button class="btn primary" data-act="online-again"${r.canRequeue ? '' : ' disabled'}>Play ${esc(r.mode)} again</button>`}${p.upgradesReady ? '<button class="btn" data-act="upgrades-from-results">Upgrades</button>' : ''}<button class="btn" data-go="menu">Hub</button></div></div>`;
}
