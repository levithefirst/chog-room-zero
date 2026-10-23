// FS economy check (owner 2026-10-17: "rewards must feel worthwhile ... not trivially farmable ... no player
// permanently stuck"). The reward tables against the upgrade costs, match length and the daily limits, and what the
// results screen says the shards buy. Shard figures are per completed match; time is the measured match length.
import { describe, expect, it } from 'vitest';
import { PRACTICE_REWARDS, REWARDS, rewardBreakdown, type RewardTable } from '../src/config/progression';
import { NO_UPGRADES, UPGRADES, UPGRADE_IDS } from '../src/config/power';
import { PRACTICE_SHARDS_PER_DAY } from '../api/_lib/career';
import { affordable, rewardHtml } from '../src/ui/rewards';

const pay = (t: RewardTable, won: boolean, kills: number, damage: number) => rewardBreakdown({ won, kills, damage, seconds: 90, leftEarly: false, capped: false, demo: false }, t).shards;
const totalCost = UPGRADE_IDS.reduce((s, id) => s + UPGRADES[id].costs.reduce((a, b) => a + b, 0), 0);

describe('every legitimate completed match pays, in the order the owner asked for', () => {
  for (const [name, t] of [['online', REWARDS], ['practice', PRACTICE_REWARDS]] as const) {
    it(`${name}: a loss pays; kills pay more; damage more; a win more than the same loss`, () => {
      expect(pay(t, false, 0, 0)).toBeGreaterThan(0);
      expect(pay(t, false, 1, 0)).toBeGreaterThan(pay(t, false, 0, 0));
      expect(pay(t, false, 1, 300)).toBeGreaterThan(pay(t, false, 1, 0));
      // Owner 2026-10-21: shards 10 / 10 / 30 online and (t30u) in practice; the old "worst win beats the best loss" rule
      // is superseded for both: a win pays more than the same match lost.
      for (let k = 0; k <= 8; k++) for (const d of [0, 100, 300, 1000, 5000]) expect(pay(t, true, k, d)).toBeGreaterThan(pay(t, false, k, d));
      expect(pay(t, true, 0, 0)).toBeGreaterThanOrEqual(2 * pay(t, false, 0, 0));
    });
  }
});

