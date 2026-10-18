// Online hardening (FS final pass, network audit): what a modded client could recover or break, and the online
// lifecycle bugs (leave, resume, countdown, cancelled matches, matchmaking starvation, one seat per Chog). Each test
// failed on the code before the fix. Server rules with fake sockets; client rules with a fake WebSocket bridged to a
// real Lobby.
import { describe, expect, it, vi } from 'vitest';
import { Lobby } from '../server/room';
import { OnlineSession } from '../src/net/client';
import { settleRetryable } from '../src/net/account';
import type { ServerMsg } from '../src/net/protocol';
import type { GameTicket } from '../api/_lib/game';
import { hearReport, noise3 } from '../src/sim/intel';
import { canSee } from '../src/sim/vision';
import { WEAPONS } from '../src/config/weapons';
import { TUNING } from '../src/config/tuning';
import type { HitEvent, World } from '../src/sim/world';

class FakeConn {
  got: ServerMsg[] = [];
  send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); }
  close() { /* closed */ }
  last<T extends ServerMsg['t']>(t: T) { return [...this.got].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined; }
  all<T extends ServerMsg['t']>(t: T) { return this.got.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[]; }
}

/** The parts of a room the tests look into (the type is private to server/room.ts). */
interface RoomView { id: string; world: World; members: { id: number; ticket: GameTicket | null }[]; acks: number[]; quit: boolean[]; sounds: unknown[]; hits: unknown[]; startTick: number; steps: number }

const T = (o: Partial<GameTicket>): GameTicket => ({ tid: 'x', acc: null, tier: 'free', up: { vitality: 0, plating: 0, firepower: 0, focus: 0 }, tok: null, mid: null, tokTier: null, own: null, holder: false, demo: false, name: '', exp: 2e9, ...o });

function setup(opts: Record<string, unknown> = {}) {
  let t = 0;
  const lobby = new Lobby({ now: () => t, seed: () => 7, idleTimeoutSec: 999, ...opts });
  const join = (name: string, ticket?: string, token?: string) => {
    const c = new FakeConn();
    const id = lobby.connect(c);
    lobby.message(id, JSON.stringify({ t: 'hello', v: 1, name, hero: 'benja', ...(ticket ? { ticket } : {}), ...(token ? { token } : {}) }));
    return { c, id, say: (m: object) => lobby.message(id, JSON.stringify(m)) };
  };
  const run = (seconds: number, each?: () => void) => { for (let i = 0; i < Math.round(seconds * 60); i++) { t += 1 / 60; each?.(); lobby.tick(); } };
  const room = () => [...lobby.rooms.values()][0] as unknown as RoomView | undefined;
  return { lobby, join, run, room };
}

const input = (o: Partial<{ seq: number; mx: number; my: number; aim: number; fire: boolean; reload: boolean; ability: boolean; nade: boolean }> = {}) =>
  ({ t: 'input', seq: 1, mx: 0, my: 0, aim: 0, fire: false, quiet: false, reload: false, ability: false, ...o });

function match3v3(seed = 5) {
  const s = setup({ seed: () => seed, countdownSec: 0 });
  const ps = Array.from({ length: 6 }, (_, i) => s.join(`P${i}`));
  ps.forEach((p) => p.say({ t: 'queue', mode: '3v3' }));
  const room = s.room()!;
  return { ...s, ps, room, w: room.world };
}

/** P0 privacy scene (north corridor, row 10): your mate sees the foe, you face away from it. */
function spottedScene(seed = 5) {
  const m = match3v3(seed);
  m.run(1 / 60);
  const w = m.w;
  const [me, mate] = [w.actors[0], w.actors[1]];
  const foe = w.actors.find((a) => a.team !== me.team)!;
  me.x = 20.5; me.y = 10.5; me.facing = Math.PI; mate.x = 16.5; mate.y = 10.5; mate.facing = 0;
  foe.x = 23.5; foe.y = 10.5;
  for (const a of w.actors) if (a !== me && a !== mate && a !== foe) { a.x = 3; a.y = 2; }
  expect(canSee(w.level, mate.x, mate.y, mate.facing, mate.view, foe.x, foe.y)).toBe(true);
  expect(canSee(w.level, me.x, me.y, me.facing, me.view, foe.x, foe.y)).toBe(false);
  return { ...m, me, mate, foe };
}

