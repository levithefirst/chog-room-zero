// GP medals and leaderboards (owner 2026-10-17; H34 2026-10-19: 40 medals, ~30% harder): rarities that mean something, awarded on the server
// from stored runs and settled matches only; real boards where the signed-in player always sees their own rank, test
// accounts and hidden players left out, paged. Real Postgres engine (PGlite) behind the real API handler.
import { beforeEach, describe, expect, it } from 'vitest';
import { handleGame, type Deps } from '../api/_lib/game-api';
import { SESSION_COOKIE, sign } from '../api/_lib/auth';
import { migrate, type Db } from '../api/_lib/db';
import { memoryDb } from './helpers/pglite';
import { accountFor, leaderboard, settleMatch, type MatchRecord } from '../api/_lib/game';
import { awardDue, validPractice } from '../api/_lib/career';
import { MEDALS, medalsDue, NO_ONLINE, type RunFacts } from '../src/ui/medals';
import { HEROES, squadFor } from '../src/config/heroes';
import { createWorld, player, stepWorld } from '../src/sim/world';
import { createAutopilot } from '../src/debug/autopilot';
import { TUNING } from '../src/config/tuning';
import { medalsScreenHtml, boardScreenHtml } from '../src/ui/hub';
import { medalCard } from '../src/ui/screens';
import { emptyAcct } from '../src/ui/account';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const HOST = 'chogroomzero.xyz';
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
const run = (o: Partial<Record<string, unknown>> = {}) => ({ runId: `run-${++n}-abcdef`, hero: 'benja', won: false, seconds: 70, kills: 1, bullets: 40, hits: 15, damageDealt: 300, damageTaken: 60, hpLeft: 0, pickups: 1, abilities: 1, ...o });
async function ticketed(c: string, r: ReturnType<typeof run>) {
  const t = (await call('POST', 'practice-start', c)).j as { ticket: string; runId: string };
  clock += (Number(r.seconds) + 10) * 1000;
  return call('POST', 'practice', c, { ...r, runId: t.runId, ticket: t.ticket });
}
const facts = (o: Partial<RunFacts> = {}): RunFacts => ({ hero: 'benja', won: false, seconds: 30, kills: 0, bullets: 0, hits: 0, damageTaken: 10, hpLeft: 50, pickups: 0, abilities: 0, ...o });
const emptyRec = () => ({ overall: { bestWinSeconds: null, mostKills: 0, runs: 0, wins: 0, kills: 0, bullets: 0, hits: 0, damageDealt: 0, damageTaken: 0, seconds: 0, pickups: 0, abilities: 0, revives: 0, loots: 0, thrown: 0 }, heroes: {} });

beforeEach(async () => { db = await memoryDb(); await migrate(db); clock = Date.now(); });

