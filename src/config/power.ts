// Class system (owner master build prompt, 2026-10-13): Chog holders get combat power by rarity tier, free players earn
// a smaller upgrade path with shards, and the ten 1:1 Chogs each carry a signature ability in the single ability slot.
// Every number here was chosen from measured duels (tests/power.test.ts, docs/design/power.md), not from feel.
// Movement speed is never changed by tier or upgrade: positioning stays the skill.
import { ONE_OF_ONE_IDS, TIER_TABLE } from '../nft/tier-table';
import type { AbilityDef } from './heroes';

export type Tier = 'free' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const TIERS: readonly Tier[] = ['free', 'common', 'uncommon', 'rare', 'epic', 'legendary'];

export interface TierDef {
  label: string;
  /** Multiplies the hero's base health. */
  hpMul: number;
  /** Armour added to the hero's starting armour and to its armour cap. */
  armor: number;
  /** Multiplies weapon damage. Only the 1:1 tier has one. */
  damageMul: number;
}

export const TIER_DEFS: Record<Tier, TierDef> = {
  // A free player: the base hero. Must stay a complete, winning design.
  free: { label: 'Free', hpMul: 1, armor: 0, damageMul: 1 },
  // Mirror duels vs free (perfect aim, docs/design/power.md): Common wins about 6 in 10, so the free player still wins often.
  common: { label: 'Common', hpMul: 1.06, armor: 6, damageMul: 1 },
  uncommon: { label: 'Uncommon', hpMul: 1.1, armor: 8, damageMul: 1 },
  rare: { label: 'Rare', hpMul: 1.15, armor: 12, damageMul: 1 },
  epic: { label: 'Epic', hpMul: 1.2, armor: 15, damageMul: 1 },
  // The ten 1:1s: the top tier, a little more damage and their own signature ability.
  legendary: { label: '1:1', hpMul: 1.25, armor: 18, damageMul: 1.05 },
};

/** Shard upgrades. Free players and holders can buy them; ranks are capped so a maxed free player meets a Common holder. */
export type UpgradeId = 'vitality' | 'plating' | 'focus';
export interface UpgradeDef { name: string; text: string; ranks: number; costs: readonly number[] }
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  vitality: { name: 'Vitality', text: '+2% health per rank', ranks: 3, costs: [40, 90, 160] },
  plating: { name: 'Plating', text: '+2 armour per rank', ranks: 3, costs: [40, 90, 160] },
  focus: { name: 'Focus', text: '-5% ability cooldown per rank', ranks: 4, costs: [30, 60, 110, 180] },
};
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
export const UPGRADE_STEP = { vitality: 0.02, plating: 2, focus: 0.05 } as const;
export type Upgrades = Record<UpgradeId, number>;
export const NO_UPGRADES: Upgrades = { vitality: 0, plating: 0, focus: 0 };

/** Hard caps (docs/design/power.md). A profile outside them is a bug; tests check every tier at max upgrades. */
export const CAPS = { hpMul: 1.35, armor: 25, damageMul: 1.05, cooldownMul: 0.8 } as const;

/** What the sim applies to one actor. */
export interface Power {
  tier: Tier;
  hpMul: number;
  armor: number;
  damageMul: number;
  cooldownMul: number;
  /** A 1:1 signature replaces the hero ability; otherwise null. */
  signature: AbilityDef | null;
  /** Demo power is labelled everywhere and never earns rewards. */
  demo: boolean;
}

export const BASE_POWER: Power = { tier: 'free', hpMul: 1, armor: 0, damageMul: 1, cooldownMul: 1, signature: null, demo: false };

export function clampUpgrades(u: Partial<Upgrades> | null | undefined): Upgrades {
  const out = { ...NO_UPGRADES };
  for (const id of UPGRADE_IDS) {
    const v = Math.floor(Number(u?.[id] ?? 0));
    out[id] = Number.isFinite(v) ? Math.max(0, Math.min(UPGRADES[id].ranks, v)) : 0;
  }
  return out;
}