describe('P0-1 server noise is keyed with a per-room secret', () => {
  it('a spotted spot cannot be undone by recomputing the public noise and subtracting it', () => {
    const { lobby, room, w, foe } = spottedScene();
    const member = (room.members[0] as unknown) as Parameters<Lobby['snapshot']>[1];
    const errs: number[] = [];
    for (let k = 0; k < 8; k++) {
      const sp = lobby.snapshot(room as never, member).sp!.find((x) => x.id === foe.id)!;
      // What a modded client would do: it knows the tick, both ids and the formula.
      const a = noise3(w.tick, foe.id, 0 * 7 + 1) * Math.PI, d = (0.5 + 0.5 * Math.abs(noise3(w.tick, foe.id, 0 * 7 + 2))) * TUNING.intel.spottedRadius;
      errs.push(Math.hypot(sp.x - Math.cos(a) * d - foe.x, sp.y - Math.sin(a) * d - foe.y));
      w.tick += Math.round(TUNING.sound.spottedRefresh / TUNING.simStepSeconds);
    }
    // Unkeyed, the subtraction lands within the 0.25 rounding (<= 0.18 u) every time.
    expect(errs.reduce((s, e) => s + e, 0) / errs.length).toBeGreaterThan(0.4);
  });

  it('two rooms with the same seed and the same scene send different spots (the key is per room)', () => {
    const a = spottedScene(9), b = spottedScene(9);
    // Spots are rounded to a 0.25 u grid, so two independent keys land on the same cell now and then (about 1 in
    // 300): compare a run of refreshed spots, which only a shared key keeps identical.
    const refresh = Math.round(TUNING.sound.spottedRefresh / TUNING.simStepSeconds);
    const seq = (m: typeof a) => Array.from({ length: 4 }, () => {
      m.w.tick += refresh;
      return m.lobby.snapshot(m.room as never, m.room.members[0] as never).sp!.find((x) => x.id === m.foe.id)!;
    });
    const spa = seq(a), spb = seq(b);
    expect(a.w.tick).toBe(b.w.tick);
    expect(spa).not.toEqual(spb);
  });

  it('a hearing estimate is not the public formula applied to the true sound; solo noise is unchanged', () => {
    const { lobby, room, w } = match3v3();
    const me = w.actors[0];
    const foe = w.actors.find((a) => a.team !== me.team)!;
    for (const a of w.actors) if (a !== me && a !== foe) { a.x = 3; a.y = 2; }
    me.x = 15.5; me.y = 4.5; me.facing = Math.PI;
    for (const [x, y, est] of [[14.5, 10.5, 'wall'], [19.5, 4.5, 'clear']] as const) {
      foe.x = x; foe.y = y;
      const s = { type: 'step' as const, x, y, radius: 9, sourceId: foe.id, team: foe.team, tick: w.tick };
      w.sounds = [s];
      const got = lobby.snapshot(room as never, room.members[0] as never).sounds.find((q) => q.source === foe.id)!;
      expect(got.est).toBe(est);
      const pub = hearReport(w, me, s)!;
      expect(Math.hypot(got.x - pub.x, got.y - pub.y)).toBeGreaterThan(0.001);
    }
    // No salt: the plain hash solo, the lab and the client have always used.
    const plain = (a: number, b: number, c: number) => {
      let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
      h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
      return ((h >>> 0) / 4294967295) * 2 - 1;
    };
    for (const [a, b, c] of [[0, 0, 0], [123, 4, 1], [99999, 7, 15], [-5, 2, 3]]) expect(noise3(a, b, c)).toBe(plain(a, b, c));
  });
});

describe('P1-2 every step\'s sounds and hits reach the snapshots', () => {
  it('a burst of fire: every shot sound and every hit is delivered, and the buffer drains', () => {
    const { join, run, room } = setup();
    const a = join('A'), b = join('B');
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    const r = room()!, w = r.world;
    run(3.1);
    // B 3 u east of A in A's spawn hall, too tough to die: A holds fire.
    w.actors[1].x = w.actors[0].x + 3; w.actors[1].y = w.actors[0].y; w.actors[1].hp = 1e6;
    let seq = 1;
    run(1.5, () => a.say(input({ seq: seq++, aim: 0, fire: true })));
    const snaps = a.c.all('snap');
    const shots = snaps.flatMap((s) => s.sounds).filter((s) => s.type === 'shot' && s.source === 0).length;
    const hits = snaps.flatMap((s) => s.hits).filter((h) => h.by === 0).length;
    expect(w.actors[0].bullets).toBeGreaterThan(3);
    expect(shots).toBe(w.actors[0].bullets);
    expect(hits).toBe(w.actors[0].hits);
    expect(r.sounds.length + r.hits.length).toBeLessThanOrEqual(64);
  });
});

