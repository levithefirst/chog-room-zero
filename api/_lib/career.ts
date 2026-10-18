// The account-owned profile (master integration pass, owner 2026-10-14): callsign, favourite operator, pinned medals,
// medals, solo practice career and online career all live on the account in Neon, never in the browser. A player who
// signs in on another device sees the same profile. Files under api/_lib are not routes.
//
// Trust model for practice (solo vs bots, simulated in the browser): the run is self-reported, so it is checked against
// hard bounds, rate limited and stored once per run id. Owner 2026-10-17: practice pays XP and shards so a loss still
// moves you forward, at a smaller, capped rate (PRACTICE_REWARDS): a run is paid only with a start ticket signed here
// (account, run id, start time) and only when at least the claimed play time has passed since that start; one payment
// per run id (ledger unique key); at most PRACTICE_REWARDS.dailyCap paid runs and PRACTICE_SHARDS_PER_DAY shards per
// rolling 24 h. One practice run is open per account: each start replaces the account's open run id (accounts.practice_rid),
// so starting many runs in parallel and posting them later pays only the last. A run must also be plausible for its
// length (PRACTICE_WIN_MIN_SECONDS, PRACTICE_SECONDS_PER_KILL). A forged run is worth no more than an honest one.
// Practice never changes rating and never touches the leaderboard; it feeds the practice career and medals, awarded
// here from the stored VERIFIED runs only (an unticketed or implausible run is stored, pays nothing, counts for nothing).
import type { Db, Tx } from './db.js';
import { b64url, sign, unsign } from './auth.js';
import { PRACTICE_REWARDS, rewardBreakdown, type RewardLine, type NoReward } from '../../src/config/progression.js';
import { MEDALS, medalsDue, type OnlineTotals, type RunFacts } from '../../src/ui/medals.js';
import type { Best, Records } from '../../src/ui/records.js';
import { validateNickname } from '../../src/ui/profile.js';
import { heroIdOf } from '../../src/config/heroes.js';
import { CHALLENGE_REWARDS, daily, dayOf, type DayRow } from '../../src/config/challenges.js';
import { BOT_SPAWNS } from '../../src/config/map.js';
import type { Tier } from '../../src/config/power.js';
import { profileOf, type Profile } from './game.js';

const MEDAL_IDS = MEDALS.map((m) => m.id);
/** Practice runs an account may store per minute (a run is at least ~10 s of real play). */
export const PRACTICE_PER_MINUTE = 6;
/** A practice ticket is good for this long after its start (a run is at most 900 s of play). */
export const PRACTICE_TICKET_SECONDS = 30 * 60;
/** Slack between the browser's play clock and the site's wall clock (seconds). */
const CLOCK_SLACK = 3;
/** Practice shards paid per account per rolling 24 h (25 max-value wins would be 600). */
export const PRACTICE_SHARDS_PER_DAY = 300;
/**
 * A practice win shorter than this is not paid. Measured 2026-10-17 (autopilot, 168 runs, 7 heroes, seeds 1-12, with and
 * without AI teammates, zone on): the fastest of 42 wins took 35.2 s.
 */
export const PRACTICE_WIN_MIN_SECONDS = 30;
/** Seconds of play per kill claimed, at least (same measurement: the fewest seconds per kill in a win was 8.8). */
export const PRACTICE_SECONDS_PER_KILL = 6;

// ---- practice tickets ----
interface PracticeTicket { k: 'practice'; acc: string; rid: string; t0: number; exp: number }
const enc = new TextEncoder();

/** Practice ticket key: derived from AUTH_SECRET, distinct from the session and game ticket keys. */
export async function practiceSecret(authSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(authSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('room-zero practice ticket v1'))));
}

/**
 * Issued when a signed-in run starts: the run id the result must carry, and when it started (site clock). The run id
 * becomes the account's one open practice run, replacing any earlier one (only the latest start can be paid).
 */
