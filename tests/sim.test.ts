import { describe, expect, it } from 'vitest';
import { fixedSteps } from '../src/sim/sim';

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
