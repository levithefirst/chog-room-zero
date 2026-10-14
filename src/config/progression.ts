// Account progression (master build, stage C): XP, levels, shards and rating from validated online matches only.
// Shared by the Vercel settlement (api/_lib/game.ts) and the client UI, so the numbers players see are the ones applied.
// Rating is separate from character power: it is adjusted for the power gap, so beating a weaker profile earns less.
import type { Tier } from './power';

export const REWARDS = {
  // XP: showing up, winning, and up to 5 eliminations.
  xpPlay: 40,
  xpWin: 60,
  xpPerKill: 10,
  maxKills: 5,
  // Shards buy upgrades (src/config/power.ts UPGRADES): 3,250 shards for every rank, about 160 wins or 325 losses.
  // A first saved match always pays enough for a first rank (10).
  shardsPlay: 10,
  shardsWin: 10,
  // A match shorter than this pays nothing (stops queue-and-quit farming between two accounts).
  minSeconds: 20,
  // Rewarded matches per account per rolling 24 h. Matches beyond it still count for rating and history.
  dailyCap: 20,
} as const;

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

export function matchRewards(o: { won: boolean; kills: number; leftEarly: boolean; seconds: number; capped: boolean }): { xp: number; shards: number } {
  if (o.leftEarly || o.capped || o.seconds < REWARDS.minSeconds) return { xp: 0, shards: 0 };
  return {
    xp: REWARDS.xpPlay + (o.won ? REWARDS.xpWin : 0) + Math.min(REWARDS.maxKills, Math.max(0, o.kills)) * REWARDS.xpPerKill,
    shards: REWARDS.shardsPlay + (o.won ? REWARDS.shardsWin : 0),
  };
}
