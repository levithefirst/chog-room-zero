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
import { CHOG_ERRORS, type ChogStep } from './auth';

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
  // CF hub nav: one plain glyph per place, drawn in the HUD's stroke style.
  up: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 4l7 7h-4v8H9v-8H5z"/></svg>',
  card: '<svg viewBox="0 0 24 24" class="ico"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="10" cy="11" r="2.4"/><path d="M6.5 16.5c1-2 5-2 6 0M15 10h3M15 13h3"/></svg>',
  medal: '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="14" r="5"/><path d="M9 3l3 6 3-6M10.5 14l1.5-1.5V17"/></svg>',
  board: '<svg viewBox="0 0 24 24" class="ico"><path d="M4 20V10h4v10M10 20V5h4v15M16 20v-7h4v7"/></svg>',
  help: '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.6M12 16.6v.3"/></svg>',
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

// ---- identity strip (CF): who you are, your Chog, your currencies ----
function identity(c: HubCtx): string {
  const a = c.acct;
  const p = a.profile;
  const fav = c.profile.favourite ? HEROES.find((x) => x.id === c.profile.favourite) : null;
  const lv = p ? { level: p.level, into: p.into, next: p.next } : levelOf(0);
  const ready = upgradesReady(a);
  const nick = a.signedIn && p && !p.callsign;
  const k = classOf(a);
  const one = k.metadataId ? ONE_OF_ONE[k.metadataId] : undefined;
  // Your Chog is your identity: shown by name and tier once verified (or demo); otherwise the way to bring it.
  const chog = k.source !== 'free'
    ? `<span class="chog-chip${one ? ' one' : ''}" style="--accent:${one ? hexColor(one.color) : 'var(--chog-pink)'}">${tierBadge(k.tokenTier ?? k.tier, k.source === 'demo')}<b>${one ? esc(one.name) : `Chog #${k.metadataId}`}</b>${k.source === 'token' ? '<i class="ok" title="Verified on Monad">✓</i>' : ''}</span>`
    : a.hasWallet && a.tokens && !a.tokens.length ? '<span class="chog-chip none">No Chog · Free class</span>'
      : `<button class="chog-cta" data-act="chog" id="chog-cta"><span>Enter with CHOG</span></button>`;
  return `<div class="ident">
<button class="player-chip" data-act="${nick ? 'nick' : 'career'}" aria-label="${nick ? 'Set your callsign' : 'Career'}">${tokenSvg(fav ? fav.accent : null, fav?.id)}<span class="pc-txt"><b id="callsign">${esc(displayName(c.profile))}</b>${nick ? `<i class="new edit">${ICON.edit}</i>` : ''}
<span class="lvl"><b class="num" id="hublevel">LV ${lv.level}</b><span class="xpbar"><i style="width:${Math.round((lv.into / lv.next) * 100)}%"></i></span><span class="num" id="hubxp">${p ? `${p.into} / ${p.next} XP` : '0 XP'}</span></span></span></button>
${chog}
<div class="ident-right">
  <button class="cur" data-act="upgrades" aria-label="Shards">${ICON.shard}<b class="num" id="hubshards">${p?.shards ?? 0}</b>${ready ? `<i class="dot num">${ready}</i>` : ''}</button>
  <button class="cur" data-act="ranks" aria-label="Rating">${ICON.star}<b class="num" id="hubrating">${p?.rating ?? 1000}</b></button>
  ${a.signedIn ? '' : '<button class="btn small ghost" data-act="signin" id="signin-cta">Sign in</button>'}
  <button class="icon-btn" data-act="settings" aria-label="Settings">${ICON.gear}</button>
</div>
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

/** The live operator (drawn by the game's own renderer behind the hub, CF) with the roster arrows and its name plate. */
function heroStage(c: HubCtx): string {
  const h = heroById(c.heroId);
  const i = HEROES.findIndex((x) => x.id === h.id);
  const prev = HEROES[(i + HEROES.length - 1) % HEROES.length].id, next = HEROES[(i + 1) % HEROES.length].id;
  const ab = classOf(c.acct).power.signature?.name ?? h.ability.name;
  return `<div class="op-stage">
  <button class="icon-btn op-arrow" data-hero="${prev}" data-pick="1" aria-label="Previous operator">${ICON.prev}</button>
  <button class="op-show" data-go="start" aria-label="Operator details: ${esc(h.name)}"></button>
  <button class="icon-btn op-arrow" data-hero="${next}" data-pick="1" aria-label="Next operator">${ICON.next}</button>
</div>
<div class="op-name"><b>${esc(h.name)}</b><small><i class="dept dept-${h.dept}">${esc(h.role)}</i> · ${esc(WEAPONS[h.weapon].name)} · ${esc(ab)}</small></div>`;
}

/** Mode, the one PLAY, and what the server says about the queue. */
function playBar(c: HubCtx): string {
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
  let state = '';
  let status = '';
  if (sel === '5v5' && lock) {
    disabled = true;
    status = `<p class="status warn" id="lockwhy"><b>CHOG HOLDERS ONLY</b> · ${esc(lock)}</p>${!c.acct.signedIn || !c.acct.hasWallet ? '<button class="btn small" data-act="chog">Enter with CHOG</button>' : ''}`;
  }
  if (sel !== 'solo' && !v.url) { disabled = true; status = '<p class="status warn">Online unavailable</p>'; }
  if (v.follower && sel !== 'solo') { disabled = true; status = '<p class="status">Leader starts the match</p>'; }
  if (busy) {
    playLabel = 'Cancel';
    playAttr = 'data-act="online-cancel"';
    disabled = false;
    state = ' loading';
    status = v.state === 'connecting'
      ? `<p class="status" id="queuestatus">${esc(v.message || 'Connecting…')}</p>`
      : `<p class="status num" id="queuestatus">Finding players · ${esc(v.queue?.mode ?? sel)} · ${v.queue?.have ?? 0}/${v.queue?.need ?? 0}</p>`;
  } else if (v.state === 'match') { status = '<p class="status good">Match found</p>'; state = ' found'; }
  else if (v.message && !status) status = `<p class="status warn">${esc(v.message)}</p>`;
  const warn = c.acct.ticketWarning ? TICKET_WARN[c.acct.ticketWarning] ?? c.acct.ticketWarning : c.netProfile?.note ?? '';
  if (warn) status += `<p class="status warn small">${esc(warn)}</p>`;
  return `<div class="modes4" role="group" aria-label="Mode">${modes}</div>
<div class="play-wrap"><button class="play-cta${state}" ${playAttr}${disabled ? ' disabled' : ''} id="playbtn"><span class="pl">${esc(playLabel)}</span><small>${busy ? '' : esc(`${MODE_INFO[sel].label} · ${MODE_INFO[sel].sub}`)}</small></button>${status}</div>`;
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

// ---- the hub (CF): the live room is the background; the operator stands in it; one PLAY ----
export function hubHtml(c: HubCtx): string {
  const ready = upgradesReady(c.acct);
  return `<div class="screen hub cf" id="hub">
<header class="hub-top">${identity(c)}</header>
<div class="hub-mark" aria-hidden="true"><span>CHOG</span><b>ROOM ZERO</b></div>
<div class="hub-hero">${heroStage(c)}</div>
<nav class="hub-nav" aria-label="More">
  <button class="navbtn" data-act="upgrades">${ICON.up}<span>Upgrades</span>${ready ? ` <i class="num dot">${ready}</i>` : ''}</button>
  <button class="navbtn" data-act="career">${ICON.card}<span>Career</span></button>
  <button class="navbtn" data-act="medals">${ICON.medal}<span>Medals</span> <i class="num">${Object.keys(c.medals).length}/${MEDALS.length}</i></button>
  <button class="navbtn" data-act="ranks">${ICON.board}<span>Leaderboard</span></button>
  <button class="navbtn" data-act="howto">${ICON.help}<span>Help</span></button>
  <button class="navbtn demo-link" data-act="demo"><span class="demo">DEMO</span></button>
</nav>
<aside class="hub-right">${classOf(c.acct).source !== 'free' ? chogPanel(c) : ''}${squadPanel(c)}${boardPreview(c)}</aside>
<footer class="hub-bottom">${playBar(c)}</footer>
</div>`;
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

// ---- Enter with CHOG (CF): your Chog is your game identity. Ownership = eligibility; the signature = authentication ----
export interface ChogSheet { step: ChogStep; wallets: { id: string; name: string }[]; wallet: string; ready: boolean; off: boolean }

const CHOG_MARK = '<svg viewBox="0 0 120 120" class="chog-mark" aria-hidden="true"><circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="10 7"/><path d="M60 22l8 14 15-6-3 16 15 5-12 11 9 13-16 1-1 16-14-8-12 11-4-16-16 3 7-15-14-8 15-6-4-16 16 5z" fill="#6B3FA0" stroke="#0E091C" stroke-width="3"/><ellipse cx="60" cy="66" rx="17" ry="13" fill="#FFF8E7"/><circle cx="53" cy="63" r="3.4" fill="#0E091C"/><circle cx="67" cy="63" r="3.4" fill="#0E091C"/><circle cx="47" cy="71" r="3" fill="#FF6B9D" opacity=".85"/><circle cx="73" cy="71" r="3" fill="#FF6B9D" opacity=".85"/></svg>';

/** The four steps the player sees, in order, so every state says where it is. */
const CHOG_TRACK = ['Wallet', 'Chog', 'Signature', 'Room Zero'];

export function chogHtml(c: ChogSheet, host: string): string {
  const st = c.step;
  const at = st.s === 'pick' || st.s === 'connecting' || st.s === 'network' ? 0 : st.s === 'checking' || st.s === 'none' ? 1 : st.s === 'signing' || st.s === 'verifying' ? 2 : st.s === 'error' ? -1 : 3;
  const track = `<ol class="chog-track" aria-label="Steps">${CHOG_TRACK.map((t, i) => `<li class="${i < at ? 'done' : i === at ? 'now' : ''}">${t}</li>`).join('')}</ol>`;
  const busy = (t: string, sub = '', key: string = st.s) => `<div class="chog-busy" id="chogstate" data-state="${key}"><i class="spin" aria-hidden="true"></i><p><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</p></div>`;
  let body = '';
  switch (st.s) {
    case 'pick':
      if (c.off) body = '<p class="note warn" id="chogstate" data-state="off">Sign-in is not available right now.</p>';
      else if (!c.ready) body = busy('Looking for wallets', '', 'finding');
      else if (!c.wallets.length) body = `<p class="note" id="chogstate" data-state="nowallet">No wallet in this browser.</p><div class="btns"><a class="btn" href="https://metamask.app.link/dapp/${esc(host)}" rel="noopener">Open in MetaMask</a></div>`;
      else body = `<p class="chog-lede" id="chogstate" data-state="pick">Your Chog is your operator. We look for it in your wallet, then you sign a free message to prove the wallet is yours.</p>
<div class="chog-wallets">${c.wallets.map((w) => `<button class="btn chog-wallet" data-chogwallet="${esc(w.id)}">${esc(w.name)}</button>`).join('')}</div>`;
      break;
    case 'connecting': body = busy(`Connecting to ${esc(st.wallet)}`, 'Approve in your wallet'); break;
    case 'network': body = `<p class="note warn" id="chogstate" data-state="network"><b>Switch networks to continue.</b> Chog Genesis lives on Monad.</p><div class="btns"><button class="btn primary" data-act="chog-switch">Switch to Monad</button><button class="btn" data-act="chog-other">Back</button></div>`; break;
    case 'checking': body = busy('Looking for your Chog', 'Reading Monad'); break;
    case 'none': body = `<p class="note warn" id="chogstate" data-state="none"><b>CHOG not found in this wallet.</b> You can still play every mode except 5v5.</p><div class="btns"><button class="btn" data-act="chog-other">Try another wallet</button><button class="btn primary" data-act="chog-free">Play free</button></div>`; break;
    case 'signing': body = busy(`${st.count} Chog found${st.best ? ` · best ${esc(st.best)}` : ''}`, 'Sign the message in your wallet. It is free and sends nothing.'); break;
    case 'verifying': body = busy('Checking your signature'); break;
    case 'loading': body = busy('Verifying your Chog', 'Reading your tokens on Monad'); break;
    case 'done': body = `<p class="note good" id="chogstate" data-state="done"><b>CHOG verified.</b> ${esc(st.name)}</p>`; break;
    case 'error': body = `<p class="note warn" id="chogstate" data-state="error" data-code="${st.code}"><b>${esc(CHOG_ERRORS[st.code])}</b></p><div class="btns"><button class="btn primary" data-act="chog-retry">Try again</button><button class="btn" data-act="chog-other">Back</button></div>`; break;
  }
  return `<div class="card dialog chog-sheet" id="chogsheet" role="dialog" aria-label="Enter with CHOG">
<button class="icon-btn small close" data-act="back" aria-label="Close">×</button>
<div class="chog-head">${CHOG_MARK}<div><div class="kicker">Chog Genesis · Monad</div><h2>Enter with CHOG</h2></div></div>
${track}${body}</div>`;
}
