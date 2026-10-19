import { describe, expect, it } from 'vitest';
import { createWorld, hears, player, stepWorld, IDLE_INPUT, type ActorInput, type SoundEvent } from '../src/sim/world';
import { parseLevel, findPath, sightClear, FLOOR, tileAt, walkable } from '../src/sim/level';
import { canSee, visibilityPolygon } from '../src/sim/vision';
import { pointInPolygon } from '../src/sim/geom';
import { TUNING } from '../src/config/tuning';
import { BOT_SPAWNS, ROOM_ZERO } from '../src/config/map';

// 12x7 test room: a full wall in the middle with a gap at the bottom, and one cover block.
const TEST_MAP = [
  '############',
  '#....#.....#',
  '#.P..#.....#',
  '#....#..c..#',
  '#....#.....#',
  '#..........#',
  '############',
];
const BOT_RIGHT = [{ name: 'T', hero: 'kettle', patrol: [[8, 2]] as [number, number][], flanker: false }];
const input = (o: Partial<ActorInput>): ActorInput => ({ ...IDLE_INPUT, ...o });
const DEG = Math.PI / 180;

describe('Room Zero map', () => {
  const l = parseLevel(ROOM_ZERO);
  it('is 68x42 (FS venue), closed, with spawns, pickups and patrol points on walkable floor', () => {
    expect(l.w).toBe(68);
    expect(l.h).toBe(42);
    for (let x = 0; x < l.w; x++) expect(tileAt(l, x + 0.5, 0.5)).not.toBe(FLOOR);
    expect(tileAt(l, l.playerSpawn.x, l.playerSpawn.y)).toBe(FLOOR);
    for (const b of BOT_SPAWNS) for (const [x, y] of b.patrol) expect(walkable(tileAt(l, x + 0.5, y + 0.5)), `${b.name} ${x},${y}`).toBe(true);
    // Pickups are laid out by zone (tests/pickup-layout.test.ts covers the rules); the map itself has no fixed ones. GP: 4 more ammo.
    const pk = createWorld().pickups;
    for (const [k, n] of [['health', 10], ['armor', 8], ['ammo', 12], ['grenade', 8]] as const) expect(pk.filter((p) => p.kind === k).length).toBe(n);
  });
  it('every walkable tile and every pickup is reachable from the player spawn', () => {
    const seen = new Uint8Array(l.w * l.h);
    const q = [Math.floor(l.playerSpawn.y) * l.w + Math.floor(l.playerSpawn.x)];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop()!;
      for (const n of [i + 1, i - 1, i + l.w, i - l.w]) if (!seen[n] && walkable(l.tiles[n])) { seen[n] = 1; q.push(n); }
    }
    for (let i = 0; i < l.tiles.length; i++) if (walkable(l.tiles[i])) expect(seen[i], `tile ${i % l.w},${Math.floor(i / l.w)}`).toBe(1);
    for (const p of createWorld().pickups) expect(findPath(l, l.playerSpawn.x, l.playerSpawn.y, p.x, p.y, 8000).length).toBeGreaterThan(0);
  });
  it('has chokepoints (doorways) and no straight open lane longer than 28 u on the 68 u venue (FS; CF-F was 15 on 44)', () => {
    expect(Array.from(l.tiles).filter((t) => t === 4).length).toBeGreaterThanOrEqual(24);
    // No lane runs the full width: the corridors and the atrium are broken by pillars (tests/venue.test.ts).
    for (const y of [10, 11, 20, 21, 30, 31]) expect(sightClear(l, 1.5, y + 0.5, 66.5, y + 0.5)).toBe(false);
    const open = (x: number, y: number) => l.tiles[y * l.w + x] !== 1;
    let longest = 0;
    for (let y = 0; y < l.h; y++) for (let x = 0, run = 0; x <= l.w; x++) { run = x < l.w && open(x, y) ? run + 1 : 0; longest = Math.max(longest, run); }
    for (let x = 0; x < l.w; x++) for (let y = 0, run = 0; y <= l.h; y++) { run = y < l.h && open(x, y) ? run + 1 : 0; longest = Math.max(longest, run); }
    expect(longest).toBeLessThanOrEqual(28);
  });
  it('every bot spawn is reachable from the player spawn', () => {
    for (const b of BOT_SPAWNS) {
      const [x, y] = b.patrol[0];
      expect(findPath(l, l.playerSpawn.x, l.playerSpawn.y, x + 0.5, y + 0.5, 8000).length).toBeGreaterThan(0);
    }
  });
  it('no single bot spawn sees the player spawn (first contact is earned)', () => {
    for (const b of BOT_SPAWNS) {
      const [x, y] = b.patrol[0];
      expect(sightClear(l, x + 0.5, y + 0.5, l.playerSpawn.x, l.playerSpawn.y)).toBe(false);
    }
  });
});

