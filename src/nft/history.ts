// Token history. Guest runs write nothing (LOCKED). A bound run writes one result at match end.
// Today the store is localStorage on this device. A server store (Vercel route + Neon) is BLOCKED:
// it needs server-side ownership verification, which needs the UNKNOWN contract details.

export interface RunResult {
  won: boolean;
  seconds: number;
  kills: number;
  shots: number;
  hits: number;
  at: string;
}

export interface TokenHistory {
  tokenId: string;
  runs: number;
  wins: number;
  kills: number;
  deaths: number;
  bestWinSeconds: number | null;
  recent: RunResult[];
}

export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const key = (tokenId: string) => `chog-room-zero:history:${tokenId}`;

export function emptyHistory(tokenId: string): TokenHistory {
  return { tokenId, runs: 0, wins: 0, kills: 0, deaths: 0, bestWinSeconds: null, recent: [] };
}

export function loadHistory(store: KeyValueStore, tokenId: string): TokenHistory {
  try {
    const raw = store.getItem(key(tokenId));
    if (!raw) return emptyHistory(tokenId);
    const h = JSON.parse(raw) as TokenHistory;
    if (h.tokenId !== tokenId || typeof h.runs !== 'number') return emptyHistory(tokenId);
    return h;
  } catch {
    // Corrupt or blocked storage: start fresh rather than break the game.
    return emptyHistory(tokenId);
  }
}

/** Returns the updated history, or null for a guest (nothing is written). */
export function recordRun(store: KeyValueStore, tokenId: string | null, r: RunResult): TokenHistory | null {
  if (!tokenId) return null;
  const h = loadHistory(store, tokenId);
  h.runs++;
  if (r.won) {
    h.wins++;
    h.bestWinSeconds = h.bestWinSeconds === null ? r.seconds : Math.min(h.bestWinSeconds, r.seconds);
  } else h.deaths++;
  h.kills += r.kills;
  h.recent = [r, ...h.recent].slice(0, 10);
  try {
    store.setItem(key(tokenId), JSON.stringify(h));
  } catch {
    // Storage full or blocked: the run still counts on screen.
  }
  return h;
}
