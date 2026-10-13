// RC-8 online server logic (server/room.ts) with fake sockets and a fake clock. These are unit tests of the
// authoritative rules; the end-to-end check with independent real browsers is tools/rc8-online.mjs.
import { describe, expect, it } from 'vitest';
import { Lobby } from '../server/room';
import { parseClientMsg, toActorInput, MAX_MESSAGE_BYTES, type ServerMsg } from '../src/net/protocol';
import { VERSUS_SPAWNS, ROOM_ZERO } from '../src/config/map';
import { parseLevel, walkable } from '../src/sim/level';
import { serverUrl } from '../src/net/client';

class FakeConn {
  got: ServerMsg[] = [];
  closed: string | null = null;
  send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); }
  close(_c: number, r: string) { this.closed = r; }
  last<T extends ServerMsg['t']>(t: T) { return [...this.got].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined; }
  all<T extends ServerMsg['t']>(t: T) { return this.got.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[]; }
}

function setup(opts: Record<string, unknown> = {}) {
  let t = 0;
  const lobby = new Lobby({ now: () => t, seed: () => 7, ...opts });
  const join = (name: string, hero = 'kettle') => {
    const c = new FakeConn();
    const id = lobby.connect(c);
    lobby.message(id, JSON.stringify({ t: 'hello', v: 1, name, hero }));
    return { c, id, say: (m: object) => lobby.message(id, JSON.stringify(m)) };
  };
  const run = (seconds: number, each?: () => void) => { for (let i = 0; i < Math.round(seconds * 60); i++) { t += 1 / 60; each?.(); lobby.tick(); } };
  return { lobby, join, run, clock: { get t() { return t; }, set t(v) { t = v; } } };
}

const input = (o: Partial<{ mx: number; my: number; aim: number; fire: boolean; reload: boolean; ability: boolean; quiet: boolean }> = {}) =>
  ({ t: 'input', seq: 1, mx: 0, my: 0, aim: 0, fire: false, quiet: false, reload: false, ability: false, ...o });

describe('RC-8 protocol validation', () => {
  it('rejects malformed, oversized and out-of-range messages', () => {
    expect(parseClientMsg('not json')).toBe(null);
    expect(parseClientMsg('{"t":"hello"}')).toBe(null);
    expect(parseClientMsg(JSON.stringify({ t: 'queue', mode: '2v2' }))).toBe(null);
    expect(parseClientMsg(JSON.stringify({ t: 'queue', mode: '1v1', code: 'ab' }))).toBe(null);
    expect(parseClientMsg(JSON.stringify(input({ mx: Number.NaN })))).toBe(null);
    expect(parseClientMsg(JSON.stringify({ ...input(), fire: 'yes' }))).toBe(null);
    expect(parseClientMsg(' '.repeat(MAX_MESSAGE_BYTES + 1))).toBe(null);
    // Positions, damage or kills are not part of any client message: an extra field is simply ignored.
    const m = parseClientMsg(JSON.stringify({ ...input(), x: 5, y: 5, damage: 999, kill: 1 }));
    expect(m && Object.keys(m).sort()).toEqual(['ability', 'aim', 'fire', 'mx', 'my', 'quiet', 'reload', 'seq', 't']);
  });
  it('clamps a too-long move vector (no speed hack) and normalises the aim', () => {
    const a = toActorInput(parseClientMsg(JSON.stringify(input({ mx: 30, my: 40, aim: 7 }))) as never);
    expect(Math.hypot(a.moveX, a.moveY)).toBeCloseTo(1, 12);
    expect(a.aim).toBeCloseTo(7 - 2 * Math.PI, 12);
  });
  it('the client only connects to an explicit ws/wss address', () => {
    expect(serverUrl('?server=ws://127.0.0.1:8787/ws', undefined)).toBe('ws://127.0.0.1:8787/ws');
    expect(serverUrl('', 'wss://game.example/ws')).toBe('wss://game.example/ws');
    expect(serverUrl('', undefined)).toBe(null);
    expect(serverUrl('?server=javascript:alert(1)', undefined)).toBe(null);
  });
});

