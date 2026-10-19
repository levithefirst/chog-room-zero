// CHOG superpowers online (owner 2026-10-18): the game server takes the power from the verified ticket only, every
// client builds the same ability from the roster, and snapshots carry what each player may know: the cage or glue on
// you (so your own prediction holds), globs near you, a hostile beam only where it crosses you (never its owner's spot),
// and an X-Ray hit through a wall without where the target is.
import { describe, expect, it } from 'vitest';
import { Lobby } from '../server/room';
import { PROTOCOL, parseClientMsg, type ServerMsg } from '../src/net/protocol';
import { MAPS } from '../src/config/maps';
import type { GameTicket } from '../api/_lib/game';
import { powerFor, signatureFor } from '../src/config/power';
import { SUPERPOWERS, superAbility } from '../src/config/superpowers';
import { Predictor } from '../src/net/predict';
import { IDLE_INPUT } from '../src/sim/world';
import { WALL, type Level } from '../src/sim/level';
import { TUNING } from '../src/config/tuning';

class FakeConn {
  got: ServerMsg[] = [];
  send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); }
  close() { /* closed */ }
  last<T extends ServerMsg['t']>(t: T) { return [...this.got].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined; }
}
const T = (o: Partial<GameTicket>): GameTicket => ({ tid: Math.random().toString(36), acc: null, tier: 'free', up: { vitality: 0, plating: 0, firepower: 0, focus: 0 }, tok: null, mid: null, tokTier: null, own: null, holder: false, demo: false, name: '', exp: 2e9, ...o });
const flush = () => new Promise((r) => setTimeout(r, 0));
// Chog #36 (Uncommon): Laser Eyes and an Aura. #11: X-Ray (visor) only, Common. Checked against the catalogue below.
const LASER_AURA = 36;
// Chog #VISOR_TOKEN: Visor Eyes only (the Visor tracker).
const VISOR_TOKEN = 11;

async function match(a: GameTicket | null, b: GameTicket | null, heroes = ['benja', 'benja']) {
  let t = 0;
  const tickets: Record<string, GameTicket | null> = { 'a.t': a, 'b.t': b };
  const lobby = new Lobby({ now: () => t, seed: () => 7, countdownSec: 0, checkTicket: async (s) => tickets[s] ?? null });
  const conns = [new FakeConn(), new FakeConn()];
  const ids = conns.map((c) => lobby.connect(c));
  ids.forEach((id, i) => lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: `P${i}`, hero: heroes[i], ticket: i ? 'b.t' : 'a.t' })));
  await flush();
  ids.forEach((id) => lobby.message(id, JSON.stringify({ t: 'queue', mode: '1v1' })));
  const room = [...lobby.rooms.values()][0];
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { t += 1 / 60; lobby.tick(); } };
  tick(1);
  return { lobby, room, conns, ids, tick, w: room.world };
}

/** Two floor tiles on one row with a single wall tile between them. */
function acrossWall(level: Level): { x0: number; x1: number; y: number } {
  const at = (x: number, y: number) => level.tiles[y * level.w + x];
  for (let y = 2; y < level.h - 2; y++) for (let x = 3; x < level.w - 4; x++) {
    if (at(x, y) === 0 && at(x - 1, y) === 0 && at(x + 1, y) === WALL && at(x + 2, y) === 0 && at(x + 3, y) === 0
      && at(x, y - 1) !== WALL && at(x + 2, y - 1) !== WALL) return { x0: x + 0.5, x1: x + 2.5, y: y + 0.5 };
  }
  throw new Error('no thin wall');
}

