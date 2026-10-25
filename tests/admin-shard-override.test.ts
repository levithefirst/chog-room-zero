// Owner 2026-10-25 (t38u): the owner account's shard override (api/_lib/shard-override.ts). Real Postgres engine
// (PGlite) behind the real API handler and the real online settle.
import { beforeEach, describe, expect, it } from 'vitest';
import { handleGame, type Deps } from '../api/_lib/game-api';
import { SESSION_COOKIE, sign } from '../api/_lib/auth';
import { migrate, type Db } from '../api/_lib/db';
import { memoryDb } from './helpers/pglite';
import { settleMatch, type MatchRecord } from '../api/_lib/game';
import { PRACTICE_SHARDS_PER_DAY } from '../api/_lib/career';
import { OVERRIDE_SHARDS_PER_DAY, SHARD_OVERRIDE_ACCOUNTS, gameplayShardsToday, hasShardOverride, overrideShards } from '../api/_lib/shard-override';
import { PRACTICE_REWARDS, REWARDS, rewardBreakdown } from '../src/config/progression';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const HOST = 'chogroomzero.xyz';
const OWNER = SHARD_OVERRIDE_ACCOUNTS[0];
let db: Db;
let clock = Date.now();
const deps = (): Deps => ({ env: { AUTH_SECRET: SECRET, AUTH_ORIGIN: `https://${HOST}` }, db: async () => ({ ...db, close: async () => undefined }), fetch: async () => new Response('{}', { status: 404 }), now: () => clock });
const cookie = async (subject: string) => `${SESSION_COOKIE}=${encodeURIComponent(await sign({ ids: [{ provider: 'google', subject, label: subject }], exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET))}`;
async function call(method: string, action: string, c?: string, body?: object) {
  const h = new Headers({ 'content-type': 'application/json', origin: `https://${HOST}` });
  if (c) h.set('cookie', c);
  const r = await handleGame(new Request(`https://${HOST}/api/game/${action}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), action.split('?')[0], deps());
  return { status: r.status, j: (await r.json()) as Record<string, any> };
}
let n = 0;
// A clear with 5 kills and 300 damage: the most a practice run pays (10 + 30 + 50 + 3 = 93 shards, 20 + 30 + 25 XP).
const run = (o: Record<string, unknown> = {}) => ({ runId: `run-${++n}-abcdef`, hero: 'benja', won: true, seconds: 70, kills: 5, bullets: 40, hits: 15, damageDealt: 300, damageTaken: 60, hpLeft: 50, pickups: 1, abilities: 1, ...o });
async function practice(c: string, extra: Record<string, unknown> = {}) {
  const t = (await call('POST', 'practice-start', c)).j as { ticket: string; runId: string };
  clock += 80_000;
  const r = await call('POST', 'practice', c, { ...run(), ...extra, runId: t.runId, ticket: t.ticket });
  return r.j.reward as { xp: number; shards: number; none: string | null; lines: { shards: number; xp: number }[] };
}
const ownerCookie = () => cookie('owner-google-sub');
const normalCookie = () => cookie('normal-google-sub');
async function seedShards(acc: string, delta: number, hoursAgo = 0) {
  await db.query(`INSERT INTO room_zero.ledger (account_id, kind, delta, reason, ref, created_at) VALUES ($1, 'shards', $2, 'match', $3, now() - ($4 || ' hours')::interval)`, [acc, delta, `seed-${++n}`, String(hoursAgo)]);
}
const balance = async (acc: string) => Number((await db.query<{ shards: number }>(`SELECT shards FROM room_zero.accounts WHERE id = $1`, [acc]))[0].shards);
const accOf = async (subject: string) => (await db.query<{ account_id: string }>(`SELECT account_id FROM room_zero.identities WHERE provider = 'google' AND subject = $1`, [subject]))[0].account_id;
let mid = 0x5000;
function match(acc: string, other: string, o: Partial<MatchRecord['players'][number]> = {}): MatchRecord {
  return { id: (++mid).toString(16).padStart(8, '0'), mode: '1v1', demo: false, winner: 'alpha', reason: 'eliminated', seconds: 90, endedAt: 1_760_000_000,
    players: [{ acc, team: 'alpha', tier: 'free', tok: null, mid: null, own: null, kills: 5, damage: 300, left: false, ...o },
      { acc: other, team: 'bravo', tier: 'free', tok: null, mid: null, own: null, kills: 0, damage: 0, left: false }] };
}
const normalOnline = rewardBreakdown({ won: true, kills: 5, damage: 300, seconds: 90, leftEarly: false, capped: false });
const normalPractice = rewardBreakdown({ won: true, kills: 5, damage: 300, seconds: 70, leftEarly: false, capped: false }, PRACTICE_REWARDS);

beforeEach(async () => {
  db = await memoryDb(); await migrate(db); clock = Date.now();
  // The owner's account, reached only through its linked Google identity (the signed session).
  await db.query(`INSERT INTO room_zero.accounts (id) VALUES ($1)`, [OWNER]);
  await db.query(`INSERT INTO room_zero.identities (provider, subject, account_id) VALUES ('google', 'owner-google-sub', $1)`, [OWNER]);
  await call('GET', 'profile', await normalCookie());
  await call('GET', 'profile', await ownerCookie());
});

describe('owner shard override: the pure rule (2x, then clamp to what is left today)', () => {
  it('only the allowlisted id; the normal limit is untouched', () => {
    expect(hasShardOverride(OWNER)).toBe(true);
    expect(hasShardOverride('someone-else')).toBe(false);
    expect(hasShardOverride(null)).toBe(false);
    expect(PRACTICE_SHARDS_PER_DAY).toBe(1000);
    expect(OVERRIDE_SHARDS_PER_DAY).toBe(10_000);
  });
  it('the allowlisted id is a 16-character server account id whose Settings id (src/main.ts) is the owner\'s 71D9VIPM', () => {
    expect(SHARD_OVERRIDE_ACCOUNTS).toHaveLength(1);
    expect(OWNER).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(OWNER.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()).toBe('71D9VIPM');
  });
  it('exactly 2x shards; XP, lines and the no-pay reason unchanged; lines still add up', () => {
    const o = overrideShards(normalOnline, 0);
    expect(o.shards).toBe(normalOnline.shards * 2);
    expect(o.xp).toBe(normalOnline.xp);
    expect(o.lines.map((l) => l.xp)).toEqual(normalOnline.lines.map((l) => l.xp));
    expect(o.lines.reduce((s, l) => s + l.shards, 0)).toBe(o.shards);
    const none = rewardBreakdown({ won: true, kills: 5, damage: 300, seconds: 5, leftEarly: false, capped: false });
    expect(overrideShards(none, 0)).toEqual(none);
  });
  it('clamped to the remaining allowance, never past the cap', () => {
    for (const today of [0, 9_800, 9_900, 9_999, 10_000, 12_000]) {
      const o = overrideShards(normalOnline, today);
      expect(o.shards).toBe(Math.max(0, Math.min(normalOnline.shards * 2, OVERRIDE_SHARDS_PER_DAY - today)));
      expect(today + o.shards).toBeLessThanOrEqual(Math.max(today, OVERRIDE_SHARDS_PER_DAY));
      expect(o.lines.reduce((s, l) => s + l.shards, 0)).toBe(o.shards);
      expect(o.xp).toBe(normalOnline.xp);
    }
  });
});

describe('owner shard override: practice (signed session)', () => {
  it('owner gets exactly 2x the shards of the same run; XP equal', async () => {
    const a = await practice(await normalCookie());
    const b = await practice(await ownerCookie());
    expect(a.shards).toBe(normalPractice.shards);
    expect(b.shards).toBe(normalPractice.shards * 2);
    expect(b.xp).toBe(a.xp);
    expect(await balance(OWNER)).toBe(normalPractice.shards * 2);
  });
  it('a normal account stays capped at 1,000 a day (a run that would pass it pays nothing)', async () => {
    const c = await normalCookie();
    let total = 0;
    const acc = await accOf('normal-google-sub');
    for (let i = 0; i < 12; i++) {
      total += (await practice(c)).shards;
      // Step past the per-minute limit (it reads the database clock) while staying well inside the 24 h window.
      await db.query(`UPDATE room_zero.practice_runs SET created_at = created_at - interval '2 minutes' WHERE account_id = $1`, [acc]);
    }
    expect(total).toBe(Math.floor(PRACTICE_SHARDS_PER_DAY / normalPractice.shards) * normalPractice.shards);
    expect(total).toBeLessThanOrEqual(PRACTICE_SHARDS_PER_DAY);
    expect(await balance(acc)).toBe(total);
  });
  it('the owner is not stopped at 1,000 but is clamped at 10,000, then paid nothing', async () => {
    const c = await ownerCookie();
    await seedShards(OWNER, 9_900);
    const partial = await practice(c);
    expect(partial.shards).toBe(100);
    expect(partial.xp).toBe(normalPractice.xp);
    const over = await practice(c);
    expect(over).toMatchObject({ shards: 0, xp: 0, none: 'cap' });
    expect(await gameplayShardsToday(db, OWNER)).toBe(OVERRIDE_SHARDS_PER_DAY);
  });
  it('a client cannot switch it on by sending the owner id', async () => {
    const r = await practice(await normalCookie(), { acc: OWNER, account: OWNER, accountId: OWNER, id: OWNER });
    expect(r.shards).toBe(normalPractice.shards);
    expect(await balance(OWNER)).toBe(0);
  });
});

describe('owner shard override: online settle (ticket-verified account)', () => {
  it('owner 2x shards, normal player unchanged, XP and rating rules equal', async () => {
    const normal = await accOf('normal-google-sub');
    const a = await settleMatch(db, match(OWNER, normal));
    const b = await settleMatch(db, match(normal, OWNER));
    if (!a.ok || !b.ok) throw new Error('settle');
    const own = a.players.find((p) => p.acc === OWNER)!, nor = b.players.find((p) => p.acc === normal)!;
    expect(nor.shards).toBe(normalOnline.shards);
    expect(own.shards).toBe(normalOnline.shards * 2);
    expect(own.xp).toBe(nor.xp);
    expect(own.xp).toBe(normalOnline.xp);
    // The losers in both matches: the owner's loss pays 2x the normal loss.
    expect(b.players.find((p) => p.acc === OWNER)!.shards).toBe(2 * a.players.find((p) => p.acc === normal)!.shards);
  });
  it('quits, short and private matches still pay nothing; the 20-match cap still applies', async () => {
    const normal = await accOf('normal-google-sub');
    const q = await settleMatch(db, match(OWNER, normal, { left: true, quit: true }));
    const s = await settleMatch(db, { ...match(OWNER, normal), seconds: REWARDS.minSeconds - 1 });
    const p = await settleMatch(db, { ...match(OWNER, normal), private: true });
    for (const r of [q, s, p]) { if (!r.ok) throw new Error('settle'); expect(r.players.find((x) => x.acc === OWNER)!.shards).toBe(0); }
    let paid = 0;
    for (let i = 0; i < REWARDS.dailyCap + 2; i++) { const r = await settleMatch(db, match(OWNER, normal)); if (r.ok && r.players.find((x) => x.acc === OWNER)!.xp > 0) paid++; }
    expect(paid).toBe(REWARDS.dailyCap);
  });
  it('online and practice share the 10,000; the final award never passes it', async () => {
    const normal = await accOf('normal-google-sub');
    await seedShards(OWNER, 9_950);
    const r = await settleMatch(db, match(OWNER, normal));
    if (!r.ok) throw new Error('settle');
    expect(r.players.find((x) => x.acc === OWNER)!).toMatchObject({ shards: 50, xp: normalOnline.xp });
    const r2 = await settleMatch(db, match(OWNER, normal));
    if (!r2.ok) throw new Error('settle');
    expect(r2.players.find((x) => x.acc === OWNER)!).toMatchObject({ shards: 0, xp: normalOnline.xp });
    expect((await practice(await ownerCookie())).shards).toBe(0);
    expect(await gameplayShardsToday(db, OWNER)).toBe(OVERRIDE_SHARDS_PER_DAY);
  });
});

describe('owner shard override: restart-safe (state is the ledger, rolling 24 h)', () => {
  it('a fresh handler on the same database reconstructs the day; earnings older than 24 h free the allowance', async () => {
    const normal = await accOf('normal-google-sub');
    for (let i = 0; i < 3; i++) await settleMatch(db, match(OWNER, normal));
    const before = await gameplayShardsToday(db, OWNER);
    expect(before).toBe(3 * normalOnline.shards * 2);
    // "Restart": new connection object, new deps, nothing carried in memory.
    const reopened: Db = { ...db };
    expect(await gameplayShardsToday(reopened, OWNER)).toBe(before);
    await seedShards(OWNER, OVERRIDE_SHARDS_PER_DAY - before);
    expect((await practice(await ownerCookie())).none).toBe('cap');
    await db.query(`UPDATE room_zero.ledger SET created_at = now() - interval '25 hours' WHERE account_id = $1`, [OWNER]);
    await db.query(`UPDATE room_zero.practice_runs SET created_at = now() - interval '25 hours' WHERE account_id = $1`, [OWNER]);
    expect((await practice(await ownerCookie())).shards).toBe(normalPractice.shards * 2);
  });
});
