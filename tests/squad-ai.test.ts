// Owner 2026-10-17 FS: "enemy teams must be active and intelligent rather than simply moving because of the red
// zone". The hostile squad between fights (src/sim/bots.ts squadPatrol, TUNING.bots.squad): it searches the points it
// has not checked, holds ground, resupplies, regroups and answers a squadmate's sighting, all from what it knows.
// Measured over seeded matches on the 68 x 42 venue; thresholds sit below the measured values with a margin and well
// above the old patrol-only squad (docs/ROOM_ZERO_FINAL_SUPERIORITY.md has both).
import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, IDLE_INPUT, type World } from '../src/sim/world';
import { HEROES, squadFor } from '../src/config/heroes';
import { createAutopilot } from '../src/debug/autopilot';
import { TUNING } from '../src/config/tuning';

const STEP = TUNING.simStepSeconds;
const SAFE = TUNING.zone.safeSeconds;

/** A player who hides in the west offices and never fires: does the squad come and look, and find it honestly? */
function passive(seed: number, squadAI: boolean) {
  const w = createWorld({ hero: HEROES[seed % HEROES.length].id, seed, zone: true, squadAI, log: true });
  const p = w.actors[0];
  p.hp = p.maxHp = 1e6;
  const west = new Set<number>();
  let found = -1;
  for (let i = 0; i < SAFE / STEP && w.outcome === 'playing'; i++) {
    stepWorld(w, { ...IDLE_INPUT, aim: Math.PI / 2 });
    for (const a of w.actors) if (a.team === 'bot' && a.alive && a.x < w.level.w / 2) west.add(a.id);
    if (found < 0 && w.perceptionLog!.some((e) => e.source === 'seen')) found = i * STEP;
  }
  return { west: west.size, found };
}

function autopilot(seed: number, log = false): World {
  const hero = HEROES[seed % HEROES.length].id;
  const w = createWorld({ hero, seed, zone: true, allies: squadFor(hero, seed), log });
  const ap = createAutopilot(seed, 3);
  for (let i = 0; i < 100 / STEP && w.outcome === 'playing'; i++) stepWorld(w, ap.next(w));
  return w;
}

describe('the hostile squad is active before the zone', () => {
  it('it comes into your half and finds a player who hides, by sight (old squad: never)', () => {
    let west = 0, found = 0, westOld = 0, foundOld = 0;
    const N = 12;
    for (let seed = 1; seed <= N; seed++) {
      const a = passive(seed, true), b = passive(seed, false);
      west += a.west; westOld += b.west;
      if (a.found >= 0) found++;
      if (b.found >= 0) foundOld++;
    }
    // Measured (12 seeds): new 3.3 bots per match in the west half, 4/12 found; old 1.0 and 0/12.
    expect(west / N).toBeGreaterThanOrEqual(2.5);
    expect(west).toBeGreaterThan(westOld * 1.8);
    expect(found).toBeGreaterThanOrEqual(2);
    expect(found).toBeGreaterThan(foundOld);
  }, 120000);

  it('it uses every job, a squadmate\'s sighting reaches the squad only as that spot, and nobody teleports', () => {
    const kinds = new Set<string>();
    let radio = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const hero = HEROES[seed % HEROES.length].id;
      const w = createWorld({ hero, seed, zone: true, allies: squadFor(hero, seed), log: true });
      const ap = createAutopilot(seed, 3);
      const last = new Map<number, { x: number; y: number }>();
      for (let i = 0; i < 100 / STEP && w.outcome === 'playing'; i++) {
        const before = w.perceptionLog!.length;
        stepWorld(w, ap.next(w));
        for (const a of w.actors) {
          if (a.team !== 'bot' || !a.alive) continue;
          const t = w.brains.get(a.id)!.task;
          if (t) kinds.add(t.kind);
          const l = last.get(a.id);
          // At most a dash-speed step (the fastest anything moves), never a jump.
          if (l) expect(Math.hypot(a.x - l.x, a.y - l.y)).toBeLessThan(0.5);
          last.set(a.id, { x: a.x, y: a.y });
        }
        for (const e of w.perceptionLog!.slice(before)) {
          if (e.source !== 'radio') continue;
          radio++;
          const backed = w.perceptionLog!.some((o) => o.bot !== e.bot && w.actors[o.bot].team === 'bot' && o.source === 'seen' && o.x === e.x && o.y === e.y
            && o.tick <= e.tick && (e.tick - o.tick) * STEP <= TUNING.bots.squad.reportSeconds * 2 + 6);
          expect(backed, `radio callout at ${e.x},${e.y}`).toBe(true);
        }
      }
    }
    for (const k of ['hunt', 'search', 'hold', 'resupply', 'patrol']) expect(kinds.has(k), k).toBe(true);
    expect(radio).toBeGreaterThan(0);
  }, 120000);

  it('you + 2 still win a fair share against the active squad (autopilot: not trivial, not hopeless)', () => {
    let wins = 0;
    const N = 16;
    for (let seed = 1; seed <= N; seed++) if (autopilot(seed).outcome === 'won') wins++;
    // Measured: 15/24 (old patrol-only squad 17/24 on the same build). A bar, not a target: the owner's playtest sets it.
    expect(wins).toBeGreaterThanOrEqual(Math.round(N * 0.35));
    expect(wins).toBeLessThan(N);
  }, 180000);
});
