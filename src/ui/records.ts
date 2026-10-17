// Practice records (RC-1, master integration pass): per hero and overall. A signed-in player's are aggregated on the
// server from stored runs (api/_lib/career.ts); a guest's live in a session memory store. Pure over a KeyValueStore.
import type { KeyValueStore } from '../nft/history';

export interface Best {
  bestWinSeconds: number | null; mostKills: number; runs: number; wins: number;
  // Career totals (RC-7, profile and medals). Older saves lack them; loadRecords fills 0.
  kills: number; bullets: number; hits: number; damageDealt: number; damageTaken: number; seconds: number; pickups: number; abilities: number;
  // GP: revives given, loot bags taken, grenades thrown (medals).
  revives: number; loots: number; thrown: number;
}
export interface Records { overall: Best; heroes: Record<string, Best> }
export interface RunSummary {
  hero: string; won: boolean; seconds: number; kills: number;
  bullets?: number; hits?: number; damageDealt?: number; damageTaken?: number; pickups?: number; abilities?: number;
  revives?: number; loots?: number; thrown?: number;
}
const TOTALS = ['kills', 'bullets', 'hits', 'damageDealt', 'damageTaken', 'seconds', 'pickups', 'abilities', 'revives', 'loots', 'thrown'] as const;

export const RECORDS_KEY = 'chog-room-zero:records:v1';
const empty = (): Best => ({ bestWinSeconds: null, mostKills: 0, runs: 0, wins: 0, kills: 0, bullets: 0, hits: 0, damageDealt: 0, damageTaken: 0, seconds: 0, pickups: 0, abilities: 0, revives: 0, loots: 0, thrown: 0 });
// Fill fields an older save does not have (and drop non-numbers), so totals always add up.
function norm(b: Partial<Best> | undefined): Best {
  const e = empty();
  if (!b) return e;
  for (const k of ['mostKills', 'runs', 'wins', ...TOTALS] as const) if (typeof b[k] === 'number' && Number.isFinite(b[k])) e[k] = b[k];
  e.bestWinSeconds = typeof b.bestWinSeconds === 'number' ? b.bestWinSeconds : null;
  return e;
}

export function loadRecords(store: KeyValueStore): Records {
  try {
    const r = JSON.parse(store.getItem(RECORDS_KEY) ?? 'null') as Records | null;
    if (r && r.overall && typeof r.overall.runs === 'number' && r.heroes) {
      const heroes: Record<string, Best> = {};
      for (const [k, v] of Object.entries(r.heroes)) heroes[k] = norm(v);
      return { overall: norm(r.overall), heroes };
    }
  } catch { /* corrupt: start fresh */ }
  return { overall: empty(), heroes: {} };
}

/** Records a finished run. Returns the new records and which bests this run set. */
export function recordBest(store: KeyValueStore, run: RunSummary): { records: Records; newBest: { time: boolean; kills: boolean } } {
  const rec = loadRecords(store);
  const newBest = { time: false, kills: false };
  for (const [b, isHero] of [[rec.overall, false], [(rec.heroes[run.hero] ??= empty()), true]] as const) {
    b.runs++;
    if (run.won) {
      b.wins++;
      if (b.bestWinSeconds === null || run.seconds < b.bestWinSeconds) { b.bestWinSeconds = run.seconds; if (isHero) newBest.time = true; }
    }
    if (run.kills > b.mostKills) { b.mostKills = run.kills; if (isHero) newBest.kills = true; }
    for (const k of TOTALS) b[k] += Math.max(0, run[k] ?? 0);
  }
  try { store.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch { /* storage blocked: still shown this session */ }
  return { records: rec, newBest };
}

export function fmtTime(s: number | null): string {
  if (s === null) return '--';
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}
