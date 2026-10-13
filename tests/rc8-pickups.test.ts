// RC-8 pickups: one touch, no button, no second step. A pickup is taken on the first sim step the operator's body
// touches it (body radius 0.35 u + pickup half-width 0.3 u = 0.65 u between centres; collection radius 0.7 u).
import { describe, expect, it } from 'vitest';
import { createWorld, player, stepWorld, touchingFull, IDLE_INPUT } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';

const MAP = ['##############', '#............#', '#P.....h.....#', '#............#', '##############'];
const TOUCH = TUNING.movement.radius + 0.3; // drawn body edge meets the drawn pickup crate

describe('RC-8 pickup collection', () => {
  it('is taken on the first step of contact while walking over it, with no other input', () => {
    const w = createWorld({ map: MAP, hero: 'kettle', bots: [] });
    const p = player(w);
    p.hp = 30;
    const pk = w.pickups[0];
    let touchStep = -1, takenStep = -1;
    for (let i = 0; i < 200 && takenStep < 0; i++) {
      stepWorld(w, { ...IDLE_INPUT, moveX: 1 });
      if (touchStep < 0 && Math.hypot(p.x - pk.x, p.y - pk.y) <= TOUCH) touchStep = i;
      if (!pk.active) takenStep = i;
    }
    expect(takenStep).toBeGreaterThanOrEqual(0);
    // Taken no later than the step the bodies touch (the radius is a hair larger than touching).
    expect(touchStep < 0 || takenStep <= touchStep).toBe(true);
    expect(p.hp).toBe(30 + TUNING.pickups.health.amount);
    expect(TUNING.pickups.radius).toBeGreaterThanOrEqual(TOUCH);
  });
  it('a player who stops exactly at contact still gets it (no extra press)', () => {
    const w = createWorld({ map: MAP, hero: 'kettle', bots: [] });
    const p = player(w);
    p.hp = 50;
    const pk = w.pickups[0];
    p.x = pk.x - TOUCH; p.y = pk.y;
    stepWorld(w, IDLE_INPUT);
    expect(pk.active).toBe(false);
    expect(w.sounds.some((s) => s.type === 'pickup' && s.sourceId === 0)).toBe(true);
  });
  it('a full operator does not waste it, and touchingFull says why (the client shows "HEALTH FULL")', () => {
    const w = createWorld({ map: MAP, hero: 'kettle', bots: [] });
    const p = player(w);
    const pk = w.pickups[0];
    p.x = pk.x - 0.4; p.y = pk.y;
    stepWorld(w, IDLE_INPUT);
    expect(pk.active).toBe(true);
    expect(touchingFull(w, p)).toBe(pk);
    p.hp = 60;
    stepWorld(w, IDLE_INPUT);
    expect(pk.active).toBe(false);
    expect(touchingFull(w, p)).toBe(null);
  });
  it('a dead operator neither takes nor reports a pickup', () => {
    const w = createWorld({ map: MAP, hero: 'kettle', bots: [] });
    const p = player(w);
    const pk = w.pickups[0];
    p.x = pk.x; p.y = pk.y; p.hp = 0; p.alive = false;
    stepWorld(w, IDLE_INPUT);
    expect(pk.active).toBe(true);
    expect(touchingFull(w, p)).toBe(null);
  });
});
