// Site API hardening (audit at 95acb6d, 2026-10-17). One regression test per finding: each fails on 95acb6d and passes
// with the fix. Real Postgres engine (PGlite), a fake Monad RPC and a fake game server, as in tests/game-api.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { handleGame, type Deps } from '../api/_lib/game-api';
import { SESSION_COOKIE, CHALLENGE_COOKIE, checksum, hex, readCookie, readJson, sessionCookieWith, sign, unsign, verifyWallet } from '../api/_lib/auth';
import { MIGRATIONS, migrate, type Db, type Tx } from '../api/_lib/db';
import { CONTRACT, readOwnership, selector } from '../api/_lib/chain';
import { memoryDb } from './helpers/pglite';
import { accountFor, profileOf, settleMatch, validRecord, type MatchRecord } from '../api/_lib/game';
import { PRACTICE_SHARDS_PER_DAY } from '../api/_lib/career';
import { POST as challenge } from '../api/auth/wallet/challenge';
import { PRACTICE_REWARDS, rewardBreakdown } from '../src/config/progression';

declare const process: { env: Record<string, string | undefined> };

const SECRET = 'test-secret-'.padEnd(48, 'x');
const HOST = 'chogroomzero.xyz';
const W1 = '0x1111111111111111111111111111111111111111';
let db: Db;
let clock = Date.now();
let chain: { owned: Record<string, number[]>; meta: Record<number, number> };
let rpc: { tokensOfOwner: number; metaBatches: number[] };
let records: Record<string, unknown>;

const word = (n: number) => n.toString(16).padStart(64, '0');
const fakeFetch = async (url: string, init: RequestInit): Promise<Response> => {
  if (url.startsWith('https://room-zero-game.onrender.com/results/')) {
    const id = url.split('/').pop()!;
    return records[id] ? Response.json(records[id]) : new Response('{}', { status: 404 });
  }
  const batch = JSON.parse(String(init.body)) as { id: number; method: string; params: [{ to: string; data: string }] }[];
  if (batch.every((c) => c.method === 'eth_call' && c.params[0].data.startsWith(selector('metadataId(uint256)')))) rpc.metaBatches.push(batch.length);
  return Response.json(batch.map((c) => {
    if (c.method === 'eth_chainId') return { id: c.id, result: '0x8f' };
    if (c.method === 'eth_blockNumber') return { id: c.id, result: '0x10' };
    const { to, data } = c.params[0];
    expect(to).toBe(CONTRACT);
    if (data.startsWith(selector('tokensOfOwner(address)'))) {
      rpc.tokensOfOwner++;
      const ids = chain.owned['0x' + data.slice(10 + 24).toLowerCase()] ?? [];
      return { id: c.id, result: '0x' + word(32) + word(ids.length) + ids.map(word).join('') };
    }
    if (data.startsWith(selector('metadataId(uint256)'))) return { id: c.id, result: '0x' + word(chain.meta[parseInt(data.slice(10), 16)] ?? 1462) };
    return { id: c.id, error: { message: 'unknown' } };
  }));
};

const deps = (o: Partial<Deps> = {}): Deps => ({
  env: { AUTH_SECRET: SECRET, AUTH_ORIGIN: `https://${HOST}` },
  db: async () => ({ ...db, close: async () => undefined }),
  fetch: fakeFetch, now: () => clock, ...o,
});
type Id = { provider: 'google' | 'wallet'; subject: string; label: string };
const g = (s: string): Id => ({ provider: 'google', subject: s, label: s });
const w = (a: string): Id => ({ provider: 'wallet', subject: a, label: 'w' });
const cookieFor = async (ids: Id[], extra: object = { k: 'session' }) =>
  `${SESSION_COOKIE}=${encodeURIComponent(await sign({ ...extra, ids, exp: Math.floor(Date.now() / 1000) + 24 * 3600 }, SECRET))}`;
