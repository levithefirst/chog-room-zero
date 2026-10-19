// PC (keyboard + mouse) and touch twin-stick input, turned into the shared ActorInput the sim reads.
import type { Vec2 } from '../sim/sim';
import type { ActorInput } from '../sim/world';
import { TUNING } from '../config/tuning';
import { stage, toStage } from '../ui/stage';

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
/** The stick travel in use: STICK_RADIUS unless Settings picked another size (RC-7). Read live by input and render. */
export const touchStick = { radius: STICK_RADIUS };

export interface Input {
  mode: 'pc' | 'touch';
  left: Stick;
  right: Stick;
  mouseX: number;
  mouseY: number;
  /** Build this tick's input. `aimFrom` is the player's screen position; `pxPerUnit` turns the cursor distance into a
   * grenade throw distance (PC). */
  read(aimFromX: number, aimFromY: number, pxPerUnit?: number): ActorInput;
  /** True once after a restart/start action (R, Enter, click or tap on an overlay). */
  takeAction(): boolean;
  /** Touch reload button. */
  reload(): void;
  /** Touch ability button. */
  ability(): void;
  /** Touch grenade button: throw along the aim. */
  grenade(): void;
  /** CF: the grenade button pressed (pointer id, stage px): a drag sets direction and distance, release throws. */
  nadeDown(id: number, x: number, y: number): void;
  /** CF landing preview while aiming a grenade (G held on PC, a drag on the touch button): angle and distance in u. */
  nadePreview(aimFromX: number, aimFromY: number, pxPerUnit: number): { ang: number; dist: number } | null;
  /** Escape / P pressed since last call. */
  /** Is fire physically held right now (vs a latched tap)? */
  fireHeld(): boolean;
  /** Is the ability key physically held right now (Space or Q)? The touch button is a tap. */
  abilityHeld(): boolean;
  takePause(): boolean;
  /**
   * Entering play from a menu (Resume, Deploy, Again): drop any fire in progress and ignore fire until the
   * pointer is released and pressed again, so the click that closed the menu can never also shoot.
   */
  holdFireUntilRelease(): void;
  /**
   * Drop every held key, stick and pointer (orientation flip, fullscreen change): a stick base recorded in the old
   * layout's coordinates means nothing after it, and some browsers never send the release for a finger held through it.
   */
  releaseAll(): void;
  dispose(): void;
}

