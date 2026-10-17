// Pickup layout (owner 2026-10-17: "a tactical resource space, not a vending machine"). Room Zero names zones, not
// spots (src/config/map.ts PICKUP_ZONES): each zone is a room or a stretch of one, and the pickup in it sits on one of
// its open tiles, picked from the match seed, and moves to another of them each time it comes back. So no single tile
// is the place to camp, a layout differs between matches, and the same seed always gives the same layout (the server
// and every client build it alike; the server also sends where each one is).
//
// Rules for a tile: open floor reachable from the spawns, no cover or barrier around it, not boxed in (at most two
// walls on its four sides: never a dead end), at least spawnClear from every spawn on the map, at least minSeparation
// from every other pickup (no clusters), and never within nearActor of anyone standing when it comes back.
// Fairness: for every kind, the walk from the west (alpha) spawns to its pickups and from the east (bravo) spawns must
// come out about even (balanceTolerance), both for the opening layout and after every move.
import { TUNING } from '../config/tuning';
import { COVER, BARRIER, FLOOR, WALL, walkable, type Level } from './level';
import type { PickupKind } from './world';

/** side: west and east zones of a kind pair up in list order; 'mid' is contested (about as far from both sides). */
export interface PickupZone { kind: PickupKind; x0: number; y0: number; x1: number; y1: number; name: string; side?: 'west' | 'east' | 'mid' }
export interface Spot { x: number; y: number }

/** Walking distance (4-way steps) from the nearest of a set of points to every tile; Infinity where unreachable. */
export interface Field { w: number; d: Float32Array }

