// The account-owned profile (master integration pass, owner 2026-10-14): callsign, favourite operator, pinned medals,
// medals, solo practice career and online career all live on the account in Neon, never in the browser. A player who
// signs in on another device sees the same profile. Files under api/_lib are not routes.
//
// Trust model for practice (solo vs bots, simulated in the browser): the run is self-reported, so it is checked against
// hard bounds, rate limited, stored once per run id, and it pays NO XP, shards or rating and never touches the
// leaderboard. It only feeds the practice career and medals, which are awarded here from the stored runs.
import type { Db, Tx } from './db.js';
import { MEDALS, type RunFacts } from '../../src/ui/medals.js';
import type { Best, Records } from '../../src/ui/records.js';
import { validateNickname } from '../../src/ui/profile.js';
import { HEROES } from '../../src/config/heroes.js';
import { BOT_SPAWNS } from '../../src/config/map.js';
import type { Tier } from '../../src/config/power.js';
import { profileOf, type Profile } from './game.js';

const HERO_IDS = HEROES.map((h) => h.id);
const MEDAL_IDS = MEDALS.map((m) => m.id);
/** Practice runs an account may store per minute (a run is at least ~10 s of real play). */
export const PRACTICE_PER_MINUTE = 6;

// ---- callsign and preferences ----
export async function setCallsign(db: Db, acc: string, raw: unknown): Promise<{ ok: true; callsign: string } | { ok: false; error: string }> {
  const v = validateNickname(typeof raw === 'string' ? raw.slice(0, 40) : '');
  if (!v.ok) return { ok: false, error: v.error };
  await db.query(`UPDATE room_zero.accounts SET callsign = $2, display_name = $2 WHERE id = $1`, [acc, v.value]);
  return { ok: true, callsign: v.value };
}

