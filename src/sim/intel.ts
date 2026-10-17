// Contact intel (SB, LAW 1 and LAW 3): what one observer BELIEVES about each hostile, not where it is. Seeing confirms;
// sound, a teammate's sighting and memory predict, and every belief loses precision and confidence over time.
// Pure and deterministic (no Pixi, no Math.random): the renderer draws it, the lab measures it, AI teammates share it.
//
// The ladder, weakest to strongest: (no contact) UNKNOWN -> SUSPECTED -> DIRECTIONAL -> HEARD -> LAST_KNOWN ->
// PARTIAL -> VISIBLE, and LOST as a belief fades out. A weaker report never overwrites a fresher, more precise one.
import { TUNING } from '../config/tuning';
import { canSee, muzzleFlashSeen } from './vision';
import { sightClear } from './level';
import { hears, revealed, standing, type Actor, type CommsEvent, type SoundEvent, type SoundType, type World } from './world';

/** Which mark a heard sound gets (CF-D): a step, a shot and a reload read apart with the sound off. */
export type MarkKind = 'step' | 'shot' | 'reload' | 'impact' | 'ability' | 'grenade' | 'death' | 'other';

export type ContactState = 'visible' | 'partial' | 'last_known' | 'heard' | 'directional' | 'suspected' | 'lost';
/** sight: your own light. flash: its muzzle flash, clear line. ping: your Ping. teammate: a teammate's light.
 * callout: a teammate's report (AI teammates, SB-W2). sound: you heard it. */
export type ContactSource = 'sight' | 'flash' | 'ping' | 'teammate' | 'callout' | 'sound';

export interface Contact {
  id: number;
  state: ContactState;
  source: ContactSource;
  /** What was last heard of it ('other' when it was seen). */
  kind: MarkKind;
  /** Best estimate, and the radius it is probably within (0 = exact). */
  x: number;
  y: number;
  r: number;
  /** 0..1 how sure, and how sure it was when last reported (it fades from that to 0 over the source's lifetime). */
  conf: number;
  conf0: number;
  /** Observer clock (s) of the last update, and seconds since it. */
  at: number;
  age: number;
  /** Seconds left of the "just updated" pulse. */
  fresh: number;
  /** Last seen facing (a last-known mark shows which way it was looking). */
  facing: number;
  /** Through a wall: the bearing from where the observer stood, and that spot. */
  bearing: number;
  ox: number;
  oy: number;
  /** Recent heard spots, newest last: a walker's path, never a body. */
  trail: { x: number; y: number; age: number }[];
  /** Seconds since it went LOST (removed after TUNING.intel.lostSeconds). */
  lostFor: number;
  /** Teammate sightings re-place the mark only this often (a report, not a live feed). */
  nextReport: number;
  /** Observer clock when this belief began (it had none, or had lost it): how long you have known. */
  since: number;
}

export interface Intel {
  contacts: Map<number, Contact>;
  /** Observer clock (s). */
  now: number;
  /** Muzzle flash seen: actor id -> clock until which it stays shown (TUNING.perception.flashSeconds). */
  flashUntil: Map<number, number>;
}

export function createIntel(): Intel {
  return { contacts: new Map(), now: 0, flashUntil: new Map() };
}

/** CF-D: which mark a heard sound gets. */
export function markKind(t: SoundType): MarkKind {
  if (t === 'step' || t === 'quietStep') return 'step';
  if (t === 'shot') return 'shot';
  if (t === 'reload') return 'reload';
  if (t === 'impact' || t === 'hit') return 'impact';
  if (t === 'throw' || t === 'bounce' || t === 'boom') return 'grenade';
  if (t === 'death' || t === 'downed') return 'death';
  if (t === 'pickup' || t === 'revive') return 'other';
  return 'ability';
}

