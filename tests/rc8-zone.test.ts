// RC-8 shrinking danger zone (src/sim/zone.ts): phases and countdown, nested fair circles, escalating damage,
// match end and results, bots heading in, determinism. All numbers come from TUNING.zone (configurable).
import { describe, expect, it } from 'vitest';
import { createWorld, player, stepWorld, IDLE_INPUT, matchSeconds } from '../src/sim/world';
import { findPath, parseLevel } from '../src/sim/level';
import { openSpot, outsideCircle, planZone, zoneAt, type ZoneConfig } from '../src/sim/zone';
import { ROOM_ZERO, ZONE_CENTRES } from '../src/config/map';
import { TUNING } from '../src/config/tuning';

const Z = TUNING.zone;
const L = parseLevel(ROOM_ZERO);
const stageStart = (k: number) => Z.safeSeconds + Z.stages.slice(0, k).reduce((a, s) => a + s.warn + s.shrink, 0);
const FINAL_AT = stageStart(Z.stages.length);

describe('RC-8 zone phases and countdown', () => {
  const z = planZone(L, 1, ZONE_CENTRES);
  it('safe -> (warning -> shrinking) per stage -> final, with a countdown to each change', () => {
    expect(zoneAt(z, 0)).toMatchObject({ phase: 'safe', left: Z.safeSeconds, dps: 0, next: null });
    expect(zoneAt(z, Z.safeSeconds - 1).left).toBeCloseTo(1, 9);
    for (let k = 0; k < Z.stages.length; k++) {
      const t0 = stageStart(k);
      const w = zoneAt(z, t0 + 0.01);
      expect(w.phase).toBe('warning');
      expect(w.stage).toBe(k);
      expect(w.left).toBeCloseTo(Z.stages[k].warn - 0.01, 6);
      expect(w.next).toEqual(z.plan[k + 1]);
      expect(w.circle).toEqual(z.plan[k]); // nothing moves while it warns
      const s = zoneAt(z, t0 + Z.stages[k].warn + 0.01);
      expect(s.phase).toBe('shrinking');
      expect(s.dps).toBe(Z.stages[k].dps);
      expect(s.left).toBeCloseTo(Z.stages[k].shrink - 0.01, 6);
    }
    expect(zoneAt(z, FINAL_AT)).toMatchObject({ phase: 'final', left: Infinity, dps: Z.finalDps, next: null });
    expect(FINAL_AT).toBeGreaterThan(80); // a ~90 s room, not a sprint
    expect(FINAL_AT).toBeLessThan(110);
  });
  it('the circle only ever shrinks, smoothly (no jump bigger than one step of the shrink)', () => {
    let prev = zoneAt(z, 0).circle;
    for (let t = 0; t < FINAL_AT + 5; t += 1 / 60) {
      const c = zoneAt(z, t).circle;
      expect(c.r).toBeLessThanOrEqual(prev.r + 1e-9);
      // The new circle stays inside the old one: nobody inside is suddenly outside by more than the step.
      expect(Math.hypot(c.x - prev.x, c.y - prev.y) + c.r).toBeLessThanOrEqual(prev.r + 0.05);
      prev = c;
    }
  });
  it('damage escalates: 0 while safe, then each stage more, the final zone most', () => {
    const d = [0, ...Z.stages.map((s) => s.dps), Z.finalDps];
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
  });
});

describe('RC-8 zone placement is fair', () => {
  it('every candidate centre is open floor (1.5 u clear) and reachable from the solo spawn', () => {
    for (const c of ZONE_CENTRES) {
      expect(openSpot(L, c.x, c.y, Z.clearance), `${c.x},${c.y}`).toBe(true);
      expect(findPath(L, L.playerSpawn.x, L.playerSpawn.y, c.x, c.y).length, `${c.x},${c.y}`).toBeGreaterThan(0);
    }
  });
  it('for 200 seeds the circles are nested and the last one sits on a candidate', () => {
    for (let seed = 0; seed < 200; seed++) {
      const z = planZone(L, seed, ZONE_CENTRES);
      for (let k = 1; k < z.plan.length; k++) {
        const a = z.plan[k - 1], b = z.plan[k];
        expect(Math.hypot(a.x - b.x, a.y - b.y) + b.r).toBeLessThanOrEqual(a.r + 1e-9);
      }
      const f = z.plan[z.plan.length - 1];
      expect(ZONE_CENTRES.some((c) => c.x === f.x && c.y === f.y)).toBe(true);
    }
  });
  it('the start circle covers the whole floor (nobody starts outside)', () => {
    const z = planZone(L, 3, ZONE_CENTRES);
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) expect(outsideCircle(z.plan[0], x + 0.5, y + 0.5)).toBe(false);
  });
  it('online: only centres about equally far from both team spawns are used', () => {
    const spawns = [{ x: 3.5, y: 12.5 }, { x: 40.5, y: 12.5 }];
    for (let seed = 0; seed < 50; seed++) {
      const f = planZone(L, seed, ZONE_CENTRES, Z, spawns).plan.at(-1)!;
      const d = spawns.map((s) => Math.hypot(s.x - f.x, s.y - f.y));
      const mean = (d[0] + d[1]) / 2;
      expect(Math.abs(d[0] - mean)).toBeLessThanOrEqual(mean * 0.2 + 1e-9);
    }
  });
  it('is configurable: a custom config is honoured end to end', () => {
    const cfg: ZoneConfig = { safeSeconds: 5, stages: [{ warn: 1, shrink: 2, radius: 6, dps: 50 }], finalDps: 99, clearance: 1 };
    const z = planZone(L, 1, ZONE_CENTRES, cfg);
    expect(z.plan).toHaveLength(2);
    expect(z.plan[1].r).toBe(6);
    expect(zoneAt(z, 4.9).phase).toBe('safe');
    expect(zoneAt(z, 5.5).phase).toBe('warning');
    expect(zoneAt(z, 7).dps).toBe(50);
    expect(zoneAt(z, 8.01).dps).toBe(99);
  });
});

