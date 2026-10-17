// The browser's side of accounts and NFT verification (master build, stage E). Every call is same-origin to
// /api/game/<action>; the browser never decides ownership, power or rewards, it only shows what the site and the game
// server answered. Each call fails soft: on any error the game plays on as a free profile.
import type { Tier, Upgrades } from '../config/power';
import type { Records } from '../ui/records';
import type { NoReward, RewardLine } from '../config/progression';

export interface GameConfig { db: boolean; nftCombat: boolean; demo: boolean }
export interface OnlineCareer { matches: number; wins: number; kills: number; damage: number; survived: number; heroes: Record<string, { matches: number; wins: number; kills: number }> }
/** The signed-in account as the site stores it (api/_lib/career.ts AccountView): the one source of progression. */
export interface AccountProfile {
  account: string; xp: number; level: number; into: number; next: number; shards: number; rating: number; matches: number; wins: number; upgrades: Upgrades;
  callsign: string | null; favourite: string | null; pins: string[]; medals: Record<string, string>; practice: Records; online: OnlineCareer;
  nft: { tier: Tier; tokenId: number | null } | null;
}
export interface OwnedToken {
  tokenId: number; metadataId: number; name: string; oneOfOne: string | null; tier: Tier; tierLabel: string;
  signature: { name: string; text: string; telegraph: string; counter: string } | null; history: { matches: number; wins: number; kills: number } | null;
}
export interface TicketProfile { account: boolean; name: string; tier: Tier; tierLabel: string; tokenId: number | null; metadataId: number | null; tokenTier: Tier | null; holder: boolean; demo: boolean; upgrades: Upgrades; signature: string | null; oneOfOne: string | null }
export interface Reward { xp: number; shards: number; ratingBefore: number; ratingAfter: number; lines?: RewardLine[]; none?: NoReward }
export interface PracticeReward { xp: number; shards: number; lines: RewardLine[]; none: NoReward }

async function api<T>(action: string, body?: object): Promise<T | null> {
  try {
    // Never wait forever: a hung request fails soft after 10 s (the chain read can take a few seconds on its own).
    const signal = AbortSignal.timeout(10000);
    const r = await fetch(`/api/game/${action}`, body
      ? { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal }
      : { credentials: 'same-origin', cache: 'no-store', signal });
    if (!(r.headers.get('content-type') ?? '').includes('json')) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const gameConfig = () => api<GameConfig>('config');
export const loadProfile = () => api<{ signedIn: boolean; progression?: boolean; identities?: { provider: 'google' | 'wallet'; label: string }[]; profile?: AccountProfile }>('profile');
export const setCallsign = (name: string) => api<{ ok: boolean; callsign?: string; error?: string }>('callsign', { name });
export const setPrefs = (p: { favourite?: string | null; pins?: string[] }) => api<{ ok: boolean; error?: string }>('prefs', p);
export interface PracticeRun { runId: string; ticket?: string; demo?: boolean; hero: string; won: boolean; seconds: number; kills: number; bullets: number; hits: number; damageDealt: number; damageTaken: number; hpLeft: number; pickups: number; abilities: number }
/** A signed start ticket for one run: the run is paid only with it, and only once the claimed time has passed. */
export const practiceStart = () => api<{ ok: boolean; ticket?: string; runId?: string }>('practice-start', {});
export const practice = (r: PracticeRun) => api<{ ok: boolean; reason?: string; already?: boolean; reward?: PracticeReward; earned?: string[]; newBest?: { time: boolean; kills: boolean }; records?: Records; medals?: Record<string, string> }>('practice', r);
export const loadTokens = () => api<{ wallet: boolean; ok?: boolean; error?: string; tokens: OwnedToken[] }>('tokens');
export interface BoardRow { rank: number; name: string; kills: number; matches: number; wins: number; xp: number; level: number; rating: number; nftTier: Tier | null; you: boolean }
export const leaderboard = () => api<{ progression: boolean; rows: BoardRow[]; me: BoardRow | null }>('leaderboard');
export const buyUpgrade = (id: string) => api<{ ok: boolean; rank?: number; shards?: number; reason?: string }>('upgrade', { id });
export const settle = (matchId: string) => api<{ ok: boolean; already?: boolean; reason?: string; error?: string; mine?: Reward | null }>('settle', { matchId });
/** Whether a settle answer is worth asking again (no answer, the database or the game server briefly down); an
 * unknown or bad match, or a settled one, never is. */
export const settleRetryable = (r: { ok?: boolean; error?: string } | null): boolean => !r || r.error === 'progression_offline' || r.error === 'game_server';

/** A ticket for the game server: the chosen held token (verified by the site), or a demo token number. */
export async function fetchTicket(choice: { tokenId?: number; demo?: number }, name: string): Promise<{ ticket: string; profile: TicketProfile; warning?: string | null } | null> {
  const r = await api<{ ticket?: string; profile?: TicketProfile; warning?: string | null }>('ticket', { ...choice, name });
  return r?.ticket && r.profile ? { ticket: r.ticket, profile: r.profile, warning: r.warning } : null;
}
