// Pure simulation. No rendering, DOM, timers, or pixi imports. Deterministic for equal inputs.

export interface StepResult {
  steps: number;
  remainder: number;
}

/**
 * Fixed-step accumulator: how many sim steps to run for this frame's elapsed time.
 * Leftover time carries over; steps are capped so a long hitch cannot spiral.
 */
export function fixedSteps(
  accumulator: number,
  elapsed: number,
  step: number,
  maxSteps: number,
): StepResult {
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
 * Advance the player one fixed step. `move` is a direction with length <= 1.
 * Returns a new state; the input state is not mutated.
 */
export function stepPlayer(p: PlayerState, move: Vec2, dt: number, t: MovementTuning): PlayerState {
  let { vx, vy } = p;
  const moveLen = Math.hypot(move.x, move.y);

  if (moveLen === 0) {
    // Release: brake along current velocity, snap to exactly zero near the end.
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
    // Steer velocity toward the target velocity at a bounded rate.
    const scale = Math.min(1, moveLen) / moveLen;
    const tx = move.x * scale * t.maxSpeed;
    const ty = move.y * scale * t.maxSpeed;
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

  // Hard cap (guards against float drift).
  const speed = Math.hypot(vx, vy);
  if (speed > t.maxSpeed) {
    vx *= t.maxSpeed / speed;
    vy *= t.maxSpeed / speed;
  }

  return { x: p.x + vx * dt, y: p.y + vy * dt, vx, vy };
}
