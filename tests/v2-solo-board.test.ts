// V2 (forensic report weakness 10: "the Solo leaderboard can be inflated ... it has no daily cap"): only an account's
// first SOLO_BOARD_RUNS_PER_DAY verified runs of each UTC day count on the Solo board. Later runs stay on the career.
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate, type Db } from '../api/_lib/db';
import { leaderboard, SOLO_BOARD_RUNS_PER_DAY } from '../api/_lib/game';
import { memoryDb } from './helpers/pglite';

let db: Db;
beforeEach(async () => { db = await memoryDb(); await migrate(db); });

async function runs(acc: string, day: string, n: number, kills: number) {
  await db.query(`INSERT INTO room_zero.accounts (id, callsign, display_name) VALUES ($1, $1, $1) ON CONFLICT DO NOTHING`, [acc]);
  for (let i = 0; i < n; i++) {
    await db.query(`INSERT INTO room_zero.practice_runs (account_id, run_id, hero, won, seconds, kills, bullets, hits, damage_dealt, damage_taken, pickups, abilities, hp_left, xp, shards, created_at)
      VALUES ($1, $2, 'benja', true, 60, $3, 50, 20, 200, 40, 1, 1, 50, 10, 1, $4::timestamptz + ($5 || ' minutes')::interval)`, [acc, `${day}-${i}`, kills, `${day}T08:00:00Z`, i]);
  }
}

describe('the Solo board counts a bounded number of runs a day', () => {
  it('a farmer posting 60 runs in a day is credited for the first 25 only; an honest player is unaffected', async () => {
    expect(SOLO_BOARD_RUNS_PER_DAY).toBe(25);
    await runs('FARMER', '2026-10-18', 60, 5);
    await runs('HONEST', '2026-10-18', 10, 3);
    const b = await leaderboard(db, 20, null, { board: 'solo' });
    const farmer = b.rows.find((r) => r.name === 'FARMER')!, honest = b.rows.find((r) => r.name === 'HONEST')!;
    expect(farmer.kills).toBe(25 * 5);
    expect(farmer.matches).toBe(25);
    expect(honest.kills).toBe(30);
  });
  it('a new UTC day counts again (the cap is per day, not for ever)', async () => {
    await runs('DAILY', '2026-10-17', 30, 2);
    await runs('DAILY', '2026-10-18', 30, 2);
    const b = await leaderboard(db, 20, null, { board: 'solo' });
    expect(b.rows.find((r) => r.name === 'DAILY')!.kills).toBe(2 * 25 * 2);
  });
});
