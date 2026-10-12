// Bot decisions. Bots only know what they see in their own cone (walls block it) and what they hear
// on the shared sound bus. They never read the player's position or input directly.
import { TUNING } from '../config/tuning';
import type { BotSpawn } from '../config/map';
import { angleDiff } from './geom';
import { findPath, shotClear, sightClear } from './level';
import { canSee, muzzleFlashSeen } from './vision';
import { hears, player, rand, revealed, viewOf, type Actor, type ActorInput, type World } from './world';

const DEG = Math.PI / 180;

export type BotState = 'patrol' | 'investigate' | 'alert' | 'engage' | 'cover' | 'pursue' | 'search' | 'heal';

export interface Brain {
  state: BotState;
  patrol: { x: number; y: number }[];
  patrolIndex: number;
  flanker: boolean;
  timer: number;
  seenFor: number;
  engagedFor: number;
  aimOffset: number;
  aimTimer: number;
  // What it believes, not the truth.
  lastKnown: { x: number; y: number } | null;
  goal: { x: number; y: number } | null;
  path: { x: number; y: number }[];
  stuckTimer: number;
  /** Re-plans spent on the current goal after getting stuck (CHOG-AI-001). */
  stuckRepaths: number;
  /** Tiles found blocked while chasing the current goal (excluded from its re-plans). */
  avoid: number[];
  /** Where the current stuck-check window started (progress-based, not velocity-based). */
  stuckFrom: { x: number; y: number };
  lookBase: number;
  // Debug and tests: what it perceived this tick.
  sawPlayer: boolean;
  heardAt: { x: number; y: number } | null;
  /** Where its current belief came from. Bots never learn the player position without one of these. */
  source: PerceptionSource | null;
  /** 0..1: how sure it is something is out there; decays to 0 over TUNING.perception.memorySeconds. */
  suspicion: number;
  /** Seconds of sight needed before it may fire this acquisition (seeded, per acquisition). */
  reaction: number;
  /** Last path request time (s of sim time) for repath throttling. */
  pathAt: number;
}

export type PerceptionSource = 'seen' | 'flash' | 'heard' | 'shot' | 'sonar' | 'memory';

/** One acquisition: a bot updated its belief about the player from a signal. Logged for the omniscience test. */
export interface PerceptionEvent {
  tick: number;
  bot: number;
  source: Exclude<PerceptionSource, 'memory'>;
  x: number;
  y: number;
  /** Evidence snapshot at the moment of learning: observer pose and the true player position. */
  ox: number;
  oy: number;
  ofacing: number;
  px: number;
  py: number;
}

export function createBrain(spawn: BotSpawn): Brain {
  return {
    state: 'patrol',
    patrol: spawn.patrol.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })),
    patrolIndex: 0, flanker: spawn.flanker, timer: 0, seenFor: 0, engagedFor: 0, aimOffset: 0, aimTimer: 0,
    lastKnown: null, goal: null, path: [], stuckTimer: 0, stuckRepaths: 0, avoid: [], stuckFrom: { x: 0, y: 0 }, lookBase: 0, sawPlayer: false, heardAt: null,
    source: null, suspicion: 0, reaction: TUNING.perception.reactionMax, pathAt: -1e9,
  };
}

const out: ActorInput = { moveX: 0, moveY: 0, quiet: false, aim: 0, firing: false, reload: false, ability: false };

function setGoal(w: World, a: Actor, br: Brain, gx: number, gy: number): void {
  if (br.goal && Math.floor(br.goal.x) === Math.floor(gx) && Math.floor(br.goal.y) === Math.floor(gy) && br.path.length) return;
  // Throttle: a moving target does not trigger A* every tick (P3 audit: 65 calls/s at 6 actors).
  const P = TUNING.perception;
  const now = w.tick * TUNING.simStepSeconds;
  if (br.goal && br.path.length && now - br.pathAt < P.repathSeconds && Math.hypot(br.goal.x - gx, br.goal.y - gy) < P.repathDistance) return;
  br.goal = { x: gx, y: gy };
  br.path = findPath(w.level, a.x, a.y, gx, gy);
  br.pathAt = now;
  br.stuckTimer = 0;
  br.stuckRepaths = 0;
  br.avoid.length = 0;
}

