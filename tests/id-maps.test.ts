// Locations (owner 2026-10-18 IDENTITY + MAPS pass): Room Zero kept, Office and Supermarket added, every one a real
// layout (not a reskin) that the sim, the danger zone, the pickups, the hostile squad and online play all run on.
import { describe, expect, it } from 'vitest';
import { MAPS, MAP_IDS, isMapId } from '../src/config/maps';
import { ROOM_ZERO } from '../src/config/map';
import { parseLevel, walkable, findPath, type Level } from '../src/sim/level';
import { openSpot } from '../src/sim/zone';
import { createWorld, stepWorld, IDLE_INPUT } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';

const at = (l: Level, x: number, y: number) => l.tiles[Math.floor(y) * l.w + Math.floor(x)];
function reach(l: Level, from: { x: number; y: number }): Set<number> {
  const seen = new Set<number>([Math.floor(from.y) * l.w + Math.floor(from.x)]);
  const q = [...seen];
  while (q.length) {
    const i = q.pop()!, x = i % l.w, y = Math.floor(i / l.w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (y + dy) * l.w + x + dx;
      if (!seen.has(n) && walkable(l.tiles[n])) { seen.add(n); q.push(n); }
    }
  }
  return seen;
}

describe('the location registry', () => {
  it('keeps Room Zero and adds Office, Supermarket, Metro Station and Construction Site (H34), each a different layout', () => {
    expect(MAP_IDS).toEqual(['room-zero', 'office', 'supermarket', 'metro', 'construction']);
    expect(MAPS['room-zero'].rows).toBe(ROOM_ZERO);
    const keys = MAP_IDS.map((id) => MAPS[id].rows.join(''));
    expect(new Set(keys).size).toBe(5);
    expect(isMapId('office')).toBe(true);
    expect(isMapId('moon')).toBe(false);
  });
  for (const id of MAP_IDS) {
    describe(id, () => {
      const m = MAPS[id], l = parseLevel(m.rows);
      it('is closed, mirrored for both online sides, and every floor tile is reachable', () => {
        for (const r of m.rows) expect(r.length).toBe(l.w);
        for (let x = 0; x < l.w; x++) { expect(at(l, x, 0)).not.toBe(0); expect(at(l, x, l.h - 1)).not.toBe(0); }
        for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) expect(at(l, x, y), `${x},${y}`).toBe(at(l, l.w - 1 - x, y));
        const floor = [...l.tiles].filter((t) => walkable(t)).length;
        expect(reach(l, l.playerSpawn).size).toBe(floor);
        expect(floor).toBeGreaterThan(1500);
      });
      it('has cover and walls inside, not an open box', () => {
        const inner = (t: number) => m.rows.slice(1, -1).reduce((n, r) => n + [...r.slice(1, -1)].filter((c) => c === t.toString()).length, 0);
        const count = (ch: string) => m.rows.join('').split(ch).length - 1;
        expect(count('c') + count('b')).toBeGreaterThan(40);
        expect(count('#') - 2 * l.w - 2 * (l.h - 2)).toBeGreaterThan(200);
        expect(count('d')).toBeGreaterThan(8);
        void inner;
      });
      it('online spawns: five a side on open floor, mirrored, both sides in the same hall layout', () => {
        expect(m.versusSpawns.alpha.length).toBe(5);
        m.versusSpawns.alpha.forEach((s, i) => {
          const b = m.versusSpawns.bravo[i];
          expect(walkable(at(l, s.x, s.y))).toBe(true);
          expect(b.x).toBeCloseTo(l.w - s.x, 6);
          expect(b.y).toBe(s.y);
        });
      });
      it('the hostile squad patrols open floor it can walk between', () => {
        expect(m.botSpawns.length).toBe(5);
        for (const b of m.botSpawns) for (const [x, y] of b.patrol) {
          expect(walkable(at(l, x + 0.5, y + 0.5)), `${b.name} ${x},${y}`).toBe(true);
          expect(findPath(l, b.patrol[0][0] + 0.5, b.patrol[0][1] + 0.5, x + 0.5, y + 0.5).length > 0 || (x === b.patrol[0][0] && y === b.patrol[0][1])).toBe(true);
        }
      });
      it('the danger zone has open last centres, and at least one fair to both online sides', () => {
        const open = m.zoneCentres.filter((c) => openSpot(l, c.x, c.y, TUNING.zone.clearance));
        expect(open.length).toBeGreaterThanOrEqual(3);
        const fair = open.filter((c) => {
          const d = [...m.versusSpawns.alpha, ...m.versusSpawns.bravo].map((s) => Math.hypot(s.x - c.x, s.y - c.y));
          const mean = d.reduce((a, b) => a + b, 0) / d.length;
          return d.every((v) => Math.abs(v - mean) <= mean * 0.2);
        });
        expect(fair.length).toBeGreaterThanOrEqual(1);
      });
      it('a solo run and an online match build on it, with every pickup zone placed', () => {
        const w = createWorld({ mapId: id, seed: 3, zone: true, allies: [{ name: 'A', hero: 'toad' }, { name: 'B', hero: 'ray' }] });
        expect(w.mapId).toBe(id);
        expect(w.actors.filter((a) => a.team === 'bot').length).toBe(5);
        expect(w.pickups.length).toBe(m.pickupZones.length);
        expect(w.pickups.length).toBeGreaterThanOrEqual(28);
        for (const p of w.pickups) {
          expect(walkable(at(w.level, p.x, p.y))).toBe(true);
          for (const q of w.pickups) if (q !== p) expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThanOrEqual(TUNING.pickups.minSeparation);
        }
        expect(w.zone).not.toBeNull();
        for (let i = 0; i < 600; i++) stepWorld(w, { ...IDLE_INPUT, aim: 0 });
        expect(w.tick).toBe(600);
        const v = createWorld({ mapId: id, seed: 3, versus: [...m.versusSpawns.alpha.slice(0, 3).map((s, i) => ({ name: `a${i}`, hero: 'benja', team: 'alpha' as const, x: s.x, y: s.y, facing: 0 })), ...m.versusSpawns.bravo.slice(0, 3).map((s, i) => ({ name: `b${i}`, hero: 'benja', team: 'bravo' as const, x: s.x, y: s.y, facing: Math.PI }))] });
        expect(v.pickups.length).toBe(m.pickupZones.length);
        expect(v.zone).not.toBeNull();
      });
    });
  }
});
