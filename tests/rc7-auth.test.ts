// RC-7 sign-in: the /api/auth functions, called directly with Web Requests. Wallet sign-in is a real EIP-4361 +
// EIP-191 round trip with a secp256k1 key; Google is checked up to the token exchange (Google's endpoint mocked).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { checksum, hex, recoverPersonalSign, sign, unsign, b64url } from '../api/_lib/auth';
import { GET as config } from '../api/auth/config';
import { GET as session } from '../api/auth/session';
import { POST as logout } from '../api/auth/logout';
import { POST as challenge } from '../api/auth/wallet/challenge';
import { POST as verify } from '../api/auth/wallet/verify';
import { GET as gStart } from '../api/auth/google/start';
import { GET as gCallback } from '../api/auth/google/callback';

declare const process: { env: Record<string, string | undefined> };

const SECRET = 'test-secret-'.padEnd(48, 'x');
const HOST = 'chogroomzero.xyz';
const KEYS = ['AUTH_SECRET', 'AUTH_ORIGIN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AUTH_ALLOWED_HOSTS', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL'];
let saved: Record<string, string | undefined> = {};
beforeEach(() => { saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); for (const k of KEYS) delete process.env[k]; });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } vi.restoreAllMocks(); });
const configure = (google = false) => {
  process.env.AUTH_SECRET = SECRET; process.env.AUTH_ORIGIN = `https://${HOST}`;
  if (google) { process.env.GOOGLE_CLIENT_ID = 'cid.apps.googleusercontent.com'; process.env.GOOGLE_CLIENT_SECRET = 'shh'; }
};

// Helpers: a wallet, cookies carried between calls, requests from the game page.
function wallet() {
  const sk = secp256k1.utils.randomSecretKey();
  const pub = secp256k1.getPublicKey(sk, false);
  const address = checksum(hex(keccak_256(pub.subarray(1)).subarray(12)));
  const personalSign = (message: string) => {
    const m = new TextEncoder().encode(message);
    const digest = keccak_256(new Uint8Array([...new TextEncoder().encode(`\x19Ethereum Signed Message:\n${m.length}`), ...m]));
    const rec = secp256k1.sign(digest, sk, { prehash: false, format: 'recovered' });
    return '0x' + hex(rec.subarray(1)) + (27 + rec[0]).toString(16);
  };
  return { address, personalSign };
}
const cookieOf = (r: Response, name: string) => r.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith(`${name}=`));
function post(path: string, body: unknown, cookies: (string | undefined)[] = [], origin = `https://${HOST}`, host = HOST) {
  return new Request(`https://${host}${path}`, { method: 'POST', body: JSON.stringify(body), headers: { origin, host, 'content-type': 'application/json', cookie: cookies.filter(Boolean).join('; ') } });
}
const get = (path: string, cookies: (string | undefined)[] = [], host = HOST) => new Request(`https://${host}${path}`, { headers: { host, cookie: cookies.filter(Boolean).join('; ') } });

