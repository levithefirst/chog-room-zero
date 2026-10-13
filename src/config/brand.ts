// CHOG Room Zero colour tokens (RC-8), copied exactly from CHOG_Room_Zero_Brand_Guide.pdf.
// PROVISIONAL: the guide states that no official CHOG brand colour system exists. These are proposed values, not
// approved CHOG colours; do not describe them as official. One source for both sides of the game:
//  - CSS: index.html `:root` declares the same values as custom properties (tests/rc8-brand.test.ts checks every one).
//  - PixiJS: TUNING.palette and the operator art read the numbers below through `px()`.
// Readability rule (owner, RC-8): if a combination fails, keep the token and change the treatment (outline, icon,
// opacity, size), never the value. Semantic colours always come with a shape or an icon (docs/BRAND.md).
export const BRAND = {
  // Character
  purple: '#6B3FA0',
  purpleDeep: '#4A2C7A',
  purpleBright: '#8B5CF6',
  cream: '#FFF8E7',
  creamWarm: '#F5E6C8',
  pink: '#FF6B9D',
  pinkSoft: '#FFB6C1',
  // Surfaces
  bgDeep: '#0E091C',
  bgPanel: '#1A1228',
  bgElevated: '#2A1F3D',
  // Combat semantics
  health: '#22C55E',
  armor: '#3B82F6',
  ammo: '#F59E0B',
  damage: '#EF4444',
  enemy: '#DC2626',
  ally: '#10B981',
  pickup: '#A78BFA',
  dangerZone: '#FF2D2D',
  dangerGlow: '#FF6B6B',
  // Controls
  border: '#C4BFD4',
  disabled: '#6B6580',
} as const;

export type BrandToken = keyof typeof BRAND;

/** CSS custom property name for a token, as declared in index.html (`--chog-purple`, `--bg-deep`, `--danger-zone`...). */
export const CSS_VAR: Record<BrandToken, string> = {
  purple: '--chog-purple', purpleDeep: '--chog-purple-deep', purpleBright: '--chog-purple-bright', cream: '--chog-cream',
  creamWarm: '--chog-cream-warm', pink: '--chog-pink', pinkSoft: '--chog-pink-soft',
  bgDeep: '--bg-deep', bgPanel: '--bg-panel', bgElevated: '--bg-elevated',
  health: '--health', armor: '--armor', ammo: '--ammo', damage: '--damage', enemy: '--enemy', ally: '--ally',
  pickup: '--pickup', dangerZone: '--danger-zone', dangerGlow: '--danger-glow',
  border: '--border', disabled: '--disabled',
};

/** A token as a Pixi colour number. */
export function px(t: BrandToken): number {
  return parseInt(BRAND[t].slice(1), 16);
}

/** WCAG 2 relative luminance and contrast ratio, for the readability checks. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
