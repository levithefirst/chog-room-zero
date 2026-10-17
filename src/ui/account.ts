// Account state the hub and every screen read (master build stage E, master integration pass): what the site said about
// the signed-in account, its held Chogs, the ticket choice and the leaderboard. Plain data; the browser never guesses.
import { TIER_DEFS, powerFor, type Tier } from '../config/power';
import type { AccountProfile, Board, BoardRow, GameConfig, OwnedToken, TicketProfile } from '../net/account';
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
  /** The signed-in identities (Google, wallet) linked to this account, as the site reports them. */
  identities: { provider: 'google' | 'wallet'; label: string }[];
  /** What to send for the next ticket: a held token, a demo number, or nothing (free). */
  choice: { tokenId?: number; demo?: number } | null;
  ticket: TicketProfile | null;
  ticketWarning: string | null;
  /** The kills leaderboard page (null = not loaded), and your own row and rank. GP: two boards (solo, online), paged. */
  board: BoardRow[] | null;
  boardMe: BoardRow | null;
  boardTab: Board;
  boardOffset: number;
  boardTotal: number;
  /** The last load failed (shown with a retry), or is still running. */
  boardError: boolean;
  boardLoading: boolean;
  busy: boolean;
  message: string;
  /** The upgrade just bought (a short highlight on its card). */
  justBought: string | null;
}

export const emptyAcct = (): AcctView => ({
  config: null, signedIn: false, progression: false, profile: null, tokens: null, tokensError: null, hasWallet: false, identities: [],
  choice: null, ticket: null, ticketWarning: null, board: null, boardMe: null, boardTab: 'solo', boardOffset: 0, boardTotal: 0, boardError: false, boardLoading: false, busy: false, message: '', justBought: null,
});

export const tierBadge = (t: Tier, demo = false) =>
  `<span class="tier tier-${t}">${esc(TIER_DEFS[t].label)}</span>${demo ? ' <span class="demo">DEMO</span>' : ''}`;

/** One line that says exactly what a tier does in a match (numbers from src/config/power.ts). */
export function tierEffect(t: Tier): string {
  const p = powerFor(t);
  if (t === 'free') return 'Base operator: upgrades take it further.';
  const parts = [`+${Math.round((p.hpMul - 1) * 100)}% health`, `+${p.armor} armour`];
  if (p.damageMul > 1) parts.push(`+${Math.round((p.damageMul - 1) * 100)}% damage`);
  if (t === 'legendary') parts.push('its own signature ability');
  return parts.join(', ') + '. Speed never changes.';
}

export const TICKET_WARN: Record<string, string> = {
  chain_unavailable: 'Monad could not be reached, so your Chog could not be verified this time. You play as a free profile; try again in a minute.',
  not_owned: 'That Chog is not in your signed-in wallet any more. You play as a free profile.',
};