describe('the server takes the power from the verified ticket', () => {
  it('a verified holder plays its picked power; the roster names it so the other side knows', async () => {
    const holder = T({ acc: 'A', holder: true, tok: 1, mid: LASER_AURA, tokTier: 'uncommon', tier: 'uncommon', sp: 'aura' });
    const { conns, w } = await match(holder, null);
    expect(w.actors[0].ability).toMatchObject({ kind: 'aura', rank: 'uncommon', seconds: SUPERPOWERS.aura.ranks.uncommon.seconds });
    expect(w.actors[1].ability.kind).toBe('sonar'); // Benja's own ability: the free player is untouched
    for (const c of conns) {
      const r = c.last('match')!.roster;
      expect(r[0]).toMatchObject({ sp: 'aura', ability: { kind: 'aura', name: 'Aura' } });
      expect(r[1].sp).toBeUndefined();
    }
  });
  it('no power without NFT power on (tier free), without a ticket, or for a 1:1 (it keeps its signature)', async () => {
    const off = T({ acc: 'A', holder: true, tok: 1, mid: LASER_AURA, tokTier: 'uncommon', tier: 'free', sp: 'laser' });
    const one = T({ acc: 'B', holder: true, tok: 2, mid: 53, tokTier: 'legendary', tier: 'legendary', sp: 'laser' });
    const { w } = await match(off, one);
    expect(w.actors[0].power.superpower).toBeNull();
    expect(w.actors[0].ability.kind).toBe('sonar');
    expect(w.actors[1].power.superpower).toBeNull();
    expect(w.actors[1].ability.name).toBe('Flashfire');
  });
  it('a pick the token does not carry plays the token\'s own default', async () => {
    const t = T({ acc: 'A', holder: true, tok: 1, mid: LASER_AURA, tokTier: 'uncommon', tier: 'uncommon', sp: 'bubble' });
    const { w } = await match(t, null);
    expect(w.actors[0].ability.kind).toBe('laser');
  });
  it('every client builds the same ability from the roster as the server runs', async () => {
    const t = T({ acc: 'A', holder: true, tok: 1, mid: LASER_AURA, tokTier: 'uncommon', tier: 'uncommon', sp: 'laser', up: { vitality: 0, plating: 0, firepower: 0, focus: 2 } });
    const { conns, w } = await match(t, null);
    const r = conns[1].last('match')!.roster[0];
    // What src/net/client.ts buildWorld does with a roster entry.
    const p = powerFor(r.tier, null, r.metadataId && r.tier === 'legendary' ? signatureFor(r.metadataId) : null, !!r.demo, r.metadataId, r.sp ?? null);
    const built = { ...p.superpower!, cooldown: r.ability.cooldown };
    expect(built).toEqual(w.actors[0].ability);
  });
});

describe('snapshots: what each side may know', () => {
  it('a caged player is told its cage, and its own prediction keeps it inside', async () => {
    const t = T({ acc: 'A', holder: true, tok: 1, mid: LASER_AURA, tokTier: 'uncommon', tier: 'uncommon' });
    const { lobby, room, w } = await match(t, null);
    const v = w.actors[1];
    v.trapLeft = 2; v.trapX = v.x; v.trapY = v.y; v.trapR = 1.1;
    const mine = lobby.snapshot(room, room.members[1]).actors.find((a) => a.id === 1)!;
    expect(mine).toMatchObject({ tl: 2, tr: 1.1 });
    const pr = new Predictor();
    pr.reconcile(w.level, { x: mine.x, y: mine.y, vx: 0, vy: 0, hero: v.hero, slowLeft: 0, slowMul: 1, dashLeft: 0, dashX: 0, dashY: 0, downed: false,
      trapLeft: mine.tl, trapX: mine.tx, trapY: mine.ty, trapR: mine.tr }, 0, 0);
    pr.sent(1, { ...IDLE_INPUT, moveX: 1 });
    pr.advance(w.level, 0.8);
    const d = pr.drawn()!;
    expect(Math.hypot(d.x - v.x, d.y - v.y)).toBeLessThanOrEqual(1.1 - TUNING.movement.radius + 1e-6);
  });
  it('an X-Ray through a wall: the target sees only the stretch of line near it, and the shooter is not told where it hit', async () => {
    // No collection trait carries X-Ray yet (owner 2026-10-18), so its holder is given the ability on the server's own
    // world; the rules tested are the server's snapshot rules.
    const { lobby, room, w, tick } = await match(null, null);
    w.actors[0].ability = superAbility('xray', 'common');
    expect(w.actors[0].ability.kind).toBe('xray');
    const s = acrossWall(w.level);
    const [shooter, target] = w.actors;
    shooter.x = s.x0; shooter.y = s.y; shooter.facing = 0;
    target.x = s.x1; target.y = s.y; target.facing = 0; // facing away: it cannot see the shooter
    for (const a of w.actors) { a.vx = a.vy = 0; }
    room.inputs[0] = { ...IDLE_INPUT, aim: 0, ability: true };
    room.inputs[1] = { ...IDLE_INPUT, aim: 0 };
    tick(1);
    room.inputs[0] = { ...IDLE_INPUT, aim: 0 };
    const snapT = lobby.snapshot(room, room.members[1]);
    expect(snapT.actors.some((a) => a.id === 0)).toBe(false);
    expect(snapT.bm?.length).toBe(1);
    const bm = snapT.bm![0];
    expect(bm).toMatchObject({ k: 'xray' });
    // Never where the shooter stands: the stretch starts at least halfway from it to the target.
    const gap = Math.hypot(target.x - shooter.x, target.y - shooter.y);
    expect(Math.hypot(bm.x - shooter.x, bm.y - shooter.y)).toBeGreaterThanOrEqual(gap / 2 - 1e-3);
    expect(Math.hypot(bm.x - target.x, bm.y - target.y)).toBeLessThanOrEqual(5 + 1e-6);
    // Run until the beam lands; the shooter's report of its hit is blurred, not the target's spot.
    let reported: { x: number; y: number } | undefined;
    for (let i = 0; i < 90 && !reported; i++) {
      tick(1);
      const h = lobby.snapshot(room, room.members[0]).hits.find((x) => x.by === 0 && x.target === 1);
      if (h) reported = h;
    }
    expect(reported).toBeDefined();
    expect(target.hp + target.armor).toBeLessThan(target.maxHp + target.maxArmor);
    expect(Math.hypot(reported!.x - target.x, reported!.y - target.y)).toBeGreaterThan(0.01);
    expect(lobby.snapshot(room, room.members[0]).actors.some((a) => a.id === 1)).toBe(false);
  });
  it('a glob is sent to its own side always, and to the other side only when seen or close', async () => {
    const t = T({ acc: 'A', holder: true, tok: 1, mid: LASER_AURA, tokTier: 'uncommon', tier: 'uncommon' });
    const { lobby, room, w } = await match(t, null);
    w.orbs.push({ id: 9, kind: 'bubble', x: w.actors[0].x, y: w.actors[0].y, dx: 1, dy: 0, ox: 0, oy: 0, left: 1, owner: 0, team: w.actors[0].team, alive: true });
    expect(lobby.snapshot(room, room.members[0]).ob?.map((o) => o.id)).toEqual([9]);
    const far = Math.hypot(w.actors[1].x - w.actors[0].x, w.actors[1].y - w.actors[0].y) > 12;
    if (far) expect(lobby.snapshot(room, room.members[1]).ob).toBeUndefined();
  });
});

