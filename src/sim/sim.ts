// Pure movement and timing helpers. No rendering, DOM, timers, or pixi imports.

export interface StepResult {
  steps: number;
  remainder: number;
}

/**
 * Fixed-step accumulator: how many sim steps to run for this frame's elapsed time.
 * Leftover time carries over; steps are capped so a long hitch cannot spiral.
 */
export function fixedSteps(accumulator: number, elapsed: number, step: number, maxSteps: number): StepResult {
  let acc = accumulator + Math.max(0, elapsed);
  let steps = 0;
  while (acc >= step && steps < maxSteps) {
    acc -= step;
    steps++;
  }
  if (steps === maxSteps) acc = Math.min(acc, step);
  return { steps, remainder: acc };
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface MovementTuning {
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  reverseAccelMultiplier: number;
  stopEpsilon: number;
}

export function createPlayer(x = 0, y = 0): PlayerState {
  return { x, y, vx: 0, vy: 0 };
}

/**
 * New velocity after one step. `move` has length <= 1 (analog sticks give less); `speedScale` lowers the cap
 * (quiet walk). Mutates and returns `out` so per-tick code does not allocate.
 */
export function stepVelocity(
  vx: number, vy: number, move: Vec2, dt: number, t: MovementTuning, speedScale: number, out: Vec2,
): Vec2 {
  const cap = t.maxSpeed * speedScale;
  const moveLen = Math.hypot(move.x, move.y);
  if (moveLen === 0) {
    const speed = Math.hypot(vx, vy);
    const next = speed - t.deceleration * dt;
    if (next <= t.stopEpsilon) {
      vx = 0;
      vy = 0;
    } else {
      vx *= next / speed;
      vy *= next / speed;
    }
  } else {
    const scale = Math.min(1, moveLen) / moveLen;
    const tx = move.x * scale * cap;
    const ty = move.y * scale * cap;
    const dx = tx - vx;
    const dy = ty - vy;
    const diff = Math.hypot(dx, dy);
    if (diff > 0) {
      const reversing = vx * tx + vy * ty < 0;
      const rate = t.acceleration * (reversing ? t.reverseAccelMultiplier : 1);
      const k = Math.min(diff, rate * dt) / diff;
      vx += dx * k;
      vy += dy * k;
    }
  }
  // Hard cap at full run speed (guards float drift; knockback may briefly exceed the quiet cap).
  const speed = Math.hypot(vx, vy);
  if (speed > t.maxSpeed) {
    vx *= t.maxSpeed / speed;
    vy *= t.maxSpeed / speed;
  }
  out.x = vx;
  out.y = vy;
  return out;
}

/** Open-floor step (no walls). Returns a new state; the input is not mutated. */
export function stepPlayer(p: PlayerState, move: Vec2, dt: number, t: MovementTuning): PlayerState {
  const v = stepVelocity(p.vx, p.vy, move, dt, t, 1, { x: 0, y: 0 });
  return { x: p.x + v.x * dt, y: p.y + v.y * dt, vx: v.x, vy: v.y };
}
