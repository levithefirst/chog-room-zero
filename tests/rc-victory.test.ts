// RC-1: a genuine victory is reachable by normal play for EACH hero. A scripted autopilot player
// (tests/helpers/autopilot.ts: shoots only what its own cone shows, human aim error, no ability tricks)
// plays full matches on Room Zero against the real bots. Evidence and the tuning history: docs/design/bots.md.
//
// FS (2026-10-17, docs/ROOM_ZERO_FINAL_SUPERIORITY.md section 8): RC-1 was written when solo was you alone against
// five. The game the owner ships is you + 2 AI teammates against five (LOCKED 17, 2026-10-14), so the per-hero bar
// now runs in that game and is far higher than before (12 of 40 for every hero; measured 18 to 34). Solo against
// five with no teammates stays as a whole-roster bar: measured 39 of 280 against the active hostile squad
// (61 of 280 against the old patrol-only bots), bar 21 (7.5%), and every hero must win it at least once in 80.
// The flankers (Tabsu, Bill) win 1 to 2 of 40 alone, as they did against the old bots (5 and 2): the autopilot stands
// still to shoot, which wastes their speed. The owner's playtest decides whether they need a roster change.
import { describe, expect, it } from 'vitest';
import { autopilot, type AutoResult } from './helpers/autopilot';
import { HEROES, squadFor } from '../src/config/heroes';

const SEEDS = 40;
const results: Record<string, { team: AutoResult[]; alone: AutoResult[] }> = {};

describe('RC-1 victory by play (autopilot vs the real bots)', () => {
  for (const h of HEROES) {
    it(`${h.name} wins at least 12 of ${SEEDS} full matches in the shipping game (you + 2 AI vs 5)`, () => {
      const team = Array.from({ length: SEEDS }, (_, i) => autopilot(h.id, i + 1, { allies: squadFor(h.id, i + 1) }));
      const wins = team.filter((x) => x.won);
      results[h.id] = { team, alone: [] };
      expect(wins.length).toBeGreaterThanOrEqual(12);
      // A win is a full clear: all 5 hostiles down (by the player and the AI teammates).
      for (const w of wins) expect(w.hostilesLeft).toBe(0);
    }, 180000);
  }
  it('alone against five: the roster wins at least 21 of 280, every hero at least once in 80, every win a full clear', () => {
    let total = 0;
    for (const h of HEROES) {
      const alone = Array.from({ length: 2 * SEEDS }, (_, i) => autopilot(h.id, i + 1));
      results[h.id] = { ...(results[h.id] ?? { team: [] }), alone };
      const wins = alone.filter((x) => x.won);
      expect(wins.length, h.name).toBeGreaterThanOrEqual(1);
      // A full clear: no hostile left (the player's own kills, or one the danger zone took).
      for (const w of wins) expect(w.hostilesLeft).toBe(0);
      total += alone.slice(0, SEEDS).filter((x) => x.won).length;
    }
    expect(total).toBeGreaterThanOrEqual(21);
  }, 600000);
  it('writes the evidence table (VICTORY_OUT=<file>)', async () => {
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (!env.VICTORY_OUT) return;
    const rows = Object.entries(results).map(([hero, r]) => ({ hero, teamWins: r.team.filter((x) => x.won).length, aloneWins40: r.alone.slice(0, SEEDS).filter((x) => x.won).length, aloneWins80: r.alone.filter((x) => x.won).length }));
    (await import('node:fs' as string)).writeFileSync(env.VICTORY_OUT, JSON.stringify(rows, null, 1));
  });
});
