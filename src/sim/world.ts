// The match simulation. Deterministic: fixed step, seeded random, no wall-clock time, no rendering.
import { TUNING } from '../config/tuning';
import { BOT_SPAWNS, ROOM_ZERO, ZONE_CENTRES, type BotSpawn } from '../config/map';
import { heroById, type AbilityDef, type HeroDef } from '../config/heroes';
import { BASE_POWER, type Power } from '../config/power';
import { WEAPONS, damageAt, type WeaponDef } from '../config/weapons';
import { angleDiff, cornerAssistDir, resolveCircle, segmentCircleT, type Box } from './geom';
import { blockedByCover, bulletBlockT, markDynamic, parseLevel, sightClear, walkable, type Level } from './level';
import { stepVelocity, type Vec2 } from './sim';
import { NO_SIDEGRADE, type Sidegrade } from './operators';
import type { ViewShape } from './vision';
import { botThink, createBrain, type Brain, type PerceptionEvent } from './bots';
import { outsideCircle, planZone, zoneAt, type ZoneState } from './zone';

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
  view: ViewShape;
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
}

export type SoundType =
  | 'step' | 'quietStep' | 'shot' | 'impact' | 'hit' | 'death' | 'reload' | 'pickup' | 'dash' | 'sonar' | 'barrier' | 'mend'
  | 'windup' | 'burst' | 'scream' | 'shield' | 'frenzy' | 'downed' | 'revive';

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

export type PickupKind = 'health' | 'armor' | 'ammo';

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  active: boolean;
  respawnLeft: number;
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
  sounds: SoundEvent[];
  prevSounds: SoundEvent[];
  hits: HitEvent[];
  pickups: Pickup[];
  barriers: Barrier[];
  brains: Map<number, Brain>;
  /** Ids of bots currently allowed to shoot at the player (cap: TUNING.perception.attackTokens). */
  attackTokens: number[];
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
  const ab = power.signature ?? hero.ability;
  const maxHp = Math.round(hero.maxHp * power.hpMul);
  return {
    id, team, ai: team === 'bot', name, hero, ability: { ...ab, cooldown: ab.cooldown * power.cooldownMul }, power, weapon, view: viewFor(hero, sg), x, y, vx: 0, vy: 0, facing,
    hp: maxHp, maxHp, armor: hero.maxArmor + power.armor, maxArmor: Math.max(hero.maxArmor, 50) + power.armor, alive: true,
    ammo: weapon.magazine, reserve: weapon.reserve, cooldown: 0, reloadLeft: 0, abilityCd: 0, dashLeft: 0, dashX: 0, dashY: 0,
    revealLeft: 0, shieldLeft: 0, frenzyLeft: 0, slowLeft: 0, slowMul: 1, burstLeft: 0, stepAcc: 0, hitFlash: 0, muzzle: 0, deadFor: 0, lastSpread: weapon.spreadDeg, lastHitTick: -999, lastHitFrom: null,
    shots: 0, bullets: 0, hits: 0, kills: 0, damageDealt: 0, damageTaken: 0, death: null, zoneTick: -999,
    downed: false, reviveProgress: 0, downInfo: null, firedLast: false,
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
}

