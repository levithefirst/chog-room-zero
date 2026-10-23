// Medals (RC-7): a small set of achievements earned from real, tracked play. Every unlock rule is a pure function of
// the career records (after the run is recorded) and the run that just ended, so it is deterministic and tested.
// A signed-in player's medals are awarded and stored on the server (api/_lib/career.ts uses these same rules); a guest's
// last for the session. No rewards, currency or random drops: a medal is a record of play.
import type { KeyValueStore } from '../nft/history';
import type { Records } from './records';
import { HEROES } from '../config/heroes.js';

/** The hero's base health (before any tier power): Ace's damage limit. Unknown heroes count as 100. */
const heroMaxHp = (id: string) => HEROES.find((h) => h.id === id)?.maxHp ?? 100;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

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
  /** GP: teammates you got up, times you were got up, loot bags you took, grenades thrown, AI teammates eliminated. */
  revives?: number;
  revived?: number;
  loots?: number;
  thrown?: number;
  alliesLost?: number;
}

/** GP: an account's online career totals (from the settled, server-reported matches; never from the browser). */
export interface OnlineTotals { matches: number; finished: number; wins: number; kills: number }
export const NO_ONLINE: OnlineTotals = { matches: 0, finished: 0, wins: 0, kills: 0 };

export interface MedalDef {
  id: string;
  name: string;
  rarity: Rarity;
  text: string;
  goal: number;
  /** Progress towards `goal` from the records (and online totals), plus the run that just ended for one-run medals. */
  progress(r: Records, run: RunFacts | null, online?: OnlineTotals): number;
}

// Full Squad: a clear with every roster character.
const OPERATORS = HEROES.map((h) => h.id);
const clearsWith = (r: Records) => OPERATORS.filter((h) => (r.heroes[h]?.wins ?? 0) > 0).length;
const allKills = (r: Records, o?: OnlineTotals) => r.overall.kills + (o?.kills ?? 0);
const won = (run: RunFacts | null) => !!run?.won;

/**
 * GP (owner 2026-10-17: "at least 30 medals ... Rare and Epic must not be handed out casually"); H34 (owner 2026-10-19:
 * "40 medals ... make achievement requirements approximately 30% harder ... Common remains achievable ... avoid absurd
 * grind ... based on authoritative game state"). 40 medals: 19 common (firsts and habits), 12 uncommon (a run done well,
 * a career started), 7 rare (hard runs and long careers), 2 epic (near-perfect runs). Every count went up about 30%
 * (10 -> 13, 25 -> 33, 100 -> 130 ...); a first (one kill, one clear, one revive) stays a first, and a medal whose count
 * cannot grow (three kills is a Hat Trick) got a condition instead (never downed). Only numbers the server stores for
 * a verified run or a settled match count (api/_lib/career.ts awardDue runs these same rules). The rare and epic bars
 * are measured against autopilot runs (tests/gp-progress.test.ts). Ids are kept from RC-7 and GP, so medals already
 * earned stay earned even where the bar rose.
 */
