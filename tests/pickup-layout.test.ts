// Owner 2026-10-17: more health, armour and grenade pickups in deliberate zones; a tactical resource space, not a
// vending machine (src/sim/pickups.ts, src/config/map.ts PICKUP_ZONES). Seeded, reachable, never in a spawn or a
// corner, never clustered, even for both online sides, moving when they come back, and the same on server and client.
import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, touchingFull, wants, IDLE_INPUT, type World } from '../src/sim/world';
import { BOT_SPAWNS, PICKUP_ZONES, VERSUS_SPAWNS } from '../src/config/map';
import { BARRIER, COVER, FLOOR } from '../src/sim/level';
import { fieldAt, imbalance, walkField } from '../src/sim/pickups';
import { TUNING } from '../src/config/tuning';
import { Lobby } from '../server/room';
import type { ServerMsg } from '../src/net/protocol';

const P = TUNING.pickups;
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);
const vs = (n: number, x?: number) => [
  ...VERSUS_SPAWNS.alpha.slice(0, n).map((s) => ({ name: 'a', hero: 'benja', team: 'alpha' as const, x: x ?? s.x, y: x ?? s.y, facing: 0 })),
  ...VERSUS_SPAWNS.bravo.slice(0, n).map((s) => ({ name: 'b', hero: 'benja', team: 'bravo' as const, x: x ?? s.x, y: x ?? s.y, facing: 0 })),
];
const solo = (seed: number) => createWorld({ seed });
const online = (seed: number, n = 3) => createWorld({ seed, versus: vs(n) });
const zoned = (w: World) => w.pickups.filter((p) => p.zone >= 0);
const tile = (w: World, x: number, y: number) => w.level.tiles[Math.floor(y) * w.level.w + Math.floor(x)];
/** Walking distance from the solo spawn: finite means reachable on foot. */
const reach = (w: World) => walkField(w.level, [w.level.playerSpawn]);

describe('the layout', () => {
  it('15 pickups: 4 health, 4 armour, 3 grenades, 4 ammo, every zone with room to move (4+ tiles), solo and online', () => {
    for (const w of [solo(1), online(1, 1), online(1, 3), online(1, 5)]) {
      const n = (k: string) => w.pickups.filter((p) => p.kind === k).length;
      expect([n('health'), n('armor'), n('grenade'), n('ammo')]).toEqual([4, 4, 3, 4]);
      for (const [i, s] of w.pickupSpots.entries()) expect(s.length, PICKUP_ZONES[i].name).toBeGreaterThanOrEqual(4);
    }
  });
  it('every pickup, in 60 seeds: on open floor, reachable, no crate beside it, away from every spawn, never clustered', () => {
    for (const seed of SEEDS) for (const [w, spawns] of [
      [solo(seed), [w0().level.playerSpawn, ...BOT_SPAWNS.map((b) => ({ x: b.patrol[0][0] + 0.5, y: b.patrol[0][1] + 0.5 }))]],
      [online(seed), [...VERSUS_SPAWNS.alpha, ...VERSUS_SPAWNS.bravo]],
    ] as const) {
      for (const p of w.pickups) {
        expect(tile(w, p.x, p.y)).toBe(FLOOR);
        expect(fieldAt(reach(w), p)).toBeLessThan(Infinity);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect([COVER, BARRIER]).not.toContain(tile(w, p.x + dx, p.y + dy));
        for (const s of spawns) expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeGreaterThanOrEqual(P.spawnClear);
        for (const q of w.pickups) if (q !== p) expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThanOrEqual(P.minSeparation);
        const z = PICKUP_ZONES[p.zone];
        expect(p.x > z.x0 && p.x < z.x1 + 1 && p.y > z.y0 && p.y < z.y1 + 1, z.name).toBe(true);
      }
    }
  });
  it('deterministic per seed and different between matches', () => {
    const at = (w: World) => w.pickups.map((p) => `${p.kind}@${p.x},${p.y}`).join(';');
    expect(at(online(7))).toBe(at(online(7)));
    expect(at(solo(7))).toBe(at(solo(7)));
    expect(new Set(SEEDS.map((s) => at(online(s)))).size).toBeGreaterThanOrEqual(55);
    expect(new Set(SEEDS.map((s) => at(solo(s)))).size).toBeGreaterThanOrEqual(55);
  });
  it('a client building the match from the seed (its actors placed nowhere) gets the server\'s layout', () => {
    for (const seed of [3, 11, 4242]) {
      const server = createWorld({ seed, versus: vs(3), zone: true });
      const client = createWorld({ seed, versus: vs(3, -100), zone: false });
      expect(client.pickups.map((p) => [p.kind, p.x, p.y])).toEqual(server.pickups.map((p) => [p.kind, p.x, p.y]));
    }
  });
  it('online, no side is closer: per kind the walk from each side\'s spawns is within the tolerance in every seed', () => {
    const gap: Record<string, number> = {};
    for (const seed of SEEDS) {
      const w = online(seed), f = w.pickupFields!;
      expect(imbalance(w.pickups.map((p) => p.kind), w.pickups, f.alpha, f.bravo)).toBeLessThanOrEqual(P.balanceTolerance);
      for (const p of w.pickups) gap[p.kind] = (gap[p.kind] ?? 0) + (fieldAt(f.alpha, p) - fieldAt(f.bravo, p)) / SEEDS.length;
    }
    // Over 60 matches the average extra walk for either side, per kind, is under one and a half tiles.
    for (const k of Object.keys(gap)) expect(Math.abs(gap[k] / zoned(online(1)).filter((p) => p.kind === k).length), k).toBeLessThan(1.5);
  });
  it('central zones are contested: their pickups are about as far from both sides', () => {
    for (const seed of SEEDS) {
      const w = online(seed), f = w.pickupFields!;
      for (const p of w.pickups.filter((q) => PICKUP_ZONES[q.zone].side === 'mid')) expect(Math.abs(fieldAt(f.alpha, p) - fieldAt(f.bravo, p))).toBeLessThanOrEqual(P.balanceTolerance);
    }
  });
});
const w0 = () => createWorld({ seed: 1 });