export async function startPractice(db: Tx, acc: string, secret: string, now = Date.now()): Promise<{ ticket: string; runId: string }> {
  const rid = b64url(crypto.getRandomValues(new Uint8Array(12)));
  await db.query(`UPDATE room_zero.accounts SET practice_rid = $2 WHERE id = $1`, [acc, rid]);
  const t: PracticeTicket = { k: 'practice', acc, rid, t0: now, exp: Math.floor(now / 1000) + PRACTICE_TICKET_SECONDS };
  return { ticket: await sign(t, secret), runId: rid };
}

/** The run's start time when the ticket is genuine, this account's, for this run id; else null. */
async function ticketStart(raw: unknown, acc: string, runId: string, secret: string, now: number): Promise<number | null> {
  if (typeof raw !== 'string' || raw.length > 600) return null;
  const t = await unsign<PracticeTicket>(raw, secret, now);
  return t && t.k === 'practice' && t.acc === acc && t.rid === runId && Number.isFinite(t.t0) ? t.t0 : null;
}

// ---- callsign and preferences ----
/** Callsigns are unique across accounts, ignoring case (unique index accounts_callsign_unique, migration 5). */
export async function setCallsign(db: Db, acc: string, raw: unknown): Promise<{ ok: true; callsign: string } | { ok: false; error: string; code?: 'callsign_taken' }> {
  const v = validateNickname(typeof raw === 'string' ? raw.slice(0, 40) : '');
  if (!v.ok) return { ok: false, error: v.error };
  try {
    await db.query(`UPDATE room_zero.accounts SET callsign = $2, display_name = $2 WHERE id = $1`, [acc, v.value]);
  } catch (e) {
    // The client shows `error` as written; `code` is for callers that branch on it.
    if ((e as { code?: string }).code === '23505') return { ok: false, error: 'That callsign is taken. Try another.', code: 'callsign_taken' };
    throw e;
  }
  return { ok: true, callsign: v.value };
}

/** Favourite operator (a hero id or null) and up to three pinned medals, which must be medals this account earned. */
export async function setPrefs(db: Db, acc: string, b: { favourite?: unknown; pins?: unknown; hidden?: unknown }): Promise<{ ok: boolean; error?: string }> {
  // GP: "Show me on the leaderboards" (off: others never see your row; you still see your own rank).
  if (b.hidden !== undefined) {
    if (typeof b.hidden !== 'boolean') return { ok: false, error: 'bad_hidden' };
    await db.query(`UPDATE room_zero.accounts SET lb_hidden = $2 WHERE id = $1`, [acc, b.hidden]);
  }
  if (b.favourite !== undefined) {
    if (b.favourite !== null && !heroIdOf(b.favourite)) return { ok: false, error: 'bad_favourite' };
    await db.query(`UPDATE room_zero.accounts SET favourite_hero = $2 WHERE id = $1`, [acc, b.favourite === null ? null : heroIdOf(b.favourite)]);
  }
  if (b.pins !== undefined) {
    if (!Array.isArray(b.pins) || b.pins.length > 3 || !b.pins.every((p) => typeof p === 'string' && MEDAL_IDS.includes(p))) return { ok: false, error: 'bad_pins' };
    const earned = await medalsOf(db, acc);
    const pins = [...new Set(b.pins as string[])].filter((p) => earned[p]);
    await db.query(`UPDATE room_zero.accounts SET pins = $2 WHERE id = $1`, [acc, pins]);
  }
  return { ok: true };
}

// ---- medals ----
export async function medalsOf(q: Tx, acc: string): Promise<Record<string, string>> {
  const rows = await q.query<{ medal_id: string; earned_at: Date | string }>(`SELECT medal_id, earned_at FROM room_zero.medals WHERE account_id = $1`, [acc]);
  return Object.fromEntries(rows.map((r) => [r.medal_id, new Date(r.earned_at).toISOString()]));
}

// ---- practice career ----
const emptyBest = (): Best => ({ bestWinSeconds: null, mostKills: 0, runs: 0, wins: 0, kills: 0, bullets: 0, hits: 0, damageDealt: 0, damageTaken: 0, seconds: 0, pickups: 0, abilities: 0, revives: 0, loots: 0, thrown: 0 });

