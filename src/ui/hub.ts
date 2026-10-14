// The hub (master integration pass, owner 2026-10-14): the screen the game lives in between matches. Everything a
// player owns or can do is on it, not buried in tabs: who you are (callsign, account, level, XP), what you have
// (shards, upgrades, your Chog and its class), PLAY with the mode, the leaderboard, your squad, career and medals.
// Plain HTML from plain data, like every other screen; every number comes from the account service, the game server
// or the config files, never from the browser's own guess.
import { HEROES, heroById } from '../config/heroes';
import { WEAPONS } from '../config/weapons';
import { levelOf } from '../config/progression';
import {
  CAPS, ONE_OF_ONE, TIER_DEFS, UPGRADES, UPGRADE_IDS, powerFor, signatureFor, tierOfMetadataId, type Power, type Tier, type Upgrades,
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
  const lv = p ? { level: p.level, into: p.into, next: p.next } : levelOf(0);
  const ready = upgradesReady(a);
  return `<div class="ident">
${a.signedIn && p && !p.callsign
    // No callsign yet: the chip opens the callsign editor (a pencil says so), not the career screen.
    ? `<button class="player-chip" data-act="nick" aria-label="Set your callsign">${tokenSvg(fav ? fav.accent : null, fav?.id)}<b id="callsign">${esc(displayName(c.profile))}</b><i class="new edit">${ICON.edit}</i></button>`
    : `<button class="player-chip" data-act="career" aria-label="Career">${tokenSvg(fav ? fav.accent : null, fav?.id)}<b id="callsign">${esc(displayName(c.profile))}</b></button>`}
<div class="lvl"><div class="lvl-top"><b class="num" id="hublevel">LV ${lv.level}</b><span class="num" id="hubxp">${p ? `${p.into} / ${p.next} XP` : '0 XP'}</span></div><div class="xpbar"><i style="width:${Math.round((lv.into / lv.next) * 100)}%"></i></div></div>
<div class="wallet">
  <button class="cur" data-act="upgrades" aria-label="Shards">${ICON.shard}<b class="num" id="hubshards">${p?.shards ?? 0}</b>${ready ? `<i class="dot num">${ready}</i>` : ''}</button>
  <button class="cur" data-act="ranks" aria-label="Rating">${ICON.star}<b class="num" id="hubrating">${p?.rating ?? 1000}</b></button>
</div>
${a.signedIn ? '' : '<button class="btn small primary" data-act="signin" id="signin-cta">Sign in</button>'}
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
  const title = k.metadataId ? (one ? esc(one.name) : `Chog #${k.metadataId}`) : 'Free';
  const tierLine = k.source === 'free' ? '' : `<div class="tierline">${tierBadge(k.tokenTier ?? k.tier, k.source === 'demo')}${k.source === 'token' ? ' <span class="verified">✓ Monad</span>' : ''}${one ? ` <span class="num dim">#${k.metadataId}</span>` : ''}</div>`;
  const off = k.source === 'token' && a.config && !a.config.nftCombat ? '<p class="note warn small">NFT power off on this server</p>' : '';
  const picks = a.tokens && a.tokens.length > 1
    ? `<div class="tokpick">${a.tokens.map((t) => `<button class="btn small${a.choice?.tokenId === t.tokenId ? ' on' : ''}" data-token="${t.tokenId}">${esc(t.oneOfOne ?? `#${t.metadataId}`)} ${tierBadge(t.tier)}</button>`).join('')}<button class="btn small${!a.choice ? ' on' : ''}" data-token="">Free</button></div>` : '';
  const sigBox = sig ? `<div class="sig" style="--sig:${accent}"><div class="sig-h"><b>${esc(sig.name)}</b><span class="num">${Math.round(sig.cooldown * k.power.cooldownMul)}s</span></div><p>${esc(sig.text)}</p>
<p class="small"><em>Telegraph</em> ${esc(sig.telegraph ?? '')}</p><p class="small"><em>Counter</em> ${esc(sig.counter ?? '')}</p></div>` : '';
  const hist = k.source === 'token' ? a.tokens?.find((t) => t.metadataId === k.metadataId)?.history : null;
  return `<section class="hub-card chog${one ? ' oneofone' : ''}" style="--accent:${accent}" id="chogpanel">
<div class="kicker">Class</div>
<h3 id="chogname">${title}</h3>${tierLine}
<div class="pwrows">${powerRows(k.power)}</div>
${sigBox}${hist ? `<p class="hist num" title="This Chog's own record">${hist.matches}M · ${hist.wins}W · ${hist.kills}K</p>` : ''}
${picks}${off}
${c.demoToken && tierOfMetadataId(Number(c.demoToken)) ? (a.choice?.demo ? '<button class="btn small" data-act="demo-online-off">Leave demo</button>' : `<button class="btn small" data-act="demo-online">Use <span class="demo">DEMO</span> #${esc(c.demoToken)}</button>`) : ''}
</section>`;
}

// ---- centre: operator + mode + PLAY ----
// The default game is you + 2 AI teammates against bots; 1v1, 3v3 and 5v5 are real players only.
const MODE_INFO: Record<PlayMode, { label: string; sub: string }> = {
  solo: { label: 'Vs bots', sub: 'You + 2 AI' },
  '1v1': { label: '1v1', sub: 'Online' },
  '3v3': { label: '3v3', sub: 'Online' },
  '5v5': { label: '5v5', sub: 'Holders' },
};

/** Why 5v5 is locked for this player, or null. The server enforces it; this only explains it. */
export function fiveLockReason(a: AcctView): string | null {
  if (a.choice?.demo) return null;
  if (a.choice?.tokenId && a.tokens?.some((t) => t.tokenId === a.choice!.tokenId)) return null;
  if (!a.signedIn || !a.hasWallet) return 'Sign in with your Chog wallet';
  if (a.tokens === null) return 'Checking your wallet…';
  if (a.tokensError) return 'Monad unreachable, try again';
  return 'No Chog in this wallet';
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
<b>${locked ? ICON.lock : ''}${MODE_INFO[m].label}</b><small>${locked ? 'Holders only' : off ? 'Offline' : MODE_INFO[m].sub}</small></button>`;
  }).join('');
  const sel = c.mode;
  let playLabel = 'Play';
  let playAttr = 'data-act="play"';
  let disabled = false;
  let status = '';
  if (sel === '5v5' && lock) {
    disabled = true;
    status = `<p class="status warn" id="lockwhy"><b>CHOG HOLDERS ONLY</b> · ${esc(lock)}</p>${!c.acct.signedIn || !c.acct.hasWallet ? '<button class="btn small" data-act="signin">Connect wallet</button>' : ''}`;
  }
  if (sel !== 'solo' && !v.url) { disabled = true; status = '<p class="status warn">Online unavailable</p>'; }
  if (v.follower && sel !== 'solo') { disabled = true; status = '<p class="status">Leader starts the match</p>'; }
  if (busy) {
    playLabel = 'Cancel';
    playAttr = 'data-act="online-cancel"';
    disabled = false;
    status = v.state === 'connecting'
      ? `<p class="status" id="queuestatus">${esc(v.message || 'Connecting…')}</p><div class="loadbar"><i></i></div>`
      : `<p class="status num" id="queuestatus">${esc(v.queue?.mode ?? sel)} · ${v.queue?.have ?? 0}/${v.queue?.need ?? 0}</p><div class="loadbar"><i></i></div>`;
  } else if (v.state === 'match') status = '<p class="status good">Match found</p>';
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
<div class="op-name"><b>${esc(h.name)}</b><small><i class="dept dept-${h.dept}">${esc(h.role)}</i> · ${esc(WEAPONS[h.weapon].name)} · ${esc(classOf(c.acct).power.signature?.name ?? h.ability.name)}</small></div>
<div class="modes4">${modes}</div>
<button class="btn primary play" ${playAttr}${disabled ? ' disabled' : ''} id="playbtn">${esc(playLabel)}</button>
${status}
</section>`;
}

// ---- right: leaderboard preview + squad ----
const boardRow = (r: BoardRow) => `<tr class="${r.you ? 'me' : ''}"><td class="num">${r.rank}</td><td class="nm">${esc(r.name)}</td><td class="num"><b>${r.kills}</b></td><td>${r.nftTier ? tierBadge(r.nftTier) : ''}</td></tr>`;

function boardPreview(c: HubCtx): string {
  const a = c.acct;
  let body: string;
  if (!a.config?.db) body = '<p class="note">Offline</p>';
  else if (a.board === null) body = '<p class="note">…</p>';
  else if (!a.board.length) body = '<p class="note">No ranks yet</p>';
  else {
    const top = a.board.slice(0, 5);
    const me = a.boardMe ?? a.board.find((r) => r.you) ?? null;
    body = `<table class="mini-board"><tr><th>#</th><th>Player</th><th>Kills</th><th></th></tr>${top.map(boardRow).join('')}${me && !top.some((r) => r.you) ? `<tr class="gap"><td colspan="4">…</td></tr>${boardRow(me)}` : ''}</table>`;
  }
  return `<section class="hub-card board" id="boardpreview"><div class="card-head"><h3>Leaderboard</h3><button class="btn small" data-act="ranks">All</button></div>${body}</section>`;
}

