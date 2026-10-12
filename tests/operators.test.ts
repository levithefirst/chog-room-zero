import { describe, expect, it } from 'vitest';
import { NO_SIDEGRADE, SIDEGRADES, operatorFor, type Sidegrade } from '../src/sim/operators';
import { HEROES } from '../src/config/heroes';
import { viewFor, weaponFor } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';
import type { HeroDef } from '../src/config/heroes';

const visionArea = (h: HeroDef, s: Sidegrade) => {
  const v = viewFor(h, s);
  return v.coneRad * v.range * v.range;
};
// Sustained damage per second including reloads, times the chance a shot lands on a body at 8 u.
const effectiveDps = (h: HeroDef, s: Sidegrade) => {
  const w = weaponFor(h, s);
  const sustained = (w.magazine * w.damage * w.pellets) / (w.magazine * w.fireInterval + w.reloadSeconds);
  const halfBody = (Math.atan(TUNING.movement.radius / 8) * 180) / Math.PI;
  return sustained * Math.min(1, halfBody / Math.max(w.spreadDeg, 0.01));
};
const axes = (h: HeroDef, s: Sidegrade) => {
  const v = viewFor(h, s), w = weaponFor(h, s);
  return [v.range, v.coneRad, w.magazine, 1 / w.fireInterval, 1 / w.spreadDeg, 1 / w.reloadSeconds];
};

describe('NFT sidegrades are fair on every hero', () => {
  for (const h of HEROES) {
    for (const s of SIDEGRADES) {
      it(`${h.name} + ${s.name}: trades, never dominates; vision area within 10%, effective DPS within 20%`, () => {
        const a = axes(h, s), d = axes(h, NO_SIDEGRADE);
        expect(a.some((v, i) => v > d[i])).toBe(true);
        expect(a.some((v, i) => v < d[i])).toBe(true);
        expect(Math.abs(visionArea(h, s) / visionArea(h, NO_SIDEGRADE) - 1)).toBeLessThanOrEqual(0.1);
        // Spread-limited weapons (shotgun pellets, marksman) cap at 1, so allow a slightly wider band.
        expect(Math.abs(effectiveDps(h, s) / effectiveDps(h, NO_SIDEGRADE) - 1)).toBeLessThanOrEqual(0.2);
      });
    }
  }
  it('no sidegrade touches damage, health, armour, or speed (LOCKED 9)', () => {
    for (const s of [NO_SIDEGRADE, ...SIDEGRADES]) expect(Object.keys(s).some((k) => /damage|hp|health|armor|speed/i.test(k))).toBe(false);
  });
  it('operatorFor is deterministic and only returns designed sidegrades', () => {
    expect(operatorFor('1234')).toBe(operatorFor('1234'));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => operatorFor(String(i)).id));
    expect([...seen].every((id) => SIDEGRADES.some((s) => s.id === id))).toBe(true);
    expect(seen.size).toBe(SIDEGRADES.length);
  });
});
