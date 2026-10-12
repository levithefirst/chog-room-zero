// RC-1: a genuine victory is reachable by normal play for EACH hero. A scripted autopilot player
// (tests/helpers/autopilot.ts: shoots only what its own cone shows, human aim error, no ability tricks)
// plays full matches on Room Zero against the real bots. Evidence and the tuning history: docs/design/bots.md.
import { describe, expect, it } from 'vitest';
import { autopilot, type AutoResult } from './helpers/autopilot';
import { HEROES } from '../src/config/heroes';

const SEEDS = 40;
const results: Record<string, AutoResult[]> = {};

describe('RC-1 victory by play (autopilot vs the real bots, 40 seeds per hero)', () => {
  for (const h of HEROES) {
    it(`${h.name} wins at least 2 of ${SEEDS} full matches`, () => {
      const r = Array.from({ length: SEEDS }, (_, i) => autopilot(h.id, i + 1));
      results[h.id] = r;
      const wins = r.filter((x) => x.won);
      expect(wins.length).toBeGreaterThanOrEqual(2);
      // A win is a full clear: all 5 hostiles down.
      for (const w of wins) expect(w.kills).toBe(5);
    }, 120000);
  }
  it('writes the evidence table (VICTORY_OUT=<file>)', async () => {
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (!env.VICTORY_OUT) return;
    const rows = Object.entries(results).map(([hero, r]) => ({ hero, wins: r.filter((x) => x.won).length, of: r.length, avgKills: +(r.reduce((a, x) => a + x.kills, 0) / r.length).toFixed(2), winSeconds: r.filter((x) => x.won).map((x) => x.seconds) }));
    (await import('node:fs' as string)).writeFileSync(env.VICTORY_OUT, JSON.stringify(rows, null, 1));
  });
});
