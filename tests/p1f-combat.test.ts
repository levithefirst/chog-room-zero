// Combat consistency (P1F phase 4): snagging, Brick slab navigation, cover rules, pickups vs firing.
import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, IDLE_INPUT, type World } from '../src/sim/world';
import { findPath, shotClear, sightClear, parseLevel, markDynamic } from '../src/sim/level';
import { COVER_RULES, coverStops } from '../src/sim/cover';
import { TUNING } from '../src/config/tuning';
import { WEAPONS } from '../src/config/weapons';
import type { Brain } from '../src/sim/bots';

const M = TUNING.movement;
function solo(hero = 'kettle', seed = 1): World {
  const w = createWorld({ seed, hero });
  w.actors[0].hp = 1e9;
  for (const b of w.actors.slice(1)) { b.alive = false; b.x = b.y = -50; }
  return w;
}
const walk = (w: World, mx: number, my: number, ticks: number, extra = {}) => {
  for (let i = 0; i < ticks; i++) stepWorld(w, { ...IDLE_INPUT, moveX: mx, moveY: my, ...extra });
};

describe('snagging (CHOG-MAP-001, ADE repro: spawn crates between spawn and the south door)', () => {
  // Room Zero: spawn (3.5,2.5); crates x2..4,y4..5 (P1FT moved them 1 tile west); south door tile x4,y6.
  for (const hero of ['kettle', 'brick']) {
    it(`${hero}: holding straight down from spawn slides past the crate instead of stopping dead`, () => {
      const w = solo(hero);
      const p = w.actors[0];
      walk(w, 0, 1, 90); // 1.5 s
      expect(p.y).toBeGreaterThan(5.4); // got below the crate's top face (y=4-r) and alongside it
    });
    it(`${hero}: diagonal into the crate keeps sliding (>=50% of the tangential speed)`, () => {
      const w = solo(hero);
      const p = w.actors[0];
      walk(w, 0, 1, 40);
      const x0 = p.x;
      walk(w, Math.SQRT1_2, Math.SQRT1_2, 30);
      expect(p.x - x0).toBeGreaterThan(0.5 * M.maxSpeed * w.actors[0].hero.speed * Math.SQRT1_2 * 0.5 * 0.9);
    });
  }
  it('head-on into the middle of a long wall still stops (no ghosting through faces)', () => {
    const w = solo();
    const p = w.actors[0];
    walk(w, 0, -1, 90); // north wall, y0=1
    expect(p.y).toBeCloseTo(1 + M.radius, 2);
    expect(p.x).toBeCloseTo(3.5, 1);
  });
  it('corner assist never pushes an actor into a solid box', () => {
    const w = solo();
    const p = w.actors[0];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      walk(w, Math.cos(a), Math.sin(a), 45);
      for (const b of w.level.solidBoxes) {
        const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cy = Math.max(b.y0, Math.min(p.y, b.y1));
        expect(Math.hypot(p.x - cx, p.y - cy)).toBeGreaterThan(M.radius - 0.02);
      }
    }
  });
});

describe('Brick slab: dynamic obstacle in nav', () => {
  const MAP = [
    '##########',
    '#........#',
    '#........#',
    '#........#',
    '#........#',
    '##########',
  ];
  it('findPath routes around a slab and back through once it expires', () => {
    const l = parseLevel(MAP);
    const box = { x0: 4, y0: 1, x1: 5, y1: 3.6 };
    const direct = findPath(l, 1.5, 1.5, 8.5, 1.5);
    markDynamic(l, box, 1);
    const around = findPath(l, 1.5, 1.5, 8.5, 1.5);
    expect(around.length).toBeGreaterThan(0);
    for (const n of around) expect(n.x > box.x0 - 0.3 && n.x < box.x1 + 0.3 && n.y < box.y1 + 0.3).toBe(false);
    markDynamic(l, box, -1);
    expect(findPath(l, 1.5, 1.5, 8.5, 1.5)).toEqual(direct);
  });
  it('a bot with a path re-plans when a slab drops on it (paths invalidated) and does not walk into it', () => {
    const w = createWorld({ seed: 4, hero: 'brick' });
    const p = w.actors[0];
    p.hp = 1e9;
    // Face east toward the corridor and drop the slab.
    stepWorld(w, { ...IDLE_INPUT, aim: 0 });
    for (const br of w.brains.values()) br.path.push({ x: 0, y: 0 });
    stepWorld(w, { ...IDLE_INPUT, aim: 0, ability: true });
    expect(w.barriers.length).toBe(1);
    for (const br of w.brains.values() as Iterable<Brain>) expect(br.path.find((n) => n.x === 0 && n.y === 0)).toBeUndefined();
    const slab = w.barriers[0].box;
    for (let i = 0; i < 300; i++) {
      stepWorld(w, IDLE_INPUT);
      for (const a of w.actors.slice(1)) {
        if (!a.alive) continue;
        const cx = Math.max(slab.x0, Math.min(a.x, slab.x1)), cy = Math.max(slab.y0, Math.min(a.y, slab.y1));
        if (w.barriers.length) expect(Math.hypot(a.x - cx, a.y - cy)).toBeGreaterThan(M.radius - 0.02);
      }
    }
  });
});

