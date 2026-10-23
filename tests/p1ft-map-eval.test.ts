// MAP-001 spawn-crate evaluation: current layout vs "crates one tile west". Deterministic.
// Writes the full metrics to $MAP_EVAL_OUT when set. Asserts the safety invariants for the SHIPPED layout.
import { describe, expect, it } from 'vitest';
// MAP-001 was decided on the RC-8 map (its spawn crates); the 68 x 42 venue keeps that map for the lab, and this
// evaluation stays pinned to it. The new venue's spawn safety, reach and crate snags: tests/venue.test.ts.
import { ROOM_ZERO_RC8 as ROOM_ZERO, BOT_SPAWNS_RC8 as BOT_SPAWNS } from '../src/config/map';
import { parseLevel, findPath, sightClear, shotClear, walkable, type Level } from '../src/sim/level';
import { createWorld, stepWorld, IDLE_INPUT, type World } from '../src/sim/world';
import { canSee } from '../src/sim/vision';
import { viewOf } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';

// PREV = the P1F layout (spawn crates on tiles 3-4); ROOM_ZERO now has them on tiles 2-3 (decision in PR, MAP-001).
export const PREV = ROOM_ZERO.map((r, y) => (y === 4 ? '#..cc' + r.slice(5) : r));
const SPAWN = { x: 3.5, y: 2.5 };
const SOUTH_DOOR = { x: 4.5, y: 6.5 };

function reachable(l: Level, sx: number, sy: number) {
  const seen = new Uint8Array(l.w * l.h), q = [Math.floor(sy) * l.w + Math.floor(sx)];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!, x = i % l.w, y = (i / l.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = (y + dy) * l.w + x + dx;
      if (!seen[j] && walkable(l.tiles[j])) { seen[j] = 1; q.push(j); }
    }
  }
  let total = 0, got = 0;
  for (let i = 0; i < l.tiles.length; i++) if (walkable(l.tiles[i])) { total++; if (seen[i]) got++; }
  return { total, got };
}
const plen = (p: { x: number; y: number }[], sx: number, sy: number) => { let d = 0, x = sx, y = sy; for (const n of p) { d += Math.hypot(n.x - x, n.y - y); x = n.x; y = n.y; } return d; };

/** Hold "down" from spawn; seconds until past the crate row (y > 5.4), or Infinity within 3 s. */
function snagTime(map: string[], assist: number) {
  const prev = TUNING.movement.cornerAssist;
  (TUNING.movement as { cornerAssist: number }).cornerAssist = assist;
  try {
    const w = createWorld({ seed: 1, map, bots: [] });
    for (let i = 0; i < 180; i++) { stepWorld(w, { ...IDLE_INPUT, moveX: 0, moveY: 1 }); if (w.actors[0].y > 5.4) return (i + 1) / 60; }
    return Infinity;
  } finally { (TUNING.movement as { cornerAssist: number }).cornerAssist = prev; }
}

/** Hold the stick straight at the south door from spawn; seconds until through it (y > 6.6), or Infinity in 4 s. */
function doorTime(map: string[], assist: number) {
  const prev = TUNING.movement.cornerAssist;
  (TUNING.movement as { cornerAssist: number }).cornerAssist = assist;
  try {
    const w = createWorld({ seed: 1, map, bots: [] });
    const dx = SOUTH_DOOR.x - SPAWN.x, dy = SOUTH_DOOR.y - SPAWN.y, d = Math.hypot(dx, dy);
    for (let i = 0; i < 240; i++) { stepWorld(w, { ...IDLE_INPUT, moveX: dx / d, moveY: dy / d }); if (w.actors[0].y > 6.6) return +((i + 1) / 60).toFixed(2); }
    return Infinity;
  } finally { (TUNING.movement as { cornerAssist: number }).cornerAssist = prev; }
}

/** 32 stick directions held 3 s from spawn: runs that end pinned on a SPAWN-ROOM crate (not a wall, not a later room). */
function crateSnags(map: string[], assist: number) {
  const prev = TUNING.movement.cornerAssist;
  (TUNING.movement as { cornerAssist: number }).cornerAssist = assist;
  try {
    let n = 0;
    for (let k = 0; k < 32; k++) {
      const w = createWorld({ seed: 1, map, bots: [] });
      const a = (k / 32) * Math.PI * 2;
      for (let i = 0; i < 180; i++) stepWorld(w, { ...IDLE_INPUT, moveX: Math.cos(a), moveY: Math.sin(a) });
      const p = w.actors[0];
      const x0 = p.x, y0 = p.y;
      for (let i = 0; i < 30; i++) stepWorld(w, { ...IDLE_INPUT, moveX: Math.cos(a), moveY: Math.sin(a) });
      const still = Math.hypot(p.x - x0, p.y - y0) < 0.05;
      const onCrate = w.level.coverBoxes.some((b) => b.y1 <= 6 && b.x1 <= 10 && Math.hypot(p.x - Math.max(b.x0, Math.min(p.x, b.x1)), p.y - Math.max(b.y0, Math.min(p.y, b.y1))) < TUNING.movement.radius + 0.02);
      if (still && onCrate) n++;
    }
    return n;
  } finally { (TUNING.movement as { cornerAssist: number }).cornerAssist = prev; }
}

