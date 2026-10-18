// V2 perks (owner V2 §8: "enemy perks lootable"; "more decisions, not more numbers"). One slot, match only, any hero.
// Hostiles carry one; a kill drops it in the bag; an empty slot takes it on touch, a full one swaps only if you stand
// still on the bag (TUNING.perks.swapSeconds), which is the decision: is this perk worth standing in the open for?
// None changes health, armour, damage or speed. Numbers in TUNING.perks.
export type PerkId = 'soles' | 'ears' | 'medic' | 'marker';

export interface PerkDef { id: PerkId; name: string; text: string }

export const PERKS: Record<PerkId, PerkDef> = {
  soles: { id: 'soles', name: 'Soft Soles', text: 'Your footsteps carry 40% less far.' },
  ears: { id: 'ears', name: 'Keen Ears', text: 'Walls do not muffle what you hear: footsteps through a wall reach you as far as in the open.' },
  medic: { id: 'medic', name: 'Field Kit', text: 'You revive teammates in half the time, and they get up with half their health.' },
  marker: { id: 'marker', name: 'Marker', text: 'A hostile you hit is shown to your whole team for 2 s.' },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

export const isPerk = (v: unknown): v is PerkId => typeof v === 'string' && v in PERKS;

/** The perk an actor spawns with: fixed by the match seed and its id (no draw from the world's random stream). */
export function spawnPerk(seed: number, id: number): PerkId {
  let h = Math.imul((seed ^ 0x9e3779b9) + id * 0x85ebca6b, 0xc2b2ae35);
  h ^= h >>> 15;
  return PERK_IDS[(h >>> 0) % PERK_IDS.length];
}
