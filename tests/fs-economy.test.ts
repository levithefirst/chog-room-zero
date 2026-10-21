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
      if (name === 'practice') {
        // Practice (Claude, owner 2026-10-21 table 3 / 3 / 18): the worst clear beats the best loss. A solo practice
        // loss has at most 4 kills (all five hostiles down is a clear).
        let bestLoss = 0;
        for (let k = 0; k <= 4; k++) for (const d of [0, 100, 300, 1000, 5000]) bestLoss = Math.max(bestLoss, pay(t, false, k, d));
        expect(pay(t, true, 0, 0)).toBeGreaterThan(bestLoss);
      } else {
        // Online (owner 2026-10-21: shards 10 / 10 / 30; the old "worst win beats the best loss" rule is superseded):
        // a win pays more than the same match lost.
        for (let k = 0; k <= 8; k++) for (const d of [0, 100, 300, 1000, 5000]) expect(pay(t, true, k, d)).toBeGreaterThan(pay(t, false, k, d));
      }
      expect(pay(t, true, 0, 0)).toBeGreaterThanOrEqual(2 * pay(t, false, 0, 0));
    });
  }
});

describe('against the upgrade costs and the daily limits', () => {
  it('the first rank comes in the first session: one online match, or four practice losses (two with a kill each)', () => {
    const cheapest = Math.min(...UPGRADE_IDS.map((id) => UPGRADES[id].costs[0]));
    expect(pay(REWARDS, false, 0, 0)).toBeGreaterThanOrEqual(cheapest);
    // Owner 2026-10-21 practice table (3 a run): three bare losses pay 9, so four; a kill each makes it two.
    expect(4 * pay(PRACTICE_REWARDS, false, 0, 0)).toBeGreaterThanOrEqual(cheapest);
    expect(2 * pay(PRACTICE_REWARDS, false, 1, 0)).toBeGreaterThanOrEqual(cheapest);
    expect(pay(PRACTICE_REWARDS, true, 0, 0)).toBeGreaterThanOrEqual(cheapest);
  });
  it('not trivially farmable: even playing to every daily cap with perfect results takes days to max out', () => {
    const maxOnline = REWARDS.dailyCap * pay(REWARDS, true, 99, 99999);
    const maxPractice = Math.min(PRACTICE_SHARDS_PER_DAY, PRACTICE_REWARDS.dailyCap * pay(PRACTICE_REWARDS, true, 99, 99999));
    expect(totalCost / (maxOnline + maxPractice)).toBeGreaterThanOrEqual(2);
  });
  it('nobody is stuck: a player who only loses in practice (one kill a run) still maxes out in about three weeks', () => {
    const perDay = Math.min(PRACTICE_SHARDS_PER_DAY, PRACTICE_REWARDS.dailyCap * pay(PRACTICE_REWARDS, false, 1, 100));
    expect(totalCost / perDay).toBeLessThanOrEqual(25);
  });
});

describe('the results say what the shards buy', () => {
  const view = (shards: number, up = NO_UPGRADES) => rewardHtml({ lines: [{ id: 'played', label: 'Match played', xp: 20, shards: 4 }], xp: 20, shards: 4, none: null, kept: true, before: { xp: 0, shards: shards - 4 }, upgrades: up });
  it('every rank ready now, by name and cost', () => {
    expect(affordable(40, NO_UPGRADES).map((r) => `${r.name} ${r.rank}`)).toEqual(['Vitality 1', 'Plating 1', 'Focus 1']);
    const h = view(40).replace(/<[^>]+>/g, '');
    expect(h).toMatch(/40 shards · 3 upgrades ready: Vitality 1 \(10\) · Plating 1 \(10\) · Focus 1 \(30\)/);
  });
  it('one ready, or the cheapest and how far off it is', () => {
    expect(view(10).replace(/<[^>]+>/g, '')).toMatch(/10 shards · Vitality 1 \(10\) · Plating 1 \(10\) ready|10 shards · 2 upgrades ready/);
    expect(view(6).replace(/<[^>]+>/g, '')).toMatch(/6 shards · Vitality 1 costs 10, 4 to go/);
  });
});
