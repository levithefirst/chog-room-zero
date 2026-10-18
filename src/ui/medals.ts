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
 * GP (owner 2026-10-17: "at least 30 medals ... Rare and Epic must not be handed out casually"). 36 medals: 18 common
 * (firsts and habits), 10 uncommon (a run done well, a career started), 6 rare (hard runs and long careers), 2 epic
 * (near-perfect runs). The rare and epic rules were measured against autopilot runs (tests/gp-medals.test.ts): an
 * epic in under 1 run in 100, every rare one-run medal in under 1 run in 10. Ids are kept from RC-7 so medals already
 * earned stay earned; Survivor (90 s alive) moved from rare to common, Full Squad from epic to rare.
 */
export const MEDALS: MedalDef[] = [
  // ---- common (18) ----
  { id: 'first-blood', name: 'First Blood', rarity: 'common', text: 'Down your first hostile.', goal: 1, progress: (r, _run, o) => allKills(r, o) },
  { id: 'cleared', name: 'Lights On', rarity: 'common', text: 'Clear Room Zero.', goal: 1, progress: (r) => r.overall.wins },
  { id: 'regular', name: 'Regular', rarity: 'common', text: 'Play 10 runs.', goal: 10, progress: (r) => r.overall.runs },
  { id: 'scavenger', name: 'Scavenger', rarity: 'common', text: 'Collect 3 pickups in one run.', goal: 3, progress: (_r, run) => run?.pickups ?? 0 },
  { id: 'toolkit', name: 'Toolkit', rarity: 'common', text: 'Use your ability 3 times in one run.', goal: 3, progress: (_r, run) => run?.abilities ?? 0 },
  { id: 'survivor', name: 'Survivor', rarity: 'common', text: 'Stay alive for 90 seconds in one run.', goal: 90, progress: (_r, run) => run?.seconds ?? 0 },
  { id: 'looter', name: 'Looter', rarity: 'common', text: 'Take a fallen hostile\'s kit.', goal: 1, progress: (r, run) => Math.max(r.overall.loots, run?.loots ?? 0) },
  { id: 'medic', name: 'Medic', rarity: 'common', text: 'Revive a teammate.', goal: 1, progress: (r, run) => Math.max(r.overall.revives, run?.revives ?? 0) },
  { id: 'back-up', name: 'Back Up', rarity: 'common', text: 'Get revived by a teammate.', goal: 1, progress: (_r, run) => run?.revived ?? 0 },
  { id: 'pin-puller', name: 'Pin Puller', rarity: 'common', text: 'Throw 10 grenades in total.', goal: 10, progress: (r) => r.overall.thrown },
  { id: 'hat-trick', name: 'Hat Trick', rarity: 'common', text: 'Down 3 hostiles in one run.', goal: 3, progress: (_r, run) => run?.kills ?? 0 },
  { id: 'ten-down', name: 'Ten Down', rarity: 'common', text: 'Down 10 hostiles in total.', goal: 10, progress: (r, _run, o) => allKills(r, o) },
  { id: 'committed', name: 'Committed', rarity: 'common', text: 'Play 25 runs.', goal: 25, progress: (r) => r.overall.runs },
  { id: 'hoarder', name: 'Hoarder', rarity: 'common', text: 'Collect 6 pickups in one run.', goal: 6, progress: (_r, run) => run?.pickups ?? 0 },
  { id: 'three-faces', name: 'Three Faces', rarity: 'common', text: 'Clear the room with 3 different characters.', goal: 3, progress: (r) => clearsWith(r) },
  { id: 'heavy-hitter', name: 'Heavy Hitter', rarity: 'common', text: 'Deal 2,000 damage in total.', goal: 2000, progress: (r) => r.overall.damageDealt },
  { id: 'online-debut', name: 'Debut', rarity: 'common', text: 'Finish an online match.', goal: 1, progress: (_r, _run, o) => o?.finished ?? 0 },
  { id: 'online-win', name: 'Taken', rarity: 'common', text: 'Win an online match.', goal: 1, progress: (_r, _run, o) => o?.wins ?? 0 },
  // ---- uncommon (10) ----
  { id: 'exterminator', name: 'Exterminator', rarity: 'uncommon', text: 'Down 25 hostiles in total.', goal: 25, progress: (r, _run, o) => allKills(r, o) },
  { id: 'steady-hand', name: 'Steady Hand', rarity: 'uncommon', text: 'Clear the room with 50% accuracy or better (10+ bullets).', goal: 1,
    progress: (_r, run) => (won(run) && run!.bullets >= 10 && run!.hits / run!.bullets >= 0.5 ? 1 : 0) },
  { id: 'close-call', name: 'Close Call', rarity: 'uncommon', text: 'Clear the room with 15 health or less.', goal: 1, progress: (_r, run) => (won(run) && run!.hpLeft <= 15 ? 1 : 0) },
  { id: 'veteran', name: 'Veteran', rarity: 'uncommon', text: 'Play 100 runs.', goal: 100, progress: (r) => r.overall.runs },
  { id: 'lifeline', name: 'Lifeline', rarity: 'uncommon', text: 'Revive teammates 5 times in total.', goal: 5, progress: (r) => r.overall.revives },
  { id: 'picker', name: 'Picker', rarity: 'uncommon', text: 'Take 15 kits from the fallen in total.', goal: 15, progress: (r) => r.overall.loots },
  { id: 'brawler', name: 'Brawler', rarity: 'uncommon', text: 'Down 4 hostiles in one run.', goal: 4, progress: (_r, run) => run?.kills ?? 0 },
  { id: 'online-regular', name: 'Ranked Regular', rarity: 'uncommon', text: 'Finish 10 online matches.', goal: 10, progress: (_r, _run, o) => o?.finished ?? 0 },
  { id: 'ten-clears', name: 'Ten Clears', rarity: 'uncommon', text: 'Clear the room 10 times.', goal: 10, progress: (r) => r.overall.wins },
  { id: 'second-wind', name: 'Second Wind', rarity: 'uncommon', text: 'Get revived, then clear the room in the same run.', goal: 1, progress: (_r, run) => (won(run) && (run!.revived ?? 0) > 0 ? 1 : 0) },
  // ---- rare (6) ----
  // GP: under 30 s (was 60): 50 of 84 autopilot runs cleared in under 60 s, about 5 in under 30 (tests/gp-progress).
  { id: 'in-and-out', name: 'In and Out', rarity: 'rare', text: 'Clear the room in under 30 seconds.', goal: 1, progress: (_r, run) => (won(run) && run!.seconds < 30 ? 1 : 0) },
  { id: 'full-squad', name: 'Full Squad', rarity: 'rare', text: 'Clear the room once with each roster character.', goal: OPERATORS.length, progress: (r) => clearsWith(r) },
  { id: 'centurion', name: 'Centurion', rarity: 'rare', text: 'Down 100 hostiles in total.', goal: 100, progress: (r, _run, o) => allKills(r, o) },
  { id: 'last-stand', name: 'Last Stand', rarity: 'rare', text: 'Clear the room after both AI teammates are out, with 3 or more downs of your own.', goal: 1,
    progress: (_r, run) => (won(run) && (run!.alliesLost ?? 0) >= 2 && run!.kills >= 3 ? 1 : 0) },
  { id: 'guardian', name: 'Guardian', rarity: 'rare', text: 'Revive teammates 25 times in total.', goal: 25, progress: (r) => r.overall.revives },
  { id: 'online-ace', name: 'Contender', rarity: 'rare', text: 'Win 10 online matches.', goal: 10, progress: (_r, _run, o) => o?.wins ?? 0 },
  // ---- epic (2) ----
  { id: 'untouched', name: 'Untouched', rarity: 'epic', text: 'Clear the room without taking any damage.', goal: 1, progress: (_r, run) => (won(run) && run!.damageTaken === 0 ? 1 : 0) },
  // All five yourself, never downed, no teammate lost: 1 of 84 autopilot runs (4 with the teammate rule off).
  // V2: plus "less damage than one full health bar". Measured over 168 autopilot runs (V2 report): without it Ace came
  // in 1.8% of runs (3.0% with perks), above the epic bar; the runs it kept had taken 92 to 151 damage.
  { id: 'ace', name: 'Ace', rarity: 'epic', text: 'Clear the room with all five hostiles downed by you, never downed, no teammate lost, and less damage taken than your full health.', goal: 1,
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
