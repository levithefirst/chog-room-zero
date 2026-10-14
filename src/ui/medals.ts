// Medals (RC-7): a small set of achievements earned from real, tracked play. Every unlock rule is a pure function of
// the career records (after the run is recorded) and the run that just ended, so it is deterministic and tested.
// A signed-in player's medals are awarded and stored on the server (api/_lib/career.ts uses these same rules); a guest's
// last for the session. No rewards, currency or random drops: a medal is a record of play.
import type { KeyValueStore } from '../nft/history';
import type { Records } from './records';

export type Rarity = 'common' | 'rare' | 'epic';

/** What the game knows about the run that just ended (the same numbers the results screen shows). */
export interface RunFacts {
  hero: string;
  won: boolean;
  seconds: number;
  kills: number;
  bullets: number;
  hits: number;
  damageTaken: number;
  hpLeft: number;
  pickups: number;
  abilities: number;
}

export interface MedalDef {
  id: string;
  name: string;
  rarity: Rarity;
  text: string;
  goal: number;
  /** Progress towards `goal` from the records, plus the run that just ended for one-run medals. */
  progress(r: Records, run: RunFacts | null): number;
}

const OPERATORS = ['kettle', 'mop', 'brick', 'wick'];

export const MEDALS: MedalDef[] = [
  { id: 'first-blood', name: 'First Blood', rarity: 'common', text: 'Down your first hostile.', goal: 1, progress: (r) => r.overall.kills },
  { id: 'cleared', name: 'Lights On', rarity: 'common', text: 'Clear Room Zero.', goal: 1, progress: (r) => r.overall.wins },
  { id: 'regular', name: 'Regular', rarity: 'common', text: 'Play 10 runs.', goal: 10, progress: (r) => r.overall.runs },
  { id: 'scavenger', name: 'Scavenger', rarity: 'common', text: 'Collect 3 pickups in one run.', goal: 3, progress: (_r, run) => run?.pickups ?? 0 },
  { id: 'toolkit', name: 'Toolkit', rarity: 'common', text: 'Use your ability 3 times in one run.', goal: 3, progress: (_r, run) => run?.abilities ?? 0 },
  { id: 'exterminator', name: 'Exterminator', rarity: 'rare', text: 'Down 25 hostiles in total.', goal: 25, progress: (r) => r.overall.kills },
  { id: 'survivor', name: 'Survivor', rarity: 'rare', text: 'Stay alive for 90 seconds in one run.', goal: 90, progress: (_r, run) => run?.seconds ?? 0 },
  { id: 'in-and-out', name: 'In and Out', rarity: 'rare', text: 'Clear the room in under 60 seconds.', goal: 1, progress: (_r, run) => (run?.won && run.seconds < 60 ? 1 : 0) },
  { id: 'steady-hand', name: 'Steady Hand', rarity: 'rare', text: 'Clear the room with 50% accuracy or better (10+ bullets).', goal: 1,
    progress: (_r, run) => (run?.won && run.bullets >= 10 && run.hits / run.bullets >= 0.5 ? 1 : 0) },
  { id: 'close-call', name: 'Close Call', rarity: 'rare', text: 'Clear the room with 15 health or less.', goal: 1, progress: (_r, run) => (run?.won && run.hpLeft <= 15 ? 1 : 0) },
  { id: 'untouched', name: 'Untouched', rarity: 'epic', text: 'Clear the room without taking any damage.', goal: 1, progress: (_r, run) => (run?.won && run.damageTaken === 0 ? 1 : 0) },
  { id: 'full-squad', name: 'Full Squad', rarity: 'epic', text: 'Clear the room once with each operator.', goal: OPERATORS.length,
    progress: (r) => OPERATORS.filter((h) => (r.heroes[h]?.wins ?? 0) > 0).length },
];

export const MEDALS_KEY = 'chog-room-zero:medals:v1';

/** Medal id -> when it was earned (ISO time). */
export type Unlocked = Record<string, string>;

export function loadMedals(store: KeyValueStore): Unlocked {
  try {
    const u = JSON.parse(store.getItem(MEDALS_KEY) ?? 'null') as Unlocked | null;
    if (u && typeof u === 'object') {
      const out: Unlocked = {};
      for (const m of MEDALS) if (typeof u[m.id] === 'string') out[m.id] = u[m.id];
      return out;
    }
  } catch { /* corrupt: start fresh */ }
  return {};
}

/**
 * After a run is recorded: unlock every medal whose goal is now met. Returns all unlocks and the new ones (in MEDALS
 * order). Unlocks are permanent; a later worse run never takes one away.
 */
export function awardMedals(store: KeyValueStore, records: Records, run: RunFacts, at = new Date().toISOString()): { unlocked: Unlocked; earned: MedalDef[] } {
  const unlocked = loadMedals(store);
  const earned: MedalDef[] = [];
  for (const m of MEDALS) {
    if (unlocked[m.id]) continue;
    if (m.progress(records, run) >= m.goal) { unlocked[m.id] = at; earned.push(m); }
  }
  if (earned.length) {
    try { store.setItem(MEDALS_KEY, JSON.stringify(unlocked)); } catch { /* storage blocked: shown this session */ }
  }
  return { unlocked, earned };
}

/** Progress to show on a locked medal card (career medals only; one-run medals show 0 until earned). */
export function medalProgress(m: MedalDef, r: Records, unlocked: Unlocked): number {
  if (unlocked[m.id]) return m.goal;
  return Math.min(m.goal, Math.max(0, Math.floor(m.progress(r, null))));
}
