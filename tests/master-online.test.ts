// Stage D on the game server: tickets on hello, holder-only 5v5, isolated demo queues, power from the ticket, and the
// match record kept for settlement.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Lobby } from '../server/room';
import type { ServerMsg } from '../src/net/protocol';
import type { GameTicket } from '../api/_lib/game';
import { HEROES } from '../src/config/heroes';
import { PROTOCOL } from '../src/net/protocol';

class FakeConn {
  got: ServerMsg[] = [];
  send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); }
  close() { /* closed */ }
  last<T extends ServerMsg['t']>(t: T) { return [...this.got].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined; }
}

const T = (o: Partial<GameTicket>): GameTicket => ({ tid: 'x', acc: null, tier: 'free', up: { vitality: 0, plating: 0, firepower: 0, focus: 0 }, tok: null, mid: null, tokTier: null, own: null, holder: false, demo: false, name: '', exp: 2e9, ...o });
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(tickets: Record<string, GameTicket | null>) {
  let t = 0;
  const lobby = new Lobby({ now: () => t, seed: () => 7, checkTicket: async (s) => tickets[s] ?? null });
  const join = async (name: string, ticket?: string) => {
    const c = new FakeConn();
    const id = lobby.connect(c);
    lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name, hero: 'benja', ticket }));
    await flush();
    return { c, id, say: (m: object) => lobby.message(id, JSON.stringify(m)) };
  };
  const run = (s: number) => { for (let i = 0; i < Math.round(s * 60); i++) { t += 1 / 60; lobby.tick(); } };
  return { lobby, join, run };
}
afterEach(() => { vi.useRealTimers(); });

describe('tickets on hello', () => {
  it('a checked ticket is reported back; a bad one plays free with a note', async () => {
    const { join } = setup({ 'good.t': T({ tid: 'g', acc: 'A', holder: true, tok: 5, mid: 53, tokTier: 'legendary' }) });
    const g = await join('G', 'good.t');
    expect(g.c.last('welcome')!.profile).toMatchObject({ verified: true, holder: true, metadataId: 53, note: null });
    const b = await join('B', 'bad.t');
    expect(b.c.last('welcome')!.profile).toMatchObject({ verified: false, holder: false, tier: 'free' });
    expect(b.c.last('welcome')!.profile!.note).toMatch(/could not be checked/);
  });
  it('a ticket opens one connection only, and an account plays on one connection at a time', async () => {
    const { join } = setup({ 'a.t': T({ tid: 'same', acc: 'A', holder: true }), 'b.t': T({ tid: 'other', acc: 'A', holder: true }) });
    await join('One', 'a.t');
    const replay = await join('Two', 'a.t');
    expect(replay.c.last('welcome')!.profile).toMatchObject({ verified: false });
    expect(replay.c.last('welcome')!.profile!.note).toMatch(/already used/);
    const twin = await join('Three', 'b.t');
    expect(twin.c.last('welcome')!.profile!.note).toMatch(/another connection/);
  });
  it('a ticket check that never answers fails closed after 5 s', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby({ now: () => 0, seed: () => 7, checkTicket: () => new Promise(() => undefined) });
    const c = new FakeConn();
    const id = lobby.connect(c);
    lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: 'Slow', hero: 'benja', ticket: 'slow.t' }));
    expect(c.last('welcome')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5100);
    expect(c.last('welcome')!.profile).toMatchObject({ verified: false, tier: 'free' });
  });
});

describe('5v5 is for verified holders, enforced on the server', () => {
  it('guests and non-holders are refused; holders queue', async () => {
    const { join } = setup({ 'h.t': T({ tid: 'h', acc: 'H', holder: true }), 'n.t': T({ tid: 'n', acc: 'N' }) });
    const guest = await join('Guest');
    guest.say({ t: 'queue', mode: '5v5' });
    expect(guest.c.last('error')!.code).toBe('holders-only');
    const signedIn = await join('Signed', 'n.t');
    signedIn.say({ t: 'queue', mode: '5v5' });
    expect(signedIn.c.last('error')!.code).toBe('holders-only');
    const holder = await join('Holder', 'h.t');
    holder.say({ t: 'queue', mode: '5v5' });
    expect(holder.c.last('queued')).toMatchObject({ mode: '5v5', have: 1, need: 10 });
    guest.say({ t: 'queue', mode: '3v3' });
    expect(guest.c.last('queued')).toMatchObject({ mode: '3v3' });
  });
  it('demo tokens never meet real players', async () => {
    const { join } = setup({ 'd.t': T({ tid: 'd', demo: true, tier: 'epic', mid: 20 }) });
    const demo = await join('Demo', 'd.t');
    const real = await join('Real');
    demo.say({ t: 'queue', mode: '1v1' });
    real.say({ t: 'queue', mode: '1v1' });
    expect(demo.c.last('match')).toBeUndefined();
    expect(real.c.last('match')).toBeUndefined();
  });
});

describe('power from the ticket, visible to both sides, and the match record', () => {
  it('applies the ticket tier, shows it in the roster, and keeps a record for settlement', async () => {
    const { join, run, lobby } = setup({
      'a.t': T({ tid: 'a', acc: 'ACC_A', holder: true, tier: 'legendary', tok: 5, mid: 1376, tokTier: 'legendary', own: '0xA' }),
      'b.t': T({ tid: 'b', acc: 'ACC_B', tier: 'free', up: { vitality: 3, plating: 0, firepower: 0, focus: 0 } }),
    });
    const a = await join('A', 'a.t'), b = await join('B', 'b.t');
    a.say({ t: 'queue', mode: '1v1' }); b.say({ t: 'queue', mode: '1v1' });
    // Same rating: a 1:1 adds no matchmaking strength (owner 2026-10-18: no rarity stats), so they meet.
    for (let i = 0; i < 30 && !a.c.last('match'); i++) { a.say({ t: 'ping', at: i }); b.say({ t: 'ping', at: i }); run(1); }
    const m = a.c.last('match')!;
    expect(m.roster.map((r) => [r.tier, r.holder, r.ability.name])).toEqual([['legendary', true, 'Red Rush'], ['free', false, 'Ping']]);
    expect(b.c.last('match')!.roster[0].tier).toBe('legendary');
    const room = [...lobby.rooms.values()][0];
    const kettle = HEROES.find((h) => h.id === 'benja')!;
    // The ticket's tier brings the 1:1's signature, never rarity health; a Chog without a mapped superpower (a 1:1 among
    // them) has the CHOG baseline of 200 (owner 2026-10-18 IDENTITY pass); upgrades still count (actor 1).
    expect(room.world.actors[0].maxHp).toBe(200);
    expect(room.world.actors[1].maxHp).toBe(kettle.maxHp + 30); // Vitality 3: +10 health a rank (owner 2026-10-23)
    run(3.1); // past the countdown: a leave before the start voids the match (no record)
    b.say({ t: 'leave' });
    run(0.1);
    const over = a.c.last('over')!;
    expect(over.settle).toBe(true);
    const rec = lobby.result(over.matchId!)!;
    expect(rec).toMatchObject({ id: over.matchId, mode: '1v1', demo: false, winner: 'alpha' });
    expect(rec.players).toEqual([
      expect.objectContaining({ acc: 'ACC_A', tier: 'legendary', tok: 5, mid: 1376, own: '0xA', left: false }),
      expect.objectContaining({ acc: 'ACC_B', tier: 'free', tok: null, left: true }),
    ]);
    expect(lobby.result('0000000000000000')).toBeNull();
  });
});
