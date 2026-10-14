// Accounts, tickets, upgrades and match settlement (master build, stages C and D). Pure logic over a Db, so every rule
// is tested against a real Postgres engine (PGlite) in tests/progression.test.ts. Files under api/_lib are not routes.
//
// Trust model:
// - The browser never reports a result. Settlement pulls the match record from the game server over HTTPS
//   (GAME_SERVER_URL, fixed server-side) and is idempotent by match id: a second settle of the same match changes nothing.
// - A game ticket is signed here and checked here (POST ticket-check from the game server). It names the account, the
//   verified holding and the power the server may apply. It expires in 10 minutes; the game server refuses a ticket id
//   it has already seen.
// - Account progression and token history are separate tables. A token transfer moves no XP, shards or rating.
import type { Db, Tx } from './db.js';
import { b64url, sign, unsign, type Identity } from './auth.js';
import { NO_UPGRADES, UPGRADES, UPGRADE_IDS, clampUpgrades, type Tier, type UpgradeId, type Upgrades } from '../../src/config/power.js';
import { RATING, levelOf, matchRewards, ratingDelta, REWARDS } from '../../src/config/progression.js';

export const TICKET_SECONDS = 10 * 60;

export interface GameTicket {
  /** Random ticket id: the game server accepts each one once. */
  tid: string;
  /** Account id, or null (database offline, or a demo ticket). Only tickets with an account earn anything. */
  acc: string | null;
  /** Power tier the server applies: the token's tier for a verified holder when NFT combat is on, or for demo; else free. */
  tier: Tier;
  up: Upgrades;
  /** The bound token (verified holders) or the demo token. */
  tok: number | null;
  mid: number | null;
  /** The token's own tier, shown on the card even while NFT combat power is off. */
  tokTier: Tier | null;
  own: string | null;
  holder: boolean;
  demo: boolean;
  name: string;
  exp: number;
}

const enc = new TextEncoder();

/** Ticket key: derived from AUTH_SECRET so no new secret is needed, and never equal to the session key. */
export async function ticketSecret(authSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(authSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('room-zero game ticket v1'))));
}

export async function issueTicket(t: Omit<GameTicket, 'tid' | 'exp'>, secret: string, now = Date.now()): Promise<{ ticket: string; data: GameTicket }> {
  const data: GameTicket = { ...t, tid: b64url(crypto.getRandomValues(new Uint8Array(12))), exp: Math.floor(now / 1000) + TICKET_SECONDS };
  return { ticket: await sign(data, secret), data };
}

export async function checkTicket(ticket: string, secret: string, now = Date.now()): Promise<GameTicket | null> {
  if (typeof ticket !== 'string' || ticket.length > 900) return null;
  return unsign<GameTicket>(ticket, secret, now);
}

// ---- accounts ----
const newId = () => b64url(crypto.getRandomValues(new Uint8Array(12)));

/**
 * The account behind a session's proven identities: the first identity already linked decides it; any other identity in
 * the session that is not linked anywhere is linked to it. Identities linked to another account are left alone.
 */