export function powerFor(tier: Tier, upgrades: Partial<Upgrades> | null = null, signature: AbilityDef | null = null, demo = false): Power {
  const t = TIER_DEFS[tier];
  const u = clampUpgrades(upgrades);
  return {
    tier,
    hpMul: Math.min(CAPS.hpMul, t.hpMul + u.vitality * UPGRADE_STEP.vitality),
    armor: Math.min(CAPS.armor, t.armor + u.plating * UPGRADE_STEP.plating),
    damageMul: Math.min(CAPS.damageMul, t.damageMul),
    cooldownMul: Math.max(CAPS.cooldownMul, 1 - u.focus * UPGRADE_STEP.focus),
    signature: tier === 'legendary' ? signature : null,
    demo,
  };
}

/** Tier of a Chog Genesis token from its metadata id (the number in its name), or null if out of range. */
export function tierOfMetadataId(metadataId: number): Tier | null {
  if (!Number.isInteger(metadataId) || metadataId < 1 || metadataId > TIER_TABLE.length) return null;
  return ({ C: 'common', U: 'uncommon', R: 'rare', E: 'epic', L: 'legendary' } as const)[TIER_TABLE[metadataId - 1] as 'C'];
}

/**
 * The ten 1:1 signature abilities, keyed by metadata id. Ability names are original to this game; the tokens' own titles
 * are not shown in the game until name and art rights are confirmed (docs/design/nft.md). Each one has a readable
 * telegraph (render) and a sound everyone in range hears.
 */
export const SIGNATURES: Record<number, AbilityDef> = {
  53: { kind: 'burst', name: 'Flashfire', cooldown: 14, windup: 0.45, radius: 3, amount: 28, text: 'After a short flare, burns every hostile within 3 m you can see for 28.' },
  392: { kind: 'burst', name: 'Hellfire', cooldown: 18, windup: 0.8, radius: 3.5, amount: 30, armorPen: 1, text: 'A long, loud wind-up, then 30 straight to health (ignores armour) within 3.5 m you can see.' },
  434: { kind: 'scream', name: 'Howl', cooldown: 16, radius: 6, seconds: 2.5, amount: 0.6, text: 'Hostiles within 6 m you can see move at 60% speed for 2.5 s. Very loud.' },
  494: { kind: 'barrier', name: 'Bulwark', cooldown: 18, length: 3, seconds: 14, text: 'Drops a long slab (3 m) ahead for 14 s. Stops bullets, not sight.' },
  973: { kind: 'dash', name: 'Leap', cooldown: 7, seconds: 0.3, text: 'A long quiet leap (about 4 m) in the move direction.' },
  1006: { kind: 'sonar', name: 'Deadsight', cooldown: 16, radius: 18, seconds: 3.5, text: 'Shows every hostile within 18 m for 3.5 s. They hear it.' },
  1159: { kind: 'mend', name: 'Halo', cooldown: 20, amount: 30, radius: 4, allies: true, text: 'Restores 30 health to you and every ally within 4 m.' },
  1290: { kind: 'mend', name: 'Crown Guard', cooldown: 18, amount: 15, armor: 35, text: 'Restores 35 armour and 15 health.' },
  1373: { kind: 'shield', name: 'Gold Shell', cooldown: 20, seconds: 1.2, text: 'Untouchable for 1.2 s, but you cannot shoot while it holds.' },
  1376: { kind: 'frenzy', name: 'Red Rush', cooldown: 18, seconds: 4, amount: 1.25, text: '+25% damage for 4 s. Your shots glow red.' },
};

export function signatureFor(metadataId: number): AbilityDef | null {
  return (ONE_OF_ONE_IDS as readonly number[]).includes(metadataId) ? SIGNATURES[metadataId] ?? null : null;
}

/** Full power for a verified (or demo) token. */
export function powerForToken(metadataId: number, upgrades: Partial<Upgrades> | null, demo: boolean): Power {
  const tier = tierOfMetadataId(metadataId) ?? 'free';
  return powerFor(tier, upgrades, signatureFor(metadataId), demo);
}
