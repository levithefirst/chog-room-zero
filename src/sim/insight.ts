// SB death insight (LAW 8: death must be understandable). From the last seconds of a fight, the one or two reasons
// that mattered most, in plain words, with what to do differently. Never a dashboard. Pure: tests/sb-insight.test.ts.
// The record is the player's own view (what they knew and did), so the same rules explain a death solo and online; how
// the killer found you is known only of bots (their brain), online it is left out.
import { TUNING } from '../config/tuning';
import type { ContactState } from './intel';
import type { PerceptionSource } from './bots';
import { angleDiff } from './geom';
import type { Actor } from './world';

export type Gait = 'still' | 'creep' | 'run';

/** How an actor is moving right now, by the same thresholds the steady rule uses (TUNING.movement). */
export function gaitOf(a: Pick<Actor, 'vx' | 'vy' | 'stillFor' | 'hero'>): Gait {
  const M = TUNING.movement;
  const share = Math.hypot(a.vx, a.vy) / (M.maxSpeed * a.hero.speed);
  if (a.stillFor >= M.steadySeconds || share < 0.12) return 'still';
  return share <= M.quietSpeedScale + 0.05 ? 'creep' : 'run';
}

export interface TakenHit {
  /** Observer clock (s). */
  t: number;
  by: number;
  /** Where the shot came from (a grenade: where it burst). */
  fromX: number;
  fromY: number;
  /** Radians between where you faced and where the shot came from. */
  off: number;
  gait: Gait;
  reloading: boolean;
  grenade: boolean;
  /** What you believed about the shooter just before it landed, and for how long you had believed it (s). */
  knew: ContactState | 'unknown';
  knewFor: number;
}

export interface FightRecord {
  hits: TakenHit[];
  /** Your own shots: when, and at what gait. */
  shots: { t: number; gait: Gait }[];
}

export function createFightRecord(): FightRecord {
  return { hits: [], shots: [] };
}

/** Keep the last 8 s of a fight (older history explains nothing about this death). */
export function trimFight(r: FightRecord, now: number): void {
  while (r.hits.length && now - r.hits[0].t > 8) r.hits.shift();
  while (r.shots.length && now - r.shots[0].t > 8) r.shots.shift();
}

export interface DeathFacts {
  now: number;
  killer: number;
  /** Distance the killing shot came from, and the gun you carried. */
  dist: number;
  weapon: { name: string; falloffEnd: number; pellets: number };
  /** How the killer found you (solo bots), or null. */
  foundBy: PerceptionSource | null;
  /** Compass word from you toward the killer's shot. */
  dir: string;
}

export interface Insight { id: string; text: string }

const KNOWN: ReadonlySet<string> = new Set(['visible', 'partial', 'last_known', 'heard', 'directional', 'suspected']);

/**
 * The reasons, in the order they matter (each is something you could have read or done differently), at most two.
 * A blindside first: being hit before you had any read is the death that feels unfair, so it says how they found you.
 */
export function deathInsights(r: FightRecord, f: DeathFacts): Insight[] {
  const out: Insight[] = [];
  const add = (id: string, text: string) => { if (out.length < 2 && !out.some((o) => o.id === id)) out.push({ id, text }); };
  const fight = r.hits.filter((h) => f.now - h.t <= 6);
  const first = fight.find((h) => h.by === f.killer) ?? fight[0];
  const last = fight[fight.length - 1];
  if (last?.grenade && last.by === f.killer) add('grenade', 'Caught inside a grenade ring. When one lands, step out of the ring or put a wall between you.');
  if (first && !KNOWN.has(first.knew)) {
    const from = Math.abs(first.off) > 110 * Math.PI / 180 ? `from behind (${f.dir})` : `from the ${f.dir}`;
    add('blindside', `They hit you ${from} before you had any read on them.`);
    if (f.foundBy === 'heard') add('heardyou', first.gait === 'run' ? 'They heard you first: running steps carry 8 m. Creep near corners.' : 'They heard you first. Moving makes noise; standing still makes none.');
    else if (f.foundBy === 'flash') add('flashyou', 'Your muzzle flash gave you away. Every shot shows you to anyone with a clear line.');
    else if (f.foundBy === 'sonar') add('pinged', 'Their Ping found you through the walls. When you hear it ring, move.');
  }
  const shooters = new Set(fight.filter((h) => f.now - h.t <= 3).map((h) => h.by));
  if (shooters.size >= 2) add('outnumbered', `${shooters.size === 2 ? 'Two' : 'Three'} of them were on you at once. Break line of sight so you fight one at a time.`);
  const shots = r.shots.filter((s) => f.now - s.t <= 6), run = shots.filter((s) => s.gait === 'run').length;
  if (shots.length >= 3 && run / shots.length >= 0.6) add('runshots', `You fired on the run: ${run} of ${shots.length} shots at full spread. Stop to shoot; stand still to land them.`);
  if (first?.reloading) add('reload', 'They caught you reloading. Reload behind a wall, not in the open.');
  if (f.weapon.pellets > 1 && f.dist > f.weapon.falloffEnd) add('range', `They fought you from ${Math.round(f.dist)} m, past your ${f.weapon.name}'s reach. Close in behind cover first.`);
  if (first && KNOWN.has(first.knew) && first.knewFor >= 1.5 && Math.abs(first.off) > Math.PI / 2) add('warned', `You knew they were there ${first.knewFor.toFixed(0)} s before, but faced away when they fired.`);
  return out;
}

/** Radians between a facing and the direction from (x, y) toward (tx, ty). */
export function offFacing(facing: number, x: number, y: number, tx: number, ty: number): number {
  return angleDiff(facing, Math.atan2(ty - y, tx - x));
}
