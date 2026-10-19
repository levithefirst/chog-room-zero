// The match simulation. Deterministic: fixed step, seeded random, no wall-clock time, no rendering.
import { TUNING } from '../config/tuning';
import { BOT_SPAWNS, BOT_SPAWNS_RC8, ROOM_ZERO_RC8, VERSUS_SPAWNS, ZONE_CENTRES, type BotSpawn } from '../config/map';
import { layoutPickups, respawnSpot, walkField, zoneSpots, type Field, type PickupZone, type Spot } from './pickups';
import { spawnPerk, type PerkId } from '../config/perks';
import { heroById, type AbilityDef, type HeroDef } from '../config/heroes';
import { BASE_POWER, type Power } from '../config/power';
import { WEAPONS, damageAt, type WeaponDef } from '../config/weapons';
import { angleDiff, cornerAssistDir, resolveCircle, segmentBoxT, segmentCircleT, type Box } from './geom';
import { WALL, blockedByCover, bulletBlockT, markDynamic, parseLevel, shotClear, sightClear, tileAt, walkable, type Level } from './level';
import { stepVelocity, type Vec2 } from './sim';
import { NO_SIDEGRADE, type Sidegrade } from './operators';
import type { ViewShape } from './vision';
import { botThink, createBrain, type Brain, type PerceptionEvent } from './bots';
import { outsideCircle, planZone, zoneAt, type ZoneState } from './zone';
import { LAB } from '../config/lab';
import { MAPS, type MapDef, type MapId } from '../config/maps';
import { BEAM, ORB } from '../config/superpowers';

const DEG = Math.PI / 180;

/** 'player' and 'bot' in solo play; 'alpha' and 'bravo' are the two human teams of an online match (RC-8). */
export type Team = 'player' | 'bot' | 'alpha' | 'bravo';

/** Driven by a person (solo player or an online client), not by a bot brain. AI teammates are on the player's team
 * but still bots (Actor.ai). */
export const isHuman = (a: { ai: boolean }) => !a.ai;

export interface ActorInput {
  moveX: number;
  moveY: number;
  quiet: boolean;
  aim: number;
  firing: boolean;
  reload: boolean;
  ability: boolean;
  /** Throw a grenade this step (edge: one throw per press). */
  grenade?: boolean;
  /** How far to throw it, in u (clamped to TUNING.grenade minThrow..maxThrow); unset = the touch default. */
  throwDist?: number;
  /** Which way to throw it (a touch drag on the grenade button, CF); unset = along the aim. */
  throwAim?: number;
}

export interface Actor {
  id: number;
  team: Team;
  /** Driven by a bot brain: every 'bot' and the solo player's AI teammates. */
  ai: boolean;
  name: string;
  hero: HeroDef;
  /** The one ability slot: the hero's ability, or a 1:1 signature (src/config/power.ts). */
  ability: AbilityDef;
  /** Tier power (free, holder tier, demo). Applied once at spawn, except damageMul which applies per hit. */
  power: Power;
  weapon: WeaponDef;
  /** What this actor sees right now: baseView reshaped by its gait (CF-E, TUNING.vision focus*). */
  view: ViewShape;
  /** The hero's own view shape (with sidegrade), before gait. */
  baseView: ViewShape;
  /** Gait focus -1 (running: wide, short lamp) .. 0 (creep) .. 1 (steady: narrow, long lamp). Eased. */
  focus: number;
  /** Seconds below TUNING.movement.steadySpeed (STEADY once >= steadySeconds). */
  stillFor: number;
  /** Radians between where the body faces and where the player aims (CF-A turn lag). */
  aimLag: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  alive: boolean;
  ammo: number;
  reserve: number;
  cooldown: number;
  reloadLeft: number;
  abilityCd: number;
  dashLeft: number;
  dashX: number;
  dashY: number;
  revealLeft: number;
  /** Signature effect timers (seconds left). */
  shieldLeft: number;
  frenzyLeft: number;
  slowLeft: number;
  slowMul: number;
  /** Burst wind-up: seconds until it goes off (0 = none pending). */
  burstLeft: number;
  stepAcc: number;
  // Presentation timers, counted in sim time so replays look the same.
  hitFlash: number;
  muzzle: number;
  deadFor: number;
  lastSpread: number;
  lastHitTick: number;
  lastHitFrom: Vec2 | null;
  /** Trigger pulls. */
  shots: number;
  /** Bullets fired: shots x pellets (the shotgun fires 8 per shot). Accuracy is hits / bullets. */
  bullets: number;
  /** Bullets that hit an actor. */
  hits: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  /** How this actor went down (RC-8: every actor, so an online client can show its own death). */
  death: KillInfo | null;
  /** Tick of the last danger-zone damage (client feedback). */
  zoneTick: number;
  /** Team modes: down but not out (TUNING.revive). hp is then the bleed-out pool, not health. */
  downed: boolean;
  /** Revive progress in seconds (0 when nobody is reviving). */
  reviveProgress: number;
  /** Who downed this actor, so the kill goes to them if nobody rescues it. */
  downInfo: KillInfo | null;
  /** Held the trigger on the last step it acted (a rescuer must hold fire). */
  firedLast: boolean;
  /** Grenades left and the most this actor can carry (its tier's capacity, src/config/power.ts GRENADES). */
  grenades: number;
  maxGrenades: number;
  /** Seconds until it may throw again. */
  nadeCd: number;
  /** Grenades thrown this match. */
  thrown: number;
  /** Burst weapons: rounds still to fire in the current burst, and seconds until the next one. */
  volley: number;
  volleyGap: number;
  /** GP: a trigger pull made while the body was still turning, kept this many seconds until it lines up (a tap is
   * one step long and would otherwise be lost). */
  fireQueued: number;
  /** GP: teammates this actor got up, times it was got up, loot bags it took from (results, medals). */
  revives: number;
  revived: number;
  loots: number;
  /** V2 perk (src/config/perks.ts): one slot, match only. */
  perk: PerkId | null;
  /** V2 Marker: seconds this actor stays shown to markTeam after a Marker hit. */
  markLeft: number;
  markTeam: Team | null;
  /** V2: seconds standing still on a bag holding a different perk (swap at TUNING.perks.swapSeconds). */
  bagStill: number;
  /** CHOG superpowers (src/config/superpowers.ts). Laser / X-Ray: charge seconds, then beam seconds, the beam's angle
   * (it follows the aim at BEAM.turnDegPerSec), and time to its next damage pulse. */
  chargeLeft: number;
  beamLeft: number;
  beamAng: number;
  beamPulse: number;
  /** Caged by a Bubble: seconds left and the cage (centre, radius). */
  trapLeft: number;
  trapX: number;
  trapY: number;
  trapR: number;
  /** Glued by Drool: seconds left, and the wall spot the goo drags it to. */
  pinLeft: number;
  pinX: number;
  pinY: number;
  /** Aura: untouchable seconds left (cannot shoot or throw meanwhile). */
  auraLeft: number;
  /** Steps since the ability button was last down (Aura drops early on a fresh press after a real release: online,
   * a held button reaches the server as a press every other step, so a gap shorter than ABILITY_RELEASE is no release). */
  abilityOff: number;
}

/** A Bubble or Drool glob in flight: a slow, visible projectile that walls and cover stop. */
export interface Orb {
  id: number;
  kind: 'bubble' | 'drool';
  x: number;
  y: number;
  dx: number;
  dy: number;
  ox: number;
  oy: number;
  /** Seconds of flight left (its reach). */
  left: number;
  owner: number;
  team: Team;
  alive: boolean;
}

/** A thrown grenade: rolls to rest, bounces off walls, flies over waist-high cover, explodes when the fuse ends. */
export interface Grenade {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds until it explodes. */
  fuse: number;
  owner: number;
  team: Team;
  alive: boolean;
}

export interface Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  ox: number;
  oy: number;
  life: number;
  owner: number;
  weapon: WeaponDef;
  alive: boolean;
  /** The shooter's damage bonus when it fired (Rush, Red Rush): a bullet keeps it in flight. Absent: 1. */
  mul?: number;
}

export type SoundType =
  | 'step' | 'quietStep' | 'shot' | 'impact' | 'hit' | 'death' | 'reload' | 'pickup' | 'dash' | 'sonar' | 'barrier' | 'mend'
  | 'windup' | 'burst' | 'scream' | 'shield' | 'frenzy' | 'downed' | 'revive' | 'throw' | 'bounce' | 'boom'
  // CHOG superpowers: beam charge and fire, a bubble or goo launched, someone caged or glued, an aura raised.
  | 'charge' | 'beam' | 'orb' | 'caged' | 'pinned' | 'aura';

/** The one sound event bus: feeds audio, bot hearing, and the player's heard markers. */
export interface SoundEvent {
  type: SoundType;
  x: number;
  y: number;
  radius: number;
  sourceId: number;
  team: Team;
  tick: number;
  // Which gun, for shot sounds.
  weapon?: string;
  // Impact on half cover (crate/slab) rather than a wall.
  blocked?: boolean;
  // A 1:1 signature use: the token's metadata id, so audio and the telegraph ring use that Chog's own cue.
  sig?: number;
  // Online: the server sent what hearing it tells this player (a 'clear' line spot, or through a 'wall' a bearing
  // and distance band), not the source's spot. The client uses it as is (no second blur).
  est?: 'clear' | 'wall';
  // GP: a 'pickup' sound from a loot bag carries the bag's id (the client words what was taken).
  loot?: number;
}

export interface HitEvent {
  target: number;
  by: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  hpDamage: number;
  armorDamage: number;
  killed: boolean;
  /** Team modes: this hit downed the target (not out yet). */
  downed?: boolean;
  /** A grenade blast (from = the blast, not the thrower, who may be behind a wall). */
  grenade?: boolean;
  /** A superpower beam or glob (online, its owner is not told where an unseen target is). */
  power?: boolean;
}

export interface KillInfo {
  /** 'shot': killed by `killerId`'s bullet. 'zone': the danger zone. 'left': an online player who did not come back.
   * For 'zone' and 'left' killerId is -1 and from = where the actor stood. */
  cause: 'shot' | 'zone' | 'left';
  killerId: number;
  weapon: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  tick: number;
}

/**
 * An AI teammate's call-out (SB): a short report of what IT perceives, at the spot it believes. The UI words it
 * ("Contact, north"), the player's contact intel and the other AI teammates use it. Never carries what the caller does
 * not know: x/y are the caller's own belief (a sighting is exact, a heard guess carries the caller's error).
 */
export type CommsKind = 'contact' | 'behind' | 'lost' | 'steps' | 'shots' | 'reloading' | 'hurt' | 'reviving' | 'supply';
export interface CommsEvent {
  from: number;
  kind: CommsKind;
  /** The hostile it is about (-1 for reloading / hurt), and where the caller believes it is. */
  target: number;
  x: number;
  y: number;
  /** Lost: which way it was heading when the caller last saw it. */
  heading?: number;
  /** How far off the caller's own belief may be (0 = it saw it). */
  r: number;
  tick: number;
  /** GP 'supply': what it is going for ('loot', 'ammo', ...). */
  what?: string;
}

export type PickupKind = 'health' | 'armor' | 'ammo' | 'grenade';

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  active: boolean;
  respawnLeft: number;
  /** Its zone in w.pickupSpots (-1: a fixed spawn from the map characters), and how many times it has moved. */
  zone: number;
  moves: number;
}