describe('Visor online: the tracker comes from the server, the tracked are told', () => {
  it('a Visor holder is sent every hidden hostile inside its radius (spot only); the hostile is told it is tracked', async () => {
    const t = T({ acc: 'A', holder: true, tok: 1, mid: VISOR_TOKEN, tokTier: 'common', tier: 'common' });
    const { lobby, room, w } = await match(t, null);
    expect(w.actors[0].ability.kind).toBe('visor');
    const s = acrossWall(w.level);
    w.actors[0].x = s.x0; w.actors[0].y = s.y; w.actors[1].x = s.x1; w.actors[1].y = s.y; w.actors[1].facing = 0;
    const mine = lobby.snapshot(room, room.members[0]);
    expect(mine.actors.some((a) => a.id === 1)).toBe(false); // not shown as a body
    expect(mine.vt).toEqual([{ id: 1, x: w.actors[1].x, y: w.actors[1].y }]);
    expect(lobby.snapshot(room, room.members[1]).actors.find((a) => a.id === 1)?.tk).toBe(1);
    // Outside the radius: nothing.
    w.actors[1].x = w.actors[0].x + 30;
    expect(lobby.snapshot(room, room.members[0]).vt).toBeUndefined();
    // A free player with no Visor is never sent a tracker list.
    expect(lobby.snapshot(room, room.members[1]).vt).toBeUndefined();
  });
});