export function createWorld(opts: WorldOptions = {}): World {
  const level = parseLevel(opts.map ?? ROOM_ZERO);
  const seed = (opts.seed ?? TUNING.seed) | 0;
  const brains = new Map<number, Brain>();
  if (opts.versus) {
    const actors = opts.versus.map((v, i) => makeActor(i, v.team, v.name, heroById(v.hero), NO_SIDEGRADE, v.x, v.y, v.facing, v.power));
    const spawns = (['alpha', 'bravo'] as const).map((t) => {
      const m = opts.versus!.filter((v) => v.team === t);
      return { x: m.reduce((a, v) => a + v.x, 0) / Math.max(1, m.length), y: m.reduce((a, v) => a + v.y, 0) / Math.max(1, m.length) };
    });
    return {
      tick: 0, rng: seed, level, actors, bullets: [], sounds: [], prevSounds: [], hits: [],
      pickups: level.pickupSpawns.map((p) => ({ ...p, active: true, respawnLeft: 0 })), barriers: [],
      brains, attackTokens: [], perceptionLog: null, outcome: 'playing', playerKill: null,
      mode: 'versus', winner: null, friendlyFire: !!opts.friendlyFire,
      zone: opts.zone === false ? null : planZone(level, seed, ZONE_CENTRES, TUNING.zone, spawns),
    };
  }
  const actors: Actor[] = [makeActor(0, 'player', 'You', heroById(opts.hero ?? 'kettle'), opts.sidegrade ?? NO_SIDEGRADE, level.playerSpawn.x, level.playerSpawn.y, 0, opts.power)];
  // AI teammates spawn next to the player on free floor, in the same team, with their own bot brain.
  const ps = level.playerSpawn;
  const spots = [[1, 1], [1, -1], [-1, 1], [2, 0], [0, 2], [-1, -1]].map(([dx, dy]) => ({ x: Math.floor(ps.x) + dx + 0.5, y: Math.floor(ps.y) + dy + 0.5 }))
    .filter((q) => walkable(level.tiles[Math.floor(q.y) * level.w + Math.floor(q.x)]));
  (opts.allies ?? []).forEach((m, i) => {
    const q = spots[i % Math.max(1, spots.length)] ?? ps;
    const a = makeActor(actors.length, 'player', m.name, heroById(m.hero), NO_SIDEGRADE, q.x, q.y, 0);
    a.ai = true;
    actors.push(a);
    brains.set(a.id, createBrain({ name: m.name, hero: m.hero, patrol: [[Math.floor(q.x), Math.floor(q.y)]], flanker: i % 2 === 1 }));
  });
  (opts.bots ?? BOT_SPAWNS).forEach((b) => {
    const [tx, ty] = b.patrol[0];
    const a = makeActor(actors.length, 'bot', b.name, heroById(b.hero), NO_SIDEGRADE, tx + 0.5, ty + 0.5, Math.PI);
    actors.push(a);
    brains.set(a.id, createBrain(b));
  });
  return {
    tick: 0, rng: seed, level, actors, bullets: [], sounds: [], prevSounds: [], hits: [],
    pickups: level.pickupSpawns.map((p) => ({ ...p, active: true, respawnLeft: 0 })), barriers: [],
    brains, attackTokens: [], perceptionLog: opts.log ? [] : null, outcome: 'playing', playerKill: null,
    mode: 'solo', winner: null, friendlyFire: !!opts.friendlyFire,
    zone: opts.zone ? planZone(level, seed, ZONE_CENTRES) : null,
  };
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
  return w.actors[0].view.range;
}

export function viewOf(a: Actor): ViewShape {
  return a.view;
}

/** Same hearing rule for bots and the player: within the radius, shrunk when a wall is in between. */
export function hears(l: Level, lx: number, ly: number, s: SoundEvent): boolean {
  const d = Math.hypot(s.x - lx, s.y - ly);
  if (d > s.radius) return false;
  return d <= s.radius * TUNING.sound.wallFactor || sightClear(l, lx, ly, s.x, s.y);
}

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

export const IDLE_INPUT: ActorInput = { moveX: 0, moveY: 0, quiet: false, aim: 0, firing: false, reload: false, ability: false };

const vel: Vec2 = { x: 0, y: 0 };
const move: Vec2 = { x: 0, y: 0 };
// Reused per-actor movement tuning (hero speed scales maxSpeed) so the step allocates nothing.
const moveTuning = { ...TUNING.movement, maxSpeed: TUNING.movement.maxSpeed as number };

function startReload(w: World, a: Actor): void {
  if (a.reloadLeft > 0 || a.ammo >= a.weapon.magazine || a.reserve <= 0) return;
  a.reloadLeft = a.weapon.reloadSeconds;
  emit(w, 'reload', a.x, a.y, TUNING.sound.reload, a);
}