/**
 * GP kill loot (owner 2026-10-17: "killing opponents should produce loot"). What an eliminated actor was carrying,
 * dropped where it fell: its rounds (kept as a share of its own magazine, so any gun can take them), its grenades, the
 * armour left on it, and the field dressing everyone carries (TUNING.loot.dressing, never used by its owner). Nothing
 * is made up: a bag only holds what the actor had, and every take moves it out of the bag. Gone after TUNING.loot.seconds
 * or once empty. The sim (on the game server online) decides all of it; clients only draw it.
 */
export interface Loot {
  id: number;
  x: number;
  y: number;
  /** Rounds as magazines of the dropper's gun (0.5 = half a magazine), health, armour, grenades still in the bag. */
  mags: number;
  health: number;
  armor: number;
  grenades: number;
  /** V2: the perk the fallen carried, if any (taken into an empty slot, or swapped by standing on the bag). */
  perk: PerkId | null;
  /** Seconds until it is gone. */
  left: number;
  /** Who dropped it and their team. */
  from: number;
  team: Team;
  /** Teams that know it is there: the killer's and the dropper's, and any team that has since had it in sight (AI
   * teammates only go for loot their team knows about). */
  known: Team[];
}

export interface Barrier {
  box: Box;
  left: number;
  owner: number;
}

export interface World {
  tick: number;
  rng: number;
  level: Level;
  actors: Actor[];
  bullets: Bullet[];
  grenades: Grenade[];
  /** CHOG superpower globs in flight, and the next orb id. */
  orbs: Orb[];
  orbSeq: number;
  /** Next grenade id (online clients match grenades across snapshots by it). */
  nadeSeq: number;
  sounds: SoundEvent[];
  prevSounds: SoundEvent[];
  /** AI teammates' call-outs this step, and the last step's (what the squad heard said). */
  comms: CommsEvent[];
  prevComms: CommsEvent[];
  /** Sim seconds of the last call-out (one voice at a time, TUNING.comms.gap). */
  commsAt: number;
  hits: HitEvent[];
  pickups: Pickup[];
  /** Open tiles of each pickup zone (src/sim/pickups.ts), the layout seed, and a counter that rises when one moves. */
  pickupSpots: Spot[][];
  pickupSeed: number;
  pickupRev: number;
  /** Walking distance from the west and east online spawns (pickups stay even for both sides), or null. */
  pickupFields: { alpha: Field; bravo: Field } | null;
  barriers: Barrier[];
  /** GP: dropped kit of eliminated actors (Loot), and the next loot id. */
  loot: Loot[];
  lootSeq: number;
  /** V2 telemetry: bags that ran out with something still in them. */
  lootExpired: number;
  brains: Map<number, Brain>;
  /** Ids of bots currently allowed to shoot at the player (cap: TUNING.perception.attackTokens). */
  attackTokens: number[];
  /** Owner 2026-10-17 ("enemy teams must be active"): the hostile squad plans its own moves (src/sim/bots.ts squad
   * layer) between these tactical points. On for the real game; off when a test passes its own bots. */
  squadAI: boolean;
  squadPoints: { x: number; y: number }[];
  /** When enabled (createWorld({ log: true })), every time a bot learns a player position, with its signal. */
  perceptionLog: PerceptionEvent[] | null;
  outcome: 'playing' | 'dead' | 'won';
  playerKill: KillInfo | null;
  /** 'solo': one player (actor 0) against bots. 'versus': human teams only (online, server-run). */
  mode: 'solo' | 'versus';
  /** Online: the team left standing when the match ended; null for a draw or in solo. */
  winner: Team | null;
  /** Bullets hit teammates. Off everywhere today (CHOG-AI-002); a server room may turn it on. */
  friendlyFire: boolean;
  /** Shrinking danger zone, or null when off (unit tests that isolate other rules). */
  zone: ZoneState | null;
  /** The location (src/config/maps.ts), or null for a test's own map. */
  mapId: MapId | null;
}

/** Mulberry32. Returns [0,1) and advances world.rng. */
export function rand(w: World): number {
  let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Hero weapon with the sidegrade applied. Damage is never changed. */
export function weaponFor(hero: HeroDef, sg: Sidegrade): WeaponDef {
  const base = WEAPONS[hero.weapon];
  return {
    ...base,
    magazine: Math.max(1, Math.round(base.magazine * sg.magMul)),
    reserve: Math.max(1, Math.round(base.reserve * sg.magMul)),
    fireInterval: base.fireInterval * sg.intervalMul,
    spreadDeg: base.spreadDeg * sg.spreadMul,
    reloadSeconds: base.reloadSeconds * sg.reloadMul,
  };
}

export function viewFor(hero: HeroDef, sg: Sidegrade): ViewShape {
  return { range: hero.vision.range * sg.rangeMul, coneRad: hero.vision.coneDeg * sg.coneMul * DEG, nearRadius: TUNING.vision.nearRadius };
}

function makeActor(id: number, team: Team, name: string, hero: HeroDef, sg: Sidegrade, x: number, y: number, facing: number, power: Power = BASE_POWER): Actor {
  const weapon = weaponFor(hero, sg);
  // One ability slot: a 1:1 signature, else a Chog superpower, else the hero's own ability.
  const ab = power.signature ?? power.superpower ?? hero.ability;
  // 150 for everyone (BASE_HP.free), 200 for a verified Chog without a superpower; Vitality upgrades on top.
  const maxHp = Math.round((power.baseHp ?? hero.maxHp) * power.hpMul);
  // Grenades: the tier's capacity (free 3 ... 1:1 13), never upgrades; hostile bots carry a fixed few (solo difficulty).
  const nades = team === 'bot' ? TUNING.grenade.botCount : power.grenades;
  return {
    id, team, ai: team === 'bot', name, hero, ability: { ...ab, cooldown: ab.cooldown * power.cooldownMul }, power, weapon, view: viewFor(hero, sg), baseView: viewFor(hero, sg),
    focus: 0, stillFor: 0, aimLag: 0, x, y, vx: 0, vy: 0, facing,
    hp: maxHp, maxHp, armor: hero.maxArmor + power.armor, maxArmor: Math.max(hero.maxArmor, TUNING.combat.armorCap) + power.armor, alive: true,
    ammo: weapon.magazine, reserve: weapon.reserve, cooldown: 0, reloadLeft: 0, abilityCd: 0, dashLeft: 0, dashX: 0, dashY: 0,
    revealLeft: 0, shieldLeft: 0, frenzyLeft: 0, slowLeft: 0, slowMul: 1, burstLeft: 0, stepAcc: 0, hitFlash: 0, muzzle: 0, deadFor: 0, lastSpread: weapon.spreadDeg, lastHitTick: -999, lastHitFrom: null,
    shots: 0, bullets: 0, hits: 0, kills: 0, damageDealt: 0, damageTaken: 0, death: null, zoneTick: -999,
    downed: false, reviveProgress: 0, downInfo: null, firedLast: false,
    grenades: nades, maxGrenades: nades, nadeCd: 0, thrown: 0, volley: 0, volleyGap: 0, fireQueued: 0, revives: 0, revived: 0, loots: 0,
    perk: null, markLeft: 0, markTeam: null, bagStill: 0,
    chargeLeft: 0, beamLeft: 0, beamAng: facing, beamPulse: 0, trapLeft: 0, trapX: 0, trapY: 0, trapR: 0, pinLeft: 0, pinX: 0, pinY: 0, auraLeft: 0, abilityOff: 0,
  };
}

export interface WorldOptions {
  seed?: number;
  hero?: string;
  sidegrade?: Sidegrade;
  /** Solo player's tier power (verified holder with NFT combat on, or labelled demo). Bots are always base power. */
  power?: Power;
  map?: readonly string[];
  bots?: BotSpawn[];
  log?: boolean;
  /** Danger zone on (the game and the server turn it on; most unit tests leave it off to isolate a rule). */
  zone?: boolean;
  /** Online match: these humans instead of the solo player and bots (actor ids follow the array order). */
  versus?: { name: string; hero: string; team: 'alpha' | 'bravo'; x: number; y: number; facing: number; power?: Power }[];
  /** Solo: AI teammates on the player's side (the default game: you + 2). Off by default so rule tests stay isolated. */
  allies?: { name: string; hero: string }[];
  friendlyFire?: boolean;
  /** Pickup zones to lay out (default: Room Zero's when the map is Room Zero; none for a given test map). */
  pickupZones?: PickupZone[];
  /** The hostile squad's own planning (default: on unless the test gives its own bots). */
  squadAI?: boolean;
  /** V2 perks at spawn: solo hostiles (default on unless the test gives its own bots); versus every player (default off;
   * the game server turns it on). */
  perks?: boolean;
  /** Which location (src/config/maps.ts): its tiles, pickups, hostile squad, zone centres and online spawns. Default:
   * Room Zero. Ignored when a test passes its own `map` rows. */
  mapId?: MapId;
}

/** The location a world is built on, or null for a test's own map (or the lab's RC-8 baseline). */
function mapDefOf(opts: WorldOptions): MapDef | null {
  if (opts.map !== undefined) return null;
  if (opts.mapId) return MAPS[opts.mapId];
  return LAB.pacing ? MAPS['room-zero'] : null;
}

export function createWorld(opts: WorldOptions = {}): World {
  const def = mapDefOf(opts);
  const level = parseLevel(opts.map ?? def?.rows ?? ROOM_ZERO_RC8);
  if (def) level.materials = def.materials;
  const mapId = def?.id ?? null;
  const seed = (opts.seed ?? TUNING.seed) | 0;
  const brains = new Map<number, Brain>();
  if (opts.versus) {
    const actors = opts.versus.map((v, i) => makeActor(i, v.team, v.name, heroById(v.hero), NO_SIDEGRADE, v.x, v.y, v.facing, v.power));
    if (opts.perks) for (const a of actors) a.perk = spawnPerk(seed, a.id);
    const spawns = (['alpha', 'bravo'] as const).map((t) => {
      const m = opts.versus!.filter((v) => v.team === t);
      return { x: m.reduce((a, v) => a + v.x, 0) / Math.max(1, m.length), y: m.reduce((a, v) => a + v.y, 0) / Math.max(1, m.length) };
    });
    return {
      tick: 0, rng: seed, level, actors, bullets: [], grenades: [], orbs: [], orbSeq: 0, nadeSeq: 0, sounds: [], prevSounds: [], comms: [], prevComms: [], commsAt: -1e9, hits: [],
      ...initPickups(level, seed, opts), barriers: [], loot: [], lootSeq: 0, lootExpired: 0,
      brains, attackTokens: [], squadAI: false, squadPoints: [], perceptionLog: null, outcome: 'playing', playerKill: null,
      mode: 'versus', winner: null, friendlyFire: !!opts.friendlyFire,
      zone: opts.zone === false ? null : planZone(level, seed, def?.zoneCentres ?? ZONE_CENTRES, TUNING.zone, spawns),
      mapId,
    };
  }
  const actors: Actor[] = [makeActor(0, 'player', 'You', heroById(opts.hero ?? 'benja'), opts.sidegrade ?? NO_SIDEGRADE, level.playerSpawn.x, level.playerSpawn.y, 0, opts.power)];
  // AI teammates spawn next to the player on free floor, in the same team, with their own bot brain.
  const ps = level.playerSpawn;
  const spots = [[1, 1], [1, -1], [-1, 1], [2, 0], [0, 2], [-1, -1]].map(([dx, dy]) => ({ x: Math.floor(ps.x) + dx + 0.5, y: Math.floor(ps.y) + dy + 0.5 }))
    .filter((q) => walkable(level.tiles[Math.floor(q.y) * level.w + Math.floor(q.x)]));
  (opts.allies ?? []).forEach((m, i) => {
    const q = spots[i % Math.max(1, spots.length)] ?? ps;
    const a = makeActor(actors.length, 'player', m.name, heroById(m.hero), NO_SIDEGRADE, q.x, q.y, 0);
    a.ai = true;
    actors.push(a);
    brains.set(a.id, createBrain({ name: m.name, hero: m.hero, patrol: [[Math.floor(q.x), Math.floor(q.y)]], flanker: a.hero.dept === 'flanker' }));
  });
  (opts.bots ?? def?.botSpawns ?? (LAB.pacing ? BOT_SPAWNS : BOT_SPAWNS_RC8)).forEach((b) => {
    const [tx, ty] = b.patrol[0];
    const a = makeActor(actors.length, 'bot', b.name, heroById(b.hero), NO_SIDEGRADE, tx + 0.5, ty + 0.5, Math.PI);
    if (opts.perks ?? opts.bots === undefined) a.perk = spawnPerk(seed, a.id);
    actors.push(a);
    brains.set(a.id, createBrain(b));
  });
  return {
    tick: 0, rng: seed, level, actors, bullets: [], grenades: [], orbs: [], orbSeq: 0, nadeSeq: 0, sounds: [], prevSounds: [], comms: [], prevComms: [], commsAt: -1e9, hits: [],
    ...initPickups(level, seed, opts), barriers: [], loot: [], lootSeq: 0, lootExpired: 0,
    brains, attackTokens: [], perceptionLog: opts.log ? [] : null, outcome: 'playing', playerKill: null,
    // The lab's 'before' (LAB.pacing off: the RC-8 map and bots) keeps the RC-8 patrols, so it stays a fixed baseline.
    squadAI: opts.squadAI ?? (opts.bots === undefined && LAB.pacing),
    squadPoints: def?.tacticalPoints ? [...def.tacticalPoints] : derivePoints(level),
    mode: 'solo', winner: null, friendlyFire: !!opts.friendlyFire,
    zone: opts.zone ? planZone(level, seed, def?.zoneCentres ?? ZONE_CENTRES) : null,
    mapId,
  };
}

/** Tactical points for a map without hand-placed ones: open floor on a 7-tile grid (rooms and junctions). */
function derivePoints(level: Level): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let y = 3; y < level.h - 1; y += 7) for (let x = 3; x < level.w - 1; x += 7) {
    let open = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (walkable(level.tiles[(y + dy) * level.w + x + dx])) open++;
    if (open === 9) pts.push({ x: x + 0.5, y: y + 0.5 });
  }
  return pts;
}

