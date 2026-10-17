// Bot decisions. Bots only know what they see in their own cone (walls block it) and what they hear
// on the shared sound bus. They never read a hostile's position or input directly.
// The same brain drives the hostile bots and the solo player's AI teammates (Actor.ai on team 'player', the default
// game: you + 2). A bot's target is the hostile it actually perceives, never "the player" by identity.
import { TUNING } from '../config/tuning';
import type { BotSpawn } from '../config/map';
import { angleDiff } from './geom';
import { findPath, shotClear, sightClear, tileAt, walkable } from './level';
import { canSee, muzzleFlashSeen } from './vision';
import { safeSpot, zoneAt, zoneGoal } from './zone';
import { hears, player, rand, revealed, viewOf, wants, type Actor, type ActorInput, type CommsEvent, type CommsKind, type SoundType, type World } from './world';
import { LAB } from '../config/lab';

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
  /** Heading into the danger zone (RC-8), which overrides its state until it is inside. */
  zoneRun: boolean;
  /** Sim time (s) before which it will not throw another grenade. */
  nadeAt: number;
  /** AI teammates: seconds until it picks a new spot near the player (loose follow, not a shadow). */
  anchorLeft: number;
  /** Flankers: strafe direction (+1 / -1) while trading shots, flipped now and then. */
  strafe: number;
  /** CF-D: seconds to stand at this patrol point (drawn on arrival), and seconds left of a listen stop. */
  pause: number;
  listen: number;
  /** What it heard last (the type and who made it), for its call-outs (SB). */
  heardType: SoundType | null;
  heardFrom: number;
  /** SB comms (AI teammates): the hostile it sees now (-1 none), when it last saw each one, a contact it has not
   * called yet, the one it was tracking (for "lost him"), when it last made each kind of call, and the spot a
   * teammate's call asked it to cover. */
  seenId: number;
  seenAt: Map<number, number>;
  pendingContact: number;
  track: { id: number; x: number; y: number; heading: number; at: number; called: boolean } | null;
  rest: Partial<Record<CommsKind, number>>;
  watch: { x: number; y: number; until: number } | null;
  /** SB death insight: the signal that started its current hunt (how it found its target), or null. */
  foundBy: PerceptionSource | null;
  /** Owner 2026-10-17: the hostile squad's current job between fights (TUNING.bots.squad), or null. */
  task: SquadTask | null;
}

export type SquadTaskKind = 'hunt' | 'resupply' | 'search' | 'hold' | 'regroup' | 'patrol';
/** x, y: where it goes; rx, ry: for a hunt, the spot the squadmate saw (a flanker's x, y is its way round). */
export interface SquadTask { kind: SquadTaskKind; x: number; y: number; rx: number; ry: number; until: number; point: number; pickup: number; arrived: number }

/** What one hostile team knows together: when each tactical point was last checked, and squadmates' sightings. */
interface Squad { checked: number[]; reports: { x: number; y: number; at: number; by: number }[] }
const squads = new WeakMap<World, Map<string, Squad>>();
function squadOf(w: World, team: string): Squad {
  let m = squads.get(w);
  if (!m) { m = new Map(); squads.set(w, m); }
  let s = m.get(team);
  if (!s) { s = { checked: w.squadPoints.map(() => -1e9), reports: [] }; m.set(team, s); }
  return s;
}

/** callout (SB): a teammate's call-out, itself backed by that teammate's own signal. */
/** radio (FS): a hostile squadmate saw you there; the squad knows that spot and when, never more. */
export type PerceptionSource = 'seen' | 'flash' | 'heard' | 'shot' | 'sonar' | 'callout' | 'radio' | 'memory';

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
  /** The observer's view at that moment (its gait reshapes the lamp every step, CF-E). */
  orange: number;
  ocone: number;
  px: number;
  py: number;
}

export function createBrain(spawn: BotSpawn): Brain {
  return {
    state: 'patrol',
    patrol: spawn.patrol.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })),
    patrolIndex: 0, flanker: spawn.flanker, timer: 0, seenFor: 0, engagedFor: 0, aimOffset: 0, aimTimer: 0,
    lastKnown: null, goal: null, path: [], stuckTimer: 0, stuckRepaths: 0, avoid: [], stuckFrom: { x: 0, y: 0 }, lookBase: 0, sawPlayer: false, heardAt: null,
    source: null, suspicion: 0, reaction: TUNING.perception.reactionMax, pathAt: -1e9, zoneRun: false,
    nadeAt: 0, anchorLeft: 0, strafe: 1, pause: TUNING.bots.patrolPause, listen: 0,
    heardType: null, heardFrom: -1, seenId: -1, seenAt: new Map(), pendingContact: -1, track: null, rest: {}, watch: null, foundBy: null,
    task: null,
  };
}

