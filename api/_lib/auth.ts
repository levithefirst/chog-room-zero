// Sign-in core (RC-7), shared by the /api/auth/* Vercel functions. Web-standard Request/Response and Web Crypto
// only, so it runs on Vercel and in Vitest. Files under api/_lib are not routes.
//
// Sessions: an HMAC-SHA256 signed token in an HttpOnly, Secure, SameSite=Lax cookie. It lists the identities this
// browser has proven (Google and/or wallet). The account they belong to, and all its progress, live in Neon
// (api/_lib/game.ts accountFor links every identity of a session to one account).
// Never put a secret in a response or a log. GOOGLE_CLIENT_SECRET and AUTH_SECRET stay server-side.
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { claimNonce, type Db } from './db.js';

declare const process: { env: Record<string, string | undefined> };

export interface Identity {
  provider: 'google' | 'wallet';
  subject: string;
  label: string;
}

export interface Env {
  AUTH_SECRET?: string;
  AUTH_ORIGIN?: string;
  AUTH_ALLOWED_HOSTS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  VERCEL_URL?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
}

export const env = (): Env => process.env as Env;

export const SESSION_COOKIE = 'chog_session';
export const SESSION_SECONDS = 30 * 24 * 3600;
export const CHALLENGE_COOKIE = 'chog_wallet_challenge';
export const CHALLENGE_SECONDS = 5 * 60;
export const GOOGLE_COOKIE = 'chog_google_state';
export const GOOGLE_SECONDS = 10 * 60;

/** AUTH_SECRET must be long enough to sign with; anything shorter means "not configured". */
export function secretOk(e: Env): boolean {
  return typeof e.AUTH_SECRET === 'string' && e.AUTH_SECRET.length >= 32;
}

export function googleOk(e: Env): boolean {
  return secretOk(e) && !!e.GOOGLE_CLIENT_ID && !!e.GOOGLE_CLIENT_SECRET && !!e.AUTH_ORIGIN;
}

// ---- encoding ----
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function randomToken(n = 16): string {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function fromHex(h: string): Uint8Array {
  const s = h.startsWith('0x') ? h.slice(2) : h;
  if (s.length % 2 || /[^0-9a-fA-F]/.test(s)) throw new Error('bad hex');
  return Uint8Array.from({ length: s.length / 2 }, (_, i) => parseInt(s.slice(i * 2, i * 2 + 2), 16));
}

// ---- signed tokens ----
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** `payload.signature`, both base64url. The payload carries its own `exp` (unix seconds). */
export async function sign(data: object, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(data)));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(mac)}`;
}

/** The payload if the signature is valid and it has not expired, else null. Constant-time check via Web Crypto. */
export async function unsign<T extends { exp: number }>(token: string | undefined, secret: string, now = Date.now()): Promise<T | null> {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  let ok = false;
  try { ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(mac), enc.encode(body)); } catch { return null; }
  if (!ok) return null;
  try {
    const data = JSON.parse(dec.decode(fromB64url(body))) as T;
    if (typeof data.exp !== 'number' || data.exp * 1000 <= now) return null;
    return data;
  } catch { return null; }
}

// ---- cookies ----
export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) {
      // A malformed value (bad percent escape) is no cookie, never a 500.
      try { return decodeURIComponent(part.slice(i + 1)); } catch { return undefined; }
    }
  }
  return undefined;
}

export function cookie(name: string, value: string, maxAge: number, path = '/', sameSite: 'Lax' | 'Strict' = 'Lax'): string {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=${sameSite}`;
}

export const clearCookie = (name: string, path = '/') => cookie(name, '', 0, path);

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
}

export function redirect(to: string, cookies: string[] = []): Response {
  const h = new Headers({ location: to, 'cache-control': 'no-store' });
  for (const c of cookies) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
}