export async function accountFor(db: Db, ids: Identity[]): Promise<string | null> {
  if (!ids.length) return null;
  return db.tx(async (tx) => {
    let acc: string | null = null;
    for (const i of ids) {
      const r = await tx.query<{ account_id: string }>(`SELECT account_id FROM room_zero.identities WHERE provider = $1 AND subject = $2`, [i.provider, i.subject]);
      if (r.length) { acc = r[0].account_id; break; }
    }
    if (!acc) {
      acc = newId();
      await tx.query(`INSERT INTO room_zero.accounts (id, rating) VALUES ($1, $2)`, [acc, RATING.start]);
    }
    for (const i of ids) {
      await tx.query(`INSERT INTO room_zero.identities (provider, subject, account_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [i.provider, i.subject, acc]);
    }
    return acc;
  });
}

export async function upgradesOf(q: Tx, acc: string): Promise<Upgrades> {
  const rows = await q.query<{ upgrade_id: string; rank: number }>(`SELECT upgrade_id, rank FROM room_zero.upgrades WHERE account_id = $1`, [acc]);
  const u: Record<string, number> = { ...NO_UPGRADES };
  for (const r of rows) u[r.upgrade_id] = Number(r.rank);
  return clampUpgrades(u);
}

export interface Profile {
  account: string;
  xp: number;
  level: number;
  into: number;
  next: number;
  shards: number;
  rating: number;
  matches: number;
  wins: number;
  upgrades: Upgrades;
}

export async function profileOf(db: Db, acc: string): Promise<Profile | null> {
  const r = await db.query<{ xp: string; shards: number; rating: number; matches: number; wins: number }>(
    `SELECT xp, shards, rating, matches, wins FROM room_zero.accounts WHERE id = $1`, [acc]);
  if (!r.length) return null;
  const xp = Number(r[0].xp);
  return { account: acc, xp, ...levelOf(xp), shards: Number(r[0].shards), rating: Number(r[0].rating), matches: Number(r[0].matches), wins: Number(r[0].wins), upgrades: await upgradesOf(db, acc) };
}

export type BuyResult = { ok: true; rank: number; shards: number } | { ok: false; reason: 'unknown' | 'maxed' | 'shards' | 'no-account' };

/** Spend shards on the next rank of an upgrade. One transaction with the account row locked, so two clicks cannot double-spend. */
export async function buyUpgrade(db: Db, acc: string, id: string): Promise<BuyResult> {
  if (!(UPGRADE_IDS as string[]).includes(id)) return { ok: false, reason: 'unknown' };
  const def = UPGRADES[id as UpgradeId];
  return db.tx(async (tx) => {
    const a = await tx.query<{ shards: number }>(`SELECT shards FROM room_zero.accounts WHERE id = $1 FOR UPDATE`, [acc]);
    if (!a.length) return { ok: false, reason: 'no-account' } as const;
    const cur = (await upgradesOf(tx, acc))[id as UpgradeId];
    if (cur >= def.ranks) return { ok: false, reason: 'maxed' } as const;
    const cost = def.costs[cur];
    const shards = Number(a[0].shards);
    if (shards < cost) return { ok: false, reason: 'shards' } as const;
    await tx.query(`UPDATE room_zero.accounts SET shards = shards - $2 WHERE id = $1`, [acc, cost]);
    await tx.query(`INSERT INTO room_zero.upgrades (account_id, upgrade_id, rank) VALUES ($1, $2, $3)
      ON CONFLICT (account_id, upgrade_id) DO UPDATE SET rank = EXCLUDED.rank`, [acc, id, cur + 1]);
    await tx.query(`INSERT INTO room_zero.ledger (account_id, kind, delta, reason, ref) VALUES ($1, 'shards', $2, 'upgrade', $3)`, [acc, -cost, `${id}:${cur + 1}`]);
    return { ok: true, rank: cur + 1, shards: shards - cost } as const;
  });
}

// ---- settlement ----
/** One match as the game server records it (server/room.ts `MatchRecord`). */
export interface MatchRecord {
  id: string;
  mode: string;
  demo: boolean;
  winner: string | null;
  reason: string;
  seconds: number;
  endedAt: number;
  players: { acc: string | null; team: string; tier: Tier; tok: number | null; mid: number | null; own: string | null; kills: number; damage: number; left: boolean }[];
}

export function validRecord(r: unknown): r is MatchRecord {
  const m = r as MatchRecord;
  return !!m && typeof m.id === 'string' && /^[0-9a-f]{8,32}$/.test(m.id) && typeof m.mode === 'string' && typeof m.demo === 'boolean'
    && (m.winner === null || typeof m.winner === 'string') && Number.isFinite(m.seconds) && Number.isFinite(m.endedAt)
    && Array.isArray(m.players) && m.players.length >= 2 && m.players.length <= 10
    && m.players.every((p) => p && (p.acc === null || typeof p.acc === 'string') && typeof p.team === 'string' && Number.isFinite(p.kills) && Number.isFinite(p.damage) && typeof p.left === 'boolean');
}

export type SettleResult =
  | { ok: true; already: boolean; rewarded: boolean; players: { acc: string; xp: number; shards: number; ratingBefore: number; ratingAfter: number }[] }
  | { ok: false; reason: 'demo' | 'no-accounts' | 'invalid' };

export async function settleMatch(db: Db, m: MatchRecord): Promise<SettleResult> {
  if (!validRecord(m)) return { ok: false, reason: 'invalid' };
  if (m.demo) return { ok: false, reason: 'demo' };
  const accs = m.players.filter((p) => p.acc);
  if (!accs.length) return { ok: false, reason: 'no-accounts' };
  return db.tx(async (tx) => {
    const ins = await tx.query(`INSERT INTO room_zero.matches (id, mode, winner, reason, seconds, ended_at, rewarded)
      VALUES ($1, $2, $3, $4, $5, to_timestamp($6), $7) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [m.id, m.mode, m.winner, m.reason, Math.round(m.seconds), m.endedAt, m.seconds >= REWARDS.minSeconds]);
    if (!ins.length) {
      const rows = await tx.query<{ account_id: string; xp: number; shards: number; rating_before: number; rating_after: number }>(
        `SELECT account_id, xp, shards, rating_before, rating_after FROM room_zero.match_players WHERE match_id = $1`, [m.id]);
      return { ok: true, already: true, rewarded: false, players: rows.map((r) => ({ acc: r.account_id, xp: Number(r.xp), shards: Number(r.shards), ratingBefore: Number(r.rating_before), ratingAfter: Number(r.rating_after) })) };
    }
    // Ratings of every account in the match (locked), with free-profile defaults for players without an account.
    const ratings = new Map<string, number>();
    for (const p of accs) {
      const r = await tx.query<{ rating: number }>(`SELECT rating FROM room_zero.accounts WHERE id = $1 FOR UPDATE`, [p.acc]);
      if (r.length) ratings.set(p.acc!, Number(r[0].rating));
    }
    const sideRating = (team: string) => {
      const side = m.players.filter((p) => p.team === team);
      return side.reduce((s, p) => s + (p.acc && ratings.has(p.acc) ? ratings.get(p.acc)! : RATING.start) + (RATING.tierOffset[p.tier] ?? 0), 0) / Math.max(1, side.length);
    };
    const out: { acc: string; xp: number; shards: number; ratingBefore: number; ratingAfter: number }[] = [];
    for (const p of accs) {
      const acc = p.acc!;
      if (!ratings.has(acc)) continue; // unknown account id: nothing to credit
      const won = m.winner !== null && p.team === m.winner && !p.left;
      const score = p.left ? 0 : m.winner === null ? 0.5 : won ? 1 : 0;
      const foes = [...new Set(m.players.map((x) => x.team))].filter((t) => t !== p.team);
      const delta = foes.length ? ratingDelta(sideRating(p.team), sideRating(foes[0]), score) : 0;
      const before = ratings.get(acc)!;
      const recent = await tx.query<{ n: string }>(`SELECT count(*) AS n FROM room_zero.match_players mp JOIN room_zero.matches mt ON mt.id = mp.match_id
        WHERE mp.account_id = $1 AND mp.xp > 0 AND mt.settled_at > now() - interval '24 hours'`, [acc]);
      const r = matchRewards({ won, kills: p.kills, leftEarly: p.left, seconds: m.seconds, capped: Number(recent[0].n) >= REWARDS.dailyCap });
      await tx.query(`UPDATE room_zero.accounts SET xp = xp + $2, shards = shards + $3, rating = rating + $4, matches = matches + 1, wins = wins + $5 WHERE id = $1`,
        [acc, r.xp, r.shards, delta, won ? 1 : 0]);
      if (r.xp) await tx.query(`INSERT INTO room_zero.ledger (account_id, kind, delta, reason, ref) VALUES ($1, 'xp', $2, 'match', $3) ON CONFLICT DO NOTHING`, [acc, r.xp, m.id]);
      if (r.shards) await tx.query(`INSERT INTO room_zero.ledger (account_id, kind, delta, reason, ref) VALUES ($1, 'shards', $2, 'match', $3) ON CONFLICT DO NOTHING`, [acc, r.shards, m.id]);
      await tx.query(`INSERT INTO room_zero.match_players (match_id, account_id, team, tier, token_id, kills, damage, won, left_early, xp, shards, rating_before, rating_after)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [m.id, acc, p.team, p.tier, p.tok, Math.round(p.kills), Math.round(p.damage), won, p.left, r.xp, r.shards, before, before + delta]);
      if (p.tok && p.mid && p.own) {
        await tx.query(`INSERT INTO room_zero.token_history (token_id, match_id, account_id, owner_address, metadata_id, kills, won) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [p.tok, m.id, acc, p.own, p.mid, Math.round(p.kills), won]);
      }
      out.push({ acc, xp: r.xp, shards: r.shards, ratingBefore: before, ratingAfter: before + delta });
    }
    return { ok: true, already: false, rewarded: m.seconds >= REWARDS.minSeconds, players: out };
  });
}

export async function leaderboard(db: Db, limit = 20): Promise<{ rank: number; account: string; rating: number; level: number; wins: number; matches: number }[]> {
  const rows = await db.query<{ id: string; rating: number; xp: string; wins: number; matches: number }>(
    `SELECT id, rating, xp, wins, matches FROM room_zero.accounts WHERE matches > 0 ORDER BY rating DESC, wins DESC, id LIMIT $1`, [limit]);
  return rows.map((r, i) => ({ rank: i + 1, account: r.id.slice(0, 6), rating: Number(r.rating), level: levelOf(Number(r.xp)).level, wins: Number(r.wins), matches: Number(r.matches) }));
}

export async function tokenHistory(db: Db, tokenId: number): Promise<{ matches: number; wins: number; kills: number }> {
  const r = await db.query<{ n: string; w: string; k: string }>(
    `SELECT count(*) AS n, count(*) FILTER (WHERE won) AS w, coalesce(sum(kills), 0) AS k FROM room_zero.token_history WHERE token_id = $1`, [tokenId]);
  return { matches: Number(r[0].n), wins: Number(r[0].w), kills: Number(r[0].k) };
}