async function call(method: string, action: string, o: { cookie?: string; body?: object; raw?: string } = {}, d: Deps = deps()) {
  const h = new Headers({ 'content-type': 'application/json', origin: `https://${HOST}` });
  if (o.cookie) h.set('cookie', o.cookie);
  const body = o.raw ?? (o.body ? JSON.stringify(o.body) : undefined);
  const r = await handleGame(new Request(`https://${HOST}/api/game/${action}`, { method, headers: h, body }), action, d);
  return { status: r.status, j: (await r.json()) as Record<string, any> };
}

beforeEach(async () => {
  db = await memoryDb(); await migrate(db);
  clock = Date.now();
  chain = { owned: { [W1]: [5] }, meta: { 5: 53 } };
  rpc = { tokensOfOwner: 0, metaBatches: [] };
  records = {};
});

// ---- 1 ----
describe('1: holdings come only from wallets linked to the ticket account', () => {
  it('a session wallet linked to another account lends no Chog to this account (ticket and tokens)', async () => {
    const other = (await accountFor(db, [w(W1)]))!; // W1 belongs to another account
    const cookie = await cookieFor([g('a'), w(W1)]);
    const mine = (await accountFor(db, [g('a')]))!;
    expect(mine).not.toBe(other);
    const t = await call('POST', 'ticket', { cookie, body: { tokenId: 5 } });
    expect(t.j.profile).toMatchObject({ account: true, holder: false, tier: 'free', tokenId: null });
    expect((await call('GET', 'tokens', { cookie })).j).toMatchObject({ wallet: false, tokens: [] });
    // The wallet's own account still plays with it.
    const own = await call('POST', 'ticket', { cookie: await cookieFor([w(W1)]), body: { tokenId: 5 } });
    expect(own.j.profile).toMatchObject({ holder: true, tokenId: 5, tier: 'legendary' });
  });
});

