// RC-4: rotation releases every held input; tablet portrait plays at the same scale as phone landscape.
import { describe, expect, it, beforeAll } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { PORTRAIT_PLAY_MIN_WIDTH, orientationOf } from '../src/ui/orientation';

class Doc extends EventTarget { visibilityState = 'visible'; }
beforeAll(() => {
  const win = new EventTarget() as unknown as Record<string, unknown>;
  Object.assign(win, { innerWidth: 844, innerHeight: 390 });
  Object.assign(globalThis, { window: win, document: new Doc(), matchMedia: () => ({ matches: true }) });
});
const ev = (type: string, o: Record<string, unknown> = {}) => Object.assign(new Event(type), { preventDefault() {}, pointerType: 'touch', button: 0, clientX: 100, clientY: 300, pointerId: 1 }, o);
const key = (type: string, code: string) => Object.assign(new Event(type), { preventDefault() {}, code, key: code, repeat: false });

describe('RC-4 orientation', () => {
  it('releaseAll drops a held move stick, aim stick, fire latch and keys (finger held through a rotation)', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement;
    const W = window as unknown as EventTarget;
    const inp = createInput(el);
    el.dispatchEvent(ev('pointerdown', { clientX: 100, clientY: 300, pointerId: 1 }));
    W.dispatchEvent(ev('pointermove', { clientX: 150, clientY: 300, pointerId: 1 }));
    el.dispatchEvent(ev('pointerdown', { clientX: 700, clientY: 200, pointerId: 2 }));
    W.dispatchEvent(ev('pointermove', { clientX: 700, clientY: 250, pointerId: 2 }));
    W.dispatchEvent(key('keydown', 'KeyD'));
    expect(inp.left.active && inp.right.active).toBe(true);
    inp.releaseAll(); // orientation flipped; no pointerup/cancel ever arrives for fingers 1 and 2
    expect(inp.left.active || inp.right.active).toBe(false);
    inp.mode = 'touch';
    const r = inp.read(422, 195);
    expect([r.moveX, r.moveY, r.firing]).toEqual([0, 0, false]);
    // The same fingers moving afterwards do not revive the old sticks; a fresh touch works at once.
    W.dispatchEvent(ev('pointermove', { clientX: 190, clientY: 300, pointerId: 1 }));
    expect(inp.left.active).toBe(false);
    el.dispatchEvent(ev('pointerdown', { clientX: 100, clientY: 300, pointerId: 3 }));
    expect(inp.left.active).toBe(true);
    inp.mode = 'pc';
    expect(inp.read(0, 0).moveX).toBe(0); // D was dropped too
    inp.dispose();
  });
  it('tablets in portrait get about the pixels per unit of the smallest supported phone landscape', () => {
    const R = TUNING.render;
    const ppu = (w: number, h: number) => Math.min(w / R.viewWidthUnits, h / R.minViewHeightUnits);
    expect(ppu(744, 1133)).toBeGreaterThanOrEqual(ppu(667, 375)); // smallest current iPad, portrait
    expect(ppu(PORTRAIT_PLAY_MIN_WIDTH, 900)).toBeGreaterThanOrEqual(ppu(667, 375) * 0.85); // the cut-off itself
    expect(ppu(390, 844)).toBeLessThan(ppu(667, 375) * 0.65); // why phones rotate: a 390 px portrait is far smaller
    expect(orientationOf(820, 1180)).toBe('portrait');
    expect(orientationOf(1180, 820)).toBe('landscape');
  });
});

import { frameAxis } from '../src/render/camera';
describe('RC-4 camera framing', () => {
  it('centres the map on an axis the view fully covers (portrait tablet), follows the player otherwise', () => {
    expect(frameAxis(2.5, 31.6, 26)).toBe(13); // 820x1180: 31.6 u tall view, 26 u map
    expect(frameAxis(2.5, 26, 26)).toBe(13);
    expect(frameAxis(2.5, 11, 26)).toBe(2.5); // landscape: unchanged, player stays centred
    expect(frameAxis(3.5, 22, 44)).toBe(3.5);
  });
});
