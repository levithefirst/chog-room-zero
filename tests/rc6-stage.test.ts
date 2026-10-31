// RC-6 landscape stage: a phone held upright gets the landscape game turned 90 deg (src/ui/stage.ts), never a portrait
// layout. The mapping must be the exact inverse of the CSS transform, or every touch lands in the wrong place.
import { describe, expect, it, beforeAll } from 'vitest';
import { rectToStage, stageLayout, toScreen, toStage } from '../src/ui/stage';

// What the browser does with `transform-origin: 0 0; transform: translate(W px, 0) rotate(90deg)`, written as the
// CSS matrix product, independently of stage.ts.
function cssTransform(W: number, x: number, y: number) {
  const a = Math.PI / 2;
  return { x: Math.cos(a) * x - Math.sin(a) * y + W, y: Math.sin(a) * x + Math.cos(a) * y };
}

describe('RC-6 stage layout', () => {
  it('touch + portrait -> rotated landscape stage; touch landscape and every desktop window -> unrotated', () => {
    expect(stageLayout(390, 844, true)).toEqual({ rotated: true, w: 844, h: 390, screenW: 390 });
    expect(stageLayout(375, 667, true)).toEqual({ rotated: true, w: 667, h: 375, screenW: 375 });
    expect(stageLayout(844, 390, true)).toEqual({ rotated: false, w: 844, h: 390, screenW: 844 });
    expect(stageLayout(1180, 820, true).rotated).toBe(false);
    expect(stageLayout(820, 1180, true)).toEqual({ rotated: true, w: 1180, h: 820, screenW: 820 });
    expect(stageLayout(500, 900, false).rotated).toBe(false); // narrow desktop window keeps its portrait camera
    expect(stageLayout(1440, 900, false)).toEqual({ rotated: false, w: 1440, h: 900, screenW: 1440 });
  });

  it('toScreen is the CSS transform and toStage its inverse (corners and random points)', () => {
    const L = stageLayout(390, 844, true);
    for (const [x, y] of [[0, 0], [844, 0], [0, 390], [844, 390], [123.5, 77.25], [600, 300]]) {
      const s = toScreen(L, x, y);
      const c = cssTransform(390, x, y);
      expect(s.x).toBeCloseTo(c.x, 9); expect(s.y).toBeCloseTo(c.y, 9);
      const back = toStage(L, s.x, s.y);
      expect(back.x).toBeCloseTo(x, 9); expect(back.y).toBeCloseTo(y, 9);
    }
    // The stage's top edge sits on the screen's right edge (why body.rot maps --st to safe-area-inset-right).
    expect(toScreen(L, 422, 0)).toEqual({ x: 390, y: 422 });
    // Unrotated: identity.
    const D = stageLayout(1280, 720, false);
    expect(toStage(D, 10, 20)).toEqual({ x: 10, y: 20 });
  });

  it('a viewport rect of a turned panel maps back to its stage rect', () => {
    const L = stageLayout(390, 844, true);
    // A stage panel at x 700..830, y 10..50 (top right of the landscape HUD) is drawn on screen at
    // x 390-50..390-10, y 700..830.
    const r = rectToStage(L, { left: 340, top: 700, width: 40, height: 130 });
    expect(r).toEqual({ x: 700, y: 10, w: 130, h: 40 });
  });
});

describe('RC-6 touch input on a turned stage', () => {
  class Doc extends EventTarget { visibilityState = 'visible'; body = { classList: { toggle() {} }, style: { setProperty() {} } }; }
  beforeAll(() => {
    const win = new EventTarget() as unknown as Record<string, unknown>;
    Object.assign(win, { innerWidth: 390, innerHeight: 844 });
    Object.assign(globalThis, { window: win, document: new Doc(), matchMedia: () => ({ matches: true }) });
  });
  const ev = (type: string, o: Record<string, unknown> = {}) => Object.assign(new Event(type), { preventDefault() {}, pointerType: 'touch', button: 0, clientX: 0, clientY: 0, pointerId: 1 }, o);

  it('phone upright (rotated stage): the thumb nearer the screen top is the move stick, and pushes map to stage directions', async () => {
    const { layoutStage, stage } = await import('../src/ui/stage');
    const { createInput } = await import('../src/input/input');
    const stageEl = { style: { cssText: '' } } as unknown as HTMLElement;
    const L = layoutStage(stageEl);
    expect(L.rotated).toBe(true);
    expect(stage()).toEqual(L);
    expect(stageEl.style.cssText).toContain('rotate(90deg)');
    const el = new EventTarget() as unknown as HTMLElement; const W = window as unknown as EventTarget;
    const inp = createInput(el);
    // Phone turned sideways: the left thumb rests near the screen top (stage left half).
    el.dispatchEvent(ev('pointerdown', { clientX: 300, clientY: 100, pointerId: 1 })); // stage (100, 90)
    W.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 150, pointerId: 1 })); // stage (150, 90): push east
    expect(inp.left.active).toBe(true);
    expect(inp.right.active).toBe(false);
    // Right thumb near the screen bottom (stage right half), pushed toward the screen's left edge = stage south.
    el.dispatchEvent(ev('pointerdown', { clientX: 200, clientY: 700, pointerId: 2 })); // stage (700, 190)
    W.dispatchEvent(ev('pointermove', { clientX: 150, clientY: 700, pointerId: 2 })); // stage (700, 240)
    expect(inp.right.active).toBe(true);
    const r = inp.read(422, 195);
    expect(r.moveX).toBeGreaterThan(0.8); expect(Math.abs(r.moveY)).toBeLessThan(1e-9);
    expect(r.aim).toBeCloseTo(Math.PI / 2, 5); expect(r.firing).toBe(true);
    inp.dispose();
  });
});
