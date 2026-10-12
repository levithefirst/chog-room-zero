// Bot decisions. Bots only know what they see in their own cone (walls block it) and what they hear
// on the shared sound bus. They never read the player's position or input directly.
import { TUNING } from '../config/tuning';
import type { BotSpawn } from '../config/map';
import { angleDiff } from './geom';
import { findPath, shotClear, sightClear } from './level';
import { canSee } from './vision';
import { hears, player, rand, viewOf, type Actor, type ActorInput, type World } from './world';

const DEG = Math.PI / 180;

export type BotState = 'patrol' | 'investigate' | 'alert' | 'engage' | 'cover' | 'pursue' | 'search';

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
  lookBase: number;
  // Debug and tests: what it perceived this tick.
  sawPlayer: boolean;
  heardAt: { x: number; y: number } | null;
}

export function createBrain(spawn: BotSpawn): Brain {
  return {
    state: 'patrol',
    patrol: spawn.patrol.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })),
    patrolIndex: 0, flanker: spawn.flanker, timer: 0, seenFor: 0, engagedFor: 0, aimOffset: 0, aimTimer: 0,
    lastKnown: null, goal: null, path: [], stuckTimer: 0, lookBase: 0, sawPlayer: false, heardAt: null,
  };
}

const out: ActorInput = { moveX: 0, moveY: 0, quiet: false, aim: 0, firing: false, reload: false };

function setGoal(w: World, a: Actor, br: Brain, gx: number, gy: number): void {
  if (br.goal && Math.floor(br.goal.x) === Math.floor(gx) && Math.floor(br.goal.y) === Math.floor(gy) && br.path.length) return;
  br.goal = { x: gx, y: gy };
  br.path = findPath(w.level, a.x, a.y, gx, gy);
  br.stuckTimer = 0;
}

/** Steer along the path. Returns true when the goal is reached (or unreachable). */
function follow(a: Actor, br: Brain, dt: number): boolean {
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
  br.stuckTimer = Math.hypot(a.vx, a.vy) < 0.3 ? br.stuckTimer + dt : 0;
  if (br.stuckTimer > 1) {
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
    if (shotClear(w.level, threat.x, threat.y, s.x, s.y)) continue;
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
  out.quiet = false;
  out.aim = a.facing;
  out.moveX = out.moveY = 0;

  // Perception: own sight cone, then the sound bus.
  br.sawPlayer = p.alive && canSee(w.level, a.x, a.y, a.facing, viewOf(a), p.x, p.y);
  br.heardAt = null;
  if (br.sawPlayer) {
    br.seenFor += dt;
    br.lastKnown = { x: p.x, y: p.y };
  } else {
    br.seenFor = Math.max(0, br.seenFor - dt * 2);
  }
  for (const s of w.prevSounds) {
    if (s.team !== 'player' || !hears(w.level, a.x, a.y, s)) continue;
    // Heard positions are uncertain: further away means a wider guess.
    const d = Math.hypot(s.x - a.x, s.y - a.y);
    const err = d * 0.15;
    br.heardAt = { x: s.x + (rand(w) * 2 - 1) * err, y: s.y + (rand(w) * 2 - 1) * err };
  }
  const justHit = a.lastHitTick === w.tick - 1 && a.lastHitFrom;
  const hurt = a.hp / TUNING.combat.maxHp < B.retreatHpShare;

  // Transitions.
  if (br.sawPlayer && br.state !== 'cover' && br.state !== 'engage' && br.state !== 'alert') {
    br.state = 'alert';
  }
  if (br.state === 'alert' && br.seenFor >= B.reactionTime) {
    br.state = 'engage';
    br.engagedFor = 0;
  }
  if (justHit && a.lastHitFrom) {
    br.lastKnown = { x: a.lastHitFrom.x, y: a.lastHitFrom.y };
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

  switch (br.state) {
    case 'patrol': {
      out.quiet = B.patrolQuiet;
      const target = br.patrol[br.patrolIndex];
      setGoal(w, a, br, target.x, target.y);
      if (follow(a, br, dt)) {
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
      if (follow(a, br, dt)) {
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
      out.firing = Math.abs(angleDiff(a.facing, toP)) < B.fireToleranceDeg * DEG + err && shotClear(w.level, a.x, a.y, p.x, p.y);
      if (!out.firing && a.ammo < a.op.magazine / 2) out.reload = true;
      break;
    }
    case 'cover': {
      const threat = br.lastKnown ?? { x: p.x, y: p.y };
      if (!br.goal) {
        const spot = pickCover(w, a, threat);
        if (spot) setGoal(w, a, br, spot.x, spot.y);
        else br.goal = { x: a.x, y: a.y };
      }
      const arrived = follow(a, br, dt);
      if (arrived) {
        br.timer += dt;
        out.aim = Math.atan2(threat.y - a.y, threat.x - a.x);
        if (a.ammo < a.op.magazine) out.reload = true;
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
      if (follow(a, br, dt)) {
        br.state = 'search';
        br.goal = null;
        br.timer = 0;
      }
      break;
    }
  }
  return out;
}
