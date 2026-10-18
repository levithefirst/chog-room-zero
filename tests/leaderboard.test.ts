// Leaderboard (owner requirement 2026-10-14): persistent, account-based, ranked by opponents killed in validated
// matches. NFT tier, rating and XP are shown and never decide the order. Real Postgres engine (PGlite).
import { beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { memoryDb } from './helpers/pglite';
import { MIGRATIONS, migrate, schemaStatus, type Db } from '../api/_lib/db';
import { accountFor, cleanName, leaderboard, setNftTier, settleMatch, type MatchRecord } from '../api/_lib/game';
import { REWARDS } from '../src/config/progression';

let db: Db;
beforeEach(async () => { db = await memoryDb(); await migrate(db); });

const g = (s: string) => ({ provider: 'google' as const, subject: s, label: s });
let n = 0;
const id = () => (++n).toString(16).padStart(12, '0');
type P = MatchRecord['players'][number];
const pl = (acc: string | null, team: string, extra: Partial<P> = {}): P => ({ acc, team, tier: 'free', tok: null, mid: null, own: null, kills: 0, damage: 0, left: false, ...extra });
const match = (players: P[], o: Partial<MatchRecord> = {}): MatchRecord => ({ id: id(), mode: '1v1', demo: false, winner: 'alpha', reason: 'eliminated', seconds: 60, endedAt: 1_760_000_000, players, ...o });

describe('ranking', () => {
  it('orders by kills first: more kills beats more wins, a higher rating and a 1:1 Chog', async () => {
    const killer = (await accountFor(db, [g('killer')]))!, holder = (await accountFor(db, [g('holder')]))!, foe = (await accountFor(db, [g('foe')]))!;
    // The holder (1:1 Chog #53) wins three matches with 1 kill each; the killer loses once but takes 5 kills.
    for (let i = 0; i < 3; i++) await settleMatch(db, match([pl(holder, 'alpha', { kills: 1, tok: 5, mid: 53, own: '0xH', tier: 'legendary', name: 'Holder' }), pl(foe, 'bravo', { name: 'Foe' })]));
    await settleMatch(db, match([pl(foe, 'alpha', { name: 'Foe' }), pl(killer, 'bravo', { kills: 5, name: 'Killer' })]));
    const b = await leaderboard(db);
    expect(b.rows.map((r) => [r.name, r.kills, r.wins, r.matches])).toEqual([['Killer', 5, 0, 1], ['Holder', 3, 3, 3], ['Foe', 0, 1, 4]]);
    expect(b.rows[1].nftTier).toBe('legendary');
    expect(b.rows[1].rating).toBeGreaterThan(b.rows[0].rating);
  });
  it('ties on kills go to wins, then fewer matches', async () => {
    const a = (await accountFor(db, [g('a')]))!, b = (await accountFor(db, [g('b')]))!, c = (await accountFor(db, [g('c')]))!, x = (await accountFor(db, [g('x')]))!;
    await settleMatch(db, match([pl(a, 'alpha', { kills: 2, name: 'A' }), pl(x, 'bravo', { name: 'X' })]));
    await settleMatch(db, match([pl(x, 'alpha', { name: 'X' }), pl(b, 'bravo', { kills: 2, name: 'B' })]));
    await settleMatch(db, match([pl(c, 'alpha', { kills: 1, name: 'C' }), pl(x, 'bravo', { name: 'X' })]));
    await settleMatch(db, match([pl(c, 'alpha', { kills: 1, name: 'C' }), pl(x, 'bravo', { name: 'X' })]));
    expect((await leaderboard(db)).rows.map((r) => r.name)).toEqual(['C', 'A', 'B', 'X']);
  });
  it('changing an NFT tier never moves anyone', async () => {
    const a = (await accountFor(db, [g('a')]))!, b = (await accountFor(db, [g('b')]))!;
    await settleMatch(db, match([pl(a, 'alpha', { kills: 3, name: 'A' }), pl(b, 'bravo', { kills: 2, name: 'B' })]));
    const before = (await leaderboard(db)).rows.map((r) => r.name);
    await setNftTier(db, b, { tokenId: 9, metadataId: 1373 });
    await setNftTier(db, a, null);
    const after = await leaderboard(db);
    expect(after.rows.map((r) => r.name)).toEqual(before);
    expect(after.rows.map((r) => r.nftTier)).toEqual([null, 'legendary']);
  });
});

describe('what counts', () => {
  it('kills only from validated matches: short matches add none; demo matches and guests never appear', async () => {
    const a = (await accountFor(db, [g('a')]))!, b = (await accountFor(db, [g('b')]))!;
    await settleMatch(db, match([pl(a, 'alpha', { kills: 4, name: 'A' }), pl(b, 'bravo', { name: 'B' })], { seconds: REWARDS.minSeconds - 1 }));
    await settleMatch(db, match([pl(a, 'alpha', { kills: 9 }), pl(b, 'bravo')], { demo: true }));
    await settleMatch(db, match([pl(a, 'alpha', { kills: 1, name: 'A' }), pl(null, 'bravo', { name: 'Guest-1' })]));
    const rows = (await leaderboard(db)).rows;
    expect(rows.find((r) => r.name === 'A')!.kills).toBe(1);
    expect(rows.some((r) => r.name.startsWith('Guest'))).toBe(false);
  });
  it('settling the same match twice does not double the kills', async () => {
    const a = (await accountFor(db, [g('a')]))!, b = (await accountFor(db, [g('b')]))!;
    const m = match([pl(a, 'alpha', { kills: 3, name: 'A' }), pl(b, 'bravo', { name: 'B' })]);
    await settleMatch(db, m);
    await settleMatch(db, m);
    expect((await leaderboard(db)).rows[0]).toMatchObject({ name: 'A', kills: 3, matches: 1 });
  });
  it('shows XP and level, names are cleaned, and a nameless account gets a neutral label', async () => {
    const a = (await accountFor(db, [g('a')]))!, b = (await accountFor(db, [g('b')]))!;
    await settleMatch(db, match([pl(a, 'alpha', { kills: 2, name: '  Ace\u0007\u0000Pilot  ' }), pl(b, 'bravo')]));
    const r = (await leaderboard(db)).rows;
    expect(r[0]).toMatchObject({ name: 'AcePilot', xp: 40 + 60 + 20, level: 2 });
    expect(r[1].name).toMatch(/^Player [A-Za-z0-9_-]{4}$/);
    expect(cleanName('x'.repeat(40))).toHaveLength(20);
    expect(cleanName(42)).toBeNull();
  });
  it('your own row is returned when you are outside the shown ranks', async () => {
    const accs = [];
    for (let i = 0; i < 4; i++) accs.push((await accountFor(db, [g(`p${i}`)]))!);
    for (let i = 0; i < 3; i++) await settleMatch(db, match([pl(accs[i], 'alpha', { kills: 5 - i, name: `P${i}` }), pl(accs[3], 'bravo', { name: 'Last' })]));
    const b = await leaderboard(db, 2, accs[3]);
    expect(b.rows.map((r) => r.name)).toEqual(['P0', 'P1']);
    expect(b.me).toMatchObject({ name: 'Last', rank: 4, you: true });
  });
});

describe('migration v2 on an existing v1 database', () => {
  it('adds the leaderboard columns without touching existing rows', async () => {
    const pg = new PGlite();
    const raw: Db = {
      query: async <T>(sql: string, p: unknown[] = []) => (await pg.query<T>(sql, p)).rows,
      tx: (fn) => pg.transaction((t) => fn({ query: async <T>(sql: string, p: unknown[] = []) => (await t.query<T>(sql, p)).rows })),
      close: () => pg.close(),
    };
    // Build the database exactly as migration 1 left it, with a real account in it.
    await raw.query('CREATE SCHEMA room_zero');
    await raw.query('CREATE TABLE room_zero.schema_migrations (version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const stmt of MIGRATIONS[0].sql.split(';').map((x) => x.trim()).filter(Boolean)) await raw.query(stmt);
    await raw.query(`INSERT INTO room_zero.schema_migrations (version, name) VALUES (1, 'v1')`);
    await raw.query(`INSERT INTO room_zero.accounts (id, xp, shards, rating, matches, wins) VALUES ('old', 500, 70, 1040, 9, 6)`);
    expect(await migrate(raw)).toEqual([2, 3, 4, 5, 6, 7]);
    const r = await raw.query<Record<string, unknown>>(`SELECT * FROM room_zero.accounts WHERE id = 'old'`);
    expect(r[0]).toMatchObject({ id: 'old', shards: 70, rating: 1040, matches: 9, wins: 6, display_name: null, nft_tier: null });
    expect(Number(r[0].xp)).toBe(500);
    const s = await schemaStatus(raw);
    expect(s.migrations.map((m) => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(s.tables).toEqual(['accounts', 'identities', 'ledger', 'match_players', 'matches', 'medals', 'ownership_checks', 'practice_runs', 'revoked_sessions', 'schema_migrations', 'token_history', 'upgrades', 'used_nonces']);
    await raw.close();
  });
});
