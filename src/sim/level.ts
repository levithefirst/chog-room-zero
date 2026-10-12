// Parses the tile map into collision boxes, sight segments, and a nav grid.
import type { Box, Segment } from './geom';
import { segmentBoxT } from './geom';

export interface Level {
  w: number;
  h: number;
  // 0 floor, 1 full wall, 2 half cover
  tiles: Uint8Array;
  // Full walls only: block sight and bullets.
  wallBoxes: Box[];
  // Full walls plus cover: block movement and bullets.
  solidBoxes: Box[];
  coverBoxes: Box[];
  // Outline of full walls, for the visibility polygon.
  segments: Segment[];
  playerSpawn: { x: number; y: number };
  // Floor tiles next to a wall or cover piece: candidate spots for bots to hold or hide.
  coverSpots: { x: number; y: number }[];
}

export const FLOOR = 0;
export const WALL = 1;
export const COVER = 2;

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
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`Map row ${y} has length ${rows[y].length}, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      tiles[y * w + x] = ch === '#' ? WALL : ch === 'c' ? COVER : FLOOR;
      if (ch === 'P') playerSpawn = { x: x + 0.5, y: y + 0.5 };
    }
  }
  const wallBoxes = mergeRuns(tiles, w, h, WALL);
  const coverBoxes = mergeRuns(tiles, w, h, COVER);
  const coverSpots: { x: number; y: number }[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (tiles[y * w + x] !== FLOOR) continue;
      const n = [tiles[y * w + x - 1], tiles[y * w + x + 1], tiles[(y - 1) * w + x], tiles[(y + 1) * w + x]];
      if (n.some((t) => t !== FLOOR)) coverSpots.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  return {
    w, h, tiles, wallBoxes, coverBoxes,
    solidBoxes: [...wallBoxes, ...coverBoxes],
    segments: outline(tiles, w, h),
    playerSpawn, coverSpots,
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

/** True when nothing solid (walls or cover) lies between a and b: a clear shot. */
export function shotClear(l: Level, ax: number, ay: number, bx: number, by: number): boolean {
  for (const b of l.solidBoxes) {
    const t = segmentBoxT(ax, ay, bx, by, b);
    if (t >= 0 && t < 1) return false;
  }
  return true;
}

/** A* over walkable tiles, 8-way without cutting corners. Returns tile-centre waypoints, excluding the start. */
export function findPath(l: Level, sx: number, sy: number, gx: number, gy: number, maxNodes = 2000): { x: number; y: number }[] {
  const w = l.w;
  const start = Math.floor(sy) * w + Math.floor(sx);
  const goal = Math.floor(gy) * w + Math.floor(gx);
  const walk = (i: number) => l.tiles[i] === FLOOR;
  if (!walk(goal)) return [];
  const g = new Float32Array(w * l.h).fill(Infinity);
  const from = new Int32Array(w * l.h).fill(-1);
  const closed = new Uint8Array(w * l.h);
  const open: number[] = [start];
  const f = new Float32Array(w * l.h).fill(Infinity);
  const hx = goal % w, hy = Math.floor(goal / w);
  const heur = (i: number) => Math.hypot((i % w) - hx, Math.floor(i / w) - hy);
  g[start] = 0;
  f[start] = heur(start);
  let expanded = 0;
  while (open.length && expanded < maxNodes) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
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
        if (!walk(ni)) continue;
        if (dx && dy && (!walk(cy * w + nx) || !walk(ny * w + cx))) continue;
        const ng = g[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          f[ni] = ng + heur(ni);
          from[ni] = cur;
          open.push(ni);
        }
      }
    }
  }
  if (from[goal] < 0 && goal !== start) return [];
  const path: { x: number; y: number }[] = [];
  for (let i = goal; i !== start && i >= 0; i = from[i]) path.push({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 });
  return path.reverse();
}