/**
 * Pickups: the map's fixed ones (test and lab maps), plus Room Zero's zoned ones laid out from the seed. Spawn points
 * come from the map and the mode (never from the actors of this match), so the server and a client building the
 * same online match get the same layout.
 */
function initPickups(level: Level, seed: number, opts: WorldOptions): Pick<World, 'pickups' | 'pickupSpots' | 'pickupSeed' | 'pickupRev' | 'pickupFields'> {
  const fixed: Pickup[] = level.pickupSpawns.map((p) => ({ ...p, active: true, respawnLeft: 0, zone: -1, moves: 0 }));
  const def = mapDefOf(opts);
  const zones: PickupZone[] = opts.pickupZones ?? (def ? [...def.pickupZones] : []);
  if (!zones.length) return { pickups: fixed, pickupSpots: [], pickupSeed: seed, pickupRev: 0, pickupFields: null };
  // Online: both sides' spawns. Solo: yours (your teammates start beside you) and every bot's.
  const vs = def?.versusSpawns ?? VERSUS_SPAWNS;
  const spawns: Spot[] = opts.versus ? [...vs.alpha, ...vs.bravo]
    : [level.playerSpawn, ...(opts.bots ?? def?.botSpawns ?? (LAB.pacing ? BOT_SPAWNS : BOT_SPAWNS_RC8)).map((b) => ({ x: b.patrol[0][0] + 0.5, y: b.patrol[0][1] + 0.5 }))];
  const fields = { alpha: walkField(level, [...vs.alpha]), bravo: walkField(level, [...vs.bravo]) };
  // A zone with no tile left on this map (a foreign map) is skipped, never a crash.
  const all = zoneSpots(level, zones, spawns, fields);
  const keep = zones.map((_, i) => i).filter((i) => all[i].length > 0);
  const spots = keep.map((i) => all[i]);
  const at = layoutPickups(spots, keep.map((i) => zones[i].kind), seed, fields.alpha, fields.bravo);
  const zoned: Pickup[] = keep.map((zi, i) => ({ kind: zones[zi].kind, x: at[i].x, y: at[i].y, active: true, respawnLeft: 0, zone: i, moves: 0 }));
  return { pickups: [...fixed, ...zoned], pickupSpots: spots, pickupSeed: seed, pickupRev: 0, pickupFields: fields };
}

export function player(w: World): Actor {
  return w.actors[0];
}

/**
 * Fairness rule (RC-1, docs/design/bots.md): a bot may only damage the player from a spot the player could see,
 * i.e. within the PLAYER's effective sight distance (hero vision incl. NFT sidegrade) with wall line of sight.
 * A Wick bot's 12 m sight is its own; it must close to the player's range before it can shoot or hit.
 */
export function playerSightRange(w: World): number {
  // The hero's own sight, not the gait-shaped one (CF-E): running shortens your lamp, but it must never make you
  // immune to a bot that stands where your normal sight reaches (the muzzle flash still shows that shooter).
  return w.actors[0].baseView.range;
}

export function viewOf(a: Actor): ViewShape {
  return a.view;
}

/** Same hearing rule for bots and the player: within the radius, shrunk when a wall is in between. */
export function hears(l: Level, lx: number, ly: number, s: SoundEvent, wallFactor: number = TUNING.sound.wallFactor): boolean {
  const d = Math.hypot(s.x - lx, s.y - ly);
  if (d > s.radius) return false;
  return d <= s.radius * wallFactor || sightClear(l, lx, ly, s.x, s.y);
}

/** How far through a wall this listener hears (V2 Keen Ears: as far as in the open). Pass to hears(). */
export const wallFactorOf = (a: Actor): number => (a.perk === 'ears' ? TUNING.perks.earsWallFactor : TUNING.sound.wallFactor);

function emit(w: World, type: SoundType, x: number, y: number, radius: number, src: Actor, weapon?: string): void {
  w.sounds.push({ type, x, y, radius, sourceId: src.id, team: src.team, tick: w.tick, weapon });
}

/** An ability sound; a 1:1 signature carries its token id so every client plays that Chog's own cue and ring colour. */
function emitAbility(w: World, type: SoundType, x: number, y: number, radius: number, a: Actor): void {
  emit(w, type, x, y, radius, a);
  if (a.power.signature && a.power.metadataId) w.sounds[w.sounds.length - 1].sig = a.power.metadataId;
}

/**
 * Armour RULE: armour soaks `armorSoak` (60%) of each hit, reduced by the weapon's armour-pen share, until the
 * armour pool runs out. The rest goes to health. Pure, so it is tested directly.
 */
export function mitigate(armor: number, damage: number, armorPen: number): { hp: number; armor: number } {
  const soak = Math.min(armor, damage * TUNING.combat.armorSoak * (1 - armorPen));
  return { hp: damage - soak, armor: soak };
}

/** Steps the ability button must be up before a new press counts as a fresh one (about 67 ms). */
const ABILITY_RELEASE = 4;

/** Gold Shell, Shell or Aura: bullets, blasts, beams and globs do nothing, and it cannot shoot or throw. */
export const untouchable = (a: Actor) => a.shieldLeft > 0 || a.auraLeft > 0;

export const IDLE_INPUT: ActorInput = { moveX: 0, moveY: 0, quiet: false, aim: 0, firing: false, reload: false, ability: false, grenade: false };

const vel: Vec2 = { x: 0, y: 0 };
const move: Vec2 = { x: 0, y: 0 };
// Reused per-actor movement tuning (hero speed scales maxSpeed) so the step allocates nothing.
const moveTuning = { ...TUNING.movement, maxSpeed: TUNING.movement.maxSpeed as number };

function startReload(w: World, a: Actor): void {
  if (a.reloadLeft > 0 || a.ammo >= a.weapon.magazine || a.reserve <= 0) return;
  a.reloadLeft = a.weapon.reloadSeconds;
  a.volley = 0;
  emit(w, 'reload', a.x, a.y, TUNING.sound.reload, a);
}