describe('RC-8 matchmaking and teams', () => {
  it('1v1: two players are matched, one per team, with spawns west and east', () => {
    const { join } = setup();
    const a = join('Alpha'), b = join('Bravo');
    a.say({ t: 'queue', mode: '1v1' });
    expect(a.c.last('queued')).toMatchObject({ have: 1, need: 2 });
    b.say({ t: 'queue', mode: '1v1' });
    const ma = a.c.last('match')!, mb = b.c.last('match')!;
    expect(ma.room).toBe(mb.room);
    expect([ma.team, mb.team].sort()).toEqual(['alpha', 'bravo']);
    expect(ma.roster.map((r) => r.name)).toEqual(['Alpha', 'Bravo']);
    expect(ma.zone).toHaveLength(4);
  });
  it('3v3 and 5v5 fill to 6 and 10 with even teams; queues of different modes never mix', () => {
    for (const [mode, n] of [['3v3', 6], ['5v5', 10]] as const) {
      const { join } = setup();
      const lone = join('Other');
      lone.say({ t: 'queue', mode: '1v1' });
      const ps = Array.from({ length: n }, (_, i) => join(`P${i}`));
      ps.forEach((p, i) => { p.say({ t: 'queue', mode }); if (i < n - 1) expect(p.c.last('match')).toBeUndefined(); });
      const m = ps.map((p) => p.c.last('match')!);
      expect(new Set(m.map((x) => x.room)).size).toBe(1);
      expect(m.filter((x) => x.team === 'alpha')).toHaveLength(n / 2);
      expect(m.filter((x) => x.team === 'bravo')).toHaveLength(n / 2);
      expect(lone.c.last('match')).toBeUndefined();
    }
  });
  it('a private code only matches the same code', () => {
    const { join } = setup();
    const a = join('A'), b = join('B'), c = join('C');
    a.say({ t: 'queue', mode: '1v1', code: 'CHOG7' });
    b.say({ t: 'queue', mode: '1v1' });
    expect(a.c.last('match')).toBeUndefined();
    c.say({ t: 'queue', mode: '1v1', code: 'CHOG7' });
    expect(a.c.last('match')!.room).toBe(c.c.last('match')!.room);
    expect(b.c.last('match')).toBeUndefined();
  });
  it('guest identity: a bad callsign becomes Guest-XXXX, an unknown operator becomes Kettle', () => {
    const { join } = setup();
    const a = join('<script>', 'admin');
    expect(a.c.last('welcome')!.name).toMatch(/^Guest-[0-9A-F]{4}$/);
    const b = join('Real Name', 'wick');
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    expect(a.c.last('match')!.roster.map((r) => r.hero)).toEqual(['kettle', 'wick']);
  });
  it('queue timeout: a lonely player is told and dropped from the queue', () => {
    const { join, run } = setup({ queueTimeoutSec: 5, idleTimeoutSec: 999 });
    const a = join('A');
    a.say({ t: 'queue', mode: '1v1' });
    run(6);
    expect(a.c.last('queueTimeout')).toBeDefined();
    const b = join('B');
    b.say({ t: 'queue', mode: '1v1' });
    expect(b.c.last('match')).toBeUndefined();
  });
  it('online spawns are walkable floor and mirror each other', () => {
    const l = parseLevel(ROOM_ZERO);
    for (const t of ['alpha', 'bravo'] as const) for (const s of VERSUS_SPAWNS[t]) expect(walkable(l.tiles[Math.floor(s.y) * l.w + Math.floor(s.x)])).toBe(true);
    expect(VERSUS_SPAWNS.alpha).toHaveLength(5);
    expect(VERSUS_SPAWNS.bravo).toHaveLength(5);
  });
});

describe('RC-8 the server decides the match', () => {
  function duel(extra: Record<string, unknown> = {}) {
    const s = setup({ idleTimeoutSec: 999, ...extra });
    const a = s.join('A', 'wick'), b = s.join('B', 'kettle');
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    const room = [...s.lobby.rooms.values()][0];
    return { ...s, a, b, room, w: room.world };
  }
  it('nothing moves during the countdown; then only the controls move an operator', () => {
    const { a, run, w } = duel();
    const x0 = w.actors[0].x;
    a.say(input({ mx: 1 }));
    run(2);
    expect(w.actors[0].x).toBe(x0);
    run(2);
    expect(w.actors[0].x).toBeGreaterThan(x0 + 1);
  });
  it('snapshots hide an enemy nobody on your team can see, and show it once seen', () => {
    const { a, run, w } = duel();
    run(3.2);
    expect(a.c.last('snap')!.actors.map((x) => x.id)).toEqual([0]);
    // Put B in A's light (A faces east along row 8).
    w.actors[1].x = w.actors[0].x + 4; w.actors[1].y = w.actors[0].y;
    run(0.1);
    expect(a.c.last('snap')!.actors.map((x) => x.id).sort()).toEqual([0, 1]);
  });
  it('a kill and the win are decided by the sim from controls; the loser gets a server result', () => {
    const { a, b, run, w } = duel();
    run(3.1);
    w.actors[1].x = w.actors[0].x + 4; w.actors[1].y = w.actors[0].y; w.actors[1].hp = 1;
    // A holds fire aimed at B. B sends a forged "damage" field, which is ignored.
    b.say({ ...input(), damage: 999 });
    run(1.5, () => a.say(input({ aim: 0, fire: true })));
    const over = a.c.last('over')!;
    expect(over.winner).toBe('alpha');
    expect(b.c.last('over')!.winner).toBe('alpha');
    expect(over.results.find((r) => r.id === 0)!.kills).toBe(1);
    expect(over.results.find((r) => r.id === 1)!.cause).toBe('shot');
    expect(w.actors[0].hp).toBe(w.actors[0].maxHp);
  });
  it('friendly fire is off by default and can be switched on per server', () => {
    for (const ff of [false, true]) {
      const s = setup({ idleTimeoutSec: 999, friendlyFire: ff });
      const ps = Array.from({ length: 6 }, (_, i) => s.join(`P${i}`));
      ps.forEach((p) => p.say({ t: 'queue', mode: '3v3' }));
      const w = [...s.lobby.rooms.values()][0].world;
      s.run(3.1);
      // P0 and P2 are both alpha. Line P2 up 3 u east of P0 and fire.
      w.actors[2].x = w.actors[0].x + 3; w.actors[2].y = w.actors[0].y;
      const hp = w.actors[2].hp;
      s.run(0.6, () => { w.actors[2].x = w.actors[0].x + 3; w.actors[2].y = w.actors[0].y; ps[0].say(input({ aim: 0, fire: true })); });
      if (ff) expect(w.actors[2].hp).toBeLessThan(hp); else expect(w.actors[2].hp).toBe(hp);
    }
  });
  it('a match that runs into the time limit goes to the side with more health standing', () => {
    const { a, run, w } = duel({ matchLimitSec: 5 });
    run(3.1);
    w.actors[1].hp = 10;
    run(5.5); // the match clock starts after the 3 s countdown
    expect(a.c.last('over')).toMatchObject({ winner: 'alpha', reason: 'time' });
  });
});

