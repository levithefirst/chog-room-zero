// Account progression and the Chog class system on screen (master build, stage E): the Progress tab, the identity
// panel on the Online screen, and the rewards line after an online match. Plain HTML from plain data; everything
// shown comes from the site or the game server, never from the browser's own guess.
import { TIER_DEFS, UPGRADES, UPGRADE_IDS, powerFor, tierOfMetadataId, signatureFor, type Tier } from '../config/power';
import { REWARDS } from '../config/progression';
import type { AccountProfile, GameConfig, OwnedToken, Reward, TicketProfile } from '../net/account';
import type { NetProfile } from '../net/protocol';
import { esc } from './screens';

export interface AcctView {
  config: GameConfig | null;
  signedIn: boolean;
  /** Database switched on (progression is saved). */
  progression: boolean;
  profile: AccountProfile | null;
  /** null = not loaded; [] = none held. */
  tokens: OwnedToken[] | null;
  tokensError: string | null;
  hasWallet: boolean;
  /** What to send for the next ticket: a held token, a demo number, or nothing (free). */
  choice: { tokenId?: number; demo?: number } | null;
  ticket: TicketProfile | null;
  ticketWarning: string | null;
  board: { rank: number; account: string; rating: number; level: number; wins: number; matches: number }[] | null;
  busy: boolean;
  message: string;
}

export const emptyAcct = (): AcctView => ({
  config: null, signedIn: false, progression: false, profile: null, tokens: null, tokensError: null, hasWallet: false,
  choice: null, ticket: null, ticketWarning: null, board: null, busy: false, message: '',
});

export const tierBadge = (t: Tier, demo = false) =>
  `<span class="tier tier-${t}">${esc(TIER_DEFS[t].label)}</span>${demo ? ' <span class="demo">DEMO</span>' : ''}`;

/** One line that says exactly what a tier does in a match (numbers from src/config/power.ts). */
export function tierEffect(t: Tier): string {
  const p = powerFor(t);
  if (t === 'free') return 'Base operator.';
  const parts = [`+${Math.round((p.hpMul - 1) * 100)}% health`, `+${p.armor} armour`];
  if (p.damageMul > 1) parts.push(`+${Math.round((p.damageMul - 1) * 100)}% damage`, 'signature ability');
  return parts.join(', ') + '. Speed never changes.';
}

const WARN: Record<string, string> = {
  chain_unavailable: 'Monad could not be reached, so your Chog could not be verified this time. You play as a free profile; try again in a minute.',
  not_owned: 'That Chog is not in your signed-in wallet any more. You play as a free profile.',
};

