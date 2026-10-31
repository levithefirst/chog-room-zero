// PC keyboard + mouse as a first-class input (owner 2026-10-21): every game action goes through rebindable bindings
// (src/input/bindings.ts) that the real input (src/input/input.ts) reads. Defaults match the LOCKED scheme; a rebind
// takes effect at once, swaps a key already in use, never takes Escape off pause or binds a menu key, and is kept on the
// device. Touch input is untouched by any binding.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ACTIONS, DEFAULT_BINDINGS, actionOf, allKeys, bindings, keyLabel, loadBindings, mainKey, moveKeys, parseBindings, rebind, resetBindings, unbind } from '../src/input/bindings';

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }
const store = () => new Mem() as unknown as Storage;

class Doc extends EventTarget { visibilityState = 'visible'; }
beforeAll(() => {
  const win = new EventTarget() as unknown as Record<string, unknown>;
  Object.assign(win, { innerWidth: 1280, innerHeight: 720 });
  Object.assign(globalThis, { window: win, document: new Doc(), matchMedia: () => ({ matches: false }) });
});
beforeEach(() => resetBindings(store()));

const ev = (type: string, o: Record<string, unknown> = {}) => Object.assign(new Event(type), { preventDefault() {}, pointerType: 'mouse', button: 0, clientX: 900, clientY: 360, pointerId: 1, movementX: 0, movementY: 0, repeat: false }, o);
const W = () => window as unknown as EventTarget;
const key = (type: 'keydown' | 'keyup', code: string) => W().dispatchEvent(ev(type, { code }));
const tapKey = (code: string) => { key('keydown', code); key('keyup', code); };
const mouse = (el: EventTarget, type: string, button: number, o: Record<string, unknown> = {}) => { const e = ev(type, { button, ...o }); if (type === 'pointerdown') W().dispatchEvent(e); (type === 'pointerdown' ? el : W()).dispatchEvent(e); };
const fresh = async () => { const { createInput } = await import('../src/input/input'); const el = new EventTarget() as unknown as HTMLElement; return { el, inp: createInput(el) }; };

describe('bindings: defaults are the LOCKED PC scheme', () => {
  it('WASD move, Shift creep, left click fire, R reload, Space (Q) ability, G or right click grenade, M map, Esc (P) pause', () => {
    expect(DEFAULT_BINDINGS).toEqual({ up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], creep: ['ShiftLeft', 'ShiftRight'], fire: ['Mouse0'], reload: ['KeyR'], ability: ['Space', 'KeyQ'], grenade: ['KeyG', 'Mouse2'], map: ['KeyM'], pause: ['Escape', 'KeyP'] });
    expect(ACTIONS.map((a) => a.id)).toEqual(Object.keys(DEFAULT_BINDINGS));
    expect([moveKeys(), mainKey('reload'), mainKey('grenade'), allKeys('grenade'), mainKey('ability'), mainKey('fire'), mainKey('map')]).toEqual(['WASD', 'R', 'G', 'G / Right click', 'Space', 'Left click', 'M']);
  });
  it('one code drives one action', () => {
    const codes = ACTIONS.flatMap((a) => bindings[a.id]);
    expect(new Set(codes).size).toBe(codes.length);
    expect(actionOf('KeyR')).toBe('reload');
    expect(actionOf('Mouse2')).toBe('grenade');
    expect(actionOf('KeyZ')).toBeNull();
  });
  it('labels', () => {
    expect(['KeyR', 'Digit1', 'ShiftLeft', 'ControlLeft', 'Mouse0', 'Mouse2', 'ArrowUp', 'Numpad4', 'Escape'].map(keyLabel)).toEqual(['R', '1', 'Shift', 'Ctrl', 'Left click', 'Right click', '↑', 'Num 4', 'Esc']);
  });
});

describe('bindings: rebinding', () => {
  it('a new key takes over at once and is kept on the device', () => {
    const s = store();
    expect(rebind('reload', 0, 'KeyT', s)).toBe(true);
    expect(mainKey('reload')).toBe('T');
    expect(actionOf('KeyR')).toBeNull();
    resetBindings(store());
    expect(mainKey('reload')).toBe('R');
    loadBindings(s);
    expect(mainKey('reload')).toBe('T');
  });
  it('a key already in use swaps: neither action is left without a key', () => {
    rebind('reload', 0, 'KeyG', store());
    expect(bindings.reload[0]).toBe('KeyG');
    expect(bindings.grenade).toEqual(['KeyR', 'Mouse2']);
    expect(new Set(ACTIONS.flatMap((a) => bindings[a.id])).size).toBe(ACTIONS.flatMap((a) => bindings[a.id]).length);
  });
  it('mouse buttons bind like keys (right click to reload)', () => {
    rebind('reload', 1, 'Mouse2', store());
    expect(bindings.reload).toEqual(['KeyR', 'Mouse2']);
    expect(bindings.grenade).toEqual(['KeyG']);
  });
  it('menu keys are refused, and Escape stays on pause', () => {
    for (const k of ['Enter', 'Escape', 'Tab']) expect(rebind('reload', 0, k, store())).toBe(false);
    expect(rebind('pause', 0, 'KeyO', store())).toBe(false);
    rebind('pause', 1, 'KeyO', store());
    expect(bindings.pause).toEqual(['Escape', 'KeyO']);
    // Stealing P from pause, or Escape for another action, never leaves pause without Esc.
    rebind('map', 0, 'KeyO', store());
    expect(bindings.pause[0]).toBe('Escape');
  });
  it('the alternate can be cleared; the main key only replaced', () => {
    unbind('ability', 1, store());
    expect(bindings.ability).toEqual(['Space']);
    unbind('ability', 0, store());
    expect(bindings.ability).toEqual(['Space']);
  });
  it('a broken or hand-edited store falls back safely', () => {
    expect(parseBindings('nonsense')).toEqual(DEFAULT_BINDINGS);
    expect(parseBindings({ reload: [42, 'Enter', 'KeyT', 'KeyY', 'KeyU'] }).reload).toEqual(['KeyT', 'KeyY']);
    const dup = parseBindings({ reload: ['KeyG'], grenade: ['KeyG', 'Mouse2'] });
    expect(dup.reload).toEqual(['KeyG']);
    expect(dup.grenade).toEqual(['Mouse2']);
    expect(parseBindings({ pause: ['KeyP'] }).pause).toEqual(['Escape', 'KeyP']);
  });
});