describe('RC-8 zone in the match', () => {
  it('damage outside: health only (armour untouched), per second at the stage rate; none inside', () => {
    const w = createWorld({ zone: true, bots: [], seed: 4 });
    const p = player(w);
    const t0 = stageStart(0) + Z.stages[0].warn + Z.stages[0].shrink - 0.5; // end of stage 0 (then its rate holds)
    w.tick = Math.round(t0 * 60);
    const c = zoneAt(w.zone!, matchSeconds(w)).circle;
    // Inside: the centre's floor.
    p.x = w.zone!.plan.at(-1)!.x; p.y = w.zone!.plan.at(-1)!.y;
    const hp0 = p.hp, ar0 = p.armor;
    stepWorld(w, IDLE_INPUT);
    expect(p.hp).toBe(hp0);
    // Outside: a far corner of the floor.
    p.x = c.x > 22 ? 1.5 : 42.5; p.y = c.y > 13 ? 1.5 : 24.5;
    expect(outsideCircle(zoneAt(w.zone!, matchSeconds(w)).circle, p.x, p.y)).toBe(true);
    for (let i = 0; i < 60; i++) { stepWorld(w, IDLE_INPUT); p.vx = p.vy = 0; }
    expect(hp0 - p.hp).toBeCloseTo(Z.stages[0].dps, 5);
    expect(p.armor).toBe(ar0);
    expect(p.zoneTick).toBe(w.tick - 1);
  });
  it('the zone can end a solo run: cause "zone", outcome dead, no shooter', () => {
    const w = createWorld({ zone: true, bots: [{ name: 'B', hero: 'kettle', patrol: [[40, 23]], flanker: false }], seed: 2 });
    const p = player(w);
    w.tick = Math.round((FINAL_AT + 1) * 60);
    const f = w.zone!.plan.at(-1)!;
    p.x = f.x > 22 ? 1.5 : 42.5; p.y = 1.5; p.hp = 5;
    for (let i = 0; i < 60 && w.outcome === 'playing'; i++) stepWorld(w, IDLE_INPUT, undefined, () => IDLE_INPUT);
    expect(w.outcome).toBe('dead');
    expect(w.playerKill).toMatchObject({ cause: 'zone', killerId: -1 });
  });
  it('online: the zone decides a match when it takes the last of a team; both at once is a draw', () => {
    const mk = (hpA: number, hpB: number) => {
      const w = createWorld({ zone: true, seed: 5, versus: [
        { name: 'A', hero: 'kettle', team: 'alpha', x: 1.5, y: 1.5, facing: 0 },
        { name: 'B', hero: 'kettle', team: 'bravo', x: 42.5, y: 24.5, facing: 0 },
      ] });
      w.tick = Math.round((FINAL_AT + 1) * 60);
      w.actors[0].hp = hpA; w.actors[1].hp = hpB;
      for (let i = 0; i < 600 && w.outcome === 'playing'; i++) stepWorld(w, () => IDLE_INPUT);
      return w;
    };
    const one = mk(5, 100);
    expect(one.outcome).toBe('won');
    expect(one.winner).toBe('bravo');
    expect(one.actors[0].death?.cause).toBe('zone');
    const both = mk(5, 5);
    expect(both.outcome).toBe('won');
    expect(both.winner).toBe(null);
  });
  it('bots head into the closing circle and end up inside it', () => {
    const w = createWorld({ zone: true, seed: 6, bots: [{ name: 'B', hero: 'kettle', patrol: [[1, 23]], flanker: false }] });
    const p = player(w);
    p.hp = p.maxHp = 1e9;
    p.x = 1.5; p.y = 1.5;
    const b = w.actors[1];
    w.tick = Math.round(stageStart(Z.stages.length - 1) * 60); // last warning: target = the final circle
    for (let i = 0; i < 25 * 60 && b.alive; i++) { stepWorld(w, IDLE_INPUT); p.x = 1.5; p.y = 1.5; }
    const f = w.zone!.plan.at(-1)!;
    expect(b.alive).toBe(true);
    expect(Math.hypot(b.x - f.x, b.y - f.y)).toBeLessThan(f.r);
  });
  it('turning the zone on changes nothing before the first warning (separate seed stream)', () => {
    const a = createWorld({ seed: 11 }), b = createWorld({ seed: 11, zone: true });
    for (let i = 0; i < Z.safeSeconds * 60 - 1; i++) { stepWorld(a, IDLE_INPUT); stepWorld(b, IDLE_INPUT); }
    expect(b.actors.map((x) => [x.x, x.y, x.hp])).toEqual(a.actors.map((x) => [x.x, x.y, x.hp]));
    expect(b.rng).toBe(a.rng);
  });
  it('the same seed gives the same zone', () => {
    expect(planZone(L, 42, ZONE_CENTRES)).toEqual(planZone(L, 42, ZONE_CENTRES));
  });
});
