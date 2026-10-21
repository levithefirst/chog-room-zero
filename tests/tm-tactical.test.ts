// Full-screen tactical map (owner 2026-10-20): drawn from the live Level of each location, showing only what the
// player's information model holds (src/ui/tactical.ts). These tests pin the geometry source, the information rules
// solo and online (through the real Lobby and the real client), the Visor, and the zoom/pan maths.
import { describe, expect, it, vi } from 'vitest';
import { MAPS, MAP_IDS } from '../src/config/maps';
import { createWorld, stepWorld, IDLE_INPUT, type World, type Actor } from '../src/sim/world';
import { createIntel, senseFor } from '../src/sim/intel';
import { canSee } from '../src/sim/vision';
import { sightClear, walkable, WALL } from '../src/sim/level';
import { superAbility } from '../src/config/superpowers';
import { TUNING } from '../src/config/tuning';
import { clampView, drawTactical, fitView, landmarks, mapMarkers, panBy, toMap, visorDots, zoomAt, MAX_ZOOM } from '../src/ui/tactical';
import { Lobby } from '../server/room';
import { OnlineSession } from '../src/net/client';

const DT = TUNING.simStepSeconds;
/** A canvas context that records what is drawn. */
function recorder() {
  const ops: string[] = [];
  const g = new Proxy({} as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => { ops.push(`${k}:${a.map((v) => (typeof v === 'number' ? v.toFixed(2) : String(v))).join(',')}`); }),
    set: (t, k: string, v) => { t[k] = v; ops.push(`${k}=${v}`); return true; },
  });
  return { g: g as unknown as CanvasRenderingContext2D, ops };
}
/** `n` floor spots in `a`'s light (a clear line, inside its view cone), at least 0.9 u apart. */
function sightSpots(w: World, a: Actor, n: number) {
  const out: { x: number; y: number }[] = [];
  for (let d = 2; d <= 6 && out.length < n; d += 0.5) for (let k = -4; k <= 4 && out.length < n; k++) {
    const ang = a.facing + k * 0.08, x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
    if (!walkable(w.level.tiles[Math.floor(y) * w.level.w + Math.floor(x)]) || !canSee(w.level, a.x, a.y, a.facing, a.view, x, y)) continue;
    if (out.every((o) => Math.hypot(o.x - x, o.y - y) >= 0.9)) out.push({ x, y });
  }
  return out;
}
/** A floor spot within `r` u of (x, y) with a full wall between. */
function behindWall(w: World, x: number, y: number, r: number) {
  const l = w.level;
  for (let d = 3; d <= r; d++) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    const t = l.tiles[Math.floor(py) * l.w + Math.floor(px)];
    // The tile centre is the spot used, so it is the one that must be out of sight.
    const c = { x: Math.floor(px) + 0.5, y: Math.floor(py) + 0.5 };
    if (t !== undefined && walkable(t) && !sightClear(l, x, y, c.x, c.y)) return c;
  }
  throw new Error('no spot behind a wall');
}
const park = (a: Actor, s: { x: number; y: number }) => { a.x = s.x; a.y = s.y; a.vx = a.vy = 0; };

