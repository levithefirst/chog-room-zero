// GET /api/auth/session: the identities this browser has proven (empty when signed out or not configured).
import { env, json, readSession } from '../_lib/auth';

export async function GET(req: Request): Promise<Response> {
  const s = await readSession(req, env());
  return json({ identities: s?.ids ?? [] });
}
