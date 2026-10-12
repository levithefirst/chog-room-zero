// CHOG-UI-001: hero select number keys 1-4 select the matching card (the cards print "1 · Rifle" etc.).
import { describe, expect, it } from 'vitest';
import { HEROES } from '../src/config/heroes';
import { heroForKey } from '../src/ui/heroKeys';

describe('UI-001 hero select number keys', () => {
  it('key 3 selects Brick (ADE repro)', () => {
    expect(heroForKey({ key: '3', code: 'Digit3' }, HEROES)).toBe('brick');
  });
  it('keys 1-4 map to the card order, top row and numpad', () => {
    HEROES.forEach((h, i) => {
      expect(heroForKey({ key: String(i + 1), code: `Digit${i + 1}` }, HEROES)).toBe(h.id);
      expect(heroForKey({ key: String(i + 1), code: `Numpad${i + 1}` }, HEROES)).toBe(h.id);
    });
  });
  it('AZERTY top row (key "(" on Digit5 etc.) uses the physical code', () => {
    expect(heroForKey({ key: '"', code: 'Digit3' }, HEROES)).toBe('brick');
  });
  it('other keys and out-of-range numbers select nothing', () => {
    expect(heroForKey({ key: '5', code: 'Digit5' }, HEROES)).toBeNull();
    expect(heroForKey({ key: '0', code: 'Digit0' }, HEROES)).toBeNull();
    expect(heroForKey({ key: 'a', code: 'KeyA' }, HEROES)).toBeNull();
  });
});