function useAbility(w: World, a: Actor, inp: ActorInput): void {
  const A = TUNING.abilities;
  const ab = a.ability;
  // Visor is passive (always on): the button does nothing and costs nothing.
  if (ab.kind === 'visor') return;
  const slab = ab.kind === 'barrier' ? slabBox(w, a) : null;
  // A slab that does not fit (facing a wall, or across someone) is not placed and costs nothing.
  if (ab.kind === 'barrier' && !slab) return;
  a.abilityCd = ab.cooldown;
  switch (ab.kind) {
    case 'dash': {
      let dx = inp.moveX, dy = inp.moveY;
      const d = Math.hypot(dx, dy);
      if (d === 0) { dx = Math.cos(a.facing); dy = Math.sin(a.facing); } else { dx /= d; dy /= d; }
      a.dashLeft = ab.seconds ?? A.dashSeconds;
      a.dashX = dx;
      a.dashY = dy;
      emitAbility(w, 'dash', a.x, a.y, TUNING.sound.quietStep, a);
      break;
    }
    case 'sonar':
      a.revealLeft = ab.seconds ?? A.sonarSeconds;
      emitAbility(w, 'sonar', a.x, a.y, Math.max(A.sonarSound, ab.radius ?? 0), a);
      break;
    case 'barrier': {
      const box = slab!;
      w.barriers.push({ box, left: ab.seconds ?? A.barrierSeconds, owner: a.id });
      w.level.coverBoxes.push(box);
      w.level.solidBoxes.push(box);
      markDynamic(w.level, box, 1);
      invalidatePaths(w);
      emitAbility(w, 'barrier', (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, TUNING.sound.ability, a);
      break;
    }
    case 'mend': {
      const heal = (t: Actor) => {
        if (t.downed) return;
        t.hp = Math.max(t.hp, Math.min(t.maxHp, t.hp + (ab.amount ?? A.mendAmount)));
        if (ab.armor) t.armor = Math.max(t.armor, Math.min(t.maxArmor, t.armor + ab.armor));
      };
      heal(a);
      if (ab.allies) for (const t of w.actors) if (t !== a && t.alive && t.team === a.team && Math.hypot(t.x - a.x, t.y - a.y) <= (ab.radius ?? 0)) heal(t);
      emitAbility(w, 'mend', a.x, a.y, TUNING.sound.reload, a);
      break;
    }
    case 'burst':
      // Telegraph first: everyone in earshot hears the wind-up and sees the ring before it goes off (no surprise damage).
      a.burstLeft = ab.windup ?? 0.5;
      emitAbility(w, 'windup', a.x, a.y, TUNING.sound.ability, a);
      break;
    case 'scream':
      for (const t of hostilesInSight(w, a, ab.radius ?? 0)) { t.slowLeft = ab.seconds ?? 0; t.slowMul = ab.amount ?? 1; }
      emitAbility(w, 'scream', a.x, a.y, TUNING.sound.shot, a);
      break;
    case 'shield':
      a.shieldLeft = ab.seconds ?? 0;
      emitAbility(w, 'shield', a.x, a.y, TUNING.sound.ability, a);
      break;
    case 'frenzy':
      a.frenzyLeft = ab.seconds ?? 0;
      emitAbility(w, 'frenzy', a.x, a.y, TUNING.sound.ability, a);
      break;
    case 'laser':
    case 'xray':
      // Telegraph first: the charge line is drawn for everyone it points at before any damage.
      a.chargeLeft = ab.windup ?? 0.35;
      // Starts where you aim (not where the body has turned to yet), then follows the body at BEAM.turnDegPerSec.
      a.beamAng = inp.aim;
      emitAbility(w, 'charge', a.x, a.y, TUNING.sound.ability, a);
      break;
    case 'bubble':
    case 'drool': {
      const dx = Math.cos(inp.aim), dy = Math.sin(inp.aim);
      w.orbs.push({ id: w.orbSeq++, kind: ab.kind, x: a.x, y: a.y, dx, dy, ox: a.x, oy: a.y, left: (ab.radius ?? 8) / ORB.speed[ab.kind], owner: a.id, team: a.team, alive: true });
      emitAbility(w, 'orb', a.x, a.y, TUNING.sound.ability, a);
      break;
    }
    case 'aura':
      a.auraLeft = ab.seconds ?? 0;
      a.volley = 0;
      emitAbility(w, 'aura', a.x, a.y, TUNING.sound.shot, a);
      break;
  }
}

/**
 * Where a's beam stops this step: its reach along beamAng, cut short by the first wall or cover (Laser; leaning over
 * cover works as for bullets) and by the first body in the way. X-Ray passes walls and cover, never bodies. Shared by
 * the sim and the renderer (both sides draw the same beam).
 */
export function beamEnd(w: World, a: Actor): { x: number; y: number; target: Actor | null } {
  const reach = a.ability.radius ?? 9;
  const dx = Math.cos(a.beamAng), dy = Math.sin(a.beamAng);
  const ex = a.x + dx * reach, ey = a.y + dy * reach;
  let best = 1;
  if (a.ability.kind !== 'xray') {
    const t = bulletBlockT(w.level, a.x, a.y, a.x, a.y, ex, ey, false, TUNING.combat.coverLean);
    if (t >= 0 && t < best) best = t;
  }
  let target: Actor | null = null;
  for (const o of w.actors) {
    if (!o.alive || o === a || (o.team === a.team && !w.friendlyFire)) continue;
    const t = segmentCircleT(a.x, a.y, ex, ey, o.x, o.y, TUNING.movement.radius + BEAM.width);
    if (t >= 0 && t < best) { best = t; target = o; }
  }
  return { x: a.x + (ex - a.x) * best, y: a.y + (ey - a.y) * best, target };
}

/**
 * Visor (owner 2026-10-18 "VISOR -> HOSTILE TRACKER"): the hostiles within the holder's tracker radius, through walls,
 * while the holder is standing. Their positions only: the tracker shows dots, never bodies, health or what they carry.
 */
export function visorTracks(w: World, a: Actor): Actor[] {
  if (a.ability.kind !== 'visor' || !a.alive || a.downed) return [];
  const r = a.ability.radius ?? 16;
  return w.actors.filter((t) => t.alive && t.team !== a.team && Math.hypot(t.x - a.x, t.y - a.y) <= r);
}

/** Visor counterplay: a hostile Visor has t on its tracker right now (t is told). */
export const trackedBy = (w: World, t: Actor): boolean => w.actors.some((v) => v.team !== t.team && v.ability.kind === 'visor' && visorTracks(w, v).includes(t));

/**
 * The stretch of a hostile beam that a player is warned of when its owner is not shown to them: from 5 u before them
 * along the line (never nearer its owner than halfway) to 2 u past, only while the line passes within 1.5 u of them. null when it does not cross them. One
 * rule for the server's snapshot and for solo drawing (never where the owner stands).
 */
export function beamNear(w: World, a: Actor, me: Actor): { x: number; y: number; a: number; len: number } | null {
  if (!me.alive || (a.chargeLeft <= 0 && a.beamLeft <= 0)) return null;
  const end = beamEnd(w, a), dx = Math.cos(a.beamAng), dy = Math.sin(a.beamAng);
  const reach = Math.hypot(end.x - a.x, end.y - a.y);
  const along = (me.x - a.x) * dx + (me.y - a.y) * dy;
  if (along < 0 || along > reach + 1.5 || Math.abs((me.x - a.x) * dy - (me.y - a.y) * dx) > 1.5) return null;
  const from = Math.max(along - 5, along / 2), to = Math.min(reach, along + 2);
  return { x: a.x + dx * from, y: a.y + dy * from, a: a.beamAng, len: Math.max(0, to - from) };
}

/** Laser / X-Ray each step: the charge counts down, then the beam burns in pulses of BEAM.pulse s. */
function stepBeam(w: World, a: Actor, dt: number): void {
  const turn = BEAM.turnDegPerSec * DEG * dt;
  a.beamAng = wrapAngle(a.beamAng + Math.max(-turn, Math.min(turn, angleDiff(a.beamAng, a.facing))));
  if (a.chargeLeft > 0) {
    a.chargeLeft = Math.max(0, a.chargeLeft - dt);
    if (a.chargeLeft > 0) return;
    a.beamLeft = a.ability.seconds ?? 0;
    a.beamPulse = 0;
    emitAbility(w, 'beam', a.x, a.y, TUNING.sound.shot, a);
  }
  a.beamLeft = Math.max(0, a.beamLeft - dt);
  a.beamPulse -= dt;
  if (a.beamPulse > 1e-9) return;
  a.beamPulse += BEAM.pulse;
  const end = beamEnd(w, a);
  const t = end.target;
  if (!t) return;
  if (untouchable(t)) {
    w.hits.push({ target: t.id, by: a.id, x: end.x, y: end.y, fromX: a.x, fromY: a.y, hpDamage: 0, armorDamage: 0, killed: false, downed: false, power: true });
    return;
  }
  hurt(w, t, a, (a.ability.amount ?? 0) * BEAM.pulse, a.ability.armorPen ?? 0, end.x, end.y, a.ability.name);
}

/** Damage from a superpower or signature (no bullet): armour, health, the hit event, a down or a kill. */
function hurt(w: World, t: Actor, by: Actor, raw: number, armorPen: number, hx: number, hy: number, name: string): void {
  if (t.downed && t.downInfo?.tick === w.tick) return;
  const m = mitigate(t.armor, raw, armorPen);
  if (t.team !== by.team) by.damageDealt += lost(t, m);
  t.armor -= m.armor;
  t.hp -= m.hp;
  t.hitFlash = TUNING.render.hitFlash;
  t.lastHitTick = w.tick;
  t.lastHitFrom = { x: by.x, y: by.y };
  t.damageTaken += m.hp + m.armor;
  const r = t.hp <= 0 ? drop(w, t, { cause: 'shot', killerId: by.id, weapon: name, fromX: by.x, fromY: by.y, toX: t.x, toY: t.y, tick: w.tick }) : null;
  w.hits.push({ target: t.id, by: by.id, x: hx, y: hy, fromX: by.x, fromY: by.y, hpDamage: m.hp, armorDamage: m.armor, killed: r === 'out', downed: r === 'downed', power: true });
  emit(w, 'hit', hx, hy, TUNING.sound.impact, by);
}

/** Bubble and Drool globs: fly, stop on walls and cover, and catch the first standing hostile they touch. */
function stepOrbs(w: World, dt: number): void {
  const lean = TUNING.combat.coverLean;
  for (const o of w.orbs) {
    if (!o.alive) continue;
    const sp = ORB.speed[o.kind];
    const nx = o.x + o.dx * sp * dt, ny = o.y + o.dy * sp * dt;
    const wallT = bulletBlockT(w.level, o.ox, o.oy, o.x, o.y, nx, ny, false, lean);
    let best = wallT >= 0 ? wallT : 2;
    let target: Actor | null = null;
    for (const a of w.actors) {
      if (!standing(a) || a.id === o.owner || (a.team === o.team && !w.friendlyFire)) continue;
      const t = segmentCircleT(o.x, o.y, nx, ny, a.x, a.y, TUNING.movement.radius + ORB.radius[o.kind]);
      if (t >= 0 && t < best) { best = t; target = a; }
    }
    if (best <= 1) {
      o.alive = false;
      o.x += (nx - o.x) * best;
      o.y += (ny - o.y) * best;
      const by = w.actors[o.owner];
      if (target && !untouchable(target)) (o.kind === 'bubble' ? cage : glue)(w, target, by);
      else emit(w, 'impact', o.x, o.y, TUNING.sound.impact, by);
      continue;
    }
    o.x = nx;
    o.y = ny;
    o.left -= dt;
    if (o.left <= 0) o.alive = false;
  }
  if (w.orbs.some((o) => !o.alive)) w.orbs = w.orbs.filter((o) => o.alive);
}

/** Bubble: t is caged where it stands for the bubble's seconds (it can still aim and shoot). */
function cage(w: World, t: Actor, by: Actor): void {
  t.trapLeft = by.ability.seconds ?? 2;
  t.trapX = t.x;
  t.trapY = t.y;
  t.trapR = by.ability.length ?? 1.1;
  t.dashLeft = 0;
  t.vx = t.vy = 0;
  t.lastHitTick = w.tick;
  t.lastHitFrom = { x: by.x, y: by.y };
  w.hits.push({ target: t.id, by: by.id, x: t.x, y: t.y, fromX: by.x, fromY: by.y, hpDamage: 0, armorDamage: 0, killed: false, downed: false, power: true });
  emit(w, 'caged', t.x, t.y, TUNING.sound.ability, by);
}

/**
 * Drool: the nearest wall within the goo's reach (16 directions), and the spot against it where a body fits; or
 * where t stands when no wall is that close. Pure, so it is tested directly.
 */
export function wallSpot(l: Level, x: number, y: number, reach: number): { x: number; y: number; d: number } {
  const r = TUNING.movement.radius;
  let best = { x, y, d: 0 }, bestD = Infinity;
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang);
    const ex = x + dx * (reach + r), ey = y + dy * (reach + r);
    let t = Infinity;
    for (const b of l.wallBoxes) { const bt = segmentBoxT(x, y, ex, ey, b); if (bt >= 0 && bt < t) t = bt; }
    if (t === Infinity) continue;
    const d = Math.max(0, t * (reach + r) - r - 0.02);
    if (d < bestD) { bestD = d; best = { x: x + dx * d, y: y + dy * d, d }; }
  }
  return best;
}

/** Drool: t is dragged to the nearest wall within reach and glued there (it can still aim and shoot). */
function glue(w: World, t: Actor, by: Actor): void {
  const spot = wallSpot(w.level, t.x, t.y, by.ability.length ?? 2.5);
  t.pinX = spot.x;
  t.pinY = spot.y;
  // Glued time counts from when it reaches the wall.
  t.pinLeft = (by.ability.seconds ?? 1.4) + spot.d / ORB.pullSpeed;
  t.dashLeft = 0;
  t.vx = t.vy = 0;
  t.lastHitTick = w.tick;
  t.lastHitFrom = { x: by.x, y: by.y };
  w.hits.push({ target: t.id, by: by.id, x: t.x, y: t.y, fromX: by.x, fromY: by.y, hpDamage: 0, armorDamage: 0, killed: false, downed: false, power: true });
  emit(w, 'pinned', t.x, t.y, TUNING.sound.ability, by);
}