describe('geometry: one source of truth per location', () => {
  for (const id of MAP_IDS) {
    it(`${id}: drawn from its own Level (walls, cover, rails, decks, stairs, materials) with its own area names`, () => {
      const w = createWorld({ mapId: id, seed: 1 });
      const { g, ops } = recorder();
      const view = fitView(w.level.w, w.level.h, 0, 0, 1280, 720);
      drawTactical(g, { w, def: MAPS[id], markers: [], view, vw: 1280, vh: 720, dpr: 1 });
      // Every wall box and every cover box of the live level is painted (in level units, scaled by the view).
      const fills = ops.filter((o) => o.startsWith('fillRect:')).length;
      expect(fills).toBeGreaterThanOrEqual(w.level.wallBoxes.length + w.level.coverBoxes.length);
      // The wall outline is the sight outline the sim uses: one moveTo per segment.
      expect(ops.filter((o) => o.startsWith('moveTo:')).length).toBeGreaterThanOrEqual(w.level.segments.length);
      const names = landmarks(MAPS[id]).map((m) => m.label);
      expect(names.length).toBeGreaterThanOrEqual(5);
      for (const m of landmarks(MAPS[id])) { expect(m.x).toBeGreaterThan(0); expect(m.x).toBeLessThan(w.level.w); expect(m.y).toBeGreaterThan(0); expect(m.y).toBeLessThan(w.level.h); }
    });
  }
  it('a Training drill room (no location) is drawn from its own level, with no borrowed area names', () => {
    const w = createWorld({ seed: 1 });
    w.mapId = null;
    const { g, ops } = recorder();
    drawTactical(g, { w, def: null, markers: [], view: fitView(w.level.w, w.level.h, 0, 0, 800, 450), vw: 800, vh: 450, dpr: 1 });
    expect(ops.some((o) => o.startsWith('fillText:'))).toBe(false);
    expect(ops.filter((o) => o.startsWith('moveTo:')).length).toBeGreaterThanOrEqual(w.level.segments.length);
  });
  it('each location reads as itself: its signature features exist in its tiles and its areas are named', () => {
    const count = (id: (typeof MAP_IDS)[number], t: number) => createWorld({ mapId: id, seed: 1 }).level.tiles.filter((v) => v === t).length;
    const names = (id: (typeof MAP_IDS)[number]) => landmarks(MAPS[id]).map((m) => m.label).join('|');
    expect(names('room-zero')).toMatch(/atrium/); expect(names('room-zero')).toMatch(/dock/);
    expect(names('office')).toMatch(/boardroom/); expect(names('office')).toMatch(/reception/); expect(names('office')).toMatch(/open plan/);
    expect(names('supermarket')).toMatch(/aisles/); expect(names('supermarket')).toMatch(/checkouts/);
    expect(names('metro')).toMatch(/platform/); expect(names('metro')).toMatch(/tunnel/);
    expect(names('construction')).toMatch(/scaffold/); expect(names('construction')).toMatch(/slab/);
    expect(count('metro', 5)).toBeGreaterThan(20); // track edges and railings
    expect(count('construction', 6)).toBeGreaterThan(20); // decks (high ground)
    expect(count('construction', 7)).toBeGreaterThan(2); // stair towers
    expect(count('office', 4)).toBeGreaterThan(count('supermarket', 4)); // rooms and doors
    // Five different drawings.
    const sig = MAP_IDS.map((id) => { const w = createWorld({ mapId: id, seed: 1 }); const r = recorder(); drawTactical(r.g, { w, def: MAPS[id], markers: [], view: fitView(w.level.w, w.level.h, 0, 0, 1280, 720), vw: 1280, vh: 720, dpr: 1 }); return r.ops.join(';'); });
    expect(new Set(sig).size).toBe(5);
  });
});

