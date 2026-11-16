// Owner 2026-11-15 (HARD MODE + 5 IMPOSSIBLE LOCATIONS). Each Impossible location pushes one pillar to its extreme,
// measured here on its tiles with the library's own numbers (src/library/mapdata.ts stats); Hard mode changes the
// hostile squad, the zone and the supplies and leaves Normal (and online) exactly as it was.
import { describe, expect, it } from 'vitest';
import { MAPS, NORMAL_MAP_IDS, IMPOSSIBLE_MAP_IDS, type MapId } from '../src/config/maps';
import { DECK, STAIRS, parseLevel, stepSurface, tileAt, type Level } from '../src/sim/level';
import { createWorld, hardZone, moveBody, stepWorld, IDLE_INPUT } from '../src/sim/world';
import { zoneAt } from '../src/sim/zone';
import { TUNING } from '../src/config/tuning';
import { stats } from '../src/library/mapdata';

const lv = (id: MapId): Level => { const l = parseLevel(MAPS[id].rows); l.materials = MAPS[id].materials; l.lights = MAPS[id].lights; return l; };
const S = Object.fromEntries([...NORMAL_MAP_IDS, ...IMPOSSIBLE_MAP_IDS].map((id) => [id, stats(id)])) as Record<MapId, ReturnType<typeof stats>>;
const max = (k: 'longestLane' | 'meanOpen' | 'decks' | 'stairs' | 'doors', ids = NORMAL_MAP_IDS) => Math.max(...ids.map((id) => S[id][k]));
const coverShare = (id: MapId) => (S[id].crates + S[id].barriers) / S[id].floor;

describe('Impossible locations: tagged, and each one pillar at its extreme', () => {
  it('all five are tagged Impossible with a warning; the five open locations are not', () => {
    for (const id of IMPOSSIBLE_MAP_IDS) expect(MAPS[id].impossible?.length ?? 0, id).toBeGreaterThan(40);
    for (const id of NORMAL_MAP_IDS) expect(MAPS[id].impossible, id).toBeUndefined();
  });
  it('Abyss: no light, a larger footprint, average line under 4 m, the most doorways, silt that muffles every step', () => {
    const s = S.abyss;
    expect(s.litShare).toBe(0);
    for (const id of NORMAL_MAP_IDS) expect(s.w * s.h, id).toBeGreaterThan(S[id].w * S[id].h);
    expect(s.meanOpen).toBeLessThan(4);
    expect(s.doors).toBeGreaterThan(max('doors') * 3);
    expect(Object.keys(s.footsteps)).toEqual([String(TUNING.sound.surface.silt)]);
    expect(TUNING.sound.surface.silt).toBeLessThan(1);
  });
  it('Echo Labyrinth: more stairs and decks than Metro, one-wide shafts, footsteps 190% everywhere (galleries too)', () => {
    const s = S.echo;
    expect(s.stairs).toBeGreaterThan(S.metro.stairs);
    expect(s.decks).toBeGreaterThan(S.metro.decks);
    expect(Object.keys(s.footsteps)).toEqual([String(TUNING.sound.surface.stone)]);
    expect(TUNING.sound.surface.stone).toBeGreaterThanOrEqual(1.8);
    const l = lv('echo');
    let deck = -1;
    for (let i = 0; i < l.tiles.length && deck < 0; i++) if (l.tiles[i] === DECK) deck = i;
    expect(stepSurface(l, (deck % l.w) + 0.5, Math.floor(deck / l.w) + 0.5)).toBe(TUNING.sound.surface.stone);
    expect(s.longestLane).toBeGreaterThanOrEqual(70); // long echoing corridors
  });
  it('Killing Field: longest line 100 m+, average line 18 m+, the least cover, towers (decks) all over, mostly lit', () => {
    const s = S['killing-field'];
    expect(s.longestLane).toBeGreaterThanOrEqual(100);
    expect(s.meanOpen).toBeGreaterThanOrEqual(18);
    for (const id of NORMAL_MAP_IDS) expect(coverShare('killing-field'), id).toBeLessThan(coverShare(id));
    expect(s.decks).toBeGreaterThan(150);
    expect(s.litShare).toBeGreaterThan(0.8);
  });
  it('Flooded: every floor wet (160%), narrow walkways (short average line), almost no high ground', () => {
    const s = S.flooded;
    expect(Object.keys(s.footsteps)).toEqual([String(TUNING.sound.surface.water)]);
    expect(TUNING.sound.surface.water).toBeGreaterThanOrEqual(1.5);
    expect(s.meanOpen).toBeLessThan(S.construction.meanOpen);
    expect(s.decks).toBeLessThan(S.construction.decks / 5);
    expect(s.rails).toBeGreaterThan(500); // the tanks: see and shoot across, never wade
  });
  it('Vertigo: more and longer high ground than Construction, and stairs slower than anywhere else', () => {
    const s = S.vertigo;
    expect(s.decks).toBeGreaterThan(S.construction.decks * 1.8);
    expect(s.stairs).toBeGreaterThan(S.construction.stairs * 2);
    expect(s.decks / s.floor).toBeGreaterThan(0.3);
    expect(TUNING.movement.steepStairsMul).toBeLessThan(TUNING.movement.stairsMul);
    const w = createWorld({ mapId: 'vertigo', seed: 1 });
    expect(w.level.stairsMul).toBe(TUNING.movement.steepStairsMul);
    expect(createWorld({ mapId: 'construction', seed: 1 }).level.stairsMul).toBeUndefined();
    // A body walking on a Vertigo stair moves at 45% of the same walk on the flat.
    const L = w.level;
    let at = -1;
    for (let i = 0; i < L.tiles.length && at < 0; i++) if (L.tiles[i] === STAIRS) at = i;
    const body = (x: number, y: number) => ({ x, y, vx: 0, vy: 0, dashLeft: 0, pinLeft: 0, trapLeft: 0, slowLeft: 0, slowMul: 1, chargeLeft: 0, beamLeft: 0, hero: { speed: 1 } } as never as Parameters<typeof moveBody>[1]);
    const st = body((at % L.w) + 0.5, Math.floor(at / L.w) + 0.5), flat = body(4.5, 25.5);
    for (let i = 0; i < 6; i++) { moveBody(L, st, { ...IDLE_INPUT, moveX: 0, moveY: 0.001 }, 1 / 120); moveBody(L, flat, { ...IDLE_INPUT, moveX: 0, moveY: 0.001 }, 1 / 120); }
    expect(tileAt(L, st.x, st.y)).toBe(STAIRS);
    expect(Math.hypot(st.vx, st.vy)).toBeCloseTo(Math.hypot(flat.vx, flat.vy) * TUNING.movement.steepStairsMul, 3);
  });
});

