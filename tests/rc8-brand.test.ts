// RC-8 PROVISIONAL CHOG palette: one set of values for CSS and PixiJS, exactly the brand guide's, and the component
// treatments chosen for readability (WCAG AA where text sits on a surface).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BRAND, CSS_VAR, contrast, px, type BrandToken } from '../src/config/brand';
import { TUNING } from '../src/config/tuning';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('RC-8 brand tokens', () => {
  it('are exactly the brand guide values (PROVISIONAL, not official)', () => {
    expect(BRAND).toEqual({
      purple: '#6B3FA0', purpleDeep: '#4A2C7A', purpleBright: '#8B5CF6', cream: '#FFF8E7', creamWarm: '#F5E6C8', pink: '#FF6B9D', pinkSoft: '#FFB6C1',
      bgDeep: '#0E091C', bgPanel: '#1A1228', bgElevated: '#2A1F3D',
      health: '#22C55E', armor: '#3B82F6', ammo: '#F59E0B', damage: '#EF4444', enemy: '#DC2626', ally: '#10B981', pickup: '#A78BFA', dangerZone: '#FF2D2D', dangerGlow: '#FF6B6B',
      border: '#C4BFD4', disabled: '#6B6580',
    });
    expect(readFileSync(new URL('../src/config/brand.ts', import.meta.url), 'utf8')).toMatch(/PROVISIONAL/);
    expect(readFileSync(new URL('../docs/BRAND.md', import.meta.url), 'utf8')).toMatch(/PROVISIONAL/);
  });
  it('index.html :root declares every token with the same value (CSS and Pixi share one palette)', () => {
    for (const t of Object.keys(BRAND) as BrandToken[]) {
      const m = html.match(new RegExp(`${CSS_VAR[t]}:\\s*(#[0-9A-Fa-f]{6})`));
      expect(m?.[1]?.toUpperCase(), t).toBe(BRAND[t]);
    }
  });
  it('the Pixi palette is read from the tokens', () => {
    const P = TUNING.palette;
    expect(P.teamRing).toBe(px('ally'));
    expect(P.hostile).toBe(px('enemy'));
    expect(P.heal).toBe(px('health'));
    expect(P.armor).toBe(px('armor'));
    expect(P.ammo).toBe(px('ammo'));
    expect(P.pickup).toBe(px('pickup'));
    expect(P.zone).toBe(px('dangerZone'));
    expect(P.zoneGlow).toBe(px('dangerGlow'));
  });
  it('text treatments meet WCAG AA (4.5:1 body text, 3:1 large button text)', () => {
    const B = BRAND;
    expect(contrast(B.cream, B.bgPanel)).toBeGreaterThanOrEqual(7); // --ink on panels
    expect(contrast(B.border, B.bgPanel)).toBeGreaterThanOrEqual(4.5); // --dim secondary text
    expect(contrast(B.pink, B.bgDeep)).toBeGreaterThanOrEqual(4.5); // --signal accent text
    expect(contrast(B.dangerGlow, B.bgPanel)).toBeGreaterThanOrEqual(4.5); // --hostile text (bad news, errors)
    expect(contrast(B.cream, B.purpleBright)).toBeGreaterThanOrEqual(3); // primary button label (17 px+ bold caps)
    expect(contrast(B.bgDeep, B.pink)).toBeGreaterThanOrEqual(4.5); // pressed button
    expect(contrast(B.bgDeep, B.disabled)).toBeGreaterThanOrEqual(3); // disabled button label
    // Why bright purple is a fill and not small text: it misses 4.5:1 on the panels the text would sit on.
    expect(contrast(B.purpleBright, B.bgPanel)).toBeLessThan(4.5);
  });
});