describe('P1-3 hostile bullets and grenades', () => {
  it('a hostile bullet you see from a shooter you are not shown carries no fire position; one behind a wall is not sent', () => {
    const { lobby, room, w } = match3v3();
    const me = w.actors[0];
    const foe = w.actors.find((a) => a.team !== me.team)!;
    for (const a of w.actors) if (a !== me) { a.x = 3; a.y = 2; }
    // You in the north corridor facing east; the shooter out of sight in the gallery, its bullet in your light.
    me.x = 17.5; me.y = 10.5; me.facing = 0;
    foe.x = 30.5; foe.y = 5.5;
    const bullet = { x: 21.5, y: 10.5, dx: -1, dy: 0, ox: foe.x, oy: foe.y, life: 1, owner: foe.id, weapon: WEAPONS.rifle, alive: true };
    w.bullets = [bullet];
    let s = lobby.snapshot(room as never, room.members[0] as never);
    expect(s.actors.some((a) => a.id === foe.id)).toBe(false);
    expect(s.bullets[0]).toMatchObject({ x: 21.5, y: 10.5, ox: 21.5, oy: 10.5 });
    // A thin wall (row 16, x 14) between you and a bullet 2 u away, behind you: not sent (it was, by distance alone).
    me.x = 14.5; me.y = 15.3; me.facing = -Math.PI / 2;
    w.bullets = [{ ...bullet, x: 14.5, y: 17.3 }];
    s = lobby.snapshot(room as never, room.members[0] as never);
    expect(s.bullets).toHaveLength(0);
    // The same for a hostile grenade within its warning distance.
    w.grenades = [{ id: 1, x: 14.5, y: 17.3, vx: 0, vy: 0, fuse: 1, owner: foe.id, team: foe.team, alive: true } as never];
    expect(lobby.snapshot(room as never, room.members[0] as never).grenades ?? []).toHaveLength(0);
    // On a clear line it is still sent (you can read the danger you are in).
    w.grenades[0].y = 13.5; w.grenades[0].x = 14.5;
    me.y = 15.3;
    expect((lobby.snapshot(room as never, room.members[0] as never).grenades ?? []).length).toBe(1);
  });
});

describe('P2-10 a knock-out of a hostile you are not shown', () => {
  it('is placed like a spotted report, never at the body', () => {
    const { lobby, room, foe, mate } = spottedScene();
    const h: HitEvent = { target: foe.id, by: mate.id, x: foe.x, y: foe.y, fromX: mate.x, fromY: mate.y, hpDamage: 30, armorDamage: 0, killed: false, downed: true };
    room.world.hits = [h];
    const got = lobby.snapshot(room as never, room.members[0] as never).hits[0];
    const d = Math.hypot(got.x - foe.x, got.y - foe.y);
    expect(d).toBeGreaterThan(0.1);
    expect(d).toBeLessThanOrEqual(TUNING.intel.spottedRadius + 0.2);
    // The teammate who did it gets it exact.
    expect(lobby.snapshot(room as never, room.members[1] as never).hits[0]).toMatchObject({ x: foe.x, y: foe.y });
  });
});