describe('cover rules (src/sim/cover.ts is the single source)', () => {
  const MAP = ['#########', '#.......#', '#...c...#', '#.......#', '#########'];
  const l = parseLevel(MAP);
  it('table: walls block sight; crates/slabs do not', () => {
    expect(COVER_RULES.wall.blocksSight).toBe(true);
    expect(COVER_RULES.crate.blocksSight).toBe(false);
    expect(sightClear(l, 1.5, 2.5, 7.5, 2.5)).toBe(true);
  });
  // RC-8 (owner 2026-10-13, "solid boxes block sniper shots"): the marksman no longer pierces crates or slabs.
  // Before RC-8 this test asserted the opposite (pierce passes); the rule changed, the check is as strict.
  it('a crate stops a rifle bullet from range, not from a shooter leaning on it; it stops the marksman too', () => {
    expect(shotClear(l, 1.5, 2.5, 7.5, 2.5, false, TUNING.combat.coverLean)).toBe(false);
    expect(shotClear(l, 3.2, 2.5, 7.5, 2.5, false, TUNING.combat.coverLean)).toBe(true);
    expect(shotClear(l, 1.5, 2.5, 7.5, 2.5, WEAPONS.marksman.piercesCover, TUNING.combat.coverLean)).toBe(false);
    expect(Object.values(WEAPONS).some((w) => w.piercesCover)).toBe(false);
    expect(coverStops('crate', false, 5)).toBe(true);
    expect(coverStops('crate', false, 1)).toBe(false);
    expect(coverStops('slab', true, 5)).toBe(true);
    expect(coverStops('crate', true, 5)).toBe(true);
    expect(coverStops('wall', true, 0)).toBe(true);
  });
  it("a bullet stopped by a crate emits a 'blocked' impact (client shows the blocked spark)", () => {
    const w = createWorld({ seed: 2, map: ['#############', '#...........#', '#P....c.....#', '#...........#', '#############'], bots: [] });
    for (let i = 0; i < 30; i++) stepWorld(w, { ...IDLE_INPUT, aim: 0, firing: true });
    const imp = w.sounds.concat().filter((s) => s.type === 'impact');
    // sounds are per-step; scan by re-running and collecting
    const seen: boolean[] = [];
    const w2 = createWorld({ seed: 2, map: ['#############', '#...........#', '#P....c.....#', '#...........#', '#############'], bots: [] });
    for (let i = 0; i < 40; i++) {
      stepWorld(w2, { ...IDLE_INPUT, aim: 0, firing: true });
      for (const s of w2.sounds) if (s.type === 'impact') seen.push(!!s.blocked);
    }
    expect(imp.length + seen.length).toBeGreaterThan(0);
    expect(seen.some((b) => b)).toBe(true);
  });
});

describe('pickups never interrupt firing', () => {
  it('walking over an ammo/health pickup while holding fire keeps the shot cadence', () => {
    const w = createWorld({ seed: 5, map: ['##########', '#........#', '#P.h.....#', '#........#', '##########'], bots: [] });
    const p = w.actors[0];
    p.hp = 50;
    let shots = 0;
    for (let i = 0; i < 60; i++) {
      stepWorld(w, { ...IDLE_INPUT, moveX: 1, aim: 0, firing: true });
      shots += w.sounds.filter((s) => s.type === 'shot' && s.sourceId === 0).length;
    }
    expect(w.sounds.length >= 0).toBe(true);
    expect(p.hp).toBeGreaterThan(50); // picked it up
    // 1 s of fire at 0.11 s interval: 9-10 shots, no gap from the pickup.
    expect(shots).toBeGreaterThanOrEqual(9);
  });
});
