// RC-3: the menu press is the only pointer swallowed after a menu; a latched tap from before a pause never fires on resume.
import { describe, expect, it, beforeAll } from 'vitest';

class Doc extends EventTarget { visibilityState = 'visible'; }
beforeAll(() => {
  const win = new EventTarget() as unknown as Record<string, unknown>;
  Object.assign(win, { innerWidth: 844, innerHeight: 390 });
  Object.assign(globalThis, { window: win, document: new Doc(), matchMedia: () => ({ matches: false }) });
});
const ev = (type: string, o: Record<string, unknown> = {}) => Object.assign(new Event(type), { preventDefault() {}, pointerType: 'mouse', button: 0, clientX: 600, clientY: 200, pointerId: 1 }, o);
const W = () => window as unknown as EventTarget;
// A real press: window capture sees it first, then the game element (when the press lands on the canvas).
const press = (el: EventTarget, o: Record<string, unknown>) => { W().dispatchEvent(ev('pointerdown', o)); el.dispatchEvent(ev('pointerdown', o)); };

describe('RC-3 input after menus', () => {
  it('touch: a move thumb already resting when the match starts does not swallow the first aim/fire push', async () => {
    const { createInput, STICK_RADIUS } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement;
    const inp = createInput(el);
    press(el, { pointerType: 'touch', clientX: 100, clientY: 260, pointerId: 2 }); // move thumb down during loading
    inp.holdFireUntilRelease(); // go('loaded') -> play, move thumb still down
    press(el, { pointerType: 'touch', clientX: 640, clientY: 230, pointerId: 3 }); // first aim push, new finger
    W().dispatchEvent(ev('pointermove', { pointerType: 'touch', clientX: 640 + STICK_RADIUS * 0.8, clientY: 230, pointerId: 3 }));
    expect(inp.right.active).toBe(true);
    expect(inp.read(422, 195).firing).toBe(true);
    inp.dispose();
  });
  it('touch: the menu finger itself still never becomes the aim/fire thumb', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement;
    const inp = createInput(el);
    W().dispatchEvent(ev('pointerdown', { pointerType: 'touch', clientX: 640, pointerId: 5 })); // Resume tap (overlay)
    inp.holdFireUntilRelease();
    el.dispatchEvent(ev('pointerdown', { pointerType: 'touch', clientX: 640, pointerId: 5 }));
    expect(inp.right.active).toBe(false);
    inp.dispose();
  });
  it('PC: a click latched in the frame before a pause does not fire on resume (root cause of the RC-1 Resume shot)', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement;
    const inp = createInput(el);
    press(el, {}); // click on the canvas...
    W().dispatchEvent(ev('pointerup')); // ...released before the sim read it: latched
    // Esc in the same frame: phase -> pause, read() never ran, the latch survives the whole pause.
    inp.holdFireUntilRelease(); // resume
    expect(inp.read(640, 360).firing).toBe(false);
    press(el, {}); // fresh click after resume
    expect(inp.read(640, 360).firing).toBe(true);
    inp.dispose();
  });
});