/** Practice records (the same shape the medals and player card read), aggregated from the stored verified runs. */
export async function practiceRecords(q: Tx, acc: string): Promise<Records> {
  const rows = await q.query<Record<string, string | number | null>>(
    `SELECT hero, count(*) AS runs, count(*) FILTER (WHERE won) AS wins, min(seconds) FILTER (WHERE won) AS best, max(kills) AS most,
       sum(kills) AS kills, sum(bullets) AS bullets, sum(hits) AS hits, sum(damage_dealt) AS dealt, sum(damage_taken) AS taken,
       sum(seconds) AS seconds, sum(pickups) AS pickups, sum(abilities) AS abilities, sum(revives) AS revives, sum(loots) AS loots, sum(thrown) AS thrown
     FROM room_zero.practice_runs WHERE account_id = $1 AND verified GROUP BY hero`, [acc]);
  const rec: Records = { overall: emptyBest(), heroes: {} };
  for (const r of rows) {
    const b: Best = {
      bestWinSeconds: r.best === null ? null : Number(r.best), mostKills: Number(r.most), runs: Number(r.runs), wins: Number(r.wins),
      kills: Number(r.kills), bullets: Number(r.bullets), hits: Number(r.hits), damageDealt: Number(r.dealt), damageTaken: Number(r.taken),
      seconds: Number(r.seconds), pickups: Number(r.pickups), abilities: Number(r.abilities),
      revives: Number(r.revives ?? 0), loots: Number(r.loots ?? 0), thrown: Number(r.thrown ?? 0),
    };
    // Runs stored under a pre-roster id (kettle, mop, brick, wick) count for the character that replaced it.
    const id = heroIdOf(r.hero) ?? String(r.hero);
    const prev = rec.heroes[id];
    rec.heroes[id] = prev ? mergeBest(prev, b) : b;
    const o = rec.overall;
    o.runs += b.runs; o.wins += b.wins; o.mostKills = Math.max(o.mostKills, b.mostKills);
    if (b.bestWinSeconds !== null && (o.bestWinSeconds === null || b.bestWinSeconds < o.bestWinSeconds)) o.bestWinSeconds = b.bestWinSeconds;
    for (const k of ['kills', 'bullets', 'hits', 'damageDealt', 'damageTaken', 'seconds', 'pickups', 'abilities', 'revives', 'loots', 'thrown'] as const) o[k] += b[k];
  }
  return rec;
}

/** GP: online totals for medals, from the settled match rows only (the game server's record, never the browser). */
export async function onlineTotals(q: Tx, acc: string): Promise<OnlineTotals> {
  const r = await q.query<{ n: string; f: string; w: string; k: string }>(
    `SELECT count(*) AS n, count(*) FILTER (WHERE NOT left_early) AS f, count(*) FILTER (WHERE won) AS w, coalesce(sum(kills), 0) AS k
     FROM room_zero.match_players WHERE account_id = $1`, [acc]);
  return { matches: Number(r[0]?.n ?? 0), finished: Number(r[0]?.f ?? 0), wins: Number(r[0]?.w ?? 0), kills: Number(r[0]?.k ?? 0) };
}

/** Award every medal the stored career now meets (optionally with the run just stored). Idempotent: ON CONFLICT. */
export async function awardDue(tx: Tx, acc: string, run: RunFacts | null, records?: Records): Promise<string[]> {
  const have = await medalsOf(tx, acc);
  const due = medalsDue(have, records ?? await practiceRecords(tx, acc), run, await onlineTotals(tx, acc));
  const earned: string[] = [];
  for (const m of due) {
    const r = await tx.query(`INSERT INTO room_zero.medals (account_id, medal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING medal_id`, [acc, m.id]);
    if (r.length) earned.push(m.id);
  }
  return earned;
}