describe('Impossible locations in play', () => {
  for (const id of IMPOSSIBLE_MAP_IDS) {
    it(`${id}: the hostile squad moves round the layout and the match runs to the zone in a real solo match`, () => {
      const w = createWorld({ mapId: id, seed: 7, zone: true, allies: [{ name: 'A', hero: 'toad' }, { name: 'B', hero: 'ray' }] });
      const start = w.actors.filter((a) => a.team === 'bot').map((a) => ({ x: a.x, y: a.y }));
      let moved = 0, high = 0;
      for (let i = 0; i < 60 * 60 && w.outcome === 'playing'; i++) {
        stepWorld(w, IDLE_INPUT);
        if (i % 30 === 0) for (const a of w.actors) if (a.alive && a.team === 'bot') { const t = tileAt(w.level, a.x, a.y); if (t === DECK || t === STAIRS) high++; }
      }
      w.actors.filter((a) => a.team === 'bot').forEach((a, i) => { if (Math.hypot(a.x - start[i].x, a.y - start[i].y) > 4 || !a.alive) moved++; });
      expect(moved, id).toBeGreaterThanOrEqual(3);
      if (S[id].decks > 200) expect(high, `${id}: bots on decks or stairs`).toBeGreaterThan(0);
    }, 60000);
  }
});

