// CHOG: ROOM ZERO game library: every number in the library comes from here, and everything here is IMPORTED from the
// game's own config (src/config/*, src/ui/medals.ts), so the docs cannot drift from the game. The few numbers that live
// in server code (server/room.ts, src/net/client.ts, src/input/input.ts) are copied below with their source, and
// tests/library-data.test.ts reads those files to prove each copy still matches. Build time only: nothing here ships
// in the library's browser bundle (pages are prerendered by vite.library.config.ts).
import { TUNING } from '../config/tuning';
import { WEAPONS, damageAt, type WeaponDef } from '../config/weapons';
import { HEROES, ABILITIES, DEPARTMENTS, type HeroDef, type AbilityDef } from '../config/heroes';
import { SUPERPOWERS, SUPERPOWER_IDS, RANKS, BEAM, ORB } from '../config/superpowers';
import { GRENADES, BASE_HP, UPGRADES, UPGRADE_IDS, CAPS, TIERS, TIER_DEFS } from '../config/power';
import { REWARDS, PRACTICE_REWARDS, PRACTICE_SHARDS_PER_DAY, RATING, xpForNext, rewardBreakdown } from '../config/progression';
import { PERKS, PERK_IDS } from '../config/perks';
import { MAPS, MAP_IDS, type MapId } from '../config/maps';
import { MEDALS } from '../ui/medals';

export { TUNING, WEAPONS, HEROES, ABILITIES, DEPARTMENTS, SUPERPOWERS, SUPERPOWER_IDS, RANKS, BEAM, ORB, GRENADES, BASE_HP, UPGRADES, UPGRADE_IDS, CAPS, TIERS, TIER_DEFS, REWARDS, PRACTICE_REWARDS, PRACTICE_SHARDS_PER_DAY, RATING, xpForNext, rewardBreakdown, PERKS, PERK_IDS, MAPS, MAP_IDS, MEDALS, damageAt };
export type { MapId, WeaponDef, HeroDef, AbilityDef };

/** Copied from server/room.ts (Lobby defaults, squads) and src/net/client.ts; tests/library-data.test.ts checks each. */
export const SERVER = {
  queueTimeoutSec: 90,
  reconnectGraceSec: 20,
  idleTimeoutSec: 10,
  matchLimitSec: 240,
  countdownSec: 3,
  /** Snapshots every 3 sim steps of 60 Hz = 20 a second. */
  snapEvery: 3,
  squadMax: 5,
  squadCodeLength: 5,
  squadAlphabet: '23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
  /** src/net/client.ts: a dropped match connection retries for 20 s. */
  clientRetrySec: 20,
} as const;

/** Copied from src/input/input.ts; checked by tests/library-data.test.ts. */
export const INPUT = { aimDeadzone: 0.35, stickRadiusPx: 56 } as const;

/** Team sizes per online mode (src/net/protocol.ts MODE_SIZE, players in the room). */
export const MODES = [
  { id: 'solo', label: 'Vs bots', sub: 'You + 2 AI', players: 'You and 2 AI teammates against 5 hostile bots', online: false, holders: false },
  { id: '1v1', label: '1v1', sub: 'Online', players: '2 players, one each side', online: true, holders: false },
  { id: '3v3', label: '3v3', sub: 'Online', players: '6 players, three each side', online: true, holders: false },
  { id: '5v5', label: '5v5', sub: 'Holders', players: '10 players, five each side; every player a verified Chog holder', online: true, holders: true },
] as const;

/** Hostile bots in a solo room (the location's bot spawns). */
export const soloHostiles = (id: MapId) => MAPS[id].botSpawns.length;

const ABILITY_NUMBERS = TUNING.abilities;

/** One operator's ability, with every number it uses, read from the hero entry and TUNING.abilities. */
export function abilityFacts(a: AbilityDef): { name: string; cooldown: number; text: string; numbers: [string, string][] } {
  const n: [string, string][] = [['Cooldown', `${a.cooldown} s`]];
  switch (a.kind) {
    case 'sonar': n.push(['Reveal radius', `${ABILITY_NUMBERS.sonarRadius} m`], ['Reveal time', `${ABILITY_NUMBERS.sonarSeconds} s`], ['Ping heard within', `${ABILITY_NUMBERS.sonarSound} m`]); break;
    case 'dash': n.push(['Dash', `${ABILITY_NUMBERS.dashSeconds} s at ${ABILITY_NUMBERS.dashSpeed} m/s (about ${(ABILITY_NUMBERS.dashSeconds * ABILITY_NUMBERS.dashSpeed).toFixed(1)} m)`]); break;
    case 'barrier': n.push(['Slab', `${ABILITY_NUMBERS.barrierLength} x ${ABILITY_NUMBERS.barrierDepth} m, placed ahead of you`], ['Lasts', `${ABILITY_NUMBERS.barrierSeconds} s`]); break;
    case 'mend': n.push(['Heals', `+${ABILITY_NUMBERS.mendAmount} health`]); break;
    case 'scream': n.push(['Radius', `${a.radius} m`], ['Slow lasts', `${a.seconds} s`]); break;
    case 'shield': n.push(['Untouchable for', `${a.seconds} s (cannot shoot)`]); break;
    case 'frenzy': n.push(['Damage', `+${Math.round(((a.amount ?? 1) - 1) * 100)}%`], ['Lasts', `${a.seconds} s`]); break;
    default: break;
  }
  return { name: a.name, cooldown: a.cooldown, text: a.text, numbers: n };
}

/** Weapon numbers a player can use, plus clearly derived figures (no measured play claims). */
export function weaponFacts(w: WeaponDef) {
  const perPull = w.damage * w.pellets * (w.burst ?? 1);
  const cycle = w.fireInterval;
  return {
    ...w,
    perPull,
    /** Rounds-per-second style figure from the fire interval: pulls per second x damage per pull, at close range, every pellet hitting. */
    dpsClose: Math.round(perPull / cycle),
    /** Full-health, no-armour operator (150): trigger pulls needed when every pellet hits at close range. */
    pullsToDown: Math.ceil(BASE_HP.free / perPull),
    farDamage: +(w.damage * w.minDamageMul).toFixed(1),
  };
}

/** Speeds in m/s: run, creep (Shift), and per operator. */
export const SPEED = {
  run: TUNING.movement.maxSpeed,
  creepShare: TUNING.movement.quietSpeedScale,
  creep: +(TUNING.movement.maxSpeed * TUNING.movement.quietSpeedScale).toFixed(2),
  stairsShare: TUNING.movement.stairsMul,
  steadySpeed: TUNING.movement.steadySpeed,
  steadySeconds: TUNING.movement.steadySeconds,
};

/** Armour rule (src/sim/world.ts mitigate): armour soaks this share of each hit, less the weapon's armour pen. */
export function mitigate(armor: number, damage: number, armorPen: number): { hp: number; armor: number } {
  const soak = Math.min(armor, damage * TUNING.combat.armorSoak * (1 - armorPen));
  return { hp: damage - soak, armor: soak };
}

export const heroWeapon = (h: HeroDef) => WEAPONS[h.weapon];