describe('the real input reads the bindings (keyboard + mouse), and touch is untouched', () => {
  it('default keys: move, creep, reload, ability, grenade (hold G, release), right click grenade, left click fire, pause', async () => {
    const { el, inp } = await fresh();
    key('keydown', 'KeyD'); key('keydown', 'KeyW');
    let r = inp.read(640, 360);
    expect(r.moveX).toBeGreaterThan(0);
    expect(r.moveY).toBeLessThan(0);
    key('keyup', 'KeyD'); key('keyup', 'KeyW');
    key('keydown', 'ShiftLeft'); expect(inp.read(640, 360).quiet).toBe(true); key('keyup', 'ShiftLeft');
    tapKey('KeyR'); expect(inp.read(640, 360).reload).toBe(true);
    expect(inp.read(640, 360).reload).toBe(false);
    tapKey('Space'); expect(inp.read(640, 360).ability).toBe(true);
    key('keydown', 'KeyG'); expect(inp.read(640, 360).grenade).toBe(false); // held: aiming the throw
    key('keyup', 'KeyG'); expect(inp.read(640, 360, 40).grenade).toBe(true);
    mouse(el, 'pointerdown', 2); mouse(el, 'pointerup', 2);
    expect(inp.read(640, 360, 40).grenade).toBe(true);
    mouse(el, 'pointerdown', 0);
    expect(inp.read(640, 360).firing).toBe(true);
    mouse(el, 'pointerup', 0);
    expect(inp.read(640, 360).firing).toBe(false);
    tapKey('Escape'); expect(inp.takePause()).toBe(true);
    expect(inp.mode).toBe('pc');
    inp.dispose();
  });
  it('after a rebind the new keys act and the old ones do nothing', async () => {
    rebind('reload', 0, 'KeyT', store());
    rebind('up', 0, 'ArrowUp', store());
    rebind('grenade', 1, 'Mouse1', store());
    const { el, inp } = await fresh();
    tapKey('KeyR'); expect(inp.read(640, 360).reload).toBe(false);
    tapKey('KeyT'); expect(inp.read(640, 360).reload).toBe(true);
    key('keydown', 'KeyW'); expect(inp.read(640, 360).moveY).toBe(0); key('keyup', 'KeyW');
    key('keydown', 'ArrowUp'); expect(inp.read(640, 360).moveY).toBeLessThan(0); key('keyup', 'ArrowUp');
    mouse(el, 'pointerdown', 2); mouse(el, 'pointerup', 2); expect(inp.read(640, 360).grenade).toBe(false);
    mouse(el, 'pointerdown', 1); mouse(el, 'pointerup', 1); expect(inp.read(640, 360).grenade).toBe(true);
    inp.dispose();
  });
  it('a mouse button bound to the map opens it through onMap', async () => {
    rebind('map', 1, 'Mouse1', store());
    const { el, inp } = await fresh();
    let opened = 0;
    inp.onMap = () => opened++;
    mouse(el, 'pointerdown', 1); mouse(el, 'pointerup', 1);
    expect(opened).toBe(1);
    inp.dispose();
  });
  it('while Settings waits for a key, keys are not game input', async () => {
    const { captureKeys } = await import('../src/input/input');
    const { inp } = await fresh();
    captureKeys(true);
    tapKey('KeyR');
    expect(inp.read(640, 360).reload).toBe(false);
    captureKeys(false);
    inp.dispose();
  });
  it('switching devices: a touch makes it touch, a key or a moving mouse makes it keyboard + mouse again', async () => {
    const { el, inp } = await fresh();
    mouse(el, 'pointerdown', 0, { pointerType: 'touch', pointerId: 9, clientX: 100, clientY: 300 });
    expect(inp.mode).toBe('touch');
    W().dispatchEvent(ev('pointerup', { pointerType: 'touch', pointerId: 9 }));
    W().dispatchEvent(ev('pointermove', { pointerType: 'mouse', movementX: 4, movementY: 0 }));
    expect(inp.mode).toBe('pc');
    mouse(el, 'pointerdown', 0, { pointerType: 'touch', pointerId: 10, clientX: 100, clientY: 300 });
    W().dispatchEvent(ev('pointerup', { pointerType: 'touch', pointerId: 10 }));
    expect(inp.mode).toBe('touch');
    tapKey('KeyR');
    expect(inp.mode).toBe('pc');
    inp.dispose();
  });
  it('touch buttons ignore bindings entirely (rebinding reload changes nothing for the touch Reload button)', async () => {
    rebind('reload', 0, 'KeyT', store());
    const { inp } = await fresh();
    inp.mode = 'touch';
    inp.reload();
    expect(inp.read(640, 360).reload).toBe(true);
    inp.grenade();
    expect(inp.read(640, 360).grenade).toBe(true);
    inp.dispose();
  });
});