describe('Hard mode', () => {
  const solo = (hard: boolean, mapId: MapId = 'room-zero') => createWorld({ mapId, seed: 11, zone: true, hard, allies: [{ name: 'A', hero: 'toad' }, { name: 'B', hero: 'ray' }] });

  it('7 or 8 hostiles instead of 5 on every location; Normal keeps 5', () => {
    for (const id of [...NORMAL_MAP_IDS, ...IMPOSSIBLE_MAP_IDS]) {
      const n = solo(true, id).actors.filter((a) => a.team === 'bot').length;
      expect(n, id).toBeGreaterThanOrEqual(7);
      expect(n, id).toBeLessThanOrEqual(8);
      expect(solo(false, id).actors.filter((a) => a.team === 'bot').length, id).toBe(5);
    }
  });
  it('the reinforcements start on open floor, apart from the five', () => {
    for (const id of [...NORMAL_MAP_IDS, ...IMPOSSIBLE_MAP_IDS]) {
      const bots = solo(true, id).actors.filter((a) => a.team === 'bot');
      for (const b of bots.slice(5)) for (const o of bots) if (o !== b) expect(Math.hypot(o.x - b.x, o.y - b.y), `${id} ${b.name}/${o.name}`).toBeGreaterThan(0.9);
    }
  });
  it('the numbers sit in the ranges the owner set, and only for hostiles', () => {
    const H = TUNING.hard;
    expect(H.reactionMin).toBeGreaterThanOrEqual(0.2); expect(H.reactionMax).toBeLessThanOrEqual(0.3);
    expect(H.damageMul).toBeGreaterThanOrEqual(0.8); expect(H.damageMul).toBeLessThanOrEqual(1);
    expect(H.aimErrorDeg).toBeLessThan(TUNING.bots.aimErrorDeg);
    expect(H.attackTokens).toBeGreaterThan(TUNING.perception.attackTokens);
    expect(H.respawnMul).toBeGreaterThan(1);
  });
  it('the danger zone: less open play, faster closes, more damage outside', () => {
    const n = solo(false).zone!, h = solo(true).zone!;
    expect(n.cfg).toBe(TUNING.zone);
    expect(h.cfg.safeSeconds).toBeLessThan(n.cfg.safeSeconds);
    const total = (c: typeof n.cfg) => c.safeSeconds + c.stages.reduce((a, s) => a + s.warn + s.shrink, 0);
    expect(total(h.cfg)).toBeLessThan(total(n.cfg) * 0.8);
    h.cfg.stages.forEach((s, i) => expect(s.dps).toBeGreaterThan(n.cfg.stages[i].dps));
    expect(h.cfg.finalDps).toBeGreaterThan(n.cfg.finalDps);
    expect(zoneAt(h, h.cfg.safeSeconds + 1).phase).not.toBe('safe');
    expect(zoneAt(n, h.cfg.safeSeconds + 1).phase).toBe('safe');
    expect(hardZone().stages.map((s) => s.radius)).toEqual(TUNING.zone.stages.map((s) => s.radius));
  });
  it('a hostile hit is worth more on Hard (80%) than Normal (60%); your AI teammates stay at 60% either way', () => {
    // Line a hostile up on a teammate at point-blank range and fire one bullet each way, on each difficulty.
    const dealt = (hard: boolean, shooterTeam: 'bot' | 'player') => {
      const w = createWorld({ map: ['##########', '#P.......#', '#........#', '##########'], bots: [{ name: 'X', hero: 'benja', patrol: [[6, 1]], flanker: false }], allies: [{ name: 'A', hero: 'benja' }], hard, seed: 1 });
      w.hard = hard;
      const bot = w.actors.find((a) => a.team === 'bot')!, ally = w.actors.find((a) => a.team === 'player' && a.ai)!;
      const [shooter, target] = shooterTeam === 'bot' ? [bot, ally] : [ally, bot];
      shooter.x = 3.5; shooter.y = 2.5; target.x = 5.5; target.y = 2.5; target.armor = 0; w.actors[0].x = 1.5; w.actors[0].y = 1.5;
      const before = target.hp;
      w.bullets.push({ x: 4, y: 2.5, ox: 3.5, oy: 2.5, dx: 1, dy: 0, owner: shooter.id, weapon: shooter.weapon, life: 1, alive: true });
      for (let i = 0; i < 6; i++) stepWorld(w, IDLE_INPUT);
      return before - target.hp;
    };
    const bn = dealt(false, 'bot'), bh = dealt(true, 'bot'), an = dealt(false, 'player'), ah = dealt(true, 'player');
    expect(bn).toBeGreaterThan(0);
    expect(bh / bn).toBeCloseTo(TUNING.hard.damageMul / TUNING.bots.damageMul, 1);
    expect(ah).toBeCloseTo(an, 5);
  });
  it('supplies come back slower on Hard (TUNING.hard.respawnMul)', () => {
    for (const hard of [false, true]) {
      const w = solo(hard);
      const p = w.pickups.find((q) => q.zone >= 0)!;
      const me = w.actors[0];
      me.hp = 1; p.kind = 'health';
      me.x = p.x; me.y = p.y;
      stepWorld(w, IDLE_INPUT);
      expect(p.active).toBe(false);
      expect(p.respawnLeft).toBeCloseTo(TUNING.pickups.health.respawn * (hard ? TUNING.hard.respawnMul : 1), 1);
    }
  });
  it('online matches never play Hard', () => {
    const m = MAPS['office'];
    const v = createWorld({ mapId: 'office', seed: 3, hard: true, versus: [{ name: 'a', hero: 'benja', team: 'alpha', x: m.versusSpawns.alpha[0].x, y: m.versusSpawns.alpha[0].y, facing: 0 }, { name: 'b', hero: 'benja', team: 'bravo', x: m.versusSpawns.bravo[0].x, y: m.versusSpawns.bravo[0].y, facing: Math.PI }] });
    expect(v.hard).toBe(false);
    expect(v.zone!.cfg).toBe(TUNING.zone);
  });
});