describe('locations online (owner 2026-10-18)', () => {
  async function queueOn(map: string | undefined, tickets: (GameTicket | null)[] = [null, null]) {
    let t = 0;
    const lobby = new Lobby({ now: () => t, seed: () => 7, countdownSec: 0, checkTicket: async (s) => (s === 'a.t' ? tickets[0] : tickets[1]) });
    const conns = [new FakeConn(), new FakeConn()];
    const ids = conns.map((c) => lobby.connect(c));
    ids.forEach((id, i) => lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: `P${i}`, hero: 'benja', ...(tickets[i] ? { ticket: i ? 'b.t' : 'a.t' } : {}) })));
    await flush();
    ids.forEach((id) => lobby.message(id, JSON.stringify({ t: 'queue', mode: '1v1', ...(map ? { map } : {}) })));
    return { lobby, conns };
  }
  it('the match is built on the chosen map and every client is told which; no map means Room Zero', async () => {
    for (const map of ['office', 'supermarket', 'room-zero'] as const) {
      const { lobby, conns } = await queueOn(map);
      const room = [...lobby.rooms.values()][0];
      expect(room.world.mapId).toBe(map);
      for (const c of conns) expect(c.last('match')!.map).toBe(map);
      // Spawns are the map's own.
      expect(room.world.actors[0].x).toBe(MAPS[map].versusSpawns.alpha[0].x);
    }
    const { lobby } = await queueOn(undefined);
    expect([...lobby.rooms.values()][0].world.mapId).toBe('room-zero');
  });
  // MP P0 (2026-10-19): a real 1v1 never started because two friends had different saved locations (one queue per
  // location). Now the pick is tried first and, after TUNING.match.anyMapAfterSec, anyone in the mode meets.
  function lobbyAt() {
    const clock = { t: 0 };
    const lobby = new Lobby({ now: () => clock.t, seed: () => 7, countdownSec: 0 });
    const join = (map: string, name: string) => {
      const c = new FakeConn();
      const id = lobby.connect(c);
      lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name, hero: 'benja' }));
      lobby.message(id, JSON.stringify({ t: 'queue', mode: '1v1', map }));
      return { c, id };
    };
    // Sockets keep talking (the client pings every 2 s), so the lobby counts them as live.
    const wait = (sec: number, live: number[] = []) => { for (let i = 0; i < sec * 60; i++) { clock.t += 1 / 60; if (i % 60 === 0) live.forEach((id) => lobby.message(id, JSON.stringify({ t: 'ping', at: 0 }))); lobby.tick(); } };
    return { lobby, clock, join, wait };
  }
  it('two players on different locations meet after the wait, on the location of whoever waited longest', () => {
    const { lobby, join, wait } = lobbyAt();
    const a = join('office', 'A');
    wait(1, [a.id]);
    const b = join('room-zero', 'B');
    wait(TUNING.match.anyMapAfterSec - 2, [a.id, b.id]);
    expect(lobby.rooms.size).toBe(0);
    wait(3, [a.id, b.id]);
    expect(lobby.rooms.size).toBe(1);
    expect([...lobby.rooms.values()][0].world.mapId).toBe('office');
    expect(a.c.last('match')!.map).toBe('office');
    expect(b.c.last('match')!.map).toBe('office');
  });
  it('the same location still meets at once and is preferred over a longer-waiting player on another', () => {
    const { lobby, join, wait } = lobbyAt();
    const a = join('supermarket', 'A');
    wait(2, [a.id]);
    const b = join('office', 'B');
    const c = join('office', 'C');
    expect(lobby.rooms.size).toBe(1);
    expect([...lobby.rooms.values()][0].world.mapId).toBe('office');
    expect(b.c.last('match')).toBeTruthy();
    expect(c.c.last('match')).toBeTruthy();
    expect(a.c.last('match')).toBeUndefined();
  });
  it('a private code meets at once whatever each picked, on its creator\'s location; free players and holders mix', async () => {
    let t = 0;
    const holder = T({ acc: 'H', holder: true, tok: 1, mid: LASER_AURA, tokTier: 'uncommon', tier: 'uncommon' });
    const lobby = new Lobby({ now: () => t, seed: () => 7, countdownSec: 0, checkTicket: async (s) => (s === 'h.t' ? holder : null) });
    const c = [0, 1].map(() => new FakeConn());
    const ids = c.map((x) => lobby.connect(x));
    ids.forEach((id, i) => lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: `P${i}`, hero: 'benja', ...(i === 0 ? { ticket: 'h.t' } : {}) })));
    await flush();
    lobby.message(ids[0], JSON.stringify({ t: 'queue', mode: '1v1', map: 'metro', code: 'FRIEND' }));
    lobby.message(ids[1], JSON.stringify({ t: 'queue', mode: '1v1', map: 'construction', code: 'FRIEND' }));
    expect(lobby.rooms.size).toBe(1);
    expect([...lobby.rooms.values()][0].world.mapId).toBe('metro');
    void t;
  });
  it('a socket that went silent is never seated in a room; the live one waits for a live opponent', () => {
    const { lobby, join, wait } = lobbyAt();
    const a = join('room-zero', 'A');
    // A's phone goes into a tunnel: no message for longer than liveWithinSec (the socket still looks open).
    wait(TUNING.match.liveWithinSec + 1, []);
    const b = join('room-zero', 'B');
    wait(1, [b.id]);
    expect(lobby.rooms.size).toBe(0);
    const c = join('room-zero', 'C');
    expect(lobby.rooms.size).toBe(1);
    expect(b.c.last('match')).toBeTruthy();
    expect(c.c.last('match')).toBeTruthy();
    expect(a.c.last('match')).toBeUndefined();
  });
  it('an unknown map id is refused by the protocol', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'queue', mode: '1v1', map: 'moon' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'queue', mode: '1v1', map: 'office' }))).toMatchObject({ map: 'office' });
  });
});
