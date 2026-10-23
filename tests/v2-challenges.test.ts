// V2 daily challenges (owner V2 §17): three a day, the same for everyone, from what the server stored today, paid once.
import { beforeEach, describe, expect, it } from 'vitest';
import { CHALLENGES, CHALLENGE_REWARDS, daily, dayOf, type DayRow } from '../src/config/challenges';
import { challengesFor } from '../api/_lib/career';
import { migrate, type Db } from '../api/_lib/db';
import { memoryDb } from './helpers/pglite';

let db: Db;
beforeEach(async () => { db = await memoryDb(); await migrate(db); });
const NOW = Date.UTC(2026, 9, 18, 12);
const DAY = dayOf(NOW);

describe('the daily set', () => {
  it('one easy, one medium, one hard; the same for everyone on a day; it changes across days', () => {
    const a = daily(DAY), b = daily(DAY);
    expect(a.list.map((x) => x.def.tier)).toEqual([1, 2, 3]);
    expect(a.list.map((x) => x.def.id)).toEqual(b.list.map((x) => x.def.id));
    const seen = new Set<string>();
    for (let d = DAY; d < DAY + 60; d++) for (const x of daily(d).list) seen.add(x.def.id);
    expect(seen.size).toBe(CHALLENGES.length); // every challenge comes up within two months
    expect(a.list.every((x) => !x.text.includes('{hero}'))).toBe(true);
  });
  it('progress counts the right rows', () => {
    const row = (o: Partial<DayRow>): DayRow => ({ mode: 'solo', hero: 'benja', won: false, seconds: 90, kills: 0, bullets: 0, hits: 0, damageTaken: 100, revives: 0, loots: 0, thrown: 0, alliesLost: 0, ...o });
    const by = (id: string) => CHALLENGES.find((c) => c.id === id)!;
    expect(by('kills-6').progress([row({ kills: 4 }), row({ mode: 'online', kills: 3 })], 'benja')).toBe(7);
    expect(by('clean').progress([row({ won: true, damageTaken: 59 }), row({ won: true, damageTaken: 60 }), row({ won: false, damageTaken: 0 })], 'benja')).toBe(1);
    expect(by('steady').progress([row({ won: true, bullets: 40, hits: 14 }), row({ won: true, bullets: 10, hits: 10 })], 'benja')).toBe(1);
    expect(by('win-hero').progress([row({ won: true, hero: 'ray' }), row({ won: true, hero: 'toad' })], 'ray')).toBe(1);
    expect(by('nades-4').progress([row({ mode: 'online', thrown: 9 })], 'benja')).toBe(0);
  });
});