const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/** A practice run as the browser reports it, or null when any number is outside what the game can produce. */
export function validPractice(b: Record<string, unknown>): (RunFacts & { runId: string; damageDealt: number }) | null {
  const runId = typeof b.runId === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(b.runId) ? b.runId : null;
  const hero = heroIdOf(b.hero);
  const bots = BOT_SPAWNS.length;
  const f = {
    seconds: int(b.seconds, 1, 900), kills: int(b.kills, 0, bots), bullets: int(b.bullets, 0, 20000), hits: int(b.hits, 0, 20000),
    damageDealt: int(b.damageDealt, 0, 50000), damageTaken: int(b.damageTaken, 0, 50000), hpLeft: int(b.hpLeft, 0, 1000),
    pickups: int(b.pickups, 0, 200), abilities: int(b.abilities, 0, 300),
    // GP (optional for older clients: absent counts as 0): revives given and received, loot bags, grenades thrown, AI
    // teammates eliminated. Bounded by what one run can hold (two AI teammates, five hostiles to drop kit).
    revives: b.revives === undefined ? 0 : int(b.revives, 0, 20), revived: b.revived === undefined ? 0 : int(b.revived, 0, 10),
    loots: b.loots === undefined ? 0 : int(b.loots, 0, 40), thrown: b.thrown === undefined ? 0 : int(b.thrown, 0, 60),
    alliesLost: b.alliesLost === undefined ? 0 : int(b.alliesLost, 0, 2),
  };
  if (!runId || !hero || typeof b.won !== 'boolean' || Object.values(f).some((v) => v === null)) return null;
  const n = f as { [K in keyof typeof f]: number };
  if (n.hits > n.bullets) return null;
  // A revive takes 3 s of standing still: a run cannot hold more than its length allows.
  if (n.revives * 3 + n.revived * 3 > n.seconds) return null;
  // (A clear needs every hostile down, but the default game has AI teammates who down some of them too.)
  return { runId, hero, won: b.won, ...n };
}

/** Long enough for what it claims: kills take time, and a win takes at least PRACTICE_WIN_MIN_SECONDS. */
export function plausiblePractice(r: { won: boolean; seconds: number; kills: number }): boolean {
  return r.seconds >= PRACTICE_SECONDS_PER_KILL * r.kills && (!r.won || r.seconds >= PRACTICE_WIN_MIN_SECONDS);
}

export interface PracticeReward { xp: number; shards: number; lines: RewardLine[]; none: NoReward }

export interface PracticeResult {
  ok: true;
  already: boolean;
  reward: PracticeReward;
  earned: string[];
  newBest: { time: boolean; kills: boolean };
  records: Records;
  medals: Record<string, string>;
}

/**
 * Store one practice run (once per run id), pay it (ticketed, capped), then award every medal the stored career now
 * meets. Without `secret` the run is stored unverified: never paid, never in the career or medals.
 */