// ---- 2 and 8 ----
describe('2: practice farming', () => {
  const start = async (c: string) => (await call('POST', 'practice-start', { cookie: c })).j as { ticket: string; runId: string };
  const maxWin = { hero: 'benja', won: true, seconds: 60, kills: 5, bullets: 40, hits: 30, damageDealt: 900, damageTaken: 10, hpLeft: 50, pickups: 0, abilities: 0 };
  it('30 parallel starts, then 25 max-value posts: only the latest start pays', async () => {
    const c = await cookieFor([g('farmer')]);
    const tickets = [];
    for (let i = 0; i < 30; i++) tickets.push(await start(c));
    clock += 70_000;
    let shards = 0;
    for (const t of tickets.slice(-25)) {
      const r = await call('POST', 'practice', { cookie: c, body: { ...maxWin, runId: t.runId, ticket: t.ticket } }, deps());
      if (r.status === 200) shards += r.j.reward.shards;
      if (r.status === 429) await db.query(`UPDATE room_zero.practice_runs SET created_at = created_at - interval '2 minutes'`); // step past the per-minute limit
    }
    expect(shards).toBe(rewardBreakdown({ won: true, kills: 5, damage: 900, seconds: 60, leftEarly: false, capped: false }, PRACTICE_REWARDS).shards);
    expect((await call('GET', 'profile', { cookie: c })).j.profile.shards).toBe(shards);
  });
  it('a new start replaces the open run; a spent run cannot be paid again', async () => {
    const c = await cookieFor([g('p1')]);
    const t1 = await start(c), t2 = await start(c);
    clock += 70_000;
    expect((await call('POST', 'practice', { cookie: c, body: { ...maxWin, runId: t1.runId, ticket: t1.ticket } })).j.reward.none).toBe('unverified');
    expect((await call('POST', 'practice', { cookie: c, body: { ...maxWin, runId: t2.runId, ticket: t2.ticket } })).j.reward.none).toBeNull();
  });
  it('implausible durations are not paid; an honest fast win is', async () => {
    const c = await cookieFor([g('p2')]);
    const post = async (o: object) => { const t = await start(c); clock += 120_000; return (await call('POST', 'practice', { cookie: c, body: { ...maxWin, ...o, runId: t.runId, ticket: t.ticket } })).j.reward; };
    expect((await post({ seconds: 25, kills: 0 })).none).toBe('unverified'); // a win under 30 s
    expect((await post({ won: false, seconds: 25, kills: 5 })).none).toBe('unverified'); // 5 kills in under 30 s
    // The fastest measured honest win: 35.2 s with 3 kills.
    expect((await post({ seconds: 35, kills: 3 })).none).toBeNull();
  });
  it(`practice shards per rolling 24 h stop at ${PRACTICE_SHARDS_PER_DAY}`, async () => {
    const c = await cookieFor([g('p3')]);
    const acc = (await call('GET', 'profile', { cookie: c })).j.profile.account as string;
    for (let i = 0; i < 13; i++) {
      await db.query(`INSERT INTO room_zero.practice_runs (account_id, run_id, hero, won, seconds, kills, bullets, hits, damage_dealt, damage_taken, pickups, abilities, hp_left, xp, shards, created_at)
        VALUES ($1, $2, 'benja', true, 60, 5, 0, 0, 0, 0, 0, 0, 0, 75, 22, now() - interval '2 hours')`, [acc, `old-run-${i}-xx`]);
    }
    // 286 paid: a max win (24) would pass 300 and is capped; a small loss (8) still fits.
    let t = await start(c); clock += 70_000;
    expect((await call('POST', 'practice', { cookie: c, body: { ...maxWin, runId: t.runId, ticket: t.ticket } })).j.reward.none).toBe('cap');
    t = await start(c); clock += 70_000;
    const loss = await call('POST', 'practice', { cookie: c, body: { ...maxWin, won: false, kills: 2, damageDealt: 260, runId: t.runId, ticket: t.ticket } });
    expect(loss.j.reward).toMatchObject({ none: null, shards: 8 });
  });
  it('8: an unticketed run is stored and answered as before, but earns no medals, bests or career', async () => {
    const c = await cookieFor([g('p4')]);
    const forged = await call('POST', 'practice', { cookie: c, body: { ...maxWin, runId: 'forged-run-0001' } });
    expect(forged.j).toMatchObject({ ok: true, already: false, earned: [], newBest: { time: false, kills: false }, reward: { none: 'unverified', shards: 0 } });
    expect(forged.j.records.overall).toMatchObject({ runs: 0, wins: 0, kills: 0, bestWinSeconds: null });
    const p = (await call('GET', 'profile', { cookie: c })).j.profile;
    expect(p.medals).toEqual({});
    expect(p.practice.overall.runs).toBe(0);
    const stored = await db.query<{ n: string }>(`SELECT count(*) AS n FROM room_zero.practice_runs WHERE run_id = 'forged-run-0001'`);
    expect(Number(stored[0].n)).toBe(1);
    // A ticketed run does count.
    const t = await start(c); clock += 70_000;
    const real = await call('POST', 'practice', { cookie: c, body: { ...maxWin, runId: t.runId, ticket: t.ticket } });
    expect(real.j.earned.length).toBeGreaterThan(0);
    expect(real.j.records.overall).toMatchObject({ runs: 1, wins: 1, bestWinSeconds: 60 });
  });
});

// ---- 3, 10, 11, 12 ----
const rec = (o: Partial<MatchRecord> = {}): MatchRecord => ({ id: 'abcdef0123456789', mode: '1v1', demo: false, winner: 'alpha', reason: 'eliminated', seconds: 80, endedAt: 1_760_000_000, players: [], ...o });
const pl = (acc: string | null, team: string, extra: Partial<MatchRecord['players'][number]> = {}) =>
  ({ acc, team, tier: 'free' as const, tok: null, mid: null, own: null, kills: 0, damage: 0, left: false, ...extra });