/** Sounds that say where the MAKER is (an impact or a blast says where a bullet or grenade landed, not who sent it). */
const LOCATES = new Set<SoundType>(['step', 'quietStep', 'shot', 'reload', 'dash', 'sonar', 'barrier', 'mend', 'windup', 'burst', 'scream', 'shield', 'frenzy', 'throw', 'pickup', 'revive', 'downed']);
export const locatesSource = (t: SoundType) => LOCATES.has(t);

/** Strength order: a report only replaces a belief of equal or lower rank, unless it is more precise or the old one is weak. */
const RANK: Record<ContactState, number> = { lost: 0, suspected: 1, directional: 2, heard: 3, last_known: 4, partial: 5, visible: 6 };

/** A secret key for noise3 (4 random 32-bit words): the online server keeps one per room, so a client that knows the
 * tick, the actor and the formula still cannot work out the offset and subtract it. */
export type Salt = readonly number[];

/** Deterministic noise in [-1, 1] from three integers (same scenario, same guess; no Math.random in the sim). Without a
 * salt (solo, the lab, the client) it is the plain public hash; with one, each key word is mixed in by a full round. */
export function noise3(a: number, b: number, c: number, salt?: Salt): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
  for (const k of salt ?? []) {
    h ^= k;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h ^= h >>> 16;
  }
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

function lifeOf(c: Contact): number {
  const I = TUNING.intel;
  if (c.source === 'teammate' || c.source === 'callout') return I.spottedSeconds;
  if (c.state === 'directional') return I.directionSeconds;
  if (c.source === 'sound') return I.heardSeconds;
  return I.lastKnownSeconds;
}

function blank(id: number, now: number): Contact {
  return { id, state: 'lost', source: 'sound', kind: 'other', x: 0, y: 0, r: 0, conf: 0, conf0: 0, at: now, age: 0, fresh: 0, facing: 0, bearing: 0, ox: 0, oy: 0, trail: [], lostFor: 0, nextReport: 0, since: now };
}

/** Put a report into the belief if it is at least as good as what is there (fresher-and-weaker never wins). */
export function report(intel: Intel, id: number, r: { state: ContactState; source: ContactSource; kind: MarkKind; x: number; y: number; r: number; conf: number; facing?: number; bearing?: number; ox?: number; oy?: number }): boolean {
  const cur = intel.contacts.get(id);
  if (cur && cur.state === 'visible' && r.state !== 'visible') return false;
  if (cur && cur.state !== 'lost' && RANK[r.state] < RANK[cur.state] && r.r > cur.r && r.conf < cur.conf) return false;
  const c = cur ?? blank(id, intel.now);
  if (cur && cur.state === 'lost') c.since = intel.now;
  const moved = Math.hypot(r.x - c.x, r.y - c.y) > 0.05;
  c.state = r.state; c.source = r.source; c.kind = r.kind;
  c.x = r.x; c.y = r.y; c.r = r.r; c.conf = r.conf; c.conf0 = r.conf;
  c.at = intel.now; c.age = 0; c.lostFor = 0;
  if (r.state !== 'visible' && r.state !== 'partial') c.fresh = TUNING.intel.freshSeconds;
  if (r.facing !== undefined) c.facing = r.facing;
  if (r.bearing !== undefined) { c.bearing = r.bearing; c.ox = r.ox ?? 0; c.oy = r.oy ?? 0; }
  if ((r.state === 'heard') && moved) {
    c.trail.push({ x: r.x, y: r.y, age: 0 });
    if (c.trail.length > TUNING.intel.trail) c.trail.shift();
  }
  intel.contacts.set(id, c);
  return true;
}

/** What hearing this sound tells observer `me` about its maker (null: nothing, or not about a position). The online
 * server passes its room salt, so the estimate it sends cannot be undone from the public formula. */
