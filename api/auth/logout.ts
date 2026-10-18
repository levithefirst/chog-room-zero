// POST /api/auth/logout: forget this browser's session. Same-origin only. The session's id is recorded as signed out
// (room_zero.revoked_sessions), so a copy of the cookie stops working too. If the database is unreachable the cookie
// is still cleared and the reply says the copy could not be revoked.
import { clearCookie, env, json, readSession, sameOrigin, SESSION_COOKIE } from '../_lib/auth.js';
import { openDb, revokeSession } from '../_lib/db.js';

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req, env())) return json({ error: 'bad_origin' }, 403);
  const s = await readSession(req, env());
  let revoked = false;
  if (s?.sid) {
    const db = await openDb().catch(() => null);
    try {
      if (db) { await revokeSession(db, s.sid, s.exp); revoked = true; }
    } catch { /* the cookie is still cleared below */ } finally {
      await db?.close().catch(() => undefined);
    }
  }
  return json({ ok: true, revoked }, 200, { 'set-cookie': clearCookie(SESSION_COOKIE) });
}
