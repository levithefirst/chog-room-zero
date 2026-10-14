// Master integration pass (owner 2026-10-14): squads. Form a squad with a code, queue together, always on the same
// team, back together after the match; solo queue unchanged; 5v5 still needs every member verified.
import { describe, expect, it } from 'vitest';
import { Lobby } from '../server/room';
import { parseClientMsg, PARTY_CODE, type ServerMsg } from '../src/net/protocol';
import type { GameTicket } from '../api/_lib/game';

class FakeConn {
  got: ServerMsg[] = [];
  send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); }
  close() { /* */ }
  last<T extends ServerMsg['t']>(t: T) { return [...this.got].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined; }
}
const T = (o: Partial<GameTicket>): GameTicket => ({ tid: 'x', acc: null, tier: 'free', up: { vitality: 0, plating: 0, firepower: 0, focus: 0 }, tok: null, mid: null, tokTier: null, own: null, holder: false, demo: false, name: '', exp: 2e9, ...o });

function setup(tickets: Record<string, GameTicket> = {}) {
  let t = 0;
  const lobby = new Lobby({ now: () => t, seed: () => 7, checkTicket: async (k) => tickets[k] ?? null });
  const join = async (name: string, ticket?: string) => {
    const c = new FakeConn();
    const id = lobby.connect(c);
    lobby.message(id, JSON.stringify({ t: 'hello', v: 1, name, hero: 'kettle', ticket }));
    await new Promise((r) => setTimeout(r, 0));
    return { c, id, say: (m: object) => lobby.message(id, JSON.stringify(m)) };
  };
  const run = (s: number) => { for (let i = 0; i < Math.round(s * 60); i++) { t += 1 / 60; lobby.tick(); } };
  return { lobby, join, run };
}

describe('squads', () => {
  it('validates squad messages', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'party', op: 'create' }))).toEqual({ t: 'party', op: 'create' });
    expect(parseClientMsg(JSON.stringify({ t: 'party', op: 'join', code: 'AB2CD' }))).toEqual({ t: 'party', op: 'join', code: 'AB2CD' });
    expect(parseClientMsg(JSON.stringify({ t: 'party', op: 'join', code: 'abc' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'party', op: 'kick' }))).toBeNull();
    expect(PARTY_CODE.test('IO0O1')).toBe(false);
  });
  it('create, join by code, both see the squad; only the leader queues', async () => {
    const { join } = setup();
    const a = await join('Lead'), b = await join('Mate');
    a.say({ t: 'party', op: 'create' });
    const code = a.c.last('party')!.code!;
    expect(code).toMatch(PARTY_CODE);
    b.say({ t: 'party', op: 'join', code });
    expect(a.c.last('party')!.members.map((m) => [m.name, m.leader, m.you])).toEqual([['Lead', true, true], ['Mate', false, false]]);
    expect(b.c.last('party')!.members.map((m) => m.you)).toEqual([false, true]);
    b.say({ t: 'queue', mode: '3v3' });
    expect(b.c.last('error')?.code).toBe('party-leader');
    b.say({ t: 'party', op: 'join', code: 'ZZZZZ' });
    expect(b.c.last('error')?.code).toBe('party-unknown');
  });
  it('a squad of 3 always lands on one team in 3v3, against solo players; then stays together', async () => {
    const { join, lobby, run } = setup();
    const a = await join('Ann'), b = await join('Bob'), c = await join('Cat');
    a.say({ t: 'party', op: 'create' });
    const code = a.c.last('party')!.code!;
    b.say({ t: 'party', op: 'join', code });
    c.say({ t: 'party', op: 'join', code });
    const solo = [await join('Sol1'), await join('Sol2')];
    for (const s of solo) s.say({ t: 'queue', mode: '3v3' });
    a.say({ t: 'queue', mode: '3v3' });
    expect(b.c.last('queued')).toMatchObject({ have: 5, need: 6 });
    const s3 = await join('Sol3');
    s3.say({ t: 'queue', mode: '3v3' });
    const m = a.c.last('match')!;
    const teamOf = (n: string) => m.roster.find((r) => r.name === n)!.team;
    expect(new Set(['Ann', 'Bob', 'Cat'].map(teamOf)).size).toBe(1);
    expect(new Set(['Sol1', 'Sol2', 'Sol3'].map(teamOf)).size).toBe(1);
    expect(teamOf('Ann')).not.toBe(teamOf('Sol1'));
    // Play it out: the solo side leaves, the match ends, the squad is still a squad and the leader can queue again.
    const room = [...lobby.rooms.values()][0];
    run(4);
    for (const s of [...solo, s3]) s.say({ t: 'leave' });
    run(0.1);
    expect(room.over).toBe(true);
    expect(a.c.last('party')!.members.every((x) => x.ready)).toBe(true);
    a.say({ t: 'queue', mode: '1v1' });
    expect(a.c.last('error')?.code).toBe('party-too-big');
  });
  it('a squad of 2 in 1v1 is too big; a squad leaving the queue takes everyone out', async () => {
    const { join } = setup();
    const a = await join('A'), b = await join('B');
    a.say({ t: 'party', op: 'create' });
    b.say({ t: 'party', op: 'join', code: a.c.last('party')!.code! });
    a.say({ t: 'queue', mode: '1v1' });
    expect(a.c.last('error')?.code).toBe('party-too-big');
    a.say({ t: 'queue', mode: '3v3' });
    expect(b.c.last('queued')).toMatchObject({ have: 2 });
    b.say({ t: 'party', op: 'leave' });
    expect(a.c.last('party')!.members.length).toBe(1);
    expect(a.c.last('queueTimeout')).toBeTruthy();
  });
  it('5v5: every squad member needs a verified Chog (enforced on the server)', async () => {
    const { join } = setup({ 'h.h': T({ tid: 'h', acc: 'H', holder: true, tok: 5, mid: 53, tokTier: 'legendary', tier: 'legendary' }) });
    const a = await join('Holder', 'h.h'), b = await join('Free');
    a.say({ t: 'party', op: 'create' });
    b.say({ t: 'party', op: 'join', code: a.c.last('party')!.code! });
    a.say({ t: 'queue', mode: '5v5' });
    expect(a.c.last('error')).toMatchObject({ code: 'holders-only' });
    expect(a.c.last('party')!.members[0]).toMatchObject({ holder: true, tier: 'legendary' });
  });
  it('solo queue is unchanged: two solo players still meet in 1v1', async () => {
    const { join } = setup();
    const a = await join('A'), b = await join('B');
    a.say({ t: 'queue', mode: '1v1' });
    b.say({ t: 'queue', mode: '1v1' });
    expect(a.c.last('match')!.room).toBe(b.c.last('match')!.room);
  });
});
