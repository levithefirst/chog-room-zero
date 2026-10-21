// Matchmaking end to end on the real Lobby (owner 2026-10-21: a tester reported 1v1 and 3v3 "looking for people"
// indefinitely). Guests connect, say hello and queue, as the client does; the server's own clock and tick decide.
// Covers: 1v1 and 3v3 on one location and on different ones (the location preference), every player in the one room
// on the right side, the match starting, a lone player told plainly when nobody comes, and the production origin list.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Lobby } from '../server/room';
import { PROTOCOL, type ServerMsg } from '../src/net/protocol';
import { TUNING } from '../src/config/tuning';

class FakeConn {
  got: ServerMsg[] = [];
  send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); }
  close() { /* closed */ }
  last<T extends ServerMsg['t']>(t: T) { return [...this.got].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined; }
}

function setup() {
  let t = 0;
  const lobby = new Lobby({ now: () => t, seed: () => 7 });
  const players: { c: FakeConn; say: (m: object) => void }[] = [];
  const join = (name: string) => {
    const c = new FakeConn();
    const id = lobby.connect(c);
    const say = (m: object) => lobby.message(id, JSON.stringify(m));
    say({ t: 'hello', v: PROTOCOL, name, hero: 'benja' });
    const p = { c, say };
    players.push(p);
    return p;
  };
  // The client pings every 2 s while it waits (src/net/client.ts); the server only seats sockets that spoke recently.
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      t += 1 / 60;
      if (i % 120 === 0) for (const p of players) p.say({ t: 'ping', at: t * 1000 });
      lobby.tick();
    }
  };
  return { lobby, join, run };
}

const roomsOf = (ps: { c: FakeConn }[]) => new Set(ps.map((p) => p.c.last('match')?.room));

describe('matchmaking (owner 2026-10-21 report: 1v1 / 3v3 stuck looking for people)', () => {
  it('1v1, same location: two guests are matched at once, into one room, on opposite sides, and the match starts', () => {
    const { join, run } = setup();
    const a = join('A'), b = join('B');
    a.say({ t: 'queue', mode: '1v1', map: 'office' });
    b.say({ t: 'queue', mode: '1v1', map: 'office' });
    const ma = a.c.last('match'), mb = b.c.last('match');
    expect(ma && mb).toBeTruthy();
    expect(ma!.room).toBe(mb!.room);
    expect(ma!.map).toBe('office');
    expect(ma!.team).not.toBe(mb!.team);
    expect(ma!.you).not.toBe(mb!.you);
    // The countdown runs out and snapshots flow: the match has started.
    run(TUNING.match.anyMapAfterSec);
    expect(a.c.last('snap')).toBeDefined();
    expect(b.c.last('snap')).toBeDefined();
  });

  it('1v1, different locations: told 2/2 while the preference holds, matched on the oldest pick once it lapses', () => {
    const { join, run } = setup();
    const a = join('A'), b = join('B');
    a.say({ t: 'queue', mode: '1v1', map: 'office' });
    run(1);
    b.say({ t: 'queue', mode: '1v1', map: 'metro' });
    expect(b.c.last('match')).toBeUndefined();
    expect(b.c.last('queued')).toMatchObject({ have: 2, need: 2 });
    run(TUNING.match.anyMapAfterSec + 1.5);
    expect(roomsOf([a, b]).size).toBe(1);
    expect(a.c.last('match')!.map).toBe('office');
  });

  it('3v3: six guests on three locations end up in one room, three a side, and the match starts', () => {
    const { join, run } = setup();
    const maps = ['room-zero', 'office', 'supermarket'] as const;
    const ps = Array.from({ length: 6 }, (_, i) => join(`P${i}`));
    ps.forEach((p, i) => p.say({ t: 'queue', mode: '3v3', map: maps[i % 3] }));
    run(TUNING.match.anyMapAfterSec + 1.5);
    expect(roomsOf(ps).size).toBe(1);
    const m = ps.map((p) => p.c.last('match')!);
    expect(m.every(Boolean)).toBe(true);
    expect(m.filter((x) => x.team === 'alpha')).toHaveLength(3);
    expect(m.filter((x) => x.team === 'bravo')).toHaveLength(3);
    expect(new Set(m.map((x) => x.you)).size).toBe(6);
    run(5);
    expect(ps.every((p) => p.c.last('snap'))).toBe(true);
  });

  it('3v3 with five players waits for the sixth, then starts with all six', () => {
    const { join, run } = setup();
    const ps = Array.from({ length: 5 }, (_, i) => join(`P${i}`));
    ps.forEach((p) => p.say({ t: 'queue', mode: '3v3', map: 'room-zero' }));
    run(20);
    expect(ps.some((p) => p.c.last('match'))).toBe(false);
    expect(ps[0].c.last('queued')).toMatchObject({ have: 5, need: 6 });
    const six = join('P5');
    six.say({ t: 'queue', mode: '3v3', map: 'metro' });
    run(TUNING.match.anyMapAfterSec + 1.5);
    expect(roomsOf([...ps, six]).size).toBe(1);
    expect(six.c.last('match')).toBeDefined();
  });

  it('a lone player is never left looking: the server says so plainly after its queue timeout', () => {
    const { join, run } = setup();
    const a = join('A');
    a.say({ t: 'queue', mode: '1v1', map: 'office' });
    run(91);
    expect(a.c.last('queueTimeout')).toBeDefined();
    expect(a.c.last('match')).toBeUndefined();
  });

  it('the game server accepts sockets from every address that serves the production game (render.yaml)', () => {
    const y = readFileSync(new URL('../render.yaml', import.meta.url), 'utf8');
    const origins = /key: ALLOWED_ORIGINS\s+value: (\S+)/.exec(y)![1].split(',');
    for (const o of ['https://chogroomzero.xyz', 'https://chog-room-zero-levithefirst-1227s-projects.vercel.app']) expect(origins).toContain(o);
    expect(origins.every((o) => /^https:\/\/[a-z0-9.-]+$/.test(o))).toBe(true); // exact origins, no wildcard
  });
});
