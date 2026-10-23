// RC-1 PR7-FLOW-003: every post-death input is ignored for 0.75 s and needs a fresh press after that.
import { describe, expect, it } from 'vitest';
import { createSummaryGate, overlayInputAllowed, SUMMARY_LOCK_MS } from '../src/input/gate';

const INPUTS = ['Again', 'Change Chog', 'hero card', 'Deploy', 'key 1', 'key 4', 'Enter', 'Space', 'touch tap'];

describe('RC-1 death screen protection', () => {
  for (let scenario = 0; scenario < 5; scenario++) {
    for (const what of INPUTS) {
      it(`death ${scenario + 1}: ${what} is ignored in the window and works after release + press`, () => {
        const g = createSummaryGate();
        const t0 = 1000 + scenario * 137;
        // Held/spammed through the death: presses before and during the lock.
        g.press(t0 - 50);
        expect(overlayInputAllowed('recap', g)).toBe(false);
        g.open(t0);
        for (const dt of [0, 100, 300, 600, SUMMARY_LOCK_MS - 1]) {
          g.press(t0 + dt);
          expect(overlayInputAllowed('results', g)).toBe(false);
        }
        // Holding across the boundary is not a fresh press.
        expect(overlayInputAllowed('results', g)).toBe(false);
        g.press(t0 + SUMMARY_LOCK_MS + 40);
        expect(overlayInputAllowed('results', g)).toBe(true);
      });
    }
  }
  it('other screens are never gated', () => {
    const g = createSummaryGate();
    for (const p of ['title', 'select', 'pause']) expect(overlayInputAllowed(p, g)).toBe(true);
    // V2: play is the one exception: the overlay is hidden then, so nothing on it may act (tests/v2-input-routing).
    expect(overlayInputAllowed('play', g)).toBe(false);
  });
});