export async function recordPractice(db: Db, acc: string, raw: Record<string, unknown>, opts: { secret?: string; now?: number } = {}): Promise<PracticeResult | { ok: false; reason: 'invalid' | 'rate' }> {
  const run = validPractice(raw);
  if (!run) return { ok: false, reason: 'invalid' };
  const now = opts.now ?? Date.now();
  const t0 = opts.secret ? await ticketStart(raw.ticket, acc, run.runId, opts.secret, now) : null;
  // Wall time since the start ticket must cover the claimed play time (pauses only make it longer), and the claim must
  // be plausible for its length.
  const timed = t0 !== null && now - t0 >= (run.seconds - CLOCK_SLACK) * 1000 && plausiblePractice(run);
  return db.tx(async (tx) => {
    const a = await tx.query<{ practice_rid: string | null }>(`SELECT practice_rid FROM room_zero.accounts WHERE id = $1 FOR UPDATE`, [acc]);
    // Only the account's open run (its latest start) can be verified.
    const verified = timed && a[0]?.practice_rid === run.runId;
    const recent = await tx.query<{ n: string }>(`SELECT count(*) AS n FROM room_zero.practice_runs WHERE account_id = $1 AND created_at > now() - interval '1 minute'`, [acc]);
    const before = await practiceRecords(tx, acc);
    const prev = before.heroes[run.hero] ?? emptyBest();
    if (Number(recent[0].n) >= PRACTICE_PER_MINUTE) return { ok: false, reason: 'rate' } as const;
    const paid = await tx.query<{ n: string; s: string }>(`SELECT count(*) AS n, coalesce(sum(shards), 0) AS s FROM room_zero.practice_runs
      WHERE account_id = $1 AND xp > 0 AND created_at > now() - interval '24 hours'`, [acc]);
    const facts = { won: run.won, kills: run.kills, damage: run.damageDealt, seconds: run.seconds, leftEarly: false, demo: raw.demo === true, unverified: !verified };
    let r = rewardBreakdown({ ...facts, capped: Number(paid[0].n) >= PRACTICE_REWARDS.dailyCap }, PRACTICE_REWARDS);
    if (r.shards && Number(paid[0].s) + r.shards > PRACTICE_SHARDS_PER_DAY) r = rewardBreakdown({ ...facts, capped: true }, PRACTICE_REWARDS);
    const ins = await tx.query(`INSERT INTO room_zero.practice_runs (account_id, run_id, hero, won, seconds, kills, bullets, hits, damage_dealt, damage_taken, pickups, abilities, hp_left, xp, shards, verified, revives, revived, loots, thrown, allies_lost)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) ON CONFLICT DO NOTHING RETURNING run_id`,
      [acc, run.runId, run.hero, run.won, run.seconds, run.kills, run.bullets, run.hits, run.damageDealt, run.damageTaken, run.pickups, run.abilities, run.hpLeft, r.xp, r.shards, verified,
        run.revives ?? 0, run.revived ?? 0, run.loots ?? 0, run.thrown ?? 0, run.alliesLost ?? 0]);
    // The open run is spent once it is stored verified.
    if (ins.length && verified) await tx.query(`UPDATE room_zero.accounts SET practice_rid = NULL WHERE id = $1`, [acc]);
    // Career, medals and bests move only for a newly stored verified run.
    const counts = !!ins.length && verified;
    let reward: PracticeReward = { xp: r.xp, shards: r.shards, lines: r.lines, none: r.none };
    if (ins.length && (r.xp || r.shards)) {
      // The ledger's unique key (account, kind, reason, ref) is the second lock against paying a run twice.
      const x = await tx.query(`INSERT INTO room_zero.ledger (account_id, kind, delta, reason, ref) VALUES ($1, 'xp', $2, 'practice', $3) ON CONFLICT DO NOTHING RETURNING id`, [acc, r.xp, run.runId]);
      const sh = r.shards ? await tx.query(`INSERT INTO room_zero.ledger (account_id, kind, delta, reason, ref) VALUES ($1, 'shards', $2, 'practice', $3) ON CONFLICT DO NOTHING RETURNING id`, [acc, r.shards, run.runId]) : [];
      await tx.query(`UPDATE room_zero.accounts SET xp = xp + $2, shards = shards + $3 WHERE id = $1`, [acc, x.length ? r.xp : 0, sh.length ? r.shards : 0]);
    } else if (!ins.length) {
      // Already stored: answer what that run was paid, never pay again.
      const prevRun = await tx.query<{ xp: number; shards: number }>(`SELECT xp, shards FROM room_zero.practice_runs WHERE account_id = $1 AND run_id = $2`, [acc, run.runId]);
      reward = { xp: Number(prevRun[0]?.xp ?? 0), shards: Number(prevRun[0]?.shards ?? 0), lines: [], none: null };
    }
    const records = await practiceRecords(tx, acc);
    const earned = counts ? await awardDue(tx, acc, run, records) : [];
    const newBest = {
      time: counts && run.won && (prev.bestWinSeconds === null || run.seconds < prev.bestWinSeconds),
      kills: counts && run.kills > prev.mostKills,
    };
    return { ok: true, already: !ins.length, reward, earned, newBest, records, medals: await medalsOf(tx, acc) } as const;
  });
}

