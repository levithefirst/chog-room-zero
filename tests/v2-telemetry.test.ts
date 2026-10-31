// V2 playtest telemetry (owner V2 §4, report rank 1): one anonymous record per match, validated and clamped on the
// server, rate-limited per install, aggregated for the day-30 gate questions; no account, name, address or IP.
import { beforeEach, describe, expect, it } from 'vitest';
import { handleGame, type Deps } from '../api/_lib/game-api';
import { migrate, REPORTS_PER_MINUTE, type Db } from '../api/_lib/db';
import { deviceClass, median, validReport, type MatchReport } from '../src/sim/report';
import { memoryDb } from './helpers/pglite';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const HOST = 'chogroomzero.xyz';
let db: Db;
beforeEach(async () => { db = await memoryDb(); await migrate(db); });
const deps = (): Deps => ({ env: { AUTH_SECRET: SECRET, AUTH_ORIGIN: `https://${HOST}` }, db: async () => ({ ...db, close: async () => undefined }), fetch: async () => new Response('{}'), now: () => Date.now() });
const post = (body: unknown, origin = `https://${HOST}`) => handleGame(new Request(`https://${HOST}/api/game/report`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), 'report', deps());

const good = (o: Partial<MatchReport> = {}): MatchReport => ({
  v: 1, anon: 'abcdefghijklmnop1234', mode: 'solo', hero: 'benja', outcome: 'lost', seconds: 84, cause: 'shot', killer: 'bot', noCue: true,
  damageTaken: 160, firstContactS: 9, bullets: 120, hits: 40, fireDelayMs: 140, kills: 2, aiKills: 1, aiRevives: 1, aiLoots: 3, aiLost: 0,
  revives: 0, revived: 1, downs: 2, bledOut: 0, loots: 1, lootExpired: 2, zoneDeaths: 0, perk: 'ears', rttMs: null, queueS: null,
  device: { input: 'touch', screen: 's', browser: 'safari' }, ...o,
});

describe('the record', () => {
  it('a real report passes unchanged; numbers are clamped; anything else is refused', () => {
    expect(validReport(good())).toEqual(good());
    expect(validReport(good({ kills: 99, seconds: 99999, hits: 500, bullets: 100 }))).toMatchObject({ kills: 10, seconds: 1800, hits: 100 });
    for (const bad of [null, {}, { ...good(), v: 2 }, { ...good(), anon: 'short' }, { ...good(), mode: '2v2' }, { ...good(), hero: '<b>x' }, { ...good(), device: { input: 'vr', screen: 's', browser: 'safari' } }])
      expect(validReport(bad)).toBeNull();
  });
  it('carries nothing personal: no name, account, wallet, address or free text survives validation', () => {
    const r = validReport({ ...good(), name: 'Alice', account: 'acc-1', wallet: '0xabc', email: 'a@b.c', note: 'hi' }) as unknown as Record<string, unknown>;
    for (const k of ['name', 'account', 'wallet', 'email', 'note']) expect(r[k]).toBeUndefined();
  });
  it('device class: family and size only', () => {
    expect(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 844, 390, true)).toEqual({ input: 'touch', screen: 's', browser: 'safari' });
    expect(deviceClass('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36', 915, 412, true).browser).toBe('chrome');
    expect(deviceClass('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 1920, 1080, false)).toEqual({ input: 'pc', screen: 'l', browser: 'firefox' });
    expect(median([300, 100, 200])).toBe(200);
    expect(median([])).toBeNull();
  });
});

describe('the endpoint', () => {
  it('stores a valid report, refuses a bad one and a foreign origin, and rate-limits an install', async () => {
    expect((await post(good())).status).toBe(200);
    expect((await post({ v: 1 })).status).toBe(400);
    expect((await post(good(), 'https://evil.site')).status).toBe(403);
    for (let i = 1; i < REPORTS_PER_MINUTE; i++) expect((await post(good())).status).toBe(200);
    expect((await post(good())).status).toBe(429);
    expect((await post(good({ anon: 'zzzzzzzzzzzzzzzzzzzz' }))).status).toBe(200);
    const rows = await db.query<{ n: string }>(`SELECT count(*) AS n FROM room_zero.match_reports`);
    expect(Number(rows[0].n)).toBe(REPORTS_PER_MINUTE + 1);
  });
  it('the summary answers the playtest questions in aggregate (no rows)', async () => {
    await post(good());
    await post(good({ anon: 'bbbbbbbbbbbbbbbbbbbb', outcome: 'won', cause: null, killer: null, noCue: false, fireDelayMs: 100, downs: 1, revived: 1 }));
    await post(good({ anon: 'cccccccccccccccccccc', mode: '1v1', outcome: 'lost', cause: 'shot', killer: 'player', noCue: false, fireDelayMs: 220, rttMs: 90, queueS: 12 }));
    const r = await handleGame(new Request(`https://${HOST}/api/game/report-summary`), 'report-summary', deps());
    const s = (await r.json()) as Record<string, any>;
    expect(s).toMatchObject({ matches: 3, players: 3, solo: 2, online: 1, winShare: 0.333, medianFireDelayMs: 140 });
    expect(s.noCueShareOfShotDeaths).toBe(0.5);
    expect(s.deaths).toEqual({ shot: 2, zone: 0, bledOut: 0 });
    expect(JSON.stringify(s)).not.toContain('abcdefghijklmnop1234');
  });
});
