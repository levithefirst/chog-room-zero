// SB lab measurements: the default game (you + 2 AI teammates, zone on) played by the autopilot, with the player's
// contact intel (src/sim/intel.ts) run exactly as the game runs it. AUTOPILOT, NOT PEOPLE: it walks at the nearest bot
// with omniscient navigation, so these numbers find systemic problems and regressions; they never prove a feel.
import { TUNING } from '../../src/config/tuning';
import { HEROES, squadFor } from '../../src/config/heroes';
import { createWorld, stepWorld, type World } from '../../src/sim/world';
import { createAutopilot } from '../../src/debug/autopilot';
import { createIntel, rung, senseFor } from '../../src/sim/intel';

export interface InfoResult {
  /** Share of living-hostile time on each rung (10 Hz samples). */
  shares: Record<string, number>;
  /** The middle of the ladder: believed but not seen (partial + last known + heard + direction + suspected). */
  middle: number;
  /** New sightings (not visible in the 3 s before) that the player already had a belief about. */
  warned: number;
  /** Non-visible beliefs whose drawn circle (plus a body radius) really holds the hostile, per rung. */
  honest: Record<string, number>;
  /** Mean estimate error (u), per rung, over every sample of a belief's life (it grows as the hostile moves on). */
  error: Record<string, number>;
  /** Mean estimate error (u) of a reading when it is made (the first sample on that rung): the rung's precision. */
  fresh: Record<string, number>;
  firstContactS: number;
  matchS: number;
  wins: number;
  seeds: number;
}

export function measureInfo(seeds: number, opts: { maxSeconds?: number; first?: number; hook?: (w: World) => void } = {}): InfoResult {
  const counts: Record<string, number> = {};
  const inCircle: Record<string, [number, number]> = {};
  const err: Record<string, [number, number]> = {};
  const fresh: Record<string, [number, number]> = {};
  let contacts = 0, warned = 0, firstSum = 0, matchSum = 0, wins = 0;
  const f0 = opts.first ?? 1;
  for (let seed = f0; seed < f0 + seeds; seed++) {
    const hero = HEROES[seed % HEROES.length].id;
    const w = createWorld({ hero, seed, zone: true, allies: squadFor(hero, seed) });
    const p = w.actors[0], ap = createAutopilot(seed, 3), intel = createIntel();
    const lastVisible = new Map<number, number>();
    const prevRung = new Map<number, string>();
    const believedAt = new Map<number, number>();
    let first = -1;
    const max = (opts.maxSeconds ?? 240) * 60;
    for (let i = 0; i < max && w.outcome === 'playing'; i++) {
      stepWorld(w, ap.next(w));
      senseFor(w, p, intel, TUNING.simStepSeconds);
      opts.hook?.(w);
      const t = i / 60;
      for (const c of intel.contacts.values()) if (c.state !== 'visible' && c.state !== 'lost') believedAt.set(c.id, t);
      // Each step: a belief that just moved onto a rung is a fresh reading on it.
      for (const a of w.actors) {
        if (a.team === p.team || !a.alive) continue;
        const s = rung(intel, a.id), c = intel.contacts.get(a.id);
        if (c && s !== prevRung.get(a.id) && s !== 'visible' && s !== 'unknown' && s !== 'lost') { const f = (fresh[s] ??= [0, 0]); f[0] += Math.hypot(c.x - a.x, c.y - a.y); f[1]++; }
        prevRung.set(a.id, s);
      }
      if (i % 6) continue;
      for (const a of w.actors) {
        if (a.team === p.team || !a.alive) continue;
        const s = rung(intel, a.id);
        counts[s] = (counts[s] ?? 0) + 1;
        if (s === 'visible') {
          const prev = lastVisible.get(a.id);
          if (prev === undefined || t - prev > 3) { contacts++; if ((believedAt.get(a.id) ?? -9) > t - 3) warned++; if (first < 0) first = t; }
          lastVisible.set(a.id, t);
        } else if (s !== 'unknown' && s !== 'lost') {
          const c = intel.contacts.get(a.id)!;
          const d = Math.hypot(c.x - a.x, c.y - a.y);
          const ic = (inCircle[s] ??= [0, 0]); ic[0] += d <= c.r + TUNING.movement.radius ? 1 : 0; ic[1]++;
          const e = (err[s] ??= [0, 0]); e[0] += d; e[1]++;
        }
      }
    }
    if (w.outcome === 'won') wins++;
    matchSum += w.tick / 60;
    firstSum += first < 0 ? w.tick / 60 : first;
  }
  const n = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const shares: Record<string, number> = {};
  for (const k of ['visible', 'partial', 'last_known', 'heard', 'directional', 'suspected', 'unknown']) shares[k] = +((counts[k] ?? 0) / n).toFixed(3);
  const ratio = (m: Record<string, [number, number]>, dp = 2) => Object.fromEntries(Object.entries(m).map(([k, [a, b]]) => [k, +(a / Math.max(1, b)).toFixed(dp)]));
  return {
    shares, middle: +(['partial', 'last_known', 'heard', 'directional', 'suspected'].reduce((a, k) => a + shares[k], 0)).toFixed(3),
    warned: +(warned / Math.max(1, contacts)).toFixed(3), honest: ratio(inCircle), error: ratio(err, 1), fresh: ratio(fresh, 2),
    firstContactS: +(firstSum / seeds).toFixed(1), matchS: +(matchSum / seeds).toFixed(1), wins, seeds,
  };
}