/** Scripted player: walk the A* route spawn -> the concourse centre (27.5, 8.5); first mutual-sight tick. */
function firstContact(map: string[], seed: number, tx = 27.5, ty = 8.5) {
  const w: World = createWorld({ seed, map, bots: BOT_SPAWNS });
  const p = w.actors[0];
  p.hp = 1e9;
  const route = findPath(w.level, p.x, p.y, tx, ty);
  for (let t = 0; t < 60 * 40; t++) {
    while (route.length && Math.hypot(route[0].x - p.x, route[0].y - p.y) < 0.35) route.shift();
    const n = route[0] ?? { x: p.x, y: p.y };
    const dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy) || 1;
    stepWorld(w, { ...IDLE_INPUT, moveX: dx / d, moveY: dy / d, aim: Math.atan2(dy, dx) });
    for (const b of w.actors.slice(1)) {
      if (!b.alive) continue;
      if (canSee(w.level, p.x, p.y, p.facing, viewOf(p), b.x, b.y) || canSee(w.level, b.x, b.y, b.facing, viewOf(b), p.x, p.y))
        return { t: t / 60, x: p.x, y: p.y };
    }
  }
  return { t: Infinity, x: p.x, y: p.y };
}

export function evaluate(map: string[], seeds = 40) {
  const l = parseLevel(map);
  const botSpawnLos = BOT_SPAWNS.map((b) => ({ bot: b.name, los: sightClear(l, b.patrol[0][0] + 0.5, b.patrol[0][1] + 0.5, SPAWN.x, SPAWN.y) }));
  const patrolLos = BOT_SPAWNS.flatMap((b) => b.patrol.map(([x, y]) => sightClear(l, x + 0.5, y + 0.5, SPAWN.x, SPAWN.y))).filter(Boolean).length;
  // Bullet lines into the spawn room (tiles x1..9, y1..5) from every patrol point: does the change open any?
  let shotLines = 0;
  for (const b of BOT_SPAWNS) for (const [px, py] of b.patrol) for (let y = 1; y <= 5; y++) for (let x = 1; x <= 9; x++)
    if (walkable(l.tiles[y * l.w + x]) && shotClear(l, px + 0.5, py + 0.5, x + 0.5, y + 0.5, false, TUNING.combat.coverLean)) shotLines++;
  const doorPath = findPath(l, SPAWN.x, SPAWN.y, SOUTH_DOOR.x, SOUTH_DOOR.y);
  const centrePath = findPath(l, SPAWN.x, SPAWN.y, 27.5, 8.5);
  const contacts = Array.from({ length: seeds }, (_, i) => firstContact(map, 100 + i).t).sort((a, b) => a - b);
  const finite = contacts.filter(Number.isFinite);
  // Second route through the SOUTH door (the lane the crates sit in), toward the cellar room.
  const south = Array.from({ length: seeds }, (_, i) => firstContact(map, 100 + i, 4.5, 12.5).t).sort((a, b) => a - b).filter(Number.isFinite);
  const southPath = findPath(l, SPAWN.x, SPAWN.y, 4.5, 12.5);
  return {
    snagNoAssist: snagTime(map, 0), snagWithAssist: snagTime(map, TUNING.movement.cornerAssist),
    doorNoAssist: doorTime(map, 0), doorWithAssist: doorTime(map, TUNING.movement.cornerAssist),
    crateSnags32NoAssist: crateSnags(map, 0), crateSnags32WithAssist: crateSnags(map, TUNING.movement.cornerAssist),
    botSpawnLos, patrolPointsWithLosToSpawn: patrolLos, shotLinesIntoSpawnRoom: shotLines,
    reach: reachable(l, SPAWN.x, SPAWN.y),
    pathToSouthDoor: +plen(doorPath, SPAWN.x, SPAWN.y).toFixed(2), pathToCentre: +plen(centrePath, SPAWN.x, SPAWN.y).toFixed(2),
    pathSouthRoute: +plen(southPath, SPAWN.x, SPAWN.y).toFixed(2),
    firstContactSouth: { median: south[Math.floor(south.length / 2)], p10: south[Math.floor(south.length * 0.1)], p90: south[Math.floor(south.length * 0.9)], none: seeds - south.length },
    firstContact: { seeds, median: finite[Math.floor(finite.length / 2)], p10: finite[Math.floor(finite.length * 0.1)], p90: finite[Math.floor(finite.length * 0.9)], none: contacts.length - finite.length },
  };
}

describe('MAP-001 spawn crate evaluation', () => {
  const cur = evaluate(ROOM_ZERO, 20);
  it('spawn safety: no bot spawn or patrol point has line of sight to the player spawn', () => {
    expect(cur.botSpawnLos.every((b) => !b.los)).toBe(true);
    expect(cur.patrolPointsWithLosToSpawn).toBe(0);
  });
  it('every walkable tile is reachable from spawn', () => {
    expect(cur.reach.got).toBe(cur.reach.total);
  });
  it('holding the stick straight at the south door gets through it (blocked in the previous layout)', () => {
    expect(cur.doorWithAssist).toBeLessThan(2);
    expect(evaluate(PREV, 1).doorWithAssist).toBe(Infinity);
  });
  it('no new sightline or bullet line into the spawn room vs the previous layout', () => {
    const prev = evaluate(PREV, 1);
    expect(cur.shotLinesIntoSpawnRoom).toBe(prev.shotLinesIntoSpawnRoom);
    expect(cur.patrolPointsWithLosToSpawn).toBe(prev.patrolPointsWithLosToSpawn);
  });
  it('report (MAP_EVAL_OUT)', async () => {
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (!env.MAP_EVAL_OUT) return;
    const out = { previous: evaluate(PREV), shipped: evaluate(ROOM_ZERO) };
    (await import('node:fs' as string)).writeFileSync(env.MAP_EVAL_OUT, JSON.stringify(out, null, 1));
  });
});
