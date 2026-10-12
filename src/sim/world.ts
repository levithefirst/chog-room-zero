// The match simulation. Deterministic: fixed step, seeded random, no wall-clock time, no rendering.
import { TUNING } from '../config/tuning';
import { BOT_SPAWNS, ROOM_ZERO, type BotSpawn } from '../config/map';
import { heroById, type HeroDef } from '../config/heroes';
import { WEAPONS, damageAt, type WeaponDef } from '../config/weapons';
import { angleDiff, cornerAssistDir, resolveCircle, segmentCircleT, type Box } from './geom';
import { blockedByCover, bulletBlockT, markDynamic, parseLevel, sightClear, type Level } from './level';
import { stepVelocity, type Vec2 } from './sim';
import { NO_SIDEGRADE, type Sidegrade } from './operators';
import type { ViewShape } from './vision';
import { botThink, createBrain, type Brain, type PerceptionEvent } from './bots';

const DEG = Math.PI / 180;

export type Team = 'player' | 'bot';

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
  name: string;
  hero: HeroDef;
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
  | 'step' | 'quietStep' | 'shot' | 'impact' | 'hit' | 'death' | 'reload' | 'pickup' | 'dash' | 'sonar' | 'barrier' | 'mend';

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
}

export interface KillInfo {
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

function makeActor(id: number, team: Team, name: string, hero: HeroDef, sg: Sidegrade, x: number, y: number, facing: number): Actor {
  const weapon = weaponFor(hero, sg);
  return {
    id, team, name, hero, weapon, view: viewFor(hero, sg), x, y, vx: 0, vy: 0, facing,
    hp: hero.maxHp, maxHp: hero.maxHp, armor: hero.maxArmor, maxArmor: Math.max(hero.maxArmor, 50), alive: true,
    ammo: weapon.magazine, reserve: weapon.reserve, cooldown: 0, reloadLeft: 0, abilityCd: 0, dashLeft: 0, dashX: 0, dashY: 0,
    revealLeft: 0, stepAcc: 0, hitFlash: 0, muzzle: 0, deadFor: 0, lastSpread: weapon.spreadDeg, lastHitTick: -999, lastHitFrom: null,
    shots: 0, bullets: 0, hits: 0, kills: 0, damageDealt: 0, damageTaken: 0,
  };
}

export interface WorldOptions {
  seed?: number;
  hero?: string;
  sidegrade?: Sidegrade;
  map?: readonly string[];
  bots?: BotSpawn[];
  log?: boolean;
}

export function createWorld(opts: WorldOptions = {}): World {
  const level = parseLevel(opts.map ?? ROOM_ZERO);
  const actors: Actor[] = [makeActor(0, 'player', 'You', heroById(opts.hero ?? 'kettle'), opts.sidegrade ?? NO_SIDEGRADE, level.playerSpawn.x, level.playerSpawn.y, 0)];
  const brains = new Map<number, Brain>();
  (opts.bots ?? BOT_SPAWNS).forEach((b, i) => {
    const [tx, ty] = b.patrol[0];
    const a = makeActor(i + 1, 'bot', b.name, heroById(b.hero), NO_SIDEGRADE, tx + 0.5, ty + 0.5, Math.PI);
    actors.push(a);
    brains.set(a.id, createBrain(b));
  });
  return {
    tick: 0, rng: (opts.seed ?? TUNING.seed) | 0, level, actors, bullets: [], sounds: [], prevSounds: [], hits: [],
    pickups: level.pickupSpawns.map((p) => ({ ...p, active: true, respawnLeft: 0 })), barriers: [],
    brains, attackTokens: [], perceptionLog: opts.log ? [] : null, outcome: 'playing', playerKill: null,
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
  const ab = a.hero.ability;
  a.abilityCd = ab.cooldown;
  switch (ab.kind) {
    case 'dash': {
      let dx = inp.moveX, dy = inp.moveY;
      const d = Math.hypot(dx, dy);
      if (d === 0) { dx = Math.cos(a.facing); dy = Math.sin(a.facing); } else { dx /= d; dy /= d; }
      a.dashLeft = A.dashSeconds;
      a.dashX = dx;
      a.dashY = dy;
      emit(w, 'dash', a.x, a.y, TUNING.sound.quietStep, a);
      break;
    }
    case 'sonar':
      a.revealLeft = A.sonarSeconds;
      emit(w, 'sonar', a.x, a.y, A.sonarSound, a);
      break;
    case 'barrier': {
      const cx = a.x + Math.cos(a.facing) * 1.1, cy = a.y + Math.sin(a.facing) * 1.1;
      // Axis-aligned slab across the facing direction.
      const horizontal = Math.abs(Math.sin(a.facing)) > Math.abs(Math.cos(a.facing));
      const hl = A.barrierLength / 2, hd = A.barrierDepth / 2;
      const box: Box = horizontal
        ? { x0: cx - hl, y0: cy - hd, x1: cx + hl, y1: cy + hd }
        : { x0: cx - hd, y0: cy - hl, x1: cx + hd, y1: cy + hl };
      w.barriers.push({ box, left: A.barrierSeconds, owner: a.id });
      w.level.coverBoxes.push(box);
      w.level.solidBoxes.push(box);
      markDynamic(w.level, box, 1);
      invalidatePaths(w);
      emit(w, 'barrier', cx, cy, TUNING.sound.ability, a);
      break;
    }
    case 'mend':
      a.hp = Math.min(a.maxHp, a.hp + A.mendAmount);
      emit(w, 'mend', a.x, a.y, TUNING.sound.reload, a);
      break;
  }
}

function applyInput(w: World, a: Actor, inp: ActorInput, dt: number): void {
  const M = TUNING.movement;
  if (a.team === 'player') a.facing = inp.aim;
  else {
    const turn = TUNING.bots.turnRateDegPerSec * DEG * dt;
    const d = angleDiff(a.facing, inp.aim);
    a.facing += Math.max(-turn, Math.min(turn, d));
  }
  a.abilityCd = Math.max(0, a.abilityCd - dt);
  a.revealLeft = Math.max(0, a.revealLeft - dt);
  if (inp.ability && a.abilityCd === 0) useAbility(w, a, inp);

  const speedMul = a.hero.speed;
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
  if (inp.firing && a.cooldown === 0 && a.ammo > 0) {
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
  if (a.ammo === 0) startReload(w, a);
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
      // hostile elimination is a player kill and "Hostiles down" always equals the player's kills.
      if (!a.alive || a.id === b.owner || a.team === team) continue;
      // Damage range cap: a bot bullet fired from beyond the player's sight distance never hurts the player.
      if (team === 'bot' && a.team === 'player' && Math.hypot(b.ox - a.x, b.oy - a.y) > playerSightRange(w)) continue;
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
  const raw = damageAt(b.weapon, Math.hypot(hx - b.ox, hy - b.oy)) * (by.team === 'bot' ? TUNING.bots.damageMul : 1);
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
  const killed = t.hp <= 0;
  w.hits.push({ target: t.id, by: by.id, x: hx, y: hy, fromX: b.ox, fromY: b.oy, hpDamage: m.hp, armorDamage: m.armor, killed });
  emit(w, 'hit', hx, hy, TUNING.sound.impact, by);
  if (killed) {
    t.hp = 0;
    t.alive = false;
    { const ti = w.attackTokens.indexOf(t.id); if (ti >= 0) w.attackTokens.splice(ti, 1); }
    t.vx = t.vy = 0;
    by.kills++;
    emit(w, 'death', t.x, t.y, TUNING.sound.death, t);
    if (t.team === 'player') w.playerKill = { killerId: by.id, weapon: b.weapon.name, fromX: b.ox, fromY: b.oy, toX: t.x, toY: t.y, tick: w.tick };
  }
}

/** Does `a` want this pickup? Nobody wastes one they cannot use. */
export function wants(a: Actor, kind: PickupKind): boolean {
  if (kind === 'health') return a.hp < a.maxHp;
  if (kind === 'armor') return a.armor < a.maxArmor;
  return a.reserve < a.weapon.reserve + a.weapon.magazine * 2;
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
      if (p.kind === 'health') a.hp = Math.min(a.maxHp, a.hp + P.health.amount);
      else if (p.kind === 'armor') a.armor = Math.min(a.maxArmor, a.armor + P.armor.amount);
      else a.reserve += a.weapon.magazine * P.ammo.mags;
      p.active = false;
      p.respawnLeft = P[p.kind].respawn;
      emit(w, 'pickup', p.x, p.y, TUNING.sound.pickup, a);
      break;
    }
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
  const R = TUNING.abilities.sonarRadius;
  return w.actors.filter((a) => a.alive && a.team !== viewer.team && Math.hypot(a.x - viewer.x, a.y - viewer.y) <= R);
}

/** Advance one fixed step with the player's input. Bots decide their own input from what they perceive. */
export function stepWorld(
  w: World, playerInput: ActorInput, dt: number = TUNING.simStepSeconds,
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
    const inp = a.team === 'player' ? playerInput : (botInput?.(a) ?? botThink(w, a, w.brains.get(a.id)!, dt));
    applyInput(w, a, inp, dt);
  }
  stepBullets(w, dt);
  stepPickups(w, dt);
  stepBarriers(w, dt);
  if (w.outcome === 'playing') {
    if (!player(w).alive) w.outcome = 'dead';
    else if (w.actors.every((a) => a.team === 'player' || !a.alive)) w.outcome = 'won';
  }
  w.tick++;
}
