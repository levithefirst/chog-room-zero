// RC-4/RC-5: rotation releases every held input; portrait phones get their own framing (scale, HUD-safe camera,
// edge chevrons for seen hostiles past the screen edge).
import { describe, expect, it, beforeAll } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { orientationOf } from '../src/ui/orientation';
import { frameAxis, viewScale } from '../src/render/camera';
import { edgeAnchor } from '../src/render/visibility';
import { HEROES } from '../src/config/heroes';
import { SIDEGRADES } from '../src/sim/operators';

class Doc extends EventTarget { visibilityState = 'visible'; }
beforeAll(() => {
  const win = new EventTarget() as unknown as Record<string, unknown>;
  Object.assign(win, { innerWidth: 390, innerHeight: 844 });
  Object.assign(globalThis, { window: win, document: new Doc(), matchMedia: () => ({ matches: true }) });
});
const ev = (type: string, o: Record<string, unknown> = {}) => Object.assign(new Event(type), { preventDefault() {}, pointerType: 'touch', button: 0, clientX: 100, clientY: 300, pointerId: 1 }, o);
const key = (type: string, code: string) => Object.assign(new Event(type), { preventDefault() {}, code, key: code, repeat: false });
const R = TUNING.render;

describe('RC-4 orientation flip releases input', () => {
  it('releaseAll drops a held move stick, aim stick, fire latch and keys (finger held through a rotation)', async () => {
    const { createInput } = await import('../src/input/input');
    const el = new EventTarget() as unknown as HTMLElement;
    const W = window as unknown as EventTarget;
    const inp = createInput(el);
    el.dispatchEvent(ev('pointerdown', { clientX: 100, clientY: 700, pointerId: 1 }));
    W.dispatchEvent(ev('pointermove', { clientX: 150, clientY: 700, pointerId: 1 }));
    el.dispatchEvent(ev('pointerdown', { clientX: 300, clientY: 700, pointerId: 2 }));
    W.dispatchEvent(ev('pointermove', { clientX: 300, clientY: 750, pointerId: 2 }));
    W.dispatchEvent(key('keydown', 'KeyD'));
    expect(inp.left.active && inp.right.active).toBe(true);
    inp.releaseAll(); // orientation flipped; no pointerup/cancel ever arrives for fingers 1 and 2
    expect(inp.left.active || inp.right.active).toBe(false);
    inp.mode = 'touch';
    const r = inp.read(195, 422);
    expect([r.moveX, r.moveY, r.firing]).toEqual([0, 0, false]);
    W.dispatchEvent(ev('pointermove', { clientX: 190, clientY: 700, pointerId: 1 }));
    expect(inp.left.active).toBe(false);
    el.dispatchEvent(ev('pointerdown', { clientX: 100, clientY: 700, pointerId: 3 }));
    expect(inp.left.active).toBe(true);
    inp.mode = 'pc';
    expect(inp.read(0, 0).moveX).toBe(0);
    inp.dispose();
  });
  it('orientationOf', () => {
    expect(orientationOf(820, 1180)).toBe('portrait');
    expect(orientationOf(1180, 820)).toBe('landscape');
  });
});

describe('RC-5 portrait framing', () => {
  it('portrait phones get phone-landscape scale, not a shrunken landscape view', () => {
    const land667 = viewScale(667, 375, R);
    expect(viewScale(390, 844, R)).toBeCloseTo(26, 0); // 15 u across
    expect(viewScale(375, 667, R)).toBeCloseTo(25, 0);
    expect(viewScale(390, 844, R)).toBeGreaterThan(land667 * 0.8);
    expect(viewScale(390, 844, R)).toBeGreaterThan((390 / R.viewWidthUnits) * 1.4); // RC-4 would have drawn 17.7 px/u
    expect(viewScale(820, 1180, R)).toBeCloseTo(820 / 22, 3); // tablets unchanged (22 u across)
    expect(viewScale(1440, 900, R)).toBeCloseTo(Math.min(1440 / 22, 900 / 11), 6); // landscape/desktop unchanged
  });
  it('the portrait view ahead of the aim covers every hero sight range, or seen hostiles get edge chevrons', () => {
    const ahead = 390 / viewScale(390, 844, R) / 2 + R.portraitLookahead; // facing east, lead fully in
    expect(ahead).toBeGreaterThanOrEqual(10.4);
    // Base sight of Kettle 9, Mop 8, Brick 7.5 fits on screen ahead of the aim. Wick (12 u) and long sidegrades
    // (Lamp x1.22, e.g. Kettle 10.98 u) can see past the edge: those seen hostiles get edge chevrons (below).
    for (const h of HEROES) if (h.id !== 'ray') expect(h.vision.range).toBeLessThanOrEqual(ahead);
    const longest = Math.max(...HEROES.flatMap((h) => SIDEGRADES.map((sg) => h.vision.range * sg.rangeMul)));
    expect(longest).toBeGreaterThan(ahead); // so the chevrons are needed, not decoration
    expect(edgeAnchor(195, 422, 600, 422, 16, 16, 374, 828)).toMatchObject({ x: 374, y: 422 });
    expect(edgeAnchor(195, 422, 300, 500, 16, 16, 374, 828)).toBeNull();
    const e = edgeAnchor(195, 422, 195, -300, 16, 16, 374, 828)!;
    expect(e.x).toBeCloseTo(195, 6);
    expect(e.y).toBeCloseTo(16, 6);
  });
  it('frameAxis shows map instead of void but never lets the player slide under a HUD band', () => {
    // 390x844 at 26 px/u: 15 u wide; map 44 u wide. Spawn x 3.5: view stops at the map edge.
    expect(frameAxis(3.5, 3.5, 15, 44, 0, 0, 1)).toBe(7.5);
    // Vertical: 32.5 u view, 26 u map, top band 3.5 u, bottom band 2.3 u. The map would centre (13) ...
    expect(frameAxis(2.5, 2.5, 32.5, 26, 3.5, 2.3, 1)).toBe(13);
    // ... but a player at the bottom row (24.5) stays above the bottom band: camera follows down to keep it clear.
    const c = frameAxis(24.5, 24.5, 32.5, 26, 3.5, 2.3, 1);
    expect(24.5 - (c - 16.25)).toBeLessThanOrEqual(32.5 - 2.3 - 1 + 1e-9);
    expect(24.5 - (c - 16.25)).toBeGreaterThanOrEqual(3.5 + 1 - 1e-9);
    // Landscape-like case (view smaller than map): follows the camera inside the map.
    expect(frameAxis(20, 20, 15, 44, 0, 0, 1)).toBe(20);
  });
});
