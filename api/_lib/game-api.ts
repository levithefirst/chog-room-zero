// /api/game/<action> (master build, stages C and D). One Vercel function for every game action, to stay inside the
// Hobby plan's function count. Dependencies are passed in so tests run it with PGlite and a fake chain.
//
//   GET  config        what is switched on: database, NFT combat power, demo mode
//   GET  profile       the signed-in account: level, XP, shards, rating, upgrades
//   GET  tokens        Chog Genesis tokens the signed-in wallet holds, read live from Monad (fails closed)
//   POST ticket        a 10 minute game ticket for the game server: account, verified holding, power (or a demo token)
//   POST ticket-check  the game server asks whether a ticket is genuine (no cookie, no origin: the ticket is the proof)
//   POST upgrade       spend shards on an upgrade rank
//   POST settle        pull a finished match from the game server and settle it once
//   GET  leaderboard   top ratings
import { env as authEnv, json, readSession, sameOrigin, secretOk, type Env, type Identity } from './auth.js';
import type { Db } from './db.js';
import { readOwnership, type Fetch, type Holding } from './chain.js';
import { accountFor, buyUpgrade, checkTicket, issueTicket, leaderboard, profileOf, settleMatch, ticketSecret, tokenHistory, upgradesOf, validRecord, type GameTicket } from './game.js';
import { NO_UPGRADES, SIGNATURES, TIER_DEFS, TIERS, tierOfMetadataId, type Tier } from '../../src/config/power.js';

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
}

const DEFAULT_GAME_SERVER = 'https://room-zero-game.onrender.com';
export const nftCombatOn = (e: GameEnv) => e.NFT_COMBAT === '1';
const gameServer = (e: GameEnv) => (e.GAME_SERVER_URL || e.VITE_GAME_SERVER_URL || DEFAULT_GAME_SERVER).replace(/\/+$/, '').replace(/^ws/, 'http');

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const t = await req.text();
    if (t.length > 2000) return {};
    const v = JSON.parse(t) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch { return {}; }
}

const wallets = (ids: Identity[]) => ids.filter((i) => i.provider === 'wallet').map((i) => i.subject).slice(0, 2);
const tierRank = (t: Tier) => TIERS.indexOf(t);

function describe(h: Holding) {
  const tier = tierOfMetadataId(h.metadataId)!;
  const sig = SIGNATURES[h.metadataId];
  return { tokenId: h.tokenId, metadataId: h.metadataId, name: `Chog #${h.metadataId}`, tier, tierLabel: TIER_DEFS[tier].label, signature: sig ? { name: sig.name, text: sig.text } : null };
}

/** Live holdings of every wallet in the session. ok:false if any read failed (fail closed: no holder rights). */
async function holdingsOf(d: Deps, db: Db | null, ids: Identity[]): Promise<{ ok: boolean; list: (Holding & { owner: string })[]; reason?: string }> {
  const list: (Holding & { owner: string })[] = [];
  for (const w of wallets(ids)) {
    const r = await readOwnership(w, d.fetch);
    if (db) await db.query(`INSERT INTO room_zero.ownership_checks (address, token_ids, ok, rpc, block) VALUES ($1, $2, $3, $4, $5)`,
      [w, r.ok ? r.holdings.map((h) => h.tokenId) : [], r.ok, r.ok ? r.rpc : r.reason.slice(0, 80), r.ok ? r.block : null]).catch(() => undefined);
    if (!r.ok) return { ok: false, list: [], reason: r.reason };
    for (const h of r.holdings) list.push({ ...h, owner: w });
  }
  return { ok: true, list };
}

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
        return json({ signedIn: true, progression: true, profile: await profileOf(db, acc!) });
      }

      case 'GET tokens': {
        const s = await readSession(req, e);
        if (!s || !wallets(s.ids).length) return json({ wallet: false, tokens: [] });
        const h = await holdingsOf(d, db, s.ids);
        if (!h.ok) return json({ wallet: true, ok: false, error: 'chain_unavailable', tokens: [] }, 503);
        const tokens = [];
        for (const x of h.list.sort((a, b) => tierRank(tierOfMetadataId(b.metadataId)!) - tierRank(tierOfMetadataId(a.metadataId)!) || a.tokenId - b.tokenId)) {
          tokens.push({ ...describe(x), history: db ? await tokenHistory(db, x.tokenId) : null });
        }
        return json({ wallet: true, ok: true, tokens });
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
          return json({ ticket: t.ticket, profile: publicTicket(t.data) });
        }
        const s = await readSession(req, e);
        const ids = s?.ids ?? [];
        const acc = db && ids.length ? await accountFor(db, ids) : null;
        const up = db && acc ? await upgradesOf(db, acc) : NO_UPGRADES;
        let holding: (Holding & { owner: string }) | null = null;
        let chain: string | null = null;
        if (wallets(ids).length) {
          const h = await holdingsOf(d, db, ids);
          if (!h.ok) chain = 'chain_unavailable';
          const want = Number(b.tokenId);
          holding = h.list.find((x) => x.tokenId === want)
            ?? (b.tokenId === undefined ? h.list.sort((x, y) => tierRank(tierOfMetadataId(y.metadataId)!) - tierRank(tierOfMetadataId(x.metadataId)!))[0] ?? null : null);
          if (b.tokenId !== undefined && !holding && h.ok) chain = 'not_owned';
        }
        const tokTier = holding ? tierOfMetadataId(holding.metadataId) : null;
        const t = await issueTicket({
          acc, up, name,
          tier: holding && nftCombatOn(e) ? tokTier! : 'free',
          tok: holding?.tokenId ?? null, mid: holding?.metadataId ?? null, tokTier, own: holding?.owner ?? null,
          holder: !!holding, demo: false,
        }, secret, d.now());
        return json({ ticket: t.ticket, profile: publicTicket(t.data), nftCombat: nftCombatOn(e), warning: chain });
      }

      case 'POST ticket-check': {
        const b = await body(req);
        const t = await checkTicket(String(b.ticket ?? ''), await ticketSecret(e.AUTH_SECRET!), d.now());
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
        const s = await readSession(req, e);
        const me = s?.ids.length ? await accountFor(db, s.ids) : null;
        return json({ ...r, mine: r.ok ? r.players.find((p) => p.acc === me) ?? null : null, players: undefined });
      }

      case 'GET leaderboard':
        return json({ progression: !!db, rows: db ? await leaderboard(db) : [] });

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
  return { account: !!t.acc, tier: t.tier, tierLabel: TIER_DEFS[t.tier].label, tokenId: t.tok, metadataId: t.mid, tokenTier: t.tokTier, holder: t.holder, demo: t.demo, upgrades: t.up, signature: t.mid && t.tokTier === 'legendary' ? SIGNATURES[t.mid]?.name ?? null : null };
}

export const defaultDeps = async (): Promise<Deps> => ({
  env: authEnv() as GameEnv,
  db: async () => (await import('./db.js')).openDb(),
  fetch: (u, i) => fetch(u, i),
  now: () => Date.now(),
});