const out: ActorInput = { moveX: 0, moveY: 0, quiet: false, aim: 0, firing: false, reload: false, ability: false, grenade: false };

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
function learn(w: World, a: Actor, br: Brain, source: PerceptionEvent['source'], x: number, y: number, suspicion: number, truth: Actor = player(w)): void {
  // A hunt starts when it had nothing (or had forgotten): remember what started it (SB death insight).
  if (!br.lastKnown || br.suspicion < 0.05) br.foundBy = source;
  br.lastKnown = { x, y };
  br.source = source;
  br.suspicion = Math.max(br.suspicion, suspicion);
  if (w.perceptionLog) w.perceptionLog.push({ tick: w.tick, bot: a.id, source, x, y, ox: a.x, oy: a.y, ofacing: a.facing, orange: a.view.range, ocone: a.view.coneRad, px: truth.x, py: truth.y });
}

/** The hostile this bot sees best right now: nearest standing one in its cone with a clear line; a downed one last. */
function seenTarget(w: World, a: Actor): Actor | null {
  let best: Actor | null = null, bd = Infinity;
  for (const t of w.actors) {
    if (!t.alive || t.team === a.team || !canSee(w.level, a.x, a.y, a.facing, viewOf(a), t.x, t.y)) continue;
    const d = Math.hypot(t.x - a.x, t.y - a.y) + (t.downed ? 100 : 0);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

/** Release or take an attack token. Returns whether this bot may shoot the player now. */
function token(w: World, a: Actor, want: boolean): boolean {
  // Tokens limit how many hostile bots fire at the player's side at once; the player's own AI teammates never wait.
  if (a.team !== 'bot') return want;
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

/**
 * One bot's input this step: the state machine below (perception, states, department style), then two reflexes that
 * apply in every state: step out of a live hostile grenade's ring, and throw one of its own when it has a reason.
 */
export function botThink(w: World, a: Actor, br: Brain, dt: number): ActorInput {
  think(w, a, br, dt);
  dodgeGrenades(w, a);
  maybeThrow(w, a, br);
  if (a.team !== 'bot') callOut(w, a, br);
  return out;
}

const STEPS = new Set<SoundType>(['step', 'quietStep']);

/**
 * SB: an AI teammate says what it perceives, in one short call, when it matters (TUNING.comms). One voice at a time
 * for the whole squad, and each teammate rests each kind of call. Every call is its own belief: a sighting it has
 * (exact), a sound it heard (with its own error), a hostile it just lost (where, and which way it was going).
 */
function callOut(w: World, a: Actor, br: Brain): void {
  if (!a.alive || a.downed) return;
  const C = TUNING.comms, now = w.tick * TUNING.simStepSeconds, lead = player(w);
  const seen = br.seenId >= 0 ? w.actors[br.seenId] : null;
  if (seen) {
    if (now - (br.seenAt.get(seen.id) ?? -1e9) > C.recontactSeconds) br.pendingContact = seen.id;
    br.seenAt.set(seen.id, now);
    br.track = { id: seen.id, x: seen.x, y: seen.y, heading: Math.atan2(seen.vy, seen.vx), at: now, called: br.track?.id === seen.id ? br.track.called : false };
  } else if (br.pendingContact >= 0) br.pendingContact = -1;
  if (now - w.commsAt < C.gap) return;
  const can = (k: CommsKind) => now - (br.rest[k] ?? -1e9) >= (C.rest[k] ?? 5);
  const say = (e: Omit<CommsEvent, 'from' | 'tick'>) => {
    w.comms.push({ ...e, from: a.id, tick: w.tick });
    w.commsAt = now;
    br.rest[e.kind] = now;
  };
  if (seen && br.pendingContact === seen.id) {
    // Behind us: well off where YOU face (the player's back is what nobody else is watching).
    const off = Math.abs(angleDiff(lead.facing, Math.atan2(seen.y - lead.y, seen.x - lead.x)));
    const kind: CommsKind = off > C.behindDeg * DEG ? 'behind' : 'contact';
    if (can(kind)) { say({ kind, target: seen.id, x: seen.x, y: seen.y, r: 0 }); br.pendingContact = -1; br.track!.called = false; return; }
  }
  if (a.hp < a.maxHp * 0.35 && a.lastHitTick >= w.tick - 2 && can('hurt')) { say({ kind: 'hurt', target: -1, x: a.x, y: a.y, r: 0 }); return; }
  const t = br.track;
  if (!seen && t && !t.called && now - t.at >= C.lostAfter) {
    const tgt = w.actors[t.id];
    // Only worth saying if it is still a threat and the player is not looking at the spot (judged from the spot it
    // reports, never from where the hostile really is).
    if (!tgt?.alive || now - t.at > 3 || canSee(w.level, lead.x, lead.y, lead.facing, lead.view, t.x, t.y)) t.called = true;
    else if (can('lost')) { say({ kind: 'lost', target: t.id, x: t.x, y: t.y, heading: t.heading, r: 0.5 }); t.called = true; return; }
  }
  if (!seen && br.heardAt && br.heardType && br.heardFrom >= 0 && w.actors[br.heardFrom]?.team !== a.team) {
    const kind: CommsKind | null = STEPS.has(br.heardType) ? 'steps' : br.heardType === 'shot' ? 'shots' : null;
    const src = w.actors[br.heardFrom];
    const d = Math.hypot(br.heardAt.x - a.x, br.heardAt.y - a.y);
    // Said only when the player is not standing beside the caller (then they heard it too), judged from the two of them.
    const together = Math.hypot(lead.x - a.x, lead.y - a.y) < TUNING.comms.nearPlayer;
    if (kind && can(kind) && src.alive && !together && !canSee(w.level, lead.x, lead.y, lead.facing, lead.view, br.heardAt.x, br.heardAt.y)) {
      say({ kind, target: br.heardFrom, x: br.heardAt.x, y: br.heardAt.y, r: d * TUNING.perception.hearErrorShare });
      return;
    }
  }
  if (out.reload && a.reloadLeft === 0 && a.ammo < a.weapon.magazine && br.suspicion > 0.5 && can('reloading')) say({ kind: 'reloading', target: -1, x: a.x, y: a.y, r: 0 });
}

/** SB: a teammate heard a squad call: it covers that way, and a heard call becomes its own (weaker) belief. */
function hearCalls(w: World, a: Actor, br: Brain): void {
  const C = TUNING.comms, now = w.tick * TUNING.simStepSeconds;
  for (const c of w.prevComms) {
    if (c.from === a.id || w.actors[c.from]?.team !== a.team || c.target < 0) continue;
    // Cover only what nobody is watching (a heard call, a lost contact). A seen contact is the caller's: everyone else
    // keeps their own arc, so the squad never all stares at one hostile while another walks in behind.
    const unwatched = c.kind === 'steps' || c.kind === 'shots' || c.kind === 'lost';
    if (!br.sawPlayer && unwatched) br.watch = { x: c.x, y: c.y, until: now + C.watchSeconds };
    if (!br.sawPlayer && br.suspicion < C.conf && w.actors[c.target]?.alive) learn(w, a, br, 'callout', c.x, c.y, C.conf, w.actors[c.target]);
  }
}

/** A grenade it can see (or that landed within a step of it) whose ring it stands in: move straight out of it. */
function dodgeGrenades(w: World, a: Actor): void {
  const R = TUNING.grenade.radius + 0.6;
  for (const g of w.grenades) {
    if (!g.alive || (g.team === a.team && g.owner !== a.id)) continue;
    const d = Math.hypot(a.x - g.x, a.y - g.y);
    if (d > R || (d > 1.5 && !canSee(w.level, a.x, a.y, a.facing, viewOf(a), g.x, g.y))) continue;
    const ux = d > 0.01 ? (a.x - g.x) / d : Math.cos(a.facing + Math.PI), uy = d > 0.01 ? (a.y - g.y) / d : Math.sin(a.facing + Math.PI);
    out.moveX = ux;
    out.moveY = uy;
    out.quiet = false;
    return;
  }
}

/**
 * Grenade use (TUNING.grenade bot*): at a believed position 4-9 u away, never inside its own blast, when the target
 * hugs cover it cannot shoot through, two hostiles stand together, or it only heard them (flush them out).
 */
function maybeThrow(w: World, a: Actor, br: Brain): void {
  const G = TUNING.grenade;
  const now = w.tick * TUNING.simStepSeconds;
  if (a.grenades <= 0 || a.nadeCd > 0 || now < br.nadeAt || a.downed || a.shieldLeft > 0) return;
  const seen = br.sawPlayer ? seenTarget(w, a) : null;
  const spot = seen ?? (br.lastKnown && br.suspicion > 0.55 && br.source !== 'memory' ? br.lastKnown : null);
  if (!spot) return;
  const d = Math.hypot(spot.x - a.x, spot.y - a.y);
  if (d < Math.max(G.botMin, G.radius + 0.8) || d > G.botMax || !sightClear(w.level, a.x, a.y, spot.x, spot.y)) return;
  const covered = !!seen && !shotClear(w.level, a.x, a.y, spot.x, spot.y, a.weapon.piercesCover, TUNING.combat.coverLean);
  const pair = w.actors.filter((t) => t.alive && t.team !== a.team && Math.hypot(t.x - spot.x, t.y - spot.y) <= G.radius * 0.8
    && canSee(w.level, a.x, a.y, a.facing, viewOf(a), t.x, t.y)).length >= 2;
  // Hostiles flush out what they only heard; AI teammates never spend a grenade on a guess (CF: they threw 91% of
  // their grenades, mostly at heard spots, before).
  const unseen = !seen && a.team === 'bot' && (br.source === 'heard' || br.source === 'shot' || br.source === 'flash');
  if (!covered && !pair && !unseen) return;
  out.grenade = true;
  out.throwDist = d;
  out.aim = Math.atan2(spot.y - a.y, spot.x - a.x);
  out.firing = false;
  br.nadeAt = now + G.botCooldown;
}

function think(w: World, a: Actor, br: Brain, dt: number): void {
  const B = TUNING.bots;
  const seen = seenTarget(w, a);
  // Only read when br.sawPlayer is true (then it is the seen hostile); `a` is a harmless stand-in otherwise.
  const p = seen ?? a;
  out.firing = false;
  out.reload = false;
  out.ability = false;
  out.grenade = false;
  out.throwDist = undefined;
  out.quiet = false;
  out.aim = a.facing;
  out.moveX = out.moveY = 0;

  // Perception (docs/design/bots.md). Every belief about the player comes from a signal, logged by learn().
  const P = TUNING.perception;
  br.sawPlayer = !!seen;
  br.seenId = seen?.id ?? -1;
  if (a.team !== 'bot') hearCalls(w, a, br);
  br.heardAt = null;
  br.suspicion = Math.max(0, br.suspicion - dt / P.memorySeconds);
  if (br.sawPlayer) {
    if (br.seenFor === 0 && br.state !== 'engage') {
      br.reaction = P.reactionMin + rand(w) * (P.reactionMax - P.reactionMin);
      // Caught on the move (a squad rotation, a walk to a pickup): it was looking where it walks, so it is a beat late.
      // A bot holding an angle is not (rotating is the risk; holding the reward).
      const t = br.task;
      if (a.team === 'bot' && br.state === 'patrol' && t && t.kind !== 'hold' && !t.arrived) br.reaction += TUNING.bots.squad.walkingReaction;
    }
    br.seenFor += dt;
    learn(w, a, br, 'seen', p.x, p.y, 1, p);
    // The hostile squad radio: a sighting goes to the squad (the spot it saw, when). Nothing it did not see.
    if (a.team === 'bot' && w.squadAI) {
      const sq = squadOf(w, a.team), now = w.tick * TUNING.simStepSeconds;
      sq.reports = sq.reports.filter((r) => now - r.at <= TUNING.bots.squad.reportSeconds && r.by !== a.id);
      sq.reports.push({ x: p.x, y: p.y, at: now, by: a.id });
    }
  } else {
    br.seenFor = Math.max(0, br.seenFor - dt * 2);
    if (br.source === 'seen') br.source = 'memory';
  }
  let flashed = false;
  for (const s of w.prevSounds) {
    if (s.team === a.team) continue;
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
    br.heardType = s.type;
    br.heardFrom = s.sourceId;
  }
  // A flash (exact) beats a heard guess the same step: the weaker one is dropped, never acted on or called out.
  if (flashed) br.heardAt = null;
  if (br.heardAt && !br.sawPlayer) learn(w, a, br, 'heard', br.heardAt.x, br.heardAt.y, 0.6);
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
    // CF-D: a fresh noise stops it to listen (turned toward it) before it creeps over; a repeat keeps it moving.
    if (LAB.enemySound && br.state !== 'investigate') br.listen = B.listenSeconds;
    br.state = 'investigate';
    br.lastKnown = br.heardAt;
    br.goal = null;
    br.timer = 0;
  }

  // Hurt, not under fire and not hit for healCalmSeconds: go for the nearest health pickup if one is up. (Owner
  // 2026-10-17: health must not make damage meaningless. A bot no longer breaks off mid-fight to reset at a pickup.)
  if (hurt && !br.sawPlayer && br.state !== 'heal' && br.state !== 'alert' && w.tick - a.lastHitTick > B.healCalmSeconds / TUNING.simStepSeconds) {
    const hp = nearestHealth(w, a);
    if (hp) {
      br.state = 'heal';
      br.goal = null;
    }
  }
  // Abilities, used for a readable reason.
  if (a.abilityCd === 0) {
    const k = a.ability.kind;
    if (k === 'mend' && a.hp < a.maxHp * 0.6) out.ability = true;
    if (k === 'dash' && br.state === 'cover' && br.path.length > 2) out.ability = true;
    if (k === 'sonar' && (br.state === 'investigate' || br.state === 'search') && br.timer > 0.5) out.ability = true;
    if (k === 'barrier' && br.state === 'engage' && (justHit || a.hp < a.maxHp * 0.7)) out.ability = true;
    // Snare when the hostile it sees is inside its reach; Shell when hit and hurt (it cannot shoot inside it); Rush
    // when it is trading shots within its weapon's range.
    const dSeen = br.sawPlayer ? Math.hypot(p.x - a.x, p.y - a.y) : Infinity;
    if (k === 'scream' && dSeen <= (a.ability.radius ?? 0)) out.ability = true;
    if (k === 'shield' && justHit && a.hp < a.maxHp * 0.55) out.ability = true;
    if (k === 'frenzy' && br.state === 'engage' && dSeen <= a.weapon.falloffEnd) out.ability = true;
  }
  // Its own sonar shows the player like it shows bots to the player: a fair, telegraphed reveal.
  const pinged = a.revealLeft > 0 ? revealed(w, a) : [];
  if (pinged.length) {
    learn(w, a, br, 'sonar', pinged[0].x, pinged[0].y, 1, pinged[0]);
    if (br.state === 'investigate' || br.state === 'search' || br.state === 'patrol') {
      br.state = 'pursue';
      br.goal = null;
    }
  }

  // AI teammates (solo default game): rescue a downed teammate when no hostile is in sight, and stay with the player.
  if (a.team !== 'bot' && !br.sawPlayer) {
    const down = w.actors.find((m) => m !== a && m.team === a.team && m.alive && m.downed && Math.hypot(m.x - a.x, m.y - a.y) < 16);
    if (down) {
      token(w, a, false);
      if (Math.hypot(down.x - a.x, down.y - a.y) > TUNING.revive.range * 0.6) { setGoal(w, a, br, down.x, down.y); follow(w, a, br, dt); }
      out.aim = Math.atan2(down.y - a.y, down.x - a.x);
      out.firing = false;
      return;
    }
  }

  // Danger zone (RC-8): outside, or near the edge of, the circle that is closing, getting in comes first. On the way
  // it still shoots what it sees, under the same token, range and cover rules as when it holds an angle.
  const zv = w.zone ? zoneAt(w.zone, w.tick * TUNING.simStepSeconds) : null;
  const zg = zv ? zoneGoal(zv) : null;
  if (zg && Math.hypot(a.x - zg.x, a.y - zg.y) > zg.r - TUNING.zone.moveInMargin) {
    if (!br.zoneRun) { br.zoneRun = true; br.goal = null; }
    const spot = safeSpot(w.level, zg, a.x, a.y, TUNING.zone.moveInMargin + 1.5);
    setGoal(w, a, br, spot.x, spot.y);
    follow(w, a, br, dt);
    const toP = Math.atan2(p.y - a.y, p.x - a.x);
    const range = Math.min(a.weapon.falloffEnd + 2, p.baseView.range - 0.25);
    if (br.sawPlayer && br.seenFor >= br.reaction && token(w, a, true)) {
      out.aim = toP;
      out.firing = Math.abs(angleDiff(a.facing, toP)) < B.fireToleranceDeg * DEG && Math.hypot(p.x - a.x, p.y - a.y) <= range
        && shotClear(w.level, a.x, a.y, p.x, p.y, a.weapon.piercesCover, TUNING.combat.coverLean);
    } else token(w, a, false);
    return;
  }
  if (br.zoneRun) { br.zoneRun = false; br.goal = null; br.path.length = 0; }

  // AI teammates hunt what they hear, but on a leash: more than 12 u from the player with nothing in sight, regroup.
  if (a.team !== 'bot' && !br.sawPlayer && (br.state === 'investigate' || br.state === 'search' || br.state === 'pursue')
    && Math.hypot(player(w).x - a.x, player(w).y - a.y) > 12) {
    br.state = 'patrol';
    br.goal = null;
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
      if (a.team !== 'bot') {
        // Nothing to chase: move with the squad, not on top of the player. Every few seconds pick a fresh spot 2.5-6 u
        // from the player, mostly ahead of where it faces, that the player can see (no wandering off behind walls);
        // walk there, then watch the flanks. Too far behind (over 9 u) and it regroups at once.
        const lead = player(w);
        br.anchorLeft -= dt;
        const far = Math.hypot(lead.x - a.x, lead.y - a.y) > 9;
        if (br.anchorLeft <= 0 || far || !br.goal) {
          br.anchorLeft = 2.5 + rand(w) * 2.5;
          // Roles (CF): the first teammate covers the arc behind you, the second a side, so between you three the room
          // is watched all round instead of everyone looking where you look.
          const mates = w.actors.filter((m) => m.ai && m.team === a.team);
          const role = mates.indexOf(a) % 2 === 0 ? Math.PI : (a.id % 2 ? 1 : -1) * Math.PI / 2;
          for (let i = 0; i < 8; i++) {
            const ang = lead.facing + role + (rand(w) - 0.5) * Math.PI * 0.8, r = 2.5 + rand(w) * 3;
            const gx = Math.floor(lead.x + Math.cos(ang) * r) + 0.5, gy = Math.floor(lead.y + Math.sin(ang) * r) + 0.5;
            if (!walkable(tileAt(w.level, gx, gy)) || !sightClear(w.level, lead.x, lead.y, gx, gy)) continue;
            br.goal = null;
            setGoal(w, a, br, gx, gy);
            break;
          }
        }
        const covering = br.watch && w.tick * TUNING.simStepSeconds < br.watch.until ? br.watch : null;
        if (follow(w, a, br, dt)) {
          br.timer += dt;
          const mates = w.actors.filter((m) => m.ai && m.team === a.team);
          const role = mates.indexOf(a) % 2 === 0 ? Math.PI : (a.id % 2 ? 1 : -1) * Math.PI / 2;
          out.aim = lead.facing + role + Math.sin(br.timer * 1.3) * 0.6;
        } else br.lookBase = out.aim;
        // SB: a teammate called something: point the lamp at it, a slow sweep across the spot (cover, do not chase).
        if (covering) out.aim = Math.atan2(covering.y - a.y, covering.x - a.x) + Math.sin(br.timer * 1.7) * 0.25;
        out.quiet = !far;
        break;
      }
      if (a.team === 'bot' && w.squadAI) { squadPatrol(w, a, br, dt); break; }
      const target = br.patrol[br.patrolIndex];
      setGoal(w, a, br, target.x, target.y);
      if (follow(w, a, br, dt)) {
        br.timer += dt;
        out.aim = br.lookBase + Math.sin(br.timer * 1.5) * 0.6;
        if (br.timer > (LAB.enemySound ? br.pause : 1.2)) {
          br.timer = 0;
          br.patrolIndex = (br.patrolIndex + 1) % br.patrol.length;
          br.goal = null;
          br.pause = B.patrolPause + rand(w) * B.patrolPauseJitter;
        }
      } else {
        br.lookBase = out.aim;
        // CF-D: walking its rounds, not creeping: its steps carry ~6 u, so a patrol is heard before it is seen.
        if (LAB.enemySound) { out.quiet = false; out.moveX *= B.patrolSpeed; out.moveY *= B.patrolSpeed; }
      }
      break;
    }
    case 'investigate':
    case 'search': {
      const t = br.lastKnown!;
      if (br.listen > 0) {
        // Listening: stand still, turned toward the noise. Silent, and the steady lamp reaches further.
        br.listen -= dt;
        out.aim = Math.atan2(t.y - a.y, t.x - a.x);
        break;
      }
      setGoal(w, a, br, t.x, t.y);
      const close = Math.hypot(t.x - a.x, t.y - a.y) < B.creepWithin;
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
      } else if (LAB.enemySound) {
        // Going to check a noise: it walks over (heard ~6 u) and creeps the last few metres, so what it heard can hear
        // it coming, but not right on top of it.
        out.quiet = close;
        if (!close) { out.moveX *= B.patrolSpeed; out.moveY *= B.patrolSpeed; }
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
      // Fire gate (fairness rule): never beyond the player's own sight distance, whatever this bot can see.
      const range = Math.min(a.weapon.falloffEnd + 2, p.baseView.range - 0.25);
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
      const dist = Math.hypot(p.x - a.x, p.y - a.y);
      if (dist > range) {
        setGoal(w, a, br, p.x, p.y);
        follow(w, a, br, dt);
        out.aim = toP;
      } else fightStyle(w, a, br, p, dist, toP, dt);
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
}

/**
 * The hostile squad between fights (owner 2026-10-17: "enemy teams must be active"): information -> decision ->
 * movement -> reassessment. Every job comes from what the squad legitimately knows (its own sightings, which points
 * it has checked, the map and its pickups, its own health), never from where you are. It walks (its steps are heard
 * ~6 u).
 */
function squadPatrol(w: World, a: Actor, br: Brain, dt: number): void {
  const B = TUNING.bots, S = B.squad, now = w.tick * TUNING.simStepSeconds;
  const sq = squadOf(w, a.team);
  // Mark the points this bot is standing at as checked by the squad.
  w.squadPoints.forEach((pt, i) => { if (Math.hypot(pt.x - a.x, pt.y - a.y) <= S.visitRadius && sightClear(w.level, a.x, a.y, pt.x, pt.y)) sq.checked[i] = now; });
  const t = br.task;
  const done = !t || now >= t.until
    || (t.kind === 'resupply' && (!w.pickups[t.pickup]?.active || !wants(a, w.pickups[t.pickup].kind)))
    || (t.kind !== 'hunt' && freshReport(w, a, sq, now) !== null);
  if (done) { br.task = squadTask(w, a, br, sq, now); br.goal = null; }
  const task = br.task!;
  if (task.kind === 'patrol') {
    const target = br.patrol[br.patrolIndex];
    task.x = target.x; task.y = target.y;
  }
  setGoal(w, a, br, task.x, task.y);
  if (follow(w, a, br, dt)) {
    if (!task.arrived) { task.arrived = now; br.lookBase = a.facing; br.timer = 0; }
    br.timer += dt;
    if (task.kind === 'hunt') {
      // At the spot a squadmate saw: it is gone or close by. It looks round from here as a squad search (it stands
      // and sweeps, then walks on audibly), not the creeping search of a bot that heard something itself: a hunter
      // that crept in made more contacts with nothing heard first (tests/sb-lab warned share 0.62 without hunts).
      task.kind = 'search';
      task.until = now + B.investigateLookSeconds + 1;
      task.arrived = now;
      br.lookBase = a.facing;
      br.timer = 0;
      return;
    }
    if (task.kind === 'hold') {
      // Watch the way in: toward the middle of the map, sweeping.
      const mid = Math.atan2(w.level.h / 2 - a.y, w.level.w / 2 - a.x);
      out.aim = mid + Math.sin(br.timer * 1.1) * 0.9;
      if (now - task.arrived > S.holdSeconds) task.until = now;
    } else if (task.kind === 'search') {
      out.aim = br.lookBase + Math.sin(br.timer * 2.2) * 1.4;
      if (now - task.arrived > B.investigateLookSeconds) task.until = now;
    } else if (task.kind === 'patrol') {
      out.aim = br.lookBase + Math.sin(br.timer * 1.5) * 0.6;
      if (br.timer > br.pause) {
        br.timer = 0;
        br.patrolIndex = (br.patrolIndex + 1) % br.patrol.length;
        br.goal = null;
        br.pause = B.patrolPause + rand(w) * B.patrolPauseJitter;
        task.arrived = 0;
      }
    } else task.until = now;
  } else {
    br.lookBase = out.aim;
    // It never creeps a job: walking, its steps are heard ~6 u off; on a long rotation (a hunt, or a spot more than
    // jogDistance away) it jogs, faster and louder (~8 u). The squad coming is information you can earn. (Creeping the
    // last metres of a hunt cut contacts announced before sight from 0.6+ to 0.50, tests/sb-lab.)
    out.quiet = false;
    const far = task.kind === 'hunt' || Math.hypot(task.x - a.x, task.y - a.y) > S.jogDistance;
    if (LAB.enemySound && !far) { out.moveX *= B.patrolSpeed; out.moveY *= B.patrolSpeed; }
  }
}

/** The freshest squadmate sighting this bot should answer (it is among the nearest responders), or null. */
function freshReport(w: World, a: Actor, sq: Squad, now: number): { x: number; y: number } | null {
  const S = TUNING.bots.squad;
  // A call takes a moment to land (radioDelay), and only a few squadmates leave their jobs for calls at once.
  const r = sq.reports.filter((x) => x.by !== a.id && now - x.at >= S.radioDelay && now - x.at <= S.reportSeconds).sort((p, q) => q.at - p.at)[0];
  if (!r) return null;
  const hunting = w.actors.filter((b) => b.alive && b.team === a.team && b.id !== a.id && w.brains.get(b.id)?.task?.kind === 'hunt').length;
  if (hunting >= S.maxHunters) return null;
  // Only the nearest free squadmates answer; the rest keep their jobs (no one-call stampede).
  const free = w.actors.filter((b) => b.alive && !b.downed && b.team === a.team && b.id !== r.by && w.brains.get(b.id)?.state === 'patrol');
  const rank = free.sort((p, q) => Math.hypot(p.x - r.x, p.y - r.y) - Math.hypot(q.x - r.x, q.y - r.y)).indexOf(a);
  return rank >= 0 && rank < S.huntResponders ? r : null;
}

function squadTask(w: World, a: Actor, br: Brain, sq: Squad, now: number): SquadTask {
  const B = TUNING.bots, S = B.squad;
  const task = (kind: SquadTaskKind, x: number, y: number, point = -1, pickup = -1, hold: number = S.decideSeconds): SquadTask =>
    ({ kind, x, y, rx: x, ry: y, until: now + hold, point, pickup, arrived: 0 });
  // 1. A squadmate saw something: go there (flankers come round the side).
  const r = freshReport(w, a, sq, now);
  if (r) {
    const g = br.flanker ? pickFlank(w, a, r) : r;
    // What it now knows: the spot the squadmate saw (logged, so the omniscience test can trace it), nothing more.
    learn(w, a, br, 'radio', r.x, r.y, 0);
    return { ...task('hunt', g.x, g.y, -1, -1, S.reportSeconds + 6), rx: r.x, ry: r.y };
  }
  // 2. It needs something and one is up nearby: go and take it.
  let best = -1, bd: number = S.resupplyRange;
  w.pickups.forEach((k, i) => {
    if (!k.active) return;
    const need = k.kind === 'health' ? a.hp < a.maxHp * S.needHpShare
      // Armour: below a share of what it starts with (its hero's armour), not of the cap every actor shares (50):
      // a 15-armour hero is not "missing" 35 at spawn, so the squad does not tour the armour before it fights.
      : k.kind === 'armor' ? a.armor < (a.hero.maxArmor + a.power.armor) * S.needArmorShare
      : k.kind === 'ammo' ? a.reserve < a.weapon.magazine
      // Grenades only when out (a squad that tops up every throw turns the map into a grenade rain).
      : k.kind === 'grenade' ? a.grenades === 0 && wants(a, k.kind) : wants(a, k.kind);
    const d = Math.hypot(k.x - a.x, k.y - a.y);
    if (need && d < bd) { bd = d; best = i; }
  });
  if (best >= 0) return task('resupply', w.pickups[best].x, w.pickups[best].y, -1, best);
  // 3. Otherwise a job by weight: search the stalest point, hold one, regroup, or walk its beat.
  const mates = w.actors.filter((b) => b.alive && b.team === a.team && b.id !== a.id);
  const nearest = mates.reduce((m, b) => Math.min(m, Math.hypot(b.x - a.x, b.y - a.y)), Infinity);
  const W8 = S.weights;
  const opts: [SquadTaskKind, number][] = [['search', W8.search], ['hold', W8.hold], ['patrol', W8.patrol], ['regroup', nearest > S.regroupDistance ? W8.regroup * 3 : 0]];
  const total = opts.reduce((s, [, v]) => s + v, 0);
  let roll = rand(w) * total, kind: SquadTaskKind = 'patrol';
  for (const [k, v] of opts) { if ((roll -= v) < 0) { kind = k; break; } }
  const pts = w.squadPoints;
  if (!pts.length || kind === 'patrol') return task('patrol', br.patrol[br.patrolIndex].x, br.patrol[br.patrolIndex].y);
  if (kind === 'regroup') {
    const m = mates.sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
    return m ? task('regroup', m.x, m.y) : task('patrol', br.patrol[br.patrolIndex].x, br.patrol[br.patrolIndex].y);
  }
  // Claimed by a squadmate already: skip it (two bots do not search the same room).
  const claimed = new Set(mates.map((b) => w.brains.get(b.id)?.task?.point ?? -1));
  let pick = -1, score = -Infinity;
  pts.forEach((pt, i) => {
    if (claimed.has(i) || Math.hypot(pt.x - a.x, pt.y - a.y) < S.visitRadius) return;
    const stale = Math.min(60, now - sq.checked[i]);
    const d = Math.hypot(pt.x - a.x, pt.y - a.y);
    // Search: the longest unchecked, not too far; hold: a near point, a little randomness so it is not a clockwork.
    // Early on it pushes toward the other side's spawn (map knowledge every player has, not where you are).
    const push = S.pushBonus * Math.max(0, 1 - now / S.pushSeconds) * Math.max(0, 1 - Math.hypot(pt.x - w.level.playerSpawn.x, pt.y - w.level.playerSpawn.y) / w.level.w);
    const s = kind === 'search' ? stale - d * 0.5 + push + rand(w) * 6 : -d + rand(w) * 8;
    if (s > score) { score = s; pick = i; }
  });
  if (pick < 0) return task('patrol', br.patrol[br.patrolIndex].x, br.patrol[br.patrolIndex].y);
  return task(kind, pts[pick].x, pts[pick].y, pick);
}

/**
 * How a department fights once it is trading shots (owner 2026-10-14). Moving costs accuracy (spread grows with
 * speed), so each style pays for what it gains: assault and bruiser (while healthy) close in, the sniper backs off
 * from anyone inside 6 u, the flanker side-steps across the line at creeping speed, the tank holds its ground.
 */
function fightStyle(w: World, a: Actor, br: Brain, p: Actor, dist: number, toP: number, dt: number): void {
  const style = a.hero.dept;
  if ((style === 'bruiser' && dist > 3.2 && a.hp > a.maxHp * 0.6) || (style === 'assault' && dist > 6)) {
    setGoal(w, a, br, p.x, p.y);
    follow(w, a, br, dt);
    out.aim = toP;
  } else if (style === 'sniper' && dist < 6) {
    out.moveX = -Math.cos(toP);
    out.moveY = -Math.sin(toP);
  } else if (style === 'flanker') {
    // Strafe across the line of fire; pick a new side about every 1.2 s.
    br.timer += dt;
    if (br.timer > 1.2) { br.timer = 0; br.strafe = rand(w) < 0.5 ? -1 : 1; }
    // Only side-step to where it still sees the target (fairness: whoever hits you stays visible), else the other way.
    const open = (dir: number) => sightClear(w.level, a.x - Math.sin(toP) * dir * 0.8, a.y + Math.cos(toP) * dir * 0.8, p.x, p.y);
    if (!open(br.strafe)) br.strafe = -br.strafe;
    if (!open(br.strafe)) return;
    out.moveX = -Math.sin(toP) * br.strafe;
    out.moveY = Math.cos(toP) * br.strafe;
    out.quiet = true; // a creeping side-step, not a sprint: it stays hittable
  }
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
