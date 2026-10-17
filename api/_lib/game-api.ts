// /api/game/<action> (master build, stages C and D). One Vercel function for every game action, to stay inside the
// Hobby plan's function count. Dependencies are passed in so tests run it with PGlite and a fake chain.
//
//   GET  config        what is switched on: database, NFT combat power, demo mode
//   GET  profile       the signed-in account: level, XP, shards, rating, upgrades, callsign, medals, career, Chog
//   POST callsign      set the account's callsign (validated; shown in matches and on the leaderboard)
//   POST prefs         favourite operator and pinned medals (earned ones only)
//   POST practice-start a signed ticket for one solo run (account, run id, start time)
//   POST practice      store one solo practice run (bounded, rate limited, once per run id): career, medals, and a
//                      capped practice reward when its start ticket checks out
//   GET  tokens        Chog Genesis tokens the signed-in account's own wallets hold, read live from Monad (fails closed;
//                      reads cached 30 s per address in this instance, unchanged reads logged once per 10 minutes)
//   POST ticket        a 10 minute game ticket for the game server: account, verified holding, power (or a demo token)
//   POST ticket-check  the game server asks whether a ticket is genuine (no cookie, no origin: the ticket is the proof)
//   POST upgrade       spend shards on an upgrade rank
//   POST settle        pull a finished match from the game server and settle it once
//   GET  leaderboard   ranked by kills in validated matches (then wins); shows matches, XP/level, rating, Chog tier
//   GET  health        database reachable, applied migrations, this game's tables (no data, no secrets)
//   GET  chain         read-only live check of the ownership path on Monad (cached 60 s; no player data)
import { env as authEnv, json, readSession, sameOrigin, secretOk, type Env, type Identity } from './auth.js';
import { schemaStatus, type Db } from './db.js';
import { readOwnership, selfCheck, type Fetch, type Holding, type OwnershipResult, type SelfCheck } from './chain.js';
import { BOARD_PAGE, setNftTier, accountFor, buyUpgrade, callsignOf, standingOf, checkTicket, issueTicket, leaderboard, settleMatch, ticketSecret, tokenHistory, upgradesOf, validRecord, type GameTicket } from './game.js';
import { accountView, awardDue, practiceSecret, recordPractice, setCallsign, setPrefs, startPractice } from './career.js';
import { NO_UPGRADES, ONE_OF_ONE, SIGNATURES, TIER_DEFS, TIERS, chogName, tierOfMetadataId, type Tier } from '../../src/config/power.js';

export interface GameEnv extends Env {
  NFT_COMBAT?: string;
  GAME_SERVER_URL?: string;
  VITE_GAME_SERVER_URL?: string;
}

export interface Deps {
  env: GameEnv;
  db(): Promise<Db | null>;
  fetch: Fetch;
  now(): number;
  /** Live ownership reads kept for OWNERSHIP_CACHE_MS per address (this function instance only). Absent: no cache. */
  ownershipCache?: Map<string, { at: number; r: OwnershipResult }>;
}

/** An address's live holdings are read from Monad at most once per this long per function instance. */
export const OWNERSHIP_CACHE_MS = 30_000;
/** An unchanged ownership read is logged to room_zero.ownership_checks at most once per this long per address. */
export const OWNERSHIP_LOG_MS = 10 * 60_000;

const DEFAULT_GAME_SERVER = 'https://room-zero-game.onrender.com';
// Owner 2026-10-14 (master integration pass): NFT combat power is ON for verified holders. NFT_COMBAT=0 switches it off.
export const nftCombatOn = (e: GameEnv) => e.NFT_COMBAT !== '0';
// The client's address is the WebSocket path (wss://host/ws); results live at the host root (https://host/results/:id).
const gameServer = (e: GameEnv) => (e.GAME_SERVER_URL || e.VITE_GAME_SERVER_URL || DEFAULT_GAME_SERVER).replace(/\/+$/, '').replace(/\/ws$/, '').replace(/^ws/, 'http');

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    if (Number(req.headers.get('content-length') ?? 0) > 2000) return {};
    const t = await req.text();
    if (t.length > 2000) return {};
    const v = JSON.parse(t) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch { return {}; }
}

