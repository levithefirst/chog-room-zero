// Account progression (master build, stage C): XP, levels, shards and rating. Online matches are validated by the game
// server; solo practice pays a smaller, capped amount (owner 2026-10-17). Shared by the Vercel settlement
// (api/_lib/game.ts, api/_lib/career.ts) and the client UI, so the numbers players see are the ones applied.
// Rating is separate from character power: it is adjusted for the power gap, so beating a weaker profile earns less.
import type { Tier } from './power';

export const REWARDS = {
  // XP: showing up, winning, and up to 5 eliminations.
  xpPlay: 40,
  xpWin: 60,
  xpPerKill: 10,
  maxKills: 5,
  // Shards buy upgrades (src/config/power.ts UPGRADES). A first saved match always pays enough for a first rank (10).
  shardsPlay: 10,
  /** Owner 2026-10-17: kills and damage pay too, so a loss where you fought still moves you forward. */
  shardsWin: 25,
  shardsPerKill: 3,
  /** One shard per this much damage dealt to opponents, up to damageShardsMax. */
  damagePerShard: 50,
  damageShardsMax: 5,
  // A match shorter than this pays nothing (stops queue-and-quit farming between two accounts).
  minSeconds: 20,
  // Rewarded matches per account per rolling 24 h. Matches beyond it still count for rating and history.
  dailyCap: 20,
} as const;

/**
 * Solo practice vs bots (owner 2026-10-17: "players need to earn progression even when they lose"). The run is simulated
 * in the browser, so it pays less than a validated online match and a day's practice is capped: a forged run can never
 * be worth more than an honest one. Same shape as online, so the rule "a win beats any loss" holds for both.
 */
export const PRACTICE_REWARDS = {
  xpPlay: 20,
  xpWin: 30,
  xpPerKill: 5,
  maxKills: 5,
  shardsPlay: 4,
  shardsWin: 12,
  shardsPerKill: 1,
  damagePerShard: 100,
  damageShardsMax: 3,
  minSeconds: 20,
  /** Rewarded practice runs per account per rolling 24 h; runs beyond it still count for career and medals. */
  dailyCap: 25,
} as const;

export type RewardTable = { [K in keyof typeof PRACTICE_REWARDS]: number };

export type RewardLineId = 'played' | 'win' | 'kills' | 'damage';
export interface RewardLine { id: RewardLineId; label: string; xp: number; shards: number }
/** Why a match paid nothing (null: it paid). */
export type NoReward = 'short' | 'left' | 'cap' | 'private' | 'demo' | 'lab' | 'unverified' | null;
export interface RewardBreakdown { lines: RewardLine[]; xp: number; shards: number; none: NoReward }

export interface RewardFacts {
  won: boolean;
  kills: number;
  /** Damage dealt to opponents. */
  damage: number;
  seconds: number;
  /** Left while still standing (a quit), as opposed to leaving after being knocked out. */
  leftEarly: boolean;
  capped: boolean;
  /** Private room code, demo token or lab room: never progression. */
  private?: boolean;
  demo?: boolean;
  lab?: boolean;
  /** Practice only: no valid start ticket, or the run claims more time than passed since it. */
  unverified?: boolean;
}

/**
 * What one match pays, line by line: the server applies exactly these numbers and the results screen prints them.
 * Kills and damage are capped per match, and the win bonus is larger than everything a loss can pay on top of
 * participation, so farming kills never beats winning.
 */
export function rewardBreakdown(f: RewardFacts, t: RewardTable = REWARDS): RewardBreakdown {
  const none: NoReward = f.demo ? 'demo' : f.lab ? 'lab' : f.private ? 'private' : f.unverified ? 'unverified' : f.leftEarly ? 'left' : f.seconds < t.minSeconds ? 'short' : f.capped ? 'cap' : null;
  if (none) return { lines: [], xp: 0, shards: 0, none };
  const kills = Math.min(t.maxKills, Math.max(0, Math.floor(f.kills)));
  const dmg = Math.min(t.damageShardsMax, Math.max(0, Math.floor(f.damage / t.damagePerShard)));
  const lines: RewardLine[] = [{ id: 'played', label: 'Match played', xp: t.xpPlay, shards: t.shardsPlay }];
  if (f.won) lines.push({ id: 'win', label: 'Victory', xp: t.xpWin, shards: t.shardsWin });
  if (kills) lines.push({ id: 'kills', label: `${kills} kill${kills > 1 ? 's' : ''}`, xp: kills * t.xpPerKill, shards: kills * t.shardsPerKill });
  if (dmg) lines.push({ id: 'damage', label: `${Math.round(f.damage)} damage`, xp: 0, shards: dmg });
  return { lines, xp: lines.reduce((a, l) => a + l.xp, 0), shards: lines.reduce((a, l) => a + l.shards, 0), none: null };
}

/** The most a loss can pay, and the least a win pays (tests hold the second above the first for both tables). */
export const lossCeiling = (t: RewardTable) => ({ xp: t.xpPlay + t.maxKills * t.xpPerKill, shards: t.shardsPlay + t.maxKills * t.shardsPerKill + t.damageShardsMax });
export const winFloor = (t: RewardTable) => ({ xp: t.xpPlay + t.xpWin, shards: t.shardsPlay + t.shardsWin });

/** XP needed to go from level n to n + 1: 100, 150, 200, ... */
export const xpForNext = (level: number) => 50 + 50 * level;

export function levelOf(xp: number): { level: number; into: number; next: number } {
  let level = 1, rest = Math.max(0, Math.floor(xp));
  while (rest >= xpForNext(level) && level < 99) { rest -= xpForNext(level); level++; }
  return { level, into: rest, next: xpForNext(level) };
}

export const RATING = {
  start: 1000,
  k: 24,
  // Power offset added to a side's rating when computing the expected score: a 1:1 is treated as 120 points
  // stronger than a free profile of the same rating, so its wins over free players earn less.
  tierOffset: { free: 0, common: 30, uncommon: 50, rare: 75, epic: 95, legendary: 120 } as Record<Tier, number>,
} as const;

/** Elo change for one player: own side average (with power offsets) against the other side's. score 1 win, 0.5 draw, 0 loss. */
export function ratingDelta(mine: number, theirs: number, score: number): number {
  const expected = 1 / (1 + 10 ** ((theirs - mine) / 400));
  return Math.round(RATING.k * (score - expected));
}

/** Totals only (older callers). */
export function matchRewards(o: { won: boolean; kills: number; leftEarly: boolean; seconds: number; capped: boolean; damage?: number }): { xp: number; shards: number } {
  const b = rewardBreakdown({ ...o, damage: o.damage ?? 0 });
  return { xp: b.xp, shards: b.shards };
}
