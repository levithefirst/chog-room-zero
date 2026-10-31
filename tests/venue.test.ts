// Owner 2026-10-17 FS: "venues need to be much bigger, while remaining tactically dense": longer rotations, several
// routes (primary, secondary, flank), risky shortcuts and safer rotations, contested resources, cover networks, open
// sightlines and close quarters. The 68 x 42 Room Zero (src/config/map.ts) measured, not eyeballed. Replaces the
// 44 x 26 shape checks (tests/world.test.ts, cf-lab F); the numbers below are what the layout measures, with margin.
import { describe, expect, it } from 'vitest';
import { BOT_SPAWNS, PICKUP_ZONES, ROOM_ZERO, TACTICAL_POINTS, VERSUS_SPAWNS, ZONE_CENTRES } from '../src/config/map';
import { DOOR, WALL, findPath, parseLevel, sightClear, walkable, type Level } from '../src/sim/level';
import { openSpot } from '../src/sim/zone';
import { TUNING } from '../src/config/tuning';

const l = parseLevel(ROOM_ZERO);
const idx = (x: number, y: number) => y * l.w + x;

/** 4-way walking distance from (sx, sy) to every tile, allowed tiles only. */
function walk(lv: Level, sx: number, sy: number, allow: (x: number, y: number) => boolean = () => true): Float32Array {
  const d = new Float32Array(lv.w * lv.h).fill(Infinity);
  const q = [idx(Math.floor(sx), Math.floor(sy))];
  d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % lv.w, y = (i - x) / lv.w;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const n = idx(nx, ny);
      if (nx < 0 || ny < 0 || nx >= lv.w || ny >= lv.h || d[n] !== Infinity || !walkable(lv.tiles[n]) || !allow(nx, ny)) continue;
      d[n] = d[i] + 1;
      q.push(n);
    }
  }
  return d;
}
/** Straight runs of see-through tiles (anything but wall), rows and columns. */
function lanes(): number[] {
  const out: number[] = [];
  const open = (x: number, y: number) => l.tiles[idx(x, y)] !== WALL;
  for (let y = 0; y < l.h; y++) for (let x = 0, run = 0; x <= l.w; x++) { if (x < l.w && open(x, y)) run++; else { if (run) out.push(run); run = 0; } }
  for (let x = 0; x < l.w; x++) for (let y = 0, run = 0; y <= l.h; y++) { if (y < l.h && open(x, y)) run++; else { if (run) out.push(run); run = 0; } }
  return out;
}

