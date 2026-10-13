// POST /api/auth/logout: forget this browser's session. Same-origin only.
import { clearCookie, env, json, sameOrigin, SESSION_COOKIE } from '../_lib/auth';

export function POST(req: Request): Response {
  if (!sameOrigin(req, env())) return json({ error: 'bad_origin' }, 403);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(SESSION_COOKIE) });
}