describe('settlement', () => {
  it('3: a match too short to pay moves no rating, wins or matches, and keeps its history row', async () => {
    const [a, b] = [(await accountFor(db, [g('sa')]))!, (await accountFor(db, [g('sb')]))!];
    const r = await settleMatch(db, rec({ seconds: 15, players: [pl(a, 'alpha', { kills: 1 }), pl(b, 'bravo')] }));
    expect(r.ok && r.rewarded).toBe(false);
    expect(await profileOf(db, a)).toMatchObject({ rating: 1000, wins: 0, matches: 0, xp: 0 });
    expect(await profileOf(db, b)).toMatchObject({ rating: 1000, wins: 0, matches: 0 });
    const rows = await db.query<{ rating_before: number; rating_after: number; won: boolean }>(`SELECT rating_before, rating_after, won FROM room_zero.match_players WHERE account_id = $1`, [a]);
    expect(rows).toEqual([{ rating_before: 1000, rating_after: 1000, won: true }]);
  });
  it('10: records a column would refuse (unknown tier, fractions, past int4) are refused before any write', async () => {
    const a = (await accountFor(db, [g('va')]))!;
    const good = rec({ players: [pl(a, 'alpha'), pl(null, 'bravo')] });
    expect(validRecord(good)).toBe(true);
    for (const bad of [
      rec({ players: [pl(a, 'alpha', { tier: 'god' as never }), pl(null, 'bravo')] }),
      rec({ players: [pl(a, 'alpha', { kills: 1.5 }), pl(null, 'bravo')] }),
      rec({ players: [pl(a, 'alpha', { damage: 3e9 }), pl(null, 'bravo')] }),
      rec({ players: [pl(a, 'alpha', { kills: -1 }), pl(null, 'bravo')] }),
      rec({ players: [pl(a, 'alpha', { tok: 99999 }), pl(null, 'bravo')] }),
      rec({ seconds: 1e12, players: [pl(a, 'alpha'), pl(null, 'bravo')] }),
    ]) expect(validRecord(bad)).toBe(false);
    records['abcdef0123456789'] = rec({ players: [pl(a, 'alpha', { damage: 3e9 }), pl(null, 'bravo')] });
    const s = await call('POST', 'settle', { body: { matchId: 'abcdef0123456789' } });
    expect(s).toMatchObject({ status: 502, j: { error: 'bad_record' } });
    expect(await db.query(`SELECT id FROM room_zero.matches`)).toEqual([]);
  });
  it('11: a replayed settle answers the stored rewarded flag', async () => {
    const [a, b] = [(await accountFor(db, [g('ra')]))!, (await accountFor(db, [g('rb')]))!];
    const m = rec({ players: [pl(a, 'alpha'), pl(b, 'bravo')] });
    expect((await settleMatch(db, m)).ok).toBe(true);
    const again = await settleMatch(db, m);
    expect(again).toMatchObject({ ok: true, already: true, rewarded: true });
  });
  it('12: accounts are locked in one statement, in id order', async () => {
    const [a, b, c] = [(await accountFor(db, [g('la')]))!, (await accountFor(db, [g('lb')]))!, (await accountFor(db, [g('lc')]))!];
    const seen: string[] = [];
    const spy = (q: Tx): Tx => ({ query: (sql, p) => { seen.push(sql); return q.query(sql, p); } });
    const watched: Db = { ...db, tx: (fn) => db.tx((t) => fn(spy(t))) };
    await settleMatch(watched, rec({ mode: '3v3', players: [pl(c, 'alpha'), pl(a, 'alpha'), pl(b, 'bravo'), pl(null, 'bravo')] }));
    const locks = seen.filter((s) => /FOR UPDATE/.test(s));
    expect(locks).toHaveLength(1);
    expect(locks[0]).toMatch(/id = ANY\(\$1\) ORDER BY id FOR UPDATE/);
  });
});

