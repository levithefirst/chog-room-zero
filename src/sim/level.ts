// Parses the tile map into collision boxes, sight segments, and a nav grid.
import type { Box, Segment } from './geom';
import { segmentBoxT } from './geom';
import { coverStops } from './cover';

export interface Level {
  w: number;
  h: number;
  // 0 floor, 1 wall, 2 crate, 3 barrier, 4 doorway (floor)
  tiles: Uint8Array;
  // Full walls only: block sight and bullets.
  wallBoxes: Box[];
  // Full walls plus cover: block movement and bullets.
  solidBoxes: Box[];
  coverBoxes: Box[];
  /** Dynamic obstacles (e.g. Brick's slab) per tile, counted; A* treats >0 as blocked. */
  dyn: Uint8Array;
  // Outline of full walls, for the visibility polygon.
  segments: Segment[];
  playerSpawn: { x: number; y: number };
  // Floor tiles next to a wall or cover piece: candidate spots for bots to hold or hide.
  coverSpots: { x: number; y: number }[];
  pickupSpawns: { kind: 'health' | 'armor' | 'ammo' | 'grenade'; x: number; y: number }[];
}

export const FLOOR = 0;
export const WALL = 1;
export const COVER = 2;
export const BARRIER = 3;
export const DOOR = 4;

export const walkable = (t: number) => t === FLOOR || t === DOOR;
export const isCover = (t: number) => t === COVER || t === BARRIER;

function mergeRuns(tiles: Uint8Array, w: number, h: number, kind: number): Box[] {
  // Horizontal runs, then merge identical runs downward. Fewer boxes, same shape.
  const runs: Box[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (tiles[y * w + x] !== kind) { x++; continue; }
      const start = x;
      while (x < w && tiles[y * w + x] === kind) x++;
      const above = runs.find((r) => r.x0 === start && r.x1 === x && r.y1 === y);
      if (above) above.y1 = y + 1;
      else runs.push({ x0: start, y0: y, x1: x, y1: y + 1 });
    }
  }
  return runs;
}

function outline(tiles: Uint8Array, w: number, h: number): Segment[] {
  const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || tiles[y * w + x] === WALL;
  const segs: Segment[] = [];
  // Horizontal edges.
  for (let y = 0; y <= h; y++) {
    for (const side of [0, 1]) {
      let start = -1;
      for (let x = 0; x <= w; x++) {
        // side 0: wall above edge, open below; side 1: open above, wall below.
        const edge = x < w && (side === 0
          ? isWall(x, y - 1) && !isWall(x, y) && y < h
          : !isWall(x, y - 1) && isWall(x, y) && y > 0);
        if (edge && start < 0) start = x;
        if (!edge && start >= 0) { segs.push({ ax: start, ay: y, bx: x, by: y }); start = -1; }
      }
    }
  }
  for (let x = 0; x <= w; x++) {
    for (const side of [0, 1]) {
      let start = -1;
      for (let y = 0; y <= h; y++) {
        const edge = y < h && (side === 0
          ? isWall(x - 1, y) && !isWall(x, y) && x < w
          : !isWall(x - 1, y) && isWall(x, y) && x > 0);
        if (edge && start < 0) start = y;
        if (!edge && start >= 0) { segs.push({ ax: x, ay: start, bx: x, by: y }); start = -1; }
      }
    }
  }
  return segs;
}

