// Class system. Owner 2026-10-13/14 gave Chog holders health, armour and damage by rarity; owner 2026-10-18 ("CHOG
// SUPERPOWER SYSTEM", rule 6: "Do not use NFT rarity for generic health/damage stat inflation") replaced that: every
// tier now starts at base stats, and a verified Chog instead gets the superpower its real traits carry, ranked by its
// tier (src/config/superpowers.ts). The ten 1:1s keep their named signatures. Free players and holders buy the same
// shard upgrades. Grenade capacity by tier is unchanged (owner 2026-10-14). Duels: tests/power.test.ts.
// Movement speed is never changed by tier or upgrade: positioning stays the skill.
import { ONE_OF_ONE_IDS, TIER_TABLE } from '../nft/tier-table.js';
import type { AbilityDef } from './heroes';
import { pickPower, superAbility, type Rank } from './superpowers.js';

export type Tier = 'free' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const TIERS: readonly Tier[] = ['free', 'common', 'uncommon', 'rare', 'epic', 'legendary'];

export interface TierDef {
  label: string;
  /** Multiplies the hero's base health. */
  hpMul: number;
  /** Armour added to the hero's starting armour and to its armour cap. */
  armor: number;
  /** Multiplies weapon damage. */
  damageMul: number;
}

// Every tier starts at base stats (owner 2026-10-18, rule 6). Rarity shows up as the rank of the Chog's superpower.
export const TIER_DEFS: Record<Tier, TierDef> = {
  free: { label: 'Free', hpMul: 1, armor: 0, damageMul: 1 },
  common: { label: 'Common', hpMul: 1, armor: 0, damageMul: 1 },
  uncommon: { label: 'Uncommon', hpMul: 1, armor: 0, damageMul: 1 },
  rare: { label: 'Rare', hpMul: 1, armor: 0, damageMul: 1 },
  epic: { label: 'Epic', hpMul: 1, armor: 0, damageMul: 1 },
  legendary: { label: '1:1', hpMul: 1, armor: 0, damageMul: 1 },
};

/** Shard upgrades. Free players and holders buy the same ones, at the same prices, to the same caps. */
export type UpgradeId = 'vitality' | 'plating' | 'firepower' | 'focus';
export interface UpgradeDef { name: string; text: string; ranks: number; costs: readonly number[] }
/**
 * Owner 2026-10-23: bigger steps and 4 more ranks on every upgrade. Prices are the earlier price per rank (the ranks it
 * had, then the same curve continued for the 4 new ones) x1.25, Firepower x2 instead (never both), rounded to the
 * nearest 5 shards. Ranks already bought keep their meaning: an account at Vitality 6/8 is now at 6/12.
 */
const BASE_COSTS: Record<UpgradeId, readonly number[]> = {
  vitality: [10, 40, 70, 100, 140, 180, 230, 290, 350, 420, 500, 590],
  plating: [10, 40, 70, 100, 140, 180, 230, 290, 350, 420, 500, 590],
  firepower: [150, 250, 350, 450, 550, 650, 750],
  focus: [30, 60, 110, 180, 270, 380, 510, 660],
};
export const PRICE_MUL: Record<UpgradeId, number> = { vitality: 1.25, plating: 1.25, firepower: 2, focus: 1.25 };
const priced = (id: UpgradeId) => BASE_COSTS[id].map((c) => Math.round((c * PRICE_MUL[id]) / 5) * 5);
/** What one rank adds: Vitality +10 health, Plating +5 armour, Firepower +35% weapon damage, Focus -8% ability cooldown. */
export const UPGRADE_STEP = { vitality: 10, plating: 5, firepower: 0.35, focus: 0.08 } as const;
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  // The first rank (15) is still within one saved online match (10 played + kills), so a new account buys early.
  vitality: { name: 'Vitality', text: `+${UPGRADE_STEP.vitality} health per rank`, ranks: 12, costs: priced('vitality') },
  plating: { name: 'Plating', text: `+${UPGRADE_STEP.plating} armour per rank`, ranks: 12, costs: priced('plating') },
  firepower: { name: 'Firepower', text: `+${Math.round(UPGRADE_STEP.firepower * 100)}% weapon damage per rank`, ranks: 7, costs: priced('firepower') },
  focus: { name: 'Focus', text: `-${Math.round(UPGRADE_STEP.focus * 100)}% ability cooldown per rank`, ranks: 8, costs: priced('focus') },
};
export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
export type Upgrades = Record<UpgradeId, number>;
export const NO_UPGRADES: Upgrades = { vitality: 0, plating: 0, firepower: 0, focus: 0 };
export const MAX_UPGRADES: Upgrades = Object.fromEntries(UPGRADE_IDS.map((id) => [id, UPGRADES[id].ranks])) as Upgrades;

