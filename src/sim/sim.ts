// Pure simulation. No rendering, DOM, or pixi imports.

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