export function parseLevel(rows: readonly string[]): Level {
  const h = rows.length;
  const w = rows[0].length;
  const tiles = new Uint8Array(w * h);
  let playerSpawn = { x: 1.5, y: 1.5 };
  const pickupSpawns: Level['pickupSpawns'] = [];
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`Map row ${y} has length ${rows[y].length}, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      tiles[y * w + x] = ch === '#' ? WALL : ch === 'c' ? COVER : ch === 'b' ? BARRIER : ch === 'd' ? DOOR : FLOOR;
      if (ch === 'P') playerSpawn = { x: x + 0.5, y: y + 0.5 };
      if (ch === 'h' || ch === 'a' || ch === 'm' || ch === 'g') pickupSpawns.push({ kind: ch === 'h' ? 'health' : ch === 'a' ? 'armor' : ch === 'g' ? 'grenade' : 'ammo', x: x + 0.5, y: y + 0.5 });
    }
  }
  const wallBoxes = mergeRuns(tiles, w, h, WALL);
  const coverBoxes = [...mergeRuns(tiles, w, h, COVER), ...mergeRuns(tiles, w, h, BARRIER)];
  const coverSpots: { x: number; y: number }[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (tiles[y * w + x] !== FLOOR) continue;
      const n = [tiles[y * w + x - 1], tiles[y * w + x + 1], tiles[(y - 1) * w + x], tiles[(y + 1) * w + x]];
      if (n.some((t) => !walkable(t))) coverSpots.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  return {
    w, h, tiles, wallBoxes, coverBoxes, dyn: new Uint8Array(w * h),
    solidBoxes: [...wallBoxes, ...coverBoxes],
    segments: outline(tiles, w, h),
    playerSpawn, coverSpots, pickupSpawns,
  };
}

export function tileAt(l: Level, x: number, y: number): number {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= l.w || ty >= l.h) return WALL;
  return l.tiles[ty * l.w + tx];
}

/** True when no full wall lies between a and b. Cover does not block sight. */
export function sightClear(l: Level, ax: number, ay: number, bx: number, by: number): boolean {
  for (const b of l.wallBoxes) {
    const t = segmentBoxT(ax, ay, bx, by, b);
    if (t >= 0 && t < 1) return false;
  }
  return true;
}

function boxDist(x: number, y: number, b: Box): number {
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dy = Math.max(b.y0 - y, 0, y - b.y1);
  return Math.hypot(dx, dy);
}

/**
 * Half-cover RULE: a crate or barrier stops a bullet unless the bullet was fired from within `lean` u of that
 * box (the shooter is leaning over it), or the weapon pierces cover. Walls always stop bullets.
 * Returns the first blocking t in [0,1] for the segment, or -1.
 */
/** Set by bulletBlockT: was the returned block a cover box (crate/slab) rather than a wall? */
export let blockedByCover = false;

export function bulletBlockT(
  l: Level, ox: number, oy: number, x0: number, y0: number, x1: number, y1: number, pierce: boolean, lean: number,
): number {
  let best = -1;
  for (const b of l.wallBoxes) {
    const t = segmentBoxT(x0, y0, x1, y1, b);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  blockedByCover = false;
  for (const b of l.coverBoxes) {
    // Crates (static) and slabs (Brick barriers, pushed at runtime) share one rule: cover.ts.
    if (!coverStops('crate', pierce, boxDist(ox, oy, b) <= lean ? 0 : Infinity)) continue;
    const t = segmentBoxT(x0, y0, x1, y1, b);
    if (t >= 0 && (best < 0 || t < best)) { best = t; blockedByCover = true; }
  }
  return best;
}

/** True when a bullet fired from a would reach b under the half-cover rule. */
export function shotClear(l: Level, ax: number, ay: number, bx: number, by: number, pierce = false, lean = 1.25): boolean {
  const t = bulletBlockT(l, ax, ay, ax, ay, bx, by, pierce, lean);
  return t < 0 || t >= 1;
}

/**
 * A* over walkable tiles, 8-way without cutting corners. Returns tile-centre waypoints, excluding the start; [] when
 * the goal is blocked or out of reach. A binary heap keeps it fast on the big venue (a whole-map path is ~2,000
 * expansions); by default it may expand every tile.
 */
export function findPath(l: Level, sx: number, sy: number, gx: number, gy: number, maxNodes = l.w * l.h): { x: number; y: number }[] {
  const w = l.w, n = w * l.h;
  const start = Math.floor(sy) * w + Math.floor(sx);
  const goal = Math.floor(gy) * w + Math.floor(gx);
  if (start < 0 || start >= n || goal < 0 || goal >= n) return [];
  const walk = (i: number) => walkable(l.tiles[i]) && l.dyn[i] === 0;
  if (!walk(goal)) return [];
  const g = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const hx = goal % w, hy = Math.floor(goal / w);
  // Octile distance: exact for 8-way moves, so the path is optimal.
  const heur = (i: number) => { const dx = Math.abs((i % w) - hx), dy = Math.abs(Math.floor(i / w) - hy); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
  // Min-heap of (f, node).
  const hf: number[] = [], hn: number[] = [];
  const push = (f: number, i: number) => {
    let k = hf.length; hf.push(f); hn.push(i);
    while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hf[k] = hf[p]; hn[k] = hn[p]; k = p; }
    hf[k] = f; hn[k] = i;
  };
  const pop = (): number => {
    const top = hn[0], lf = hf.pop()!, ln = hn.pop()!;
    if (hf.length) {
      let k = 0;
      for (;;) {
        const a = 2 * k + 1, b = a + 1;
        let m = k, mf = lf;
        if (a < hf.length && hf[a] < mf) { m = a; mf = hf[a]; }
        if (b < hf.length && hf[b] < mf) { m = b; mf = hf[b]; }
        if (m === k) break;
        hf[k] = hf[m]; hn[k] = hn[m]; k = m;
      }
      hf[k] = lf; hn[k] = ln;
    }
    return top;
  };
  g[start] = 0;
  push(heur(start), start);
  let expanded = 0;
  while (hf.length && expanded < maxNodes) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    expanded++;
    const cx = cur % w, cy = Math.floor(cur / w);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= l.h) continue;
        const ni = ny * w + nx;
        if (closed[ni] || !walk(ni)) continue;
        if (dx && dy && (!walk(cy * w + nx) || !walk(ny * w + cx))) continue;
        const ng = g[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          from[ni] = cur;
          push(ng + heur(ni), ni);
        }
      }
    }
  }
  if (from[goal] < 0 && goal !== start) return [];
  const path: { x: number; y: number }[] = [];
  for (let i = goal; i !== start && i >= 0; i = from[i]) path.push({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 });
  return path.reverse();
}

/** Add (+1) or remove (-1) a dynamic obstacle box to the nav grid: every tile it overlaps (padded by body radius). */
export function markDynamic(l: Level, b: Box, delta: 1 | -1, pad = 0.3): void {
  const x0 = Math.max(0, Math.floor(b.x0 - pad)), x1 = Math.min(l.w - 1, Math.floor(b.x1 + pad - 1e-6));
  const y0 = Math.max(0, Math.floor(b.y0 - pad)), y1 = Math.min(l.h - 1, Math.floor(b.y1 + pad - 1e-6));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * l.w + x;
    l.dyn[i] = Math.max(0, l.dyn[i] + delta);
  }
}