/**
 * Where a's slab would stand: an axis-aligned box across its facing, 1.1 u ahead, its ends cut short at the first wall
 * (it never pokes into the next room). null when it cannot stand: the spot is behind a wall, it would be too short,
 * or it would cross a living actor (pushed out, someone could end up inside a wall).
 */
function slabBox(w: World, a: Actor): Box | null {
  const A = TUNING.abilities;
  const cx = a.x + Math.cos(a.facing) * 1.1, cy = a.y + Math.sin(a.facing) * 1.1;
  if (tileAt(w.level, cx, cy) === WALL || !sightClear(w.level, a.x, a.y, cx, cy)) return null;
  const horizontal = Math.abs(Math.sin(a.facing)) > Math.abs(Math.cos(a.facing));
  const full = (a.ability.length ?? A.barrierLength) / 2, hd = A.barrierDepth / 2;
  // Walk out from the centre along the slab until a wall (both faces of its depth must be clear).
  const reach = (dir: number) => {
    let r = 0;
    while (r < full) {
      const n = Math.min(full, r + 0.05);
      const ok = [-hd, hd].every((o) => horizontal ? tileAt(w.level, cx + dir * n, cy + o) !== WALL : tileAt(w.level, cx + o, cy + dir * n) !== WALL);
      if (!ok) break;
      r = n;
    }
    return r;
  };
  const lo = reach(-1), hi = reach(1);
  if (lo + hi < Math.min(1, full)) return null;
  const box: Box = horizontal
    ? { x0: cx - lo, y0: cy - hd, x1: cx + hi, y1: cy + hd }
    : { x0: cx - hd, y0: cy - lo, x1: cx + hd, y1: cy + hi };
  const r = TUNING.movement.radius;
  for (const t of w.actors) {
    if (!t.alive) continue;
    const nx = Math.max(box.x0, Math.min(box.x1, t.x)), ny = Math.max(box.y0, Math.min(box.y1, t.y));
    if (Math.hypot(t.x - nx, t.y - ny) < r) return null;
  }
  return box;
}

/** Living hostiles within r of a with a clear line (walls block signature effects the same way they block bullets). */
function hostilesInSight(w: World, a: Actor, r: number): Actor[] {
  return w.actors.filter((t) => t.alive && !t.downed && t.team !== a.team && Math.hypot(t.x - a.x, t.y - a.y) <= r && sightClear(w.level, a.x, a.y, t.x, t.y));
}

function detonate(w: World, a: Actor): void {
  const ab = a.ability;
  for (const t of hostilesInSight(w, a, ab.radius ?? 0)) {
    if (untouchable(t)) continue;
    const raw = (ab.amount ?? 0) * a.power.damageMul;
    const m = mitigate(t.armor, raw, ab.armorPen ?? 0);
    a.damageDealt += lost(t, m);
    t.armor -= m.armor;
    t.hp -= m.hp;
    t.hitFlash = TUNING.render.hitFlash;
    t.lastHitTick = w.tick;
    t.lastHitFrom = { x: a.x, y: a.y };
    t.damageTaken += m.hp + m.armor;
    const r = t.hp <= 0 ? drop(w, t, { cause: 'shot', killerId: a.id, weapon: ab.name, fromX: a.x, fromY: a.y, toX: t.x, toY: t.y, tick: w.tick }) : null;
    w.hits.push({ target: t.id, by: a.id, x: t.x, y: t.y, fromX: a.x, fromY: a.y, hpDamage: m.hp, armorDamage: m.armor, killed: r === 'out', downed: r === 'downed' });
  }
  emitAbility(w, 'burst', a.x, a.y, TUNING.sound.shot, a);
}

function applyInput(w: World, a: Actor, inp: ActorInput, dt: number): void {
  const M = TUNING.movement;
  // Downed: crawl, nothing else (no fire, reload, ability or pickups). The bleed-out runs in stepRevive.
  if (a.downed) inp = downedInput(inp);
  // Holding the trigger (even between shots) counts as firing: a rescuer must let go of it.
  a.firedLast = inp.firing;
  if (isHuman(a) && !LAB.turn) a.facing = inp.aim;
  else {
    // CF-A: people turn at a cap too (fast: a small correction lands in one step, a 180 takes ~0.25 s); bots slower.
    const turn = (isHuman(a) ? TUNING.movement.turnRateDegPerSec : TUNING.bots.turnRateDegPerSec) * DEG * dt;
    const d = angleDiff(a.facing, inp.aim);
    a.facing = wrapAngle(a.facing + Math.max(-turn, Math.min(turn, d)));
  }
  a.aimLag = Math.abs(angleDiff(a.facing, inp.aim));
  a.abilityCd = Math.max(0, a.abilityCd - dt);
  a.revealLeft = Math.max(0, a.revealLeft - dt);
  a.markLeft = Math.max(0, a.markLeft - dt);
  a.shieldLeft = Math.max(0, a.shieldLeft - dt);
  a.frenzyLeft = Math.max(0, a.frenzyLeft - dt);
  a.slowLeft = Math.max(0, a.slowLeft - dt);
  a.auraLeft = Math.max(0, a.auraLeft - dt);
  if (a.burstLeft > 0) {
    a.burstLeft = Math.max(0, a.burstLeft - dt);
    if (a.burstLeft === 0) detonate(w, a);
  }
  if (a.chargeLeft > 0 || a.beamLeft > 0) stepBeam(w, a, dt);
  // Aura: a fresh press while it holds drops it early (the cooldown already runs from when it went up).
  if (inp.ability && a.abilityOff >= ABILITY_RELEASE && a.auraLeft > 0) a.auraLeft = 0;
  else if (inp.ability && a.abilityCd === 0) useAbility(w, a, inp);
  a.abilityOff = inp.ability ? 0 : a.abilityOff + 1;
  a.nadeCd = Math.max(0, a.nadeCd - dt);
  if (inp.grenade && a.grenades > 0 && a.nadeCd === 0 && !untouchable(a)) throwGrenade(w, a, inp.throwAim ?? inp.aim, inp.throwDist);

  const speedMul = a.hero.speed * (a.slowLeft > 0 ? a.slowMul : 1);
  const ox = a.x, oy = a.y;
  moveBody(w.level, a, inp, dt);
  a.stepAcc += Math.hypot(a.x - ox, a.y - oy);
  const speed = Math.hypot(a.vx, a.vy);
  if (a.stepAcc >= M.stepDistance) {
    a.stepAcc -= M.stepDistance;
    let r = stepRadius(a.dashLeft > 0 ? 0 : speed / (M.maxSpeed * speedMul)) * (a.perk === 'soles' ? TUNING.perks.solesStepMul : 1);
    // An aura hums: its steps are never quiet.
    if (a.auraLeft > 0) r = Math.max(r, TUNING.sound.runStep);
    emit(w, r <= TUNING.sound.quietStep + 0.01 ? 'quietStep' : 'step', a.x, a.y, r, a);
  }
  // Steady rule (CF): standing still for a moment focuses the lamp; running widens and shortens it.
  a.stillFor = speed < M.steadySpeed ? a.stillFor + dt : 0;
  const want = a.stillFor >= M.steadySeconds ? 1 : speed > M.maxSpeed * speedMul * M.quietSpeedScale + 0.05 ? -1 : 0;
  const fr = TUNING.vision.focusRate * dt;
  a.focus = LAB.dark ? a.focus + Math.max(-fr, Math.min(fr, want - a.focus)) : 0;
  applyFocus(a);

  // Weapon
  const W = a.weapon;
  a.cooldown = Math.max(0, a.cooldown - dt);
  a.muzzle = Math.max(0, a.muzzle - dt);
  a.hitFlash = Math.max(0, a.hitFlash - dt);
  a.lastSpread = spreadStep(a, dt);
  if (a.reloadLeft > 0) {
    a.reloadLeft -= dt;
    if (a.reloadLeft <= 0) {
      a.reloadLeft = 0;
      const take = Math.min(W.magazine - a.ammo, a.reserve);
      a.ammo += take;
      a.reserve -= take;
    }
    return;
  }
  if (inp.reload) {
    startReload(w, a);
    if (a.reloadLeft > 0) return;
  }
  // Burst weapons finish the burst they started (one trigger pull, W.burst rounds W.burstGap apart).
  // GP: a new pull leaves only once the body faces within fireMaxLagDeg of the aim; one made while turning waits.
  const aligned = a.aimLag <= TUNING.combat.fireMaxLagDeg * DEG;
  if (inp.firing && !aligned) a.fireQueued = TUNING.combat.fireQueueSeconds;
  else a.fireQueued = Math.max(0, a.fireQueued - dt);
  if (a.volley > 0) {
    a.volleyGap -= dt;
    if (a.volleyGap <= 0 && a.ammo > 0 && !untouchable(a)) fireRound(w, a);
    else if (a.ammo === 0 || untouchable(a)) { a.volley = 0; a.cooldown = W.fireInterval; }
  } else if ((inp.firing || a.fireQueued > 0) && aligned && a.cooldown === 0 && a.ammo > 0 && !untouchable(a)) {
    a.fireQueued = 0;
    a.shots++;
    a.volley = W.burst ?? 1;
    fireRound(w, a);
  }
  if (a.ammo === 0 && !a.downed) startReload(w, a);
}

/**
 * One step of a body's movement: acceleration toward the input (hero speed, slow, creep), a dash if one is running,
 * walls and crates, and the corner assist. The ONE movement rule: the sim runs it for everyone, and an online client
 * runs the same function on its own operator to predict it before the server's answer arrives (SB, src/net/client.ts).
 */
