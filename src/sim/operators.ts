// Operators: the default plus token-derived sidegrades. Base damage, health, and speed are identical for all
// (LOCKED). Each sidegrade changes the shape of play: how far or wide you see, and the weapon's rhythm.
export interface Operator {
  id: string;
  name: string;
  // Vision
  range: number;
  coneDeg: number;
  // Weapon
  magazine: number;
  fireInterval: number;
  // Max deviation either side of the aim, degrees (uniform).
  spreadDeg: number;
  reloadSeconds: number;
}

// Default: a complete operator that can win. 70 degree cone, 9 u range, 12 round magazine.
export const DEFAULT_OPERATOR: Operator = {
  id: 'standard', name: 'Standard',
  range: 9, coneDeg: 70, magazine: 12, fireInterval: 0.14, spreadDeg: 3, reloadSeconds: 1.4,
};

// Sidegrades. Each gains on one axis and pays on another (balance is checked in tests/operators.test.ts).
export const SIDEGRADES: Operator[] = [
  // Narrow and long: spots threats down halls early, blind on the flanks.
  { ...DEFAULT_OPERATOR, id: 'lamp', name: 'Lamp', range: 11, coneDeg: 50 },
  // Wide and short: owns corners and rooms, sees little down a corridor.
  { ...DEFAULT_OPERATOR, id: 'wide', name: 'Wide', range: 7.5, coneDeg: 98 },
  // Steady: few precise shots and a quick reload. Punishes misses.
  { ...DEFAULT_OPERATOR, id: 'steady', name: 'Steady', magazine: 8, fireInterval: 0.18, spreadDeg: 1.2, reloadSeconds: 1.0 },
  // Spray: long magazine and fast rhythm, loose and slow to reload. Commits you to a fight.
  { ...DEFAULT_OPERATOR, id: 'spray', name: 'Spray', magazine: 18, fireInterval: 0.1, spreadDeg: 4.2, reloadSeconds: 1.9 },
];

/**
 * Deterministic operator for a token id (Option B in docs/design/nft.md: real metadata is UNKNOWN).
 * The UI must not claim this matches the token's art.
 */
export function operatorFor(tokenId: string): Operator {
  let h = 2166136261;
  for (let i = 0; i < tokenId.length; i++) {
    h ^= tokenId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return SIDEGRADES[(h >>> 0) % SIDEGRADES.length];
}

// Muted marking colours for a bound operator's band. None is close to the hostile rust.
const MARKINGS = [0x8fa3a8, 0xa79c7a, 0x9a8fb0, 0x7f9a7a, 0xb08f84];

export function markingFor(tokenId: string): number {
  let h = 0;
  for (let i = 0; i < tokenId.length; i++) h = (h * 31 + tokenId.charCodeAt(i)) >>> 0;
  return MARKINGS[h % MARKINGS.length];
}