describe('information rules (solo, vs bots)', () => {
  it('you and your AI squad always; a hostile only once you see it; never a hidden one', () => {
    const w = createWorld({ mapId: 'office', seed: 4, allies: [{ name: 'A', hero: 'toad' }, { name: 'B', hero: 'ray' }] });
    const p = w.actors[0], intel = createIntel();
    senseFor(w, p, intel, DT);
    let m = mapMarkers(w, p, intel, visorDots(w, p, null));
    expect(m.filter((x) => x.kind === 'you')).toHaveLength(1);
    expect(m.find((x) => x.kind === 'you')).toMatchObject({ x: p.x, y: p.y, facing: p.facing });
    expect(m.filter((x) => x.kind === 'mate')).toHaveLength(2);
    // The five bots start far off and unseen: nothing of them on the map, not a trace.
    expect(m.filter((x) => x.kind === 'hostile' || x.kind === 'trace' || x.kind === 'visor')).toHaveLength(0);
    // Put one in your light: it shows, at its real spot and facing.
    const bot = w.actors.find((a) => a.team === 'bot')!;
    const spot = sightSpots(w, p, 1)[0];
    park(bot, spot);
    senseFor(w, p, intel, DT);
    m = mapMarkers(w, p, intel, []);
    const seen = m.find((x) => x.id === bot.id)!;
    expect(seen).toMatchObject({ kind: 'hostile', x: bot.x, y: bot.y, facing: bot.facing });
    // It walks behind a wall: the map keeps where you last saw it (a fading trace), never its new spot.
    const was = { x: bot.x, y: bot.y };
    park(bot, behindWall(w, p.x, p.y, 20));
    for (let i = 0; i < 30; i++) senseFor(w, p, intel, DT);
    m = mapMarkers(w, p, intel, []);
    const tr = m.filter((x) => x.id === bot.id);
    expect(tr.every((x) => x.kind === 'trace')).toBe(true);
    for (const x of tr) expect(Math.hypot(x.x - bot.x, x.y - bot.y)).toBeGreaterThan(Math.hypot(x.x - was.x, x.y - was.y));
  });

  it('facing updates as you turn', () => {
    const w = createWorld({ mapId: 'room-zero', seed: 2 });
    const p = w.actors[0], intel = createIntel();
    const before = mapMarkers(w, p, intel, []).find((x) => x.kind === 'you')!.facing!;
    for (let i = 0; i < 40; i++) stepWorld(w, { ...IDLE_INPUT, aim: before + Math.PI / 2 });
    const after = mapMarkers(w, p, intel, []).find((x) => x.kind === 'you')!.facing!;
    expect(Math.abs(after - before)).toBeGreaterThan(0.5);
    expect(after).toBeCloseTo(p.facing, 6);
  });

  it('Visor: the tracker dots show through walls, the same list the HUD tracker draws; nobody else gets them', () => {
    const w = createWorld({ mapId: 'metro', seed: 3 });
    const p = w.actors[0], intel = createIntel();
    const bot = w.actors.find((a) => a.team === 'bot')!;
    park(bot, behindWall(w, p.x, p.y, 12));
    expect(visorDots(w, p, null)).toHaveLength(0);
    expect(mapMarkers(w, p, intel, visorDots(w, p, null)).some((x) => x.id === bot.id)).toBe(false);
    p.ability = superAbility('visor', 'common');
    const dots = visorDots(w, p, null);
    expect(dots.map((d) => d.id)).toContain(bot.id);
    const v = mapMarkers(w, p, intel, dots).find((x) => x.id === bot.id)!;
    expect(v).toMatchObject({ kind: 'visor', x: bot.x, y: bot.y });
    expect(v.facing).toBeUndefined(); // position only, as the Visor rule says
  });

  it('5v5: four teammates and up to five opponents, opponents only when seen', () => {
    const vs = MAPS.construction.versusSpawns;
    const w = createWorld({ mapId: 'construction', seed: 1, versus: [...vs.alpha.map((s, i) => ({ name: `a${i}`, hero: 'benja', team: 'alpha' as const, x: s.x, y: s.y, facing: 0 })), ...vs.bravo.map((s, i) => ({ name: `b${i}`, hero: 'benja', team: 'bravo' as const, x: s.x, y: s.y, facing: Math.PI }))] });
    const p = w.actors[0], intel = createIntel();
    senseFor(w, p, intel, DT);
    let m = mapMarkers(w, p, intel, []);
    expect(m.filter((x) => x.kind === 'mate')).toHaveLength(4);
    expect(m.filter((x) => x.kind === 'enemy' || x.kind === 'trace')).toHaveLength(0);
    // Line all five up in front of you: all five show as enemies (not hostile bots).
    const foes = w.actors.filter((a) => a.team === 'bravo');
    // From the open slab (a zone centre), facing whichever way shows five spots.
    park(p, MAPS.construction.zoneCentres[0]);
    let at: { x: number; y: number }[] = [];
    for (let k = 0; k < 16 && at.length < 5; k++) { p.facing = (k / 16) * Math.PI * 2; at = sightSpots(w, p, 5); }
    expect(at).toHaveLength(5);
    foes.forEach((f, i) => park(f, at[i]));
    senseFor(w, p, intel, DT);
    m = mapMarkers(w, p, intel, []);
    expect(m.filter((x) => x.kind === 'enemy')).toHaveLength(5);
    expect(m).toHaveLength(10);
  });
});

