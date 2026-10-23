// Stage C: migrations, accounts, upgrades with shards, idempotent settlement, rating, token history (PGlite).
import { beforeEach, describe, expect, it } from 'vitest';
import { memoryDb } from './helpers/pglite';
import { MIGRATIONS, migrate, type Db } from '../api/_lib/db';
import { accountFor, buyUpgrade, checkTicket, issueTicket, leaderboard, profileOf, settleMatch, ticketSecret, tokenHistory, type MatchRecord } from '../api/_lib/game';
import { REWARDS, levelOf, matchRewards } from '../src/config/progression';
import { NO_UPGRADES } from '../src/config/power';

let db: Db;
beforeEach(async () => { db = await memoryDb(); await migrate(db); });

const g = (s: string) => ({ provider: 'google' as const, subject: s, label: s });
const wal = (s: string) => ({ provider: 'wallet' as const, subject: s, label: s });
const rec = (o: Partial<MatchRecord> & { players: MatchRecord['players'] }): MatchRecord => ({
  id: 'abcdef0123456789', mode: '1v1', demo: false, winner: 'alpha', reason: 'eliminated', seconds: 60, endedAt: 1_760_000_000, ...o,
});
const pl = (acc: string | null, team: string, extra: Partial<MatchRecord['players'][number]> = {}) =>
  ({ acc, team, tier: 'free' as const, tok: null, mid: null, own: null, kills: 1, damage: 100, left: false, ...extra });

