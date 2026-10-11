import { describe, expect, it } from 'vitest';
import { createPlayer, fixedSteps, stepPlayer, type PlayerState, type Vec2 } from '../src/sim/sim';
import { keysToMove } from '../src/input/input';
import { TUNING } from '../src/config/tuning';

const T = TUNING.movement;
const DT = TUNING.simStepSeconds;
const ZERO: Vec2 = { x: 0, y: 0 };
const RIGHT: Vec2 = { x: 1, y: 0 };
const LEFT: Vec2 = { x: -1, y: 0 };
const speed = (p: PlayerState) => Math.hypot(p.vx, p.vy);
const run = (p: PlayerState, move: Vec2, steps: number) => {
  for (let i = 0; i < steps; i++) p = stepPlayer(p, move, DT, T);
  return p;
};

describe('fixedSteps', () => {
  it('runs whole steps and carries the remainder', () => {
    const r = fixedSteps(0, 0.025, 0.01, 5);
    expect(r.steps).toBe(2);
    expect(r.remainder).toBeCloseTo(0.005);
  });
  it('caps steps after a long hitch', () => {
    const r = fixedSteps(0, 10, 0.01, 5);
    expect(r.steps).toBe(5);
    expect(r.remainder).toBeLessThanOrEqual(0.01);
  });
  it('ignores negative elapsed time', () => {
    expect(fixedSteps(0.004, -1, 0.01, 5)).toEqual({ steps: 0, remainder: 0.004 });
  });
});

describe('stepPlayer movement', () => {
  it('1. stationary: no input keeps the player exactly still', () => {
    expect(run(createPlayer(), ZERO, 120)).toEqual(createPlayer());
  });

  it('2. accelerates over several steps, not instantly', () => {
    const p1 = run(createPlayer(), RIGHT, 1);
    expect(p1.vx).toBeGreaterThan(0);
    expect(p1.vx).toBeLessThan(T.maxSpeed);
    const stepsToMax = Math.ceil(T.maxSpeed / (T.acceleration * DT));
    expect(stepsToMax).toBeGreaterThan(1);
    expect(run(createPlayer(), RIGHT, stepsToMax - 1).vx).toBeLessThan(T.maxSpeed);
    expect(run(createPlayer(), RIGHT, stepsToMax).vx).toBeCloseTo(T.maxSpeed, 10);
  });

  it('3. speed never exceeds the cap', () => {
    let p = createPlayer();
    for (let i = 0; i < 600; i++) {
      p = stepPlayer(p, RIGHT, DT, T);
      expect(speed(p)).toBeLessThanOrEqual(T.maxSpeed + 1e-12);
    }
    expect(speed(p)).toBeCloseTo(T.maxSpeed, 10);
  });

  it('4. release decelerates over time to an exact stop', () => {
    let p = run(createPlayer(), RIGHT, 60);
    const afterOne = stepPlayer(p, ZERO, DT, T);
    expect(afterOne.vx).toBeGreaterThan(0); // not instant
    expect(afterOne.vx).toBeLessThan(p.vx);
    const stepsToStop = Math.ceil(T.maxSpeed / (T.deceleration * DT));
    p = run(p, ZERO, stepsToStop);
    expect(p.vx).toBe(0);
    expect(p.vy).toBe(0);
    const x = p.x;
    p = run(p, ZERO, 30);
    expect(p.x).toBe(x); // no creep after stopping
  });

  it('5. direction change is predictable and uses the reverse multiplier', () => {
    const full = run(createPlayer(), RIGHT, 60);
    const rev = stepPlayer(full, LEFT, DT, T);
    expect(rev.vx).toBeCloseTo(full.vx - T.acceleration * T.reverseAccelMultiplier * DT, 10);
    // a perpendicular turn is not "reversing" and uses base acceleration
    const turn = stepPlayer(full, { x: 0, y: 1 }, DT, T);
    const dv = Math.hypot(turn.vx - full.vx, turn.vy - full.vy);
    expect(dv).toBeCloseTo(T.acceleration * DT, 10);
    // eventually settles exactly on the new target velocity
    const settled = run(full, LEFT, 60);
    expect(settled.vx).toBeCloseTo(-T.maxSpeed, 10);
    expect(settled.vy).toBe(0);
  });

  it('6. diagonal movement tops out at the cap, not faster', () => {
    const p = run(createPlayer(), keysToMove(new Set(['KeyW', 'KeyD'])), 120);
    expect(speed(p)).toBeCloseTo(T.maxSpeed, 10);
    expect(p.vx).toBeCloseTo(-p.vy, 10);
  });

  it('7. opposite keys cancel: no movement from rest', () => {
    const p = run(createPlayer(), keysToMove(new Set(['KeyA', 'KeyD'])), 60);
    expect(p).toEqual(createPlayer());
  });

  it('8. deterministic: same input sequence gives deep-equal results', () => {
    const seq: Vec2[] = [];
    const keys = [['KeyD'], ['KeyD', 'KeyW'], [], ['KeyA'], ['KeyS', 'KeyA'], ['KeyW', 'KeyS'], []];
    for (const k of keys) for (let i = 0; i < 20; i++) seq.push(keysToMove(new Set(k)));
    const play = () => {
      let p = createPlayer();
      const trace: PlayerState[] = [];
      for (const mv of seq) trace.push((p = stepPlayer(p, mv, DT, T)));
      return trace;
    };
    expect(play()).toEqual(play());
  });

  it('does not mutate the input state', () => {
    const p = createPlayer();
    stepPlayer(p, RIGHT, DT, T);
    expect(p).toEqual(createPlayer());
  });
});