// ---- online: the real server decides what each client holds; the map draws only that ----
class FakeWS {
  static OPEN = 1; static CONNECTING = 0;
  readyState = 0; onopen: (() => void) | null = null; onclose: ((e: { code: number; reason: string }) => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {}
  send(m: string) { this.sent.push(m); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000, reason: '' }); }
}
async function online(n: number, mode: '1v1' | '3v3', mapId: (typeof MAP_IDS)[number]) {
  vi.stubGlobal('WebSocket', FakeWS);
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('')));
  let t = 0;
  const lobby = new Lobby({ now: () => t, seed: () => 7, idleTimeoutSec: 999, countdownSec: 0 });
  const run = (s: number, each?: () => void) => { for (let i = 0; i < Math.round(s * 60); i++) { t += 1 / 60; each?.(); lobby.tick(); } };
  const ss: OnlineSession[] = [];
  for (let i = 0; i < n; i++) {
    const sess = new OnlineSession('ws://127.0.0.1:9/ws', () => `P${i}`, () => 'benja', null);
    sess.connect();
    const ws = (sess as unknown as { ws: FakeWS }).ws;
    const id = lobby.connect({ send: (m) => ws.onmessage?.({ data: JSON.stringify(m) }), close: () => undefined });
    ws.send = (m: string) => { ws.sent.push(m); lobby.message(id, m); };
    ws.readyState = 1;
    ws.onopen?.();
    await new Promise((q) => setTimeout(q, 0));
    ss.push(sess);
  }
  ss.forEach((s) => s.joinQueue(mode, undefined, mapId));
  run(0.5);
  const room = [...lobby.rooms.values()][0] as unknown as { world: World; players: { actorId: number }[] };
  return { lobby, run, ss, room, done: () => { for (const s of ss) s.close(); vi.unstubAllGlobals(); } };
}
/** Client view world -> map markers, the way main.ts builds them (intel fed from what the client holds). */
function clientMarkers(s: OnlineSession) {
  s.update(null);
  const w = s.world!, p = w.actors[0], intel = createIntel();
  senseFor(w, p, intel, 0);
  return { w, p, m: mapMarkers(w, p, intel, visorDots(w, p, s.tracks)) };
}

