// Characters. Adding one means adding an entry here: department, weapon, body, vision, one ability.
// Bots use the same entries. The burst kind is used only by 1:1 signatures (src/config/power.ts); scream, shield and
// frenzy are shared by free characters (smaller numbers) and 1:1 signatures. laser, xray, bubble, drool and aura are
// the CHOG superpowers (src/config/superpowers.ts): only a verified Chog whose real traits carry one (or DEMO).
export type AbilityKind = 'dash' | 'sonar' | 'barrier' | 'mend' | 'burst' | 'scream' | 'shield' | 'frenzy' | 'laser' | 'xray' | 'visor' | 'bubble' | 'drool' | 'aura';

export interface AbilityDef {
  kind: AbilityKind;
  name: string;
  cooldown: number;
  // One short line (roster detail, tooltips).
  text: string;
  /** Overrides of the kind's TUNING.abilities numbers (1:1 signatures, and the free Snare, Shell and Rush). */
  seconds?: number;
  amount?: number;
  radius?: number;
  armor?: number;
  allies?: boolean;
  windup?: number;
  armorPen?: number;
  length?: number;
  /** 1:1 signatures: what both sides see and hear first, and how to beat it. */
  telegraph?: string;
  counter?: string;
  /** CHOG superpower slot: which power and the rank it plays at (the token's verified tier). */
  power?: 'laser' | 'xray' | 'visor' | 'bubble' | 'drool' | 'aura';
  rank?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

/** Five combat departments (owner 2026-10-14): how a character fights, never a stat bonus on its own. */
export type Department = 'assault' | 'tank' | 'sniper' | 'flanker' | 'bruiser';
export const DEPARTMENTS: Record<Department, string> = { assault: 'Assault', tank: 'Tank', sniper: 'Sniper', flanker: 'Flanker', bruiser: 'Bruiser' };

export interface HeroDef {
  id: string;
  name: string;
  dept: Department;
  /** Shown label of the department. */
  role: string;
  weapon: string;
  /** Owner 2026-10-18 (IDENTITY + MAPS pass): every operator plays at 150 (the free baseline); departments differ by
   * armour, speed, sight and weapon. A verified Chog without a superpower plays at 200 (src/config/power.ts). */
  maxHp: number;
  maxArmor: number;
  // Share of base run speed. Heroes trade speed against health and armour.
  speed: number;
  vision: { range: number; coneDeg: number };
  ability: AbilityDef;
  // Accent colour on the body ring (team colour stays the same for all player heroes).
  accent: number;
}

export const ABILITIES: Record<'dash' | 'sonar' | 'barrier' | 'mend', AbilityDef> = {
  dash: { kind: 'dash', name: 'Slip', cooldown: 6, text: 'Quick quiet dash.' },
  sonar: { kind: 'sonar', name: 'Ping', cooldown: 14, text: 'Reveals hostiles within 14 m for 2.5 s. They hear it.' },
  barrier: { kind: 'barrier', name: 'Slab', cooldown: 16, text: 'Waist-high cover for 12 s. Stops bullets, not sight.' },
  mend: { kind: 'mend', name: 'Patch', cooldown: 18, text: '+35 health.' },
};

// The free roster's abilities (docs/design/roster-grenades.md). The last three reuse signature kinds with smaller
// numbers than the 1:1 versions (Snare < Howl, Shell < Gold Shell, Rush < Red Rush), so the 1:1s stay on top.
const SNARE: AbilityDef = { kind: 'scream', name: 'Snare', cooldown: 16, radius: 4, seconds: 2, amount: 0.6, text: 'Slows hostiles within 4 m you can see, 2 s.' };
const SHELL: AbilityDef = { kind: 'shield', name: 'Shell', cooldown: 16, seconds: 1, text: 'Untouchable for 1 s. Cannot shoot.' };
const RUSH: AbilityDef = { kind: 'frenzy', name: 'Rush', cooldown: 18, seconds: 3, amount: 1.2, text: '+20% damage for 3 s.' };

/**
 * The free roster (owner 2026-10-14): seven characters, five departments. Abilities are scrambled on purpose: each
 * covers part of its weapon's weakness, never all of it. Bots (hostiles and AI teammates) use the same entries.
 * Not NFT related: holders pick from this roster too; their Chog adds tier power and grenade capacity on top.
 */
export const HEROES: HeroDef[] = [
  { id: 'benja', name: 'Benja', dept: 'assault', role: 'Assault', weapon: 'rifle', maxHp: 150, maxArmor: 15, speed: 1,
    vision: { range: 9, coneDeg: 70 }, ability: ABILITIES.sonar, accent: 0x9fb39a },
  // CF: armour 45 -> 55. The tank was the weakest solo hero before CF (2 of 40 autopilot wins) and 1 of 40 after the
  // tighter map and better hearing; 55 gives 3-4 of 40 on two seed sets.
  { id: 'toad', name: 'Toad', dept: 'tank', role: 'Tank', weapon: 'lmg', maxHp: 150, maxArmor: 55, speed: 0.92,
    vision: { range: 8, coneDeg: 72 }, ability: { ...ABILITIES.dash, cooldown: 8 }, accent: 0x7fae7a },
  // CF: cone 46 -> 52. The steady lamp narrows it by 15% (44 deg), and in the darker CF map with its lanes broken the
  // 46 deg sniper won 1 of 40 solo autopilot runs (11 before CF); 52 gives 2. Still the narrowest, longest lamp.
  { id: 'ray', name: 'Ray', dept: 'sniper', role: 'Sniper', weapon: 'marksman', maxHp: 150, maxArmor: 15, speed: 0.95,
    vision: { range: 12, coneDeg: 52 }, ability: SNARE, accent: 0x93a0b4 },
  { id: 'tabsu', name: 'Tabsu', dept: 'flanker', role: 'Flanker', weapon: 'smg', maxHp: 150, maxArmor: 0, speed: 1.1,
    vision: { range: 8, coneDeg: 85 }, ability: SHELL, accent: 0xc9b37a },
  { id: 'tonashiro', name: 'Tonashiro', dept: 'bruiser', role: 'Bruiser', weapon: 'shotgun', maxHp: 150, maxArmor: 40, speed: 0.95,
    vision: { range: 7.5, coneDeg: 80 }, ability: ABILITIES.mend, accent: 0xa58f84 },
  { id: 'yot', name: 'Yot', dept: 'assault', role: 'Assault', weapon: 'carbine', maxHp: 150, maxArmor: 25, speed: 1,
    vision: { range: 9, coneDeg: 64 }, ability: ABILITIES.barrier, accent: 0xb59ad0 },
  { id: 'bill', name: 'Bill', dept: 'flanker', role: 'Flanker', weapon: 'sawnoff', maxHp: 150, maxArmor: 10, speed: 1.08,
    vision: { range: 7.5, coneDeg: 90 }, ability: RUSH, accent: 0xd08f7a },
];

/** Hero ids from before the free roster (records stored on accounts still carry them). */
export const LEGACY_HERO: Readonly<Record<string, string>> = { kettle: 'benja', mop: 'tabsu', brick: 'toad', wick: 'ray' };

/** A current roster id for any stored or received id (old ids map to their replacement), or null if unknown. */
export function heroIdOf(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const v = LEGACY_HERO[id] ?? id;
  return HEROES.some((h) => h.id === v) ? v : null;
}

/**
 * The default game's two AI teammates for a player on `heroId`: roster characters from departments other than the
 * player's and each other's, named by their character, rotating with the run so the squad changes between rooms.
 */
export function squadFor(heroId: string, run = 0): { name: string; hero: string }[] {
  const i = Math.max(0, HEROES.findIndex((h) => h.id === heroId));
  const used = new Set([HEROES[i].dept]);
  const out: { name: string; hero: string }[] = [];
  for (let k = 1; k < HEROES.length * 2 && out.length < 2; k++) {
    const h = HEROES[(i + k + run * 2) % HEROES.length];
    if (h.id === HEROES[i].id || used.has(h.dept)) continue;
    used.add(h.dept);
    out.push({ name: h.name, hero: h.id });
  }
  return out;
}

export function heroById(id: string): HeroDef {
  const h = HEROES.find((x) => x.id === (LEGACY_HERO[id] ?? id));
  if (!h) throw new Error(`Unknown hero "${id}"`);
  return h;
}