describe('P1-4 / P1-5 / P2-12b hello and resume', () => {
  it('a second hello is refused: it cannot take over a dropped operator from a socket that is already queued', () => {
    const { lobby, join, room } = setup();
    const a = join('A'), b = join('B');
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    const token = a.c.last('welcome')!.token;
    lobby.disconnect(a.id);
    const c = join('C');
    c.say({ t: 'queue', mode: '1v1' });
    c.say({ t: 'hello', v: 1, name: 'C', hero: 'benja', token });
    expect(c.c.last('error')!.code).toBe('hello-again');
    expect(c.c.last('match')).toBeUndefined();
    expect(c.c.last('queued')).toBeDefined();
    expect((room()!.members[0] as unknown as { conn: unknown }).conn).toBeNull();
  });

  it('a resume starts the ack over, drops the controls from before the drop, and carries the profile', () => {
    const { lobby, join, run, room } = setup();
    const a = join('A'), b = join('B');
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    const r = room()!, w = r.world;
    run(3.1);
    let seq = 40;
    run(0.3, () => a.say(input({ seq: seq++, mx: 0, my: 1 })));
    expect(a.c.last('snap')!.ack).toBeGreaterThan(40);
    const token = a.c.last('welcome')!.token;
    lobby.disconnect(a.id);
    run(0.5);
    const c = join('A', undefined, token);
    const wel = c.c.last('welcome')!;
    expect(wel.resumed).toBe(true);
    const y0 = w.actors[0].y;
    run(0.5);
    // Nothing held after the resume until the reloaded client says so (it was walking south when it dropped).
    expect(w.actors[0].y).toBeCloseTo(y0, 6);
    expect(c.c.last('snap')!.ack).toBe(0);
    c.say(input({ seq: 1, mx: 0, my: 1 }));
    run(0.1);
    expect(c.c.last('snap')!.ack).toBe(1);
    expect(wel.profile).toMatchObject({ verified: false, tier: 'free' });
  });
});

describe('P1-7 a match that ends before it starts is void', () => {
  it('leaving during the countdown: no winner, no result stored, the other player is told and can queue again', () => {
    const { lobby, join, run, room } = setup();
    const a = join('A'), b = join('B');
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    const id = room()!.id;
    run(1);
    b.say({ t: 'leave' });
    expect(a.c.last('over')).toBeUndefined();
    expect(a.c.last('error')!.code).toBe('match-cancelled');
    expect(lobby.result(id)).toBeNull();
    expect(lobby.rooms.size).toBe(0);
    a.say({ t: 'queue', mode: '1v1' });
    expect(a.c.last('queued')).toBeDefined();
  });

  it('a drop whose grace runs out before the start voids it too (after the start: tests/rc8-online.test.ts)', () => {
    const s = setup({ reconnectGraceSec: 1, countdownSec: 3 });
    const a = s.join('A'), b = s.join('B');
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    s.lobby.disconnect(a.id);
    s.run(2);
    expect(b.c.last('error')!.code).toBe('match-cancelled');
    expect(b.c.last('over')).toBeUndefined();
  });
});

describe('P2-8 a quit is decided when the player dropped', () => {
  it('dropped while standing, knocked out while away: still a quit (match ended in the grace period)', async () => {
    const tickets: Record<string, GameTicket> = { 'a.t': T({ tid: 'a', acc: 'A' }), 'b.t': T({ tid: 'b', acc: 'B' }) };
    const s = setup({ checkTicket: async (k: string) => tickets[k] ?? null });
    const a = s.join('A', 'a.t'), b = s.join('B', 'b.t');
    await new Promise((r) => setTimeout(r, 0));
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    const r = s.room()!, w = r.world;
    s.run(3.1);
    s.lobby.disconnect(a.id);
    // Knocked out while away (as if shot): the match ends before the grace runs out.
    w.actors[0].hp = 0; w.actors[0].alive = false;
    s.run(0.2);
    const rec = s.lobby.result(r.id)!;
    expect(rec.players.find((p) => p.acc === 'A')).toMatchObject({ left: true, quit: true });
    expect(rec.players.find((p) => p.acc === 'B')).toMatchObject({ left: false, quit: false });
  });

  it('dropped while standing, knocked out before the grace runs out: a quit when it is removed', () => {
    const s = setup({ reconnectGraceSec: 1 });
    const ps = Array.from({ length: 6 }, (_, i) => s.join(`P${i}`));
    ps.forEach((p) => p.say({ t: 'queue', mode: '3v3' }));
    const r = s.room()!;
    s.run(3.1);
    s.lobby.disconnect(ps[0].id);
    r.world.actors[0].alive = false;
    s.run(1.2);
    expect(r.quit[0]).toBe(true);
  });
});