/** Record a belief update with its signal. */
function learn(w: World, a: Actor, br: Brain, source: PerceptionEvent['source'], x: number, y: number, suspicion: number): void {
  br.lastKnown = { x, y };
  br.source = source;
  br.suspicion = Math.max(br.suspicion, suspicion);
  if (w.perceptionLog) {
    const p = player(w);
    w.perceptionLog.push({ tick: w.tick, bot: a.id, source, x, y, ox: a.x, oy: a.y, ofacing: a.facing, px: p.x, py: p.y });
  }
}

/** Release or take an attack token. Returns whether this bot may shoot the player now. */
function token(w: World, a: Actor, want: boolean): boolean {
  const i = w.attackTokens.indexOf(a.id);
  if (!want) {
    if (i >= 0) w.attackTokens.splice(i, 1);
    return false;
  }
  if (i >= 0) return true;
  if (w.attackTokens.length < TUNING.perception.attackTokens) {
    w.attackTokens.push(a.id);
    return true;
  }
  return false;
}

/** Steer along the path. Returns true when the goal is reached (or unreachable). */
function follow(w: World, a: Actor, br: Brain, dt: number): boolean {
  while (br.path.length && Math.hypot(br.path[0].x - a.x, br.path[0].y - a.y) < 0.3) br.path.shift();
  if (!br.path.length) {
    out.moveX = out.moveY = 0;
    return true;
  }
  const n = br.path[0];
  const dx = n.x - a.x, dy = n.y - a.y;
  const d = Math.hypot(dx, dy);
  out.moveX = dx / d;
  out.moveY = dy / d;
  out.aim = Math.atan2(dy, dx);
  // Stuck = less than 0.25 u of real progress in 1 s. (Velocity alone misses a bot grinding on a box corner,
  // which keeps a sliding velocity while going nowhere.)
  if (br.stuckTimer === 0) { br.stuckFrom.x = a.x; br.stuckFrom.y = a.y; }
  br.stuckTimer += dt;
  if (br.stuckTimer > 1 && Math.hypot(a.x - br.stuckFrom.x, a.y - br.stuckFrom.y) >= 0.25) br.stuckTimer = 0;
  if (br.stuckTimer > 1) {
    br.stuckTimer = 0;
    // Stuck (CHOG-AI-001): something the nav grid does not know is in the way (a body, a slab edge). Re-plan once
    // with the blocked waypoint's tile excluded; only if that also fails, give up on this goal ("arrive").
    if (br.goal && br.stuckRepaths < TUNING.bots.stuckRepaths) {
      br.stuckRepaths++;
      const l = w.level;
      br.avoid.push(Math.floor(n.y) * l.w + Math.floor(n.x));
      for (const i of br.avoid) l.dyn[i]++;
      br.path = findPath(l, a.x, a.y, br.goal.x, br.goal.y);
      for (const i of br.avoid) l.dyn[i]--;
      br.pathAt = w.tick * TUNING.simStepSeconds;
      if (br.path.length) return false;
    }
    br.path = [];
    return true;
  }
  return false;
}

/** Nearest cover spot (by straight distance, within 9 u) that the threat position cannot see. */
function pickCover(w: World, a: Actor, threat: { x: number; y: number }): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = 9;
  for (const s of w.level.coverSpots) {
    const d = Math.hypot(s.x - a.x, s.y - a.y);
    if (d >= bestD || d < 1) continue;
    if (sightClear(w.level, threat.x, threat.y, s.x, s.y) && shotClear(w.level, threat.x, threat.y, s.x, s.y)) continue;
    bestD = d;
    best = s;
  }
  return best;
}

