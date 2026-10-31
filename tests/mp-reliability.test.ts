// MP P0 (2026-10-19): what a crowded game server must survive. A room is built cheaply (every running match waits while
// one is built), the cheap pickup layout is the very same one as before (clients rebuild it from the seed), one room's
// failure stops only that room, and a socket that pings before its hello is not told off.
import { describe, expect, it } from 'vitest';
import { Lobby } from '../server/room';
import { PROTOCOL, type ServerMsg } from '../src/net/protocol';
import { MAPS, MAP_IDS } from '../src/config/maps';
import { parseLevel } from '../src/sim/level';
import { hash32, layoutPickups, walkField, zoneSpots, type Spot } from '../src/sim/pickups';
import { createWorld } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';

class FakeConn {
  got: ServerMsg[] = [];
  send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); }
  close() { /* closed */ }
}

// The layout as H34 computed it: every zone sorted in its seeded order, the first clear spot taken.
function layoutBefore(spots: Spot[][], seed: number): Spot[] {
  const P = TUNING.pickups;
  const byRoom = spots.map((_, z) => z).sort((a, b) => spots[a].length - spots[b].length || a - b);
  const placed: Spot[] = new Array(spots.length);
  for (const z of byRoom) {
    const list = spots[z].map((x, i) => ({ x, k: hash32(seed, z * 977 + i, -1) })).sort((p, q) => p.k - q.k).map((p) => p.x);
    placed[z] = list.find((c) => placed.every((p) => !p || Math.hypot(p.x - c.x, p.y - c.y) >= P.minSeparation)) ?? list[0];
  }
  return placed;
}

describe('MP reliability (P0 2026-10-19)', () => {
  it('the faster opening layout is identical to the sorted one on all five locations', () => {
    for (const id of MAP_IDS) {
      const d = MAPS[id];
      const lv = parseLevel(d.rows);
      const vs = d.versusSpawns;
      const fields = { alpha: walkField(lv, [...vs.alpha]), bravo: walkField(lv, [...vs.bravo]) };
      const zones = [...d.pickupZones];
      const all = zoneSpots(lv, zones, [...vs.alpha, ...vs.bravo], fields);
      const keep = zones.map((_, i) => i).filter((i) => all[i].length > 0);
      const spots = keep.map((i) => all[i]);
      // One try (layoutTries 1) isolates the per-try pick, which is what changed; the try loop around it did not.
      const tries = TUNING.pickups.layoutTries;
      (TUNING.pickups as { layoutTries: number }).layoutTries = 1;
      try {
        for (let seed = 0; seed < 200; seed++) expect(layoutPickups(spots, keep.map((i) => zones[i].kind), seed, fields.alpha, fields.bravo)).toEqual(layoutBefore(spots, seed));
      } finally { (TUNING.pickups as { layoutTries: number }).layoutTries = tries; }
    }
  });

  it('a 1v1 room on any location is built in a few milliseconds', () => {
    const versus = [0, 1].map((i) => ({ name: `P${i}`, hero: 'benja', team: (i ? 'bravo' : 'alpha') as 'alpha' | 'bravo', x: -100, y: -100, facing: 0 }));
    for (const mapId of MAP_IDS) {
      createWorld({ seed: 1, zone: true, mapId, versus });
      const t0 = performance.now();
      for (let k = 0; k < 10; k++) createWorld({ seed: k, zone: true, mapId, versus });
      // Measured after the change: 3-9 ms on the dev container (was 8-34 ms). The bar leaves room for a slow CI box.
      expect((performance.now() - t0) / 10).toBeLessThan(20);
    }
  });

  it('a room that fails stops alone: its players are told, the other match plays on', () => {
    let t = 0;
    const lobby = new Lobby({ now: () => t, seed: () => 7, countdownSec: 0 });
    const conns = [0, 1, 2, 3].map(() => new FakeConn());
    const ids = conns.map((c) => lobby.connect(c));
    ids.forEach((id, i) => lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: `P${i}`, hero: 'benja' })));
    ids.forEach((id) => lobby.message(id, JSON.stringify({ t: 'queue', mode: '1v1', map: 'room-zero' })));
    expect(lobby.rooms.size).toBe(2);
    const [bad, good] = [...lobby.rooms.values()];
    for (let i = 0; i < 30; i++) { t += 1 / 60; lobby.tick(); }
    // A bug in one match (a broken world) throws in its step.
    (bad.world as { actors: unknown }).actors = null;
    const errSpy = console.error;
    console.error = () => {};
    try { for (let i = 0; i < 30; i++) { t += 1 / 60; lobby.tick(); } } finally { console.error = errSpy; }
    expect(lobby.rooms.has(bad.id)).toBe(false);
    expect(lobby.rooms.has(good.id)).toBe(true);
    const told = conns.filter((c) => c.got.some((m) => m.t === 'error' && m.code === 'match-cancelled'));
    expect(told.length).toBe(2);
    const stepsBefore = good.steps;
    for (let i = 0; i < 10; i++) { t += 1 / 60; lobby.tick(); }
    expect(good.steps).toBe(stepsBefore + 10);
  });

  it('a ping before the hello (a slow ticket fetch) gets no error', () => {
    const lobby = new Lobby({ now: () => 0, seed: () => 7 });
    const c = new FakeConn();
    const id = lobby.connect(c);
    lobby.message(id, JSON.stringify({ t: 'ping', at: 1 }));
    expect(c.got.filter((m) => m.t === 'error')).toEqual([]);
    lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: 'P', hero: 'benja' }));
    expect(c.got.some((m) => m.t === 'welcome')).toBe(true);
  });
});
