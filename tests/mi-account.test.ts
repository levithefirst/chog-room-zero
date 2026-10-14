// Master integration pass (owner 2026-10-14): progression belongs to the account, not the browser. Callsign,
// favourite, pins, medals, practice career and online career are stored in Neon (PGlite here) and come back the same
// from any device that signs in to the same account. Practice runs pay nothing and are bounded.
import { beforeEach, describe, expect, it } from 'vitest';
import { handleGame, type Deps } from '../api/_lib/game-api';
import { SESSION_COOKIE, sign } from '../api/_lib/auth';
import { migrate, MIGRATIONS, type Db } from '../api/_lib/db';
import { memoryDb } from './helpers/pglite';
import { settleMatch, type MatchRecord } from '../api/_lib/game';
import { validPractice } from '../api/_lib/career';
import { BOT_SPAWNS } from '../src/config/map';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const HOST = 'chogroomzero.xyz';
let db: Db;
const deps = (): Deps => ({ env: { AUTH_SECRET: SECRET, AUTH_ORIGIN: `https://${HOST}` }, db: async () => ({ ...db, close: async () => undefined }), fetch: async () => new Response('{}', { status: 404 }), now: () => Date.now() });
const cookie = async (ids: { provider: 'google' | 'wallet'; subject: string; label: string }[]) => `${SESSION_COOKIE}=${encodeURIComponent(await sign({ ids, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET))}`;
async function call(method: string, action: string, c?: string, body?: object) {
  const h = new Headers({ 'content-type': 'application/json', origin: `https://${HOST}` });
  if (c) h.set('cookie', c);
  const r = await handleGame(new Request(`https://${HOST}/api/game/${action}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), action, deps());
  return { status: r.status, j: (await r.json()) as Record<string, any> };
}
const bots = BOT_SPAWNS.length;
let n = 0;
const run = (o: Partial<Record<string, unknown>> = {}) => ({ runId: `run-${++n}-abcdef`, hero: 'kettle', won: true, seconds: 70, kills: bots, bullets: 40, hits: 25, damageDealt: 500, damageTaken: 60, hpLeft: 40, pickups: 3, abilities: 3, ...o });

beforeEach(async () => { db = await memoryDb(); await migrate(db); });

describe('migration v3 is additive', () => {
  it('adds the profile columns and tables; nothing drops or deletes', async () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2, 3]);
    for (const m of MIGRATIONS) expect(m.sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE)\b/i);
    const t = await db.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'room_zero' ORDER BY table_name`);
    expect(t.map((r) => r.table_name)).toEqual(expect.arrayContaining(['medals', 'practice_runs', 'accounts', 'match_players']));
    expect(await migrate(db)).toEqual([]);
  });
});

