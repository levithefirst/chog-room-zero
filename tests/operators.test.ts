import { describe, expect, it } from 'vitest';
import { DEFAULT_OPERATOR, SIDEGRADES, operatorFor, type Operator } from '../src/sim/operators';
import { TUNING } from '../src/config/tuning';

const visionArea = (o: Operator) => o.coneDeg * o.range * o.range;
// Expected damage per second including reloads, times the chance a shot lands on a body at 8 u.
const effectiveDps = (o: Operator) => {
  const sustained = (o.magazine * TUNING.combat.damage) / (o.magazine * o.fireInterval + o.reloadSeconds);
  const halfBody = (Math.atan(TUNING.movement.radius / 8) * 180) / Math.PI;
  return sustained * Math.min(1, halfBody / o.spreadDeg);
};
// Bigger is better on every axis.
const axes = (o: Operator) => [o.range, o.coneDeg, o.magazine, 1 / o.fireInterval, 1 / o.spreadDeg, 1 / o.reloadSeconds];

describe('operator sidegrades are fair', () => {
  for (const s of SIDEGRADES) {
    it(`${s.name}: no dominance over or by the default`, () => {
      const a = axes(s), d = axes(DEFAULT_OPERATOR);
      expect(a.some((v, i) => v > d[i])).toBe(true);
      expect(a.some((v, i) => v < d[i])).toBe(true);
    });
    it(`${s.name}: vision area within 10% and effective DPS within 15% of the default`, () => {
      expect(Math.abs(visionArea(s) / visionArea(DEFAULT_OPERATOR) - 1)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(effectiveDps(s) / effectiveDps(DEFAULT_OPERATOR) - 1)).toBeLessThanOrEqual(0.15);
    });
  }
  it('no operator carries damage, health, or speed fields (they are shared, LOCKED)', () => {
    for (const o of [DEFAULT_OPERATOR, ...SIDEGRADES]) {
      expect(Object.keys(o).some((k) => /damage|hp|health|speed/i.test(k))).toBe(false);
    }
  });
  it('operatorFor is deterministic and only returns designed sidegrades', () => {
    expect(operatorFor('1234')).toBe(operatorFor('1234'));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => operatorFor(String(i)).id));
    expect([...seen].every((id) => SIDEGRADES.some((s) => s.id === id))).toBe(true);
    expect(seen.size).toBe(SIDEGRADES.length);
  });
});
