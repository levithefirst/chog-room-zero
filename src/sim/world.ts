// The match simulation. Deterministic: fixed step, seeded random, no wall-clock time, no rendering.
import { TUNING } from '../config/tuning';
import { BOT_SPAWNS, ROOM_ZERO } from '../config/map';
import { angleDiff, resolveCircle, segmentBoxT, segmentCircleT } from './geom';
import { parseLevel, sightClear, type Level } from './level';
import { stepVelocity, type Vec2 } from './sim';
import { DEFAULT_OPERATOR, type Operator } from './operators';
import type { ViewShape } from './vision';
import { botThink, createBrain, type Brain } from './bots';

const DEG = Math.PI / 180;

export type Team = 'player' | 'bot';

export interface ActorInput {
  moveX: number;
  moveY: number;
  quiet: boolean;
  aim: number;
  firing: boolean;
  reload: boolean;
}

export interface Actor {
  id: number;
  team: Team;
  name: string;
  op: Operator;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  alive: boolean;
  ammo: number;
  cooldown: number;
  reloadLeft: number;
  stepAcc: number;
  // Presentation timers, counted in sim time so replays look the same.
  hitFlash: number;
  muzzle: number;
  lastSpread: number;
  lastHitTick: number;
  lastHitFrom: Vec2 | null;
  shots: number;
  hits: number;
  kills: number;
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
  alive: boolean;
}

export type SoundType = 'step' | 'quietStep' | 'shot' | 'impact' | 'hit' | 'death' | 'reload';

/** The one sound event bus: feeds audio, bot hearing, and the player's heard markers. */
export interface SoundEvent {
  type: SoundType;
  x: number;
  y: number;
  radius: number;
  sourceId: number;
  team: Team;
  tick: number;
}

export interface HitEvent {
  target: number;
  by: number;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  killed: boolean;
}

