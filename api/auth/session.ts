// GET /api/auth/session: the identities this browser has proven (empty when signed out, signed out elsewhere with a
// copied cookie, or not configured).
import { env, json, readLiveSession } from '../_lib/auth.js';
import { openDb } from '../_lib/db.js';

export async function GET(req: Request): Promise<Response> {
  const db = await openDb().catch(() => null);
  try {
    const s = await readLiveSession(req, env(), db).catch(() => null);
    return json({ identities: s?.ids ?? [] });
  } finally {
    await db?.close().catch(() => undefined);
  }
}
