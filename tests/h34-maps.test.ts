// H34 (owner 2026-10-19: "I just played the office and supermarket, no difference????"): five locations, each a
// different tactical experience in its collision, topology and light, not its furniture. These tests pin the rules
// the new tiles add (rail, deck, stairs, surfaces, lit areas) and each location's identity, measured on its tiles.
import { describe, expect, it } from 'vitest';
import { MAPS, MAP_IDS, type MapId } from '../src/config/maps';
import { DECK, RAIL, STAIRS, bulletBlockT, findPath, parseLevel, shotClear, sightClear, stepSurface, tileAt, walkable, type Level } from '../src/sim/level';
import { canSee, litAt } from '../src/sim/vision';
import { createWorld, moveBody, stepWorld, IDLE_INPUT } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';

const lv = (id: MapId): Level => { const l = parseLevel(MAPS[id].rows); l.materials = MAPS[id].materials; l.lights = MAPS[id].lights; return l; };
const count = (id: MapId, ch: string) => MAPS[id].rows.join('').split(ch).length - 1;

/** Mean free sight distance (walls only block sight) from sampled floor tiles, and the longest straight lane. */
function sight(l: Level): { mean: number; longest: number } {
  let sum = 0, n = 0, longest = 0;
  for (let y = 1; y < l.h - 1; y += 2) for (let x = 1; x < l.w - 1; x += 2) {
    if (!walkable(l.tiles[y * l.w + x])) continue;
    let tile = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      let d = 0;
      while (d < 70 && tileAt(l, x + 0.5 + Math.cos(a) * d, y + 0.5 + Math.sin(a) * d) !== 1) d += 0.25;
      tile += d; longest = Math.max(longest, d);
    }
    sum += tile / 16; n++;
  }
  return { mean: sum / n, longest };
}
/** Separate openings across the centre line (x = w/2): how many ways the two halves meet. */
function crossings(l: Level): number {
  const m = l.w / 2;
  let gaps = 0, prev = false;
  for (let y = 0; y < l.h; y++) {
    const open = walkable(l.tiles[y * l.w + m - 1]) && walkable(l.tiles[y * l.w + m]);
    if (open && !prev) gaps++;
    prev = open;
  }
  return gaps;
}
/** Walkable tiles reachable from a spot when some tile kinds are closed. */
function reachable(l: Level, from: { x: number; y: number }, closed: number[] = []): Set<number> {
  const ok = (t: number) => walkable(t) && !closed.includes(t);
  const start = Math.floor(from.y) * l.w + Math.floor(from.x);
  const seen = new Set([start]), q = [start];
  while (q.length) {
    const i = q.pop()!;
    for (const n of [i + 1, i - 1, i + l.w, i - l.w]) if (!seen.has(n) && ok(l.tiles[n])) { seen.add(n); q.push(n); }
  }
  return seen;
}

describe('five locations', () => {
  it('exactly Room Zero, Office, Supermarket, Metro Station and Construction Site, in that order, each its own layout', () => {
    expect(MAP_IDS).toEqual(['room-zero', 'office', 'supermarket', 'metro', 'construction']);
    expect(MAP_IDS.map((id) => MAPS[id].name)).toEqual(['Room Zero', 'Office', 'Supermarket', 'Metro Station', 'Construction Site']);
    expect(new Set(MAP_IDS.map((id) => MAPS[id].rows.join('\n'))).size).toBe(5);
    expect(new Set(MAP_IDS.map((id) => MAPS[id].tag)).size).toBe(5);
    expect(new Set(MAP_IDS.map((id) => `${MAPS[id].rows[0].length}x${MAPS[id].rows.length}`)).size).toBeGreaterThanOrEqual(4);
  });
});