// ---- hosts ----
/** Hosts allowed to sign in: the canonical origin, extra listed hosts, and this deployment's own Vercel URLs. */
export function allowedHosts(e: Env): Set<string> {
  const hosts = new Set<string>();
  const add = (h?: string) => { if (h) hosts.add(h.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()); };
  add(e.AUTH_ORIGIN);
  for (const h of (e.AUTH_ALLOWED_HOSTS ?? '').split(',')) add(h.trim());
  add(e.VERCEL_URL); add(e.VERCEL_BRANCH_URL); add(e.VERCEL_PROJECT_PRODUCTION_URL);
  return hosts;
}

export function requestHost(req: Request): string {
  return (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host).toLowerCase();
}

/** State-changing POSTs must come from a page on an allowed host (CSRF). */
export function sameOrigin(req: Request, e: Env): boolean {
  const o = req.headers.get('origin');
  if (!o) return false;
  try { return allowedHosts(e).has(new URL(o).host.toLowerCase()); } catch { return false; }
}

/**
 * A small JSON object body, or null (too large, not JSON, not an object). The declared length is checked before the
 * body is read, so a large upload is refused without buffering it.
 */
export async function readJson(req: Request, limit = 4000): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get('content-length') ?? 0) > limit) return null;
  try {
    const t = await req.text();
    if (t.length > limit) return null;
    const v = JSON.parse(t) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch { return null; }
}

// ---- sessions ----
/** `k: 'session'` tags a session token. Sessions issued before the tag have no `k` and are still accepted. */
export interface Session { k?: 'session'; ids: Identity[]; exp: number }

const isIdentity = (i: unknown): i is Identity => {
  const x = i as Identity;
  return !!x && (x.provider === 'google' || x.provider === 'wallet') && typeof x.subject === 'string' && typeof x.label === 'string';
};

/**
 * This browser's session, or null. Every token here is signed with AUTH_SECRET (the wallet challenge and the Google
 * state too), so the payload's shape is checked: only a session (tagged, or an untagged one with an ids list) counts.
 */
export async function readSession(req: Request, e: Env): Promise<Session | null> {
  if (!secretOk(e)) return null;
  const s = await unsign<Session>(readCookie(req, SESSION_COOKIE), e.AUTH_SECRET!);
  if (!s || (s.k !== undefined && s.k !== 'session') || !Array.isArray(s.ids) || !s.ids.every(isIdentity)) return null;
  return s;
}

/** Adds an identity to this browser's session (never twice), returning the Set-Cookie header. */
export async function sessionCookieWith(prev: Session | null, id: Identity, e: Env, now = Date.now()): Promise<string> {
  const ids = (prev?.ids ?? []).filter((x) => !(x.provider === id.provider && x.subject === id.subject));
  ids.push(id);
  const token = await sign({ k: 'session', ids: ids.slice(-4), exp: Math.floor(now / 1000) + SESSION_SECONDS }, e.AUTH_SECRET!);
  return cookie(SESSION_COOKIE, token, SESSION_SECONDS);
}

// ---- Ethereum ----
function keccak(b: Uint8Array): Uint8Array { return keccak_256(b); }

/** EIP-55 checksummed address. */
export function checksum(address: string): string {
  const a = address.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(a)) throw new Error('bad address');
  const h = hex(keccak(enc.encode(a)));
  let out = '0x';
  for (let i = 0; i < 40; i++) out += parseInt(h[i], 16) >= 8 ? a[i].toUpperCase() : a[i];
  return out;
}

