// Local full stack for browser journeys (master integration pass). NOT deployed, never in production builds.
// Serves the built game (dist/) and the real /api/game/* handler (api/_lib/game-api.ts) on one origin, backed by a real
// Postgres engine in memory (PGlite) that lives as long as this process, so two browsers share one database exactly
// like two devices share Neon. Sign-in is a local test route that mints the same signed session cookie the real
// Google/wallet flows mint (/__test/login). The Monad RPC is faked for two test wallets so a holder journey runs
// without a real wallet (FAKE_CHAIN): it answers the same eth_calls the live chain read makes.
// Build: npx vite build --ssr tools/local-api.ts --outDir dist-local --emptyOutDir; run: node dist-local/local-api.js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { handleGame, type Deps } from '../api/_lib/game-api';
import { SESSION_COOKIE, clearCookie, cookie, json, readLiveSession, readSession, sign, type Identity } from '../api/_lib/auth';
import { migrate, revokeSession, type Db, type Tx } from '../api/_lib/db';
import { CONTRACT, selector } from '../api/_lib/chain';
import { POST as walletChallenge } from '../api/auth/wallet/challenge';
import { POST as walletVerify } from '../api/auth/wallet/verify';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

const PORT = Number(process.env.PORT ?? 8790);
const GAME = process.env.GAME_SERVER_URL ?? 'http://127.0.0.1:8791';
const DIST = process.env.DIST ?? 'dist';
const SECRET = 'local-test-secret-'.padEnd(48, 'x');
process.env.AUTH_SECRET = SECRET;
process.env.AUTH_ORIGIN = `http://localhost:${PORT}`;
process.env.GAME_SERVER_URL = GAME;

// Test wallets. HOLDER is the address of the fixed test key tools/mi-journey.mjs signs with (a real EIP-191 signature
// through the real /api/auth/wallet routes): it holds Blaze (a 1:1, token 5 -> metadata 53) and an Uncommon
// (token 900 -> 1462). 0x...a1 holds the same for /__test/login checks. Every other address holds nothing.
export const TEST_KEY = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const pub = secp256k1.getPublicKey(Uint8Array.from(TEST_KEY.match(/../g)!.map((h) => parseInt(h, 16))), false);
const HOLDER = '0x' + Array.from(keccak_256(pub.subarray(1)).subarray(12), (b) => b.toString(16).padStart(2, '0')).join('');
const OWNED: Record<string, number[]> = { '0x00000000000000000000000000000000000000a1': [5, 900], [HOLDER]: [5, 900] };
const META: Record<number, number> = { 5: 53, 900: 1462 };
const word = (n: number) => n.toString(16).padStart(64, '0');
async function fakeChain(init: RequestInit): Promise<Response> {
  const calls = JSON.parse(String(init.body)) as { id: number; method: string; params: [{ to: string; data: string }] }[];
  return Response.json(calls.map((c) => {
    if (c.method === 'eth_chainId') return { id: c.id, result: '0x8f' };
    if (c.method === 'eth_blockNumber') return { id: c.id, result: '0x10' };
    const { to, data } = c.params[0];
    if (to.toLowerCase() !== CONTRACT.toLowerCase()) return { id: c.id, error: { message: 'wrong contract' } };
    if (data.startsWith(selector('tokensOfOwner(address)'))) {
      const ids = OWNED['0x' + data.slice(10 + 24).toLowerCase()] ?? [];
      return { id: c.id, result: '0x' + word(32) + word(ids.length) + ids.map(word).join('') };
    }
    if (data.startsWith(selector('metadataId(uint256)'))) return { id: c.id, result: '0x' + word(META[parseInt(data.slice(10), 16)] ?? 1) };
    return { id: c.id, error: { message: 'unknown' } };
  }));
}

const pg = new PGlite();
await pg.waitReady;
const wrap = (q: { query: PGlite['query'] }): Tx => ({ query: async <T>(sql: string, params: unknown[] = []) => (await q.query<T>(sql, params)).rows });
const db: Db = { ...wrap(pg), tx: <T>(fn: (tx: Tx) => Promise<T>) => pg.transaction((t) => fn(wrap(t))), close: async () => undefined };
await migrate(db);

