// Reproducible duels through the REAL sim (stepWorld: bullets, spread, collision, falloff, armour), not a model.
// Scenario: open hall, no cover. Side A = the player actor, side B = one bot driven by a script (no brain).
// Both start facing each other, hold the trigger from t=0, aim at the opponent's CURRENT position every tick
// (no lead), auto-reload on empty, abilities off. Seeds 1000..1000+N-1 (world seed = spread rolls).
// Strafe patterns (strafing cells only): A strafes along y at full speed reversing every 0.60 s, starting +y;
// B every 0.45 s, starting -y; both kept in the lane y in [2.5, 6.5] (reverse at the edge). Timeout 15 s = draw.
// Writes the tables to $DUEL_OUT (JSON) when set.
import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, IDLE_INPUT, type ActorInput, type Actor } from '../src/sim/world';

const HALL = ['##############################', ...Array.from({ length: 7 }, () => '#............................#'), '##############################'];
export interface Cell { a: string; b: string; d: number; strafe: boolean; n: number; winA: number; winB: number; draw: number;
  ciA: [number, number]; ttk: { p10: number; median: number; p90: number }; hitA: number; hitB: number }

function wilson(k: number, n: number): [number, number] {
  const z = 1.96, p = k / n, den = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [+((c - m) / den).toFixed(3), +((c + m) / den).toFixed(3)];
}

export function duel(heroA: string, heroB: string, d: number, strafe: boolean, seed: number) {
  const w = createWorld({ seed, hero: heroA, map: HALL, bots: [{ name: 'B', hero: heroB, patrol: [[1, 4]], flanker: false }] });
  const A = w.actors[0], B = w.actors[1];
  const x0 = 15 - d / 2;
  A.x = x0; A.y = 4.5; B.x = x0 + d; B.y = 4.5; A.facing = 0; B.facing = Math.PI;
  let dirA = 1, dirB = -1, tA = 0, tB = 0, firedA = 0, firedB = 0, hitsA = 0, hitsB = 0;
  const steer = (me: Actor, foe: Actor, dir: number): ActorInput => ({
    ...IDLE_INPUT, firing: true, reload: me.ammo === 0, aim: Math.atan2(foe.y - me.y, foe.x - me.x), moveX: 0, moveY: strafe ? dir : 0,
  });
  for (let i = 0; i < 60 * 15; i++) {
    const t = i / 60;
    if (strafe) {
      if (t - tA >= 0.6 || (dirA > 0 && A.y > 6.5) || (dirA < 0 && A.y < 2.5)) { dirA = -dirA; tA = t; }
      if (t - tB >= 0.45 || (dirB > 0 && B.y > 6.5) || (dirB < 0 && B.y < 2.5)) { dirB = -dirB; tB = t; }
    }
    stepWorld(w, steer(A, B, dirA), undefined, (a) => (a.id === B.id ? steer(B, A, dirB) : null));
    for (const s of w.sounds) if (s.type === 'shot') { if (s.sourceId === 0) firedA += A.weapon.pellets; else firedB += B.weapon.pellets; }
    for (const h of w.hits) { if (h.by === 0) hitsA++; else hitsB++; }
    if (!A.alive || !B.alive) return { win: A.alive ? 'A' : B.alive ? 'B' : 'draw', t, firedA, firedB, hitsA, hitsB };
  }
  return { win: 'draw', t: 15, firedA, firedB, hitsA, hitsB };
}

export function cell(a: string, b: string, d: number, strafe: boolean, n: number): Cell {
  let winA = 0, winB = 0, draw = 0, fA = 0, fB = 0, hA = 0, hB = 0;
  const ts: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = duel(a, b, d, strafe, 1000 + i);
    if (r.win === 'A') winA++; else if (r.win === 'B') winB++; else draw++;
    if (r.win !== 'draw') ts.push(r.t);
    fA += r.firedA; fB += r.firedB; hA += r.hitsA; hB += r.hitsB;
  }
  ts.sort((x, y) => x - y);
  const q = (p: number) => (ts.length ? +ts[Math.min(ts.length - 1, Math.floor(p * ts.length))].toFixed(2) : NaN);
  return { a, b, d, strafe, n, winA: winA / n, winB: winB / n, draw: draw / n, ciA: wilson(winA, n),
    ttk: { p10: q(0.1), median: q(0.5), p90: q(0.9) }, hitA: +(hA / Math.max(1, fA)).toFixed(3), hitB: +(hB / Math.max(1, fB)).toFixed(3) };
}

const N = 200;
// Weapon duels measure the weapons at parity: the RC-1 bot difficulty multiplier is switched off here.
import { beforeAll, afterAll } from 'vitest';
import { TUNING as T_DUEL } from '../src/config/tuning';
let savedMul = 1;
beforeAll(() => { savedMul = T_DUEL.bots.damageMul; T_DUEL.bots.damageMul = 1; });
afterAll(() => { T_DUEL.bots.damageMul = savedMul; });

describe('weapon duels (real sim, N=200 per cell, Wilson 95% CI)', () => {
  it("ADE 4 u test: Brick shotgun vs Wick marksman at 4 u, stationary: shotgun wins (CI lower bound > 50%)", () => {
    const c = cell('brick', 'wick', 4, false, N);
    expect(c.ciA[0]).toBeGreaterThan(0.5);
  });
  it('design intent: the shotgun wins vs the rifle at <=4 u (stationary and strafing; CI lower bound > 50%)', () => {
    for (const [d, st] of [[2, false], [2, true], [4, false], [4, true]] as const) expect(cell('brick', 'kettle', d, st, N).ciA[0]).toBeGreaterThan(0.5);
  });
  it('design intent: the rifle owns 6 u and 9 u vs the shotgun, the marksman owns 9 u', () => {
    for (const st of [false, true]) {
      expect(cell('brick', 'kettle', 6, st, N).ciA[1]).toBeLessThan(0.5);
      expect(cell('brick', 'kettle', 9, st, N).ciA[1]).toBeLessThan(0.5);
    }
    expect(cell('brick', 'wick', 9, false, N).ciA[1]).toBeLessThan(0.5);
  });
  it('is deterministic (same seeds, same result)', () => {
    expect(cell('brick', 'kettle', 4, true, 20)).toEqual(cell('brick', 'kettle', 4, true, 20));
  });
  it('tables (DUEL_OUT)', async () => {
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (!env.DUEL_OUT) return;
    const rows: Cell[] = [];
    for (const b of ['wick', 'kettle']) for (const strafe of [false, true]) for (const d of [2, 4, 6, 9]) rows.push(cell('brick', b, d, strafe, N));
    (await import('node:fs' as string)).writeFileSync(env.DUEL_OUT, JSON.stringify(rows));
  }, 600000);
});