function useAbility(w: World, a: Actor, inp: ActorInput): void {
  const A = TUNING.abilities;
  const ab = a.ability;
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
      const cx = a.x + Math.cos(a.facing) * 1.1, cy = a.y + Math.sin(a.facing) * 1.1;
      // Axis-aligned slab across the facing direction.
      const horizontal = Math.abs(Math.sin(a.facing)) > Math.abs(Math.cos(a.facing));
      const hl = (ab.length ?? A.barrierLength) / 2, hd = A.barrierDepth / 2;
      const box: Box = horizontal
        ? { x0: cx - hl, y0: cy - hd, x1: cx + hl, y1: cy + hd }
        : { x0: cx - hd, y0: cy - hl, x1: cx + hd, y1: cy + hl };
      w.barriers.push({ box, left: ab.seconds ?? A.barrierSeconds, owner: a.id });
      w.level.coverBoxes.push(box);
      w.level.solidBoxes.push(box);
      markDynamic(w.level, box, 1);
      invalidatePaths(w);
      emitAbility(w, 'barrier', cx, cy, TUNING.sound.ability, a);
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
  }
}

/** Living hostiles within r of a with a clear line (walls block signature effects the same way they block bullets). */
function hostilesInSight(w: World, a: Actor, r: number): Actor[] {
  return w.actors.filter((t) => t.alive && !t.downed && t.team !== a.team && Math.hypot(t.x - a.x, t.y - a.y) <= r && sightClear(w.level, a.x, a.y, t.x, t.y));
}

function detonate(w: World, a: Actor): void {
  const ab = a.ability;
  for (const t of hostilesInSight(w, a, ab.radius ?? 0)) {
    if (t.shieldLeft > 0) continue;
    const raw = (ab.amount ?? 0) * a.power.damageMul;
    const m = mitigate(t.armor, raw, ab.armorPen ?? 0);
    t.armor -= m.armor;
    t.hp -= m.hp;
    t.hitFlash = TUNING.render.hitFlash;
    t.lastHitTick = w.tick;
    t.lastHitFrom = { x: a.x, y: a.y };
    a.damageDealt += raw;
    t.damageTaken += m.hp + m.armor;
    const r = t.hp <= 0 ? drop(w, t, { cause: 'shot', killerId: a.id, weapon: ab.name, fromX: a.x, fromY: a.y, toX: t.x, toY: t.y, tick: w.tick }) : null;
    w.hits.push({ target: t.id, by: a.id, x: t.x, y: t.y, fromX: a.x, fromY: a.y, hpDamage: m.hp, armorDamage: m.armor, killed: r === 'out', downed: r === 'downed' });
  }
  emitAbility(w, 'burst', a.x, a.y, TUNING.sound.shot, a);
}

