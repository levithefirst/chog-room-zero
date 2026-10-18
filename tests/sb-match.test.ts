// SB matchmaking (server/room.ts tryMatch, TUNING.match): like meets like, the bar drops with waiting, teams balanced,
// new accounts protected, private codes untouched. Real Lobby, fake sockets and clock, tickets from a fake checker.
import { describe, expect, it } from 'vitest';
import { Lobby } from '../server/room';
import { TUNING } from '../src/config/tuning';
import type { ServerMsg } from '../src/net/protocol';
import type { GameTicket } from '../api/_lib/game';

function setup() {
  let t = 0;
  const tickets = new Map<string, GameTicket>();
  const lobby = new Lobby({ now: () => t, seed: () => 3, checkTicket: async (k) => tickets.get(k) ?? null });
  const got = new Map<number, ServerMsg[]>();
  const ids: number[] = [];
  const join = async (name: string, rating?: number, played = 50, tier: GameTicket['tier'] = 'free') => {
    const key = `tk.${name}`;
    tickets.set(key, { tid: name, acc: rating === undefined ? null : `acc-${name}`, tier, up: { hp: 0, armor: 0, cooldown: 0 } as never, tok: null, mid: null, tokTier: null, own: null, holder: tier !== 'free', demo: false, name, exp: 1e12, ...(rating === undefined ? {} : { rating, played }) });
    const id = lobby.connect({ send: (m) => { const a = got.get(id) ?? []; a.push(m); got.set(id, a); }, close: () => undefined });
    lobby.message(id, JSON.stringify({ t: 'hello', v: 1, name, hero: 'benja', ticket: key }));
    ids.push(id);
    await new Promise((r) => setTimeout(r, 0));
    return { id, queue: (mode = '1v1', code?: string) => lobby.message(id, JSON.stringify({ t: 'queue', mode, ...(code ? { code } : {}) })), matched: () => (got.get(id) ?? []).some((m) => m.t === 'match') };
  };
  // Real clients ping every 2 s (the server drops a silent socket after 10 s); these do too.
  const wait = (s: number) => { for (let i = 0; i < Math.round(s * 60); i++) { t += 1 / 60; if (i % 120 === 0) for (const id of ids) lobby.message(id, JSON.stringify({ t: 'ping', at: t })); lobby.tick(); } };
  return { join, wait, lobby };
}

describe('like meets like', () => {
  it('a 1000 player meets the 1050 one, not the 1600 one that queued first', async () => {
    const { join } = setup();
    const top = await join('Top', 1600), a = await join('A', 1000), c = await join('C', 1050);
    top.queue(); a.queue(); c.queue();
    expect(a.matched() && c.matched()).toBe(true);
    expect(top.matched()).toBe(false);
  });
  it('the bar drops with waiting: a 1000 and a 1600 alone in the queue meet after (600 - band) / widen seconds', async () => {
    const { join, wait } = setup();
    const a = await join('A', 1000), b = await join('B', 1600);
    a.queue(); b.queue();
    const need = (600 - TUNING.match.band) / TUNING.match.widenPerSec;
    wait(need - 1.5);
    expect(a.matched()).toBe(false);
    wait(2.5);
    expect(a.matched() && b.matched()).toBe(true);
  });
  it('a new account (under newMatches saved matches) rates no higher than the start: it does not meet a 1400 main at once', async () => {
    const { join } = setup();
    const smurf = await join('New', 1400, 1), main = await join('Main', 1400), fresh = await join('Fresh', 1000, 0);
    main.queue(); smurf.queue(); fresh.queue();
    expect(smurf.matched() && fresh.matched()).toBe(true);
    expect(main.matched()).toBe(false);
  });
  it('a Chog tier adds nothing to matching strength (owner 2026-10-18: no rarity stats; a superpower is a sidegrade)', () => {
    for (const t of ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const) {
      expect(Lobby.strength({ ticket: { rating: 1000, played: 40, tier: t } as GameTicket }), t).toBe(1000);
      expect(TUNING.match.tierStrength[t], t).toBe(0);
    }
    expect(Lobby.strength({ ticket: null })).toBe(1000);
  });
  it('a fresh free player meets a 1:1 of the same rating at once; a far higher rating still waits for the band', async () => {
    const { join, wait } = setup();
    // Equal ratings meet at once whatever their Chog: rating decides, rarity does not.
    const one = await join('One', 1000, 50, 'legendary'), fresh = await join('Fresh', 1000);
    one.queue(); fresh.queue();
    expect(one.matched() && fresh.matched()).toBe(true);
    // A 1600 player still waits for the band to widen before meeting a 1000 one, holder or not.
    const top = await join('Top', 1600, 50, 'epic'), low = await join('Low', 1000, 50, 'common');
    top.queue(); low.queue();
    expect(top.matched() || low.matched()).toBe(false);
    wait((600 - TUNING.match.band) / TUNING.match.widenPerSec + 1);
    expect(top.matched() && low.matched()).toBe(true);
  });
  it('3v3: the two sides are balanced, not the strong half against the weak half', async () => {
    const { join, lobby } = setup();
    const rs = [1000, 1010, 1100, 1110, 1020, 1090];
    const ps = [];
    for (const [i, r] of rs.entries()) ps.push(await join(`P${i}`, r));
    for (const p of ps) p.queue('3v3');
    expect(ps.every((p) => p.matched())).toBe(true);
    const room = [...(lobby as unknown as { rooms: Map<string, { members: { ticket: GameTicket | null }[]; world: { actors: { team: string }[] } }> }).rooms.values()][0];
    const mean = (team: string) => { const m = room.members.filter((_, i) => room.world.actors[i].team === team); return m.reduce((a, p) => a + Lobby.strength(p), 0) / m.length; };
    expect(Math.abs(mean('alpha') - mean('bravo'))).toBeLessThanOrEqual(TUNING.match.band * TUNING.match.teamGapShare);
  });
  it('a private room code ignores ratings: friends play who they invite', async () => {
    const { join } = setup();
    const a = await join('A', 900), b = await join('B', 1700);
    a.queue('1v1', 'FRIEND'); b.queue('1v1', 'FRIEND');
    expect(a.matched() && b.matched()).toBe(true);
  });
  it('guests (no ticket rating) play at the start rating and still meet each other at once', async () => {
    const { join } = setup();
    const a = await join('G1'), b = await join('G2');
    a.queue(); b.queue();
    expect(a.matched() && b.matched()).toBe(true);
  });
});
