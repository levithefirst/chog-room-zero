// RC-5: on touch, with the aim thumb idle you face the way you walk (the light cone shows the way; looking never needs
// a shot). Aiming wins, and the aim is held briefly after you stop firing so you can strafe while watching.
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { TUNING } from '../src/config/tuning';

class Doc extends EventTarget { visibilityState = 'visible'; }
beforeAll(() => {
  const win = new EventTarget() as unknown as Record<string, unknown>;
  Object.assign(win, { innerWidth: 390, innerHeight: 844 });
  Object.assign(globalThis, { window: win, document: new Doc(), matchMedia: () => ({ matches: true }) });
});
const ev = (type: string, o: Record<string, unknown> = {}) => Object.assign(new Event(type), { preventDefault() {}, pointerType: 'touch', button: 0, clientX: 0, clientY: 0, pointerId: 1 }, o);

describe('RC-5 touch facing', () => {
  it('aim thumb idle: you face the way you walk, and walking never fires', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement; const W = window as unknown as EventTarget;
    const inp = createInput(el);
    el.dispatchEvent(ev('pointerdown', { clientX: 90, clientY: 700, pointerId: 1 }));
    W.dispatchEvent(ev('pointermove', { clientX: 90, clientY: 650, pointerId: 1 })); // push north
    const r = inp.read(195, 422);
    expect(r.aim).toBeCloseTo(-Math.PI / 2, 5);
    expect(r.firing).toBe(false);
    W.dispatchEvent(ev('pointermove', { clientX: 95, clientY: 700, pointerId: 1 })); // tiny push: no turn (jitter)
    expect(inp.read(195, 422).aim).toBeCloseTo(-Math.PI / 2, 5);
    inp.dispose();
  });
  it('aiming wins over walking; after the aim thumb lifts, the aim holds for touchAimHoldSeconds, then follows the walk', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement; const W = window as unknown as EventTarget;
    const inp = createInput(el);
    let now = 1000; const spy = vi.spyOn(performance, 'now').mockImplementation(() => now);
    el.dispatchEvent(ev('pointerdown', { clientX: 90, clientY: 700, pointerId: 1 }));
    W.dispatchEvent(ev('pointermove', { clientX: 90, clientY: 650, pointerId: 1 })); // walk north
    el.dispatchEvent(ev('pointerdown', { clientX: 280, clientY: 700, pointerId: 2 }));
    W.dispatchEvent(ev('pointermove', { clientX: 330, clientY: 700, pointerId: 2 })); // aim east, past the ring
    let r = inp.read(195, 422);
    expect(r.aim).toBeCloseTo(0, 5); expect(r.firing).toBe(true);
    W.dispatchEvent(ev('pointerup', { pointerId: 2 }));
    now += 300; // still within the hold: keep watching east while walking north
    r = inp.read(195, 422);
    expect(r.aim).toBeCloseTo(0, 5); expect(r.firing).toBe(false);
    now += TUNING.movement.touchAimHoldSeconds * 1000; // hold over: face the walk
    r = inp.read(195, 422);
    expect(r.aim).toBeCloseTo(-Math.PI / 2, 5); expect(r.firing).toBe(false);
    spy.mockRestore();
    inp.dispose();
  });
  it('mouse (PC) aim is unchanged: walking with WASD never turns you', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement; const W = window as unknown as EventTarget;
    const inp = createInput(el);
    inp.mode = 'pc'; inp.mouseX = 300; inp.mouseY = 422; // mouse east of the player
    W.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyW', key: 'w', repeat: false, preventDefault() {} }));
    const r = inp.read(195, 422);
    expect(r.aim).toBeCloseTo(0, 5); expect(r.moveY).toBe(-1);
    inp.dispose();
  });
});
