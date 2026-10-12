// CHOG-INPUT-001 tap latch, with a tiny DOM stand-in (Node has EventTarget/Event).
import { describe, expect, it, beforeAll } from 'vitest';
import { createWorld, stepWorld } from '../src/sim/world';
import { WEAPONS } from '../src/config/weapons';

class Doc extends EventTarget { visibilityState = 'visible'; }
beforeAll(() => {
  const win = new EventTarget() as unknown as Record<string, unknown>;
  Object.assign(win, { innerWidth: 1280, innerHeight: 720 });
  Object.assign(globalThis, { window: win, document: new Doc(), matchMedia: () => ({ matches: false }) });
});
const ev = (type: string, o: Record<string, unknown>) => Object.assign(new Event(type), { preventDefault() {}, pointerType: 'mouse', button: 0, clientX: 900, clientY: 360, pointerId: 1 }, o);

describe('CHOG-INPUT-001 tap fire', () => {
  it('a press and release between two reads still reports firing once', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement;
    const inp = createInput(el);
    el.dispatchEvent(ev('pointerdown', {}));
    (window as unknown as EventTarget).dispatchEvent(ev('pointerup', {}));
    expect(inp.fireHeld()).toBe(false);
    expect(inp.read(640, 360).firing).toBe(true);
    expect(inp.read(640, 360).firing).toBe(false);
    inp.dispose();
  });
  it('20 spaced taps (each inside one frame) fire exactly 20 shots', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement;
    const inp = createInput(el);
    const w = createWorld({ bots: [], seed: 2, hero: 'kettle' });
    const p = w.actors[0];
    p.reserve = 999;
    const framesBetween = Math.ceil(WEAPONS.rifle.fireInterval * 60) + 2;
    for (let tap = 0; tap < 20; tap++) {
      el.dispatchEvent(ev('pointerdown', {}));
      (window as unknown as EventTarget).dispatchEvent(ev('pointerup', {}));
      for (let f = 0; f < framesBetween; f++) {
        // Mirror main.ts: read once per stepped frame; after the first step firing follows the held state.
        const i = inp.read(640, 360);
        stepWorld(w, i);
        if (!inp.fireHeld()) i.firing = false;
        if (p.reloadLeft > 0 || p.ammo === 0) { p.ammo = p.weapon.magazine; p.reloadLeft = 0; }
      }
    }
    expect(p.shots).toBe(20);
    inp.dispose();
  });
  it('R never restarts (only Enter confirms)', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement;
    const inp = createInput(el);
    (window as unknown as EventTarget).dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyR', repeat: false, preventDefault() {} }));
    expect(inp.takeAction()).toBe(false);
    (window as unknown as EventTarget).dispatchEvent(Object.assign(new Event('keydown'), { code: 'Enter', repeat: false, preventDefault() {} }));
    expect(inp.takeAction()).toBe(true);
    inp.dispose();
  });
});