const wallets = (ids: Identity[]) => ids.filter((i) => i.provider === 'wallet').map((i) => i.subject).slice(0, 2);

/**
 * The session's wallets that belong to `acc`. A session can carry a wallet that is linked to another account (accountFor
 * leaves it there), and that wallet's Chogs must never power or show on this account. With no database there is no
 * account (acc null), and every proven wallet of the session counts, as before.
 */
async function walletsOf(db: Db | null, acc: string | null, ids: Identity[]): Promise<Identity[]> {
  const mine = ids.filter((i) => i.provider === 'wallet');
  if (!db || !acc || !mine.length) return db ? [] : mine;
  const rows = await db.query<{ subject: string }>(`SELECT subject FROM room_zero.identities WHERE provider = 'wallet' AND account_id = $1 AND subject = ANY($2)`,
    [acc, mine.map((i) => i.subject)]);
  const linked = new Set(rows.map((r) => r.subject));
  return mine.filter((i) => linked.has(i.subject));
}

/** A live ownership read, served from the instance cache when it is fresh. Failures are never cached (fail closed). */
async function ownership(d: Deps, address: string): Promise<OwnershipResult> {
  const key = address.toLowerCase();
  const c = d.ownershipCache;
  const hit = c?.get(key);
  if (hit && d.now() - hit.at < OWNERSHIP_CACHE_MS) return hit.r;
  const r = await readOwnership(address, d.fetch);
  if (c && r.ok) {
    if (c.size > 500) c.clear();
    c.set(key, { at: d.now(), r });
  }
  return r;
}

/** Logs an ownership read, unless the last row for this address says the same thing and is under OWNERSHIP_LOG_MS old. */
async function logOwnership(d: Deps, db: Db, address: string, r: OwnershipResult): Promise<void> {
  const ids = r.ok ? r.holdings.map((h) => h.tokenId) : [];
  const last = await db.query<{ token_ids: number[]; ok: boolean; checked_at: Date | string }>(
    `SELECT token_ids, ok, checked_at FROM room_zero.ownership_checks WHERE address = $1 ORDER BY id DESC LIMIT 1`, [address]);
  const l = last[0];
  if (l && l.ok === r.ok && l.token_ids.map(Number).join(',') === ids.join(',') && d.now() - new Date(l.checked_at).getTime() < OWNERSHIP_LOG_MS) return;
  await db.query(`INSERT INTO room_zero.ownership_checks (address, token_ids, ok, rpc, block) VALUES ($1, $2, $3, $4, $5)`,
    [address, ids, r.ok, r.ok ? r.rpc : r.reason.slice(0, 80), r.ok ? r.block : null]);
}

const tierRank = (t: Tier) => TIERS.indexOf(t);

function describe(h: Holding) {
  const tier = tierOfMetadataId(h.metadataId)!;
  const sig = SIGNATURES[h.metadataId];
  return { tokenId: h.tokenId, metadataId: h.metadataId, name: chogName(h.metadataId), oneOfOne: ONE_OF_ONE[h.metadataId]?.name ?? null, tier, tierLabel: TIER_DEFS[tier].label,
    signature: sig ? { name: sig.name, text: sig.text, telegraph: sig.telegraph ?? '', counter: sig.counter ?? '' } : null };
}

/** Live holdings of the given wallets (walletsOf). ok:false if any read failed (fail closed: no holder rights). */
async function holdingsOf(d: Deps, db: Db | null, ids: Identity[]): Promise<{ ok: boolean; list: (Holding & { owner: string })[]; reason?: string }> {
  const list: (Holding & { owner: string })[] = [];
  for (const w of wallets(ids)) {
    const r = await ownership(d, w);
    if (db) await logOwnership(d, db, w, r).catch(() => undefined);
    if (!r.ok) return { ok: false, list: [], reason: r.reason };
    for (const h of r.holdings) list.push({ ...h, owner: w });
  }
  return { ok: true, list };
}