function squadPanel(c: HubCtx): string {
  const v = c.net;
  if (!v.url) return '';
  const p = v.party;
  if (!p || p.members.length === 0) {
    return `<section class="hub-card squad" id="squad"><div class="card-head"><h3>Squad</h3></div>
<div class="squad-row"><button class="btn small" data-act="squad-create">Create</button>
<input id="squadcode" class="field small" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="Squad code" />
<button class="btn small" data-act="squad-join">Join</button></div></section>`;
  }
  const rows = p.members.map((m) => `<li class="${m.you ? 'me' : ''}"><span>${m.leader ? '★ ' : ''}${esc(m.name)}</span><span>${tierBadge(m.tier, m.demo)}${m.ready ? '' : ' <em>…</em>'}</span></li>`).join('');
  return `<section class="hub-card squad" id="squad"><div class="card-head"><h3>Squad <span class="num code" id="squadcodeshown">${esc(p.code)}</span></h3><button class="btn small" data-act="squad-leave">Leave</button></div>
<ul class="squad-list">${rows}</ul><p class="note small num">${p.members.length}/5</p></section>`;
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
  <button class="navbtn" data-act="howto">Help</button>
  <button class="navbtn" data-act="demo"><span class="demo">DEMO</span></button>
</nav></div>`;
}

// ---- Upgrades ----
export function upgradesHtml(c: ScreenCtx): string {
  const a = c.acct;
  const k = classOf(a);
  const right = `<span class="cur">${ICON.shard}<b class="num" id="upshards">${a.profile?.shards ?? 0}</b></span>`;
  if (!a.signedIn || !a.profile) {
    return `<div class="screen upgrades">${topbar('Upgrades', right)}<div class="up-wrap"><section class="hub-card up-empty"><h3>Sign in to upgrade</h3>
<div class="btns"><button class="btn primary" data-act="signin">Sign in</button></div></section></div></div>`;
  }
  const p = a.profile;
  const cards = UPGRADE_IDS.map((id) => {
    const d = UPGRADES[id], rank = p.upgrades[id], cost = d.costs[rank];
    const pips = Array.from({ length: d.ranks }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
    const btn = rank >= d.ranks ? '<span class="maxed">MAX</span>'
      : `<button class="btn small${p.shards >= cost ? ' primary' : ''}" data-upgrade="${id}"${p.shards < cost || a.busy ? ' disabled' : ''}>${ICON.shard}<span class="num">${cost}</span></button>`;
    return `<div class="upcard${a.justBought === id ? ' bought' : ''}" data-up="${id}"><div class="up-top"><b>${esc(d.name)}</b><span class="num rank">${rank}/${d.ranks}</span></div><small>${esc(d.text)}</small><div class="pips">${pips}</div>${btn}</div>`;
  }).join('');
  return `<div class="screen upgrades">${topbar('Upgrades', right)}
<div class="up-wrap"><div class="up-grid">${cards}</div>
${a.message ? `<p class="note warn up-msg">${esc(a.message)}</p>` : ''}
<section class="hub-card up-class"><div class="kicker">Class · ${k.source === 'free' ? 'Free' : esc(TIER_DEFS[k.tokenTier ?? k.tier].label)}</div><div class="pwrows">${powerRows(k.power)}</div></section></div></div>`;
}

// ---- Leaderboard (full) ----
export function boardScreenHtml(c: ScreenCtx): string {
  const a = c.acct;
  const head = '<tr><th>#</th><th>Player</th><th>Kills</th><th>Wins</th><th>Matches</th><th>Level</th><th>Rating</th><th>Chog</th></tr>';
  const row = (r: BoardRow) => `<tr class="${r.you ? 'me' : ''}"><td class="num">${r.rank}</td><td>${esc(r.name)}${r.you ? ' (you)' : ''}</td><td class="num"><b>${r.kills}</b></td><td class="num">${r.wins}</td><td class="num">${r.matches}</td><td class="num">${r.level}</td><td class="num">${r.rating}</td><td>${r.nftTier ? tierBadge(r.nftTier) : '<span class="note">none</span>'}</td></tr>`;
  let body: string;
  if (!a.config?.db) body = '<p class="note warn">Offline</p>';
  else if (a.board === null) body = '<p class="note">…</p>';
  else if (!a.board.length) body = '<p class="note">No ranks yet</p>';
  else body = `<table class="kv board">${head}${a.board.map(row).join('')}${a.boardMe && !a.board.some((r) => r.you) ? `<tr class="gap"><td colspan="8">…</td></tr>${row(a.boardMe)}` : ''}</table>`;
  return `<div class="screen ranks">${topbar('Leaderboard')}<div class="scroll-body"><section class="hub-card wide">
<p class="note small rankrule">Kills · then wins · then fewer matches</p>${body}</section></div></div>`;
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
    return `<tr><td><b>${esc(h.name)}</b></td><td class="num">${on?.matches ?? 0} · ${on?.kills ?? 0}</td><td class="num">${b?.runs ?? 0} · ${b?.wins ?? 0}</td>
<td><button class="icon-btn small fav${isFav ? ' on' : ''}" data-fav="${h.id}" aria-label="${isFav ? 'Favourite' : 'Set favourite'}">${isFav ? '★' : '☆'}</button></td></tr>`;
  }).join('');
  return `<div class="screen career">${topbar('Career')}
<div class="career-body">
<aside class="pcard"><div class="pcard-head">${tokenSvg(fav ? fav.accent : null, fav?.id)}<span><b>${esc(displayName(c.profile))}</b><small>${a.signedIn ? `ID ${esc(c.profile.id)}` : 'Guest'}</small></span>
<button class="icon-btn small" data-act="nick" aria-label="Edit callsign">${ICON.edit}</button></div>
<div class="pcard-art">${portraitSvg(show, 'car', null)}<span class="pcard-op">${fav ? 'Favourite' : 'Current'}: ${esc(show.name)}</span></div>
<div class="pins">${pins}</div><div class="links">${linked || '<span class="linkchip dim">Guest: nothing is saved</span>'}</div></aside>
<div class="scroll-body">
<section class="hub-card"><h3>Online</h3>
${a.signedIn && a.profile ? rows([
    ['Level', `${a.profile.level} (${a.profile.xp} XP)`], ['Matches', String(a.profile.matches)], ['Wins', `${a.profile.wins} (${pct(a.profile.wins, a.profile.matches)})`],
    ['Kills', String(o?.kills ?? 0)], ['Damage dealt', String(o?.damage ?? 0)], ['Survived to the end', String(o?.survived ?? 0)], ['Rating', String(a.profile.rating)],
  ]) : '<div class="btns tight"><button class="btn small primary" data-act="signin">Sign in</button></div>'}</section>
<section class="hub-card"><h3>Vs bots</h3>
${rows([
    ['Runs', String(r.runs)], ['Rooms cleared', `${r.wins} (${pct(r.wins, r.runs)})`], ['Best clear', fmtTime(r.bestWinSeconds)], ['Most kills in a run', String(r.mostKills)],
    ['Hostiles down', String(r.kills)], ['Accuracy', pct(r.hits, r.bullets)], ['Pickups · abilities', `${r.pickups} · ${r.abilities}`],
  ])}</section>
<section class="hub-card"><h3>Operators</h3><table class="kv ops"><tr><th></th><th>Online M · K</th><th>Bots R · W</th><th></th></tr>${heroRows}</table></section>
</div></div></div>`;
}

// ---- Medals ----
export function medalsScreenHtml(c: ScreenCtx, cardHtml: (m: (typeof MEDALS)[number]) => string): string {
  const sorted = [...MEDALS].sort((x, y) => Number(!!c.medals[y.id]) - Number(!!c.medals[x.id]));
  return `<div class="screen medals-screen">${topbar(`Medals <span class="num">${Object.keys(c.medals).length}/${MEDALS.length}</span>`)}
<div class="scroll-body"><div class="medals">${sorted.map(cardHtml).join('')}</div></div></div>`;
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
  const why = r.reason === 'time' ? 'Time' : '';
  const me = r.rows.find((x) => x.you);
  const row = (x: OnlineRow) => `<tr class="${x.you ? 'me' : ''}"><td>${esc(x.name)}${x.you ? ' (you)' : ''}</td><td>${esc(heroById(x.hero).name)} ${x.metadataId && ONE_OF_ONE[x.metadataId] && x.tier === 'legendary' ? `<span class="legend-chip">${esc(ONE_OF_ONE[x.metadataId].name)}</span>` : tierBadge(x.tier, x.demo)}</td><td class="num">${x.kills}</td><td class="num">${x.damageDealt}</td><td>${x.alive ? 'standing' : x.cause === 'zone' ? 'zone' : x.cause === 'left' ? 'left' : 'out'}</td></tr>`;
  const side = (team: string, label: string) => `<h3>${label}</h3><table class="kv online-res"><tr><th>Player</th><th>Operator</th><th>Kills</th><th>Dealt</th><th></th></tr>${r.rows.filter((x) => x.team === team).map(row).join('')}</table>`;
  const other = r.team === 'alpha' ? 'bravo' : 'alpha';
  const p = r.prog;
  let rewards: string;
  if (r.demo) rewards = '<p class="pb"><span class="demo">DEMO</span> no rewards</p>';
  else if (!r.settle) rewards = `<p class="pb">${r.signedIn ? 'Not saved' : 'Guest · not saved'}</p>`;
  else if (p.pending) rewards = '<p class="pb" id="saving">Saving…</p>';
  else if (p.reward && p.before) {
    const lb = levelOf(p.before.xp), la = levelOf(p.before.xp + p.reward.xp);
    const d = p.reward.ratingAfter - p.reward.ratingBefore;
    rewards = `<div class="reward-grid" id="rewards">
<div class="rw"><span>XP</span><b class="num">+${p.reward.xp}</b></div>
<div class="rw"><span>Shards</span><b class="num">+${p.reward.shards}</b></div>
<div class="rw"><span>Rating</span><b class="num ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</b><small class="num">${p.reward.ratingBefore} → ${p.reward.ratingAfter}</small></div>
<div class="rw lv"><span>Level ${la.level}${la.level > lb.level ? ' <em class="lvup">LEVEL UP</em>' : ''}</span><div class="xpbar big"><i class="was" style="width:${la.level > lb.level ? 0 : Math.round((lb.into / lb.next) * 100)}%"></i><i class="now" style="width:${Math.round((la.into / la.next) * 100)}%"></i></div><small class="num">${la.into} / ${la.next} XP</small></div>
</div>${p.reward.xp === 0 ? '<p class="note small">No reward: under 20 s, left early or daily cap</p>' : ''}
${p.upgradesReady ? `<p class="pb good">${p.upgradesReady} upgrade${p.upgradesReady > 1 ? 's' : ''} ready</p>` : ''}`;
  } else rewards = `<p class="pb">${esc(p.note || 'Not saved')}</p>`;
  return `<div class="card results online-results"><div class="kicker">${esc(r.mode)} · ${esc(r.myClass)}${why ? ` · ${why}` : ''}</div><h2 class="${r.won === null ? '' : r.won ? 'good' : 'bad'}">${title}</h2>${me ? `<p class="num">${me.kills} K · ${me.damageDealt} DMG</p>` : ''}
${rewards}
<div class="res-grid"><div>${side(r.team, 'Your side')}</div><div>${side(other, 'Enemy')}</div></div>
<div class="btns"><button class="btn primary" data-go="menu" id="continuebtn">Continue</button>${r.follower ? '' : `<button class="btn" data-act="online-again"${r.canRequeue ? '' : ' disabled'}>Again</button>`}${p.upgradesReady ? '<button class="btn" data-act="upgrades-from-results">Upgrades</button>' : ''}</div></div>`;
}

// ---- Sign in (a sheet over whatever screen asked for it; never routed through Settings) ----
export interface AuthSheet { config: { google: boolean; wallet: boolean } | null | false; session: { provider: 'google' | 'wallet'; label: string }[]; wallets: { id: string; name: string }[]; busy: boolean; message: string; pickWallet: boolean }

const G_ICON = '<svg viewBox="0 0 24 24" class="ico brand" aria-hidden="true"><path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285F4"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" fill="#34A853"/><path d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9z" fill="#FBBC05"/><path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5l3.3 2.6C7.2 7.7 9.4 5.9 12 5.9z" fill="#EA4335"/></svg>';
const W_ICON = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l13-3v3M16 13h2"/></svg>';

export function authHtml(s: AuthSheet, host: string): string {
  const has = (p: 'google' | 'wallet') => s.session.some((x) => x.provider === p);
  const chips = s.session.map((x) => `<span class="linkchip">${x.provider === 'google' ? 'Google' : 'Wallet'} · ${esc(x.label)}</span>`).join('');
  const googleOff = s.config === false || (s.config !== null && !s.config.google);
  const walletOff = s.config === false || (s.config !== null && !s.config.wallet);
  const google = has('google') ? '' : `<button class="btn auth-btn" data-act="signin-google"${googleOff || s.busy ? ' disabled' : ''}>${G_ICON}<span>Continue with Google</span></button>`;
  let wallet = '';
  if (!has('wallet')) {
    wallet = `<button class="btn auth-btn" data-act="signin-wallet"${walletOff || s.busy ? ' disabled' : ''}>${W_ICON}<span>Continue with Wallet</span></button>`;
    if (s.pickWallet && s.wallets.length > 1) wallet += `<div class="wallet-list">${s.wallets.map((w) => `<button class="btn small" data-wallet="${esc(w.id)}">${esc(w.name)}</button>`).join('')}</div>`;
    if (s.pickWallet && !s.wallets.length) wallet += `<p class="note small" id="nowallet">No wallet in this browser</p><div class="wallet-list"><a class="btn small" href="https://metamask.app.link/dapp/${esc(host)}" rel="noopener">Open in MetaMask</a></div>`;
  }
  return `<div class="card dialog auth-sheet" id="authsheet" role="dialog" aria-label="Sign in">
<button class="icon-btn small close" data-act="back" aria-label="Close">×</button>
<h2>${s.session.length ? 'Account' : 'Sign in'}</h2>${chips ? `<div class="links">${chips}</div>` : ''}
<div class="auth-btns">${google}${wallet}</div>
${s.config === false ? '<p class="note warn" id="authmsg">Sign-in unavailable right now</p>' : s.message ? `<p class="note${s.busy ? '' : ' warn'}" id="authmsg">${esc(s.message)}</p>` : ''}
${s.session.length ? '<button class="btn small" data-act="signout">Sign out</button>' : ''}</div>`;
}