function mergeBest(a: Best, b: Best): Best {
  const out = { ...a, mostKills: Math.max(a.mostKills, b.mostKills) };
  if (b.bestWinSeconds !== null && (a.bestWinSeconds === null || b.bestWinSeconds < a.bestWinSeconds)) out.bestWinSeconds = b.bestWinSeconds;
  for (const k of ['runs', 'wins', 'kills', 'bullets', 'hits', 'damageDealt', 'damageTaken', 'seconds', 'pickups', 'abilities', 'revives', 'loots', 'thrown'] as const) out[k] = a[k] + b[k];
  return out;
}

// ---- online career ----
export interface OnlineCareer { matches: number; wins: number; kills: number; damage: number; survived: number; heroes: Record<string, { matches: number; wins: number; kills: number }> }

export async function onlineCareer(q: Tx, acc: string): Promise<OnlineCareer> {
  const rows = await q.query<Record<string, string | null>>(
    `SELECT coalesce(hero, '') AS hero, count(*) AS n, count(*) FILTER (WHERE won) AS w, coalesce(sum(kills), 0) AS k, coalesce(sum(damage), 0) AS d,
       count(*) FILTER (WHERE survived) AS s
     FROM room_zero.match_players WHERE account_id = $1 GROUP BY coalesce(hero, '')`, [acc]);
  const out: OnlineCareer = { matches: 0, wins: 0, kills: 0, damage: 0, survived: 0, heroes: {} };
  for (const r of rows) {
    const n = Number(r.n), w = Number(r.w), k = Number(r.k);
    out.matches += n; out.wins += w; out.kills += k; out.damage += Number(r.d); out.survived += Number(r.s);
    if (r.hero) {
      const id = heroIdOf(r.hero) ?? r.hero;
      const h = out.heroes[id] ?? { matches: 0, wins: 0, kills: 0 };
      out.heroes[id] = { matches: h.matches + n, wins: h.wins + w, kills: h.kills + k };
    }
  }
  return out;
}

/** Everything the hub shows about a signed-in account, in one read. */
export interface AccountView extends Profile {
  callsign: string | null;
  favourite: string | null;
  pins: string[];
  medals: Record<string, string>;
  practice: Records;
  online: OnlineCareer;
  /** The account's Chog at its last live ownership read (display only): tier and token, or null. */
  nft: { tier: Tier; tokenId: number | null } | null;
}

export async function accountView(db: Db, acc: string): Promise<AccountView | null> {
  const p = await profileOf(db, acc);
  if (!p) return null;
  const r = await db.query<{ callsign: string | null; favourite_hero: string | null; pins: string[] | null; nft_tier: string | null; nft_token_id: number | null }>(
    `SELECT callsign, favourite_hero, pins, nft_tier, nft_token_id FROM room_zero.accounts WHERE id = $1`, [acc]);
  const a = r[0];
  const tier = a.nft_tier && ['common', 'uncommon', 'rare', 'epic', 'legendary'].includes(a.nft_tier) ? (a.nft_tier as Tier) : null;
  return {
    ...p, callsign: a.callsign, favourite: heroIdOf(a.favourite_hero), pins: a.pins ?? [],
    medals: await medalsOf(db, acc), practice: await practiceRecords(db, acc), online: await onlineCareer(db, acc),
    nft: tier ? { tier, tokenId: a.nft_token_id === null ? null : Number(a.nft_token_id) } : null,
  };
}


// ---- V2 daily challenges (src/config/challenges.ts) ----

