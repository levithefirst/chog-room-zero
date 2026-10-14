// Class system (owner master build prompt 2026-10-13, master integration pass 2026-10-14): Chog holders get real
// combat power by rarity tier, free players earn an upgrade path with shards that reaches the lower holder tiers, and
// the ten 1:1 Chogs are the dominant top tier, each with its own named identity and signature ability.
// Every number here is checked by measured duels (tests/power.test.ts, docs/design/power.md), not by feel.
// Movement speed is never changed by tier or upgrade: positioning stays the skill.
import { ONE_OF_ONE_IDS, TIER_TABLE } from '../nft/tier-table.js';
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
  // A free player: the base hero. Must stay a complete, winning design; upgrades take it past Uncommon starting power.
  free: { label: 'Free', hpMul: 1, armor: 0, damageMul: 1 },
  // Each holder tier is a visible step: more health, more armour, and from Uncommon up a little more damage.
  common: { label: 'Common', hpMul: 1.15, armor: 8, damageMul: 1 },
  uncommon: { label: 'Uncommon', hpMul: 1.22, armor: 12, damageMul: 1.02 },
  rare: { label: 'Rare', hpMul: 1.32, armor: 18, damageMul: 1.04 },
  epic: { label: 'Epic', hpMul: 1.42, armor: 24, damageMul: 1.06 },
  // The ten 1:1s: intentionally dominant. A fresh free player should lose almost every straight duel; a team, cover,
  // the signature's counter and focus fire are how you beat one.
  legendary: { label: '1:1', hpMul: 1.75, armor: 35, damageMul: 1.12 },
};

/** Shard upgrades. Free players and holders can buy them. A fully upgraded free profile starts stronger than an
 * Uncommon holder and close to a Rare one (tested), so a free player can climb past the lower tiers by playing. */
export type UpgradeId = 'vitality' | 'plating' | 'firepower' | 'focus';
export interface UpgradeDef { name: string; text: string; ranks: number; costs: readonly number[] }
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  // The first rank costs 10 so a new account can buy something after its first saved match.
  vitality: { name: 'Vitality', text: '+3% health per rank', ranks: 8, costs: [10, 40, 70, 100, 140, 180, 230, 290] },
  plating: { name: 'Plating', text: '+2 armour per rank', ranks: 8, costs: [10, 40, 70, 100, 140, 180, 230, 290] },
  firepower: { name: 'Firepower', text: '+1% weapon damage per rank', ranks: 3, costs: [150, 250, 350] },
  focus: { name: 'Focus', text: '-5% ability cooldown per rank', ranks: 4, costs: [30, 60, 110, 180] },
};
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
export const UPGRADE_STEP = { vitality: 0.03, plating: 2, firepower: 0.01, focus: 0.05 } as const;
export type Upgrades = Record<UpgradeId, number>;
export const NO_UPGRADES: Upgrades = { vitality: 0, plating: 0, firepower: 0, focus: 0 };
export const MAX_UPGRADES: Upgrades = { vitality: 8, plating: 8, firepower: 3, focus: 4 };

/** Hard caps (docs/design/power.md). A profile outside them is a bug; tests check every tier at max upgrades. */
export const CAPS = { hpMul: 2, armor: 52, damageMul: 1.15, cooldownMul: 0.8 } as const;

/** Grenade capacity by tier (owner 2026-10-14): free 3, +2 per holder tier, 13 for Legendary and the 1:1s. Upgrades
 * never change it; online the server sets it from the verified ticket. */
export const GRENADES: Record<Tier, number> = { free: 3, common: 5, uncommon: 7, rare: 9, epic: 11, legendary: 13 };

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
  /** The Chog behind this power (verified or demo), or null for a free profile. Picks a 1:1's own cues. */
  metadataId: number | null;
  /** Grenades carried into a match (GRENADES by tier). */
  grenades: number;
}

export const BASE_POWER: Power = { tier: 'free', hpMul: 1, armor: 0, damageMul: 1, cooldownMul: 1, signature: null, demo: false, metadataId: null, grenades: GRENADES.free };

export function clampUpgrades(u: Partial<Upgrades> | null | undefined): Upgrades {
  const out = { ...NO_UPGRADES };
  for (const id of UPGRADE_IDS) {
    const v = Math.floor(Number(u?.[id] ?? 0));
    out[id] = Number.isFinite(v) ? Math.max(0, Math.min(UPGRADES[id].ranks, v)) : 0;
  }
  return out;
}

export function powerFor(tier: Tier, upgrades: Partial<Upgrades> | null = null, signature: AbilityDef | null = null, demo = false, metadataId: number | null = null): Power {
  const t = TIER_DEFS[tier];
  const u = clampUpgrades(upgrades);
  return {
    tier,
    hpMul: Math.min(CAPS.hpMul, t.hpMul + u.vitality * UPGRADE_STEP.vitality),
    armor: Math.min(CAPS.armor, t.armor + u.plating * UPGRADE_STEP.plating),
    damageMul: Math.min(CAPS.damageMul, t.damageMul + u.firepower * UPGRADE_STEP.firepower),
    cooldownMul: Math.max(CAPS.cooldownMul, 1 - u.focus * UPGRADE_STEP.focus),
    signature: tier === 'legendary' ? signature : null,
    demo,
    metadataId,
    grenades: GRENADES[tier],
  };
}

/** Tier of a Chog Genesis token from its metadata id (the number in its name), or null if out of range. */
export function tierOfMetadataId(metadataId: number): Tier | null {
  if (!Number.isInteger(metadataId) || metadataId < 1 || metadataId > TIER_TABLE.length) return null;
  return ({ C: 'common', U: 'uncommon', R: 'rare', E: 'epic', L: 'legendary' } as const)[TIER_TABLE[metadataId - 1] as 'C'];
}