export function hearReport(w: World, me: { x: number; y: number }, s: SoundEvent, salt?: Salt): Parameters<typeof report>[2] | null {
  if (!locatesSource(s.type)) return null;
  const I = TUNING.intel;
  const dx = s.x - me.x, dy = s.y - me.y, d = Math.hypot(dx, dy);
  const conf0 = I.conf[s.type] ?? I.conf[markKind(s.type)] ?? I.conf.other;
  const kind = markKind(s.type);
  // An online estimate from the server is already blurred: used as it came (n = 0), with the circle it deserves.
  const n = s.est ? 0 : 1;
  if (s.est ? s.est === 'clear' : sightClear(w.level, me.x, me.y, s.x, s.y)) {
    // A clear line: a spot, off by a share of the distance (shots sharp, creep steps vague).
    const err = d * I.hearShare * (I.hearMul[s.type] ?? I.hearMul.other);
    const x = s.x + n * noise3(s.tick, s.sourceId, 1, salt) * err, y = s.y + n * noise3(s.tick, s.sourceId, 2, salt) * err;
    return { state: 'heard', source: 'sound', kind, x, y, r: Math.max(0.45, err * 1.4), conf: conf0 };
  }
  // Through a wall: which way and about how far, never the spot.
  const bearing = Math.atan2(dy, dx) + n * noise3(s.tick, s.sourceId, 3, salt) * I.dirErrDeg * Math.PI / 180;
  const dist = d * (1 + n * noise3(s.tick, s.sourceId, 4, salt) * I.dirDistShare);
  return { state: 'directional', source: 'sound', kind, x: me.x + Math.cos(bearing) * dist, y: me.y + Math.sin(bearing) * dist,
    r: Math.max(1.5, d * 0.35), conf: conf0 * I.dirConfMul, bearing, ox: me.x, oy: me.y };
}

/**
 * One observer's step: what it sees (own light, muzzle flashes, its Ping), what its standing teammates see (a
 * PARTIAL report, re-placed every TUNING.sound.spottedRefresh s), what it hears in `sounds`, then decay. Online
 * clients pass the snapshot's sounds with dt 0, then sight and decay per frame.
 */