describe('account-owned profile', () => {
  it('callsign: validated, saved on the account, used on the leaderboard and in game tickets', async () => {
    const c = await cookie([{ provider: 'google', subject: 'g1', label: 'a@b' }]);
    expect((await call('POST', 'callsign', c, { name: '<b>' })).status).toBe(400);
    expect((await call('POST', 'callsign', undefined, { name: 'Viper' })).status).toBe(401);
    expect((await call('POST', 'callsign', c, { name: '  Viper  ' })).j).toEqual({ ok: true, callsign: 'Viper' });
    expect((await call('GET', 'profile', c)).j.profile.callsign).toBe('Viper');
    const t = await call('POST', 'ticket', c, { name: 'SomethingElse' });
    expect(t.j.profile.name).toBe('Viper');
  });
  it('favourite and pins: hero ids only, pins only for earned medals (max 3)', async () => {
    const c = await cookie([{ provider: 'google', subject: 'g2', label: 'x' }]);
    expect((await call('POST', 'prefs', c, { favourite: 'nobody' })).status).toBe(400);
    expect((await call('POST', 'prefs', c, { favourite: 'wick' })).j.ok).toBe(true);
    await call('POST', 'practice', c, run());
    expect((await call('POST', 'prefs', c, { pins: ['first-blood', 'untouched', 'nope'] })).status).toBe(400);
    await call('POST', 'prefs', c, { pins: ['first-blood', 'untouched'] });
    const p = (await call('GET', 'profile', c)).j.profile;
    expect(p.favourite).toBe('wick');
    expect(p.pins).toEqual(['first-blood']); // 'untouched' was not earned (60 damage taken)
  });
  it('practice runs: stored once per run id, medals awarded on the server, no XP, shards or leaderboard', async () => {
    const c = await cookie([{ provider: 'google', subject: 'g3', label: 'x' }]);
    const r1 = run();
    const a = await call('POST', 'practice', c, r1);
    expect(a.j.ok).toBe(true);
    expect(a.j.earned).toEqual(expect.arrayContaining(['first-blood', 'cleared', 'scavenger', 'toolkit', 'steady-hand']));
    expect(a.j.newBest).toEqual({ time: true, kills: true });
    const again = await call('POST', 'practice', c, r1);
    expect(again.j).toMatchObject({ ok: true, already: true, earned: [] });
    const p = (await call('GET', 'profile', c)).j.profile;
    expect(p.practice.overall).toMatchObject({ runs: 1, wins: 1, kills: bots, bestWinSeconds: 70 });
    expect(p).toMatchObject({ xp: 0, shards: 0, rating: 1000, matches: 0 });
    expect(Object.keys(p.medals)).toEqual(expect.arrayContaining(a.j.earned));
    expect((await call('GET', 'leaderboard', c)).j.rows).toEqual([]);
  });
  it('practice bounds: impossible numbers and floods are refused', () => {
    expect(validPractice(run())).not.toBeNull();
    expect(validPractice(run({ kills: bots + 1 }))).toBeNull();
    expect(validPractice(run({ won: true, kills: 1 }))).toBeNull();
    expect(validPractice(run({ hits: 41 }))).toBeNull();
    expect(validPractice(run({ hero: 'god' }))).toBeNull();
    expect(validPractice(run({ seconds: 0 }))).toBeNull();
    expect(validPractice(run({ runId: 'x' }))).toBeNull();
  });
  it('rate limit: a flood of practice runs is refused after 6 a minute', async () => {
    const c = await cookie([{ provider: 'google', subject: 'g4', label: 'x' }]);
    const st: number[] = [];
    for (let i = 0; i < 8; i++) st.push((await call('POST', 'practice', c, run({ won: false, kills: 1 }))).status);
    expect(st.filter((s) => s === 200).length).toBe(6);
    expect(st.at(-1)).toBe(429);
  });
  it('cross-device: a second browser (new session cookie, same identity) sees the same XP, shards, level, career and medals', async () => {
    const ident = [{ provider: 'google' as const, subject: 'same-person', label: 'p@x' }];
    const browserA = await cookie(ident);
    await call('POST', 'callsign', browserA, { name: 'Nomad' });
    await call('POST', 'practice', browserA, run());
    const acc = (await call('GET', 'profile', browserA)).j.profile.account as string;
    const m: MatchRecord = { id: 'aabbccdd00112233', mode: '1v1', demo: false, winner: 'alpha', reason: 'eliminated', seconds: 60, endedAt: Math.floor(Date.now() / 1000),
      players: [{ acc, team: 'alpha', tier: 'free', tok: null, mid: null, own: null, kills: 1, damage: 120, left: false, name: 'Nomad', hero: 'kettle', survived: true },
        { acc: null, team: 'bravo', tier: 'free', tok: null, mid: null, own: null, kills: 0, damage: 30, left: false, name: 'Guest-1', hero: 'mop', survived: false }] };
    expect((await settleMatch(db, m)).ok).toBe(true);
    // "Close the browser": a brand new cookie for the same identity (another device signs in the same way).
    const browserB = await cookie(ident);
    const a = (await call('GET', 'profile', browserA)).j.profile, b = (await call('GET', 'profile', browserB)).j.profile;
    expect(b).toEqual(a);
    expect(b).toMatchObject({ callsign: 'Nomad', xp: 110, shards: 20, level: 2, matches: 1, wins: 1 });
    expect(b.online).toMatchObject({ matches: 1, wins: 1, kills: 1, survived: 1, heroes: { kettle: { matches: 1, wins: 1, kills: 1 } } });
    expect(Object.keys(b.medals).length).toBeGreaterThan(0);
    const board = (await call('GET', 'leaderboard', browserB)).j;
    expect(board.rows[0]).toMatchObject({ name: 'Nomad', kills: 1, you: true });
  });
  it('signing in with a wallet later links it to the same account (no silent second profile)', async () => {
    const g = { provider: 'google' as const, subject: 'link-me', label: 'l@x' };
    const w = { provider: 'wallet' as const, subject: '0x2222222222222222222222222222222222222222', label: '0x22..22' };
    await call('POST', 'callsign', await cookie([g]), { name: 'Linked' });
    const both = (await call('GET', 'profile', await cookie([g, w]))).j;
    expect(both.profile.callsign).toBe('Linked');
    expect(both.identities.map((i: { provider: string }) => i.provider)).toEqual(['google', 'wallet']);
    expect((await call('GET', 'profile', await cookie([w]))).j.profile.callsign).toBe('Linked');
  });
});