/** A key typed into a text field (RC-7 callsign) belongs to the field. */
/** The key went to a focused button or link (keyboard navigation of a menu). */
export function onControl(e: Event): boolean {
  const t = e.target as { closest?: (s: string) => unknown } | null;
  return !!t?.closest?.('button, a[href], [role="button"]');
}
export function typing(e: Event): boolean {
  const t = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || !!t.isContentEditable);
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
  let grenadeQueued = false;
  // CF grenade aiming: G held on PC (lands at the cursor on release), or a drag that started on the touch button.
  let nadeHeld = false;
  let nadeDrag: { id: number; sx: number; sy: number; x: number; y: number } | null = null;
  let nadeThrow: { ang: number; dist: number } | null = null;
  const NADE_TAP_PX = 14;
  const dragThrow = (d: { sx: number; sy: number; x: number; y: number }) => {
    const dx = d.x - d.sx, dy = d.y - d.sy, len = Math.hypot(dx, dy);
    if (len < NADE_TAP_PX) return null;
    const G = TUNING.grenade;
    return { ang: Math.atan2(dy, dx), dist: G.minThrow + (G.maxThrow - G.minThrow) * Math.min(1, (len - NADE_TAP_PX) / (touchStick.radius * 1.5)) };
  };
  let action = false;
  let pauseQueued = false;
  let lastAim = 0;
  let aimedAt = -1e9; // performance.now() of the last touch aim (right thumb past the ring, or a latched flick)
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
    read(ax, ay, pxPerUnit) {
      const out: ActorInput = { moveX: 0, moveY: 0, quiet: false, aim: lastAim, firing: false, reload: reloadQueued, ability: abilityQueued || held.has('Space') || held.has('KeyQ'), grenade: grenadeQueued };
      reloadQueued = false;
      abilityQueued = false;
      grenadeQueued = false;
      if (out.grenade && nadeThrow) { out.throwAim = nadeThrow.ang; out.throwDist = nadeThrow.dist; }
      nadeThrow = null;
      if (inp.mode === 'pc') {
        const m = keysToMove(held);
        out.moveX = m.x;
        out.moveY = m.y;
        out.quiet = held.has('ShiftLeft') || held.has('ShiftRight');
        lastAim = out.aim = Math.atan2(inp.mouseY - ay, inp.mouseX - ax);
        // PC grenades land at the cursor (clamped in the sim); touch ones fly the default distance along the aim.
        if (out.grenade && pxPerUnit) out.throwDist = Math.hypot(inp.mouseX - ax, inp.mouseY - ay) / pxPerUnit;
        out.firing = firing || fireLatched;
        fireLatched = false;
      } else {
        const m = stickVector(left, touchStick.radius);
        out.moveX = m.x;
        out.moveY = m.y;
        const push = Math.hypot(m.x, m.y);
        out.quiet = push > 0 && push < TUNING.movement.quietStickThreshold;
        const a = stickVector(right, touchStick.radius);
        const now = performance.now();
        if (Math.hypot(a.x, a.y) > AIM_DEADZONE) {
          lastAim = out.aim = Math.atan2(a.y, a.x);
          out.firing = true;
          aimedAt = now;
        } else if (fireLatched) {
          lastAim = out.aim = latchAim;
          out.firing = true;
          aimedAt = now;
        } else if (push > TUNING.movement.touchFaceMoveMin && now - aimedAt > TUNING.movement.touchAimHoldSeconds * 1000) {
          // Aim thumb idle: face the way you walk (RC-5). No fire: firing still needs the right thumb past the ring.
          lastAim = out.aim = Math.atan2(m.y, m.x);
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
    grenade() {
      grenadeQueued = true;
    },
    nadeDown(id, x, y) {
      nadeDrag = { id, sx: x, sy: y, x, y };
    },
    nadePreview(ax, ay, ppu) {
      const G = TUNING.grenade;
      if (nadeDrag) {
        const t = dragThrow(nadeDrag);
        return t ?? { ang: lastAim, dist: G.touchThrow };
      }
      if (nadeHeld && inp.mode === 'pc') return { ang: Math.atan2(inp.mouseY - ay, inp.mouseX - ax), dist: Math.max(G.minThrow, Math.min(G.maxThrow, Math.hypot(inp.mouseX - ax, inp.mouseY - ay) / ppu)) };
      return null;
    },
    abilityHeld() {
      return held.has('Space') || held.has('KeyQ');
    },
    fireHeld() {
      if (inp.mode === 'pc') return firing;
      const a = stickVector(right, touchStick.radius);
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
      // V2: a key pressed while a menu was up (Space on the pause card) is not an order for the match it returns to.
      abilityQueued = false;
      reloadQueued = false;
      grenadeQueued = false;
      right.active = false;
      // Only a press that is still down (e.g. the Resume press itself) is swallowed. If everything was already
      // released (Deploy -> loading -> play, Esc resume), the next press fires normally.
      blocked.clear();
      for (const id of pointersDown) blocked.add(id);
    },
    releaseAll() {
      clear();
      fireLatched = false;
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
    if (typing(e)) return; // the callsign field: letters, Space and Enter are text, not game input
    if (MOVE_CODES.has(e.code)) held.add(e.code);
    if (e.code === 'KeyR') reloadQueued = true;
    // R is reload only; it never restarts a run (CHOG-FLOW-001). Enter confirms menus.
    // Space also confirms menus (consumed and dropped during play). Not on a focused button or link: there the key
    // presses that control (the browser clicks it), never the screen's default action behind it.
    if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat && !onControl(e)) action = true;
    if (e.code === 'Escape' || e.code === 'KeyP') pauseQueued = true;
    if (e.code === 'Space' || e.code === 'KeyQ') {
      e.preventDefault();
      abilityQueued = true;
    }
    // CF: hold G to see where it lands (the ring at the cursor), release to throw.
    if (e.code === 'KeyG' && !e.repeat) nadeHeld = true;
    inp.mode = 'pc';
  };
  const up = (e: KeyboardEvent) => {
    held.delete(e.code);
    if (e.code === 'KeyG' && nadeHeld) { nadeHeld = false; grenadeQueued = true; }
  };
  const clear = () => {
    held.clear();
    nadeHeld = false;
    nadeDrag = null;
    pointersDown.clear(); // a release we never saw (blur, tab switch) must not block the next press
    blocked.clear();
    firing = false;
    left.active = right.active = false;
  };
  const onVis = () => {
    if (document.visibilityState !== 'visible') clear();
  };
  // Sticks, mouse and aim all work in stage coordinates (src/ui/stage.ts): on a phone held upright the stage is the
  // landscape game turned 90 deg, so a viewport point is turned back before it means anything.
  const pdown = (e: PointerEvent) => {
    action = true;
    const pt = toStage(stage(), e.clientX, e.clientY);
    if (e.pointerType === 'touch') {
      inp.mode = 'touch';
      const s = pt.x < stage().w / 2 ? left : right;
      if (s.active) return;
      if (s === right && blocked.has(e.pointerId)) return; // the menu touch never becomes the aim/fire thumb
      Object.assign(s, { active: true, id: e.pointerId, baseX: pt.x, baseY: pt.y, x: pt.x, y: pt.y });
    } else {
      inp.mode = 'pc';
      if (e.button === 0 && !blocked.has(e.pointerId)) firing = fireLatched = true;
      if (e.button === 2 && !blocked.has(e.pointerId)) grenadeQueued = true;
    }
    e.preventDefault();
  };
  const pmove = (e: PointerEvent) => {
    const pt = toStage(stage(), e.clientX, e.clientY);
    if (nadeDrag && e.pointerId === nadeDrag.id) { nadeDrag.x = pt.x; nadeDrag.y = pt.y; return; }
    if (e.pointerType !== 'touch') {
      inp.mouseX = pt.x;
      inp.mouseY = pt.y;
      return;
    }
    for (const s of [left, right]) {
      if (!s.active || s.id !== e.pointerId) continue;
      s.x = pt.x;
      s.y = pt.y;
      // Floating base: follow the thumb if it drifts past the rim, so the stick never "runs out".
      const dx = s.x - s.baseX, dy = s.y - s.baseY, d = Math.hypot(dx, dy);
      if (d > touchStick.radius * 1.4) {
        s.baseX = s.x - (dx / d) * touchStick.radius * 1.4;
        s.baseY = s.y - (dy / d) * touchStick.radius * 1.4;
      }
      if (s === right) {
        const a = stickVector(right, touchStick.radius);
        if (Math.hypot(a.x, a.y) > AIM_DEADZONE) {
          fireLatched = true;
          latchAim = Math.atan2(a.y, a.x);
        }
      }
    }
  };
  const track = (e: PointerEvent) => { pointersDown.add(e.pointerId); };
  const pup = (e: PointerEvent) => {
    if (nadeDrag && e.pointerId === nadeDrag.id) {
      // Released: a drag throws that way and that far, a tap along the aim at the touch default.
      if (e.type === 'pointerup') { nadeThrow = dragThrow(nadeDrag); grenadeQueued = true; }
      nadeDrag = null;
    }
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