describe('the new tiles (H34)', () => {
  const L = parseLevel([
    '##########',
    '#........#',
    '#..rrr...#',
    '#........#',
    '#.c....c.#',
    '#..ssuu..#',
    '#..ssuu..#',
    '##########',
  ]);
  it('a rail stops a body but not sight, bullets or a grenade; it is never a place to hold', () => {
    expect(walkable(tileAt(L, 4.5, 2.5))).toBe(false);
    expect(sightClear(L, 4.5, 1.2, 4.5, 3.8)).toBe(true);
    expect(shotClear(L, 4.5, 1.2, 4.5, 3.8)).toBe(true);
    expect(findPath(L, 4.5, 1.5, 4.5, 3.5).length).toBeGreaterThan(2); // walks round, never through
    const a = { x: 4.5, y: 1.4, vx: 0, vy: 5, dashLeft: 0, pinLeft: 0, trapLeft: 0, slowLeft: 0, slowMul: 1, chargeLeft: 0, beamLeft: 0, hero: { speed: 1 } } as never as Parameters<typeof moveBody>[1];
    for (let i = 0; i < 60; i++) moveBody(L, a, { ...IDLE_INPUT, moveX: 0, moveY: 1 }, 1 / 60);
    expect(a.y).toBeLessThan(2);
    // Below the rail (row 3) nothing but the rail is solid: no cover spot there.
    expect(L.coverSpots.some((s) => s.y === 3.5 && s.x >= 3 && s.x <= 6)).toBe(false);
  });
  it('a shot fired from a deck clears the crates below; the same shot from the floor is stopped', () => {
    // From the deck at (5.5, 5.5) over the crate at (7.5, 4.5) to (8.4, 4.0); and from the floor beside the deck.
    expect(tileAt(L, 5.5, 5.5)).toBe(DECK);
    expect(bulletBlockT(L, 5.5, 5.5, 5.5, 5.5, 8.6, 4.1, false, 0)).toBeLessThan(0);
    expect(shotClear(L, 2.5, 3.2, 8.6, 4.9, false, 0)).toBe(false);
    expect(shotClear(L, 5.5, 5.8, 8.6, 4.1, false, 0)).toBe(true);
  });
  it('stairs slow you to TUNING.movement.stairsMul; a deck and a stair ring out, carpet muffles, a tunnel echoes', () => {
    const stairs = { x: 3.5, y: 6.5, vx: 0, vy: 0, dashLeft: 0, pinLeft: 0, trapLeft: 0, slowLeft: 0, slowMul: 1, chargeLeft: 0, beamLeft: 0, hero: { speed: 1 } } as never as Parameters<typeof moveBody>[1];
    const flat = { ...(stairs as object), x: 1.5, y: 6.5 } as Parameters<typeof moveBody>[1];
    for (let i = 0; i < 20; i++) { moveBody(L, stairs, { ...IDLE_INPUT, moveX: 0, moveY: -1 }, 1 / 120); moveBody(L, flat, { ...IDLE_INPUT, moveX: 0, moveY: -1 }, 1 / 120); }
    expect(tileAt(L, stairs.x, stairs.y)).toBe(STAIRS);
    expect(Math.hypot(stairs.vx, stairs.vy)).toBeCloseTo(Math.hypot(flat.vx, flat.vy) * TUNING.movement.stairsMul, 1);
    expect(stepSurface(L, 5.5, 5.5)).toBe(TUNING.sound.surface.deck);
    expect(stepSurface(L, 3.5, 5.5)).toBe(TUNING.sound.surface.deck);
    expect(stepSurface(L, 1.5, 1.5)).toBe(1);
    const office = lv('office'), metro = lv('metro');
    expect(stepSurface(office, 12.5, 15.5)).toBe(TUNING.sound.surface.carpet);
    expect(stepSurface(metro, 20.5, 37.5)).toBe(TUNING.sound.surface.tunnel);
    expect(stepSurface(lv('room-zero'), 30.5, 20.5)).toBe(1);
  });
  it('a body in a lit area is seen from litRange, lamp or no lamp; in the dark only from the lamp; walls still block', () => {
    const l = lv('supermarket');
    const v = { range: 8, coneRad: (70 * Math.PI) / 180, nearRadius: 1.6 };
    // Down the power aisle (lit), 16 u: seen. The same 16 u into the dark stockroom: not seen. Through a shelf: never.
    expect(litAt(l, 36, 26)).toBe(true);
    expect(canSee(l, 36, 10, Math.PI / 2, v, 36, 26)).toBe(true);
    expect(canSee(l, 36, 10, Math.PI / 2, v, 36, 34)).toBe(false); // 24 u: past litRange
    expect(litAt(l, 10.5, 4.5)).toBe(false);
    expect(canSee(l, 26.5, 4.5, Math.PI, v, 10.5, 4.5)).toBe(false);
    expect(canSee(l, 26.5, 4.5, Math.PI, v, 19.5, 4.5)).toBe(true); // 7 u: the lamp
    expect(canSee(l, 16, 16, 0, v, 28, 16)).toBe(false); // across three gondolas
    // Room Zero has no lights: the dark baseline is unchanged.
    expect(MAPS['room-zero'].lights.length).toBe(0);
  });
});