describe('RC-7 auth basics', () => {
  it('config reports only booleans, and nothing without AUTH_SECRET', async () => {
    expect(await config().json()).toEqual({ google: false, wallet: false });
    process.env.AUTH_SECRET = 'short';
    expect(await config().json()).toEqual({ google: false, wallet: false });
    configure();
    expect(await config().json()).toEqual({ google: false, wallet: true });
    configure(true);
    const body = await config().text();
    expect(JSON.parse(body)).toEqual({ google: true, wallet: true });
    expect(body).not.toContain('shh');
  });
  it('signed tokens reject tampering, a wrong secret and expiry', async () => {
    const t = await sign({ a: 1, exp: Math.floor(Date.now() / 1000) + 60 }, SECRET);
    expect(await unsign(t, SECRET)).toMatchObject({ a: 1 });
    expect(await unsign(t, SECRET + 'y')).toBeNull();
    const [body, mac] = t.split('.');
    const forged = b64url(new TextEncoder().encode(JSON.stringify({ a: 2, exp: 9e9 })));
    expect(await unsign(`${forged}.${mac}`, SECRET)).toBeNull();
    expect(await unsign(`${body}.${mac}`, SECRET, Date.now() + 61_000)).toBeNull();
  });
  it('EIP-55 checksum and EIP-191 recovery match public test vectors', () => {
    expect(checksum('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
    // web3.js docs: web3.eth.accounts.sign('Some data', '0x4c0883a6...') from 0x2c7536E3...
    expect(recoverPersonalSign('Some data', '0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c'))
      .toBe('0x2c7536E3605D9C16a7a3D7b1898e529396a65c23');
    expect(recoverPersonalSign('Some data', '0x1234')).toBeNull();
  });
});

describe('RC-7 wallet sign-in (SIWE)', () => {
  it('connect is not sign-in: challenge -> sign -> verify -> session, and the challenge is single-use', async () => {
    configure();
    const w = wallet();
    const c = await challenge(post('/api/auth/wallet/challenge', { address: w.address.toLowerCase(), chainId: 10143 }));
    expect(c.status).toBe(200);
    const { message } = (await c.json()) as { message: string };
    expect(message).toMatch(new RegExp(`^${HOST} wants you to sign in with your Ethereum account:\\n${w.address}\\n`));
    // The wallet reported 10143; the message always names Monad mainnet (143).
    expect(message).toMatch(/Chain ID: 143\nNonce: \S+\nIssued At: \S+\nExpiration Time: \S+$/);
    const ch = cookieOf(c, 'chog_wallet_challenge');
    expect(c.headers.getSetCookie()[0]).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    // Before verify there is no session.
    expect(await (await session(get('/api/auth/session'))).json()).toEqual({ identities: [] });
    const v = await verify(post('/api/auth/wallet/verify', { message, signature: w.personalSign(message) }, [ch]));
    expect(v.status).toBe(200);
    expect(await v.json()).toEqual({ identity: { provider: 'wallet', subject: w.address, label: `${w.address.slice(0, 6)}…${w.address.slice(-4)}` } });
    const sess = cookieOf(v, 'chog_session');
    expect(cookieOf(v, 'chog_wallet_challenge')).toBe('chog_wallet_challenge='); // cleared
    expect(await (await session(get('/api/auth/session', [sess]))).json()).toEqual({ identities: [{ provider: 'wallet', subject: w.address, label: expect.any(String) }] });
    // Replaying the same signature without the (now cleared) challenge fails.
    const again = await verify(post('/api/auth/wallet/verify', { message, signature: w.personalSign(message) }, [sess]));
    expect(again.status).toBe(401);
    expect(await again.json()).toEqual({ error: 'no_challenge' });
  });
  it('rejects a signature from another key, an edited message, another host, and a foreign origin', async () => {
    configure();
    const w = wallet(), thief = wallet();
    const start = async () => {
      const c = await challenge(post('/api/auth/wallet/challenge', { address: w.address, chainId: 1 }));
      return { message: ((await c.json()) as { message: string }).message, ch: cookieOf(c, 'chog_wallet_challenge') };
    };
    let s = await start();
    expect(await (await verify(post('/api/auth/wallet/verify', { message: s.message, signature: thief.personalSign(s.message) }, [s.ch]))).json()).toEqual({ error: 'bad_signature' });
    s = await start();
    const edited = s.message.replace('Chain ID: 1', 'Chain ID: 2');
    expect(await (await verify(post('/api/auth/wallet/verify', { message: edited, signature: w.personalSign(edited) }, [s.ch]))).json()).toEqual({ error: 'mismatch' });
    s = await start();
    process.env.AUTH_ALLOWED_HOSTS = 'evil.example';
    expect(await (await verify(post('/api/auth/wallet/verify', { message: s.message, signature: w.personalSign(s.message) }, [s.ch], 'https://evil.example', 'evil.example'))).json()).toEqual({ error: 'mismatch' });
    expect((await challenge(post('/api/auth/wallet/challenge', { address: w.address, chainId: 1 }, [], 'https://other.site'))).status).toBe(403);
    expect((await challenge(post('/api/auth/wallet/challenge', { address: 'nope', chainId: 1 }))).status).toBe(400);
  });
  it('an expired challenge cannot be redeemed', async () => {
    configure();
    const w = wallet();
    const c = await challenge(post('/api/auth/wallet/challenge', { address: w.address, chainId: 1 }));
    const { message } = (await c.json()) as { message: string };
    const ch = cookieOf(c, 'chog_wallet_challenge');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 5 * 60_000 + 1000);
    const r = await verify(post('/api/auth/wallet/verify', { message, signature: w.personalSign(message) }, [ch]));
    expect(r.status).toBe(401);
  });
  it('not configured: 503, never a session', async () => {
    const r = await challenge(post('/api/auth/wallet/challenge', { address: wallet().address, chainId: 1 }));
    expect(r.status).toBe(503);
  });
});

describe('RC-7 Google sign-in', () => {
  it('not configured: 503 (no redirect to Google)', async () => {
    configure();
    expect((await gStart(get('/api/auth/google/start'))).status).toBe(503);
  });
  it('start: PKCE S256 + state, redirect URI on the canonical origin, state cookie HttpOnly', async () => {
    configure(true);
    const r = await gStart(get('/api/auth/google/start'));
    expect(r.status).toBe(302);
    const to = new URL(r.headers.get('location')!);
    expect(to.origin + to.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(to.searchParams.get('redirect_uri')).toBe(`https://${HOST}/api/auth/google/callback`);
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    expect(to.searchParams.get('client_id')).toBe('cid.apps.googleusercontent.com');
    expect(to.searchParams.has('client_secret')).toBe(false);
    expect(r.headers.getSetCookie()[0]).toMatch(/^chog_google_state=.*HttpOnly; Secure/);
    // From another host it first moves to the canonical origin, so the state cookie lands where Google returns.
    const moved = await gStart(get('/api/auth/google/start', [], 'chog-room-zero.vercel.app'));
    expect(moved.headers.get('location')).toBe(`https://${HOST}/api/auth/google/start`);
  });
  async function callbackWith(claims: object, stateOverride?: string) {
    const s = await gStart(get('/api/auth/google/start'));
    const state = new URL(s.headers.get('location')!).searchParams.get('state')!;
    const gc = cookieOf(s, 'chog_google_state');
    const idt = `x.${b64url(new TextEncoder().encode(JSON.stringify(claims)))}.y`;
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id_token: idt }), { status: 200 }));
    const r = await gCallback(get(`/api/auth/google/callback?code=abc&state=${stateOverride ?? state}`, [gc]));
    return { r, f };
  }
  const good = () => ({ iss: 'https://accounts.google.com', aud: 'cid.apps.googleusercontent.com', sub: '1234567890', email: 'a@b.co', email_verified: true, exp: Math.floor(Date.now() / 1000) + 600 });
  it('callback: exchanges the code with the secret and verifier, then sets a session with the Google identity', async () => {
    configure(true);
    const { r, f } = await callbackWith(good());
    expect(r.headers.get('location')).toBe(`https://${HOST}/?signedin=google`);
    const body = String((f.mock.calls[0][1] as RequestInit).body);
    expect(body).toMatch(/client_secret=shh/);
    expect(body).toMatch(/code_verifier=/);
    const sess = cookieOf(r, 'chog_session');
    expect(await (await session(get('/api/auth/session', [sess]))).json()).toEqual({ identities: [{ provider: 'google', subject: '1234567890', label: 'a@b.co' }] });
  });
  it('callback: rejects a wrong state, a token for another app, and an expired token', async () => {
    configure(true);
    let x = await callbackWith(good(), 'forged');
    expect(x.r.headers.get('location')).toMatch(/signin_error=bad_state/);
    expect(x.f).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    x = await callbackWith({ ...good(), aud: 'someone-else' });
    expect(x.r.headers.get('location')).toMatch(/signin_error=bad_token/);
    vi.restoreAllMocks();
    x = await callbackWith({ ...good(), exp: 1 });
    expect(x.r.headers.get('location')).toMatch(/signin_error=bad_token/);
  });
  it('links: a wallet session plus Google gives one session with both; logout clears it (same origin only)', async () => {
    configure(true);
    const w = wallet();
    const c = await challenge(post('/api/auth/wallet/challenge', { address: w.address, chainId: 1 }));
    const { message } = (await c.json()) as { message: string };
    const v = await verify(post('/api/auth/wallet/verify', { message, signature: w.personalSign(message) }, [cookieOf(c, 'chog_wallet_challenge')]));
    const walletSess = cookieOf(v, 'chog_session');
    const s = await gStart(get('/api/auth/google/start'));
    const state = new URL(s.headers.get('location')!).searchParams.get('state')!;
    const idt = `x.${b64url(new TextEncoder().encode(JSON.stringify(good())))}.y`;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id_token: idt })));
    const r = await gCallback(get(`/api/auth/google/callback?code=abc&state=${state}`, [cookieOf(s, 'chog_google_state'), walletSess]));
    const both = cookieOf(r, 'chog_session');
    const ids = ((await (await session(get('/api/auth/session', [both]))).json()) as { identities: { provider: string }[] }).identities;
    expect(ids.map((i) => i.provider)).toEqual(['wallet', 'google']);
    expect((await logout(post('/api/auth/logout', {}, [both], 'https://other.site'))).status).toBe(403);
    expect(cookieOf(await logout(post('/api/auth/logout', {}, [both])), 'chog_session')).toBe('chog_session=');
  });
});
