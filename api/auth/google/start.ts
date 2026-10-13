// GET /api/auth/google/start: begin Google sign-in (OAuth 2.0 authorization code + PKCE). The state and the PKCE
// verifier live in a short-lived signed HttpOnly cookie on the canonical origin (AUTH_ORIGIN), which is also where
// Google sends the player back (redirect URI: AUTH_ORIGIN + /api/auth/google/callback, registered in Google Cloud).
import { b64url, cookie, env, GOOGLE_COOKIE, GOOGLE_SECONDS, googleOk, json, randomToken, redirect, requestHost, sign } from '../../_lib/auth.js';

export async function GET(req: Request): Promise<Response> {
  const e = env();
  if (!googleOk(e)) return json({ error: 'not_configured' }, 503);
  const origin = new URL(e.AUTH_ORIGIN!);
  // Cookies must be set on the host Google returns to.
  if (requestHost(req) !== origin.host.toLowerCase()) return redirect(`${origin.origin}/api/auth/google/start`);
  const state = randomToken(16);
  const verifier = randomToken(32);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const token = await sign({ state, verifier, exp: Math.floor(Date.now() / 1000) + GOOGLE_SECONDS }, e.AUTH_SECRET!);
  const q = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID!, redirect_uri: `${origin.origin}/api/auth/google/callback`, response_type: 'code',
    scope: 'openid email profile', state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  });
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, [cookie(GOOGLE_COOKIE, token, GOOGLE_SECONDS, '/api/auth/google')]);
}