/** Identity panel on the Online screen: who the server will think you are, and what 5v5 needs. */
export function onlineIdentityHtml(a: AcctView, server: NetProfile | null, demoToken: string | null): string {
  if (!a.config) return '<p class="note">Account service not reachable at this address: you play as a free profile (1v1 and 3v3).</p>';
  const combat = a.config.nftCombat;
  const rows: string[] = [];
  const pick = a.choice;
  if (pick?.demo) {
    const t = tierOfMetadataId(pick.demo)!;
    const sig = signatureFor(pick.demo);
    rows.push(`<p><span class="demo">DEMO</span> Chog #${pick.demo} · ${tierBadge(t)}${sig ? ` · ${esc(sig.name)}` : ''}. ${esc(tierEffect(t))}</p>
<p class="note">Demo: no wallet and no ownership check. Demo players only meet other demo players, and demo matches earn nothing.</p>`);
  } else if (pick?.tokenId && a.tokens) {
    const tk = a.tokens.find((x) => x.tokenId === pick.tokenId);
    if (tk) rows.push(`<p>Chog #${tk.metadataId} · ${tierBadge(tk.tier)}${tk.signature ? ` · ${esc(tk.signature.name)}` : ''} · verified on Monad when you connect.</p>
<p class="note">${combat ? esc(tierEffect(tk.tier)) : 'NFT combat power is switched off until the Core Feel Gate passes: you play at free power, but 5v5 and token history are on.'}</p>`);
  } else rows.push(`<p>Free profile${a.signedIn ? '' : ' (guest)'}. 1v1 and 3v3 are open to everyone.</p>`);
  if (a.signedIn && a.hasWallet) {
    if (a.tokens === null) rows.push('<p class="note">Checking your wallet on Monad…</p>');
    else if (a.tokensError) rows.push(`<p class="note warn">${esc(WARN[a.tokensError] ?? 'Could not read your wallet.')}</p>`);
    else if (!a.tokens.length) rows.push('<p class="note">No Chog Genesis token in your signed-in wallet.</p>');
    else rows.push(`<div class="btns tokens">${a.tokens.map((t) => `<button class="btn small${pick?.tokenId === t.tokenId ? ' on' : ''}" data-token="${t.tokenId}">Chog #${t.metadataId} ${tierBadge(t.tier)}</button>`).join('')}<button class="btn small${!pick ? ' on' : ''}" data-token="">Free</button></div>`);
  } else if (!a.signedIn) rows.push('<p class="note">Sign in (Settings) to save XP and shards. Sign in with the wallet that holds your Chog to unlock 5v5.</p>');
  else rows.push('<p class="note">Sign in with the wallet that holds your Chog (Settings) to unlock 5v5.</p>');
  if (demoToken && tierOfMetadataId(Number(demoToken))) {
    rows.push(pick?.demo ? '<div class="btns"><button class="btn small" data-act="demo-online-off">Leave demo</button></div>'
      : `<div class="btns"><button class="btn small" data-act="demo-online">Play online as <span class="demo">DEMO</span> Chog #${esc(demoToken)}</button></div>`);
  }
  if (a.ticketWarning) rows.push(`<p class="note warn">${esc(WARN[a.ticketWarning] ?? a.ticketWarning)}</p>`);
  if (server?.note) rows.push(`<p class="note warn">${esc(server.note)}</p>`);
  if (server) rows.push(`<p class="note">Server: ${server.verified ? (server.holder ? 'verified holder' : server.demo ? 'demo token' : 'checked account') : 'free profile'} · power ${tierBadge(server.tier, server.demo)}.</p>`);
  return `<section class="online-card ident"><h3>Your profile online</h3>${rows.join('')}</section>`;
}

/** Can this player try 5v5? The server decides; this only greys the button out with the reason. */
export function fiveLock(a: AcctView, server: NetProfile | null): string | null {
  if (server?.holder || server?.demo || a.choice?.demo || (a.choice?.tokenId && a.tokens?.some((t) => t.tokenId === a.choice!.tokenId))) return null;
  return 'Verified Chog holders only';
}

export function progressTabHtml(a: AcctView): string {
  if (!a.config) return '<section class="prog"><p class="note">The account service is not reachable here, so nothing is saved online.</p></section>';
  if (!a.signedIn) return '<section class="prog"><h3>Progress</h3><p class="note">Sign in (Settings) to earn XP, levels and shards from online matches. Guests keep only this device\'s solo records.</p></section>';
  if (!a.progression || !a.profile) return '<section class="prog"><h3>Progress</h3><p class="note warn">Saved progression is offline (no database connected yet). Online play still works; nothing is credited until it is connected.</p></section>';
  const p = a.profile;
  const ups = UPGRADE_IDS.map((id) => {
    const d = UPGRADES[id], rank = p.upgrades[id], cost = d.costs[rank];
    const btn = rank >= d.ranks ? '<span class="note">max</span>'
      : `<button class="btn small" data-upgrade="${id}"${p.shards < cost || a.busy ? ' disabled' : ''}>${cost} shards</button>`;
    return `<tr><td><b>${esc(d.name)}</b><br><small>${esc(d.text)}</small></td><td class="num">${rank}/${d.ranks}</td><td>${btn}</td></tr>`;
  }).join('');
  const board = a.board?.length
    ? `<table class="kv board"><tr><th>#</th><th>Player</th><th>Rating</th><th>Level</th><th>Wins</th></tr>${a.board.map((r) => `<tr class="${p.account.startsWith(r.account) ? 'me' : ''}"><td class="num">${r.rank}</td><td>${esc(r.account)}</td><td class="num">${r.rating}</td><td class="num">${r.level}</td><td class="num">${r.wins}/${r.matches}</td></tr>`).join('')}</table>`
    : '<p class="note">No rated matches yet.</p>';
  return `<section class="prog"><h3>Level ${p.level}</h3>
<div class="xpbar"><i style="width:${Math.round((p.into / p.next) * 100)}%"></i></div>
<p class="num">${p.into} / ${p.next} XP · <b>${p.shards}</b> shards · rating <b>${p.rating}</b> · ${p.wins} wins in ${p.matches} matches</p>
<p class="note">Earned in validated online matches only: ${REWARDS.xpPlay} XP and ${REWARDS.shardsPlay} shards for playing, ${REWARDS.xpWin} XP and ${REWARDS.shardsWin} shards more for a win, ${REWARDS.xpPerKill} XP a kill (up to ${REWARDS.maxKills}). Rating is separate from power: beating a stronger profile earns more.</p>
<h3>Upgrades</h3><table class="kv ups">${ups}</table>
<p class="note">Free players can reach the starting power of a Common Chog. Shards are earned only by playing; they cannot be bought.</p>
${a.message ? `<p class="note warn">${esc(a.message)}</p>` : ''}
<h3>Ratings</h3>${board}</section>`;
}

export function rewardLine(over: { settle: boolean }, demo: boolean, signedIn: boolean, r: Reward | null | undefined, pending: boolean, note: string): string {
  if (demo) return '<p class="pb"><span class="demo">DEMO</span> match: no XP, shards or rating.</p>';
  if (!over.settle) return `<p class="pb">${signedIn ? 'Not saved: nobody in this match had a checked account ticket.' : 'Sign in to earn XP and shards from online matches.'}</p>`;
  if (pending) return '<p class="pb">Saving the result…</p>';
  if (r) return `<p class="pb num">+${r.xp} XP · +${r.shards} shards · rating ${r.ratingBefore} → ${r.ratingAfter}${r.xp === 0 ? ' (no reward: left early, very short match, or daily limit)' : ''}</p>`;
  return `<p class="pb">${esc(note || 'Result not saved to your account.')}</p>`;
}
