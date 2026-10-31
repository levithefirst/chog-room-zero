// POST /api/auth/wallet/challenge {address}: a fresh Sign-In with Ethereum message for this host, with a random nonce
// and a 5 minute expiry. The exact message is kept in a signed HttpOnly cookie for this browser only, so the signature
// can only be redeemed here, once, before it expires. The message always names Monad mainnet (chain 143): a chainId in
// the request (the wallet's current chain) is ignored, so a wallet on another network still signs the Monad message.
import { allowedHosts, CHALLENGE_COOKIE, CHALLENGE_SECONDS, checksum, cookie, env, json, randomToken, readJson, requestHost, sameOrigin, secretOk, sign, SIWE_CHAIN_ID, siweMessage } from '../../_lib/auth.js';

export async function POST(req: Request): Promise<Response> {
  const e = env();
  if (!secretOk(e)) return json({ error: 'not_configured' }, 503);
  if (!sameOrigin(req, e)) return json({ error: 'bad_origin' }, 403);
  const host = requestHost(req);
  if (!allowedHosts(e).has(host)) return json({ error: 'bad_host' }, 403);
  const body = await readJson(req, 1000);
  if (!body) return json({ error: 'bad_request' }, 400);
  let address: string;
  try { address = checksum(String(body.address)); } catch { return json({ error: 'bad_address' }, 400); }
  const now = Date.now();
  const nonce = randomToken(12);
  const message = siweMessage({ domain: host, address, uri: `https://${host}`, chainId: SIWE_CHAIN_ID, nonce, issuedAt: new Date(now).toISOString(), expires: new Date(now + CHALLENGE_SECONDS * 1000).toISOString() });
  const token = await sign({ nonce, address, host, message, exp: Math.floor(now / 1000) + CHALLENGE_SECONDS }, e.AUTH_SECRET!);
  return json({ message }, 200, { 'set-cookie': cookie(CHALLENGE_COOKIE, token, CHALLENGE_SECONDS, '/api/auth/wallet', 'Strict') });
}
