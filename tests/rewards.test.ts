// Owner 2026-10-17 "final test -> improve -> retest": players earn progression even when they lose. One rule
// (src/config/progression.ts rewardBreakdown) pays online matches (settled from the game server's record) and solo
// practice (ticketed, smaller, capped). A win always beats any loss, kills and damage are capped, and nothing pays twice.
import { beforeEach, describe, expect, it } from 'vitest';
import { handleGame, type Deps } from '../api/_lib/game-api';
import { SESSION_COOKIE, sign } from '../api/_lib/auth';
import { migrate, type Db } from '../api/_lib/db';
import { memoryDb } from './helpers/pglite';
import { accountFor, profileOf, settleMatch, buyUpgrade, type MatchRecord } from '../api/_lib/game';
import { PRACTICE_REWARDS, REWARDS, lossCeiling, rewardBreakdown, winFloor, type RewardFacts } from '../src/config/progression';
import { Lobby } from '../server/room';
import type { ServerMsg } from '../src/net/protocol';
import type { GameTicket } from '../api/_lib/game';
import { PROTOCOL } from '../src/net/protocol';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const HOST = 'chogroomzero.xyz';
let db: Db;
let clock = 1_800_000_000_000;
const deps = (): Deps => ({ env: { AUTH_SECRET: SECRET, AUTH_ORIGIN: `https://${HOST}` }, db: async () => ({ ...db, close: async () => undefined }), fetch: async () => new Response('{}', { status: 404 }), now: () => clock });
const cookie = async (subject: string) => `${SESSION_COOKIE}=${encodeURIComponent(await sign({ ids: [{ provider: 'google', subject, label: subject }], exp: Math.floor(clock / 1000) + 3600 }, SECRET))}`;
async function call(method: string, action: string, c?: string, body?: object) {
  const h = new Headers({ 'content-type': 'application/json', origin: `https://${HOST}` });
  if (c) h.set('cookie', c);
  const r = await handleGame(new Request(`https://${HOST}/api/game/${action}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), action, deps());
  return { status: r.status, j: (await r.json()) as Record<string, any> };
}
const facts = (o: Partial<RewardFacts> = {}): RewardFacts => ({ won: false, kills: 0, damage: 0, seconds: 60, leftEarly: false, capped: false, ...o });
const run = (o: Record<string, unknown> = {}) => ({ hero: 'benja', won: false, seconds: 60, kills: 2, bullets: 40, hits: 20, damageDealt: 260, damageTaken: 100, hpLeft: 0, pickups: 1, abilities: 1, ...o });

beforeEach(async () => { db = await memoryDb(); await migrate(db); clock = 1_800_000_000_000; });

describe('the reward rule', () => {
  it('online: a win always pays more than the best possible loss (shards and XP)', () => {
    for (const t of [REWARDS]) {
      expect(winFloor(t).shards).toBeGreaterThan(lossCeiling(t).shards);
      expect(winFloor(t).xp).toBeGreaterThan(lossCeiling(t).xp);
      // And the rule itself agrees with the two bounds.
      const bestLoss = rewardBreakdown(facts({ kills: 99, damage: 1e6 }), t), worstWin = rewardBreakdown(facts({ won: true }), t);
      expect(bestLoss.shards).toBe(lossCeiling(t).shards);
      expect(worstWin.shards).toBe(winFloor(t).shards);
      expect(worstWin.shards).toBeGreaterThan(bestLoss.shards);
    }
  });
  it('a loss is never empty: showing up pays, and fighting pays more than standing around', () => {
    const idle = rewardBreakdown(facts()), fought = rewardBreakdown(facts({ kills: 2, damage: 260 }));
    expect(idle.shards).toBe(REWARDS.shardsPlay);
    expect(idle.xp).toBe(REWARDS.xpPlay);
    expect(fought.shards).toBe(REWARDS.shardsPlay + 2 * REWARDS.shardsPerKill + 5);
    expect(fought.lines.map((l) => l.id)).toEqual(['played', 'kills', 'damage']);
  });
  it('kills and damage are capped per match, so farming one match tops out', () => {
    const a = rewardBreakdown(facts({ kills: 5, damage: 250 })), b = rewardBreakdown(facts({ kills: 500, damage: 1e7 }));
    expect(b.shards).toBe(a.shards);
    expect(b.xp).toBe(a.xp);
  });
  it('lines add up to the totals and the same facts always pay the same', () => {
    for (const f of [facts(), facts({ won: true, kills: 3, damage: 320 }), facts({ kills: 9 })]) {
      const r = rewardBreakdown(f);
      expect(r.lines.reduce((s, l) => s + l.shards, 0)).toBe(r.shards);
      expect(r.lines.reduce((s, l) => s + l.xp, 0)).toBe(r.xp);
      expect(rewardBreakdown(f)).toEqual(r);
    }
  });
  it('pays nothing for a quit, a short match, the daily cap, private rooms, demo, the lab or an unverified run', () => {
    const cases: [Partial<RewardFacts>, string][] = [[{ leftEarly: true }, 'left'], [{ seconds: 19 }, 'short'], [{ capped: true }, 'cap'], [{ private: true }, 'private'],
      [{ demo: true }, 'demo'], [{ lab: true }, 'lab'], [{ unverified: true }, 'unverified']];
    for (const [o, why] of cases) expect(rewardBreakdown(facts({ won: true, kills: 5, damage: 900, ...o }))).toEqual({ lines: [], xp: 0, shards: 0, none: why });
  });
});

const rec = (o: Partial<MatchRecord> & { players: MatchRecord['players'] }): MatchRecord => ({
  id: 'abcdef0123456789', mode: '3v3', demo: false, winner: 'alpha', reason: 'eliminated', seconds: 80, endedAt: 1_760_000_000, ...o,
});
const pl = (acc: string | null, team: string, extra: Partial<MatchRecord['players'][number]> = {}) =>
  ({ acc, team, tier: 'free' as const, tok: null, mid: null, own: null, kills: 0, damage: 0, left: false, ...extra });
const acct = async (s: string) => (await accountFor(db, [{ provider: 'google', subject: s, label: s }]))!;

describe('online settlement applies the rule from the server record', () => {
  it('pays every seat its own lines: the winner most, a fighting loser more than an idle one', async () => {
    const [w, l1, l2] = [await acct('w'), await acct('l1'), await acct('l2')];
    const r = await settleMatch(db, rec({ players: [pl(w, 'alpha', { kills: 1, damage: 120 }), pl(l1, 'bravo', { kills: 2, damage: 300 }), pl(l2, 'bravo')] }));
    expect(r.ok && r.players.map((p) => p.shards)).toEqual([
      REWARDS.shardsPlay + REWARDS.shardsWin + REWARDS.shardsPerKill + 2,
      REWARDS.shardsPlay + 2 * REWARDS.shardsPerKill + 5,
      REWARDS.shardsPlay,
    ]);
    expect(r.ok && r.players[0].lines!.map((x) => x.id)).toEqual(['played', 'win', 'kills', 'damage']);
    expect((await profileOf(db, l2))!.shards).toBe(REWARDS.shardsPlay);
  });
  it('a second settle pays nothing more and answers the same lines', async () => {
    const [a, b] = [await acct('a'), await acct('b')];
    const m = rec({ players: [pl(a, 'alpha', { kills: 2, damage: 200 }), pl(b, 'bravo')] });
    const first = await settleMatch(db, m);
    const again = await settleMatch(db, m);
    expect(again.ok && again.already).toBe(true);
    expect(again.ok && again.players.find((p) => p.acc === a)!.lines).toEqual(first.ok && first.players.find((p) => p.acc === a)!.lines);
    expect((await profileOf(db, a))!.shards).toBe(first.ok ? first.players.find((p) => p.acc === a)!.shards : -1);
    const ledger = await db.query<{ n: string }>(`SELECT count(*) AS n FROM room_zero.ledger WHERE account_id = $1`, [a]);
    expect(Number(ledger[0].n)).toBe(2); // one XP row, one shard row
  });
  it('a quit (left while standing) pays nothing; leaving after being knocked out keeps the loss reward', async () => {
    const [w, quitter, outThenLeft] = [await acct('w'), await acct('q'), await acct('o')];
    const r = await settleMatch(db, rec({ players: [pl(w, 'alpha'), pl(quitter, 'bravo', { left: true, quit: true, kills: 3 }), pl(outThenLeft, 'bravo', { left: true, quit: false, kills: 1 })] }));
    const by = (acc: string) => (r.ok ? r.players.find((p) => p.acc === acc)! : null)!;
    expect(by(quitter)).toMatchObject({ xp: 0, shards: 0, none: 'left' });
    expect(by(outThenLeft).shards).toBe(REWARDS.shardsPlay + REWARDS.shardsPerKill);
    // Older records without `quit`: any leaver counts as a quit (as before).
    const [x, y] = [await acct('x'), await acct('y')];
    const old = await settleMatch(db, rec({ id: '0123456789abcdef', players: [pl(x, 'alpha'), pl(y, 'bravo', { left: true })] }));
    expect(old.ok && old.players.find((p) => p.acc === y)!.shards).toBe(0);
  });
  it('private rooms: history only, no XP, shards, rating, wins or matches count (no win trading between friends)', async () => {
    const [a, b] = [await acct('pa'), await acct('pb')];
    const r = await settleMatch(db, rec({ private: true, players: [pl(a, 'alpha', { kills: 5, damage: 900 }), pl(b, 'bravo')] }));
    expect(r.ok && r.rewarded).toBe(false);
    expect(await profileOf(db, a)).toMatchObject({ xp: 0, shards: 0, rating: 1000, wins: 0, matches: 0 });
    expect(await db.query(`SELECT account_id FROM room_zero.match_players WHERE account_id = $1`, [a])).toHaveLength(1);
    expect(r.ok && r.players[0].none).toBe('private');
  });
  it('one account in two seats is paid once', async () => {
    const [a, b] = [await acct('twin'), await acct('other')];
    const r = await settleMatch(db, rec({ players: [pl(a, 'alpha', { kills: 1 }), pl(a, 'alpha', { kills: 1 }), pl(b, 'bravo')] }));
    expect(r.ok && r.players.filter((p) => p.acc === a).length).toBe(1);
    expect((await profileOf(db, a))!.matches).toBe(1);
  });
  it('kill farming never beats winning: a 5 kill, 900 damage loss earns less than a 0 kill win', async () => {
    const [w, farmer] = [await acct('win0'), await acct('farm')];
    await settleMatch(db, rec({ players: [pl(w, 'alpha'), pl(farmer, 'bravo', { kills: 5, damage: 900 })] }));
    expect((await profileOf(db, w))!.shards).toBeGreaterThan((await profileOf(db, farmer))!.shards);
  });
  it('rewards feed the upgrade system: a loser can buy the first rank after one match', async () => {
    const [a, b] = [await acct('ua'), await acct('ub')];
    await settleMatch(db, rec({ players: [pl(a, 'alpha'), pl(b, 'bravo')] }));
    expect(await buyUpgrade(db, b, 'vitality')).toMatchObject({ ok: true, rank: 1 });
  });
});

describe('practice rewards: ticketed, capped, paid once', () => {
  const start = async (c: string) => (await call('POST', 'practice-start', c)).j as { ok: boolean; ticket: string; runId: string };
  it('a ticketed run pays the practice table once the claimed time has passed; a repeat pays nothing', async () => {
    const c = await cookie('p1');
    const t = await start(c);
    expect(t.ok).toBe(true);
    clock += 61_000;
    const body = { ...run(), runId: t.runId, ticket: t.ticket };
    const a = await call('POST', 'practice', c, body);
    const want = rewardBreakdown({ won: false, kills: 2, damage: 260, seconds: 60, leftEarly: false, capped: false }, PRACTICE_REWARDS);
    expect(a.j.reward).toEqual({ xp: want.xp, shards: want.shards, lines: want.lines, none: null });
    expect(want.shards).toBeGreaterThan(0);
    const again = await call('POST', 'practice', c, body);
    expect(again.j).toMatchObject({ ok: true, already: true, reward: { xp: want.xp, shards: want.shards } });
    const p = (await call('GET', 'profile', c)).j.profile;
    expect(p).toMatchObject({ xp: want.xp, shards: want.shards, rating: 1000, matches: 0 });
  });
  it('practice pays 3 a run, 5 a kill (up to 5), 12 a clear (owner 2026-10-21), line by line', () => {
    expect([PRACTICE_REWARDS.shardsPlay, PRACTICE_REWARDS.shardsPerKill, PRACTICE_REWARDS.shardsWin]).toEqual([3, 5, 12]);
    const win = rewardBreakdown(facts({ won: true, kills: 3 }), PRACTICE_REWARDS);
    expect(win.lines.map((l) => [l.id, l.shards])).toEqual([['played', 3], ['win', 12], ['kills', 15]]);
    expect(win.shards).toBe(30);
    const loss = rewardBreakdown(facts({ kills: 2, damage: 260 }), PRACTICE_REWARDS);
    expect(loss.lines.map((l) => [l.id, l.shards])).toEqual([['played', 3], ['kills', 10], ['damage', 2]]);
    expect(loss.shards).toBe(15);
    // Kills past the cap pay nothing more; XP is unchanged by this pass.
    expect(rewardBreakdown(facts({ kills: 9 }), PRACTICE_REWARDS).shards).toBe(3 + 25);
    expect(win.xp).toBe(PRACTICE_REWARDS.xpPlay + PRACTICE_REWARDS.xpWin + 3 * PRACTICE_REWARDS.xpPerKill);
  });
  it('a win in practice pays more than a practice loss with the same kills and damage, and less than the same online win', () => {
    for (const k of [0, 1, 3, 5]) {
      const win = rewardBreakdown(facts({ won: true, kills: k, damage: 300 }), PRACTICE_REWARDS);
      const loss = rewardBreakdown(facts({ kills: k, damage: 300 }), PRACTICE_REWARDS);
      expect(win.shards - loss.shards).toBe(PRACTICE_REWARDS.shardsWin);
      expect(win.xp).toBeGreaterThan(loss.xp);
    }
    expect(rewardBreakdown(facts({ won: true }), PRACTICE_REWARDS).shards).toBeLessThan(rewardBreakdown(facts({ won: true })).shards);
  });
  it('refuses to pay a run that claims more time than passed, has no ticket, or carries another run or account', async () => {
    const c = await cookie('p2'), other = await cookie('p3');
    const t = await start(c);
    clock += 30_000; // claims 60 s after 30 s
    expect((await call('POST', 'practice', c, { ...run(), runId: t.runId, ticket: t.ticket })).j.reward.none).toBe('unverified');
    expect((await call('POST', 'practice', c, { ...run(), runId: 'no-ticket-run-1' })).j.reward.none).toBe('unverified');
    const t2 = await start(c);
    clock += 70_000;
    expect((await call('POST', 'practice', c, { ...run(), runId: 'swapped-run-id1', ticket: t2.ticket })).j.reward.none).toBe('unverified');
    const t3 = await start(c);
    clock += 70_000;
    expect((await call('POST', 'practice', other, { ...run(), runId: t3.runId, ticket: t3.ticket })).j.reward.none).toBe('unverified');
    expect((await call('GET', 'profile', c)).j.profile.shards).toBe(0);
  });
  it('an expired ticket pays nothing; demo power in practice pays nothing', async () => {
    const c = await cookie('p4');
    const t = await start(c);
    clock += 31 * 60_000;
    expect((await call('POST', 'practice', c, { ...run(), runId: t.runId, ticket: t.ticket })).j.reward.none).toBe('unverified');
    const d = await start(c);
    clock += 70_000;
    expect((await call('POST', 'practice', c, { ...run(), runId: d.runId, ticket: d.ticket, demo: true })).j.reward.none).toBe('demo');
  });
  it('the daily practice cap: runs beyond it are stored for the career and pay nothing', async () => {
    const c = await cookie('p5');
    const acc = (await call('GET', 'profile', c)).j.profile.account as string;
    for (let i = 0; i < PRACTICE_REWARDS.dailyCap; i++) {
      await db.query(`INSERT INTO room_zero.practice_runs (account_id, run_id, hero, won, seconds, kills, bullets, hits, damage_dealt, damage_taken, pickups, abilities, hp_left, xp, shards, created_at)
        VALUES ($1, $2, 'benja', false, 60, 0, 0, 0, 0, 0, 0, 0, 0, 20, 4, now() - interval '2 hours')`, [acc, `old-run-${i}-xx`]);
    }
    const t = await start(c);
    clock += 70_000;
    const r = await call('POST', 'practice', c, { ...run(), runId: t.runId, ticket: t.ticket });
    expect(r.j.reward.none).toBe('cap');
    expect(r.j.records.overall.runs).toBe(PRACTICE_REWARDS.dailyCap + 1);
  });
  it('a practice ticket is not a game ticket (separate keys): the game server refuses it', async () => {
    const t = await start(await cookie('p6'));
    expect((await call('POST', 'ticket-check', undefined, { ticket: t.ticket })).status).toBe(401);
  });
  it('practice-start needs a signed-in account and the site origin', async () => {
    expect((await call('POST', 'practice-start')).status).toBe(401);
  });
});

// ---- the game server marks private rooms and quits in the record it keeps for settlement ----
class FakeConn {
  got: ServerMsg[] = [];
  send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); }
  close() { /* closed */ }
  last<T extends ServerMsg['t']>(t: T) { return [...this.got].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined; }
}
const T = (o: Partial<GameTicket>): GameTicket => ({ tid: 'x', acc: null, tier: 'free', up: { vitality: 0, plating: 0, firepower: 0, focus: 0 }, tok: null, mid: null, tokTier: null, own: null, holder: false, demo: false, name: '', exp: 2e9, ...o });

describe('the game server record', () => {
  async function room(code?: string) {
    let t = 0;
    const tickets: Record<string, GameTicket> = { 'a.t': T({ tid: 'a', acc: 'A' }), 'b.t': T({ tid: 'b', acc: 'B' }) };
    const lobby = new Lobby({ now: () => t, seed: () => 7, checkTicket: async (s) => tickets[s] ?? null });
    const join = async (name: string, ticket: string) => {
      const c = new FakeConn();
      const id = lobby.connect(c);
      lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name, hero: 'benja', ticket }));
      await new Promise((r) => setTimeout(r, 0));
      return { c, say: (m: object) => lobby.message(id, JSON.stringify(m)) };
    };
    const a = await join('A', 'a.t'), b = await join('B', 'b.t');
    a.say({ t: 'queue', mode: '1v1', ...(code ? { code } : {}) }); b.say({ t: 'queue', mode: '1v1', ...(code ? { code } : {}) });
    return { lobby, a, b, run: (s: number) => { for (let i = 0; i < Math.round(s * 60); i++) { t += 1 / 60; lobby.tick(); } } };
  }
  it('a public match is not private; a quit while standing is marked', async () => {
    const { lobby, a, b, run } = await room();
    run(4);
    b.say({ t: 'leave' });
    run(0.1);
    const rec = lobby.result(a.c.last('over')!.matchId!)!;
    expect(rec.private).toBe(false);
    expect(rec.players.find((p) => p.acc === 'B')).toMatchObject({ left: true, quit: true });
    expect(rec.players.find((p) => p.acc === 'A')).toMatchObject({ left: false, quit: false });
  });
  it('a private code match is flagged private', async () => {
    const { lobby, a, b, run } = await room('FRIEND1');
    run(4); // past the countdown: a leave before the start voids the match (no record)
    b.say({ t: 'leave' });
    run(0.1);
    expect(lobby.result(a.c.last('over')!.matchId!)!.private).toBe(true);
  });
});
