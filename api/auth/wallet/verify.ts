// POST /api/auth/wallet/verify {message, signature}: the signed message must be exactly the one this browser was
// issued (same nonce, host, address), unexpired, and signed by that address (EIP-191 recovery, server-side). The
// challenge is cleared whatever the outcome, so a signature can be used once. A connected wallet is not signed in
// until this succeeds.
import { CHALLENGE_COOKIE, clearCookie, env, json, parseSiwe, readCookie, readSession, recoverPersonalSign, requestHost, sameOrigin, secretOk, sessionCookieWith, shortAddress, unsign, type Challenge } from '../../_lib/auth';

export async function POST(req: Request): Promise<Response> {
  const e = env();
  if (!secretOk(e)) return json({ error: 'not_configured' }, 503);
  if (!sameOrigin(req, e)) return json({ error: 'bad_origin' }, 403);
  const used = clearCookie(CHALLENGE_COOKIE, '/api/auth/wallet');
  const fail = (error: string, status = 401) => json({ error }, status, { 'set-cookie': used });
  const ch = await unsign<Challenge>(readCookie(req, CHALLENGE_COOKIE), e.AUTH_SECRET!);
  if (!ch) return fail('no_challenge');
  let body: { message?: unknown; signature?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return fail('bad_request', 400); }
  const message = String(body.message ?? '');
  const f = parseSiwe(message);
  if (message !== ch.message || !f || f.nonce !== ch.nonce || f.address !== ch.address || f.domain !== ch.host || f.domain !== requestHost(req)) return fail('mismatch');
  if (Date.parse(f.expires) <= Date.now()) return fail('expired');
  const signer = recoverPersonalSign(message, String(body.signature ?? ''));
  if (!signer || signer !== ch.address) return fail('bad_signature');
  const prev = await readSession(req, e);
  const identity = { provider: 'wallet' as const, subject: signer, label: shortAddress(signer) };
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  h.append('set-cookie', used);
  h.append('set-cookie', await sessionCookieWith(prev, identity, e));
  return new Response(JSON.stringify({ identity }), { status: 200, headers: h });
}
