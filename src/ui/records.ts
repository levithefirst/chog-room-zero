// Personal bests (RC-1). Guests included: saved in localStorage on this device only, per hero and overall.
// Pure over a KeyValueStore so it is unit-tested; corrupt or blocked storage never breaks the game.
import type { KeyValueStore } from '../nft/history';

export interface Best { bestWinSeconds: number | null; mostKills: number; runs: number; wins: number }
export interface Records { overall: Best; heroes: Record<string, Best> }
export interface RunSummary { hero: string; won: boolean; seconds: number; kills: number }

export const RECORDS_KEY = 'chog-room-zero:records:v1';
const empty = (): Best => ({ bestWinSeconds: null, mostKills: 0, runs: 0, wins: 0 });

export function loadRecords(store: KeyValueStore): Records {
  try {
    const r = JSON.parse(store.getItem(RECORDS_KEY) ?? 'null') as Records | null;
    if (r && r.overall && typeof r.overall.runs === 'number' && r.heroes) return r;
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
  }
  try { store.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch { /* storage blocked: still shown this session */ }
  return { records: rec, newBest };
}

export function fmtTime(s: number | null): string {
  if (s === null) return '--';
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}
