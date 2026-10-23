// SB lab: the information model measured in the default game (autopilot, NOT people; tests/helpers/sblab.ts).
// SB_OUT=<file> writes the numbers for the report. Before SB the CF lab reconstructed the same ladder from fixed
// timers (tests/cf-lab.test.ts infoShares: middle 0.151, warned 0.671); these come from the model the game draws.
import { describe, expect, it } from 'vitest';
import { measureInfo, type InfoResult } from './helpers/sblab';

const out: Record<string, unknown> = {};
let info: InfoResult;

describe('SB information model in the default game', () => {
  it('measures 16 seeded matches', () => {
    info = measureInfo(16);
    out.info = info;
    expect(info.seeds).toBe(16);
  }, 300000);
  it('information has a gradient: believed-but-not-seen time is a large share, live bodies a small one', () => {
    expect(info.middle).toBeGreaterThan(0.15);
    expect(info.shares.visible).toBeLessThan(0.15);
    expect(info.shares.directional).toBeGreaterThan(0);
    expect(info.shares.last_known).toBeGreaterThan(0);
  });
  it('most contacts are announced (heard, spotted or remembered) before they are seen', () => {
    expect(info.warned).toBeGreaterThan(0.6);
  });
  it('the drawn uncertainty is honest: the hostile is inside the circle most of the time, never always (it is a guess)', () => {
    for (const k of ['last_known', 'heard']) {
      expect(info.honest[k], k).toBeGreaterThan(0.6);
    }
    // A direction through a wall is the vaguest reading: when it is made, its estimate is the furthest off a heard
    // spot's. (Measured when the reading is made: over a belief's whole life the error also grows with how far the
    // hostile walks on, which says how much it moves, not how precise the rung is. Lifetime errors on the 15-pickup
    // map, 48 seeds: heard 1.7, direction 1.3; fresh: heard 0.54, direction 1.10. Before: 1.1 / 1.3 and 0.44 / 1.06.)
    expect(info.fresh.directional).toBeGreaterThan(info.fresh.heard * 1.5);
  });
  it('writes the numbers (SB_OUT)', async () => {
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (env.SB_OUT) (await import('node:fs' as string)).writeFileSync(env.SB_OUT, JSON.stringify(out, null, 1));
  });
});
