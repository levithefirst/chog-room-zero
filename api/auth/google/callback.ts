// GET /api/auth/google/callback: Google returns here with ?code&state. Check the state against the signed cookie,
// exchange the code (with the client secret and PKCE verifier, server to server over TLS), read the ID token's
// claims, and add the Google identity to this browser's session. Then back to the game.
import { clearCookie, env, fromB64url, GOOGLE_COOKIE, googleOk, readCookie, readSession, redirect, sessionCookieWith, unsign } from '../../_lib/auth';

interface GoogleClaims { iss?: string; aud?: string; sub?: string; email?: string; email_verified?: boolean; name?: string; exp?: number }

export async function GET(req: Request): Promise<Response> {
  const e = env();
  if (!googleOk(e)) return redirect('/?signin_error=not_configured');
  const origin = new URL(e.AUTH_ORIGIN!).origin;
  const fail = (why: string) => redirect(`${origin}/?signin_error=${why}`, [clearCookie(GOOGLE_COOKIE, '/api/auth/google')]);
  const url = new URL(req.url);
  if (url.searchParams.get('error')) return fail('google_denied');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const saved = await unsign<{ state: string; verifier: string; exp: number }>(readCookie(req, GOOGLE_COOKIE), e.AUTH_SECRET!);
  if (!code || !state || !saved || saved.state !== state) return fail('bad_state');
  let claims: GoogleClaims;
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: e.GOOGLE_CLIENT_ID!, client_secret: e.GOOGLE_CLIENT_SECRET!, redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: 'authorization_code', code_verifier: saved.verifier,
      }),
    });
    if (!r.ok) return fail('token_exchange');
    const tok = (await r.json()) as { id_token?: string };
    const part = tok.id_token?.split('.')[1];
    if (!part) return fail('no_id_token');
    // Received directly from Google's token endpoint over TLS, authenticated with our client secret, so the
    // claims can be read without re-checking the JWT signature (Google's OpenID Connect guidance); the audience,
    // issuer and expiry are still checked.
    claims = JSON.parse(new TextDecoder().decode(fromB64url(part))) as GoogleClaims;
  } catch {
    return fail('token_exchange');
  }
  const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  if (!issOk || claims.aud !== e.GOOGLE_CLIENT_ID || !claims.sub || !claims.exp || claims.exp * 1000 < Date.now()) return fail('bad_token');
  const label = claims.email && claims.email_verified ? claims.email : claims.name ?? 'Google account';
  const prev = await readSession(req, e);
  const session = await sessionCookieWith(prev, { provider: 'google', subject: claims.sub, label }, e);
  return redirect(`${origin}/?signedin=google`, [session, clearCookie(GOOGLE_COOKIE, '/api/auth/google')]);
}