// Final QA 2026-10-21 (owner: "the tactical map must show a hostile you legitimately detected"): detection -> marker ->
// update -> expiry / death, through the real intel (src/sim/intel.ts), never more than the player knows.
describe('hostile markers follow what you know (detection, update, expiry, death)', () => {
  const kinds = (m: ReturnType<typeof mapMarkers>, id: number) => m.filter((x) => x.id === id).map((x) => x.kind);
  /** A floor spot `d` u behind `a` (opposite its facing) with a clear line but outside its view cone. */
  function behindBack(w: World, a: Actor) {
    for (let d = 2; d <= 6; d += 0.5) for (let k = -6; k <= 6; k++) {
      const ang = a.facing + Math.PI + k * 0.1, x = a.x + Math.cos(ang) * d, y = a.y + Math.sin(ang) * d;
      if (walkable(w.level.tiles[Math.floor(y) * w.level.w + Math.floor(x)]) && sightClear(w.level, a.x, a.y, x, y) && !canSee(w.level, a.x, a.y, a.facing, a.view, x, y)) return { x, y };
    }
    throw new Error('no spot behind');
  }
  const setup = (allies = false) => {
    const w = createWorld({ mapId: 'office', seed: 4, ...(allies ? { allies: [{ name: 'A', hero: 'toad' }, { name: 'B', hero: 'ray' }] } : {}) });
    const p = w.actors[0], intel = createIntel();
    for (const a of w.actors) if (a.team === 'bot') park(a, { x: -100, y: -100 + a.id });
    const bot = w.actors.find((a) => a.team === 'bot')!;
    return { w, p, intel, bot };
  };

  it('seen: shown live at its real spot; it moves in view: the marker follows', () => {
    const { w, p, intel, bot } = setup();
    const [s1, s2] = sightSpots(w, p, 2);
    park(bot, s1); senseFor(w, p, intel, DT);
    expect(mapMarkers(w, p, intel, []).find((x) => x.id === bot.id)).toMatchObject({ kind: 'hostile', x: s1.x, y: s1.y });
    park(bot, s2); senseFor(w, p, intel, DT);
    expect(mapMarkers(w, p, intel, []).find((x) => x.id === bot.id)).toMatchObject({ kind: 'hostile', x: s2.x, y: s2.y });
  });

  it('lost from view: a fading trace where it was last seen (never its new spot), then it expires', () => {
    const { w, p, intel, bot } = setup();
    const s1 = sightSpots(w, p, 1)[0];
    park(bot, s1); senseFor(w, p, intel, DT);
    park(bot, behindWall(w, p.x, p.y, 20)); senseFor(w, p, intel, DT);
    let m = mapMarkers(w, p, intel, []);
    expect(kinds(m, bot.id)).toEqual(['trace']);
    const t0 = m.find((x) => x.id === bot.id)!;
    expect(Math.hypot(t0.x - s1.x, t0.y - s1.y)).toBeLessThan(0.01);
    for (let i = 0; i < 60; i++) senseFor(w, p, intel, DT);
    const t1 = mapMarkers(w, p, intel, []).find((x) => x.id === bot.id)!;
    expect(t1.conf!).toBeLessThan(t0.conf!);
    // Out of sight long enough, the belief runs out: nothing of it left on the map.
    for (let i = 0; i < 60 / DT; i++) senseFor(w, p, intel, DT);
    m = mapMarkers(w, p, intel, []);
    expect(kinds(m, bot.id)).toEqual([]);
  });

  it('dead: removed at once, live or traced', () => {
    const { w, p, intel, bot } = setup();
    park(bot, sightSpots(w, p, 1)[0]); senseFor(w, p, intel, DT);
    expect(kinds(mapMarkers(w, p, intel, []), bot.id)).toEqual(['hostile']);
    bot.alive = false; bot.hp = 0; senseFor(w, p, intel, DT);
    expect(kinds(mapMarkers(w, p, intel, []), bot.id)).toEqual([]);
    // Lost first (a trace), then killed out of sight: the trace goes too.
    const { w: w2, p: p2, intel: i2, bot: b2 } = setup();
    park(b2, sightSpots(w2, p2, 1)[0]); senseFor(w2, p2, i2, DT);
    park(b2, behindWall(w2, p2.x, p2.y, 20)); senseFor(w2, p2, i2, DT);
    expect(kinds(mapMarkers(w2, p2, i2, []), b2.id)).toEqual(['trace']);
    b2.alive = false; senseFor(w2, p2, i2, DT);
    expect(kinds(mapMarkers(w2, p2, i2, []), b2.id)).toEqual([]);
  });

  it('heard: a trace near the sound (behind you) or a bearing area (through a wall), never the body', () => {
    const { w, p, intel, bot } = setup();
    const back = behindBack(w, p);
    park(bot, back);
    senseFor(w, p, intel, DT);
    expect(kinds(mapMarkers(w, p, intel, []), bot.id)).toEqual([]); // silent and unseen: nothing
    senseFor(w, p, intel, DT, [{ type: 'step', x: bot.x, y: bot.y, radius: 12, sourceId: bot.id, team: 'bot', tick: w.tick }]);
    const m = mapMarkers(w, p, intel, []);
    expect(kinds(m, bot.id)).toEqual(['trace']);
    const wall = behindWall(w, p.x, p.y, 8);
    const { w: w2, p: p2, intel: i2, bot: b2 } = setup();
    park(b2, wall);
    senseFor(w2, p2, i2, DT, [{ type: 'shot', x: b2.x, y: b2.y, radius: 30, sourceId: b2.id, team: 'bot', tick: w2.tick }]);
    const m2 = mapMarkers(w2, p2, i2, []);
    expect(kinds(m2, b2.id).every((k) => k === 'trace')).toBe(true);
    expect(m2.some((x) => x.id === b2.id && x.kind === 'hostile')).toBe(false);
    // Its muzzle flash in a clear line (even behind you) shows the shooter live, as in the game view.
    const { w: w3, p: p3, intel: i3, bot: b3 } = setup();
    park(b3, behindBack(w3, p3));
    senseFor(w3, p3, i3, DT, [{ type: 'shot', x: b3.x, y: b3.y, radius: 30, sourceId: b3.id, team: 'bot', tick: w3.tick }]);
    expect(kinds(mapMarkers(w3, p3, i3, []), b3.id)).toEqual(['hostile']);
  });

  it('a teammate sees it: a blurred trace on your map, never the live body', () => {
    const { w, p, intel, bot } = setup(true);
    const mate = w.actors.find((a) => a.team === p.team && a !== p)!;
    let spot: { x: number; y: number } | null = null;
    for (const s of sightSpots(w, mate, 30)) if (!canSee(w.level, p.x, p.y, p.facing, p.view, s.x, s.y)) { spot = s; break; }
    if (!spot) { mate.facing = p.facing + Math.PI; for (const s of sightSpots(w, mate, 30)) if (!canSee(w.level, p.x, p.y, p.facing, p.view, s.x, s.y)) { spot = s; break; } }
    expect(spot).not.toBeNull();
    park(bot, spot!); senseFor(w, p, intel, DT);
    expect(kinds(mapMarkers(w, p, intel, []), bot.id)).toEqual(['trace']);
  });

  it('Ping: a hostile it reveals is shown live (as the game view draws it), even through a wall; when it ends, a trace', () => {
    const { w, p, intel, bot } = setup();
    const R = p.ability.radius ?? TUNING.abilities.sonarRadius;
    park(bot, behindWall(w, p.x, p.y, Math.min(R - 1, 10)));
    senseFor(w, p, intel, DT);
    expect(kinds(mapMarkers(w, p, intel, []), bot.id)).toEqual([]);
    p.revealLeft = 1;
    senseFor(w, p, intel, DT);
    expect(mapMarkers(w, p, intel, []).find((x) => x.id === bot.id)).toMatchObject({ kind: 'hostile', x: bot.x, y: bot.y });
    p.revealLeft = 0;
    senseFor(w, p, intel, DT);
    expect(kinds(mapMarkers(w, p, intel, []), bot.id)).toEqual(['trace']);
  });

  it('Marker: a hostile your team marked is shown live while the mark lasts', () => {
    const { w, p, intel, bot } = setup();
    park(bot, behindWall(w, p.x, p.y, 12));
    bot.markLeft = 2; bot.markTeam = p.team;
    senseFor(w, p, intel, DT);
    expect(kinds(mapMarkers(w, p, intel, []), bot.id)).toEqual(['hostile']);
  });

  it('never omniscient: across a whole solo run every hostile on the map is one the intel holds, and a live one is a living bot at its real spot', () => {
    const w = createWorld({ mapId: 'office', seed: 9, allies: [{ name: 'A', hero: 'toad' }, { name: 'B', hero: 'ray' }] });
    const p = w.actors[0], intel = createIntel();
    for (let i = 0; i < 1800 && !w.outcome; i++) {
      stepWorld(w, { ...IDLE_INPUT, aim: p.facing + 0.002 * i, moveX: Math.cos(i / 200), moveY: Math.sin(i / 260) });
      senseFor(w, p, intel, DT);
      for (const m of mapMarkers(w, p, intel, visorDots(w, p, null))) {
        if (m.kind === 'hostile') {
          const a = w.actors[m.id], c = intel.contacts.get(m.id);
          expect(a.alive && a.team === 'bot' && a.x === m.x && a.y === m.y).toBe(true);
          expect(c && (c.state === 'visible' || (c.state === 'partial' && c.source === 'ping'))).toBe(true);
        }
        if (m.kind === 'trace') expect(intel.contacts.has(m.id)).toBe(true);
      }
    }
  });
});