export function moveBody(level: Level, a: Actor, inp: ActorInput, dt: number): void {
  const M = TUNING.movement;
  // Drool: dragged to the wall spot, then glued (no walking, no dash, no push) until it lets go.
  if (a.pinLeft > 0) {
    a.pinLeft = Math.max(0, a.pinLeft - dt);
    const dx = a.pinX - a.x, dy = a.pinY - a.y, d = Math.hypot(dx, dy);
    const step = Math.min(d, ORB.pullSpeed * dt);
    if (d > 1e-6) { a.x += (dx / d) * step; a.y += (dy / d) * step; }
    a.vx = a.vy = 0;
    a.dashLeft = 0;
    resolveCircle(a, M.radius, level.solidBoxes);
    return;
  }
  const speedMul = a.hero.speed * (a.slowLeft > 0 ? a.slowMul : 1) * (a.chargeLeft > 0 || a.beamLeft > 0 ? BEAM.moveMul : 1);
  if (a.dashLeft > 0) {
    a.dashLeft = Math.max(0, a.dashLeft - dt);
    a.vx = a.dashX * TUNING.abilities.dashSpeed;
    a.vy = a.dashY * TUNING.abilities.dashSpeed;
  } else {
    move.x = inp.moveX;
    move.y = inp.moveY;
    moveTuning.maxSpeed = M.maxSpeed * speedMul;
    stepVelocity(a.vx, a.vy, move, dt, moveTuning, inp.quiet ? M.quietSpeedScale : 1, vel);
    a.vx = vel.x;
    a.vy = vel.y;
  }
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  resolveCircle(a, M.radius, level.solidBoxes);
  if (a.trapLeft > 0) {
    // Bubble: the body stays inside the cage; walking into its skin stops dead.
    a.trapLeft = Math.max(0, a.trapLeft - dt);
    const room = Math.max(0, a.trapR - M.radius), dx = a.x - a.trapX, dy = a.y - a.trapY, d = Math.hypot(dx, dy);
    if (d > room) {
      a.x = a.trapX + (dx / d) * room;
      a.y = a.trapY + (dy / d) * room;
      const out = (a.vx * dx + a.vy * dy) / d;
      if (out > 0) { a.vx -= (out * dx) / d; a.vy -= (out * dy) / d; }
    }
    return;
  }
  if (a.dashLeft <= 0) {
    // Corner assist: never stop dead on a crate/wall edge you are nearly past (CHOG-MAP-001).
    const t = cornerAssistDir(a.x, a.y, M.radius, inp.moveX, inp.moveY, level.solidBoxes, M.cornerAssist);
    if (t.x !== 0 || t.y !== 0) {
      const sp = M.maxSpeed * speedMul * M.cornerAssistSpeed * (inp.quiet ? M.quietSpeedScale : 1) * dt;
      a.x += t.x * sp;
      a.y += t.y * sp;
      resolveCircle(a, M.radius, level.solidBoxes);
    }
  }
}

/** Downed: crawl, nothing else. The same input shaping for the sim and for an online client's prediction. */
export function downedInput(inp: ActorInput): ActorInput {
  return { ...inp, firing: false, reload: false, ability: false, grenade: false, quiet: false, moveX: inp.moveX * TUNING.revive.crawl, moveY: inp.moveY * TUNING.revive.crawl };
}

/** Normalise to -PI..PI so a facing never grows without bound across many turns. */
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Step noise radius by speed share (CF-D): creep pace and below is a quiet step (3 u), a full run 8 u, and a walk in
 * between scales linearly, so a patrolling bot at 80% is heard ~6 u away. Before CF: two values only.
 */
export function stepRadius(speedShare: number): number {
  const S = TUNING.sound, q = TUNING.movement.quietSpeedScale;
  if (!LAB.enemySound) return speedShare <= q + 0.02 ? S.quietStep : S.runStep;
  const t = Math.max(0, Math.min(1, (speedShare - q - 0.02) / (1 - q - 0.02)));
  return S.quietStep + (S.runStep - S.quietStep) * t;
}

/** The view an actor has at its current gait focus (CF-E). */
export function applyFocus(a: Actor): void {
  const V = TUNING.vision, f = a.focus, b = a.baseView;
  a.view.nearRadius = b.nearRadius;
  a.view.coneRad = b.coneRad * (1 - f * V.focusCone);
  a.view.range = b.range * (f >= 0 ? 1 + f * V.focusRange : 1 + f * V.runRange);
}

/**
 * Fire quality (CF steady rule): base spread + the weapon's run penalty by speed + turn lag; it widens at once and
 * settles over TUNING.combat.settleSeconds when you slow down. LAB.steady off: the flat pre-CF rule.
 */
function spreadStep(a: Actor, dt: number): number {
  const C = TUNING.combat, W = a.weapon;
  const share = Math.min(1, Math.hypot(a.vx, a.vy) / TUNING.movement.maxSpeed);
  if (!LAB.steady) return W.spreadDeg + C.moveSpreadDeg * share;
  const lagDeg = LAB.turn ? a.aimLag / DEG : 0;
  const lag = Math.max(0, Math.min(1, (lagDeg - C.turnFreeDeg) / (C.turnFullDeg - C.turnFreeDeg)));
  const target = W.spreadDeg + W.moveSpreadDeg * share + C.turnSpreadDeg * lag;
  if (target >= a.lastSpread) return target;
  return a.lastSpread + (target - a.lastSpread) * (1 - Math.exp(-dt / C.settleSeconds));
}

/** One round of the current trigger pull: every pellet, one ammo, the shot sound. Ends the burst on its last round. */
function fireRound(w: World, a: Actor): void {
  const W = a.weapon;
  const spread = a.lastSpread * DEG;
  for (let i = 0; i < W.pellets; i++) {
    // Pellets fan evenly across the spread with a little jitter; single shots are random within it.
    const base = W.pellets > 1 ? -spread + (2 * spread * i) / (W.pellets - 1) : 0;
    const jitter = (rand(w) * 2 - 1) * (W.pellets > 1 ? spread / W.pellets : spread);
    const ang = a.facing + base + jitter;
    w.bullets.push({ x: a.x, y: a.y, dx: Math.cos(ang), dy: Math.sin(ang), ox: a.x, oy: a.y, life: W.bulletLife, owner: a.id, weapon: W, alive: true, mul: a.frenzyLeft > 0 ? a.ability.amount ?? 1 : 1 });
  }
  a.ammo--;
  a.bullets += W.pellets;
  a.muzzle = TUNING.render.muzzleFlash;
  emit(w, 'shot', a.x, a.y, TUNING.sound.shot, a, W.sound);
  a.volley = Math.max(0, a.volley - 1);
  if (a.volley > 0) a.volleyGap = W.burstGap ?? 0;
  else a.cooldown = W.fireInterval;
}

/** Throw toward `aim`: launched so rolling friction brings it to rest `dist` u away (TUNING.grenade). */
function throwGrenade(w: World, a: Actor, aim: number, dist?: number): void {
  const G = TUNING.grenade;
  const d = Math.max(G.minThrow, Math.min(G.maxThrow, dist ?? G.touchThrow));
  const v = Math.sqrt(2 * G.friction * d);
  const cx = Math.cos(aim), cy = Math.sin(aim);
  // Leaves the hand just ahead of the body, unless a wall is right there.
  const hx = a.x + cx * 0.5, hy = a.y + cy * 0.5;
  const out = sightClear(w.level, a.x, a.y, hx, hy);
  w.grenades.push({ id: w.nadeSeq++, x: out ? hx : a.x, y: out ? hy : a.y, vx: cx * v, vy: cy * v, fuse: G.fuseSeconds, owner: a.id, team: a.team, alive: true });
  a.grenades--;
  a.thrown++;
  a.nadeCd = G.throwCooldown;
  emit(w, 'throw', a.x, a.y, G.throwSound, a);
}

/** Grenades roll (friction), bounce off walls (not crates or slabs: they are lobbed over waist-high cover) and explode. */
function stepGrenades(w: World, dt: number): void {
  const G = TUNING.grenade;
  for (const g of w.grenades) {
    if (!g.alive) continue;
    const sp = Math.hypot(g.vx, g.vy);
    if (sp > 0) {
      const k = Math.max(0, sp - G.friction * dt) / sp;
      g.vx *= k;
      g.vy *= k;
      const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
      if (sightClear(w.level, g.x, g.y, nx, ny)) {
        g.x = nx;
        g.y = ny;
      } else {
        // Bounce on the blocked axis (both at a corner), keeping G.bounce of the speed.
        const xOk = sightClear(w.level, g.x, g.y, nx, g.y), yOk = sightClear(w.level, g.x, g.y, g.x, ny);
        if (!xOk || xOk === yOk) g.vx = -g.vx * G.bounce;
        if (!yOk || xOk === yOk) g.vy = -g.vy * G.bounce;
        if (xOk && !yOk) g.x = nx;
        if (yOk && !xOk) g.y = ny;
        if (sp > 2) emit(w, 'bounce', g.x, g.y, G.bounceSound, w.actors[g.owner]);
      }
    }
    // Come to rest on top of a crate or slab: it rolls off to the nearest face (it never sits inside cover, where the
    // cover would stop shielding anyone from it).
    if (Math.hypot(g.vx, g.vy) < 0.05) restOutside(w.level, g);
    g.fuse -= dt;
    if (g.fuse <= 0) explode(w, g);
  }
  let j = 0;
  for (const g of w.grenades) if (g.alive) w.grenades[j++] = g;
  w.grenades.length = j;
}

function restOutside(l: Level, g: Grenade): void {
  for (const b of l.coverBoxes) {
    if (g.x <= b.x0 || g.x >= b.x1 || g.y <= b.y0 || g.y >= b.y1) continue;
    const out = [[b.x0 - 0.05, g.y], [b.x1 + 0.05, g.y], [g.x, b.y0 - 0.05], [g.x, b.y1 + 0.05]]
      .filter(([x, y]) => tileAt(l, x, y) !== WALL)
      .sort((p, q) => Math.hypot(p[0] - g.x, p[1] - g.y) - Math.hypot(q[0] - g.x, q[1] - g.y));
    if (out.length) { g.x = out[0][0]; g.y = out[0][1]; }
    g.vx = g.vy = 0;
    return;
  }
}

/**
 * Blast: full damage at the centre falling linearly to edgeDamage at the radius. A wall between the blast and a target
 * blocks it; a crate or slab halves it. Hurts hostiles and the thrower; teammates only with friendly fire on.
 */
function explode(w: World, g: Grenade): void {
  const G = TUNING.grenade;
  const by = w.actors[g.owner];
  g.alive = false;
  emit(w, 'boom', g.x, g.y, G.boomSound, by);
  for (const t of w.actors) {
    if (!t.alive || (t.team === by.team && t !== by && !w.friendlyFire)) continue;
    const d = Math.hypot(t.x - g.x, t.y - g.y);
    if (d > G.radius || !sightClear(w.level, g.x, g.y, t.x, t.y)) continue;
    const cover = shotClear(w.level, g.x, g.y, t.x, t.y, false, 0) ? 1 : G.coverMul;
    const raw = untouchable(t) ? 0 : (G.damage + (G.edgeDamage - G.damage) * (d / G.radius)) * cover * (by.ai ? TUNING.bots.damageMul : 1);
    const m = mitigate(t.armor, raw, G.armorPen);
    if (t.team !== by.team) by.damageDealt += lost(t, m);
    t.armor -= m.armor;
    t.hp -= m.hp;
    t.hitFlash = TUNING.render.hitFlash;
    t.lastHitTick = w.tick;
    t.lastHitFrom = { x: g.x, y: g.y };
    t.damageTaken += m.hp + m.armor;
    const r = t.hp <= 0 ? drop(w, t, { cause: 'shot', killerId: by.id, weapon: 'Grenade', fromX: g.x, fromY: g.y, toX: t.x, toY: t.y, tick: w.tick }) : null;
    w.hits.push({ target: t.id, by: by.id, x: t.x, y: t.y, fromX: g.x, fromY: g.y, hpDamage: m.hp, armorDamage: m.armor, killed: r === 'out', downed: r === 'downed', grenade: true });
  }
}

