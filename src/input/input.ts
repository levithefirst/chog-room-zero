// PC (keyboard + mouse) and touch twin-stick input, turned into the shared ActorInput the sim reads.
import type { Vec2 } from '../sim/sim';
import type { ActorInput } from '../sim/world';
import { TUNING } from '../config/tuning';

/** Pure: held KeyboardEvent.code values -> move vector. Opposites cancel; diagonals normalized. +y is down. */
export function keysToMove(held: ReadonlySet<string>): Vec2 {
  const x = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
  const y = (held.has('KeyS') ? 1 : 0) - (held.has('KeyW') ? 1 : 0);
  if (x !== 0 && y !== 0) return { x: x * Math.SQRT1_2, y: y * Math.SQRT1_2 };
  return { x, y };
}

export interface Stick {
  active: boolean;
  id: number;
  baseX: number;
  baseY: number;
  x: number;
  y: number;
}

/** Pure: stick offset in px -> vector with length <= 1. */
export function stickVector(s: Stick, radiusPx: number): Vec2 {
  if (!s.active) return { x: 0, y: 0 };
  const dx = s.x - s.baseX, dy = s.y - s.baseY;
  const d = Math.hypot(dx, dy);
  if (d === 0) return { x: 0, y: 0 };
  const m = Math.min(1, d / radiusPx);
  return { x: (dx / d) * m, y: (dy / d) * m };
}

// Right stick push share that starts firing. Inside it, aiming stops firing (LOCKED control rule).
export const AIM_DEADZONE = 0.35;
// Stick travel in px for full push. 56 px: a comfortable thumb movement on a phone.
export const STICK_RADIUS = 56;

export interface Input {
  mode: 'pc' | 'touch';
  left: Stick;
  right: Stick;
  mouseX: number;
  mouseY: number;
  /** Build this tick's input. `aimFrom` is the player's screen position. */
  read(aimFromX: number, aimFromY: number): ActorInput;
  /** True once after a restart/start action (R, Enter, click or tap on an overlay). */
  takeAction(): boolean;
  /** Touch reload button. */
  reload(): void;
  /** Touch ability button. */
  ability(): void;
  /** Escape / P pressed since last call. */
  /** Is fire physically held right now (vs a latched tap)? */
  fireHeld(): boolean;
  takePause(): boolean;
  /**
   * Entering play from a menu (Resume, Deploy, Again): drop any fire in progress and ignore fire until the
   * pointer is released and pressed again, so the click that closed the menu can never also shoot.
   */
  holdFireUntilRelease(): void;
  dispose(): void;
}

const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyR', 'Space', 'KeyQ']);

