// V2 AI teammates protect a hurt teammate (owner V2 §10): one guard, between you and the threat IT believes in (its own
// heard/seen/told belief, never the threat's true position), watching that spot, and saying so once.
import { describe, expect, it } from 'vitest';
import { createWorld, player, stepWorld, IDLE_INPUT, type Actor, type World } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';
import type { Brain } from '../src/sim/bots';

const OPEN = ['##############################', ...Array.from({ length: 14 }, () => '#........................#...#'), '##############################'];
function setup(): { w: World; p: Actor; m1: Actor; m2: Actor } {
  const w = createWorld({ map: OPEN, hero: 'benja', allies: [{ name: 'Toad', hero: 'toad' }, { name: 'Ray', hero: 'ray' }], bots: [{ name: 'H', hero: 'benja', patrol: [[27, 7]], flanker: false }], zone: false, perks: false });
  const p = player(w), [m1, m2] = [w.actors[1], w.actors[2]];
  p.x = 8.5; p.y = 7.5; m1.x = 6.5; m1.y = 7.5; m2.x = 5.5; m2.y = 10.5;
  return { w, p, m1, m2 };
}
const believe = (w: World, a: Actor, x: number, y: number) => { const b = w.brains.get(a.id) as Brain; b.lastKnown = { x, y }; b.suspicion = 0.8; };
const run = (w: World, p: Actor, n: number) => { for (let i = 0; i < n; i++) { p.hp = Math.min(p.hp, 30); stepWorld(w, (a) => ({ ...IDLE_INPUT, aim: a.facing })); } };

describe('a hurt player gets one guard', () => {
  it('the nearest teammate who believes in a threat steps between you and it, facing it', () => {
    const { w, p, m1, m2 } = setup();
    p.hp = 30;
    believe(w, m1, 14.5, 7.5); believe(w, m2, 14.5, 7.5);
    run(w, p, 120);
    expect((w.brains.get(m1.id) as Brain).guarding).toBe(p.id);
    expect((w.brains.get(m2.id) as Brain).guarding).not.toBe(p.id);
    // Between: on your threat side, about guard.distance from you.
    expect(m1.x).toBeGreaterThan(p.x);
    expect(Math.hypot(m1.x - p.x, m1.y - p.y)).toBeLessThan(TUNING.bots.guard.distance + 1);
    expect(Math.abs(Math.atan2(7.5 - m1.y, 14.5 - m1.x) - m1.facing)).toBeLessThan(0.3);
  });
  it('it guards against what it believes, not where the hostile really is', () => {
    const { w, p, m1, m2 } = setup();
    p.hp = 30;
    // The real hostile stays in its sealed pocket to the east; m1 believes (wrongly) it is north.
    believe(w, m1, 8.5, 1.5); (w.brains.get(m2.id) as Brain).lastKnown = null; // m1 believes north
    run(w, p, 120);
    expect((w.brains.get(m1.id) as Brain).guarding).toBe(p.id);
    expect(m1.y).toBeLessThan(p.y); // north of you, toward its belief
  });
  it('no belief, or you are not hurt: nobody guards', () => {
    const a = setup();
    a.p.hp = 30;
    for (const m of [a.m1, a.m2]) (a.w.brains.get(m.id) as Brain).lastKnown = null;
    run(a.w, a.p, 60);
    expect([a.m1, a.m2].some((m) => (a.w.brains.get(m.id) as Brain).guarding === a.p.id)).toBe(false);
    const b = setup();
    believe(b.w, b.m1, 14.5, 7.5);
    for (let i = 0; i < 60; i++) stepWorld(b.w, (x) => ({ ...IDLE_INPUT, aim: x.facing }));
    expect((b.w.brains.get(b.m1.id) as Brain).guarding).not.toBe(b.p.id);
  });
});