function stepBullets(w: World, dt: number): void {
  const r = TUNING.movement.radius;
  const lean = TUNING.combat.coverLean;
  for (const b of w.bullets) {
    if (!b.alive) continue;
    const nx = b.x + b.dx * b.weapon.bulletSpeed * dt;
    const ny = b.y + b.dy * b.weapon.bulletSpeed * dt;
    const wallT = bulletBlockT(w.level, b.ox, b.oy, b.x, b.y, nx, ny, b.weapon.piercesCover, lean);
    const onCover = blockedByCover;
    let bestT = wallT >= 0 ? wallT : 2;
    let target: Actor | null = null;
    const team = w.actors[b.owner].team;
    for (const a of w.actors) {
      // No friendly fire, either team (CHOG-AI-002): a bullet passes through the shooter's teammates, so every
      // hostile elimination is a player kill and "Hostiles down" always equals the player's kills. An online room
      // can switch it on (w.friendlyFire); the shooter itself is never hit by its own bullet.
      if (!a.alive || a.id === b.owner || (a.team === team && !w.friendlyFire)) continue;
      // Damage range cap: a bot bullet fired from beyond the player's sight distance never hurts the player.
      // (Each target's own sight distance: the same rule protects the player and the player's AI teammates.)
      if (team === 'bot' && a.team === 'player' && Math.hypot(b.ox - a.x, b.oy - a.y) > a.baseView.range) continue;
      const t = segmentCircleT(b.x, b.y, nx, ny, a.x, a.y, r);
      if (t >= 0 && t < bestT) {
        bestT = t;
        target = a;
      }
    }
    if (bestT <= 1) {
      const hx = b.x + (nx - b.x) * bestT;
      const hy = b.y + (ny - b.y) * bestT;
      b.alive = false;
      b.x = hx;
      b.y = hy;
      const shooter = w.actors[b.owner];
      if (target) damage(w, target, shooter, b, hx, hy);
      else {
        emit(w, 'impact', hx, hy, TUNING.sound.impact, shooter);
        // Cover hit: flag it so the client shows a 'blocked' spark (cover rules are legible, not mysterious).
        if (onCover) w.sounds[w.sounds.length - 1].blocked = true;
      }
      continue;
    }
    b.x = nx;
    b.y = ny;
    b.life -= dt;
    if (b.life <= 0) b.alive = false;
  }
  let j = 0;
  for (const b of w.bullets) if (b.alive) w.bullets[j++] = b;
  w.bullets.length = j;
}

function damage(w: World, t: Actor, by: Actor, b: Bullet, hx: number, hy: number): void {
  // Downed this very step by an earlier pellet of the same blast: the rest are spent (a blast downs, it never also
  // empties the downed pool in the same trigger pull).
  if (t.downed && t.downInfo?.tick === w.tick) return;
  // Gold Shell: the bullet stops on the shell and does nothing (the hit spark still shows where it landed): no push,
  // no counted hit, no reset of a revive.
  if (untouchable(t)) {
    w.hits.push({ target: t.id, by: by.id, x: hx, y: hy, fromX: b.ox, fromY: b.oy, hpDamage: 0, armorDamage: 0, killed: false, downed: false });
    emit(w, 'hit', hx, hy, TUNING.sound.impact, by);
    return;
  }
  const raw = damageAt(b.weapon, Math.hypot(hx - b.ox, hy - b.oy)) * (by.ai ? TUNING.bots.damageMul : 1) * by.power.damageMul * (b.mul ?? 1);
  const m = mitigate(t.armor, raw, b.weapon.armorPen);
  // Damage dealt counts opponents only and only what they lost (it pays shards: friendly fire and overkill never farm them).
  if (t.team !== by.team) by.damageDealt += lost(t, m);
  t.armor -= m.armor;
  t.hp -= m.hp;
  t.hitFlash = TUNING.render.hitFlash;
  t.lastHitTick = w.tick;
  t.lastHitFrom = { x: b.ox, y: b.oy };
  // One blast pushes like one bullet: the nudge is shared between its pellets.
  t.vx += (b.dx * TUNING.combat.knockback) / b.weapon.pellets;
  t.vy += (b.dy * TUNING.combat.knockback) / b.weapon.pellets;
  by.hits++;
  t.damageTaken += m.hp + m.armor;
  if (by.perk === 'marker' && t.team !== by.team) { t.markLeft = TUNING.perks.markerSeconds; t.markTeam = by.team; }
  const r = t.hp <= 0 ? drop(w, t, { cause: 'shot', killerId: by.id, weapon: b.weapon.name, fromX: b.ox, fromY: b.oy, toX: t.x, toY: t.y, tick: w.tick }) : null;
  w.hits.push({ target: t.id, by: by.id, x: hx, y: hy, fromX: b.ox, fromY: b.oy, hpDamage: m.hp, armorDamage: m.armor, killed: r === 'out', downed: r === 'downed' });
  emit(w, 'hit', hx, hy, TUNING.sound.impact, by);
}

/** What a hit really took from t: armour plus health down to 0, nothing from a downed pool (no overkill). */
function lost(t: Actor, m: { hp: number; armor: number }): number {
  return t.downed ? 0 : m.armor + Math.min(Math.max(0, t.hp), m.hp);
}

/** Standing (alive and not downed): can fight, rescue, and keep its team in the match. */
export const standing = (a: Actor) => a.alive && !a.downed;

/**
 * An actor reached 0 from a hostile's damage. Team modes: downed if a teammate is still standing (TUNING.revive);
 * otherwise, or when already downed, eliminated, and the kill goes to whoever downed them first.
 */
function drop(w: World, t: Actor, info: KillInfo): 'downed' | 'out' {
  // Team modes, and the solo player's side (you + AI teammates): hostile bots are never downed, always eliminated.
  const mates = (w.mode === 'versus' || t.team === 'player') && w.actors.some((o) => o !== t && o.team === t.team && standing(o));
  if (!t.downed && mates) {
    t.downed = true;
    t.downInfo = info;
    t.hp = TUNING.revive.downHp;
    t.armor = 0;
    t.reviveProgress = 0;
    t.reloadLeft = 0;
    t.burstLeft = 0;
    t.shieldLeft = t.frenzyLeft = 0;
    t.chargeLeft = t.beamLeft = t.auraLeft = t.trapLeft = t.pinLeft = 0;
    t.volley = 0;
    t.dashLeft = 0;
    t.vx = t.vy = 0;
    emit(w, 'downed', t.x, t.y, TUNING.sound.death, t);
    return 'downed';
  }
  // The kill goes to the hostile who downed them; downed by yourself or a teammate, to whoever finished you.
  const first = t.downInfo, firstBy = first && first.killerId >= 0 ? w.actors[first.killerId] : null;
  const credit = first && firstBy && firstBy.team !== t.team ? first : info;
  const killer = credit.killerId >= 0 ? w.actors[credit.killerId] : null;
  if (killer && killer.team !== t.team) killer.kills++;
  down(w, t, credit);
  return 'out';
}

export function down(w: World, t: Actor, info: KillInfo): void {
  dropLoot(w, t, info);
  t.hp = 0;
  t.alive = false;
  t.downed = false;
  t.reviveProgress = 0;
  { const ti = w.attackTokens.indexOf(t.id); if (ti >= 0) w.attackTokens.splice(ti, 1); }
  t.vx = t.vy = 0;
  t.death = info;
  emit(w, 'death', t.x, t.y, TUNING.sound.death, t);
  if (w.mode === 'solo' && t.id === 0) w.playerKill = info;
}

/** GP: what t carried becomes a bag at its feet (Loot). Called once, at elimination. */
function dropLoot(w: World, t: Actor, info: KillInfo): void {
  const L = TUNING.loot;
  if (!L.on || !t.alive) return;
  const mags = (t.ammo + t.reserve) / t.weapon.magazine, armor = Math.max(0, Math.floor(t.armor)), grenades = Math.max(0, t.grenades);
  const killer = info.killerId >= 0 ? w.actors[info.killerId] : null;
  const known: Team[] = [t.team];
  if (killer && killer.team !== t.team) known.push(killer.team);
  w.loot.push({ id: w.lootSeq++, x: t.x, y: t.y, mags, health: L.dressing, armor, grenades, perk: t.perk, left: L.seconds, from: t.id, team: t.team, known });
  t.ammo = t.reserve = 0;
  t.armor = 0;
  t.grenades = 0;
  t.perk = null;
}

/** What `a` would take from a bag right now (each part only up to its own ceiling), or null if nothing. */
export function lootTake(a: Actor, l: Loot): { rounds: number; mags: number; health: number; armor: number; grenades: number; perk: PerkId | null } | null {
  if (!a.alive || a.downed) return null;
  // V2: a perk goes into an empty slot on touch; a held one is swapped only by standing still on the bag (stepLoot).
  const perk = !a.perk && l.perk ? l.perk : null;
  const rounds = Math.max(0, Math.min(Math.floor(l.mags * a.weapon.magazine + 1e-9), ammoCeiling(a) - a.reserve));
  const health = Math.max(0, Math.min(l.health, a.maxHp - a.hp));
  const armor = Math.max(0, Math.min(l.armor, a.maxArmor - a.armor));
  const grenades = Math.max(0, Math.min(l.grenades, a.maxGrenades - a.grenades));
  if (rounds === 0 && health < 1 && armor < 1 && grenades === 0 && !perk) return null;
  return { rounds, mags: rounds / a.weapon.magazine, health: health >= 1 ? health : 0, armor: armor >= 1 ? armor : 0, grenades, perk };
}

const lootEmpty = (l: Loot) => l.mags < 0.05 && l.health < 1 && l.armor < 1 && l.grenades === 0 && !l.perk;

/**
 * Bags on the floor: who takes what (the nearest standing actor in reach with a clear line who wants something,
 * one taker per bag per step, so two people never take the same thing), who knows they are there, and the timeout.
 */
function stepLoot(w: World, dt: number): void {
  const onBag = new Set<number>();
  const R = TUNING.pickups.radius;
  for (const l of w.loot) {
    l.left -= dt;
    if (l.left <= 0) continue;
    let a: Actor | null = null, ad = Infinity;
    for (const o of w.actors) {
      if (!o.alive || o.downed) continue;
      const d = Math.hypot(o.x - l.x, o.y - l.y);
      if (d > R || d >= ad || !sightClear(w.level, o.x, o.y, l.x, l.y) || !lootTake(o, l)) continue;
      a = o; ad = d;
    }
    if (a) {
      const g = lootTake(a, l)!;
      a.reserve += g.rounds;
      l.mags = Math.max(0, l.mags - g.mags);
      a.hp += g.health; l.health -= g.health;
      a.armor += g.armor; l.armor -= g.armor;
      a.grenades += g.grenades; l.grenades -= g.grenades;
      if (g.perk) { a.perk = g.perk; l.perk = null; }
      a.loots++;
      emit(w, 'pickup', l.x, l.y, TUNING.sound.pickup, a);
      w.sounds[w.sounds.length - 1].loot = l.id;
    }
    // V2 swap: a person standing still on a bag whose perk differs from theirs swaps after swapSeconds (their old perk
    // goes into the bag). AI teammates and bots never swap: they keep the first perk they took.
    for (const o of w.actors) {
      if (o.ai || !o.alive || o.downed || !o.perk || !l.perk || l.perk === o.perk) continue;
      if (onBag.has(o.id) || Math.hypot(o.x - l.x, o.y - l.y) > R || Math.hypot(o.vx, o.vy) > TUNING.perks.swapStillSpeed) continue;
      onBag.add(o.id);
      o.bagStill += dt;
      if (o.bagStill >= TUNING.perks.swapSeconds) {
        [o.perk, l.perk] = [l.perk, o.perk];
        o.bagStill = -1e9; // no swapping back until they step off the bag
        emit(w, 'pickup', l.x, l.y, TUNING.sound.pickup, o);
        w.sounds[w.sounds.length - 1].loot = l.id;
      }
    }
    // A team learns of a bag when one of its standing members has it in its light.
    for (const o of w.actors) {
      if (!o.alive || o.downed || l.known.includes(o.team)) continue;
      if (Math.hypot(o.x - l.x, o.y - l.y) <= o.view.range && sightClear(w.level, o.x, o.y, l.x, l.y)) l.known.push(o.team);
    }
  }
  w.lootExpired += w.loot.filter((l) => l.left <= 0 && !lootEmpty(l)).length;
  w.loot = w.loot.filter((l) => l.left > 0 && !lootEmpty(l));
  // Stepping off (or moving on) a bag starts the swap count again.
  for (const o of w.actors) if (o.bagStill !== 0 && !onBag.has(o.id)) o.bagStill = 0;
}