/** One line per ticket event for the Vercel runtime log: the outcome only, never an address, account id or ticket. */
const log = (m: string) => console.log(`[game] ${m}`);

let chainCache: { at: number; r: SelfCheck } | null = null;

export async function handleGame(req: Request, action: string, d: Deps): Promise<Response> {
  const e = d.env;
  if (!secretOk(e)) return json({ error: 'not_configured' }, 503);
  const method = req.method.toUpperCase();
  const post = method === 'POST';
  if (!post && method !== 'GET') return json({ error: 'method' }, 405);
  const db = await d.db().catch(() => null);
  try {
    switch (`${method} ${action}`) {
      case 'GET config':
        return json({ db: !!db, nftCombat: nftCombatOn(e), demo: true });

      case 'GET profile': {
        const s = await readSession(req, e);
        if (!s?.ids.length) return json({ signedIn: false });
        if (!db) return json({ signedIn: true, progression: false });
        const acc = await accountFor(db, s.ids);
        return json({ signedIn: true, progression: true, identities: s.ids.map((i) => ({ provider: i.provider, label: i.label })), profile: await accountView(db, acc!) });
      }

      case 'POST callsign':
      case 'POST prefs':
      case 'POST practice-start':
      case 'POST practice': {
        if (!sameOrigin(req, e)) return json({ error: 'bad_origin' }, 403);
        if (!db) return json({ error: 'progression_offline' }, 503);
        const s = await readSession(req, e);
        if (!s?.ids.length) return json({ error: 'sign_in' }, 401);
        const acc = (await accountFor(db, s.ids))!;
        if (action === 'practice-start') return json({ ok: true, ...(await startPractice(db, acc, await practiceSecret(e.AUTH_SECRET!), d.now())) });
        const b = await body(req);
        if (action === 'callsign') { const r = await setCallsign(db, acc, b.name); return json(r, r.ok ? 200 : r.code === 'callsign_taken' ? 409 : 400); }
        if (action === 'prefs') { const r = await setPrefs(db, acc, b); return json(r, r.ok ? 200 : 400); }
        const r = await recordPractice(db, acc, b, { secret: await practiceSecret(e.AUTH_SECRET!), now: d.now() });
        return json(r, r.ok ? 200 : r.reason === 'rate' ? 429 : 400);
      }

      case 'GET tokens': {
        const s = await readSession(req, e);
        if (!s || !wallets(s.ids).length) return json({ wallet: false, tokens: [] });
        const acc = db ? await accountFor(db, s.ids) : null;
        const own = await walletsOf(db, acc, s.ids);
        if (!own.length) return json({ wallet: false, tokens: [] });
        const h = await holdingsOf(d, db, own);
        if (!h.ok) return json({ wallet: true, ok: false, error: 'chain_unavailable', tokens: [] }, 503);
        const tokens = [];
        for (const x of h.list.sort((a, b) => tierRank(tierOfMetadataId(b.metadataId)!) - tierRank(tierOfMetadataId(a.metadataId)!) || a.tokenId - b.tokenId)) {
          tokens.push({ ...describe(x), history: db ? await tokenHistory(db, x.tokenId) : null });
        }
        return json({ wallet: true, ok: true, tokens });
      }

      case 'POST eligibility': {
        // "Enter with CHOG" (CF, owner 2026-10-16): CHOG ownership is ELIGIBILITY, never authentication. Before the
        // wallet is asked to sign, the address it shared is checked on Monad so a wallet without a Chog hears so first.
        // Nothing here signs anyone in, sets a cookie or grants power: only the signed-in session's own read (GET
        // tokens, POST ticket) does. Answers a count and the best tier, the same public facts any block explorer shows.
        if (!sameOrigin(req, e)) return json({ error: 'bad_origin' }, 403);
        const b = await body(req);
        const address = typeof b.address === 'string' ? b.address : '';
        if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return json({ error: 'bad_address' }, 400);
        const r = await ownership(d, address);
        if (!r.ok) return json({ ok: false, error: 'chain_unavailable' }, 503);
        const best = r.holdings.map((h) => tierOfMetadataId(h.metadataId)!).sort((x, y) => tierRank(y) - tierRank(x))[0] ?? null;
        return json({ ok: true, count: r.holdings.length, best: best ? TIER_DEFS[best].label : null });
      }

      case 'POST ticket': {
        if (!sameOrigin(req, e)) return json({ error: 'bad_origin' }, 403);
        const b = await body(req);
        const secret = await ticketSecret(e.AUTH_SECRET!);
        const name = typeof b.name === 'string' ? b.name.slice(0, 20) : '';
        // Demo: any token number, labelled, isolated queues, no account, no rewards, never "verified".
        if (b.demo !== undefined) {
          const mid = Number(b.demo);
          const tier = tierOfMetadataId(mid);
          if (!tier) return json({ error: 'bad_demo_token' }, 400);
          const t = await issueTicket({ acc: null, tier, up: NO_UPGRADES, tok: null, mid, tokTier: tier, own: null, holder: false, demo: true, name }, secret, d.now());
          log('ticket issued: demo');
          return json({ ticket: t.ticket, profile: publicTicket(t.data) });
        }
        const s = await readSession(req, e);
        const ids = s?.ids ?? [];
        const acc = db && ids.length ? await accountFor(db, ids) : null;
        const up = db && acc ? await upgradesOf(db, acc) : NO_UPGRADES;
        // A signed-in account plays under its own callsign (the one on its profile and the leaderboard).
        const own = db && acc ? await callsignOf(db, acc) : null;
        // SB: rating and experience ride in the signed ticket, so the game server can match like with like.
        const standing = db && acc ? await standingOf(db, acc) : null;
        let holding: (Holding & { owner: string }) | null = null;
        let chain: string | null = null;
        // Only wallets linked to the ticket's own account: a wallet in this session that belongs to another account
        // never lends its Chog to this one.
        const linked = await walletsOf(db, acc, ids);
        if (linked.length) {
          const h = await holdingsOf(d, db, linked);
          if (!h.ok) chain = 'chain_unavailable';
          const want = Number(b.tokenId);
          holding = h.list.find((x) => x.tokenId === want)
            ?? (b.tokenId === undefined ? h.list.sort((x, y) => tierRank(tierOfMetadataId(y.metadataId)!) - tierRank(tierOfMetadataId(x.metadataId)!))[0] ?? null : null);
          if (b.tokenId !== undefined && !holding && h.ok) chain = 'not_owned';
          // Refresh the account's displayed Chog tier from this live read: its best held Chog, or none. Display only.
          if (db && acc && h.ok) {
            const best = [...h.list].sort((x, y) => tierRank(tierOfMetadataId(y.metadataId)!) - tierRank(tierOfMetadataId(x.metadataId)!))[0] ?? null;
            await setNftTier(db, acc, best);
          }
        }
        const tokTier = holding ? tierOfMetadataId(holding.metadataId) : null;
        const t = await issueTicket({
          acc, up, name: own ?? name,
          tier: holding && nftCombatOn(e) ? tokTier! : 'free',
          tok: holding?.tokenId ?? null, mid: holding?.metadataId ?? null, tokTier, own: holding?.owner ?? null,
          holder: !!holding, demo: false, ...(standing ? { rating: standing.rating, played: standing.played } : {}),
        }, secret, d.now());
        log(`ticket issued: ${holding ? 'holder' : 'free'}${acc ? ' with account' : ''}${chain ? ` (${chain})` : ''}`);
        return json({ ticket: t.ticket, profile: publicTicket(t.data), nftCombat: nftCombatOn(e), warning: chain });
      }

      case 'POST ticket-check': {
        const b = await body(req);
        const t = await checkTicket(String(b.ticket ?? ''), await ticketSecret(e.AUTH_SECRET!), d.now());
        log(`ticket-check: ${t ? (t.demo ? 'ok demo' : t.holder ? 'ok holder' : 'ok free') : 'refused'}`);
        return t ? json({ ok: true, ticket: t }) : json({ ok: false }, 401);
      }

      case 'POST upgrade': {
        if (!sameOrigin(req, e)) return json({ error: 'bad_origin' }, 403);
        if (!db) return json({ error: 'progression_offline' }, 503);
        const s = await readSession(req, e);
        if (!s?.ids.length) return json({ error: 'sign_in' }, 401);
        const acc = (await accountFor(db, s.ids))!;
        const r = await buyUpgrade(db, acc, String((await body(req)).id ?? ''));
        return json(r, r.ok ? 200 : 409);
      }

      case 'POST settle': {
        if (!db) return json({ error: 'progression_offline' }, 503);
        const id = String((await body(req)).matchId ?? '');
        if (!/^[0-9a-f]{8,32}$/.test(id)) return json({ error: 'bad_match' }, 400);
        const res = await d.fetch(`${gameServer(e)}/results/${id}`, { method: 'GET', headers: { accept: 'application/json' } });
        if (res.status === 404) return json({ error: 'unknown_match' }, 404);
        if (!res.ok) return json({ error: 'game_server' }, 502);
        const rec = (await res.json()) as unknown;
        if (!validRecord(rec) || rec.id !== id) return json({ error: 'bad_record' }, 502);
        const r = await settleMatch(db, rec);
        // GP: online career medals for every account in the match, from the stored rows (idempotent: a second settle
        // or a medal already held adds nothing).
        const earned = new Map<string, string[]>();
        if (r.ok) for (const p of r.players) earned.set(p.acc, await db.tx((tx) => awardDue(tx, p.acc, null)));
        const s = await readSession(req, e);
        const me = s?.ids.length ? await accountFor(db, s.ids) : null;
        const mine = r.ok ? r.players.find((p) => p.acc === me) ?? null : null;
        return json({ ...r, mine: mine ? { ...mine, earned: earned.get(mine.acc) ?? [] } : null, players: undefined });
      }

      case 'GET chain': {
        if (!chainCache || d.now() - chainCache.at > 60_000) chainCache = { at: d.now(), r: await selfCheck(d.fetch) };
        return json({ ...chainCache.r, checkedAt: new Date(chainCache.at).toISOString() });
      }

      case 'GET leaderboard': {
        if (!db) return json({ progression: false, rows: [], me: null, total: 0 });
        const q = new URL(req.url).searchParams;
        const board = q.get('board') === 'solo' ? 'solo' : 'online';
        const offset = Math.max(0, Math.min(100_000, Number.parseInt(q.get('offset') ?? '0', 10) || 0));
        const s = await readSession(req, e);
        const me = s?.ids.length ? await accountFor(db, s.ids) : null;
        return json({ progression: true, rankedBy: 'kills', signedIn: !!me, ...(await leaderboard(db, BOARD_PAGE, me, { board, offset })) });
      }

      case 'GET health':
        // Read-only proof that the database answers and which migrations are applied. No rows, no connection details.
        return json(db ? { db: true, ...(await schemaStatus(db)) } : { db: false });

      default:
        return json({ error: 'not_found' }, 404);
    }
  } catch {
    // Never echo internals (connection strings, SQL) to the client.
    return json({ error: 'server_error' }, 500);
  } finally {
    await db?.close().catch(() => undefined);
  }
}

/** What the browser may see of its ticket (the same data the game server will get). */
function publicTicket(t: GameTicket) {
  return { account: !!t.acc, name: t.name, tier: t.tier, tierLabel: TIER_DEFS[t.tier].label, tokenId: t.tok, metadataId: t.mid, tokenTier: t.tokTier, holder: t.holder, demo: t.demo, upgrades: t.up,
    signature: t.mid && t.tokTier === 'legendary' ? SIGNATURES[t.mid]?.name ?? null : null, oneOfOne: t.mid ? ONE_OF_ONE[t.mid]?.name ?? null : null };
}

const ownershipCache = new Map<string, { at: number; r: OwnershipResult }>();

export const defaultDeps = async (): Promise<Deps> => ({
  env: authEnv() as GameEnv,
  db: async () => (await import('./db.js')).openDb(),
  fetch: (u, i) => fetch(u, i),
  now: () => Date.now(),
  ownershipCache,
});
