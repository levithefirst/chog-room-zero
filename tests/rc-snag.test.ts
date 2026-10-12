// RC-1 snag sweep: every hero, every doorway on Room Zero, both directions, lateral offsets across the door and
// door-aimed approaches with a ±0.2 rad lean (corner clips). Holding the stick must never stall the hero for more than 0.3 s before it passes.
import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, IDLE_INPUT } from '../src/sim/world';
import { ROOM_ZERO } from '../src/config/map';
import { HEROES } from '../src/config/heroes';

const doors: { x: number; y: number; vertical: boolean }[] = [];
ROOM_ZERO.forEach((r, y) => [...r].forEach((c, x) => {
  if (c !== 'd') return;
  // Open above and below: you walk through north-south ("vertical"). Otherwise east-west.
  doors.push({ x, y, vertical: ROOM_ZERO[y - 1][x] !== '#' && ROOM_ZERO[y + 1][x] !== '#' });
}));

export function sweep(hero: string) {
  const worst: { door: string; stall: number }[] = [];
  let maxStall = 0;
  for (const d of doors) for (const dir of [1, -1]) for (const off of [-0.4, -0.25, -0.1, 0, 0.1, 0.25, 0.4]) for (const lean of [null, 0, 0.2, -0.2]) {
    const w = createWorld({ hero, bots: [], seed: 1 });
    const p = w.actors[0];
    const cx = d.x + 0.5, cy = d.y + 0.5;
    // Start 2 u before the door, offset sideways; stick held across the door (plus a diagonal lean).
    if (d.vertical) { p.x = cx + off; p.y = cy - 2 * dir; } else { p.x = cx - 2 * dir; p.y = cy + off; }
    // null = stick held straight along the door axis; otherwise aimed at the door centre with a small lean.
    let mx = d.vertical ? 0 : dir, my = d.vertical ? dir : 0;
    if (lean !== null) { const a = Math.atan2(cy - p.y, cx - p.x) + lean; mx = Math.cos(a); my = Math.sin(a); }
    const n = Math.hypot(mx, my);
    let stall = 0, lx = p.x, ly = p.y, worstHere = 0;
    for (let i = 0; i < 240; i++) {
      stepWorld(w, { ...IDLE_INPUT, moveX: mx / n, moveY: my / n, aim: Math.atan2(my, mx) });
      const along = d.vertical ? p.y : p.x;
      const passed = (along - (d.vertical ? cy : cx)) * dir > 1;
      if (passed) break;
      // A stall = the hero is not moving at all while the stick is held (sliding along a wall is movement).
      if (Math.hypot(p.x - lx, p.y - ly) < 0.002) stall += 1 / 60; else stall = 0;
      worstHere = Math.max(worstHere, stall);
      lx = p.x; ly = p.y;
    }
    if (worstHere > 0.3) worst.push({ door: `${d.x},${d.y} dir ${dir} off ${off} lean ${lean}`, stall: +worstHere.toFixed(2) });
    maxStall = Math.max(maxStall, worstHere);
  }
  return { maxStall, worst };
}

describe('RC-1 doorway / corner snag sweep (every hero)', () => {
  it('finds the doors', () => expect(doors.length).toBeGreaterThan(10));
  for (const h of HEROES) it(`${h.name}: no stall over 0.3 s at any door, offset or diagonal`, () => {
    const r = sweep(h.id);
    expect(r.worst.slice(0, 8)).toEqual([]);
  });
});

describe('RC-1 vertex wedge (pushing straight into a door-frame corner)', () => {
  it('slides off the corner instead of stopping dead (door 10,3 frame)', () => {
    const w = createWorld({ hero: 'kettle', bots: [], seed: 1 });
    const p = w.actors[0];
    p.x = 8.5; p.y = 3.25;
    const n = Math.hypot(1, 0.5);
    for (let i = 0; i < 120; i++) stepWorld(w, { ...IDLE_INPUT, moveX: 1 / n, moveY: 0.5 / n });
    expect(p.x).toBeGreaterThan(10.5); // through the door
  });
});
