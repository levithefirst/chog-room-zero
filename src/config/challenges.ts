// V2 daily challenges (owner V2 §17: "I want to come back because I want to improve/unlock/master something"; report
// rank 14). Three a day (easy, medium, hard), the same for everyone, picked from the UTC date: no timers on screen, no
// streaks to lose, nothing sold, nothing that expires once earned. Progress comes only from what the server stored
// today (verified solo runs, settled online matches); each pays once (ledger reason 'challenge', ref day:id).
import { HEROES } from './heroes.js';

/** One stored result of today, solo run or online match (online rows have no bullets or damage taken). */
export interface DayRow {
  mode: 'solo' | 'online';
  hero: string;
  won: boolean;
  seconds: number;
  kills: number;
  bullets: number;
  hits: number;
  damageTaken: number;
  revives: number;
  loots: number;
  thrown: number;
  alliesLost: number;
}

export interface Challenge { id: string; tier: 1 | 2 | 3; text: string; goal: number; progress: (rows: DayRow[], hero: string) => number }

const sum = (rows: DayRow[], f: (r: DayRow) => number) => rows.reduce((n, r) => n + f(r), 0);
const solo = (rows: DayRow[]) => rows.filter((r) => r.mode === 'solo');
const name = (id: string) => HEROES.find((h) => h.id === id)?.name ?? id;

/** The pool. Each asks for a kind of play the game rewards (looting, reviving, aiming, clean clears), not just volume. */
export const CHALLENGES: Challenge[] = [
  { id: 'kills-6', tier: 1, text: 'Take down 6 hostiles', goal: 6, progress: (r) => sum(r, (x) => x.kills) },
  { id: 'loot-3', tier: 1, text: 'Take from 3 loot bags', goal: 3, progress: (r) => sum(r, (x) => x.loots) },
  { id: 'revive-1', tier: 1, text: 'Get a teammate back up', goal: 1, progress: (r) => sum(r, (x) => x.revives) },
  { id: 'nades-4', tier: 1, text: 'Throw 4 grenades', goal: 4, progress: (r) => sum(solo(r), (x) => x.thrown) },
  { id: 'win-hero', tier: 2, text: 'Clear a room as {hero}', goal: 1, progress: (r, h) => solo(r).filter((x) => x.won && x.hero === h).length },
  { id: 'win-2', tier: 2, text: 'Win 2 matches', goal: 2, progress: (r) => r.filter((x) => x.won).length },
  { id: 'steady', tier: 2, text: 'Clear a room with 35% of your bullets landing', goal: 1, progress: (r) => solo(r).filter((x) => x.won && x.bullets >= 20 && x.hits / x.bullets >= 0.35).length },
  { id: 'revive-3', tier: 2, text: 'Get teammates back up 3 times', goal: 3, progress: (r) => sum(r, (x) => x.revives) },
  { id: 'clean', tier: 3, text: 'Clear a room taking under 60 damage', goal: 1, progress: (r) => solo(r).filter((x) => x.won && x.damageTaken < 60).length },
  { id: 'quick', tier: 3, text: 'Clear a room in under 70 seconds', goal: 1, progress: (r) => solo(r).filter((x) => x.won && x.seconds < 70).length },
  { id: 'online-win', tier: 3, text: 'Win an online match', goal: 1, progress: (r) => r.filter((x) => x.mode === 'online' && x.won).length },
  { id: 'lead', tier: 3, text: 'Clear a room with 3 takedowns of your own and no teammate lost', goal: 1, progress: (r) => solo(r).filter((x) => x.won && x.kills >= 3 && x.alliesLost === 0).length },
];

/** Shards and XP a done challenge pays, by tier. */
export const CHALLENGE_REWARDS: Record<1 | 2 | 3, { shards: number; xp: number }> = { 1: { shards: 10, xp: 20 }, 2: { shards: 20, xp: 40 }, 3: { shards: 30, xp: 60 } };

/** The UTC day number (days since 1970-01-01). */
export const dayOf = (ms: number) => Math.floor(ms / 86_400_000);

const mix = (a: number, b: number) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  return (Math.imul(h, 0x27d4eb2f) ^ (h >>> 16)) >>> 0;
};

/** Today's three (one per tier) and the operator of the day, the same for every player. */
export function daily(day: number): { day: number; hero: string; list: { def: Challenge; text: string }[] } {
  const hero = HEROES[mix(day, 7) % HEROES.length].id;
  const list = ([1, 2, 3] as const).map((t) => {
    const pool = CHALLENGES.filter((c) => c.tier === t);
    const def = pool[mix(day, t) % pool.length];
    return { def, text: def.text.replace('{hero}', name(hero)) };
  });
  return { day, hero, list };
}