/**
 * The ten 1:1 signature abilities, keyed by metadata id. Each one has a readable telegraph drawn for both sides, its
 * own sound, and a counter written next to it (owner 2026-10-14: the tokens' real names are used in the game).
 */
export const SIGNATURES: Record<number, AbilityDef> = {
  53: { kind: 'burst', name: 'Flashfire', cooldown: 12, windup: 0.45, radius: 3.2, amount: 35,
    text: 'After a short flare, burns every hostile within 3.2 m you can see for 35.',
    telegraph: 'Orange ring of the true radius fills in for 0.45 s, rising hiss.', counter: 'Step out of the ring or put a wall between you before it fills.' },
  392: { kind: 'burst', name: 'Hellfire', cooldown: 16, windup: 0.8, radius: 3.5, amount: 40, armorPen: 1,
    text: 'A long, loud wind-up, then 40 straight to health (ignores armour) within 3.5 m you can see.',
    telegraph: 'Red ring fills for 0.8 s with a deep roar.', counter: 'The longest wind-up in the game: back off or break line of sight.' },
  434: { kind: 'scream', name: 'Howl', cooldown: 15, radius: 6.5, seconds: 3, amount: 0.55,
    text: 'Hostiles within 6.5 m you can see move at 55% speed for 3 s. Very loud.',
    telegraph: 'Ice-blue shock ring; slowed operators wear a broken blue ring.', counter: 'Fight it from beyond 6.5 m or from behind cover; it needs line of sight.' },
  494: { kind: 'barrier', name: 'Bulwark', cooldown: 16, length: 3, seconds: 14,
    text: 'Drops a long slab (3 m) ahead for 14 s. Stops bullets, not sight.',
    telegraph: 'The green slab itself, with a heavy slam.', counter: 'Walk around it: it blocks one line, not the room. The marksman still sees over it.' },
  973: { kind: 'dash', name: 'Leap', cooldown: 6, seconds: 0.3,
    text: 'A long, quiet leap (about 4 m) in the move direction.',
    telegraph: 'A green streak along the leap and a croak where it lands.', counter: 'It cannot shoot mid-leap; hold your aim where it lands.' },
  1006: { kind: 'sonar', name: 'Deadsight', cooldown: 14, radius: 18, seconds: 4,
    text: 'Shows every hostile within 18 m for 4 s. They hear it.',
    telegraph: 'A violet ring 18 m wide and a toll everyone in range hears.', counter: 'When you hear the toll you are marked: move to a new spot for 4 s.' },
  1159: { kind: 'mend', name: 'Halo', cooldown: 18, amount: 40, radius: 4.5, allies: true,
    text: 'Restores 40 health to you and every ally within 4.5 m.',
    telegraph: 'A white-gold ring of the true radius and a choir chord.', counter: 'Spread her team out, or burst one target down before the cooldown is back.' },
  1290: { kind: 'mend', name: 'Crown Guard', cooldown: 16, amount: 20, armor: 40,
    text: 'Restores 40 armour and 20 health.',
    telegraph: 'A purple crown ring and a heavy plate clank.', counter: 'Armour-piercing weapons (the marksman) and Hellfire cut through it.' },
  1373: { kind: 'shield', name: 'Gold Shell', cooldown: 18, seconds: 1.5,
    text: 'Untouchable for 1.5 s, but you cannot shoot while it holds.',
    telegraph: 'A gold shell around the body and a bell.', counter: 'Stop firing and reload: it cannot shoot back, and it ends in 1.5 s.' },
  1376: { kind: 'frenzy', name: 'Red Rush', cooldown: 16, seconds: 4.5, amount: 1.3,
    text: '+30% damage for 4.5 s. Your shots glow red.',
    telegraph: 'Red outline and a growl; its tracers turn red.', counter: 'Break line of sight for 4.5 s; it gains nothing without a target.' },
};

/** Who each 1:1 is: the token's own name (verified catalogue) and the colour of its telegraphs. */
export const ONE_OF_ONE: Record<number, { name: string; color: number }> = {
  53: { name: 'Blaze', color: 0xff7a1a },
  392: { name: 'Burning Skully', color: 0xff3b2f },
  434: { name: 'Chog Scream', color: 0x7fd0ff },
  494: { name: 'Chogbomination', color: 0x8bd450 },
  973: { name: 'Frogger', color: 0x3fe08a },
  1006: { name: 'Grim', color: 0xb7a6ff },
  1159: { name: 'Halo', color: 0xfdf3c8 },
  1290: { name: 'Krown', color: 0xb57bff },
  1373: { name: 'Midas', color: 0xffc531 },
  1376: { name: 'Redd', color: 0xff2a4a },
};

/** Shown name of a Chog: "Blaze (#53)" for a 1:1, "Chog #812" otherwise. */
export function chogName(metadataId: number): string {
  const o = ONE_OF_ONE[metadataId];
  return o ? `${o.name} (#${metadataId})` : `Chog #${metadataId}`;
}

export function signatureFor(metadataId: number): AbilityDef | null {
  return (ONE_OF_ONE_IDS as readonly number[]).includes(metadataId) ? SIGNATURES[metadataId] ?? null : null;
}

/** Full power for a verified (or demo) token. */
export function powerForToken(metadataId: number, upgrades: Partial<Upgrades> | null, demo: boolean): Power {
  const tier = tierOfMetadataId(metadataId) ?? 'free';
  return powerFor(tier, upgrades, signatureFor(metadataId), demo, tierOfMetadataId(metadataId) ? metadataId : null);
}