describe('comebacks', () => {
  it('a taken pickup comes back on another tile of its zone, never on anyone, and stays even for both sides', () => {
    const w = online(5);
    const f = w.pickupFields!;
    let back = 0, moved = 0, worst = 0;
    for (let round = 0; round < 120; round++) {
      const p = zoned(w)[round % 15];
      const was = { x: p.x, y: p.y };
      // Someone stands in the zone when it comes back.
      const a = w.actors[0];
      a.x = was.x; a.y = was.y;
      p.active = false; p.respawnLeft = 1 / 60;
      stepWorld(w, () => ({ ...IDLE_INPUT }));
      if (!p.active) continue;
      back++;
      if (p.x !== was.x || p.y !== was.y) moved++;
      for (const b of w.actors.filter((x) => x.alive)) expect(Math.hypot(b.x - p.x, b.y - p.y)).toBeGreaterThanOrEqual(P.nearActor);
      expect(w.pickupSpots[p.zone].some((s) => s.x === p.x && s.y === p.y)).toBe(true);
      for (const q of w.pickups) if (q !== p) expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThanOrEqual(P.minSeparation);
      worst = Math.max(worst, imbalance(w.pickups.map((q) => q.kind), w.pickups, f.alpha, f.bravo));
      a.x = -50; a.y = -50;
    }
    // Someone stood on its old tile every time, so every comeback was somewhere else; a comeback waits only while
    // no other legal tile of its zone is free.
    expect(moved).toBe(back);
    expect(back).toBeGreaterThan(90);
    expect(worst).toBeLessThanOrEqual(P.balanceTolerance + 1.5);
  });
  it('the map holds about the same healing per second as before, spread over more places', () => {
    const hp = (n: number, s: number) => (n * P.health.amount) / s;
    expect(hp(4, P.health.respawn)).toBeLessThanOrEqual(hp(3, 20) * 1.1);
    expect((4 * P.armor.amount) / P.armor.respawn).toBeLessThanOrEqual(((3 * 35) / 25) * 1.15);
    // Grenades: three on the map, so at most about four extra throws a minute for the whole room.
    expect((3 * 60) / P.grenade.respawn).toBeLessThanOrEqual(4.5);
  });
});

describe('grenade pickups', () => {
  const ROOM = ['#########', '#P..g...#', '#.......#', '#########'];
  it('+1 grenade, never above capacity; at capacity it is left for someone else', () => {
    const w = createWorld({ map: ROOM, bots: [] });
    const p = w.actors[0];
    expect(p.maxGrenades).toBe(3);
    p.grenades = 1;
    p.x = 4.5; p.y = 1.5;
    stepWorld(w, IDLE_INPUT);
    expect(p.grenades).toBe(2);
    expect(w.pickups[0].active).toBe(false);
    w.pickups[0].active = true;
    p.grenades = p.maxGrenades;
    expect(wants(p, 'grenade')).toBe(false);
    stepWorld(w, IDLE_INPUT);
    expect(p.grenades).toBe(p.maxGrenades);
    expect(w.pickups[0].active).toBe(true);
    expect(touchingFull(w, p)?.kind).toBe('grenade');
  });
});

describe('online: the server says where the pickups are', () => {
  class FakeConn {
    got: ServerMsg[] = [];
    send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); }
    close() { /* closed */ }
  }
  it('the first snapshot carries every position, later ones only after a pickup moved', () => {
    let t = 0;
    const lobby = new Lobby({ now: () => t, seed: () => 9, countdownSec: 0 });
    const conns = [new FakeConn(), new FakeConn()];
    const ids = conns.map((c) => lobby.connect(c));
    ids.forEach((id, i) => { lobby.message(id, JSON.stringify({ t: 'hello', v: 1, name: `P${i}`, hero: 'benja' })); lobby.message(id, JSON.stringify({ t: 'queue', mode: '1v1' })); });
    const snaps = () => conns[0].got.filter((m): m is Extract<ServerMsg, { t: 'snap' }> => m.t === 'snap');
    for (let i = 0; i < 30; i++) { t += 1 / 60; lobby.tick(); }
    const room = [...lobby.rooms.values()][0];
    const w = room.world;
    expect(snaps()[0].pk).toEqual(w.pickups.flatMap((p) => [p.x, p.y]));
    expect(snaps().slice(1).every((s) => s.pk === undefined)).toBe(true);
    // A pickup is taken and comes back somewhere else: the next snapshot says where.
    const p = zoned(w)[0];
    p.active = false; p.respawnLeft = 0.01;
    const n = snaps().length;
    for (let i = 0; i < 6; i++) { t += 1 / 60; lobby.tick(); }
    const after = snaps().slice(n).find((s) => s.pk);
    expect(after?.pk).toEqual(w.pickups.flatMap((q) => [q.x, q.y]));
  });
});
