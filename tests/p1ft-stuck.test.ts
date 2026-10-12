// CHOG-AI-001 (second half): a stuck bot re-plans around the blocked tile instead of "arriving".
import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, IDLE_INPUT } from '../src/sim/world';

// Open room; the player is sealed in a pocket (bottom-left) so nothing alerts the bot.
const MAP = [
  '##############',
  '#............#',
  '#............#',
  '#............#',
  '#............#',
  '#............#',
  '##############',
  '#P############',
  '##############',
];

describe('AI-001 stuck bot repaths', () => {
  it('a patrol bot blocked by an obstacle the nav grid does not know detours and reaches its patrol point', () => {
    const w = createWorld({ map: MAP, seed: 3, bots: [{ name: 'A', hero: 'kettle', patrol: [[2, 3], [11, 3]], flanker: false }] });
    // Obstacle on the straight route (rows 2-4), added to collision only: nav still thinks row 3 is open.
    w.level.solidBoxes.push({ x0: 6, y0: 2, x1: 7, y1: 5 });
    const a = w.actors[1];
    let reached = false;
    for (let i = 0; i < 60 * 12 && !reached; i++) {
      stepWorld(w, IDLE_INPUT);
      if (Math.hypot(a.x - 11.5, a.y - 3.5) < 0.6) reached = true;
    }
    expect(reached).toBe(true);
  });
});