const deps: Deps = {
  env: process.env as Deps['env'],
  db: async () => db,
  fetch: async (u, i) => (u.startsWith(GAME) ? fetch(u, i) : fakeChain(i)),
  now: () => Date.now(),
};

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };

// /__test/slow?ms=N: every /api/* answer waits N ms (failure-state tests: a hanging API).
let slowMs = 0;

createServer((req, res) => {
  // A browser that gives up on a slow request (its 10 s timeout) aborts it: that must never take the stack down.
  req.on('error', () => undefined);
  res.on('error', () => undefined);
  handle(req, res).catch(() => { try { if (!res.headersSent) res.writeHead(500); res.end(); } catch { /* socket gone */ } });
}).listen(PORT, () => console.log(`local stack on http://localhost:${PORT} (game server ${GAME}); test holder ${HOLDER}`));

async function handle(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/__test/slow') { slowMs = Number(url.searchParams.get('ms')) || 0; res.writeHead(200); res.end('ok'); return; }
  if (slowMs && url.pathname.startsWith('/api/')) await new Promise((r) => setTimeout(r, slowMs));
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(url, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
  let out: Response;
  if (url.pathname.startsWith('/api/game/')) out = await handleGame(request, url.pathname.split('/').pop()!, deps);
  else if (url.pathname === '/api/auth/session') out = json({ identities: (await readLiveSession(request, deps.env, await deps.db()))?.ids ?? [] });
  else if (url.pathname === '/api/auth/config') out = json({ google: true, wallet: true });
  else if (url.pathname === '/api/auth/logout') {
    // As api/auth/logout.ts: the session id is recorded as signed out, then the cookie is cleared.
    const s = await readSession(request, deps.env), db = await deps.db();
    if (s?.sid && db) await revokeSession(db, s.sid, s.exp);
    out = json({ ok: true, revoked: !!(s?.sid && db) }, 200, { 'set-cookie': clearCookie(SESSION_COOKIE) });
  }
  else if (url.pathname === '/api/auth/wallet/challenge') out = await walletChallenge(request);
  else if (url.pathname === '/api/auth/wallet/verify') out = await walletVerify(request);
  // Google cannot be reached from the test container: its start route signs in a fixed test Google identity instead and
  // comes back exactly like the real callback does (/?signedin=google). ?google_sub= in the page URL picks the subject.
  else if (url.pathname === '/api/auth/google/start') {
    const sub = (request.headers.get('referer') && new URL(request.headers.get('referer')!).searchParams.get('google_sub')) || 'google-tester';
    out = new Response(null, { status: 302, headers: { location: `/__test/login?provider=google&sub=${encodeURIComponent(sub)}&label=${encodeURIComponent(sub + '@gmail.test')}&to=${encodeURIComponent('/?signedin=google&debug')}` } });
  }
  else if (url.pathname === '/__test/login') {
    // Same cookie the real sign-in routes set: a signed list of proven identities (adds to an existing session).
    const prev = await readSession(request, deps.env);
    const id: Identity = { provider: url.searchParams.get('provider') === 'wallet' ? 'wallet' : 'google', subject: url.searchParams.get('sub') ?? 'tester', label: url.searchParams.get('label') ?? 'tester@local' };
    const ids = [...(prev?.ids ?? []).filter((x) => !(x.provider === id.provider && x.subject === id.subject)), id];
    const token = await sign({ ids, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
    out = new Response(null, { status: 302, headers: { location: url.searchParams.get('to') ?? '/', 'set-cookie': cookie(SESSION_COOKIE, token, 3600) } });
  } else {
    const p = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
    try { out = new Response(await readFile(join(DIST, p)), { headers: { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' } }); }
    catch { out = new Response(await readFile(join(DIST, 'index.html')), { headers: { 'content-type': 'text/html' } }); }
  }
  const h: Record<string, string[] | string> = {};
  out.headers.forEach((v, k) => { h[k] = k === 'set-cookie' ? [...(h[k] as string[] ?? []), v] : v; });
  if (res.destroyed) return;
  res.writeHead(out.status, h);
  res.end(Buffer.from(await out.arrayBuffer()));
}
