// GET /api/auth/config: which sign-in methods this deployment can offer. Booleans only, never values.
import { env, googleOk, json, secretOk } from '../_lib/auth.js';

export function GET(): Response {
  const e = env();
  return json({ google: googleOk(e), wallet: secretOk(e) });
}
