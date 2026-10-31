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
    // The cursor sits at the page origin: face that way first (GP: a pull waits for the body to turn; the tap that
    // lands mid-turn is covered in tests/gp-combat.test.ts).
    p.facing = Math.atan2(-360, -640);
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
  it('a held Space stays held through a long frame: an Aura is not dropped by its own held key', async () => {
    const { createInput } = await import('../src/input/input');
    const { superAbility } = await import('../src/config/superpowers');
    const el = new EventTarget() as unknown as HTMLElement;
    const inp = createInput(el);
    const w = createWorld({ bots: [], seed: 2, power: { ...(await import('../src/config/power')).BASE_POWER, tier: 'common', superpower: superAbility('aura', 'common') } });
    const key = (type: string) => (window as unknown as EventTarget).dispatchEvent(Object.assign(new Event(type), { code: 'Space', key: ' ', repeat: false, preventDefault() {} }));
    key('keydown');
    // Mirror main.ts on a slow device: frames of 6 steps while the key is held for 3 frames.
    for (let f = 0; f < 3; f++) {
      const i = inp.read(640, 360);
      for (let s = 0; s < 6; s++) { stepWorld(w, i); i.ability = inp.abilityHeld(); }
    }
    expect(w.actors[0].auraLeft).toBeGreaterThan(0);
    key('keyup');
    for (let f = 0; f < 3; f++) { const i = inp.read(640, 360); for (let s = 0; s < 6; s++) { stepWorld(w, i); i.ability = inp.abilityHeld(); } }
    expect(w.actors[0].auraLeft).toBeGreaterThan(0);
    // A fresh press after a real release still drops it early.
    key('keydown');
    { const i = inp.read(640, 360); stepWorld(w, i); }
    expect(w.actors[0].auraLeft).toBe(0);
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
