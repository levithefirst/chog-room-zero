// V2 (forensic report §3.22, defect check 2026-10-18): logout only cleared the cookie; the signed session stayed valid
// for 30 days anywhere it had been copied. Now a session carries an id, sign-out records it, and every route that
// reaches the database refuses it.
import { beforeEach, describe, expect, it } from 'vitest';
import { handleGame, type Deps } from '../api/_lib/game-api';
import { readLiveSession, sessionCookieWith, SESSION_COOKIE, sign, type Env } from '../api/_lib/auth';
import { migrate, revokeSession, sessionRevoked, type Db } from '../api/_lib/db';
import { memoryDb } from './helpers/pglite';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const HOST = 'chogroomzero.xyz';
const E: Env = { AUTH_SECRET: SECRET, AUTH_ORIGIN: `https://${HOST}` };
let db: Db;
beforeEach(async () => { db = await memoryDb(); await migrate(db); });

const ID = { provider: 'google' as const, subject: 'g-1', label: 'a@b.c' };
const reqWith = (cookie: string, action = 'profile') => new Request(`https://${HOST}/api/game/${action}`, { headers: { cookie, origin: `https://${HOST}` } });
const deps = (): Deps => ({ env: E, db: async () => ({ ...db, close: async () => undefined }), fetch: async () => new Response('{}'), now: () => Date.now() });
const cookieValue = (setCookie: string) => setCookie.split(';')[0];

describe('sign-out revokes the session everywhere', () => {
  it('a new session gets an id; adding an identity keeps it', async () => {
    const c1 = cookieValue(await sessionCookieWith(null, ID, E));
    const s1 = (await readLiveSession(reqWith(c1), E, db))!;
    expect(s1.sid).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    const c2 = cookieValue(await sessionCookieWith(s1, { provider: 'wallet', subject: '0xabc', label: '0xab..c' }, E));
    expect((await readLiveSession(reqWith(c2), E, db))!.sid).toBe(s1.sid);
  });

  it('after sign-out, a copy of the cookie is refused by the game API (profile reads signed out)', async () => {
    const c = cookieValue(await sessionCookieWith(null, ID, E));
    let r = await handleGame(reqWith(c), 'profile', deps());
    expect(((await r.json()) as { signedIn: boolean }).signedIn).toBe(true);
    const s = (await readLiveSession(reqWith(c), E, db))!;
    await revokeSession(db, s.sid!, s.exp);
    await revokeSession(db, s.sid!, s.exp); // idempotent
    expect(await sessionRevoked(db, s.sid!)).toBe(true);
    r = await handleGame(reqWith(c), 'profile', deps());
    expect(((await r.json()) as { signedIn: boolean }).signedIn).toBe(false);
    // Writes refuse it too.
    const w = await handleGame(new Request(`https://${HOST}/api/game/callsign`, { method: 'POST', headers: { cookie: c, origin: `https://${HOST}`, 'content-type': 'application/json' }, body: '{"name":"NEWNAME"}' }), 'callsign', deps());
    expect(w.status).toBe(401);
  });

  it('a session issued before ids existed still works (it runs to its own expiry)', async () => {
    const old = `${SESSION_COOKIE}=${encodeURIComponent(await sign({ k: 'session', ids: [ID], exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET))}`;
    expect((await readLiveSession(reqWith(old), E, db))?.ids).toHaveLength(1);
  });

  it('signing in again after sign-out starts a new session id, never the revoked one', async () => {
    const c = cookieValue(await sessionCookieWith(null, ID, E));
    const s = (await readLiveSession(reqWith(c), E, db))!;
    await revokeSession(db, s.sid!, s.exp);
    const prev = await readLiveSession(reqWith(c), E, db);
    expect(prev).toBeNull();
    const fresh = cookieValue(await sessionCookieWith(prev, ID, E));
    expect((await readLiveSession(reqWith(fresh), E, db))!.sid).not.toBe(s.sid);
  });
});