/** Match time in seconds (the zone clock). */
export function matchSeconds(w: World): number {
  return w.tick * TUNING.simStepSeconds;
}

/** Danger zone damage (RC-8): health only (armour does not soak it), escalating by stage. Same for every actor. */
function stepZone(w: World, dt: number): void {
  if (!w.zone) return;
  const v = zoneAt(w.zone, matchSeconds(w));
  if (v.dps <= 0) return;
  for (const a of w.actors) {
    if (!a.alive || !outsideCircle(v.circle, a.x, a.y)) continue;
    const d = Math.min(a.hp, v.dps * dt);
    a.hp -= d;
    a.damageTaken += d;
    a.zoneTick = w.tick;
    if (a.hp <= 0) (a.downed ? drop : down)(w, a, { cause: 'zone', killerId: -1, weapon: 'Danger zone', fromX: a.x, fromY: a.y, toX: a.x, toY: a.y, tick: w.tick });
  }
}

/** Hard ceilings for pickups (TUNING.pickups): health may run 25% over max as overheal, armour 25 over its cap. */
export const hpCeiling = (a: Actor) => Math.round(a.maxHp * (1 + TUNING.pickups.overhealShare));
export const armorCeiling = (a: Actor) => a.maxArmor + TUNING.pickups.overArmor;

/** Does `a` want this pickup? Below the hard ceiling every pickup counts, even at full health (it overheals). */
export function wants(a: Actor, kind: PickupKind): boolean {
  if (a.downed) return false;
  if (kind === 'health') return a.hp <= hpCeiling(a) - TUNING.pickups.minGain;
  if (kind === 'armor') return a.armor <= armorCeiling(a) - TUNING.pickups.minGain;
  if (kind === 'grenade') return a.grenades < a.maxGrenades;
  return a.reserve < ammoCeiling(a);
}
export const ammoCeiling = (a: Actor) => a.weapon.reserve + a.weapon.magazine * 2;

/**
 * A pickup the actor is standing on but does not take because it is at the hard ceiling (RC-8). Collection itself needs
 * no button or second step: stepPickups takes it on the first step of contact. This only lets the client say why not.
 */
export function touchingFull(w: World, a: Actor): Pickup | null {
  if (!a.alive || a.downed) return null;
  for (const p of w.pickups) if (p.active && Math.hypot(a.x - p.x, a.y - p.y) <= TUNING.pickups.radius && !wants(a, p.kind)) return p;
  return null;
}

function stepPickups(w: World, dt: number): void {
  const P = TUNING.pickups;
  for (const p of w.pickups) {
    if (!p.active) {
      p.respawnLeft -= dt;
      if (p.respawnLeft > 0) continue;
      if (p.zone >= 0) {
        // Back on another tile of its zone, clear of the other pickups and of anyone standing; if every tile is
        // blocked right now it tries again in a second.
        const s = respawnSpot(w.pickupSpots[p.zone], w.pickupSeed, p.zone, p.moves + 1, p, w.pickups.filter((q) => q !== p), p.kind, w.actors.filter((a) => a.alive), w.pickupFields!.alpha, w.pickupFields!.bravo);
        if (!s) { p.respawnLeft = 1; continue; }
        p.moves++;
        if (s.x !== p.x || s.y !== p.y) { p.x = s.x; p.y = s.y; w.pickupRev++; }
      }
      p.active = true;
      continue;
    }
    // Contested: the nearest one that wants it takes it (never the lower actor id).
    let a: Actor | null = null;
    for (const o of w.actors) {
      if (!o.alive || Math.hypot(o.x - p.x, o.y - p.y) > P.radius || !wants(o, p.kind)) continue;
      if (!a || Math.hypot(o.x - p.x, o.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y)) a = o;
    }
    if (a) {
      if (p.kind === 'health') a.hp = Math.min(hpCeiling(a), a.hp + P.health.amount);
      else if (p.kind === 'armor') a.armor = Math.min(armorCeiling(a), a.armor + P.armor.amount);
      else if (p.kind === 'grenade') a.grenades = Math.min(a.maxGrenades, a.grenades + P.grenade.amount);
      else a.reserve = Math.min(ammoCeiling(a), a.reserve + a.weapon.magazine * P.ammo.mags);
      p.active = false;
      p.respawnLeft = P[p.kind].respawn;
      emit(w, 'pickup', p.x, p.y, TUNING.sound.pickup, a);
    }
  }
  // GP (owner 2026-10-17: "health ticks down when I'm not fighting"): overheal and over-armour no longer drain. They
  // were the only loss with no hit, no zone and no sound; now they stay until damage takes them.
}

/**
 * Downed and revive (TUNING.revive). Downed actors bleed out over the 10 s window; a standing teammate in range who did
 * not fire this step revives them, and while they do the bleed-out waits; a hit on either, the rescuer firing or leaving
 * the range resets the progress. A team with nobody standing is out: every downed member is eliminated (kill credit to
 * whoever downed them).
 */
function stepRevive(w: World, dt: number): void {
  const R = TUNING.revive;
  for (const t of w.actors) {
    if (!t.alive || !t.downed) continue;
    // Any helper in range who was not hit this step keeps the revive going (not just the first in actor order). One
    // revive per downed actor: two rescuers at once are no faster than one.
    const helpers = w.actors.filter((m) => m !== t && m.team === t.team && standing(m) && !m.firedLast && Math.hypot(m.x - t.x, m.y - t.y) <= R.range && sightClear(w.level, m.x, m.y, t.x, t.y));
    const helper = helpers.find((m) => m.lastHitTick !== w.tick) ?? helpers[0];
    const hitNow = t.lastHitTick === w.tick || (helper && helper.lastHitTick === w.tick);
    if (helper && !hitNow) {
      t.reviveProgress += dt * (helper.perk === 'medic' ? TUNING.perks.medicReviveMul : 1);
      if (t.reviveProgress >= R.seconds - 1e-9) {
        t.downed = false;
        t.downInfo = null;
        t.reviveProgress = 0;
        t.hp = Math.round(t.maxHp * (helper.perk === 'medic' ? TUNING.perks.medicHpShare : R.hpShare));
        t.armor = 0;
        t.revived++;
        helper.revives++;
        emit(w, 'revive', t.x, t.y, TUNING.sound.reload, helper);
      }
      continue;
    }
    t.reviveProgress = 0;
    t.hp -= (R.downHp / R.bleedSeconds) * dt;
    if (t.hp <= 1e-9) drop(w, t, t.downInfo ?? { cause: 'shot', killerId: -1, weapon: 'Bled out', fromX: t.x, fromY: t.y, toX: t.x, toY: t.y, tick: w.tick });
  }
  for (const t of w.actors) {
    if (!t.downed || !t.alive) continue;
    if (!w.actors.some((m) => m.team === t.team && standing(m))) drop(w, t, t.downInfo ?? { cause: 'shot', killerId: -1, weapon: 'Bled out', fromX: t.x, fromY: t.y, toX: t.x, toY: t.y, tick: w.tick });
  }
}

/** Seconds of the downed window left (at the current bleed, with no more hits), for the HUD and the AI. */
export const downLeft = (t: Actor) => t.downed ? Math.max(0, t.hp) / (TUNING.revive.downHp / TUNING.revive.bleedSeconds) : 0;

function stepBarriers(w: World, dt: number): void {
  let any = false;
  for (const b of w.barriers) {
    b.left -= dt;
    if (b.left <= 0) any = true;
  }
  if (!any) return;
  const expired = w.barriers.filter((b) => b.left <= 0);
  if (!expired.length) return;
  w.barriers = w.barriers.filter((b) => b.left > 0);
  for (const e of expired) {
    w.level.coverBoxes.splice(w.level.coverBoxes.indexOf(e.box), 1);
    w.level.solidBoxes.splice(w.level.solidBoxes.indexOf(e.box), 1);
    markDynamic(w.level, e.box, -1);
  }
  invalidatePaths(w);
}

/** A dynamic obstacle appeared or vanished: every bot re-plans on its next think. */
function invalidatePaths(w: World): void {
  for (const br of w.brains.values()) {
    br.path.length = 0;
    br.goal = null;
  }
}

/** Hostiles a viewer's sonar is revealing right now (ignores walls, by design of the ability). */
export function revealed(w: World, viewer: Actor): Actor[] {
  // V2 Marker: a hostile someone on the viewer's team hit with Marker is shown to the whole team for a moment.
  const marked = (a: Actor) => a.markLeft > 0 && a.markTeam === viewer.team;
  if (viewer.revealLeft <= 0) return w.actors.some(marked) ? w.actors.filter((a) => a.alive && a.team !== viewer.team && marked(a)) : [];
  const R = viewer.ability.radius ?? TUNING.abilities.sonarRadius;
  return w.actors.filter((a) => a.alive && a.team !== viewer.team && (marked(a) || Math.hypot(a.x - viewer.x, a.y - viewer.y) <= R));
}

/** Advance one fixed step with the player's input. Bots decide their own input from what they perceive. */
export function stepWorld(
  w: World,
  /** Solo: the player's input. Online (versus): a function giving each human actor's latest input. */
  playerInput: ActorInput | ((a: Actor) => ActorInput),
  dt: number = TUNING.simStepSeconds,
  /** Test harness only (duel scenarios): script a bot's input instead of its brain. Return null to let it think. */
  botInput?: (a: Actor) => ActorInput | null,
): void {
  w.prevSounds = w.sounds;
  w.sounds = [];
  w.prevComms = w.comms;
  w.comms = [];
  w.hits = [];
  for (const a of w.actors) {
    if (!a.alive) {
      a.deadFor += dt;
      continue;
    }
    const inp = isHuman(a)
      ? (typeof playerInput === 'function' ? playerInput(a) : playerInput)
      : (botInput?.(a) ?? botThink(w, a, w.brains.get(a.id)!, dt));
    applyInput(w, a, inp, dt);
  }
  stepBullets(w, dt);
  stepOrbs(w, dt);
  stepGrenades(w, dt);
  stepZone(w, dt);
  stepPickups(w, dt);
  stepLoot(w, dt);
  stepRevive(w, dt);
  stepBarriers(w, dt);
  if (w.outcome === 'playing') {
    if (w.mode === 'versus') {
      // Online: the match ends when at most one team has anyone standing. Nobody standing is a draw.
      const teams = new Set(w.actors.filter(standing).map((a) => a.team));
      if (teams.size <= 1) {
        w.outcome = 'won';
        w.winner = teams.size === 1 ? [...teams][0] : null;
      }
    } else if (!player(w).alive) w.outcome = 'dead';
    else if (w.actors.every((a) => a.team === 'player' || !a.alive)) w.outcome = 'won';
  }
  w.tick++;
}
