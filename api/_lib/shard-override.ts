// Owner 2026-10-25 (t38u): a developer/admin shard override for the owner's own account. Server-only: the account id is
// the one the server resolved from the signed session (practice) or the signed game ticket (online settle), never a
// field the client sends. There is no client toggle or UI. Only shards change: 2x every normal gameplay shard award
// (played, win, kills, damage; online and practice), then clamped to what is left of a 10,000 rolling-24 h allowance
// read from the ledger, so it is deterministic and survives a restart. XP, rating, medals and costs are untouched.
// Every other account keeps the normal rules (PRACTICE_SHARDS_PER_DAY, REWARDS.dailyCap, ...).
import type { RewardBreakdown, RewardLine } from '../../src/config/progression.js';
import type { Tx } from './db.js';

/**
 * Server account ids (room_zero.accounts.id) with the override. Single place to change it.
 * NOTE: '7J2D9V17PM' is the id as the owner typed it. Server account ids are 16-character base64url
 * (api/_lib/game.ts newId); the 8-character "Account ID" in Settings is the browser-local profile id
 * (src/ui/profile.ts) and is never sent to the server, so this value matches no account until it is
 * replaced with the owner's real room_zero.accounts.id.
 */
export const SHARD_OVERRIDE_ACCOUNTS: readonly string[] = ['7J2D9V17PM'];
export const OVERRIDE_SHARD_MULTIPLIER = 2;
export const OVERRIDE_SHARDS_PER_DAY = 10_000;

export const hasShardOverride = (acc: string | null | undefined): boolean => typeof acc === 'string' && SHARD_OVERRIDE_ACCOUNTS.includes(acc);

/** Gameplay shards (online matches and practice runs) credited to the account in the rolling 24 h, from the ledger. */
export async function gameplayShardsToday(q: Tx, acc: string): Promise<number> {
  const r = await q.query<{ s: string }>(`SELECT coalesce(sum(delta), 0) AS s FROM room_zero.ledger
    WHERE account_id = $1 AND kind = 'shards' AND reason IN ('match', 'practice') AND delta > 0 AND created_at > now() - interval '24 hours'`, [acc]);
  return Number(r[0]?.s ?? 0);
}

/**
 * The override applied to what an ordinary player would have been paid: shards x2, then clamped to the allowance left
 * today. XP and the reason a match paid nothing are kept as they are. Shard lines are doubled for the results screen
 * and, when clamped, trimmed from the last line back so they still add up to the paid total.
 */
export function overrideShards(r: RewardBreakdown, earnedToday: number): RewardBreakdown {
  if (!r.shards) return r;
  const left = Math.max(0, OVERRIDE_SHARDS_PER_DAY - Math.max(0, earnedToday));
  const shards = Math.min(r.shards * OVERRIDE_SHARD_MULTIPLIER, left);
  let cut = r.shards * OVERRIDE_SHARD_MULTIPLIER - shards;
  const lines: RewardLine[] = r.lines.map((l) => ({ ...l, shards: l.shards * OVERRIDE_SHARD_MULTIPLIER }));
  for (let i = lines.length - 1; i >= 0 && cut > 0; i--) { const d = Math.min(cut, lines[i].shards); lines[i] = { ...lines[i], shards: lines[i].shards - d }; cut -= d; }
  return { ...r, lines, shards };
}
