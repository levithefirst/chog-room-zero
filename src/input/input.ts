// Input stub. P0-1 wires nothing: no movement, aiming, or firing.
// Real keyboard/mouse and touch input arrive in their own tasks.

export interface InputState {
  readonly ready: boolean;
}

export function createInput(): InputState {
  return { ready: true };
}