function applyInput(w: World, a: Actor, inp: ActorInput, dt: number): void {
  const M = TUNING.movement;
  // Downed: crawl, nothing else (no fire, reload, ability or pickups). The bleed-out runs in stepRevive.
  if (a.downed) inp = { ...inp, firing: false, reload: false, ability: false, quiet: false, moveX: inp.moveX * TUNING.revive.crawl, moveY: inp.moveY * TUNING.revive.crawl };
  // Holding the trigger (even between shots) counts as firing: a rescuer must let go of it.
  a.firedLast = inp.firing;
  if (isHuman(a)) a.facing = inp.aim;
  else {
    const turn = TUNING.bots.turnRateDegPerSec * DEG * dt;
    const d = angleDiff(a.facing, inp.aim);
    a.facing += Math.max(-turn, Math.min(turn, d));
  }
  a.abilityCd = Math.max(0, a.abilityCd - dt);
  a.revealLeft = Math.max(0, a.revealLeft - dt);
  a.shieldLeft = Math.max(0, a.shieldLeft - dt);
  a.frenzyLeft = Math.max(0, a.frenzyLeft - dt);
  a.slowLeft = Math.max(0, a.slowLeft - dt);
  if (a.burstLeft > 0) {
    a.burstLeft = Math.max(0, a.burstLeft - dt);
    if (a.burstLeft === 0) detonate(w, a);
  }
  if (inp.ability && a.abilityCd === 0) useAbility(w, a, inp);

  const speedMul = a.hero.speed * (a.slowLeft > 0 ? a.slowMul : 1);
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
  const ox = a.x, oy = a.y;
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  resolveCircle(a, M.radius, w.level.solidBoxes);
  if (a.dashLeft <= 0) {
    // Corner assist: never stop dead on a crate/wall edge you are nearly past (CHOG-MAP-001).
    const t = cornerAssistDir(a.x, a.y, M.radius, inp.moveX, inp.moveY, w.level.solidBoxes, M.cornerAssist);
    if (t.x !== 0 || t.y !== 0) {
      const sp = M.maxSpeed * speedMul * M.cornerAssistSpeed * (inp.quiet ? M.quietSpeedScale : 1) * dt;
      a.x += t.x * sp;
      a.y += t.y * sp;
      resolveCircle(a, M.radius, w.level.solidBoxes);
    }
  }
  a.stepAcc += Math.hypot(a.x - ox, a.y - oy);
  if (a.stepAcc >= M.stepDistance) {
    a.stepAcc -= M.stepDistance;
    const quiet = a.dashLeft > 0 || Math.hypot(a.vx, a.vy) <= M.maxSpeed * speedMul * M.quietSpeedScale + 0.05;
    emit(w, quiet ? 'quietStep' : 'step', a.x, a.y, quiet ? TUNING.sound.quietStep : TUNING.sound.runStep, a);
  }

  // Weapon
  const W = a.weapon;
  a.cooldown = Math.max(0, a.cooldown - dt);
  a.muzzle = Math.max(0, a.muzzle - dt);
  a.hitFlash = Math.max(0, a.hitFlash - dt);
  a.lastSpread = W.spreadDeg + TUNING.combat.moveSpreadDeg * Math.min(1, Math.hypot(a.vx, a.vy) / M.maxSpeed);
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
  if (inp.firing && a.cooldown === 0 && a.ammo > 0 && a.shieldLeft === 0) {
    const spread = a.lastSpread * DEG;
    for (let i = 0; i < W.pellets; i++) {
      // Pellets fan evenly across the spread with a little jitter; single shots are random within it.
      const base = W.pellets > 1 ? -spread + (2 * spread * i) / (W.pellets - 1) : 0;
      const jitter = (rand(w) * 2 - 1) * (W.pellets > 1 ? spread / W.pellets : spread);
      const ang = a.facing + base + jitter;
      w.bullets.push({ x: a.x, y: a.y, dx: Math.cos(ang), dy: Math.sin(ang), ox: a.x, oy: a.y, life: W.bulletLife, owner: a.id, weapon: W, alive: true });
    }
    a.ammo--;
    a.shots++;
    a.bullets += W.pellets;
    a.cooldown = W.fireInterval;
    a.muzzle = TUNING.render.muzzleFlash;
    emit(w, 'shot', a.x, a.y, TUNING.sound.shot, a, W.sound);
  }
  if (a.ammo === 0 && !a.downed) startReload(w, a);
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
      if (team === 'bot' && a.team === 'player' && Math.hypot(b.ox - a.x, b.oy - a.y) > a.view.range) continue;
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
  // Gold Shell: the bullet stops on the shell and does nothing (the hit spark still shows where it landed).
  const raw = t.shieldLeft > 0 ? 0
    : damageAt(b.weapon, Math.hypot(hx - b.ox, hy - b.oy)) * (by.ai ? TUNING.bots.damageMul : 1) * by.power.damageMul * (by.frenzyLeft > 0 ? by.ability.amount ?? 1 : 1);
  const m = mitigate(t.armor, raw, b.weapon.armorPen);
  t.armor -= m.armor;
  t.hp -= m.hp;
  t.hitFlash = TUNING.render.hitFlash;
  t.lastHitTick = w.tick;
  t.lastHitFrom = { x: b.ox, y: b.oy };
  t.vx += b.dx * TUNING.combat.knockback;
  t.vy += b.dy * TUNING.combat.knockback;
  by.hits++;
  by.damageDealt += raw;
  t.damageTaken += m.hp + m.armor;
  const r = t.hp <= 0 ? drop(w, t, { cause: 'shot', killerId: by.id, weapon: b.weapon.name, fromX: b.ox, fromY: b.oy, toX: t.x, toY: t.y, tick: w.tick }) : null;
  w.hits.push({ target: t.id, by: by.id, x: hx, y: hy, fromX: b.ox, fromY: b.oy, hpDamage: m.hp, armorDamage: m.armor, killed: r === 'out', downed: r === 'downed' });
  emit(w, 'hit', hx, hy, TUNING.sound.impact, by);
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
    t.vx = t.vy = 0;
    emit(w, 'downed', t.x, t.y, TUNING.sound.death, t);
    return 'downed';
  }
  const credit = t.downInfo ?? info;
  const killer = credit.killerId >= 0 ? w.actors[credit.killerId] : null;
  if (killer && killer.team !== t.team) killer.kills++;
  down(w, t, credit);
  return 'out';
}