describe('the medal roster', () => {
  it('40 medals (H34), unique ids: 19 common, 12 uncommon, 7 rare, 2 epic; every RC-7 and GP id is still there', () => {
    expect(MEDALS).toHaveLength(40);
    expect(new Set(MEDALS.map((m) => m.id)).size).toBe(40);
    const by = (r: string) => MEDALS.filter((m) => m.rarity === r).length;
    expect([by('common'), by('uncommon'), by('rare'), by('epic')]).toEqual([19, 12, 7, 2]);
    for (const id of ['grenadier', 'pack-rat', 'online-hunter', 'iron-wall']) expect(MEDALS.some((m) => m.id === id), id).toBe(true);
    // About 30% harder: every career count that can grow did (old -> new).
    const goal = (id: string) => MEDALS.find((m) => m.id === id)!.goal;
    for (const [id, was] of [['regular', 10], ['committed', 25], ['veteran', 100], ['ten-down', 10], ['exterminator', 25], ['centurion', 100], ['lifeline', 5], ['guardian', 25], ['picker', 15], ['pin-puller', 10], ['heavy-hitter', 2000], ['online-regular', 10], ['online-ace', 10], ['ten-clears', 10], ['survivor', 90], ['scavenger', 3], ['toolkit', 3], ['hoarder', 6]] as const)
      expect(goal(id) / was, id).toBeGreaterThanOrEqual(1.25);
    for (const id of ['first-blood', 'cleared', 'regular', 'scavenger', 'toolkit', 'exterminator', 'survivor', 'in-and-out', 'steady-hand', 'close-call', 'untouched', 'full-squad'])
      expect(MEDALS.some((m) => m.id === id), id).toBe(true);
  });
  it('rare and epic need hard things: a fast clear, a full roster, 130 downs, a last stand, 33 revives, 13 online wins, a near-clean clear, no damage, all five yourself', () => {
    const due = (f: Partial<RunFacts>, rec = emptyRec(), online = NO_ONLINE) => medalsDue({}, rec, facts(f), online).filter((m) => m.rarity === 'rare' || m.rarity === 'epic').map((m) => m.id).sort();
    // An ordinary good win: nothing rare.
    expect(due({ won: true, seconds: 85, kills: 2, damageTaken: 40, hpLeft: 60 })).toEqual([]);
    expect(due({ won: true, seconds: 24, kills: 2, damageTaken: 40 })).toEqual(['in-and-out']);
    expect(due({ won: true, seconds: 25, kills: 2, damageTaken: 40 })).toEqual([]);
    expect(due({ won: true, seconds: 80, kills: 4, alliesLost: 2, damageTaken: 40 })).toEqual(['last-stand']);
    expect(due({ won: true, seconds: 80, kills: 3, alliesLost: 2, damageTaken: 40 })).toEqual([]);
    expect(due({ won: true, seconds: 80, kills: 1, damageTaken: 0 })).toEqual(['iron-wall', 'untouched']);
    expect(due({ won: true, seconds: 80, kills: 1, damageTaken: 30 })).toEqual(['iron-wall']);
    expect(due({ won: true, seconds: 80, kills: 1, damageTaken: 30, alliesLost: 1 })).toEqual([]);
    expect(due({ won: false, seconds: 80, kills: 5, damageTaken: 0 })).toEqual([]);
    expect(due({ won: true, seconds: 80, kills: 5, damageTaken: 40 })).toEqual(['ace']);
    expect(due({ won: true, seconds: 80, kills: 5, damageTaken: 40, revived: 1 })).toEqual([]);
    expect(due({ won: true, seconds: 80, kills: 5, damageTaken: 40, alliesLost: 1 })).toEqual([]);
    const rec = emptyRec();
    rec.overall.kills = 129; rec.overall.revives = 32;
    expect(due({}, rec)).toEqual([]);
    rec.overall.kills = 130; rec.overall.revives = 33;
    expect(due({}, rec)).toEqual(['centurion', 'guardian']);
    expect(due({}, emptyRec(), { matches: 14, finished: 14, wins: 12, kills: 30 })).toEqual([]);
    expect(due({}, emptyRec(), { matches: 14, finished: 14, wins: 13, kills: 30 })).toEqual(['online-ace']);
  });
  it('not handed out casually: over 84 real default-game runs (autopilot), each epic in at most 1, each rare one-run medal in under 10%', () => {
    const hits = new Map<string, number>();
    let runs = 0;
    for (let seed = 1; seed <= 12; seed++) for (const h of HEROES) {
      const w = createWorld({ seed, hero: h.id, zone: true, allies: squadFor(h.id, seed) });
      const ap = createAutopilot(seed, 3);
      const p = player(w);
      let pickups = 0, abilities = 0;
      for (let i = 0; i < 120 * 60 && w.outcome === 'playing'; i++) {
        const cd = p.abilityCd;
        stepWorld(w, ap.next(w));
        pickups += w.sounds.filter((s) => s.type === 'pickup' && s.sourceId === 0).length;
        if (p.abilityCd > cd) abilities++;
      }
      runs++;
      const f = facts({ hero: h.id, won: w.outcome === 'won', seconds: Math.round(w.tick * TUNING.simStepSeconds), kills: p.kills, bullets: p.bullets, hits: p.hits, damageTaken: Math.round(p.damageTaken),
        hpLeft: Math.max(0, Math.round(p.hp)), pickups, abilities, revives: p.revives, revived: p.revived, loots: p.loots, thrown: p.thrown,
        alliesLost: w.actors.filter((a) => a !== p && a.team === 'player' && !a.alive).length });
      for (const m of medalsDue({}, emptyRec(), f, NO_ONLINE)) hits.set(m.id, (hits.get(m.id) ?? 0) + 1);
    }
    const share = (id: string) => (hits.get(id) ?? 0) / runs;
    (globalThis as { process?: { stdout: { write(s: string): void } } }).process?.stdout.write(`\nGP_MEDALS runs ${runs} ${JSON.stringify(Object.fromEntries(hits))}\n`);
    for (const m of MEDALS.filter((x) => x.rarity === 'epic')) expect(hits.get(m.id) ?? 0, m.id).toBeLessThanOrEqual(1);
    for (const id of ['in-and-out', 'last-stand', 'iron-wall']) expect(share(id), id).toBeLessThan(0.1);
    // And the commons do come: most runs earn something ordinary.
    expect(share('hat-trick')).toBeGreaterThan(0.3);
    expect(share('scavenger')).toBeGreaterThan(0.3);
  }, 300000);
  it('the medals screen: 40 cards in four groups; locked ones are disabled and show progress, earned ones can be pinned', () => {
    const c = { medals: { 'first-blood': '2026-10-17T00:00:00.000Z' }, records: emptyRec(), profile: { pinned: [] as string[] }, acct: emptyAcct() } as unknown as Parameters<typeof medalCard>[1];
    const html = medalsScreenHtml(c as never, (m) => medalCard(m, c));
    expect((html.match(/class="medal[ "]/g) ?? []).length).toBe(40);
    expect((html.match(/class="medal-group/g) ?? []).length).toBe(4);
    expect(html).toContain('data-pin="first-blood"');
    expect((html.match(/ disabled aria-label/g) ?? []).length).toBe(39);
    expect(html).toMatch(/Medals <span class="num">1\/40/);
  });
});

describe('medals on the server', () => {
  it('awarded once from stored verified runs; a second identical post and a replay add nothing; another account gets nothing', async () => {
    const a = await cookie('a'), b = await cookie('b');
    const r1 = await ticketed(a, run({ kills: 1 }));
    expect(r1.j.earned).toContain('first-blood');
    const r2 = await ticketed(a, run({ kills: 1 }));
    expect(r2.j.earned ?? []).not.toContain('first-blood');
    const same = await call('POST', 'practice', a, { ...run({ kills: 1 }), runId: (await db.query<{ run_id: string }>('SELECT run_id FROM room_zero.practice_runs LIMIT 1'))[0].run_id });
    expect(same.j.earned ?? []).toEqual([]);
    const pb = (await call('GET', 'profile', b)).j;
    expect(Object.keys(pb.profile.medals)).toEqual([]);
    const rows = await db.query<{ n: string }>(`SELECT count(*) AS n FROM room_zero.medals WHERE medal_id = 'first-blood'`);
    expect(Number(rows[0].n)).toBe(1);
  });
  it('an unticketed run (no proof of time) earns nothing; out-of-bounds revive or loot counts are refused', async () => {
    const a = await cookie('a');
    const r = await call('POST', 'practice', a, run({ kills: 1 }));
    expect(r.j.earned ?? []).toEqual([]);
    expect(validPractice(run({ revives: 21 }))).toBeNull();
    expect(validPractice(run({ loots: -1 }))).toBeNull();
    expect(validPractice(run({ alliesLost: 3 }))).toBeNull();
    expect(validPractice(run({ seconds: 10, revives: 4 }))).toBeNull(); // 4 revives take 12 s
    expect(validPractice(run({ revives: 2, revived: 1, loots: 3, thrown: 4, alliesLost: 1 }))).toMatchObject({ revives: 2, revived: 1, loots: 3, thrown: 4, alliesLost: 1 });
  });
  it('online medals come from settled matches only: debut and first win after a won match, once', async () => {
    const acc = (await accountFor(db, [{ provider: 'google', subject: 'o', label: 'o' }]))!;
    const foe = (await accountFor(db, [{ provider: 'google', subject: 'f', label: 'f' }]))!;
    const m: MatchRecord = { id: 'aa11bb22cc33', mode: '1v1', demo: false, winner: 'alpha', reason: 'eliminated', seconds: 90, endedAt: 1_760_000_000,
      players: [{ acc, team: 'alpha', tier: 'free', tok: null, mid: null, own: null, kills: 1, damage: 120, left: false, name: 'O' }, { acc: foe, team: 'bravo', tier: 'free', tok: null, mid: null, own: null, kills: 0, damage: 30, left: false, name: 'F' }] };
    await settleMatch(db, m);
    const got = await db.tx((tx) => awardDue(tx, acc, null));
    expect(got.sort()).toEqual(['first-blood', 'online-debut', 'online-win'].sort());
    expect(await db.tx((tx) => awardDue(tx, acc, null))).toEqual([]);
    expect((await db.tx((tx) => awardDue(tx, foe, null))).sort()).toEqual(['online-debut']);
  });
});

describe('the leaderboards', () => {
  it('solo board: the real player is listed by checked solo kills and always gets their own rank, even far down', async () => {
    const me = await cookie('me');
    for (let i = 0; i < 25; i++) { const c = await cookie(`p${i}`); await ticketed(c, run({ kills: 5, won: true, seconds: 80 })); if (i % 2) await ticketed(c, run({ kills: 3 })); }
    await ticketed(me, run({ kills: 1 }));
    const b = (await call('GET', 'leaderboard?board=solo', me)).j;
    expect(b.board).toBe('solo');
    expect(b.rows).toHaveLength(20);
    expect(b.total).toBe(26);
    expect(b.me).toMatchObject({ rank: 26, kills: 1, you: true });
    expect(b.rows.some((r: { you: boolean }) => r.you)).toBe(false);
    const p2 = (await call('GET', 'leaderboard?board=solo&offset=20', me)).j;
    expect(p2.rows.map((r: { rank: number }) => r.rank)).toEqual([21, 22, 23, 24, 25, 26]);
    expect(p2.rows[5].you).toBe(true);
    // No duplicate rows across pages, ranks are 1..26 once each.
    const all = [...b.rows, ...p2.rows].map((r: { rank: number }) => r.rank);
    expect(new Set(all).size).toBe(26);
  });
  it('online board stays the owner\'s: kills in settled online matches; unticketed practice never counts anywhere', async () => {
    const me = await cookie('me');
    await call('POST', 'practice', me, run({ kills: 5 })); // no ticket: stored, never verified
    const solo = (await call('GET', 'leaderboard?board=solo', me)).j;
    expect(solo.rows).toHaveLength(0);
    expect(solo.me).toBeNull();
    const online = (await call('GET', 'leaderboard?board=online', me)).j;
    expect(online.rows).toHaveLength(0);
  });
  it('hidden players and the smoke test accounts are not listed for anyone else; you still see your own rank', async () => {
    const a = await cookie('a'), b = await cookie('b'), smoke = await cookie('smoke');
    await ticketed(a, run({ kills: 4 }));
    await ticketed(b, run({ kills: 2 }));
    await ticketed(smoke, run({ kills: 3 }));
    const smokeAcc = (await accountFor(db, [{ provider: 'google', subject: 'smoke', label: 'smoke' }]))!;
    await db.query(`UPDATE room_zero.accounts SET display_name = 'SmokeA' WHERE id = $1`, [smokeAcc]);
    // The migration's rule for the old smoke accounts, and the smoke's own preference from now on.
    await call('POST', 'prefs', smoke, { hidden: true });
    const seenByB = (await call('GET', 'leaderboard?board=solo', b)).j;
    expect(seenByB.rows.map((r: { name: string }) => r.name)).not.toContain('SmokeA');
    expect(seenByB.total).toBe(2);
    expect(seenByB.me.rank).toBe(2);
    await call('POST', 'prefs', a, { hidden: true });
    const seenByB2 = (await call('GET', 'leaderboard?board=solo', b)).j;
    expect(seenByB2.rows).toHaveLength(1);
    expect(seenByB2.me.rank).toBe(1);
    const seenByA = (await call('GET', 'leaderboard?board=solo', a)).j;
    expect(seenByA.me).toMatchObject({ rank: 1, kills: 4, hidden: true });
    expect(seenByA.rows.some((r: { you: boolean }) => r.you)).toBe(false);
    expect((await call('POST', 'prefs', a, { hidden: 'yes' })).status).toBe(400);
  });
  it('a guest sees the board and no rank; a bad board or offset is clamped, never an error', async () => {
    const c = await cookie('a');
    await ticketed(c, run({ kills: 2 }));
    const g = (await call('GET', 'leaderboard?board=solo')).j;
    expect(g.signedIn).toBe(false);
    expect(g.me).toBeNull();
    expect(g.rows).toHaveLength(1);
    expect((await call('GET', 'leaderboard?board=../../x&offset=-9')).status).toBe(200);
    expect((await call('GET', 'leaderboard?board=solo&offset=99999999')).j.rows).toEqual([]);
  });
  it('switching accounts switches the "you" row', async () => {
    const a = await cookie('a'), b = await cookie('b');
    await ticketed(a, run({ kills: 3 }));
    await ticketed(b, run({ kills: 1 }));
    expect((await call('GET', 'leaderboard?board=solo', a)).j.me.rank).toBe(1);
    expect((await call('GET', 'leaderboard?board=solo', b)).j.me.rank).toBe(2);
    const rows = (await call('GET', 'leaderboard?board=solo', b)).j.rows as { you: boolean; kills: number }[];
    expect(rows.find((r) => r.you)!.kills).toBe(1);
  });
  it('the board screen: tabs, my rank card, the you row highlighted, a pager, and loading, error and empty states', () => {
    const a = emptyAcct();
    a.config = { db: true, nftCombat: true, demo: true };
    a.signedIn = true;
    const ctx = (o: Partial<typeof a>) => ({ acct: { ...a, ...o } }) as never;
    expect(boardScreenHtml(ctx({ board: null }))).toContain('Loading');
    expect(boardScreenHtml(ctx({ boardError: true }))).toContain('data-act="board-retry"');
    expect(boardScreenHtml(ctx({ board: [] }))).toContain('No one on this board yet');
    const row = (rank: number, you = false) => ({ rank, name: `P${rank}`, kills: 30 - rank, matches: 3, wins: 1, xp: 0, level: 1, rating: 1000, nftTier: null, hero: 'ray', you });
    const html = boardScreenHtml(ctx({ board: Array.from({ length: 20 }, (_, i) => row(i + 1)), boardMe: row(47, true), boardTotal: 60 }));
    expect(html).toContain('#47');
    expect(html).toContain('data-act="board-next"');
    expect(html).toContain('class="me"');
    expect(html).toContain('aria-selected="true" data-act="board-solo"');
    const guest = boardScreenHtml({ acct: { ...a, signedIn: false, board: [] } } as never);
    expect(guest).toContain('Sign in to keep your kills');
  });
  it('query cost: the board reads with the account index (EXPLAIN on a 2,000-row match table)', async () => {
    const accs: string[] = [];
    for (let i = 0; i < 40; i++) accs.push((await accountFor(db, [{ provider: 'google', subject: `x${i}`, label: 'x' }]))!);
    for (let i = 0; i < 1000; i++) {
      const id = (0x10000000 + i).toString(16);
      await settleMatch(db, { id, mode: '1v1', demo: false, winner: 'alpha', reason: 'eliminated', seconds: 90, endedAt: 1_760_000_000,
        players: [{ acc: accs[i % 40], team: 'alpha', tier: 'free', tok: null, mid: null, own: null, kills: 1, damage: 10, left: false }, { acc: accs[(i + 1) % 40], team: 'bravo', tier: 'free', tok: null, mid: null, own: null, kills: 0, damage: 0, left: false }] });
    }
    const t0 = performance.now();
    const b = await leaderboard(db, 20, accs[7], { board: 'online' });
    const ms = performance.now() - t0;
    expect(b.rows).toHaveLength(20);
    expect(b.me?.you).toBe(true);
    expect(ms).toBeLessThan(1500);
    const idx = await db.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE schemaname = 'room_zero' AND tablename = 'match_players'`);
    expect(idx.map((r) => r.indexname)).toContain('match_players_account');
  }, 120000);
});
