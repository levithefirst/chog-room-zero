// Keyboard input for PC movement (WASD only). Produces a normalized move vector.
// No aiming, firing, ability, or touch input yet.

import type { Vec2 } from '../sim/sim';

/** Pure: held KeyboardEvent.code values -> move vector. Opposites cancel; diagonals normalized. +y is down. */
export function keysToMove(held: ReadonlySet<string>): Vec2 {
  const x = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
  const y = (held.has('KeyS') ? 1 : 0) - (held.has('KeyW') ? 1 : 0);
  if (x !== 0 && y !== 0) return { x: x * Math.SQRT1_2, y: y * Math.SQRT1_2 };
  return { x, y };
}

const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);

export interface KeyboardInput {
  move(): Vec2;
  dispose(): void;
}

export function createKeyboardInput(target: Window = window): KeyboardInput {
  const held = new Set<string>();
  const down = (e: KeyboardEvent) => {
    if (MOVE_CODES.has(e.code)) held.add(e.code);
  };
  const up = (e: KeyboardEvent) => {
    held.delete(e.code);
  };
  const clear = () => held.clear();
  const onVisibility = () => {
    if (document.visibilityState !== 'visible') clear();
  };

  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    move: () => keysToMove(held),
    dispose() {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', onVisibility);
      clear();
    },
  };
}