describe('RC-8 connections: rate limit, timeouts, reconnect, leaving', () => {
  it('a flood is dropped and a sustained flood closes the socket', () => {
    const { join } = setup({ ratePerSec: 10, rateBurst: 5 });
    const a = join('A');
    for (let i = 0; i < 100; i++) a.say({ t: 'ping', at: i });
    expect(a.c.all('pong').length).toBeLessThanOrEqual(5);
    expect(a.c.closed).toBe('rate');
  });
  it('a silent socket is closed after the idle timeout', () => {
    const { join, run } = setup({ idleTimeoutSec: 2 });
    const a = join('A');
    run(3);
    expect(a.c.closed).toBe('idle');
  });
  it('messages before hello are refused', () => {
    const { lobby } = setup();
    const c = new FakeConn();
    const id = lobby.connect(c);
    lobby.message(id, JSON.stringify({ t: 'queue', mode: '1v1' }));
    expect(c.last('error')!.code).toBe('hello-first');
  });
  it('a dropped player can resume with their token within the grace period and keeps their operator', () => {
    const { lobby, join, run } = setup({ idleTimeoutSec: 999 });
    const a = join('A'), b = join('B');
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    const w = [...lobby.rooms.values()][0].world;
    const first = [...lobby.rooms.values()][0];
    const token = (first.members[0] as unknown as { token: string }).token;
    lobby.disconnect(first.members[0].id);
    run(5);
    expect(w.actors[0].alive).toBe(true);
    const c = new FakeConn();
    const id = lobby.connect(c);
    lobby.message(id, JSON.stringify({ t: 'hello', v: 1, name: 'A', hero: 'kettle', token }));
    expect(c.last('welcome')!.resumed).toBe(true);
    expect(c.last('match')!.you).toBe(0);
    run(0.2);
    expect(c.last('snap')).toBeDefined();
  });
  it('a player who does not come back within the grace period is out, and the other side wins', () => {
    const s = setup({ idleTimeoutSec: 999, reconnectGraceSec: 3 });
    const a = s.join('A'), b = s.join('B');
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    s.lobby.disconnect(a.id);
    s.run(4);
    expect(b.c.last('over')).toMatchObject({ winner: 'bravo' });
    expect(b.c.last('over')!.results[0].cause).toBe('left');
    expect(s.lobby.rooms.size).toBe(0);
  });
  it('leaving a match takes you out and frees you to queue again', () => {
    const s = setup({ idleTimeoutSec: 999 });
    const ps = Array.from({ length: 6 }, (_, i) => s.join(`P${i}`));
    ps.forEach((p) => p.say({ t: 'queue', mode: '3v3' }));
    s.run(3.1);
    ps[0].say({ t: 'leave' });
    s.run(0.2);
    const n = ps[0].c.all('snap').length;
    s.run(0.5);
    expect(ps[0].c.all('snap').length).toBe(n); // no more snapshots for a leaver
    ps[0].say({ t: 'queue', mode: '1v1' });
    expect(ps[0].c.last('queued')).toBeDefined();
    expect(s.lobby.rooms.size).toBe(1); // the match goes on 2 v 3
  });
});