export function senseFor(w: World, me: Actor, intel: Intel, dt: number, sounds: readonly SoundEvent[] = w.sounds, comms: readonly CommsEvent[] = w.comms,
  spotted: readonly { id: number; x: number; y: number }[] = []): void {
  const I = TUNING.intel;
  intel.now += dt;
  const now = intel.now;
  // Muzzle flashes first: a shot seen this step shows its shooter at once (the one reveal rule, any range).
  for (const s of sounds) {
    if (s.type !== 'shot' || s.team === me.team || s.sourceId === me.id) continue;
    if (muzzleFlashSeen(w.level, me.x, me.y, s.x, s.y)) intel.flashUntil.set(s.sourceId, now + TUNING.perception.flashSeconds);
  }
  const pinged = me.alive ? revealed(w, me) : [];
  const mates = w.actors.filter((m) => m !== me && m.team === me.team && standing(m) && m.x > -50);
  const seenNow = new Set<number>();
  for (const a of w.actors) {
    if (a.team === me.team) continue;
    if (!a.alive || a.x < -50) {
      if (!a.alive) { intel.contacts.delete(a.id); intel.flashUntil.delete(a.id); }
      continue;
    }
    const flash = (intel.flashUntil.get(a.id) ?? -1) > now && sightClear(w.level, me.x, me.y, a.x, a.y);
    if (me.alive && (canSee(w.level, me.x, me.y, me.facing, me.view, a.x, a.y) || flash)) {
      report(intel, a.id, { state: 'visible', source: flash && !canSee(w.level, me.x, me.y, me.facing, me.view, a.x, a.y) ? 'flash' : 'sight', kind: 'other', x: a.x, y: a.y, r: 0, conf: 1, facing: a.facing });
      seenNow.add(a.id);
    } else if (pinged.includes(a)) {
      report(intel, a.id, { state: 'partial', source: 'ping', kind: 'other', x: a.x, y: a.y, r: 0, conf: 1, facing: a.facing });
      seenNow.add(a.id);
    } else if (mates.some((m) => canSee(w.level, m.x, m.y, m.facing, m.view, a.x, a.y))) {
      const c = intel.contacts.get(a.id);
      if (!c || c.state !== 'partial' || now >= c.nextReport) {
        report(intel, a.id, { state: 'partial', source: 'teammate', kind: 'other', x: a.x, y: a.y, r: I.spottedRadius, conf: I.conf.teammate, facing: a.facing });
        intel.contacts.get(a.id)!.nextReport = now + TUNING.sound.spottedRefresh;
      }
      seenNow.add(a.id);
    }
  }
  // Online: what the server says your teammates see (a spot near where they saw it, never the live body).
  for (const sp of spotted) {
    if (seenNow.has(sp.id) || !w.actors[sp.id]?.alive) continue;
    report(intel, sp.id, { state: 'partial', source: 'teammate', kind: 'other', x: sp.x, y: sp.y, r: I.spottedRadius, conf: I.conf.teammate });
    seenNow.add(sp.id);
  }
  for (const s of sounds) {
    if (s.team === me.team || s.sourceId === me.id || seenNow.has(s.sourceId) || (!s.est && !hears(w.level, me.x, me.y, s))) continue;
    const src = w.actors[s.sourceId];
    if (!src?.alive) continue;
    const r = hearReport(w, me, s);
    if (r) report(intel, s.sourceId, r);
  }
  // A teammate's call (SB comms): what they heard or lost, with their own error plus the gap between you. Never sharper
  // than what they had; a sighting they call is already a PARTIAL from their light above.
  for (const e of comms) {
    if (e.from === me.id || w.actors[e.from]?.team !== me.team || e.target < 0 || seenNow.has(e.target) || !w.actors[e.target]?.alive) continue;
    const C = TUNING.comms;
    if (e.kind === 'steps' || e.kind === 'shots') report(intel, e.target, { state: 'heard', source: 'callout', kind: e.kind === 'steps' ? 'step' : 'shot', x: e.x, y: e.y, r: e.r + C.baseRadius, conf: C.conf });
    else if (e.kind === 'lost') report(intel, e.target, { state: 'last_known', source: 'callout', kind: 'other', x: e.x, y: e.y, r: e.r + C.baseRadius * 0.5, conf: 0.8, facing: e.heading });
  }
  for (const c of intel.contacts.values()) {
    for (const t of c.trail) t.age += dt;
    while (c.trail.length && c.trail[0].age > I.trailSeconds) c.trail.shift();
    c.fresh = Math.max(0, c.fresh - dt);
    if (seenNow.has(c.id)) continue;
    // Out of every view: a sighting becomes LAST KNOWN where it was, a teammate's report keeps its source.
    if (c.state === 'visible') { c.state = 'last_known'; c.r = 0.25; c.conf = c.conf0 = 1; c.at = now; c.age = 0; }
    else if (c.state === 'partial') { c.state = 'last_known'; c.age = 0; }
    c.age += dt;
    if (c.state === 'lost') {
      c.lostFor += dt;
      if (c.lostFor >= I.lostSeconds) intel.contacts.delete(c.id);
      continue;
    }
    c.r = Math.min(14, c.r + I.spreadSpeed * dt);
    // Fades from its reported confidence to nothing over exactly its source's lifetime, SUSPECTED for the last part.
    c.conf = Math.max(0, c.conf - (c.conf0 * dt) / lifeOf(c));
    if (c.conf <= 0) { c.state = 'lost'; c.lostFor = 0; }
    else if (c.conf < c.conf0 * I.suspectBelow) c.state = 'suspected';
  }
}

/** The ladder rung a hostile is on for this observer (the lab samples it; 'unknown' when there is no belief). */
export function rung(intel: Intel, id: number): ContactState | 'unknown' {
  return intel.contacts.get(id)?.state ?? 'unknown';
}
