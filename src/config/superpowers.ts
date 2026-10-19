// CHOG superpowers (owner 2026-10-18 "CHOG SUPERPOWER SYSTEM"): a verified Chog's REAL traits give it one superpower
// in the single ability slot, in place of the hero's ability (a trade, never an extra: LOCKED 12, one ability). The
// token's verified tier is the power's rank, and rank changes duration, range, radius and cooldown, never health or
// weapon damage. Every power has a telegraph both sides see and a written counter. Design, mapping and numbers:
// docs/design/superpowers.md. Which token carries which power: src/nft/power-table.ts (generated from the catalogue).
import { POWER_TABLE } from '../nft/power-table.js';
import type { AbilityDef } from './heroes';
import type { Tier } from './power';

export type SuperpowerId = 'laser' | 'xray' | 'visor' | 'bubble' | 'drool' | 'aura';
export type Rank = Exclude<Tier, 'free'>;
export const RANKS: readonly Rank[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
/** Bit of each power in POWER_TABLE, and the order a token with several powers defaults to (the holder can pick). */
export const POWER_BITS: Record<SuperpowerId, number> = { laser: 1, xray: 2, visor: 32, bubble: 4, drool: 8, aura: 16 };
export const SUPERPOWER_IDS: readonly SuperpowerId[] = ['laser', 'xray', 'visor', 'bubble', 'drool', 'aura'];

/** Numbers of one power at one rank. Unused fields are 0. */
export interface RankNumbers {
  cooldown: number;
  /** Laser / X-Ray: beam seconds. Bubble: trapped seconds. Drool: pinned seconds. Aura: immune seconds. */
  seconds: number;
  /** Reach in u: beam length, or how far the orb flies. Aura: 0. */
  range: number;
  /** Laser / X-Ray: damage per second of beam on the first body in its line. */
  dps: number;
  /** Laser / X-Ray: charge seconds before the beam (the telegraph line). */
  charge: number;
  /** Bubble: radius of the cage. Drool: how far the goo drags its target to a wall. */
  area: number;
}

export interface SuperpowerDef {
  id: SuperpowerId;
  name: string;
  /** The real trait family it comes from. */
  trait: string;
  role: 'offensive' | 'defensive' | 'utility';
  text: string;
  telegraph: string;
  counter: string;
  /** Rank numbers, Common to Legendary. Legendary exists only for DEMO and Training (no non-1:1 Legendary carries a
   * power trait; the ten 1:1s keep their own signatures). */
  ranks: Record<Rank, RankNumbers>;
}

const r = (cooldown: number, seconds: number, range: number, dps: number, charge: number, area: number): RankNumbers => ({ cooldown, seconds, range, dps, charge, area });

export const SUPERPOWERS: Record<SuperpowerId, SuperpowerDef> = {
  // A real beam: a visible charge line first, then a burning beam that follows your aim at a capped turn rate and
  // stops on the first wall, crate or body. You walk slowly while it burns, and you keep your gun.
  laser: {
    id: 'laser', name: 'Laser Eyes', trait: 'Laser Eyes (Purple, fire, Green, cyan) or the Blue Laser head', role: 'offensive',
    text: 'Charge, then a burning beam from your eyes. Walls and cover stop it.',
    telegraph: 'A thin red line along your aim while it charges, then the beam itself, with a rising whine.',
    counter: 'Step off the line during the charge, or put cover between you. It turns slowly, so strafe across it.',
    ranks: {
      common: r(15, 0.8, 9, 55, 0.35, 0),
      uncommon: r(14, 0.9, 10, 55, 0.35, 0),
      rare: r(13, 1.0, 11, 55, 0.35, 0),
      epic: r(12, 1.1, 12, 55, 0.35, 0),
      legendary: r(11, 1.2, 13, 55, 0.35, 0),
    },
  },
  // The X-Ray beam passes through walls. It is NOT vision: you see nothing new, so you aim it from sound and what your
  // team knows. Longer charge, short weak beam, and the charge line shows through walls to the people it points at.
  // No collection trait carries it yet (owner 2026-10-18: Visor Eyes are NOT X-Ray); DEMO and Training only.
  xray: {
    id: 'xray', name: 'X-Ray Eyes', trait: 'no collection trait yet (DEMO and Training only)', role: 'offensive',
    text: 'A long charge, then a short beam that goes through walls. Shows you nothing behind them.',
    telegraph: 'A violet line through the walls along your aim while it charges: anyone it points at sees it.',
    counter: 'When a violet line crosses you, move off it: the charge is long and the beam is short.',
    ranks: {
      common: r(16, 0.6, 9, 50, 0.7, 0),
      uncommon: r(15, 0.65, 10, 50, 0.7, 0),
      rare: r(14, 0.7, 11, 50, 0.7, 0),
      epic: r(13, 0.75, 12, 50, 0.7, 0),
      legendary: r(12, 0.8, 13, 50, 0.7, 0),
    },
  },
  // Visor Eyes (owner 2026-10-18: "VISOR -> HOSTILE TRACKER"): passive, always on. Every hostile within its radius shows
  // as a dot on your tracker (the HUD map), where it is now, through walls. Nothing else: not its health, facing, power
  // or anything it carries, and never a body in your view. Hostiles on your tracker are told they are tracked. Rank
  // widens the radius. No button: the slot is taken by the tracker.
  visor: {
    id: 'visor', name: 'Visor', trait: 'Visor Eyes (Gradient, Sunset, Plasma)', role: 'utility',
    text: 'Always on: hostiles within its radius are dots on your tracker, through walls. No damage.',
    telegraph: 'A tracked hostile sees TRACKED under its health while it is inside the radius.',
    counter: 'It only knows where you are, not what you do: stay outside its radius, or make it come to you where it cannot see.',
    ranks: {
      common: r(0, 0, 16, 0, 0, 0),
      uncommon: r(0, 0, 19, 0, 0, 0),
      rare: r(0, 0, 22, 0, 0, 0),
      epic: r(0, 0, 25, 0, 0, 0),
      legendary: r(0, 0, 28, 0, 0, 0),
    },
  },
  // A slow, glowing gum bubble. The first hostile it touches is caged in a small circle: it can still aim and shoot,
  // but cannot leave until the bubble pops.
  bubble: {
    id: 'bubble', name: 'Bubble', trait: 'Bubblegum mouth', role: 'utility',
    text: 'Blow a slow bubble. The first hostile it touches is caged in place. Rarer gum holds longer.',
    telegraph: 'A big pink bubble drifting at walking pace, and a pop when it lands.',
    counter: 'Dodge it: it is slow and glows. Caged, you can still shoot back, and the cage is short.',
    ranks: {
      common: r(16, 2.0, 9, 0, 0, 1.1),
      uncommon: r(15, 2.6, 10, 0, 0, 1.1),
      rare: r(14, 3.2, 11, 0, 0, 1.1),
      epic: r(13, 3.8, 12, 0, 0, 1.1),
      legendary: r(12, 4.5, 13, 0, 0, 1.1),
    },
  },
  // Spit a strand of goo. The first hostile it hits is dragged to the nearest wall within reach and glued there: it can
  // aim and shoot, but not move. No damage on its own.
  drool: {
    id: 'drool', name: 'Drool Web', trait: 'Drooling mouth', role: 'utility',
    text: 'Spit goo. The first hostile it hits is dragged to the nearest wall and glued there.',
    telegraph: 'A green glob in flight with a wet hiss, then a goo strand from the wall to the target.',
    counter: 'Strafe the glob. Glued, you still shoot: hold the angle the spitter has to cross.',
    ranks: {
      common: r(15, 1.4, 8, 0, 0, 2.5),
      uncommon: r(14, 1.7, 9, 0, 0, 3),
      rare: r(13, 2.0, 10, 0, 0, 3.5),
      epic: r(12, 2.3, 11, 0, 0, 4),
      legendary: r(11, 2.7, 12, 0, 0, 4.5),
    },
  },
  // Full damage immunity, but you cannot shoot or throw while it holds; press again to drop it early. The danger zone
  // still hurts. Rarer auras last much longer (owner: "rarer trait = stronger version"). Cooldown starts at activation
  // and leaves 45 s without it at every rank.
  aura: {
    id: 'aura', name: 'Aura', trait: 'any Aura', role: 'defensive',
    text: 'Untouchable for a while, but you cannot shoot or throw. Press again to drop it early.',
    telegraph: 'A bright aura around the body and a chime. Steps are never quiet while it holds.',
    counter: 'Stop shooting it: take cover, reload, and hold the spot it has to leave from. The zone still hurts it.',
    ranks: {
      common: r(53, 8, 0, 0, 0, 0),
      uncommon: r(55, 10, 0, 0, 0, 0),
      rare: r(60, 15, 0, 0, 0, 0),
      epic: r(65, 20, 0, 0, 0, 0),
      legendary: r(75, 30, 0, 0, 0, 0),
    },
  },
};

/** Beam rules shared by Laser and X-Ray. */
export const BEAM = {
  // How fast a charging or burning beam follows the aim (deg/s): a strafing target can outrun it up close.
  turnDegPerSec: 45,
  // Walk speed share while charging or burning.
  moveMul: 0.55,
  // Share of beam damage that ignores armour.
  armorPen: 0.5,
  // Half-width of the beam for hits (u).
  width: 0.12,
  // The beam burns in pulses this far apart (s): damage per pulse = dps x pulse, one hit event each.
  pulse: 0.1,
} as const;

/** Orb rules shared by Bubble and Drool. */
export const ORB = {
  speed: { bubble: 6, drool: 10 } as Record<'bubble' | 'drool', number>,
  radius: { bubble: 0.35, drool: 0.2 } as Record<'bubble' | 'drool', number>,
  // Drool: how fast the goo drags its target (u/s).
  pullSpeed: 9,
} as const;

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';

/** The powers a token's real traits carry, in default order, or [] (out of range, or no power trait). */
export function powersOf(metadataId: number | null | undefined): SuperpowerId[] {
  if (!metadataId || !Number.isInteger(metadataId) || metadataId < 1 || metadataId > POWER_TABLE.length) return [];
  const mask = DIGITS.indexOf(POWER_TABLE[metadataId - 1]);
  return SUPERPOWER_IDS.filter((id) => mask & POWER_BITS[id]);
}

/** The power a token plays with: the holder's pick if the token carries it, else the first it carries, else null. */
export function pickPower(metadataId: number | null | undefined, choice?: string | null): SuperpowerId | null {
  const list = powersOf(metadataId);
  return list.find((p) => p === choice) ?? list[0] ?? null;
}

export const isSuperpower = (v: unknown): v is SuperpowerId => typeof v === 'string' && (SUPERPOWER_IDS as readonly string[]).includes(v);

/**
 * The ability slot for one power at one rank. Fields reuse AbilityDef: seconds, radius = range, amount = beam dps,
 * windup = charge, length = cage radius (Bubble) or drag reach (Drool), armorPen for beams.
 */
export function superAbility(id: SuperpowerId, rank: Rank): AbilityDef {
  const d = SUPERPOWERS[id], n = d.ranks[rank];
  return {
    kind: id, name: d.name, cooldown: n.cooldown, seconds: n.seconds, text: d.text, telegraph: d.telegraph, counter: d.counter,
    ...(n.range ? { radius: n.range } : {}), ...(n.dps ? { amount: n.dps, armorPen: BEAM.armorPen } : {}),
    ...(n.charge ? { windup: n.charge } : {}), ...(n.area ? { length: n.area } : {}),
    power: id, rank,
  };
}

/** One line of numbers for the HUD, docs and roster. */
export function rankLine(id: SuperpowerId, rank: Rank): string {
  const n = SUPERPOWERS[id].ranks[rank];
  switch (id) {
    case 'laser':
    case 'xray': return `${n.range} m beam, ${n.seconds} s, ${n.dps}/s, charge ${n.charge} s, cooldown ${n.cooldown} s`;
    case 'bubble': return `${n.range} m reach, caged ${n.seconds} s, cooldown ${n.cooldown} s`;
    case 'drool': return `${n.range} m reach, dragged up to ${n.area} m, glued ${n.seconds} s, cooldown ${n.cooldown} s`;
    case 'aura': return `immune ${n.seconds} s, cooldown ${n.cooldown} s`;
    case 'visor': return `tracks hostiles within ${n.range} m, always on`;
  }
}