/** Today's stored results for an account: verified practice runs and settled matches that paid (UTC day `day`). */
export async function dayRows(q: Tx, acc: string, day: number): Promise<DayRow[]> {
  const from = day * 86400, to = from + 86400;
  const solo = await q.query<{ hero: string; won: boolean; seconds: number; kills: number; bullets: number; hits: number; damage_taken: number; revives: number; loots: number; thrown: number; allies_lost: number }>(
    `SELECT hero, won, seconds, kills, bullets, hits, damage_taken, revives, loots, thrown, allies_lost FROM room_zero.practice_runs
     WHERE account_id = $1 AND verified AND created_at >= to_timestamp($2) AND created_at < to_timestamp($3)`, [acc, from, to]);
  const online = await q.query<{ hero: string | null; won: boolean; kills: number; revives: number; loots: number }>(
    `SELECT mp.hero, mp.won, mp.kills, mp.revives, mp.loots FROM room_zero.match_players mp JOIN room_zero.matches m ON m.id = mp.match_id
     WHERE mp.account_id = $1 AND m.rewarded AND NOT mp.left_early AND m.settled_at >= to_timestamp($2) AND m.settled_at < to_timestamp($3)`, [acc, from, to]);
  return [
    ...solo.map((r) => ({ mode: 'solo' as const, hero: heroIdOf(r.hero) ?? r.hero, won: !!r.won, seconds: Number(r.seconds), kills: Number(r.kills), bullets: Number(r.bullets), hits: Number(r.hits),
      damageTaken: Number(r.damage_taken), revives: Number(r.revives), loots: Number(r.loots), thrown: Number(r.thrown), alliesLost: Number(r.allies_lost) })),
    ...online.map((r) => ({ mode: 'online' as const, hero: heroIdOf(r.hero) ?? r.hero ?? '', won: !!r.won, seconds: 0, kills: Number(r.kills), bullets: 0, hits: 0,
      damageTaken: 0, revives: Number(r.revives), loots: Number(r.loots), thrown: 0, alliesLost: 0 })),
  ];
}

export interface ChallengeView { id: string; tier: 1 | 2 | 3; text: string; goal: number; progress: number; done: boolean; paid: boolean; shards: number; xp: number }

/**
 * Today's challenges with this account's progress; any newly done one is paid here, once (ledger unique key
 * account, kind, 'challenge', day:id), in the caller's transaction. Without an account: the list, no progress. Called
 * only by GET /api/game/challenges (the client asks after every run and match), so a practice run or a settlement pays
 * exactly what it always did.
 */
export async function challengesFor(q: Tx, acc: string | null, nowMs: number): Promise<{ day: number; hero: string; list: ChallengeView[]; paidNow: ChallengeView[] }> {
  const d = daily(dayOf(nowMs));
  const rows = acc ? await dayRows(q, acc, d.day) : [];
  const paid = acc ? new Set((await q.query<{ ref: string }>(`SELECT ref FROM room_zero.ledger WHERE account_id = $1 AND reason = 'challenge' AND kind = 'xp' AND ref LIKE $2`, [acc, `${d.day}:%`])).map((r) => r.ref)) : new Set<string>();
  const list: ChallengeView[] = [], paidNow: ChallengeView[] = [];
  for (const { def, text } of d.list) {
    const progress = Math.min(def.goal, def.progress(rows, d.hero));
    const rw = CHALLENGE_REWARDS[def.tier], ref = `${d.day}:${def.id}`;
    const v: ChallengeView = { id: def.id, tier: def.tier, text, goal: def.goal, progress, done: progress >= def.goal, paid: paid.has(ref), shards: rw.shards, xp: rw.xp };
    if (acc && v.done && !v.paid) {
      const x = await q.query(`INSERT INTO room_zero.ledger (account_id, kind, delta, reason, ref) VALUES ($1, 'xp', $2, 'challenge', $3) ON CONFLICT DO NOTHING RETURNING id`, [acc, rw.xp, ref]);
      if (x.length) {
        await q.query(`INSERT INTO room_zero.ledger (account_id, kind, delta, reason, ref) VALUES ($1, 'shards', $2, 'challenge', $3) ON CONFLICT DO NOTHING`, [acc, rw.shards, ref]);
        await q.query(`UPDATE room_zero.accounts SET xp = xp + $2, shards = shards + $3 WHERE id = $1`, [acc, rw.xp, rw.shards]);
        v.paid = true;
        paidNow.push(v);
      } else v.paid = true;
    }
    list.push(v);
  }
  return { day: d.day, hero: d.hero, list, paidNow };
}