describe('P2-9 nothing pressed during the countdown fires at the start', () => {
  it('a tap of fire, reload and the ability before the start are dropped; the held stick still moves you', () => {
    const { join, run, room } = setup();
    const a = join('A'), b = join('B');
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    const w = room()!.world;
    const x0 = w.actors[0].x;
    run(1);
    a.say(input({ seq: 1, fire: true, ability: true, reload: true }));
    a.say(input({ seq: 2, mx: 1 }));
    run(2.3);
    const me = w.actors[0];
    expect(me.bullets).toBe(0);
    expect(me.abilityCd).toBe(0);
    expect(me.reloadLeft).toBe(0);
    expect(me.x).toBeGreaterThan(x0 + 0.5);
    expect(a.c.last('match')!.startsIn).toBeGreaterThan(2.9);
  });
});

describe('P2-11 matchmaking never starves solos behind a long head of squads', () => {
  it('13 duos waiting in 3v3, then two solos: a duo and a solo a side start at once', () => {
    const { join } = setup();
    const duo = () => {
      const l = join('L'), f = join('F');
      l.say({ t: 'party', op: 'create' });
      f.say({ t: 'party', op: 'join', code: l.c.last('party')!.code });
      return l;
    };
    for (let i = 0; i < 13; i++) duo().say({ t: 'queue', mode: '3v3' });
    const s1 = join('S1'), s2 = join('S2');
    s1.say({ t: 'queue', mode: '3v3' });
    s2.say({ t: 'queue', mode: '3v3' });
    expect(s1.c.last('match')).toBeDefined();
    expect(s2.c.last('match')!.room).toBe(s1.c.last('match')!.room);
  });
});

describe('P2-13 / one seat per Chog: tickets', () => {
  it('a ticket check that finishes after the player is in a match never swaps the ticket mid-match', async () => {
    let release: (t: GameTicket) => void = () => undefined;
    const s = setup({ checkTicket: () => new Promise<GameTicket>((r) => { release = r; }) });
    const a = s.join('A', 'slow.t'), b = s.join('B');
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    const r = s.room()!;
    release(T({ tid: 'late', acc: 'ACC', tier: 'legendary', holder: true, tok: 5, mid: 53 }));
    await new Promise((q) => setTimeout(q, 0));
    expect(r.members[0].ticket).toBeNull();
    expect(a.c.last('error')!.code).toBe('ticket-late');
  });

  it('the same Chog cannot hold two live seats; holders with different tokens are not affected', async () => {
    const tickets: Record<string, GameTicket> = {
      'a.t': T({ tid: 'a', acc: 'A1', holder: true, tok: 5, mid: 53 }), 'b.t': T({ tid: 'b', acc: 'A2', holder: true, tok: 5, mid: 53 }),
      'c.t': T({ tid: 'c', acc: 'A3', holder: true, tok: 6, mid: 54 }),
    };
    const s = setup({ checkTicket: async (k: string) => tickets[k] ?? null });
    const a = s.join('A', 'a.t'), b = s.join('B', 'b.t'), c = s.join('C', 'c.t');
    await new Promise((q) => setTimeout(q, 0));
    a.say({ t: 'queue', mode: '3v3' });
    b.say({ t: 'queue', mode: '3v3' });
    expect(b.c.last('error')!.code).toBe('token-in-use');
    c.say({ t: 'queue', mode: '3v3' });
    expect(c.c.last('queued')).toMatchObject({ have: 2 });
  });
});

// ---- client (src/net/client.ts) against a real Lobby ----
class FakeWS {
  static OPEN = 1; static CONNECTING = 0;
  readyState = 0; onopen: (() => void) | null = null; onclose: ((e: { code: number; reason: string }) => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {}
  send(m: string) { this.sent.push(m); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000, reason: '' }); }
}

async function clientPair(opts: Record<string, unknown> = {}) {
  vi.stubGlobal('WebSocket', FakeWS);
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('')));
  const s = setup(opts);
  const plug = async (name: string, store: Storage | null = null) => {
    const sess = new OnlineSession('ws://127.0.0.1:9/ws', () => name, () => 'benja', store);
    sess.connect();
    const ws = (sess as unknown as { ws: FakeWS }).ws;
    const id = s.lobby.connect({ send: (m) => ws.onmessage?.({ data: JSON.stringify(m) }), close: () => undefined });
    ws.send = (m: string) => { ws.sent.push(m); s.lobby.message(id, m); };
    ws.readyState = 1;
    ws.onopen?.();
    await new Promise((q) => setTimeout(q, 0));
    return { sess, id, ws };
  };
  return { ...s, plug, done: (...ss: OnlineSession[]) => { for (const x of ss) x.close(); vi.unstubAllGlobals(); } };
}