describe('information rules online (real Lobby, real client)', () => {
  it('1v1: an opponent behind walls is not on your map; in your light it is, at its real spot', async () => {
    const o = await online(2, '1v1', 'office');
    expect(o.ss.every((s) => s.state === 'match')).toBe(true);
    const sw = o.room.world;
    const [me, foe] = [sw.actors[0], sw.actors[1]];
    // The spawns face each other across the whole office: walls between.
    o.run(0.3);
    const a = o.ss.findIndex((s) => s.world!.actors[0].name === me.name);
    let c = clientMarkers(o.ss[a]);
    expect(c.m.filter((x) => x.kind === 'enemy')).toHaveLength(0);
    for (const x of c.m) if (x.kind !== 'you') expect(Math.hypot(x.x - foe.x, x.y - foe.y)).toBeGreaterThan(3);
    // Move the foe into my light on the server: the next snapshot shows it, and the map with it.
    const spot = sightSpots(sw, me, 1)[0];
    o.run(0.3, () => park(foe, spot));
    c = clientMarkers(o.ss[a]);
    const e = c.m.filter((x) => x.kind === 'enemy');
    expect(e).toHaveLength(1);
    expect(Math.hypot(e[0].x - foe.x, e[0].y - foe.y)).toBeLessThan(0.6);
    o.done();
  });

  it('3v3: two teammates always, enemies never while unseen (the server never sent them)', async () => {
    const o = await online(6, '3v3', 'supermarket');
    expect(o.ss.every((s) => s.state === 'match')).toBe(true);
    o.run(0.5);
    for (const s of o.ss) {
      const c = clientMarkers(s);
      expect(c.m.filter((x) => x.kind === 'you')).toHaveLength(1);
      expect(c.m.filter((x) => x.kind === 'mate')).toHaveLength(2);
      // At spawn the two sides are a whole store apart: no enemy, and nothing near any real enemy body.
      expect(c.m.filter((x) => x.kind === 'enemy')).toHaveLength(0);
      const myTeam = o.room.world.actors.find((a) => a.name === c.p.name)!.team;
      for (const foe of o.room.world.actors.filter((a) => a.team !== myTeam)) for (const x of c.m) expect(Math.hypot(x.x - foe.x, x.y - foe.y)).toBeGreaterThan(3);
    }
    o.done();
  });

  it('Visor online: the dots are the server list sent to the holder alone', async () => {
    const o = await online(2, '1v1', 'metro');
    const sw = o.room.world, me = sw.actors[0], foe = sw.actors[1];
    me.ability = superAbility('visor', 'common');
    const a = o.ss.findIndex((s) => s.world!.actors[0].name === me.name), b = 1 - a;
    o.ss[a].world!.actors[0].ability = superAbility('visor', 'common');
    o.run(0.3, () => park(foe, behindWall(sw, me.x, me.y, 12)));
    const c = clientMarkers(o.ss[a]);
    const v = c.m.filter((x) => x.kind === 'visor');
    expect(v).toHaveLength(1);
    expect(Math.hypot(v[0].x - foe.x, v[0].y - foe.y)).toBeLessThan(0.01);
    // The other client (no Visor) has no dot of me, and no body either.
    const o2 = clientMarkers(o.ss[b]);
    expect(o2.m.filter((x) => x.kind === 'visor' || x.kind === 'enemy')).toHaveLength(0);
    o.done();
  });
});