/** A flank spot near the target, approached from a side angle rather than straight on. */
function pickFlank(w: World, a: Actor, target: { x: number; y: number }): { x: number; y: number } {
  const direct = Math.atan2(target.y - a.y, target.x - a.x);
  let best = target;
  let bestScore = 0;
  for (const s of w.level.coverSpots) {
    const d = Math.hypot(s.x - target.x, s.y - target.y);
    if (d < 2 || d > 6 || !sightClear(w.level, s.x, s.y, target.x, target.y)) continue;
    const side = Math.abs(angleDiff(direct, Math.atan2(target.y - s.y, target.x - s.x)));
    if (side > bestScore) {
      bestScore = side;
      best = s;
    }
  }
  return best;
}

export function botThink(w: World, a: Actor, br: Brain, dt: number): ActorInput {
  const B = TUNING.bots;
  const p = player(w);
  out.firing = false;
  out.reload = false;
  out.ability = false;
  out.quiet = false;
  out.aim = a.facing;
  out.moveX = out.moveY = 0;

  // Perception (docs/design/bots.md). Every belief about the player comes from a signal, logged by learn().
  const P = TUNING.perception;
  br.sawPlayer = p.alive && canSee(w.level, a.x, a.y, a.facing, viewOf(a), p.x, p.y);
  br.heardAt = null;
  br.suspicion = Math.max(0, br.suspicion - dt / P.memorySeconds);
  if (br.sawPlayer) {
    if (br.seenFor === 0 && br.state !== 'engage') br.reaction = P.reactionMin + rand(w) * (P.reactionMax - P.reactionMin);
    br.seenFor += dt;
    learn(w, a, br, 'seen', p.x, p.y, 1);
  } else {
    br.seenFor = Math.max(0, br.seenFor - dt * 2);
    if (br.source === 'seen') br.source = 'memory';
  }
  let flashed = false;
  for (const s of w.prevSounds) {
    if (s.team !== 'player') continue;
    // Muzzle flash: same rule as the player's (vision.ts muzzleFlashSeen), any range with wall line of sight.
    if (s.type === 'shot' && !br.sawPlayer && muzzleFlashSeen(w.level, a.x, a.y, s.x, s.y)) {
      learn(w, a, br, 'flash', s.x, s.y, 0.9);
      flashed = true;
      continue;
    }
    if (!hears(w.level, a.x, a.y, s)) continue;
    // Heard positions are uncertain: further away means a wider guess.
    const d = Math.hypot(s.x - a.x, s.y - a.y);
    const err = d * P.hearErrorShare;
    br.heardAt = { x: s.x + (rand(w) * 2 - 1) * err, y: s.y + (rand(w) * 2 - 1) * err };
  }
  if (br.heardAt && !br.sawPlayer && !flashed) learn(w, a, br, 'heard', br.heardAt.x, br.heardAt.y, 0.6);
  if (br.suspicion === 0 && !br.sawPlayer && br.lastKnown && (br.state === 'patrol')) {
    br.lastKnown = null;
    br.source = null;
  }
  const justHit = a.lastHitTick === w.tick - 1 && a.lastHitFrom;
  const hurt = a.hp / a.maxHp < B.retreatHpShare;

  // Transitions.
  if (br.sawPlayer && br.state !== 'cover' && br.state !== 'engage' && br.state !== 'alert') {
    br.state = 'alert';
  }
  if (flashed && (br.state === 'patrol' || br.state === 'investigate' || br.state === 'search')) {
    // Saw a flash: turn and go look, like an alert without sight.
    br.state = 'pursue';
    br.goal = null;
  }
  if (br.state === 'alert' && br.seenFor >= br.reaction) {
    br.state = 'engage';
    br.engagedFor = 0;
  }
  if (justHit && a.lastHitFrom) {
    if (!br.sawPlayer) {
      // Being shot gives a direction, not a position: a guess along the incoming ray.
      const d = Math.hypot(a.lastHitFrom.x - a.x, a.lastHitFrom.y - a.y);
      const ang = Math.atan2(a.lastHitFrom.y - a.y, a.lastHitFrom.x - a.x) + (rand(w) * 2 - 1) * P.shotDirErrorDeg * DEG;
      const r = d * (P.shotRangeMin + rand(w) * (P.shotRangeMax - P.shotRangeMin));
      learn(w, a, br, 'shot', a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r, 0.8);
    }
    if (hurt) {
      br.state = 'cover';
      br.timer = 0;
      br.goal = null;
    } else if (br.state !== 'engage') {
      br.state = br.sawPlayer ? 'engage' : 'pursue';
      br.goal = null;
    }
  }
  if (br.heardAt && (br.state === 'patrol' || br.state === 'investigate' || br.state === 'search')) {
    br.state = 'investigate';
    br.lastKnown = br.heardAt;
    br.goal = null;
    br.timer = 0;
  }

  // Hurt and not under fire right now: go for the nearest health pickup if one is up.
  if (hurt && !br.sawPlayer && br.state !== 'heal' && br.state !== 'alert') {
    const hp = nearestHealth(w, a);
    if (hp) {
      br.state = 'heal';
      br.goal = null;
    }
  }
  // Abilities, used for a readable reason.
  if (a.abilityCd === 0) {
    const k = a.hero.ability.kind;
    if (k === 'mend' && a.hp < a.maxHp * 0.6) out.ability = true;
    if (k === 'dash' && br.state === 'cover' && br.path.length > 2) out.ability = true;
    if (k === 'sonar' && (br.state === 'investigate' || br.state === 'search') && br.timer > 0.5) out.ability = true;
    if (k === 'barrier' && br.state === 'engage' && (justHit || a.hp < a.maxHp * 0.7)) out.ability = true;
  }
  // Its own sonar shows the player like it shows bots to the player: a fair, telegraphed reveal.
  if (a.revealLeft > 0 && revealed(w, a).length) {
    learn(w, a, br, 'sonar', p.x, p.y, 1);
    if (br.state === 'investigate' || br.state === 'search' || br.state === 'patrol') {
      br.state = 'pursue';
      br.goal = null;
    }
  }

  if (br.state !== 'engage' || !a.alive) token(w, a, false);
  switch (br.state) {
    case 'heal': {
      const hp = nearestHealth(w, a);
      if (!hp || br.sawPlayer) {
        br.state = br.sawPlayer ? 'engage' : 'patrol';
        br.goal = null;
        break;
      }
      setGoal(w, a, br, hp.x, hp.y);
      follow(w, a, br, dt);
      break;
    }
    case 'patrol': {
      out.quiet = B.patrolQuiet;
      const target = br.patrol[br.patrolIndex];
      setGoal(w, a, br, target.x, target.y);
      if (follow(w, a, br, dt)) {
        br.timer += dt;
        out.aim = br.lookBase + Math.sin(br.timer * 1.5) * 0.6;
        if (br.timer > 1.2) {
          br.timer = 0;
          br.patrolIndex = (br.patrolIndex + 1) % br.patrol.length;
          br.goal = null;
        }
      } else br.lookBase = out.aim;
      break;
    }
    case 'investigate':
    case 'search': {
      const t = br.lastKnown!;
      setGoal(w, a, br, t.x, t.y);
      if (follow(w, a, br, dt)) {
        if (br.timer === 0) br.lookBase = a.facing;
        br.timer += dt;
        out.aim = br.lookBase + Math.sin(br.timer * 2.2) * 1.4;
        const limit = br.state === 'search' ? B.searchSeconds : B.investigateLookSeconds;
        if (br.timer > limit) {
          br.state = 'patrol';
          br.timer = 0;
          br.goal = null;
          br.lastKnown = null;
        }
      }
      break;
    }
    case 'alert': {
      // Telegraph: stop and turn toward what it saw before committing.
      if (br.lastKnown) out.aim = Math.atan2(br.lastKnown.y - a.y, br.lastKnown.x - a.x);
      if (!br.sawPlayer && br.seenFor === 0) {
        br.state = 'investigate';
        br.timer = 0;
        br.goal = null;
      }
      break;
    }
    case 'engage': {
      if (!br.sawPlayer) {
        br.state = 'pursue';
        br.goal = null;
        break;
      }
      if (hurt) {
        br.state = 'cover';
        br.timer = 0;
        br.goal = null;
        break;
      }
      br.engagedFor += dt;
      br.aimTimer -= dt;
      if (br.aimTimer <= 0) {
        br.aimTimer = 0.3;
        br.aimOffset = rand(w) * 2 - 1;
      }
      const err = B.aimErrorDeg * Math.max(0.25, 1 - br.engagedFor / B.aimSettleSeconds) * DEG;
      const toP = Math.atan2(p.y - a.y, p.x - a.x);
      out.aim = toP + br.aimOffset * err;
      // Hold the angle: stand still and shoot, only when the shot is not blocked by cover.
      const range = a.weapon.falloffEnd + 2;
      // Attack tokens: at most N bots shoot at once; the rest flank (flankers) or hold the angle.
      if (!token(w, a, true)) {
        if (br.flanker) {
          const f = pickFlank(w, a, { x: p.x, y: p.y });
          setGoal(w, a, br, f.x, f.y);
          follow(w, a, br, dt);
        }
        out.aim = toP;
        break;
      }
      out.firing = Math.abs(angleDiff(a.facing, toP)) < B.fireToleranceDeg * DEG + err
        && Math.hypot(p.x - a.x, p.y - a.y) <= range
        && shotClear(w.level, a.x, a.y, p.x, p.y, a.weapon.piercesCover, TUNING.combat.coverLean);
      // Out of range: close in along the path instead of wasting shots.
      if (Math.hypot(p.x - a.x, p.y - a.y) > range) {
        setGoal(w, a, br, p.x, p.y);
        follow(w, a, br, dt);
        out.aim = toP;
      }
      if (!out.firing && a.ammo < a.weapon.magazine / 2) out.reload = true;
      break;
    }
    case 'cover': {
      // No belief: assume the threat is ahead of where it was facing (never the true position).
      const threat = br.lastKnown ?? { x: a.x + Math.cos(a.facing) * 4, y: a.y + Math.sin(a.facing) * 4 };
      if (!br.goal) {
        const spot = pickCover(w, a, threat);
        if (spot) setGoal(w, a, br, spot.x, spot.y);
        else br.goal = { x: a.x, y: a.y };
      }
      const arrived = follow(w, a, br, dt);
      if (arrived) {
        br.timer += dt;
        out.aim = Math.atan2(threat.y - a.y, threat.x - a.x);
        if (a.ammo < a.weapon.magazine) out.reload = true;
        if (br.timer > B.coverSeconds) {
          // Peek: go back toward the last known spot (re-engages when it sees the player again).
          br.state = 'pursue';
          br.goal = null;
          br.timer = 0;
        }
      }
      break;
    }
    case 'pursue': {
      const t = br.lastKnown;
      if (!t) {
        br.state = 'patrol';
        break;
      }
      if (!br.goal) {
        const g = br.flanker ? pickFlank(w, a, t) : t;
        setGoal(w, a, br, g.x, g.y);
      }
      if (follow(w, a, br, dt)) {
        br.state = 'search';
        br.goal = null;
        br.timer = 0;
      }
      break;
    }
  }
  return out;
}

function nearestHealth(w: World, a: Actor): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bd: number = TUNING.bots.healthSeekRange;
  for (const p of w.pickups) {
    if (!p.active || p.kind !== 'health') continue;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