describe('paid once, from stored results only', () => {
  async function account(id: string) { await db.query(`INSERT INTO room_zero.accounts (id, display_name) VALUES ($1, $1)`, [id]); }
  async function run(acc: string, n: number, o: { won?: boolean; kills?: number; loots?: number; revives?: number; thrown?: number; damage?: number; seconds?: number; verified?: boolean; hero?: string } = {}) {
    await db.query(`INSERT INTO room_zero.practice_runs (account_id, run_id, hero, won, seconds, kills, bullets, hits, damage_dealt, damage_taken, pickups, abilities, hp_left, xp, shards, verified, revives, loots, thrown, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, 40, 16, 200, $7, 1, 1, 50, 10, 1, $8, $9, $10, $11, to_timestamp($12))`,
      [acc, `r${n}`, o.hero ?? 'benja', o.won ?? true, o.seconds ?? 60, o.kills ?? 5, o.damage ?? 30, o.verified ?? true, o.revives ?? 3, o.loots ?? 5, o.thrown ?? 5, NOW / 1000 - 60]);
  }
  it('a done challenge pays its tier once; asking again pays nothing; shards and XP move on the account', async () => {
    await account('A');
    await run('A', 1, { hero: daily(DAY).hero });
    await run('A', 2, { hero: daily(DAY).hero });
    const first = await db.tx((tx) => challengesFor(tx, 'A', NOW));
    expect(first.list.every((c) => c.done && c.paid)).toBe(true);
    expect(first.paidNow).toHaveLength(3);
    const again = await db.tx((tx) => challengesFor(tx, 'A', NOW));
    expect(again.paidNow).toHaveLength(0);
    const acc = (await db.query<{ shards: number; xp: string }>(`SELECT shards, xp FROM room_zero.accounts WHERE id = 'A'`))[0];
    expect(Number(acc.shards)).toBe(CHALLENGE_REWARDS[1].shards + CHALLENGE_REWARDS[2].shards + CHALLENGE_REWARDS[3].shards);
    expect(Number(acc.xp)).toBe(CHALLENGE_REWARDS[1].xp + CHALLENGE_REWARDS[2].xp + CHALLENGE_REWARDS[3].xp);
  });
  it('unverified runs and yesterday\'s runs never count; a guest sees the list with no progress', async () => {
    await account('B');
    await run('B', 1, { verified: false });
    await db.query(`INSERT INTO room_zero.practice_runs (account_id, run_id, hero, won, seconds, kills, bullets, hits, damage_dealt, damage_taken, pickups, abilities, hp_left, xp, shards, verified, created_at)
      VALUES ('B', 'old', 'benja', true, 40, 5, 40, 20, 200, 0, 1, 1, 50, 10, 1, true, to_timestamp($1))`, [NOW / 1000 - 86400]);
    const r = await db.tx((tx) => challengesFor(tx, 'B', NOW));
    expect(r.list.every((c) => c.progress === 0 && !c.paid)).toBe(true);
    const g = await db.tx((tx) => challengesFor(tx, null, NOW));
    expect(g.list).toHaveLength(3);
    expect(g.paidNow).toHaveLength(0);
  });
});

describe('GET /api/game/challenges', () => {
  it('a guest gets the list; a signed-in account with a done challenge is paid once across two asks', async () => {
    const { handleGame } = await import('../api/_lib/game-api');
    const { SESSION_COOKIE, sign } = await import('../api/_lib/auth');
    const { accountFor } = await import('../api/_lib/game');
    const SECRET = 'test-secret-'.padEnd(48, 'x'), HOST = 'chogroomzero.xyz';
    const id = { provider: 'google' as const, subject: 'g-ch', label: 'c@h.x' };
    const cookie = `${SESSION_COOKIE}=${encodeURIComponent(await sign({ k: 'session', ids: [id], exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET))}`;
    const deps = { env: { AUTH_SECRET: SECRET, AUTH_ORIGIN: `https://${HOST}` }, db: async () => ({ ...db, close: async () => undefined }), fetch: async () => new Response('{}'), now: () => NOW };
    const get = (c?: string) => handleGame(new Request(`https://${HOST}/api/game/challenges`, { headers: c ? { cookie: c } : {} }), 'challenges', deps);
    const guest = (await (await get()).json()) as { signedIn: boolean; list: unknown[] };
    expect(guest.signedIn).toBe(false);
    expect(guest.list).toHaveLength(3);
    const acc = (await accountFor(db, [id]))!;
    await db.query(`INSERT INTO room_zero.practice_runs (account_id, run_id, hero, won, seconds, kills, bullets, hits, damage_dealt, damage_taken, pickups, abilities, hp_left, xp, shards, verified, revives, loots, thrown, created_at)
      VALUES ($1, 'x', 'benja', true, 60, 9, 40, 16, 200, 30, 1, 1, 50, 10, 1, true, 3, 5, 5, to_timestamp($2))`, [acc, NOW / 1000 - 60]);
    const one = (await (await get(cookie)).json()) as { paidNow: { tier: number }[] };
    const two = (await (await get(cookie)).json()) as { paidNow: unknown[] };
    expect(one.paidNow.length).toBeGreaterThan(0);
    expect(two.paidNow).toHaveLength(0);
  });
});
