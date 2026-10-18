// NFT sidegrades, used today only by DEMO identities (?mockChog, the DEMO screen): a verified holder plays as a
// guest identity with tier power from src/config/power.ts instead (LOCKED 9 since 2026-10-14), so nothing here
// stacks on real tier power. A sidegrade changes range, cone, magazine, fire rate, spread and reload, never health,
// armour, damage or speed. Each gains on one axis and pays on another; balance is checked in tests/operators.test.ts.
export interface Sidegrade {
  id: string;
  name: string;
  rangeMul: number;
  coneMul: number;
  magMul: number;
  intervalMul: number;
  spreadMul: number;
  reloadMul: number;
}

export const NO_SIDEGRADE: Sidegrade = { id: 'standard', name: 'Standard', rangeMul: 1, coneMul: 1, magMul: 1, intervalMul: 1, spreadMul: 1, reloadMul: 1 };

export const SIDEGRADES: Sidegrade[] = [
  // Narrow and long: sees down halls early, blind on the flanks.
  { ...NO_SIDEGRADE, id: 'lamp', name: 'Lamp', rangeMul: 1.22, coneMul: 0.72 },
  // Wide and short: owns rooms and corners, sees little down a corridor.
  { ...NO_SIDEGRADE, id: 'wide', name: 'Wide', rangeMul: 0.83, coneMul: 1.4 },
  // Steady: a shorter magazine and slower rhythm, slightly tighter, much quicker reload. Punishes misses.
  { ...NO_SIDEGRADE, id: 'steady', name: 'Steady', magMul: 0.7, intervalMul: 1.12, spreadMul: 0.85, reloadMul: 0.7 },
  // Spray: a longer magazine, slightly looser, slower to reload. Rewards holding the trigger.
  { ...NO_SIDEGRADE, id: 'spray', name: 'Spray', magMul: 1.4, intervalMul: 0.97, spreadMul: 1.15, reloadMul: 1.4 },
];

/** Deterministic sidegrade for a token id (Option B in docs/design/nft.md; real metadata is UNKNOWN). */
export function operatorFor(tokenId: string): Sidegrade {
  let h = 2166136261;
  for (let i = 0; i < tokenId.length; i++) {
    h ^= tokenId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return SIDEGRADES[(h >>> 0) % SIDEGRADES.length];
}

const MARKINGS = [0x8fa3a8, 0xa79c7a, 0x9a8fb0, 0x7f9a7a, 0xb08f84];

export function markingFor(tokenId: string): number {
  let h = 0;
  for (let i = 0; i < tokenId.length; i++) h = (h * 31 + tokenId.charCodeAt(i)) >>> 0;
  return MARKINGS[h % MARKINGS.length];
}