/**
 * Hard caps (docs/design/power.md). A profile outside them is a bug; tests check every tier at max upgrades. Owner
 * 2026-10-23 raised them to exactly the maxed upgrades: health x2 (a maxed free profile is 150 + 120 = 270, x1.8),
 * armour +60, damage x3.45, ability cooldown x0.36.
 */
export const CAPS = {
  hpMul: 2,
  armor: MAX_UPGRADES.plating * UPGRADE_STEP.plating,
  damageMul: +(1 + MAX_UPGRADES.firepower * UPGRADE_STEP.firepower).toFixed(4),
  cooldownMul: +(1 - MAX_UPGRADES.focus * UPGRADE_STEP.focus).toFixed(4),
} as const;

/** Grenade capacity by tier (owner 2026-10-14): free 3, +2 per holder tier, 13 for Legendary and the 1:1s. Upgrades
 * never change it; online the server sets it from the verified ticket. */
export const GRENADES: Record<Tier, number> = { free: 3, common: 5, uncommon: 7, rare: 9, epic: 11, legendary: 13 };

/**
 * Max health before upgrades (owner 2026-10-18 IDENTITY + MAPS pass): 150 for everyone, 200 for a verified Chog that
 * carries no mapped superpower (the 618 tokens, the ten 1:1s among them). It is the one CHOG health edge, and it never
 * depends on rarity.
 */
export const BASE_HP = { free: 150, chog: 200 } as const;

/** What the sim applies to one actor. */
export interface Power {
  tier: Tier;
  /** Max health before upgrades: BASE_HP.free, or BASE_HP.chog for a Chog without a superpower. */
  baseHp: number;
  hpMul: number;
  armor: number;
  damageMul: number;
  cooldownMul: number;
  /** A 1:1 signature replaces the hero ability; otherwise null. */
  signature: AbilityDef | null;
  /** A verified Chog's superpower (its real traits, ranked by its tier) replaces the hero ability; otherwise null. */
  superpower: AbilityDef | null;
  /** Demo power is labelled everywhere and never earns rewards. */
  demo: boolean;
  /** The Chog behind this power (verified or demo), or null for a free profile. Picks a 1:1's own cues. */
  metadataId: number | null;
  /** Grenades carried into a match (GRENADES by tier). */
  grenades: number;
}

export const BASE_POWER: Power = { tier: 'free', baseHp: BASE_HP.free, hpMul: 1, armor: 0, damageMul: 1, cooldownMul: 1, signature: null, superpower: null, demo: false, metadataId: null, grenades: GRENADES.free };

export function clampUpgrades(u: Partial<Upgrades> | null | undefined): Upgrades {
  const out = { ...NO_UPGRADES };
  for (const id of UPGRADE_IDS) {
    const v = Math.floor(Number(u?.[id] ?? 0));
    out[id] = Number.isFinite(v) ? Math.max(0, Math.min(UPGRADES[id].ranks, v)) : 0;
  }
  return out;
}

/**
 * Power for one player. `tier` is what the server grants (the verified token's tier, or 'free' when NFT power is off or
 * there is no token), so a free tier never gets a superpower whatever the other arguments say. `choice`: which of the
 * token's own powers the holder picked; anything the token's traits do not carry falls back to its first power.
 */
export function powerFor(tier: Tier, upgrades: Partial<Upgrades> | null = null, signature: AbilityDef | null = null, demo = false, metadataId: number | null = null, choice: string | null = null): Power {
  const t = TIER_DEFS[tier];
  const u = clampUpgrades(upgrades);
  const sig = tier === 'legendary' ? signature : null;
  const own = metadataId ? tierOfMetadataId(metadataId) : null;
  const sp = tier !== 'free' && !sig && own && own !== 'free' ? pickPower(metadataId, choice) : null;
  const baseHp = tier !== 'free' && own && !sp ? BASE_HP.chog : BASE_HP.free;
  return {
    tier,
    baseHp,
    // Vitality is flat health (+10 a rank) on top of the base, carried as the multiplier the sim applies to the base.
    hpMul: Math.min(CAPS.hpMul, t.hpMul + (u.vitality * UPGRADE_STEP.vitality) / baseHp),
    armor: Math.min(CAPS.armor, t.armor + u.plating * UPGRADE_STEP.plating),
    damageMul: Math.min(CAPS.damageMul, t.damageMul + u.firepower * UPGRADE_STEP.firepower),
    cooldownMul: Math.max(CAPS.cooldownMul, 1 - u.focus * UPGRADE_STEP.focus),
    signature: sig,
    superpower: sp ? superAbility(sp, own as Rank) : null,
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
export function powerForToken(metadataId: number, upgrades: Partial<Upgrades> | null, demo: boolean, choice: string | null = null): Power {
  const tier = tierOfMetadataId(metadataId) ?? 'free';
  return powerFor(tier, upgrades, signatureFor(metadataId), demo, tierOfMetadataId(metadataId) ? metadataId : null, choice);
}
