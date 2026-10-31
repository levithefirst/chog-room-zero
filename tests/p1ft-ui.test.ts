// CHOG-UI-001: hero select number keys 1-7 select the matching roster card.
import { describe, expect, it } from 'vitest';
import { HEROES } from '../src/config/heroes';
import { heroForKey } from '../src/ui/heroKeys';

describe('UI-001 hero select number keys', () => {
  it('key 3 selects the third roster card, Ray (ADE repro)', () => {
    expect(heroForKey({ key: '3', code: 'Digit3' }, HEROES)).toBe('ray');
  });
  it('keys 1-7 map to the card order, top row and numpad', () => {
    HEROES.forEach((h, i) => {
      expect(heroForKey({ key: String(i + 1), code: `Digit${i + 1}` }, HEROES)).toBe(h.id);
      expect(heroForKey({ key: String(i + 1), code: `Numpad${i + 1}` }, HEROES)).toBe(h.id);
    });
  });
  it('AZERTY top row (key "(" on Digit5 etc.) uses the physical code', () => {
    expect(heroForKey({ key: '"', code: 'Digit3' }, HEROES)).toBe('ray');
  });
  it('other keys and out-of-range numbers select nothing', () => {
    expect(heroForKey({ key: '8', code: 'Digit8' }, HEROES)).toBeNull();
    expect(heroForKey({ key: '0', code: 'Digit0' }, HEROES)).toBeNull();
    expect(heroForKey({ key: 'a', code: 'KeyA' }, HEROES)).toBeNull();
  });
});

import { orientationOf } from '../src/ui/orientation';
describe('rotation (RC-5: portrait-first mobile, no turn-sideways prompt; a flip pauses the run in main.ts)', () => {
  it('classifies orientation for flip detection', () => {
    expect(orientationOf(390, 844)).toBe('portrait');
    expect(orientationOf(844, 390)).toBe('landscape');
    expect(orientationOf(820, 1180)).toBe('portrait');
    expect(orientationOf(500, 500)).toBe('landscape');
  });
});
