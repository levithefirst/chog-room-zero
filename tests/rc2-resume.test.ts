// RC-2: the click that presses Resume (or Deploy/Again) must not fire; fire needs release-then-press after it.
import { describe, expect, it, beforeAll } from 'vitest';

class Doc extends EventTarget { visibilityState = 'visible'; }
beforeAll(() => {
  const win = new EventTarget() as unknown as Record<string, unknown>;
  Object.assign(win, { innerWidth: 1280, innerHeight: 720 });
  Object.assign(globalThis, { window: win, document: new Doc(), matchMedia: () => ({ matches: false }) });
});
const ev = (type: string, o: Record<string, unknown> = {}) => Object.assign(new Event(type), { preventDefault() {}, pointerType: 'mouse', button: 0, clientX: 900, clientY: 360, pointerId: 1 }, o);
const W = () => window as unknown as EventTarget;

describe('RC-2 resume never fires', () => {
  it('a press already in progress when play resumes is dropped (event reached the game before the menu closed)', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement;
    const inp = createInput(el);
    W().dispatchEvent(ev('pointerdown')); // window capture sees the press first
    el.dispatchEvent(ev('pointerdown')); // the Resume press, if it ever reaches the game input
    inp.holdFireUntilRelease(); // go('resume')
    expect(inp.read(640, 360).firing).toBe(false);
    expect(inp.fireHeld()).toBe(false);
    inp.dispose();
  });
  it('a press arriving after resume (same click bubbling late) is ignored until release', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement;
    const inp = createInput(el);
    W().dispatchEvent(ev('pointerdown')); // the Resume press on the overlay (window capture)
    inp.holdFireUntilRelease(); // go('resume') from the overlay pointerdown handler
    el.dispatchEvent(ev('pointerdown')); // same press reaching the game late
    expect(inp.read(640, 360).firing).toBe(false);
    W().dispatchEvent(ev('pointerup'));
    el.dispatchEvent(ev('pointerdown')); // fresh press
    expect(inp.read(640, 360).firing).toBe(true);
    inp.dispose();
  });
  it('touch: the aim/fire thumb needs a fresh touch after resume; the move thumb is unaffected', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement;
    const inp = createInput(el);
    W().dispatchEvent(ev('pointerdown', { pointerType: 'touch', clientX: 1000, pointerId: 7 }));
    inp.holdFireUntilRelease();
    el.dispatchEvent(ev('pointerdown', { pointerType: 'touch', clientX: 1000, pointerId: 7 }));
    expect(inp.right.active).toBe(false);
    el.dispatchEvent(ev('pointerdown', { pointerType: 'touch', clientX: 100, pointerId: 8 }));
    expect(inp.left.active).toBe(true);
    W().dispatchEvent(ev('pointerup', { pointerType: 'touch', pointerId: 7 }));
    el.dispatchEvent(ev('pointerdown', { pointerType: 'touch', clientX: 1000, pointerId: 9 }));
    expect(inp.right.active).toBe(true);
    inp.dispose();
  });
  it('nothing held when play starts (Deploy -> loading -> play, Esc resume): the very next press fires', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement;
    const inp = createInput(el);
    W().dispatchEvent(ev('pointerdown')); // Deploy click...
    W().dispatchEvent(ev('pointerup')); // ...released before the match loads
    inp.holdFireUntilRelease(); // go('loaded') -> play
    W().dispatchEvent(ev('pointerdown'));
    el.dispatchEvent(ev('pointerdown'));
    expect(inp.read(640, 360).firing).toBe(true);
    inp.dispose();
  });
});
