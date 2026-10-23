// The shrinking danger zone (RC-8). A pure function of match time and a plan picked once per match, so the same
// zone runs in the local sim and on an authoritative server (which only has to send the plan and the clock).
// Phases: safe (open play) -> per stage: warning (the next circle is shown, nothing moves) -> shrinking (the circle
// closes on the next one) -> final (the last circle holds). Damage outside the circle escalates stage by stage.
import { TUNING } from '../config/tuning';
import { walkable, type Level } from './level';

export type ZonePhase = 'safe' | 'warning' | 'shrinking' | 'final';

export interface Circle { x: number; y: number; r: number }

export interface ZoneStageDef {
  /** Seconds the next circle is shown before it starts to close. */
  warn: number;
  /** Seconds the circle takes to close onto the next one. */
  shrink: number;
  /** Radius of the circle this stage closes to (u). */
  radius: number;
  /** Damage per second outside the circle while this stage closes and until the next stage closes. */
  dps: number;
}

export interface ZoneConfig {
  safeSeconds: number;
  stages: readonly ZoneStageDef[];
  finalDps: number;
  clearance: number;
}

export interface ZoneView {
  phase: ZonePhase;
  /** 0-based stage being warned about or closing; stages.length in the final phase. */
  stage: number;
  /** Seconds to the next phase change; Infinity in the final phase. */
  left: number;
  /** The circle right now: outside it you take `dps`. */
  circle: Circle;
  /** The circle it will close to (shown during warning and shrinking); null when safe or final. */
  next: Circle | null;
  dps: number;
}

/** plan[0] covers the whole floor; plan[k] is the circle after stage k. Nested: each fits inside the one before. */
export interface ZoneState { plan: Circle[]; cfg: ZoneConfig }

/** Fixed-seed generator for the plan, separate from the world's rng so turning the zone on changes nothing else. */
function seeded(seed: number) {
  let s = (seed ^ 0x5a17e) | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Floor with `clear` u of open floor all around (no wall or cover within it): a fair place for the last circle. */
export function openSpot(l: Level, x: number, y: number, clear: number): boolean {
  const c = Math.ceil(clear);
  for (let dy = -c; dy <= c; dy++) for (let dx = -c; dx <= c; dx++) {
    const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy;
    if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) > clear + 0.5) continue;
    if (tx < 0 || ty < 0 || tx >= l.w || ty >= l.h || !walkable(l.tiles[ty * l.w + tx])) return false;
  }
  return true;
}

/**
 * Plans the circles. The final centre is drawn (seeded) from `centres` that are open floor; when `spawns` are
 * given (team spawns online), only centres about equally far from every team (within 20% of the mean) qualify, so
 * no side is handed the safe ground. Intermediate centres lie on the line to the final one, which keeps every circle
 * inside the one before it.
 */
export function planZone(l: Level, seed: number, centres: readonly { x: number; y: number }[], cfg: ZoneConfig = TUNING.zone, spawns?: readonly { x: number; y: number }[]): ZoneState {
  const start: Circle = { x: l.w / 2, y: l.h / 2, r: Math.hypot(l.w / 2, l.h / 2) };
  const last = cfg.stages[cfg.stages.length - 1].radius;
  let ok = centres.filter((c) => openSpot(l, c.x, c.y, cfg.clearance) && Math.hypot(c.x - start.x, c.y - start.y) <= start.r - last);
  if (spawns && spawns.length > 1) {
    const fair = ok.filter((c) => {
      const d = spawns.map((s) => Math.hypot(s.x - c.x, s.y - c.y));
      const mean = d.reduce((a, b) => a + b, 0) / d.length;
      return d.every((v) => Math.abs(v - mean) <= mean * 0.2);
    });
    if (fair.length) ok = fair;
  }
  const f = ok.length ? ok[Math.floor(seeded(seed)() * ok.length)] : { x: start.x, y: start.y };
  const plan: Circle[] = [start];
  for (const st of cfg.stages) {
    const k = (start.r - st.radius) / (start.r - last);
    plan.push({ x: start.x + (f.x - start.x) * k, y: start.y + (f.y - start.y) * k, r: st.radius });
  }
  return { plan, cfg };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** What the zone looks like `t` seconds into the match. */
export function zoneAt(z: ZoneState, t: number): ZoneView {
  const { plan, cfg } = z;
  if (t < cfg.safeSeconds) return { phase: 'safe', stage: 0, left: cfg.safeSeconds - t, circle: plan[0], next: null, dps: 0 };
  let at = cfg.safeSeconds;
  for (let k = 0; k < cfg.stages.length; k++) {
    const st = cfg.stages[k];
    const held = plan[k];
    const prevDps = k === 0 ? 0 : cfg.stages[k - 1].dps;
    if (t < at + st.warn) return { phase: 'warning', stage: k, left: at + st.warn - t, circle: held, next: plan[k + 1], dps: prevDps };
    at += st.warn;
    if (t < at + st.shrink) {
      const u = (t - at) / st.shrink;
      const to = plan[k + 1];
      return { phase: 'shrinking', stage: k, left: at + st.shrink - t, circle: { x: lerp(held.x, to.x, u), y: lerp(held.y, to.y, u), r: lerp(held.r, to.r, u) }, next: to, dps: st.dps };
    }
    at += st.shrink;
  }
  return { phase: 'final', stage: cfg.stages.length, left: Infinity, circle: plan[plan.length - 1], next: null, dps: cfg.finalDps };
}

export function outsideCircle(c: Circle, x: number, y: number): boolean {
  return Math.hypot(x - c.x, y - c.y) > c.r;
}

/** Where to stand to be safe from what is coming: the circle being closed to (or the current one when final). */
export function zoneGoal(v: ZoneView): Circle | null {
  if (v.phase === 'safe') return null;
  return v.next ?? v.circle;
}

/**
 * Where someone at (x, y) should walk to get safe: just inside the closing circle on their own side (not the centre,
 * so bots do not all pile onto one spot), `depth` u in from the edge, snapped to floor.
 */
export function safeSpot(l: Level, c: Circle, x: number, y: number, depth: number): { x: number; y: number } {
  const d = Math.hypot(x - c.x, y - c.y);
  const k = d > 0 ? Math.max(0, c.r - depth) / d : 0;
  return nearestFloor(l, c.x + (x - c.x) * k, c.y + (y - c.y) * k);
}

/** Nearest walkable tile centre to (x, y) (spiral search), for paths that must end on floor. */
export function nearestFloor(l: Level, x: number, y: number): { x: number; y: number } {
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let r = 0; r < Math.max(l.w, l.h); r++) {
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const tx = cx + dx, ty = cy + dy;
      if (tx < 0 || ty < 0 || tx >= l.w || ty >= l.h || !walkable(l.tiles[ty * l.w + tx])) continue;
      const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
      if (d < bd) { bd = d; best = { x: tx + 0.5, y: ty + 0.5 }; }
    }
    if (best) return best;
  }
  return { x, y };
}