export interface KillInfo {
  killerId: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  tick: number;
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
  brains: Map<number, Brain>;
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

function makeActor(id: number, team: Team, name: string, op: Operator, x: number, y: number, facing: number): Actor {
  return {
    id, team, name, op, x, y, vx: 0, vy: 0, facing,
    hp: TUNING.combat.maxHp, alive: true, ammo: op.magazine, cooldown: 0, reloadLeft: 0, stepAcc: 0,
    hitFlash: 0, muzzle: 0, lastSpread: op.spreadDeg, lastHitTick: -999, lastHitFrom: null, shots: 0, hits: 0, kills: 0,
  };
}

export interface WorldOptions {
  seed?: number;
  playerOp?: Operator;
  map?: readonly string[];
  bots?: typeof BOT_SPAWNS;
}

export function createWorld(opts: WorldOptions = {}): World {
  const level = parseLevel(opts.map ?? ROOM_ZERO);
  const actors: Actor[] = [makeActor(0, 'player', 'You', opts.playerOp ?? DEFAULT_OPERATOR, level.playerSpawn.x, level.playerSpawn.y, 0)];
  const brains = new Map<number, Brain>();
  (opts.bots ?? BOT_SPAWNS).forEach((b, i) => {
    const [tx, ty] = b.patrol[0];
    const a = makeActor(i + 1, 'bot', b.name, DEFAULT_OPERATOR, tx + 0.5, ty + 0.5, Math.PI);
    actors.push(a);
    brains.set(a.id, createBrain(b));
  });
  return {
    tick: 0, rng: (opts.seed ?? TUNING.seed) | 0, level, actors, bullets: [], sounds: [], prevSounds: [], hits: [],
    brains, outcome: 'playing', playerKill: null,
  };
}

export function player(w: World): Actor {
  return w.actors[0];
}

export function viewOf(a: Actor): ViewShape {
  if (a.team === 'bot') return { range: TUNING.bots.sightRange, coneRad: TUNING.bots.sightConeDeg * DEG, nearRadius: TUNING.vision.nearRadius };
  return { range: a.op.range, coneRad: a.op.coneDeg * DEG, nearRadius: TUNING.vision.nearRadius };
}

/** Same hearing rule for bots and the player: within the radius, shrunk when a wall is in between. */
export function hears(l: Level, lx: number, ly: number, s: SoundEvent): boolean {
  const d = Math.hypot(s.x - lx, s.y - ly);
  if (d > s.radius) return false;
  return d <= s.radius * TUNING.sound.wallFactor || sightClear(l, lx, ly, s.x, s.y);
}

function emit(w: World, type: SoundType, x: number, y: number, radius: number, src: Actor): void {
  w.sounds.push({ type, x, y, radius, sourceId: src.id, team: src.team, tick: w.tick });
}

export const IDLE_INPUT: ActorInput = { moveX: 0, moveY: 0, quiet: false, aim: 0, firing: false, reload: false };

const vel: Vec2 = { x: 0, y: 0 };
const move: Vec2 = { x: 0, y: 0 };

function applyInput(w: World, a: Actor, inp: ActorInput, dt: number): void {
  const M = TUNING.movement;
  if (a.team === 'player') a.facing = inp.aim;
  else {
    const turn = TUNING.bots.turnRateDegPerSec * DEG * dt;
    const d = angleDiff(a.facing, inp.aim);
    a.facing += Math.max(-turn, Math.min(turn, d));
  }
  move.x = inp.moveX;
  move.y = inp.moveY;
  stepVelocity(a.vx, a.vy, move, dt, M, inp.quiet ? M.quietSpeedScale : 1, vel);
  a.vx = vel.x;
  a.vy = vel.y;
  const ox = a.x, oy = a.y;
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  resolveCircle(a, M.radius, w.level.solidBoxes);
  const moved = Math.hypot(a.x - ox, a.y - oy);
  a.stepAcc += moved;
  if (a.stepAcc >= M.stepDistance) {
    a.stepAcc -= M.stepDistance;
    const quiet = Math.hypot(a.vx, a.vy) <= M.maxSpeed * M.quietSpeedScale + 0.05;
    emit(w, quiet ? 'quietStep' : 'step', a.x, a.y, quiet ? TUNING.sound.quietStep : TUNING.sound.runStep, a);
  }

  // Weapon
  a.cooldown = Math.max(0, a.cooldown - dt);
  a.muzzle = Math.max(0, a.muzzle - dt);
  a.hitFlash = Math.max(0, a.hitFlash - dt);
  const speedShare = Math.hypot(a.vx, a.vy) / M.maxSpeed;
  a.lastSpread = a.op.spreadDeg + TUNING.combat.moveSpreadDeg * speedShare;
  if (a.reloadLeft > 0) {
    a.reloadLeft -= dt;
    if (a.reloadLeft <= 0) {
      a.reloadLeft = 0;
      a.ammo = a.op.magazine;
    }
    return;
  }
  if (inp.reload && a.ammo < a.op.magazine) {
    a.reloadLeft = a.op.reloadSeconds;
    emit(w, 'reload', a.x, a.y, TUNING.sound.reload, a);
    return;
  }
  if (inp.firing && a.cooldown === 0) {
    const ang = a.facing + (rand(w) * 2 - 1) * a.lastSpread * DEG;
    w.bullets.push({ x: a.x, y: a.y, dx: Math.cos(ang), dy: Math.sin(ang), ox: a.x, oy: a.y, life: TUNING.combat.bulletLife, owner: a.id, alive: true });
    a.ammo--;
    a.shots++;
    a.cooldown = a.op.fireInterval;
    a.muzzle = TUNING.render.muzzleFlash;
    emit(w, 'shot', a.x, a.y, TUNING.sound.shot, a);
    if (a.ammo === 0) {
      a.reloadLeft = a.op.reloadSeconds;
      emit(w, 'reload', a.x, a.y, TUNING.sound.reload, a);
    }
  }
}

function stepBullets(w: World, dt: number): void {
  const C = TUNING.combat;
  const r = TUNING.movement.radius;
  for (const b of w.bullets) {
    if (!b.alive) continue;
    const nx = b.x + b.dx * C.bulletSpeed * dt;
    const ny = b.y + b.dy * C.bulletSpeed * dt;
    let bestT = 2;
    let target: Actor | null = null;
    for (const box of w.level.solidBoxes) {
      const t = segmentBoxT(b.x, b.y, nx, ny, box);
      if (t >= 0 && t < bestT) bestT = t;
    }
    for (const a of w.actors) {
      if (!a.alive || a.id === b.owner) continue;
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
      else emit(w, 'impact', hx, hy, TUNING.sound.impact, shooter);
      continue;
    }
    b.x = nx;
    b.y = ny;
    b.life -= dt;
    if (b.life <= 0) b.alive = false;
  }
  // Compact in place: no new array per tick.
  let j = 0;
  for (const b of w.bullets) if (b.alive) w.bullets[j++] = b;
  w.bullets.length = j;
}

function damage(w: World, t: Actor, by: Actor, b: Bullet, hx: number, hy: number): void {
  const C = TUNING.combat;
  t.hp -= C.damage;
  t.hitFlash = TUNING.render.hitFlash;
  t.lastHitTick = w.tick;
  t.lastHitFrom = { x: b.ox, y: b.oy };
  t.vx += b.dx * C.knockback;
  t.vy += b.dy * C.knockback;
  by.hits++;
  const killed = t.hp <= 0;
  w.hits.push({ target: t.id, by: by.id, x: hx, y: hy, fromX: b.ox, fromY: b.oy, killed });
  emit(w, 'hit', hx, hy, TUNING.sound.impact, by);
  if (killed) {
    t.hp = 0;
    t.alive = false;
    t.vx = t.vy = 0;
    by.kills++;
    emit(w, 'death', t.x, t.y, TUNING.sound.death, t);
    if (t.team === 'player') w.playerKill = { killerId: by.id, fromX: b.ox, fromY: b.oy, toX: t.x, toY: t.y, tick: w.tick };
  }
}

/** Advance one fixed step with the player's input. Bots decide their own input from what they perceive. */
export function stepWorld(w: World, playerInput: ActorInput, dt: number = TUNING.simStepSeconds): void {
  w.prevSounds = w.sounds;
  w.sounds = [];
  w.hits = [];
  for (const a of w.actors) {
    if (!a.alive) continue;
    const inp = a.team === 'player' ? playerInput : botThink(w, a, w.brains.get(a.id)!, dt);
    applyInput(w, a, inp, dt);
  }
  stepBullets(w, dt);
  if (w.outcome === 'playing') {
    if (!player(w).alive) w.outcome = 'dead';
    else if (w.actors.every((a) => a.team === 'player' || !a.alive)) w.outcome = 'won';
  }
  w.tick++;
}
