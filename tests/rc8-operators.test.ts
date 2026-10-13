// RC-8 operator art: the drawn body is the hitbox. The parts are unit space (1 = TUNING.movement.radius) and the
// renderer draws them at actorScale 1. tools/rc8-shots.mjs measures the same thing from real canvas pixels.
import { describe, expect, it } from 'vitest';
import { bodyRadii, chogParts, place } from '../src/ui/chogShape';
import { HEROES } from '../src/config/heroes';
import { TUNING } from '../src/config/tuning';
import { portraitSvg } from '../src/ui/art';

describe('RC-8 operator bodies', () => {
  it('are drawn at the sim radius (no more 1.45x bodies)', () => {
    expect(TUNING.render.actorScale).toBe(1);
  });
  it('every operator outline straddles the hitbox: valleys >= 0.83, tips <= 1.2, mean within 10%', () => {
    for (const h of HEROES) {
      const r = bodyRadii(chogParts(h.id));
      expect(r.min, h.id).toBeGreaterThanOrEqual(0.83);
      expect(r.max, h.id).toBeLessThanOrEqual(1.2);
      expect(Math.abs(r.mean - 1), h.id).toBeLessThanOrEqual(0.1);
      for (const g of chogParts(h.id).gear) {
        if (g.poly) for (let i = 0; i < g.poly.length; i += 2) expect(Math.hypot(g.poly[i], g.poly[i + 1]), h.id).toBeLessThanOrEqual(1.2);
        if (g.dot) expect(Math.hypot(g.dot.x, g.dot.y) + g.dot.r, h.id).toBeLessThanOrEqual(1.2);
      }
    }
  });
  it('Kettle, Mop, Brick and Wick have different silhouettes (spike count and gear), not just colours', () => {
    const sig = HEROES.map((h) => { const p = chogParts(h.id); return `${p.body.length}|${p.gear.map((g) => (g.poly ? 'p' : 'd') + g.fill).join(',')}`; });
    expect(new Set(sig).size).toBe(HEROES.length);
  });
  it('the face and eyes point where the operator faces', () => {
    const p = chogParts('kettle');
    for (const facing of [0, Math.PI / 2, Math.PI, -2]) {
      const [ex, ey] = place([p.face.x, p.face.y], 10, 10, facing, 0.35);
      const dir = Math.atan2(ey - 10, ex - 10);
      expect(Math.abs(Math.atan2(Math.sin(dir - facing), Math.cos(dir - facing)))).toBeLessThan(1e-9);
    }
  });
  it('menu portraits draw the same operator in brand colours (no old token colours)', () => {
    for (const h of HEROES) {
      const svg = portraitSvg(h, 't');
      expect(svg).toContain('#6B3FA0');
      expect(svg).toContain('#FFF8E7');
      expect(svg).toContain('#FF6B9D');
      expect(svg).not.toMatch(/#e6dfcc|#38e0c2|#f2d98a/i);
    }
  });
});
