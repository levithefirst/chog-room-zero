// Hero archetypes. Adding a hero means adding an entry here: weapon, body, vision, one ability.
// Bots use the same entries. Names are original to this game.
export type AbilityKind = 'dash' | 'sonar' | 'barrier' | 'mend';

export interface AbilityDef {
  kind: AbilityKind;
  name: string;
  cooldown: number;
  // Plain description shown on hero select.
  text: string;
}

export interface HeroDef {
  id: string;
  name: string;
  role: string;
  blurb: string;
  weapon: string;
  maxHp: number;
  maxArmor: number;
  // Share of base run speed. Heroes trade speed against health and armour.
  speed: number;
  vision: { range: number; coneDeg: number };
  ability: AbilityDef;
  // Accent colour on the body ring (team colour stays the same for all player heroes).
  accent: number;
}

export const ABILITIES: Record<AbilityKind, AbilityDef> = {
  dash: { kind: 'dash', name: 'Slip', cooldown: 6, text: 'Short burst of speed in the move direction. Quiet.' },
  sonar: { kind: 'sonar', name: 'Ping', cooldown: 14, text: 'Shows every hostile within 14 m for 2.5 s. They hear the ping.' },
  barrier: { kind: 'barrier', name: 'Slab', cooldown: 16, text: 'Drops a waist-high slab ahead for 12 s. Stops bullets, not sight.' },
  mend: { kind: 'mend', name: 'Patch', cooldown: 18, text: 'Restores 35 health at once.' },
};

export const HEROES: HeroDef[] = [
  {
    id: 'kettle', name: 'Kettle', role: 'Rifle', blurb: 'Steady all-rounder. Patches up between fights.',
    weapon: 'rifle', maxHp: 100, maxArmor: 25, speed: 1, vision: { range: 9, coneDeg: 70 }, ability: ABILITIES.mend, accent: 0x9fb39a,
  },
  {
    id: 'mop', name: 'Mop', role: 'Runner', blurb: 'Fast and fragile. Gets in close and slips out.',
    weapon: 'smg', maxHp: 85, maxArmor: 0, speed: 1.1, vision: { range: 8, coneDeg: 85 }, ability: ABILITIES.dash, accent: 0xc9b37a,
  },
  {
    id: 'brick', name: 'Brick', role: 'Holder', blurb: 'Slow and heavy. Owns doorways and builds its own cover.',
    weapon: 'shotgun', maxHp: 120, maxArmor: 50, speed: 0.9, vision: { range: 7.5, coneDeg: 80 }, ability: ABILITIES.barrier, accent: 0xa58f84,
  },
  {
    id: 'wick', name: 'Wick', role: 'Lane', blurb: 'Long narrow sight. Finds them first and owns the long lanes.',
    weapon: 'marksman', maxHp: 85, maxArmor: 15, speed: 0.95, vision: { range: 12, coneDeg: 48 }, ability: ABILITIES.sonar, accent: 0x93a0b4,
  },
];

export function heroById(id: string): HeroDef {
  const h = HEROES.find((x) => x.id === id);
  if (!h) throw new Error(`Unknown hero "${id}"`);
  return h;
}