// ---- 4, 5 ----
describe('sessions', () => {
  it('4: a wallet challenge or Google state token in the session cookie is no session (was a 500)', async () => {
    const challengeToken = await sign({ nonce: 'n', address: W1, host: HOST, message: 'm', exp: Math.floor(Date.now() / 1000) + 300 }, SECRET);
    const googleToken = await sign({ state: 's', verifier: 'v', exp: Math.floor(Date.now() / 1000) + 300 }, SECRET);
    for (const t of [challengeToken, googleToken]) {
      const r = await call('GET', 'profile', { cookie: `${SESSION_COOKIE}=${encodeURIComponent(t)}` });
      expect(r).toEqual({ status: 200, j: { signedIn: false } });
      expect((await call('POST', 'ticket', { cookie: `${SESSION_COOKIE}=${encodeURIComponent(t)}`, body: {} })).status).toBe(200);
    }
    // A tagged token of another kind is refused even with an ids list.
    expect((await call('GET', 'profile', { cookie: await cookieFor([g('x')], { k: 'challenge' }) })).j).toEqual({ signedIn: false });
  });
  it('4: sessions issued before the tag (no k, an ids list) still sign in; new ones carry k: session', async () => {
    const legacy = await cookieFor([g('old')], {});
    expect((await call('GET', 'profile', { cookie: legacy })).j).toMatchObject({ signedIn: true, progression: true });
    const set = await sessionCookieWith(null, g('new'), { AUTH_SECRET: SECRET });
    const token = decodeURIComponent(set.split(';')[0].split('=').slice(1).join('='));
    expect(await unsign(token, SECRET)).toMatchObject({ k: 'session', ids: [g('new')] });
  });
  it('5: a malformed cookie value is no cookie (was a 500)', async () => {
    const req = new Request(`https://${HOST}/`, { headers: { cookie: `${SESSION_COOKIE}=%E0%A4%A; other=1` } });
    expect(readCookie(req, SESSION_COOKIE)).toBeUndefined();
    expect(readCookie(req, 'other')).toBe('1');
    expect(await call('GET', 'profile', { cookie: `${SESSION_COOKIE}=%E0%A4%A` })).toEqual({ status: 200, j: { signedIn: false } });
  });
});

// ---- 6, 7, 16 ----
function wallet() {
  const sk = secp256k1.utils.randomSecretKey();
  const address = checksum(hex(keccak_256(secp256k1.getPublicKey(sk, false).subarray(1)).subarray(12)));
  const personalSign = (message: string) => {
    const m = new TextEncoder().encode(message);
    const digest = keccak_256(new Uint8Array([...new TextEncoder().encode(`\x19Ethereum Signed Message:\n${m.length}`), ...m]));
    const r = secp256k1.sign(digest, sk, { prehash: false, format: 'recovered' });
    return '0x' + hex(r.subarray(1)) + (27 + r[0]).toString(16);
  };
  return { address, personalSign };
}
const post = (path: string, body: unknown, cookies: (string | undefined)[] = []) =>
  new Request(`https://${HOST}${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { origin: `https://${HOST}`, host: HOST, 'content-type': 'application/json', cookie: cookies.filter(Boolean).join('; ') } });
const cookieOf = (r: Response, name: string) => r.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith(`${name}=`));

