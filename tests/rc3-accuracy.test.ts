// RC-3: results accuracy is hits per bullet. The shotgun fires 8 pellets per shot, so hits per trigger pull read
// 59 / 16 = 369% for Brick in the scripted browser run. Bullets count every pellet; accuracy can never pass 100%.
import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, IDLE_INPUT } from '../src/sim/world';
import { walkable } from '../src/sim/level';
import { WEAPONS } from '../src/config/weapons';

describe('RC-3 accuracy per bullet', () => {
  for (const hero of ['brick', 'kettle']) {
    it(`${hero}: bullets = shots x pellets, and point-blank hits never exceed bullets`, () => {
      const w = createWorld({ seed: 7, hero });
      const p = w.actors[0];
      const target = w.actors[1];
      for (const b of w.actors.slice(2)) { b.x = -40; b.y = -40; }
      const tx = p.x + 1.5, ty = p.y;
      expect(walkable(w.level.tiles[Math.floor(ty) * w.level.w + Math.floor(tx)])).toBe(true);
      for (let i = 0; i < 120; i++) {
        target.x = tx; target.y = ty; target.vx = target.vy = 0; target.hp = 1e6;
        p.reserve = 999;
        stepWorld(w, { ...IDLE_INPUT, aim: 0, firing: true });
      }
      const pellets = WEAPONS[p.hero.weapon].pellets;
      expect(p.shots).toBeGreaterThan(0);
      expect(p.bullets).toBe(p.shots * pellets);
      expect(p.hits).toBeGreaterThan(0);
      expect(p.hits).toBeLessThanOrEqual(p.bullets);
      if (pellets > 1) expect(p.hits).toBeGreaterThan(p.shots); // the old per-shot ratio went above 100%
    });
  }
});