export const MEDALS: MedalDef[] = [
  // ---- common (19) ----
  { id: 'first-blood', name: 'First Blood', rarity: 'common', text: 'Down your first hostile.', goal: 1, progress: (r, _run, o) => allKills(r, o) },
  { id: 'cleared', name: 'Lights On', rarity: 'common', text: 'Clear a room.', goal: 1, progress: (r) => r.overall.wins },
  { id: 'regular', name: 'Regular', rarity: 'common', text: 'Play 20 runs.', goal: 20, progress: (r) => r.overall.runs },
  { id: 'scavenger', name: 'Scavenger', rarity: 'common', text: 'Collect 10 pickups in one run.', goal: 10, progress: (_r, run) => run?.pickups ?? 0 },
  { id: 'toolkit', name: 'Toolkit', rarity: 'common', text: 'Use your ability 4 times in one run.', goal: 4, progress: (_r, run) => run?.abilities ?? 0 },
  { id: 'survivor', name: 'Survivor', rarity: 'common', text: 'Stay alive for 2 minutes in one run.', goal: 120, progress: (_r, run) => run?.seconds ?? 0 },
  { id: 'looter', name: 'Looter', rarity: 'common', text: 'Take 10 kits from the fallen in total.', goal: 10, progress: (r) => r.overall.loots },
  { id: 'medic', name: 'Medic', rarity: 'common', text: 'Revive a teammate.', goal: 1, progress: (r, run) => Math.max(r.overall.revives, run?.revives ?? 0) },
  { id: 'back-up', name: 'Back Up', rarity: 'common', text: 'Get revived by a teammate.', goal: 1, progress: (_r, run) => run?.revived ?? 0 },
  { id: 'pin-puller', name: 'Pin Puller', rarity: 'common', text: 'Throw 20 grenades in total.', goal: 20, progress: (r) => r.overall.thrown },
  { id: 'hat-trick', name: 'Hat Trick', rarity: 'common', text: 'Down 3 hostiles in one run without ever going down.', goal: 3,
    progress: (_r, run) => (run && (run.revived ?? 0) === 0 && run.hpLeft > 0 ? run.kills : 0) },
  { id: 'ten-down', name: 'Body Count', rarity: 'common', text: 'Down 20 hostiles in total.', goal: 20, progress: (r, _run, o) => allKills(r, o) },
  { id: 'committed', name: 'Committed', rarity: 'common', text: 'Play 40 runs.', goal: 40, progress: (r) => r.overall.runs },
  { id: 'hoarder', name: 'Hoarder', rarity: 'common', text: 'Collect 20 pickups in one run.', goal: 20, progress: (_r, run) => run?.pickups ?? 0 },
  { id: 'three-faces', name: 'Many Faces', rarity: 'common', text: 'Clear a room with 4 different characters.', goal: 4, progress: (r) => clearsWith(r) },
  { id: 'heavy-hitter', name: 'Heavy Hitter', rarity: 'common', text: 'Deal 3,000 damage in total.', goal: 3000, progress: (r) => r.overall.damageDealt },
  { id: 'online-debut', name: 'Debut', rarity: 'common', text: 'Finish an online match.', goal: 1, progress: (_r, _run, o) => o?.finished ?? 0 },
  { id: 'online-win', name: 'Taken', rarity: 'common', text: 'Win an online match.', goal: 1, progress: (_r, _run, o) => o?.wins ?? 0 },
  // H34 new: three grenades in one run (the run's own count, stored with it).
  { id: 'grenadier', name: 'Grenadier', rarity: 'common', text: 'Throw 3 grenades in one run.', goal: 3, progress: (_r, run) => run?.thrown ?? 0 },
  // ---- uncommon (12) ----
  { id: 'exterminator', name: 'Exterminator', rarity: 'uncommon', text: 'Down 33 hostiles in total.', goal: 33, progress: (r, _run, o) => allKills(r, o) },
  { id: 'steady-hand', name: 'Steady Hand', rarity: 'uncommon', text: 'Clear a room with 60% accuracy or better (13+ bullets).', goal: 1,
    progress: (_r, run) => (won(run) && run!.bullets >= 13 && run!.hits / run!.bullets >= 0.6 ? 1 : 0) },
  { id: 'close-call', name: 'Close Call', rarity: 'uncommon', text: 'Clear a room with 10 health or less.', goal: 1, progress: (_r, run) => (won(run) && run!.hpLeft <= 10 ? 1 : 0) },
  { id: 'veteran', name: 'Veteran', rarity: 'uncommon', text: 'Play 130 runs.', goal: 130, progress: (r) => r.overall.runs },
  { id: 'lifeline', name: 'Lifeline', rarity: 'uncommon', text: 'Revive teammates 7 times in total.', goal: 7, progress: (r) => r.overall.revives },
  { id: 'picker', name: 'Picker', rarity: 'uncommon', text: 'Take 20 kits from the fallen in total.', goal: 20, progress: (r) => r.overall.loots },
  { id: 'brawler', name: 'Brawler', rarity: 'uncommon', text: 'Down 4 hostiles in one run and clear it.', goal: 4, progress: (_r, run) => (won(run) ? run!.kills : 0) },
  { id: 'online-regular', name: 'Ranked Regular', rarity: 'uncommon', text: 'Finish 13 online matches.', goal: 13, progress: (_r, _run, o) => o?.finished ?? 0 },
  { id: 'ten-clears', name: 'Room Service', rarity: 'uncommon', text: 'Clear a room 13 times.', goal: 13, progress: (r) => r.overall.wins },
  { id: 'second-wind', name: 'Second Wind', rarity: 'uncommon', text: 'Get revived, then clear the room with 2 or more downs of your own.', goal: 1,
    progress: (_r, run) => (won(run) && (run!.revived ?? 0) > 0 && run!.kills >= 2 ? 1 : 0) },
  // H34 new: Hoarder's next step, pickups in one run (owner 2026-10-23: 30, was 12); thirty downs across settled online matches.
  { id: 'pack-rat', name: 'Pack Rat', rarity: 'uncommon', text: 'Collect 30 pickups in one run.', goal: 30, progress: (_r, run) => run?.pickups ?? 0 },
  { id: 'online-hunter', name: 'Hunter', rarity: 'uncommon', text: 'Down 30 players in online matches.', goal: 30, progress: (_r, _run, o) => o?.kills ?? 0 },
  // ---- rare (7) ----
  // GP: under 30 s (was 60); H34: under 25 s.
  { id: 'in-and-out', name: 'In and Out', rarity: 'rare', text: 'Clear a room in under 25 seconds.', goal: 1, progress: (_r, run) => (won(run) && run!.seconds < 25 ? 1 : 0) },
  { id: 'full-squad', name: 'Full Squad', rarity: 'rare', text: 'Clear a room once with each roster character.', goal: OPERATORS.length, progress: (r) => clearsWith(r) },
  { id: 'centurion', name: 'Centurion', rarity: 'rare', text: 'Down 130 hostiles in total.', goal: 130, progress: (r, _run, o) => allKills(r, o) },
  { id: 'last-stand', name: 'Last Stand', rarity: 'rare', text: 'Clear a room after both AI teammates are out, with 4 or more downs of your own.', goal: 1,
    progress: (_r, run) => (won(run) && (run!.alliesLost ?? 0) >= 2 && run!.kills >= 4 ? 1 : 0) },
  { id: 'guardian', name: 'Guardian', rarity: 'rare', text: 'Revive teammates 33 times in total.', goal: 33, progress: (r) => r.overall.revives },
  { id: 'online-ace', name: 'Contender', rarity: 'rare', text: 'Win 13 online matches.', goal: 13, progress: (_r, _run, o) => o?.wins ?? 0 },
  // H34 new: a clear taking 30 damage or less with no teammate lost (Untouched's near miss, still rare).
  { id: 'iron-wall', name: 'Iron Wall', rarity: 'rare', text: 'Clear a room taking 30 damage or less, with no teammate lost.', goal: 1,
    progress: (_r, run) => (won(run) && run!.damageTaken <= 30 && (run!.alliesLost ?? 0) === 0 ? 1 : 0) },
  // ---- epic (2) ----
  { id: 'untouched', name: 'Untouched', rarity: 'epic', text: 'Clear a room without taking any damage.', goal: 1, progress: (_r, run) => (won(run) && run!.damageTaken === 0 ? 1 : 0) },
  // All five yourself, never downed, no teammate lost: 1 of 84 autopilot runs (4 with the teammate rule off).
  // V2: plus "less damage than one full health bar". Measured over 168 autopilot runs (V2 report): without it Ace came
  // in 1.8% of runs (3.0% with perks), above the epic bar; the runs it kept had taken 92 to 151 damage.
  { id: 'ace', name: 'Ace', rarity: 'epic', text: 'Clear a room with all five hostiles downed by you, never downed, no teammate lost, and less damage taken than your full health.', goal: 1,
    progress: (_r, run) => (won(run) && run!.kills >= 5 && (run!.revived ?? 0) === 0 && (run!.alliesLost ?? 0) === 0 && run!.damageTaken < heroMaxHp(run!.hero) ? 1 : 0) },
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
export function awardMedals(store: KeyValueStore, records: Records, run: RunFacts, at = new Date().toISOString(), online: OnlineTotals = NO_ONLINE): { unlocked: Unlocked; earned: MedalDef[] } {
  const unlocked = loadMedals(store);
  const earned: MedalDef[] = [];
  for (const m of MEDALS) {
    if (unlocked[m.id]) continue;
    if (m.progress(records, run, online) >= m.goal) { unlocked[m.id] = at; earned.push(m); }
  }
  if (earned.length) {
    try { store.setItem(MEDALS_KEY, JSON.stringify(unlocked)); } catch { /* storage blocked: shown this session */ }
  }
  return { unlocked, earned };
}

/** Progress to show on a locked medal card (career medals only; one-run medals show 0 until earned). */
export function medalProgress(m: MedalDef, r: Records, unlocked: Unlocked, online: OnlineTotals = NO_ONLINE): number {
  if (unlocked[m.id]) return m.goal;
  return Math.min(m.goal, Math.max(0, Math.floor(m.progress(r, null, online))));
}

/** The medals an account's stored career (and the run just stored, if any) now meets that it does not have yet. */
export function medalsDue(have: Record<string, unknown>, r: Records, run: RunFacts | null, online: OnlineTotals): MedalDef[] {
  return MEDALS.filter((m) => !have[m.id] && m.progress(r, run, online) >= m.goal);
}