describe('collision', () => {
  it('slides along a wall instead of stopping dead', () => {
    const w = createWorld({ map: TEST_MAP, bots: [] });
    const p = player(w);
    p.x = 4.4; p.y = 2.5;
    for (let i = 0; i < 30; i++) stepWorld(w, input({ moveX: Math.SQRT1_2, moveY: Math.SQRT1_2 }));
    expect(p.x).toBeLessThanOrEqual(5 - TUNING.movement.radius + 1e-6); // never enters the wall
    expect(p.y).toBeGreaterThan(3); // kept moving down along it
  });
  it('cover blocks movement', () => {
    const w = createWorld({ map: TEST_MAP, bots: [] });
    const p = player(w);
    p.x = 6.5; p.y = 3.5;
    for (let i = 0; i < 60; i++) stepWorld(w, input({ moveX: 1 }));
    expect(p.x).toBeLessThanOrEqual(8 - TUNING.movement.radius + 1e-6);
  });
});

describe('projectiles', () => {
  it('travel over several ticks (no hitscan)', () => {
    const w = createWorld({ map: TEST_MAP, bots: [] });
    player(w).facing = Math.PI / 2; // already facing the aim (GP: a pull waits for the body to turn)
    stepWorld(w, input({ aim: Math.PI / 2, firing: true }));
    const b = w.bullets[0];
    const d1 = Math.hypot(b.x - b.ox, b.y - b.oy);
    expect(d1).toBeCloseTo(player(w).weapon.bulletSpeed * TUNING.simStepSeconds, 5);
  });
  it('stop at a wall and make an impact sound there', () => {
    const w = createWorld({ map: TEST_MAP, bots: [] });
    let impact: SoundEvent | undefined;
    stepWorld(w, input({ aim: 0, firing: true }));
    for (let i = 0; i < 30 && !impact; i++) {
      stepWorld(w, IDLE_INPUT);
      impact = w.sounds.find((s) => s.type === 'impact');
    }
    expect(impact).toBeDefined();
    expect(impact!.x).toBeCloseTo(5, 1); // wall face at x = 5
    expect(w.bullets.length).toBe(0);
  });
  it('a bullet cannot pass through a thin wall even at large dt (swept)', () => {
    const w = createWorld({ map: TEST_MAP, bots: [] });
    stepWorld(w, input({ aim: 0, firing: true }));
    stepWorld(w, IDLE_INPUT, 0.5); // 15 u in one step
    expect(w.bullets.length).toBe(0);
    expect(w.sounds.some((s) => s.type === 'impact' && s.x < 5.01)).toBe(true);
  });
  it('hit, damage, death, and kill info', () => {
    const w = createWorld({ map: TEST_MAP, bots: BOT_RIGHT });
    const p = player(w), bot = w.actors[1];
    p.x = 2.5; p.y = 5.5; bot.x = 9.5; bot.y = 5.5;
    let ticks = 0;
    while (bot.alive && ticks++ < 600) {
      stepWorld(w, input({ aim: 0, firing: true }));
      // Pin the target so this test measures damage, not dodging.
      bot.x = 9.5; bot.y = 5.5; bot.vx = bot.vy = 0; bot.facing = 0;
    }
    expect(bot.alive).toBe(false);
    expect(bot.hp).toBe(0);
    expect(p.kills).toBe(1);
    expect(w.outcome).toBe('won');
  });
  it('player death records the killer and the line of the shot', () => {
    const w = createWorld({ map: TEST_MAP, bots: BOT_RIGHT });
    const p = player(w), bot = w.actors[1];
    p.x = 2.5; p.y = 5.5; bot.x = 9.5; bot.y = 5.5; bot.facing = Math.PI;
    let ticks = 0;
    while (p.alive && ticks++ < 1200) stepWorld(w, input({ aim: -Math.PI / 2 }));
    expect(w.outcome).toBe('dead');
    expect(w.playerKill?.killerId).toBe(bot.id);
    expect(w.playerKill!.fromX).toBeGreaterThan(5);
  });
});