/** EIP-191 personal_sign: the address that signed `message`, or null if the signature is malformed. */
export function recoverPersonalSign(message: string, signature: string): string | null {
  try {
    const sig = fromHex(signature);
    if (sig.length !== 65) return null;
    let v = sig[64];
    if (v >= 27) v -= 27;
    if (v !== 0 && v !== 1) return null;
    const msg = enc.encode(message);
    const digest = keccak(new Uint8Array([...enc.encode(`\x19Ethereum Signed Message:\n${msg.length}`), ...msg]));
    const rec = new Uint8Array(65);
    rec[0] = v;
    rec.set(sig.subarray(0, 64), 1);
    const pub = secp256k1.Signature.fromBytes(rec, 'recovered').recoverPublicKey(digest).toBytes(false);
    return checksum(hex(keccak(pub.subarray(1)).subarray(12)));
  } catch {
    return null;
  }
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** EIP-4361 (Sign-In with Ethereum) message. Plain words: it is free, sends nothing, and checks no tokens. */
export function siweMessage(f: { domain: string; address: string; uri: string; chainId: number; nonce: string; issuedAt: string; expires: string }): string {
  return `${f.domain} wants you to sign in with your Ethereum account:
${f.address}

Sign in to Chog: Room Zero. This proves you control this address. It is free, sends no transaction and checks no tokens.

URI: ${f.uri}
Version: 1
Chain ID: ${f.chainId}
Nonce: ${f.nonce}
Issued At: ${f.issuedAt}
Expiration Time: ${f.expires}`;
}

export function parseSiwe(message: string): { domain: string; address: string; uri: string; chainId: number; nonce: string; expires: string } | null {
  const m = /^(\S+) wants you to sign in with your Ethereum account:\n(0x[0-9a-fA-F]{40})\n\n[\s\S]*?\nURI: (\S+)\nVersion: 1\nChain ID: (\d+)\nNonce: ([A-Za-z0-9_-]+)\nIssued At: (\S+)\nExpiration Time: (\S+)$/.exec(message);
  if (!m) return null;
  return { domain: m[1], address: m[2], uri: m[3], chainId: Number(m[4]), nonce: m[5], expires: m[7] };
}

export interface Challenge { nonce: string; address: string; host: string; message: string; exp: number }

/** Sign-In with Ethereum messages always name Monad mainnet (api/_lib/chain.ts CHAIN_ID), whatever the wallet is on. */
export const SIWE_CHAIN_ID = 143;

/**
 * POST /api/auth/wallet/verify {message, signature}: the signed message must be exactly the one this browser was issued
 * (same nonce, host, address), unexpired, and signed by that address (EIP-191 recovery, server-side). The challenge
 * cookie is cleared whatever the outcome, and the nonce is recorded in room_zero.used_nonces, so a signature redeems
 * once even if the cookie was copied. With no database configured the cleared cookie is the only guard (as before).
 */
export async function verifyWallet(req: Request, e: Env, openDb: () => Promise<Db | null>): Promise<Response> {
  if (!secretOk(e)) return json({ error: 'not_configured' }, 503);
  if (!sameOrigin(req, e)) return json({ error: 'bad_origin' }, 403);
  const used = clearCookie(CHALLENGE_COOKIE, '/api/auth/wallet');
  const fail = (error: string, status = 401) => json({ error }, status, { 'set-cookie': used });
  const ch = await unsign<Challenge>(readCookie(req, CHALLENGE_COOKIE), e.AUTH_SECRET!);
  if (!ch || typeof ch.message !== 'string' || typeof ch.nonce !== 'string') return fail('no_challenge');
  const body = await readJson(req);
  if (!body) return fail('bad_request', 400);
  const message = String(body.message ?? '');
  const f = parseSiwe(message);
  if (message !== ch.message || !f || f.nonce !== ch.nonce || f.address !== ch.address || f.domain !== ch.host || f.domain !== requestHost(req)) return fail('mismatch');
  if (Date.parse(f.expires) <= Date.now()) return fail('expired');
  const signer = recoverPersonalSign(message, String(body.signature ?? ''));
  if (!signer || signer !== ch.address) return fail('bad_signature');
  let db: Db | null = null;
  try {
    db = await openDb();
    if (db && !(await claimNonce(db, ch.nonce))) return fail('replayed');
  } catch {
    return fail('unavailable', 503);
  } finally {
    await db?.close().catch(() => undefined);
  }
  const prev = await readSession(req, e);
  const identity = { provider: 'wallet' as const, subject: signer, label: shortAddress(signer) };
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  h.append('set-cookie', used);
  h.append('set-cookie', await sessionCookieWith(prev, identity, e));
  return new Response(JSON.stringify({ identity }), { status: 200, headers: h });
}