describe('against the upgrade costs and the daily limits', () => {
  it('the first rank comes in the first session: one online win, a loss with a kill, or two matches; the same in practice', () => {
    // Owner 2026-10-23 prices: the cheapest rank is 15 (was 10). Owner 2026-10-21 (t30u) shards: 10 a match, 10 a kill,
    // 30 a win, online and in practice, so one bare loss (10) no longer buys it.
    const cheapest = Math.min(...UPGRADE_IDS.map((id) => UPGRADES[id].costs[0]));
    expect(cheapest).toBe(15);
    for (const t of [REWARDS, PRACTICE_REWARDS]) {
      expect(pay(t, false, 0, 0)).toBeLessThan(cheapest);
      expect(pay(t, false, 1, 0)).toBeGreaterThanOrEqual(cheapest);
      expect(2 * pay(t, false, 0, 0)).toBeGreaterThanOrEqual(cheapest);
      expect(pay(t, true, 0, 0)).toBeGreaterThanOrEqual(cheapest);
    }
  });
  it('not trivially farmable: even playing to every daily cap with perfect results takes more than a day to max out', () => {
    // Owner 2026-10-21: the old 2-day bound is retired with the new online shards (10 played, 10 a kill, 30 a win);
    // the daily match cap stays at 20, so a perfect day still cannot buy everything.
    expect(REWARDS.dailyCap).toBe(20);
    const maxOnline = REWARDS.dailyCap * pay(REWARDS, true, 99, 99999);
    expect(maxOnline).toBe(20 * 95);
    const maxPractice = Math.min(PRACTICE_SHARDS_PER_DAY, PRACTICE_REWARDS.dailyCap * pay(PRACTICE_REWARDS, true, 99, 99999));
    expect(maxPractice).toBe(1000);
    // 16,390 shards of upgrades (owner 2026-10-23) / (1,900 online + 1,000 practice) = 5.7 days.
    expect(totalCost / (maxOnline + maxPractice)).toBeGreaterThan(1);
  });
  it('practice shard limit 1,000 a day (owner 2026-10-21 t31u, was 300): how many runs are fully paid before it', () => {
    expect(PRACTICE_SHARDS_PER_DAY).toBe(1000);
    // Runs in a row, each paid only while the day stays within the limit (api/_lib/career.ts; the crossing run pays nothing).
    const fully = (v: number) => { let s = 0, n = 0; while (n < PRACTICE_REWARDS.dailyCap && s + v <= PRACTICE_SHARDS_PER_DAY) { s += v; n++; } return n; };
    expect(pay(PRACTICE_REWARDS, true, 5, 1e6)).toBe(93);
    expect(fully(93)).toBe(10); // max runs: the 11th is cut off (was 3 at 300)
    expect(fully(pay(PRACTICE_REWARDS, true, 5, 0))).toBe(11); // 5-kill clears, 90 each (was 3)
    expect(fully(pay(PRACTICE_REWARDS, true, 3, 0))).toBe(14); // 3-kill clears, 70 each (was 4)
    expect(fully(pay(PRACTICE_REWARDS, false, 1, 100))).toBe(PRACTICE_REWARDS.dailyCap); // 1-kill losses, 21 each: all 25 (was 14)
    expect(PRACTICE_REWARDS.dailyCap * pay(PRACTICE_REWARDS, true, 5, 1e6)).toBe(2325); // so the limit can still bite
  });
  it('nobody is stuck: a player who only loses in practice (one kill a run) still maxes everything out (about 31 days at the daily cap)', () => {
    // Owner 2026-10-23: 41 ranks and higher prices (16,390 shards in all, was 3,250) make maxing out a long goal; the
    // first ranks still come in a session (above). Each rank stays reachable at any pace.
    expect(totalCost).toBe(16390);
    const perDay = Math.min(PRACTICE_SHARDS_PER_DAY, PRACTICE_REWARDS.dailyCap * pay(PRACTICE_REWARDS, false, 1, 100));
    expect(perDay).toBe(525); // 25 runs x 21, under the 1,000 limit: 16,390 / 525 = 31.2 days
    expect(totalCost / perDay).toBeLessThanOrEqual(35);
    expect(Math.max(...UPGRADE_IDS.flatMap((id) => UPGRADES[id].costs))).toBeLessThanOrEqual(perDay * 10);
  });
});

describe('the results say what the shards buy', () => {
  const view = (shards: number, up = NO_UPGRADES) => rewardHtml({ lines: [{ id: 'played', label: 'Match played', xp: 20, shards: 4 }], xp: 20, shards: 4, none: null, kept: true, before: { xp: 0, shards: shards - 4 }, upgrades: up });
  it('every rank ready now, by name and cost', () => {
    expect(affordable(40, NO_UPGRADES).map((r) => `${r.name} ${r.rank}`)).toEqual(['Vitality 1', 'Plating 1', 'Focus 1']);
    const h = view(40).replace(/<[^>]+>/g, '');
    expect(h).toMatch(/40 shards · 3 upgrades ready: Vitality 1 \(15\) · Plating 1 \(15\) · Focus 1 \(40\)/);
  });
  it('one ready, or the cheapest and how far off it is', () => {
    expect(view(15).replace(/<[^>]+>/g, '')).toMatch(/15 shards · 2 upgrades ready: Vitality 1 \(15\) · Plating 1 \(15\)/);
    expect(view(6).replace(/<[^>]+>/g, '')).toMatch(/6 shards · Vitality 1 costs 15, 9 to go/);
  });
});