describe('view: fit, zoom, pan', () => {
  it('fits the whole location, centred, aspect kept', () => {
    const v = fitView(80, 40, 0, 0, 1000, 1000);
    expect(v.k).toBe(12.5);
    expect(v.ox).toBe(0);
    expect(v.oy).toBe(250);
    const s = toMap(v, 80, 40);
    expect(s).toEqual({ x: 1000, y: 750 });
  });
  it('zoom keeps the point under the cursor or fingers fixed, within fit..fit x MAX_ZOOM', () => {
    const v = fitView(64, 44, 0, 0, 1280, 720);
    const cx = 500, cy = 300;
    const before = { x: (cx - v.ox) / v.k, y: (cy - v.oy) / v.k };
    const z = zoomAt(v, 2, cx, cy);
    expect(z.k).toBeCloseTo(v.k * 2, 9);
    const at = toMap(z, before.x, before.y);
    expect(at.x).toBeCloseTo(cx, 6); expect(at.y).toBeCloseTo(cy, 6);
    expect(zoomAt(z, 100, cx, cy).k).toBeCloseTo(v.fitK * MAX_ZOOM, 9);
    expect(zoomAt(z, 0.001, cx, cy).k).toBeCloseTo(v.fitK, 9);
  });
  it('pan moves the map, and it can never be dragged off screen', () => {
    const v = zoomAt(fitView(64, 44, 0, 0, 1280, 720), 3, 640, 360);
    const p = panBy(v, 100, -50);
    expect(p.ox - v.ox).toBe(100); expect(p.oy - v.oy).toBe(-50);
    const far = clampView(panBy(v, 1e5, 1e5), 64, 44, 1280, 720);
    expect(far.ox).toBeLessThanOrEqual(1280 - 80); expect(far.oy).toBeLessThanOrEqual(720 - 80);
    const neg = clampView(panBy(v, -1e5, -1e5), 64, 44, 1280, 720);
    expect(neg.ox + 64 * neg.k).toBeGreaterThanOrEqual(80);
  });
});
void WALL;

describe('Game Docs', () => {
  it('Controls and the FAQ explain the tactical map and what it will never show', async () => {
    const { docsHtml } = await import('../src/ui/docs');
    for (const touch of [false, true]) {
      const h = docsHtml(touch, null, '');
      expect(h).toMatch(/Tactical map/);
      expect(h).toMatch(touch ? /MAP button/ : /\bM or the MAP button/);
    }
    expect(docsHtml(false, null, '')).toMatch(/never shows what your own eyes, team and powers do not/);
  });
});
