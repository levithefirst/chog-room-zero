// SB match telemetry: the few numbers that say whether a match WORKED for the player, kept on the device (never sent;
// $0, no analytics service). The ?perf overlay shows them, QA tools read them from the debug hook, and the owner's
// playtests can quote them. Pure counters, updated by the game loop.
import type { Gait } from './insight';
import type { ContactState, Intel } from './intel';

export interface MatchTelemetry {
  seconds: number;
  /** Seconds at each gait, and how often it changed. */
  gait: Record<Gait, number>;
  gaitChanges: number;
  /** Times a hostile ENTERED each rung of the player's information ladder. */
  info: Record<ContactState, number>;
  /** Your shots, and the hits you took, by your gait at that moment. */
  shots: Record<Gait, number>;
  hitsTaken: Record<Gait, number>;
  firstContactS: number | null;
  firstShotS: number | null;
  firstHitTakenS: number | null;
  /** Distance of each of your hits that landed (fight range). */
  ranges: number[];
  callouts: number;
  revives: number;
}

export function createTelemetry(): MatchTelemetry {
  const g = () => ({ still: 0, creep: 0, run: 0 });
  return { seconds: 0, gait: g(), gaitChanges: 0, info: { visible: 0, partial: 0, last_known: 0, heard: 0, directional: 0, suspected: 0, lost: 0 },
    shots: g(), hitsTaken: g(), firstContactS: null, firstShotS: null, firstHitTakenS: null, ranges: [], callouts: 0, revives: 0 };
}

const lastRung = new WeakMap<MatchTelemetry, Map<number, ContactState>>();
const lastGait = new WeakMap<MatchTelemetry, Gait>();

/** One step: time at the current gait and every rung change in the player's beliefs. */
export function stepTelemetry(tm: MatchTelemetry, gait: Gait, intel: Intel, dt: number): void {
  tm.seconds += dt;
  tm.gait[gait] += dt;
  const was = lastGait.get(tm);
  if (was && was !== gait) tm.gaitChanges++;
  lastGait.set(tm, gait);
  let rungs = lastRung.get(tm);
  if (!rungs) { rungs = new Map(); lastRung.set(tm, rungs); }
  for (const c of intel.contacts.values()) {
    if (rungs.get(c.id) !== c.state) {
      tm.info[c.state]++;
      if (c.state === 'visible' && tm.firstContactS === null) tm.firstContactS = +tm.seconds.toFixed(1);
      rungs.set(c.id, c.state);
    }
  }
  for (const id of [...rungs.keys()]) if (!intel.contacts.has(id)) rungs.delete(id);
}

/** A compact summary (what the overlay prints and a playtest note can quote). */
export function summary(tm: MatchTelemetry): Record<string, unknown> {
  const pct = (r: Record<Gait, number>) => { const n = r.still + r.creep + r.run || 1; return `${Math.round((r.still / n) * 100)}/${Math.round((r.creep / n) * 100)}/${Math.round((r.run / n) * 100)}`; };
  return {
    s: Math.round(tm.seconds), gait: pct(tm.gait), gaitChanges: tm.gaitChanges, shotsByGait: pct(tm.shots), hitsTakenByGait: pct(tm.hitsTaken),
    info: tm.info, firstContactS: tm.firstContactS, firstShotS: tm.firstShotS, firstHitTakenS: tm.firstHitTakenS,
    fightRange: tm.ranges.length ? +(tm.ranges.reduce((a, b) => a + b, 0) / tm.ranges.length).toFixed(1) : null, callouts: tm.callouts, revives: tm.revives,
  };
}