describe('the 68 x 42 venue', () => {
  it('is 68 x 42, closed, mirrored for the two online sides, and nearly three times the floor of the old map', () => {
    expect([l.w, l.h]).toEqual([68, 42]);
    for (let x = 0; x < l.w; x++) { expect(l.tiles[idx(x, 0)]).toBe(WALL); expect(l.tiles[idx(x, l.h - 1)]).toBe(WALL); }
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) expect(l.tiles[idx(x, y)], `${x},${y}`).toBe(l.tiles[idx(l.w - 1 - x, y)]);
    const floor = Array.from(l.tiles).filter(walkable).length;
    expect(floor).toBeGreaterThanOrEqual(1900); // the 44 x 26 map had 676
    // Doorways are the chokepoints between rooms (and the frames that slow a rotation down).
    expect(Array.from(l.tiles).filter((t) => t === DOOR).length).toBeGreaterThanOrEqual(24);
  });

  it('every floor tile is reachable from the solo spawn and from both online spawns', () => {
    for (const s of [l.playerSpawn, VERSUS_SPAWNS.alpha[0], VERSUS_SPAWNS.bravo[0]]) {
      const d = walk(l, s.x, s.y);
      for (let i = 0; i < l.tiles.length; i++) if (walkable(l.tiles[i])) expect(d[i], `tile ${i % l.w},${Math.floor(i / l.w)}`).toBeLessThan(Infinity);
    }
  });

  it('three separate lanes cross the map (north, middle, south): rotations and flanks, not one corridor', () => {
    const a = VERSUS_SPAWNS.alpha[0], b = VERSUS_SPAWNS.bravo[0];
    const halls = (x: number) => x <= 7 || x >= 60;
    const bands: [string, (x: number, y: number) => boolean][] = [
      ['north (gallery + north corridor)', (x, y) => halls(x) || y <= 11],
      ['middle (side rooms, flanks, atrium)', (x, y) => halls(x) || (y >= 12 && y <= 29)],
      ['south (south corridor + dock)', (x, y) => halls(x) || y >= 29],
    ];
    const direct = walk(l, a.x, a.y)[idx(Math.floor(b.x), Math.floor(b.y))];
    for (const [name, allow] of bands) {
      const d = walk(l, a.x, a.y, allow)[idx(Math.floor(b.x), Math.floor(b.y))];
      expect(d, name).toBeLessThan(Infinity);
      // No lane is a huge detour: each is within 60% of the shortest crossing (a choice, not a trap).
      expect(d, name).toBeLessThanOrEqual(direct * 1.6);
    }
    // And the middle splits again: a flank corridor on each side of the atrium (blocking the atrium still crosses).
    const noAtrium = walk(l, a.x, a.y, (x, y) => halls(x) || (y >= 12 && y <= 29 && (x < 23 || x > 44)) || y <= 11 || y >= 29);
    expect(noAtrium[idx(Math.floor(b.x), Math.floor(b.y))]).toBeLessThan(Infinity);
    // Rotation length: spawn to spawn is a real walk (the old map: 38 tiles).
    expect(direct).toBeGreaterThanOrEqual(60);
  });

  it('open sightlines exist (snipers have lanes) but none is longer than 28 u, and most of the floor is close quarters', () => {
    const all = lanes();
    expect(Math.max(...all)).toBeLessThanOrEqual(28);
    expect(all.filter((r) => r >= 18).length).toBeGreaterThanOrEqual(6);
    // Close quarters: tiles whose row run and column run are both short (rooms, corridors, doorways).
    let close = 0, floor = 0;
    for (let y = 1; y < l.h - 1; y++) for (let x = 1; x < l.w - 1; x++) {
      if (!walkable(l.tiles[idx(x, y)])) continue;
      floor++;
      let rx = 0, ry = 0;
      for (let i = x; i < l.w && l.tiles[idx(i, y)] !== WALL; i++) rx++;
      for (let i = x - 1; i >= 0 && l.tiles[idx(i, y)] !== WALL; i--) rx++;
      for (let j = y; j < l.h && l.tiles[idx(x, j)] !== WALL; j++) ry++;
      for (let j = y - 1; j >= 0 && l.tiles[idx(x, j)] !== WALL; j--) ry++;
      if (Math.min(rx, ry) <= 8) close++;
    }
    expect(close / floor).toBeGreaterThan(0.5);
    // Cover networks: crates and barriers spread over the floor (at least one within 4 u of most floor tiles).
    const cover = l.coverBoxes.map((b) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }));
    let near = 0;
    for (let y = 1; y < l.h - 1; y++) for (let x = 1; x < l.w - 1; x++) if (walkable(l.tiles[idx(x, y)]) && cover.some((c) => Math.hypot(c.x - x - 0.5, c.y - y - 0.5) <= 4)) near++;
    expect(near / floor).toBeGreaterThan(0.6);
  });

  it('spawns: walkable, nothing sees the solo spawn, the nearest bot patrol is a long walk away; versus mirrored', () => {
    for (const b of BOT_SPAWNS) for (const [x, y] of b.patrol) expect(walkable(l.tiles[idx(x, y)]), `${b.name} ${x},${y}`).toBe(true);
    const d = walk(l, l.playerSpawn.x, l.playerSpawn.y);
    for (const b of BOT_SPAWNS) {
      const [x, y] = b.patrol[0];
      expect(sightClear(l, x + 0.5, y + 0.5, l.playerSpawn.x, l.playerSpawn.y)).toBe(false);
      expect(d[idx(x, y)], b.name).toBeGreaterThanOrEqual(35);
    }
    expect(VERSUS_SPAWNS.alpha.length).toBe(VERSUS_SPAWNS.bravo.length);
    VERSUS_SPAWNS.alpha.forEach((s, i) => {
      expect(VERSUS_SPAWNS.bravo[i].x).toBeCloseTo(l.w - s.x, 6);
      expect(VERSUS_SPAWNS.bravo[i].y).toBe(s.y);
      expect(walkable(l.tiles[idx(Math.floor(s.x), Math.floor(s.y))])).toBe(true);
      for (const o of VERSUS_SPAWNS.bravo) expect(sightClear(l, s.x, s.y, o.x, o.y)).toBe(false);
    });
  });

  it('every danger-zone centre and squad tactical point is open floor; pickup zones cover the whole venue', () => {
    for (const c of ZONE_CENTRES) expect(openSpot(l, c.x, c.y, TUNING.zone.clearance), `${c.x},${c.y}`).toBe(true);
    for (const p of TACTICAL_POINTS) expect(walkable(l.tiles[idx(Math.floor(p.x), Math.floor(p.y))]), `${p.x},${p.y}`).toBe(true);
    expect(TACTICAL_POINTS.length).toBeGreaterThanOrEqual(30);
    // Zones in every part: both halves, and north, middle and south bands.
    const parts = new Set(PICKUP_ZONES.map((z) => `${(z.x0 + z.x1) / 2 < 34 ? 'w' : (z.x0 + z.x1) / 2 > 34 ? 'e' : 'm'}${(z.y0 + z.y1) / 2 < 12 ? 'n' : (z.y0 + z.y1) / 2 > 29 ? 's' : 'c'}`));
    for (const p of ['wn', 'wc', 'ws', 'en', 'ec', 'es']) expect(parts.has(p), p).toBe(true);
  });

  it('pathfinding: every tactical point reaches every other, paths are short and clear of walls, and it is fast', () => {
    const t0 = performance.now();
    let n = 0;
    for (const a of TACTICAL_POINTS) for (const b of TACTICAL_POINTS) {
      if (a === b) continue;
      const p = findPath(l, a.x, a.y, b.x, b.y);
      expect(p.length, `${a.x},${a.y} -> ${b.x},${b.y}`).toBeGreaterThan(0);
      // Never through a wall: consecutive waypoints have a clear line.
      let prev = a, len = 0;
      for (const q of p) { expect(sightClear(l, prev.x, prev.y, q.x, q.y)).toBe(true); len += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; }
      // Close to the walking optimum: no longer than the 4-way walk (an 8-way path is shorter or equal) plus a tile.
      const walkLen = walk(l, a.x, a.y)[idx(Math.floor(b.x), Math.floor(b.y))];
      expect(len).toBeLessThanOrEqual(walkLen + 1.5);
      n++;
    }
    const ms = performance.now() - t0;
    expect(n).toBeGreaterThan(800);
    // Reported for the docs; the walk BFS above dominates. A* alone is timed in tests/fs-perf (perf section).
    expect(ms).toBeLessThan(60000);
  }, 120000);
});