export function createInput(el: HTMLElement): Input {
  const held = new Set<string>();
  let firing = false;
  // Tap latch: a press that starts and ends between two reads still fires once (CHOG-INPUT-001).
  let fireLatched = false;
  let latchAim = 0;
  let reloadQueued = false;
  let abilityQueued = false;
  let action = false;
  let pauseQueued = false;
  let lastAim = 0;
  // Pointers currently down anywhere on the page (window capture, so menu presses on the overlay count too).
  const pointersDown = new Set<number>();
  // Pointers that were down when play began (the menu press itself). Only these are swallowed, until released;
  // any other pointer (a new touch, a move thumb already resting on the glass) works at once (RC-3).
  const blocked = new Set<number>();
  const left: Stick = { active: false, id: -1, baseX: 0, baseY: 0, x: 0, y: 0 };
  const right: Stick = { active: false, id: -1, baseX: 0, baseY: 0, x: 0, y: 0 };

  const inp: Input = {
    mode: matchMedia('(pointer: coarse)').matches ? 'touch' : 'pc',
    left, right, mouseX: 0, mouseY: 0,
    read(ax, ay) {
      const out: ActorInput = { moveX: 0, moveY: 0, quiet: false, aim: lastAim, firing: false, reload: reloadQueued, ability: abilityQueued || held.has('Space') || held.has('KeyQ') };
      reloadQueued = false;
      abilityQueued = false;
      if (inp.mode === 'pc') {
        const m = keysToMove(held);
        out.moveX = m.x;
        out.moveY = m.y;
        out.quiet = held.has('ShiftLeft') || held.has('ShiftRight');
        lastAim = out.aim = Math.atan2(inp.mouseY - ay, inp.mouseX - ax);
        out.firing = firing || fireLatched;
        fireLatched = false;
      } else {
        const m = stickVector(left, STICK_RADIUS);
        out.moveX = m.x;
        out.moveY = m.y;
        const push = Math.hypot(m.x, m.y);
        out.quiet = push > 0 && push < TUNING.movement.quietStickThreshold;
        const a = stickVector(right, STICK_RADIUS);
        if (Math.hypot(a.x, a.y) > AIM_DEADZONE) {
          lastAim = out.aim = Math.atan2(a.y, a.x);
          out.firing = true;
        } else if (fireLatched) {
          lastAim = out.aim = latchAim;
          out.firing = true;
        }
        fireLatched = false;
      }
      return out;
    },
    reload() {
      reloadQueued = true;
    },
    ability() {
      abilityQueued = true;
    },
    fireHeld() {
      if (inp.mode === 'pc') return firing;
      const a = stickVector(right, STICK_RADIUS);
      return right.active && Math.hypot(a.x, a.y) > AIM_DEADZONE;
    },
    takePause() {
      const p = pauseQueued;
      pauseQueued = false;
      return p;
    },
    holdFireUntilRelease() {
      firing = false;
      fireLatched = false;
      right.active = false;
      // Only a press that is still down (e.g. the Resume press itself) is swallowed. If everything was already
      // released (Deploy -> loading -> play, Esc resume), the next press fires normally.
      blocked.clear();
      for (const id of pointersDown) blocked.add(id);
    },
    takeAction() {
      const a = action;
      action = false;
      return a;
    },
    dispose() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointerdown', track, true);
      el.removeEventListener('pointerdown', pdown);
      window.removeEventListener('pointermove', pmove);
      window.removeEventListener('pointerup', pup);
      window.removeEventListener('pointercancel', pup);
    },
  };

  const down = (e: KeyboardEvent) => {
    if (MOVE_CODES.has(e.code)) held.add(e.code);
    if (e.code === 'KeyR') reloadQueued = true;
    // R is reload only; it never restarts a run (CHOG-FLOW-001). Enter confirms menus.
    if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) action = true; // Space also confirms menus (consumed and dropped during play)
    if (e.code === 'Escape' || e.code === 'KeyP') pauseQueued = true;
    if (e.code === 'Space' || e.code === 'KeyQ') {
      e.preventDefault();
      abilityQueued = true;
    }
    inp.mode = 'pc';
  };
  const up = (e: KeyboardEvent) => void held.delete(e.code);
  const clear = () => {
    held.clear();
    pointersDown.clear(); // a release we never saw (blur, tab switch) must not block the next press
    blocked.clear();
    firing = false;
    left.active = right.active = false;
  };
  const onVis = () => {
    if (document.visibilityState !== 'visible') clear();
  };
  const pdown = (e: PointerEvent) => {
    action = true;
    if (e.pointerType === 'touch') {
      inp.mode = 'touch';
      const s = e.clientX < window.innerWidth / 2 ? left : right;
      if (s.active) return;
      if (s === right && blocked.has(e.pointerId)) return; // the menu touch never becomes the aim/fire thumb
      Object.assign(s, { active: true, id: e.pointerId, baseX: e.clientX, baseY: e.clientY, x: e.clientX, y: e.clientY });
    } else {
      inp.mode = 'pc';
      if (e.button === 0 && !blocked.has(e.pointerId)) firing = fireLatched = true;
    }
    e.preventDefault();
  };
  const pmove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') {
      inp.mouseX = e.clientX;
      inp.mouseY = e.clientY;
      return;
    }
    for (const s of [left, right]) {
      if (!s.active || s.id !== e.pointerId) continue;
      s.x = e.clientX;
      s.y = e.clientY;
      // Floating base: follow the thumb if it drifts past the rim, so the stick never "runs out".
      const dx = s.x - s.baseX, dy = s.y - s.baseY, d = Math.hypot(dx, dy);
      if (d > STICK_RADIUS * 1.4) {
        s.baseX = s.x - (dx / d) * STICK_RADIUS * 1.4;
        s.baseY = s.y - (dy / d) * STICK_RADIUS * 1.4;
      }
      if (s === right) {
        const a = stickVector(right, STICK_RADIUS);
        if (Math.hypot(a.x, a.y) > AIM_DEADZONE) {
          fireLatched = true;
          latchAim = Math.atan2(a.y, a.x);
        }
      }
    }
  };
  const track = (e: PointerEvent) => { pointersDown.add(e.pointerId); };
  const pup = (e: PointerEvent) => {
    pointersDown.delete(e.pointerId);
    blocked.delete(e.pointerId); // released: the next press may fire
    if (e.pointerType !== 'touch') {
      if (e.button === 0) firing = false;
      return;
    }
    for (const s of [left, right]) if (s.id === e.pointerId) s.active = false;
  };

  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pointerdown', track, true);
  el.addEventListener('pointerdown', pdown);
  window.addEventListener('pointermove', pmove);
  window.addEventListener('pointerup', pup);
  window.addEventListener('pointercancel', pup);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return inp;
}