/** Favourite operator (a hero id or null) and up to three pinned medals, which must be medals this account earned. */
export async function setPrefs(db: Db, acc: string, b: { favourite?: unknown; pins?: unknown }): Promise<{ ok: boolean; error?: string }> {
  if (b.favourite !== undefined) {
    if (b.favourite !== null && !(typeof b.favourite === 'string' && HERO_IDS.includes(b.favourite))) return { ok: false, error: 'bad_favourite' };
    await db.query(`UPDATE room_zero.accounts SET favourite_hero = $2 WHERE id = $1`, [acc, b.favourite]);
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
const emptyBest = (): Best => ({ bestWinSeconds: null, mostKills: 0, runs: 0, wins: 0, kills: 0, bullets: 0, hits: 0, damageDealt: 0, damageTaken: 0, seconds: 0, pickups: 0, abilities: 0 });

/** Practice records (the same shape the medals and player card read), aggregated from the stored runs. */
export async function practiceRecords(q: Tx, acc: string): Promise<Records> {
  const rows = await q.query<Record<string, string | number | null>>(
    `SELECT hero, count(*) AS runs, count(*) FILTER (WHERE won) AS wins, min(seconds) FILTER (WHERE won) AS best, max(kills) AS most,
       sum(kills) AS kills, sum(bullets) AS bullets, sum(hits) AS hits, sum(damage_dealt) AS dealt, sum(damage_taken) AS taken,
       sum(seconds) AS seconds, sum(pickups) AS pickups, sum(abilities) AS abilities
     FROM room_zero.practice_runs WHERE account_id = $1 GROUP BY hero`, [acc]);
  const rec: Records = { overall: emptyBest(), heroes: {} };
  for (const r of rows) {
    const b: Best = {
      bestWinSeconds: r.best === null ? null : Number(r.best), mostKills: Number(r.most), runs: Number(r.runs), wins: Number(r.wins),
      kills: Number(r.kills), bullets: Number(r.bullets), hits: Number(r.hits), damageDealt: Number(r.dealt), damageTaken: Number(r.taken),
      seconds: Number(r.seconds), pickups: Number(r.pickups), abilities: Number(r.abilities),
    };
    rec.heroes[String(r.hero)] = b;
    const o = rec.overall;
    o.runs += b.runs; o.wins += b.wins; o.mostKills = Math.max(o.mostKills, b.mostKills);
    if (b.bestWinSeconds !== null && (o.bestWinSeconds === null || b.bestWinSeconds < o.bestWinSeconds)) o.bestWinSeconds = b.bestWinSeconds;
    for (const k of ['kills', 'bullets', 'hits', 'damageDealt', 'damageTaken', 'seconds', 'pickups', 'abilities'] as const) o[k] += b[k];
  }
  return rec;
}

const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/** A practice run as the browser reports it, or null when any number is outside what the game can produce. */
export function validPractice(b: Record<string, unknown>): (RunFacts & { runId: string; damageDealt: number }) | null {
  const runId = typeof b.runId === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(b.runId) ? b.runId : null;
  const hero = typeof b.hero === 'string' && HERO_IDS.includes(b.hero) ? b.hero : null;
  const bots = BOT_SPAWNS.length;
  const f = {
    seconds: int(b.seconds, 1, 900), kills: int(b.kills, 0, bots), bullets: int(b.bullets, 0, 20000), hits: int(b.hits, 0, 20000),
    damageDealt: int(b.damageDealt, 0, 50000), damageTaken: int(b.damageTaken, 0, 50000), hpLeft: int(b.hpLeft, 0, 1000),
    pickups: int(b.pickups, 0, 200), abilities: int(b.abilities, 0, 300),
  };
  if (!runId || !hero || typeof b.won !== 'boolean' || Object.values(f).some((v) => v === null)) return null;
  const n = f as { [K in keyof typeof f]: number };
  if (n.hits > n.bullets) return null;
  // (A clear needs every hostile down, but the default game has AI teammates who down some of them too.)
  return { runId, hero, won: b.won, ...n };
}

export interface PracticeResult {
  ok: true;
  already: boolean;
  earned: string[];
  newBest: { time: boolean; kills: boolean };
  records: Records;
  medals: Record<string, string>;
}

/** Store one practice run (once per run id), then award every medal the stored career now meets. */
export async function recordPractice(db: Db, acc: string, raw: Record<string, unknown>): Promise<PracticeResult | { ok: false; reason: 'invalid' | 'rate' }> {
  const run = validPractice(raw);
  if (!run) return { ok: false, reason: 'invalid' };
  return db.tx(async (tx) => {
    await tx.query(`SELECT 1 FROM room_zero.accounts WHERE id = $1 FOR UPDATE`, [acc]);
    const recent = await tx.query<{ n: string }>(`SELECT count(*) AS n FROM room_zero.practice_runs WHERE account_id = $1 AND created_at > now() - interval '1 minute'`, [acc]);
    const before = await practiceRecords(tx, acc);
    const prev = before.heroes[run.hero] ?? emptyBest();
    if (Number(recent[0].n) >= PRACTICE_PER_MINUTE) return { ok: false, reason: 'rate' } as const;
    const ins = await tx.query(`INSERT INTO room_zero.practice_runs (account_id, run_id, hero, won, seconds, kills, bullets, hits, damage_dealt, damage_taken, pickups, abilities, hp_left)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT DO NOTHING RETURNING run_id`,
      [acc, run.runId, run.hero, run.won, run.seconds, run.kills, run.bullets, run.hits, run.damageDealt, run.damageTaken, run.pickups, run.abilities, run.hpLeft]);
    const records = await practiceRecords(tx, acc);
    const have = await medalsOf(tx, acc);
    const earned: string[] = [];
    if (ins.length) {
      for (const m of MEDALS) {
        if (have[m.id] || m.progress(records, run) < m.goal) continue;
        await tx.query(`INSERT INTO room_zero.medals (account_id, medal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [acc, m.id]);
        earned.push(m.id);
      }
    }
    const newBest = {
      time: !!ins.length && run.won && (prev.bestWinSeconds === null || run.seconds < prev.bestWinSeconds),
      kills: !!ins.length && run.kills > prev.mostKills,
    };
    return { ok: true, already: !ins.length, earned, newBest, records, medals: await medalsOf(tx, acc) } as const;
  });
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
    if (r.hero) out.heroes[r.hero] = { matches: n, wins: w, kills: k };
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
    ...p, callsign: a.callsign, favourite: a.favourite_hero, pins: a.pins ?? [],
    medals: await medalsOf(db, acc), practice: await practiceRecords(db, acc), online: await onlineCareer(db, acc),
    nft: tier ? { tier, tokenId: a.nft_token_id === null ? null : Number(a.nft_token_id) } : null,
  };
}