describe('every location: decks only by stairs, mirrored lights', () => {
  for (const id of MAP_IDS) {
    it(`${id}: no deck tile can be stepped onto except from stairs; lights mirrored and on floor`, () => {
      const l = lv(id);
      for (let y = 1; y < l.h - 1; y++) for (let x = 1; x < l.w - 1; x++) {
        if (l.tiles[y * l.w + x] !== DECK) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect([DECK, STAIRS, RAIL, 1], `${id} ${x},${y}`).toContain(l.tiles[(y + dy) * l.w + x + dx]);
      }
      const ls = MAPS[id].lights;
      for (const b of ls) expect(ls.some((o) => Math.abs(o.x0 - (l.w - b.x1)) < 1e-9 && Math.abs(o.x1 - (l.w - b.x0)) < 1e-9 && o.y0 === b.y0 && o.y1 === b.y1), `${id} light ${JSON.stringify(b)}`).toBe(true);
    });
  }
});

describe('each location has its own identity (measured on its tiles)', () => {
  const S = Object.fromEntries(MAP_IDS.map((id) => {
    const l = lv(id), s = sight(l), floor = [...l.tiles].filter((t) => walkable(t)).length;
    return [id, { ...s, crossings: crossings(l), doors: count(id, 'd'), cover: (count(id, 'c') + count(id, 'b')) / floor, decks: count(id, 'u') / floor, rails: count(id, 'r'), stairs: count(id, 's'), lit: MAPS[id].lights.reduce((n, b) => n + (b.x1 - b.x0) * (b.y1 - b.y0), 0) / floor }];
  })) as Record<MapId, { mean: number; longest: number; crossings: number; doors: number; cover: number; decks: number; rails: number; stairs: number; lit: number }>;

  it('prints the table (docs/design/maps.md quotes it)', () => {
    console.log(JSON.stringify(Object.fromEntries(MAP_IDS.map((id) => [id, Object.fromEntries(Object.entries(S[id]).map(([k, v]) => [k, Math.round(v * 100) / 100]))]))));
  });
  it('Office: the most doors (room clearing) and the shortest open sightlines of the new four; lit open plan, dark corridors', () => {
    for (const id of ['supermarket', 'metro', 'construction'] as const) { expect(S.office.doors).toBeGreaterThan(S[id].doors * 1.8); expect(S.office.mean).toBeLessThan(S[id].mean); }
    expect(S.office.doors).toBeGreaterThan(S['room-zero'].doors * 1.8);
    const l = lv('office');
    expect(litAt(l, 15, 16)).toBe(true); // open plan
    expect(litAt(l, 15, 9.5)).toBe(false); // north corridor
    expect(litAt(l, 15, 32.5)).toBe(false); // service corridor
    expect(count('office', 'r')).toBeGreaterThanOrEqual(14); // the glass boardroom
  });
  it('Supermarket: aisles run across the line between the sides, long lanes, and the halves meet only three ways', () => {
    const l = lv('supermarket');
    expect(S.supermarket.crossings).toBe(3); // stockroom, back aisle, front (the power aisle joins front and back, not the halves)
    // Every gondola gap is an aisle mouth: standing in the mid cross aisle you see 15+ u down the aisle (north-south).
    let lanes = 0;
    for (const x of [16, 20, 24, 28, 31]) if (sightClear(l, x + 0.5, 12.5, x + 0.5, 28.5)) lanes++;
    expect(lanes).toBeGreaterThanOrEqual(4);
    expect(S.supermarket.longest).toBeGreaterThan(S.office.longest);
    expect(S.supermarket.lit).toBeGreaterThan(0.6); // a bright store
    expect(litAt(l, 10, 4)).toBe(false); // the dark stockroom loop
  });
  it('Metro: the platform is reached only by stairs (gates, wells, crossings), the gate line has four one-wide gates, tunnels are dark', () => {
    const l = lv('metro'), spawn = l.playerSpawn;
    const all = reachable(l, spawn), noStairs = reachable(l, spawn, [STAIRS]);
    const platform = 18 * l.w + 20;
    expect(all.has(platform)).toBe(true);
    expect(noStairs.has(platform)).toBe(false);
    let gates = 0;
    for (let y = 1; y <= 8; y++) if (walkable(l.tiles[y * l.w + 17])) gates++;
    expect(gates).toBe(4);
    expect(S.metro.rails).toBeGreaterThan(200); // track beds you cannot walk
    expect(litAt(l, 20, 18)).toBe(true); expect(litAt(l, 20, 37)).toBe(false); expect(litAt(l, 12, 11.5)).toBe(false);
    expect(S.metro.longest).toBeGreaterThan(40);
  });
  it('Construction: high ground (a fifth of the floor is deck), reached only by stairs, lit and exposed; the most open site', () => {
    const l = lv('construction'), spawn = l.playerSpawn;
    expect(S.construction.decks).toBeGreaterThan(0.15);
    const noStairs = reachable(l, spawn, [STAIRS]);
    for (let i = 0; i < l.tiles.length; i++) if (l.tiles[i] === DECK) expect(noStairs.has(i)).toBe(false);
    expect(litAt(l, 34, 22)).toBe(true); // the slab
    expect(S.construction.cover).toBeLessThan(S.office.cover);
    for (const id of MAP_IDS) if (id !== 'construction') expect(S.construction.mean).toBeGreaterThan(S[id].mean);
  });
  it('no two locations share the same profile: every pair differs clearly on at least three measures', () => {
    const keys = ['mean', 'longest', 'crossings', 'doors', 'cover', 'decks', 'rails', 'stairs', 'lit'] as const;
    for (let i = 0; i < MAP_IDS.length; i++) for (let j = i + 1; j < MAP_IDS.length; j++) {
      const a = S[MAP_IDS[i]], b = S[MAP_IDS[j]];
      const diff = keys.filter((k) => Math.abs(a[k] - b[k]) > 0.25 * Math.max(Math.abs(a[k]), Math.abs(b[k]), 1e-9) && Math.abs(a[k] - b[k]) > 0.02);
      expect(diff.length, `${MAP_IDS[i]} vs ${MAP_IDS[j]}: ${diff.join(',')}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('in play: the sim, the bots and the new ground', () => {
  it('on Metro and Construction the hostile squad climbs stairs and stands on the high ground in a real solo match', () => {
    for (const id of ['metro', 'construction'] as const) {
      const w = createWorld({ mapId: id, seed: 5, zone: true, allies: [{ name: 'A', hero: 'toad' }, { name: 'B', hero: 'ray' }] });
      let stairs = 0, deck = 0;
      for (let i = 0; i < 90 * 60 && w.outcome === 'playing'; i++) {
        stepWorld(w, IDLE_INPUT);
        if (i % 20 === 0) for (const a of w.actors) if (a.alive && a.team === 'bot') { const t = tileAt(w.level, a.x, a.y); if (t === STAIRS) stairs++; if (t === DECK) deck++; }
      }
      expect(stairs, id).toBeGreaterThan(0);
      if (id === 'construction') expect(deck).toBeGreaterThan(0);
    }
  }, 60000);
});