/** A small integer hash (deterministic, no state): the same inputs always give the same number. */
export function hash32(a: number, b: number, c: number): number {
  let h = (a | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (b | 0), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ (c | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The candidates in a seeded order (a stable shuffle keyed by seed, zone and a counter). */
function ordered<T>(xs: T[], seed: number, zone: number, n: number): T[] {
  return xs.map((x, i) => ({ x, k: hash32(seed, zone * 977 + i, n) })).sort((p, q) => p.k - q.k).map((p) => p.x);
}

export function walkField(level: Level, from: Spot[]): Field {
  const d = new Float32Array(level.w * level.h).fill(Infinity);
  const q: number[] = [];
  for (const s of from) { const i = Math.floor(s.y) * level.w + Math.floor(s.x); if (walkable(level.tiles[i]) && d[i] !== 0) { d[i] = 0; q.push(i); } }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    for (const n of [i + 1, i - 1, i + level.w, i - level.w]) if (n >= 0 && n < d.length && d[n] === Infinity && walkable(level.tiles[n])) { d[n] = d[i] + 1; q.push(n); }
  }
  return { w: level.w, d };
}
export const fieldAt = (f: Field, s: Spot) => f.d[Math.floor(s.y) * f.w + Math.floor(s.x)];

/**
 * Open tiles of each zone that satisfy the static rules (reachable, open around, away from every spawn). With the two
 * sides' walk fields: a 'mid' zone keeps tiles within balanceTolerance of even, and a west/east pair keeps only the
 * walks from its own side that both zones offer (so either pick of a pair is the same trip for its side).
 */
export function zoneSpots(level: Level, zones: PickupZone[], spawns: Spot[], sides?: { alpha: Field; bravo: Field }): Spot[][] {
  const raw = openSpots(level, zones, spawns);
  if (!sides) return raw;
  const own = (z: PickupZone, s: Spot) => fieldAt(z.side === 'east' ? sides.bravo : sides.alpha, s);
  const out = raw.map((c, i) => zones[i].side === 'mid' ? c.filter((s) => Math.abs(fieldAt(sides.alpha, s) - fieldAt(sides.bravo, s)) <= TUNING.pickups.balanceTolerance) : c);
  for (const kind of new Set(zones.map((z) => z.kind))) {
    const west = zones.map((z, i) => (z.kind === kind && z.side === 'west' ? i : -1)).filter((i) => i >= 0);
    const east = zones.map((z, i) => (z.kind === kind && z.side === 'east' ? i : -1)).filter((i) => i >= 0);
    west.forEach((wi, k) => {
      const ei = east[k];
      if (ei === undefined) return;
      const range = (i: number) => { const d = out[i].map((s) => own(zones[i], s)); return [Math.min(...d), Math.max(...d)]; };
      const [a0, a1] = range(wi), [b0, b1] = range(ei);
      const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
      if (lo > hi) return; // no common walk: keep both as they are (the layout's balance check still applies)
      out[wi] = out[wi].filter((s) => own(zones[wi], s) >= lo && own(zones[wi], s) <= hi);
      out[ei] = out[ei].filter((s) => own(zones[ei], s) >= lo && own(zones[ei], s) <= hi);
    });
  }
  // Never leave a zone empty: a filter that removed every tile is dropped for that zone.
  return out.map((c, i) => (c.length ? c : raw[i]));
}

function openSpots(level: Level, zones: PickupZone[], spawns: Spot[]): Spot[][] {
  const P = TUNING.pickups;
  const reach = walkField(level, [level.playerSpawn]);
  const at = (x: number, y: number) => level.tiles[y * level.w + x];
  return zones.map((z) => {
    const out: Spot[] = [];
    for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) {
      if (x < 1 || y < 1 || x >= level.w - 1 || y >= level.h - 1 || at(x, y) !== FLOOR || reach.d[y * level.w + x] === Infinity) continue;
      let open = true;
      for (let dy = -1; dy <= 1 && open; dy++) for (let dx = -1; dx <= 1; dx++) { const t = at(x + dx, y + dy); if (t === COVER || t === BARRIER) { open = false; break; } }
      open &&= [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].filter((t) => t === WALL).length <= 2;
      const s = { x: x + 0.5, y: y + 0.5 };
      if (open && spawns.every((p) => Math.hypot(p.x - s.x, p.y - s.y) >= P.spawnClear)) out.push(s);
    }
    return out;
  });
}

/**
 * How uneven a layout is between the two sides, kind by kind: the gap between the average walk from each side to the
 * kind's pickups, plus the gap between each side's walk to its nearest one (tiles). 0 is perfectly even.
 */
export function imbalance(kinds: PickupKind[], at: Spot[], alpha: Field, bravo: Field): number {
  let worst = 0;
  for (const k of new Set(kinds)) {
    const ix = kinds.map((x, i) => (x === k ? i : -1)).filter((i) => i >= 0);
    const a = ix.map((i) => fieldAt(alpha, at[i])), b = ix.map((i) => fieldAt(bravo, at[i]));
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    worst = Math.max(worst, Math.abs(mean(a) - mean(b)), Math.abs(Math.min(...a) - Math.min(...b)));
  }
  return worst;
}

/**
 * The opening layout: one spot per zone, each clear of the ones already placed, tried with a few seeded orders until
 * every kind is about even for both sides (the most even try wins if none is within balanceTolerance).
 */
export function layoutPickups(spots: Spot[][], kinds: PickupKind[], seed: number, alpha: Field, bravo: Field): Spot[] {
  const P = TUNING.pickups;
  let best: Spot[] = [], bestScore = Infinity;
  for (let t = 0; t < P.layoutTries; t++) {
    const placed: Spot[] = [];
    let clustered = 0;
    spots.forEach((cands, z) => {
      const list = ordered(cands, seed, z, -1 - t);
      const s = list.find((c) => placed.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= P.minSeparation));
      if (!s) clustered++;
      placed.push(s ?? list[0]);
    });
    const score = imbalance(kinds, placed, alpha, bravo) + clustered * 1000;
    if (score < bestScore) { best = placed; bestScore = score; }
    if (score <= P.balanceTolerance) break;
  }
  return best;
}

/**
 * Where a pickup comes back: another spot of its zone, in the moves-th seeded order, clear of the other pickups and of
 * anyone standing, keeping its kind even for both sides. null: every spot is blocked right now (it waits a second).
 */
export function respawnSpot(cands: Spot[], seed: number, zone: number, moves: number, here: Spot, others: { x: number; y: number; kind: PickupKind }[], kind: PickupKind, standing: Spot[], alpha: Field, bravo: Field): Spot | null {
  const P = TUNING.pickups;
  const ok = (c: Spot) => others.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= P.minSeparation) && standing.every((a) => Math.hypot(a.x - c.x, a.y - c.y) >= P.nearActor);
  const kin = others.filter((o) => o.kind === kind);
  const even = (c: Spot) => imbalance([...kin.map(() => kind), kind], [...kin, c], alpha, bravo) <= P.balanceTolerance;
  const list = ordered(cands, seed, zone, moves).filter((c) => (c.x !== here.x || c.y !== here.y) && ok(c));
  return list.find(even) ?? list[0] ?? (ok(here) ? here : null);
}