describe('client lifecycle', () => {
  it('P1-6 leaving a match drops it on the client, and the next queue reaches the server', async () => {
    const t = await clientPair();
    const a = await t.plug('A'), b = await t.plug('B');
    a.sess.joinQueue('1v1'); b.sess.joinQueue('1v1');
    expect(a.sess.state).toBe('match');
    t.run(3.2);
    a.sess.leave();
    expect(a.sess.state).toBe('idle');
    expect(a.sess.world).toBeNull();
    expect(a.sess.match).toBeNull();
    a.sess.joinQueue('1v1');
    expect(a.sess.state).toBe('queued');
    t.done(a.sess, b.sess);
  });

  it('P1-6 leaving while reconnecting stops the retries and the next queue is a fresh player, not a resume', async () => {
    const t = await clientPair();
    const a = await t.plug('A'), b = await t.plug('B');
    a.sess.joinQueue('1v1'); b.sess.joinQueue('1v1');
    t.run(3.2);
    (a.sess as unknown as { state: string }).state = 'reconnecting';
    a.sess.leave();
    expect(a.sess.state).toBe('offline');
    expect(a.sess.world).toBeNull();
    expect((a.sess as unknown as { token: string | null }).token).toBeNull();
    t.done(a.sess, b.sess);
  });

  it('P1-7 a cancelled match takes the client back to the lobby; P2-9 the countdown is known', async () => {
    const t = await clientPair();
    const a = await t.plug('A'), b = await t.plug('B');
    a.sess.joinQueue('1v1'); b.sess.joinQueue('1v1');
    expect(a.sess.startsIn()).toBeGreaterThan(2.5);
    b.sess.leave();
    expect(a.sess.state).toBe('idle');
    expect(a.sess.world).toBeNull();
    expect(a.sess.message).toMatch(/cancelled/i);
    expect(a.sess.startsIn()).toBe(0);
    t.done(a.sess, b.sess);
  });

  it('P2-12b a reloaded tab that resumes its match gets its profile', async () => {
    const t = await clientPair();
    const a = await t.plug('A'), b = await t.plug('B');
    a.sess.joinQueue('1v1'); b.sess.joinQueue('1v1');
    t.run(3.2);
    const token = (a.sess as unknown as { token: string }).token;
    t.lobby.disconnect(a.id);
    const store = { getItem: () => token, setItem: () => undefined, removeItem: () => undefined } as unknown as Storage;
    const again = await t.plug('A', store);
    expect(again.sess.state).toBe('match');
    expect(again.sess.profile).toMatchObject({ verified: false, tier: 'free' });
    t.done(a.sess, b.sess, again.sess);
  });

  it('EXTRA a "token in use" refusal puts a queued client back to idle with the message', () => {
    vi.stubGlobal('WebSocket', FakeWS);
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('')));
    const s = new OnlineSession('ws://127.0.0.1:9/ws', () => 'Tester', () => 'benja', null);
    const msg = (m: object) => (s as unknown as { onMsg(m: object): void }).onMsg(m);
    s.state = 'queued';
    msg({ t: 'error', code: 'token-in-use', message: 'That Chog is already in a queue or a match on another connection.' });
    expect(s.state).toBe('idle');
    expect(s.message).toMatch(/already in a queue/);
    vi.unstubAllGlobals();
  });
});

describe('U13 settle retry rule', () => {
  it('retries a missing answer or a passing outage, never a settled, unknown or bad match', () => {
    expect(settleRetryable(null)).toBe(true);
    expect(settleRetryable({ error: 'progression_offline' })).toBe(true);
    expect(settleRetryable({ error: 'game_server' })).toBe(true);
    expect(settleRetryable({ ok: true })).toBe(false);
    expect(settleRetryable({ error: 'unknown_match' })).toBe(false);
    expect(settleRetryable({ error: 'bad_record' })).toBe(false);
  });
});