describe('wallet sign-in', () => {
  const withAuthEnv = async (fn: () => Promise<void>) => {
    const keep = { s: process.env.AUTH_SECRET, o: process.env.AUTH_ORIGIN };
    process.env.AUTH_SECRET = SECRET; process.env.AUTH_ORIGIN = `https://${HOST}`;
    try { await fn(); } finally {
      if (keep.s === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = keep.s;
      if (keep.o === undefined) delete process.env.AUTH_ORIGIN; else process.env.AUTH_ORIGIN = keep.o;
    }
  };
  const env = { AUTH_SECRET: SECRET, AUTH_ORIGIN: `https://${HOST}` };
  const open = async () => ({ ...db, close: async () => undefined });
  it('6: a captured challenge cookie and signature redeem once; the nonce is recorded server-side', async () => withAuthEnv(async () => {
    const me = wallet();
    const c = await challenge(post('/api/auth/wallet/challenge', { address: me.address, chainId: 143 }));
    const { message } = (await c.json()) as { message: string };
    const ch = cookieOf(c, CHALLENGE_COOKIE);
    const signature = me.personalSign(message);
    const first = await verifyWallet(post('/api/auth/wallet/verify', { message, signature }, [ch]), env, open);
    expect(first.status).toBe(200);
    const replay = await verifyWallet(post('/api/auth/wallet/verify', { message, signature }, [ch]), env, open);
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({ error: 'replayed' });
    // Old nonces are pruned on the next claim.
    await db.query(`INSERT INTO room_zero.used_nonces (nonce, at) VALUES ('stale', now() - interval '1 hour')`);
    const c2 = await challenge(post('/api/auth/wallet/challenge', { address: me.address }));
    const m2 = ((await c2.json()) as { message: string }).message;
    expect((await verifyWallet(post('/api/auth/wallet/verify', { message: m2, signature: me.personalSign(m2) }, [cookieOf(c2, CHALLENGE_COOKIE)]), env, open)).status).toBe(200);
    expect(await db.query(`SELECT nonce FROM room_zero.used_nonces WHERE nonce = 'stale'`)).toEqual([]);
  }));
  it('7: the message always names Monad mainnet (143), whatever chain the wallet reports', async () => withAuthEnv(async () => {
    for (const chainId of [1, 10143, 'x', undefined]) {
      const c = await challenge(post('/api/auth/wallet/challenge', { address: wallet().address, chainId }));
      expect(c.status).toBe(200);
      expect(((await c.json()) as { message: string }).message).toMatch(/\nChain ID: 143\n/);
    }
  }));
  it('16: oversized JSON bodies are refused before parsing', async () => withAuthEnv(async () => {
    expect(await readJson(post('/x', { a: 'y'.repeat(5000) }))).toBeNull();
    expect(await readJson(post('/x', { a: 1 }))).toEqual({ a: 1 });
    expect((await challenge(post('/api/auth/wallet/challenge', { address: wallet().address, pad: 'y'.repeat(2000) }))).status).toBe(400);
    const big = await call('POST', 'callsign', { cookie: await cookieFor([g('big')]), raw: JSON.stringify({ name: 'Viper', pad: 'y'.repeat(3000) }) });
    expect(big.status).toBe(400);
  }));
});

// ---- 9 ----
describe('9: accountFor race', () => {
  it('a request that lost the identity insert answers the real account and leaves no orphan', async () => {
    const real = (await accountFor(db, [g('race')]))!;
    // The second request's first read ran before the first request committed: it saw no link.
    let stale = true;
    const racing: Db = { ...db, tx: (fn) => db.tx((t) => fn({ query: async (sql, p) => {
      if (stale && /^SELECT account_id FROM room_zero.identities/.test(sql)) { stale = false; return []; }
      return t.query(sql, p);
    } })) };
    expect(await accountFor(racing, [g('race')])).toBe(real);
    expect(await db.query(`SELECT id FROM room_zero.accounts`)).toEqual([{ id: real }]);
  });
});

// ---- 13 ----
describe('13: unique callsigns', () => {
  it('a callsign another account holds (any case) is refused with callsign_taken; your own can change case', async () => {
    const a = await cookieFor([g('ca')]), b = await cookieFor([g('cb')]);
    expect((await call('POST', 'callsign', { cookie: a, body: { name: 'Viper' } })).j).toEqual({ ok: true, callsign: 'Viper' });
    const taken = await call('POST', 'callsign', { cookie: b, body: { name: 'viper' } });
    expect(taken.status).toBe(409);
    expect(taken.j).toMatchObject({ ok: false, code: 'callsign_taken', error: expect.stringMatching(/taken/) });
    expect((await call('POST', 'callsign', { cookie: a, body: { name: 'VIPER' } })).j).toEqual({ ok: true, callsign: 'VIPER' });
  });
  it('migration 5 renames later duplicates (nothing deleted), then adds the unique index', async () => {
    const old = await memoryDb();
    await old.tx(async (tx) => {
      await tx.query(`CREATE SCHEMA IF NOT EXISTS room_zero`);
      await tx.query(`CREATE TABLE IF NOT EXISTS room_zero.schema_migrations (version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      for (const m of MIGRATIONS.filter((x) => x.version < 5)) {
        for (const stmt of m.sql.split(';').map((s) => s.trim()).filter(Boolean)) await tx.query(stmt);
        await tx.query(`INSERT INTO room_zero.schema_migrations (version, name) VALUES ($1, $2)`, [m.version, m.name]);
      }
    });
    const add = (id: string, cs: string, at: string) => old.query(`INSERT INTO room_zero.accounts (id, callsign, display_name, created_at) VALUES ($1, $2, $2, $3)`, [id, cs, at]);
    await add('AAAAfirst000000', 'Viper', '2026-10-01'); await add('BBBBsecond00000', 'viper', '2026-10-02'); await add('CCCCthird000000', 'VIPER', '2026-10-03');
    await add('DDDDother000000', 'Nomad', '2026-10-01');
    expect(await migrate(old)).toEqual([5]);
    const rows = await old.query<{ id: string; callsign: string; display_name: string }>(`SELECT id, callsign, display_name FROM room_zero.accounts ORDER BY id`);
    expect(rows).toEqual([
      { id: 'AAAAfirst000000', callsign: 'Viper', display_name: 'Viper' },
      { id: 'BBBBsecond00000', callsign: 'viper-BBBB', display_name: 'viper' },
      { id: 'CCCCthird000000', callsign: 'VIPER-CCCC', display_name: 'VIPER' },
      { id: 'DDDDother000000', callsign: 'Nomad', display_name: 'Nomad' },
    ]);
    await expect(old.query(`UPDATE room_zero.accounts SET callsign = 'NOMAD' WHERE id = 'AAAAfirst000000'`)).rejects.toThrow();
    await old.close();
  });
});

// ---- 14, 15 ----
describe('chain reads', () => {
  it('14: ownership reads are cached per address for 30 s, and an unchanged read is logged once per 10 minutes', async () => {
    const d = deps({ ownershipCache: new Map() });
    const cookie = await cookieFor([w(W1)]);
    for (let i = 0; i < 3; i++) expect((await call('GET', 'tokens', { cookie }, d)).j.tokens).toHaveLength(1);
    for (let i = 0; i < 3; i++) expect((await call('POST', 'eligibility', { body: { address: W1 } }, d)).j).toMatchObject({ ok: true, count: 1 });
    expect(rpc.tokensOfOwner).toBe(1);
    clock += 31_000;
    await call('GET', 'tokens', { cookie }, d);
    expect(rpc.tokensOfOwner).toBe(2);
    const logged = async () => Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM room_zero.ownership_checks`))[0].n);
    expect(await logged()).toBe(1);
    chain.owned[W1] = [5, 900]; clock += 31_000;
    await call('GET', 'tokens', { cookie }, d);
    expect(await logged()).toBe(2); // the holding changed
  });
  it('15: a wallet with 120 tokens gets all 120, read in batches of 50', async () => {
    chain.owned[W1] = Array.from({ length: 120 }, (_, i) => i + 1);
    const r = await readOwnership(W1, fakeFetch);
    expect(r.ok && r.holdings.map((h) => h.tokenId)).toEqual(chain.owned[W1]);
    expect(rpc.metaBatches).toEqual([50, 50, 20]);
  });
});