export function down(w: World, t: Actor, info: KillInfo): void {
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
    if (a.hp <= 0) down(w, a, { cause: 'zone', killerId: -1, weapon: 'Danger zone', fromX: a.x, fromY: a.y, toX: a.x, toY: a.y, tick: w.tick });
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
  return a.reserve < a.weapon.reserve + a.weapon.magazine * 2;
}

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
      if (p.respawnLeft <= 0) p.active = true;
      continue;
    }
    for (const a of w.actors) {
      if (!a.alive || Math.hypot(a.x - p.x, a.y - p.y) > P.radius || !wants(a, p.kind)) continue;
      if (p.kind === 'health') a.hp = Math.min(hpCeiling(a), a.hp + P.health.amount);
      else if (p.kind === 'armor') a.armor = Math.min(armorCeiling(a), a.armor + P.armor.amount);
      else a.reserve += a.weapon.magazine * P.ammo.mags;
      p.active = false;
      p.respawnLeft = P[p.kind].respawn;
      emit(w, 'pickup', p.x, p.y, TUNING.sound.pickup, a);
      break;
    }
  }
  // After pickups (so a pickup sees the true value): overheal and over-armour drain back to the normal maximum.
  for (const a of w.actors) {
    if (!a.alive || a.downed) continue;
    if (a.hp > a.maxHp) a.hp = Math.max(a.maxHp, a.hp - P.overhealDecay * dt);
    if (a.armor > a.maxArmor) a.armor = Math.max(a.maxArmor, a.armor - P.overArmorDecay * dt);
  }
}

/**
 * Downed and revive (team modes, TUNING.revive). Downed actors bleed out; a standing teammate in range who did not
 * fire this step revives them; a hit on either resets the progress. A team with nobody standing is out: every downed
 * member is eliminated (kill credit to whoever downed them).
 */
function stepRevive(w: World, dt: number): void {
  const R = TUNING.revive;
  for (const t of w.actors) {
    if (!t.alive || !t.downed) continue;
    const helper = w.actors.find((m) => m !== t && m.team === t.team && standing(m) && !m.firedLast && Math.hypot(m.x - t.x, m.y - t.y) <= R.range);
    const hitNow = t.lastHitTick === w.tick || (helper && helper.lastHitTick === w.tick);
    if (helper && !hitNow) {
      t.reviveProgress += dt;
      if (t.reviveProgress >= R.seconds) {
        t.downed = false;
        t.downInfo = null;
        t.reviveProgress = 0;
        t.hp = Math.round(t.maxHp * R.hpShare);
        emit(w, 'revive', t.x, t.y, TUNING.sound.reload, helper);
        continue;
      }
    } else t.reviveProgress = 0;
    t.hp -= (R.downHp / R.bleedSeconds) * dt;
    if (t.hp <= 0) drop(w, t, t.downInfo ?? { cause: 'shot', killerId: -1, weapon: 'Bled out', fromX: t.x, fromY: t.y, toX: t.x, toY: t.y, tick: w.tick });
  }
  for (const t of w.actors) {
    if (!t.downed || !t.alive) continue;
    if (!w.actors.some((m) => m.team === t.team && standing(m))) drop(w, t, t.downInfo!);
  }
}

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
  if (viewer.revealLeft <= 0) return [];
  const R = viewer.ability.radius ?? TUNING.abilities.sonarRadius;
  return w.actors.filter((a) => a.alive && a.team !== viewer.team && Math.hypot(a.x - viewer.x, a.y - viewer.y) <= R);
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
  stepZone(w, dt);
  stepPickups(w, dt);
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