describe('migrations', () => {
  it('are versioned, recorded once, and re-running changes nothing', async () => {
    expect(await migrate(db)).toEqual([]);
    const v = await db.query<{ version: number }>('SELECT version FROM room_zero.schema_migrations');
    expect(v.map((r) => r.version)).toEqual(MIGRATIONS.map((m) => m.version));
  });
  it('preserve existing rows (additive only: no DROP, TRUNCATE or DELETE anywhere)', async () => {
    const acc = await accountFor(db, [g('keep')]);
    await migrate(db);
    expect((await profileOf(db, acc!))?.account).toBe(acc);
    for (const m of MIGRATIONS) expect(m.sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
  });
  it('keep everything in schema room_zero (never touches public)', async () => {
    const t = await db.query<{ table_schema: string }>(`SELECT DISTINCT table_schema FROM information_schema.tables WHERE table_name IN ('accounts','ledger','matches')`);
    expect(t.map((r) => r.table_schema)).toEqual(['room_zero']);
  });
});

describe('accounts', () => {
  it('one account per person: identities link to it, and another session with either identity finds it', async () => {
    const a = await accountFor(db, [g('alice')]);
    const b = await accountFor(db, [g('alice'), wal('0xA')]);
    expect(b).toBe(a);
    expect(await accountFor(db, [wal('0xA')])).toBe(a);
    expect(await accountFor(db, [g('bob')])).not.toBe(a);
    expect(await accountFor(db, [])).toBeNull();
  });
  it('new accounts start at level 1, 0 shards, rating 1000, no upgrades', async () => {
    const p = await profileOf(db, (await accountFor(db, [g('new')]))!);
    expect(p).toMatchObject({ xp: 0, level: 1, shards: 0, rating: 1000, upgrades: NO_UPGRADES });
  });
});

describe('upgrades', () => {
  it('cost shards, rise one rank at a time, stop at the cap, and refuse without shards', async () => {
    const acc = (await accountFor(db, [g('u')]))!;
    // Owner 2026-10-23: Firepower has 7 ranks at 300 ... 1500 (6,300 in all).
    await db.query('UPDATE room_zero.accounts SET shards = 7000 WHERE id = $1', [acc]);
    expect(await buyUpgrade(db, acc, 'firepower')).toEqual({ ok: true, rank: 1, shards: 6700 });
    for (let i = 2; i <= 7; i++) expect(await buyUpgrade(db, acc, 'firepower')).toMatchObject({ ok: true, rank: i });
    expect(await buyUpgrade(db, acc, 'firepower')).toEqual({ ok: false, reason: 'maxed' });
    expect(await buyUpgrade(db, acc, 'focus')).toEqual({ ok: true, rank: 1, shards: 7000 - 6300 - 40 });
    expect(await buyUpgrade(db, acc, 'speed')).toEqual({ ok: false, reason: 'unknown' });
    const p = (await profileOf(db, acc))!;
    expect(p.upgrades.firepower).toBe(7);
    expect(p.shards).toBe(7000 - 6300 - 40);
    const l = await db.query<{ delta: number }>(`SELECT delta FROM room_zero.ledger WHERE account_id = $1 ORDER BY id`, [acc]);
    expect(l.map((r) => r.delta)).toEqual([-300, -500, -700, -900, -1100, -1300, -1500, -40]);
  });
  it('ranks bought before 2026-10-23 stay, and the 4 new ranks can be bought on top (Vitality 8/8 -> 9/12)', async () => {
    const acc = (await accountFor(db, [g('old-max')]))!;
    await db.query(`INSERT INTO room_zero.upgrades (account_id, upgrade_id, rank) VALUES ($1, 'vitality', 8), ($1, 'plating', 6), ($1, 'firepower', 3), ($1, 'focus', 4)`, [acc]);
    await db.query('UPDATE room_zero.accounts SET shards = 500 WHERE id = $1', [acc]);
    expect((await profileOf(db, acc))!.upgrades).toEqual({ vitality: 8, plating: 6, firepower: 3, focus: 4 });
    expect(await buyUpgrade(db, acc, 'vitality')).toEqual({ ok: true, rank: 9, shards: 60 });
    expect((await profileOf(db, acc))!.upgrades.vitality).toBe(9);
  });
  it('two purchases at once cannot spend the same shards twice', async () => {
    const acc = (await accountFor(db, [g('race')]))!;
    await db.query('UPDATE room_zero.accounts SET shards = 300 WHERE id = $1', [acc]); // Firepower 1 costs 300
    const r = await Promise.all([buyUpgrade(db, acc, 'firepower'), buyUpgrade(db, acc, 'firepower')]);
    expect(r.filter((x) => x.ok).length).toBe(1);
    expect((await profileOf(db, acc))!.shards).toBe(0);
  });
});

describe('settlement', () => {
  it('credits XP, shards and rating once; a second settle of the same match changes nothing', async () => {
    const a = (await accountFor(db, [g('a')]))!, b = (await accountFor(db, [g('b')]))!;
    const m = rec({ players: [pl(a, 'alpha', { kills: 2 }), pl(b, 'bravo')] });
    const r1 = await settleMatch(db, m);
    expect(r1.ok && !r1.already).toBe(true);
    const r2 = await settleMatch(db, m);
    expect(r2.ok && r2.already).toBe(true);
    const pa = (await profileOf(db, a))!, pb = (await profileOf(db, b))!;
    expect(pa.xp).toBe(REWARDS.xpPlay + REWARDS.xpWin + 2 * REWARDS.xpPerKill);
    // 2 kills and 100 damage (2 damage shards) on top of playing and winning; the loser keeps its kill and damage.
    expect(pa.shards).toBe(REWARDS.shardsPlay + REWARDS.shardsWin + 2 * REWARDS.shardsPerKill + 100 / REWARDS.damagePerShard);
    expect(pb.xp).toBe(REWARDS.xpPlay + REWARDS.xpPerKill);
    expect(pb.shards).toBe(REWARDS.shardsPlay + REWARDS.shardsPerKill + 100 / REWARDS.damagePerShard);
    expect(pa.rating).toBe(1012);
    expect(pb.rating).toBe(988);
    expect(pa.wins).toBe(1);
    expect(pa.matches).toBe(1);
  });
  it('pays nothing for demo matches, short matches, leavers, or players without an account', async () => {
    const a = (await accountFor(db, [g('a')]))!, b = (await accountFor(db, [g('b')]))!;
    expect(await settleMatch(db, rec({ demo: true, players: [pl(a, 'alpha'), pl(b, 'bravo')] }))).toEqual({ ok: false, reason: 'demo' });
    expect(await settleMatch(db, rec({ players: [pl(null, 'alpha'), pl(null, 'bravo')] }))).toEqual({ ok: false, reason: 'no-accounts' });
    await settleMatch(db, rec({ id: '11111111', seconds: 10, players: [pl(a, 'alpha'), pl(b, 'bravo')] }));
    expect((await profileOf(db, a))!.xp).toBe(0);
    await settleMatch(db, rec({ id: '22222222', players: [pl(a, 'alpha'), pl(b, 'bravo', { left: true })] }));
    expect((await profileOf(db, b))!.xp).toBe(0);
    expect((await profileOf(db, b))!.rating).toBeLessThan(1000);
  });
  it('refuses malformed records', async () => {
    expect(await settleMatch(db, { id: 'x' } as MatchRecord)).toEqual({ ok: false, reason: 'invalid' });
    expect(await settleMatch(db, rec({ id: "'; DROP TABLE x; --", players: [pl(null, 'a'), pl(null, 'b')] }))).toEqual({ ok: false, reason: 'invalid' });
  });
  it('stops paying after the daily cap but still rates', async () => {
    const a = (await accountFor(db, [g('farm')]))!, b = (await accountFor(db, [g('farm2')]))!;
    for (let i = 0; i < REWARDS.dailyCap + 2; i++) await settleMatch(db, rec({ id: `f${String(i).padStart(7, '0')}`, players: [pl(a, 'alpha'), pl(b, 'bravo')] }));
    const p = (await profileOf(db, a))!;
    expect(p.matches).toBe(REWARDS.dailyCap + 2);
    expect(p.shards).toBe(REWARDS.dailyCap * (REWARDS.shardsPlay + REWARDS.shardsWin + REWARDS.shardsPerKill + 100 / REWARDS.damagePerShard));
  });
  it('rating is power-adjusted: a 1:1 beating a free player gains less than a free player beating a 1:1', async () => {
    const a = (await accountFor(db, [g('p1')]))!, b = (await accountFor(db, [g('p2')]))!;
    const up = await settleMatch(db, rec({ id: 'aaaaaaaa', players: [pl(a, 'alpha', { tier: 'legendary' }), pl(b, 'bravo')] }));
    const c = (await accountFor(db, [g('p3')]))!, d = (await accountFor(db, [g('p4')]))!;
    const down = await settleMatch(db, rec({ id: 'bbbbbbbb', players: [pl(c, 'alpha'), pl(d, 'bravo', { tier: 'legendary' })] }));
    const gain = (r: typeof up) => (r.ok ? r.players[0].ratingAfter - r.players[0].ratingBefore : 0);
    expect(gain(up)).toBeLessThan(gain(down));
  });
  it('token history belongs to the token, progression to the account: a transfer moves no XP', async () => {
    const seller = (await accountFor(db, [wal('0xS')]))!, buyer = (await accountFor(db, [wal('0xB')]))!, foe = (await accountFor(db, [g('foe')]))!;
    await settleMatch(db, rec({ id: 'cccccccc', players: [pl(seller, 'alpha', { tok: 7, mid: 1468, own: '0xS', tier: 'common' }), pl(foe, 'bravo')] }));
    await settleMatch(db, rec({ id: 'dddddddd', players: [pl(buyer, 'alpha', { tok: 7, mid: 1468, own: '0xB', tier: 'common' }), pl(foe, 'bravo')] }));
    expect(await tokenHistory(db, 7)).toEqual({ matches: 2, wins: 2, kills: 2 });
    expect((await profileOf(db, seller))!.xp).toBe((await profileOf(db, buyer))!.xp);
    expect((await leaderboard(db)).rows.length).toBe(3);
  });
});

describe('game tickets', () => {
  it('round trip; tampering, expiry and the wrong key are refused', async () => {
    const s = await ticketSecret('x'.repeat(40));
    expect(s).not.toBe('x'.repeat(40));
    const { ticket, data } = await issueTicket({ acc: 'a1', tier: 'free', up: NO_UPGRADES, tok: null, mid: null, tokTier: null, own: null, holder: false, demo: false, name: 'A' }, s, 1_000_000);
    expect(await checkTicket(ticket, s, 1_000_000)).toEqual(data);
    expect(await checkTicket(ticket, s, 1_000_000 + 11 * 60_000)).toBeNull();
    expect(await checkTicket(ticket, await ticketSecret('y'.repeat(40)), 1_000_000)).toBeNull();
    const [body, mac] = ticket.split('.');
    const forged = Buffer.from(JSON.stringify({ ...data, holder: true, tier: 'legendary' })).toString('base64url');
    expect(await checkTicket(`${forged}.${mac}`, s, 1_000_000)).toBeNull();
    expect(body.length).toBeGreaterThan(10);
  });
});

describe('progression numbers', () => {
  it('levels and rewards', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, next: 100 });
    expect(levelOf(100).level).toBe(2);
    expect(levelOf(250).level).toBe(3);
    expect(matchRewards({ won: true, kills: 99, leftEarly: false, seconds: 60, capped: false }).xp).toBe(REWARDS.xpPlay + REWARDS.xpWin + REWARDS.maxKills * REWARDS.xpPerKill);
  });
});