describe('sight', () => {
  const l = parseLevel(TEST_MAP);
  const view = { range: 9, coneRad: 70 * DEG, nearRadius: 1.6 };
  it('a target behind a full wall is not visible, even inside the cone and range', () => {
    expect(canSee(l, 3.5, 2.5, 0, view, 8.5, 2.5)).toBe(false);
  });
  it('the same target is visible through the door gap', () => {
    expect(canSee(l, 3.5, 5.5, 0, view, 8.5, 5.5)).toBe(true);
  });
  it('cover does not block sight', () => {
    expect(canSee(l, 6.5, 3.5, 0, view, 10.5, 3.5)).toBe(true);
  });
  it('outside the cone is not visible; inside the near circle always is (if no wall)', () => {
    expect(canSee(l, 3.5, 5.5, Math.PI, view, 8.5, 5.5)).toBe(false);
    expect(canSee(l, 3.5, 5.5, Math.PI, view, 4.5, 5.5)).toBe(true);
  });
  it('the visibility polygon excludes points behind walls and includes lit points', () => {
    const poly = visibilityPolygon(l, 3.5, 3.5, 0, view, 1.5 * DEG, []);
    expect(pointInPolygon(4.5, 3.5, poly)).toBe(true);
    expect(pointInPolygon(8.5, 3.5, poly)).toBe(false);
  });
  it('moving the wall changes what is visible (G3)', () => {
    const open = parseLevel(TEST_MAP.map((r) => r.slice(0, 5) + '.' + r.slice(6)).map((r, i) => (i === 0 || i === 6 ? TEST_MAP[i] : r)));
    expect(canSee(open, 3.5, 2.5, 0, view, 8.5, 2.5)).toBe(true);
  });
});

describe('bot perception limits', () => {
  it('a bot behind a wall does not see the player and does not react', () => {
    const w = createWorld({ map: TEST_MAP, bots: BOT_RIGHT });
    const bot = w.actors[1];
    bot.facing = Math.PI;
    for (let i = 0; i < 120; i++) stepWorld(w, IDLE_INPUT);
    const br = w.brains.get(bot.id)!;
    expect(br.sawPlayer).toBe(false);
    expect(br.state).toBe('patrol');
  });
  it('a shot within hearing range sends it to investigate; a footstep out of range does not', () => {
    const l = parseLevel(TEST_MAP);
    const step: SoundEvent = { type: 'quietStep', x: 2.5, y: 2.5, radius: TUNING.sound.quietStep, sourceId: 0, team: 'player', tick: 0 };
    expect(hears(l, 8.5, 2.5, step)).toBe(false);
    const w = createWorld({ map: TEST_MAP, bots: BOT_RIGHT });
    player(w).facing = Math.PI; // already facing the aim (GP: a pull waits for the body to turn)
    stepWorld(w, input({ aim: Math.PI, firing: true }));
    stepWorld(w, IDLE_INPUT);
    expect(w.brains.get(1)!.state).toBe('investigate');
  });
  it('a wall shrinks hearing range', () => {
    const l = parseLevel(TEST_MAP);
    const s: SoundEvent = { type: 'step', x: 3.5, y: 2.5, radius: 6, sourceId: 0, team: 'player', tick: 0 };
    expect(hears(l, 8.5, 2.5, s)).toBe(false); // 5 u away, behind a wall: 6 * 0.6 = 3.6
    expect(hears(l, 3.5, 7.4 - 2, s)).toBe(true);
  });
  it('a bot reacts only after the reaction delay', () => {
    const w = createWorld({ map: TEST_MAP, bots: BOT_RIGHT });
    const p = player(w), bot = w.actors[1];
    p.x = 3.5; p.y = 5.5; bot.x = 8.5; bot.y = 5.5; bot.facing = Math.PI;
    stepWorld(w, IDLE_INPUT);
    expect(w.brains.get(1)!.state).toBe('alert');
    // Seeded per-acquisition delay within [reactionMin, reactionMax] (docs/design/bots.md).
    const r = w.brains.get(1)!.reaction;
    expect(r).toBeGreaterThanOrEqual(TUNING.perception.reactionMin);
    expect(r).toBeLessThanOrEqual(TUNING.perception.reactionMax);
    const ticks = Math.ceil(r / TUNING.simStepSeconds);
    for (let i = 0; i < ticks - 3; i++) stepWorld(w, IDLE_INPUT);
    expect(w.brains.get(1)!.state).toBe('alert');
    expect(bot.shots).toBe(0);
    for (let i = 0; i < 6; i++) stepWorld(w, IDLE_INPUT);
    expect(w.brains.get(1)!.state).toBe('engage');
  });
});

describe('determinism', () => {
  it('same seed and inputs give a deep-equal match in Room Zero', () => {
    const run = () => {
      const w = createWorld({ seed: 7 });
      for (let i = 0; i < 1800; i++) {
        const t = i / 60;
        stepWorld(w, input({ moveX: Math.cos(t), moveY: Math.sin(t * 0.7), aim: t, firing: i % 90 < 20, quiet: i % 300 < 100 }));
      }
      return { tick: w.tick, rng: w.rng, actors: w.actors, bullets: w.bullets, outcome: w.outcome };
    };
    expect(run()).toEqual(run());
  });
});
