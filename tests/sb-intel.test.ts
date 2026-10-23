// SB contact intel (src/sim/intel.ts): the laws of the information model, on small maps with the real sim.
// LAW 1 seeing confirms, information predicts. LAW 3 information decays. LAW 5 teammates report, they do not wallhack.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { createWorld, stepWorld, IDLE_INPUT, type World } from '../src/sim/world';
import { createIntel, hearReport, noise3, report, senseFor, type Intel } from '../src/sim/intel';

const OPEN = ['########################', ...Array.from({ length: 10 }, () => '#......................#'), '########################'];
// A wall down the middle (x = 12) with no gap: anything on the other side is heard through it.
const SPLIT = ['########################', ...Array.from({ length: 10 }, () => '#...........#..........#'), '########################'];
const STEP = TUNING.simStepSeconds;
const I = TUNING.intel;

function setup(map: readonly string[], allies = false): { w: World; intel: Intel } {
  const w = createWorld({ map, seed: 5, bots: [{ name: 'H', hero: 'benja', patrol: [[18, 5]], flanker: false }], allies: allies ? [{ name: 'Mate', hero: 'toad' }] : undefined });
  const p = w.actors[0];
  p.x = 4.5; p.y = 5.5; p.facing = 0; p.hp = p.maxHp = 1e9;
  return { w, intel: createIntel() };
}
const hostile = (w: World) => w.actors.find((a) => a.team === 'bot')!;
/** Step the world with the player standing still facing `aim`, the hostile frozen in place (no brain). */
function hold(w: World, intel: Intel, n: number, aim: number, bot = IDLE_INPUT) {
  for (let i = 0; i < n; i++) { stepWorld(w, { ...IDLE_INPUT, aim }, STEP, () => ({ ...bot })); senseFor(w, w.actors[0], intel, STEP); }
}

describe('seeing confirms, then the belief decays', () => {
  it('a hostile in your light is VISIBLE and exact; out of sight it is LAST KNOWN where it was, growing less sure', () => {
    const { w, intel } = setup(OPEN);
    const h = hostile(w); h.x = 9.5; h.y = 5.5;
    hold(w, intel, 5, 0);
    expect(intel.contacts.get(h.id)).toMatchObject({ state: 'visible', r: 0, conf: 1 });
    // Turn away (the 180 takes ~0.25 s at the human turn cap): it is no longer seen. The mark stays where it WAS.
    hold(w, intel, 30, Math.PI);
    expect(intel.contacts.get(h.id)!.state).toBe('last_known');
    h.x = 9.5; h.y = 9.5;
    hold(w, intel, 30, Math.PI);
    const c = intel.contacts.get(h.id)!;
    expect(c.state).toBe('last_known');
    expect(Math.hypot(c.x - 9.5, c.y - 5.5)).toBeLessThan(0.1);
    // One second later the circle is ~2 u: "about here", and its confidence has dropped by a sixth.
    expect(c.r).toBeGreaterThan(1.8);
    expect(c.r).toBeLessThan(2.6);
    expect(c.conf).toBeCloseTo(1 - 1 / I.lastKnownSeconds, 1);
  });
  it('confidence runs out: SUSPECTED, then LOST, then gone (about lastKnownSeconds + lostSeconds)', () => {
    const { w, intel } = setup(OPEN);
    const h = hostile(w); h.x = 9.5; h.y = 5.5;
    hold(w, intel, 3, 0);
    h.x = 20.5; h.y = 9.5; // gone out of the light
    const states: string[] = [];
    for (let i = 0; i < (I.lastKnownSeconds + 1) * 60; i++) { hold(w, intel, 1, Math.PI); const s = intel.contacts.get(h.id)?.state ?? 'gone'; if (states[states.length - 1] !== s) states.push(s); }
    expect(states).toEqual(['last_known', 'suspected', 'lost', 'gone']);
  });
});

describe('hearing predicts, with an honest error', () => {
  it('a clear-line sound is HEARD near its source, within the drawn circle; a creep step is vaguer than a shot', () => {
    const { w } = setup(OPEN);
    const me = { x: 4.5, y: 5.5 };
    const shot = hearReport(w, me, { type: 'shot', x: 14.5, y: 5.5, radius: 22, sourceId: 1, team: 'bot', tick: 7 })!;
    const creep = hearReport(w, me, { type: 'quietStep', x: 14.5, y: 5.5, radius: 3, sourceId: 1, team: 'bot', tick: 7 })!;
    expect(shot.state).toBe('heard');
    expect(Math.hypot(shot.x - 14.5, shot.y - 5.5)).toBeLessThanOrEqual(shot.r);
    expect(creep.r).toBeGreaterThan(shot.r);
    expect(creep.conf).toBeLessThan(shot.conf);
  });
  it('through a wall it is only a DIRECTION and a distance band: never a spot', () => {
    const { w } = setup(SPLIT);
    const me = { x: 4.5, y: 5.5 };
    for (let tick = 0; tick < 50; tick++) {
      const r = hearReport(w, me, { type: 'step', x: 16.5, y: 5.5, radius: 8, sourceId: 1, team: 'bot', tick })!;
      expect(r.state).toBe('directional');
      expect(Math.abs(r.bearing!)).toBeLessThanOrEqual(I.dirErrDeg * Math.PI / 180 + 1e-9);
      expect(r.r).toBeGreaterThanOrEqual(1.5);
    }
  });
  it('an impact or a blast tells where the bullet landed, not who fired it: it never places the shooter', () => {
    const { w } = setup(OPEN);
    expect(hearReport(w, { x: 4.5, y: 5.5 }, { type: 'impact', x: 6, y: 5.5, radius: 10, sourceId: 1, team: 'bot', tick: 1 })).toBeNull();
    expect(hearReport(w, { x: 4.5, y: 5.5 }, { type: 'boom', x: 6, y: 5.5, radius: 18, sourceId: 1, team: 'bot', tick: 1 })).toBeNull();
  });
  it('a walking hostile heard through a wall gives the player a contact, and its guess keeps the true side', () => {
    const { w, intel } = setup(SPLIT);
    const h = hostile(w); h.x = 14.5; h.y = 5.5;
    w.actors[0].x = 9.5; // 5 u away, through the wall: inside 8 u x wallFactor 0.8
    for (let i = 0; i < 120; i++) { stepWorld(w, { ...IDLE_INPUT, aim: Math.PI }, STEP, () => ({ ...IDLE_INPUT, moveY: i % 80 < 40 ? 1 : -1, aim: 0 })); senseFor(w, w.actors[0], intel, STEP); }
    const c = intel.contacts.get(h.id)!;
    expect(['directional', 'suspected']).toContain(c.state);
    expect(c.x).toBeGreaterThan(12);
  });
});

describe('weaker news never overwrites better news', () => {
  it('a fresh precise LAST KNOWN is not replaced by a vague direction from the same hostile', () => {
    const intel = createIntel();
    report(intel, 3, { state: 'last_known', source: 'sight', kind: 'other', x: 10, y: 5, r: 0.3, conf: 1 });
    const took = report(intel, 3, { state: 'directional', source: 'sound', kind: 'step', x: 14, y: 8, r: 3, conf: 0.5 });
    expect(took).toBe(false);
    expect(intel.contacts.get(3)).toMatchObject({ state: 'last_known', x: 10, y: 5 });
  });
  it('but a sharper report wins even from a lower rung (a shot heard right where an old sighting has gone vague)', () => {
    const intel = createIntel();
    report(intel, 3, { state: 'last_known', source: 'sight', kind: 'other', x: 10, y: 5, r: 6, conf: 0.4 });
    expect(report(intel, 3, { state: 'heard', source: 'sound', kind: 'shot', x: 13, y: 5, r: 0.6, conf: 0.9 })).toBe(true);
    expect(intel.contacts.get(3)).toMatchObject({ state: 'heard', x: 13 });
  });
});

describe('teammates report, they do not hand over a live body', () => {
  it('what only a teammate sees is PARTIAL: placed within spottedRadius, re-placed at most every spottedRefresh s', () => {
    const { w, intel } = setup(OPEN, true);
    const mate = w.actors[1], h = hostile(w);
    mate.x = 14.5; mate.y = 5.5; mate.facing = 0; h.x = 18.5; h.y = 5.5;
    // The player faces away; the teammate (frozen) looks at the hostile.
    const frozen = () => ({ ...IDLE_INPUT, aim: 0 });
    stepWorld(w, { ...IDLE_INPUT, aim: Math.PI }, STEP, frozen); senseFor(w, w.actors[0], intel, STEP);
    const c = intel.contacts.get(h.id)!;
    expect(c).toMatchObject({ state: 'partial', source: 'teammate', r: I.spottedRadius });
    const x0 = c.x;
    // It walks; the report lags until the next refresh.
    h.y = 6.5;
    stepWorld(w, { ...IDLE_INPUT, aim: Math.PI }, STEP, frozen); senseFor(w, w.actors[0], intel, STEP);
    expect(intel.contacts.get(h.id)!.y).toBe(5.5);
    for (let i = 0; i < TUNING.sound.spottedRefresh * 60 + 2; i++) { stepWorld(w, { ...IDLE_INPUT, aim: Math.PI }, STEP, frozen); senseFor(w, w.actors[0], intel, STEP); }
    expect(intel.contacts.get(h.id)!.y).toBeCloseTo(h.y, 0);
    expect(intel.contacts.get(h.id)!.x).toBeCloseTo(x0, 0);
  });
});

describe('the one reveal rule and no omniscience', () => {
  it('a muzzle flash with a clear line makes the shooter VISIBLE (source flash) outside your cone, for flashSeconds', () => {
    const { w, intel } = setup(OPEN);
    const h = hostile(w); h.x = 20.5; h.y = 5.5;
    // The hostile fires once while the player faces away.
    stepWorld(w, { ...IDLE_INPUT, aim: Math.PI }, STEP, () => ({ ...IDLE_INPUT, firing: true, aim: Math.PI }));
    senseFor(w, w.actors[0], intel, STEP);
    expect(intel.contacts.get(h.id)).toMatchObject({ state: 'visible', source: 'flash' });
    hold(w, intel, Math.ceil(TUNING.perception.flashSeconds * 60) + 2, Math.PI);
    expect(intel.contacts.get(h.id)!.state).toBe('last_known');
  });
  it('a silent hostile out of every light and earshot has no contact at all', () => {
    const { w, intel } = setup(SPLIT);
    const h = hostile(w); h.x = 20.5; h.y = 9.5;
    hold(w, intel, 240, Math.PI);
    expect(intel.contacts.has(h.id)).toBe(false);
  });
  it('a dead hostile leaves no belief behind', () => {
    const { w, intel } = setup(OPEN);
    const h = hostile(w); h.x = 9.5; h.y = 5.5;
    hold(w, intel, 3, 0);
    h.alive = false;
    hold(w, intel, 1, 0);
    expect(intel.contacts.has(h.id)).toBe(false);
  });
  it('deterministic: the same scenario gives the same beliefs, and the guess noise stays in [-1, 1]', () => {
    const run = () => { const { w, intel } = setup(SPLIT); const h = hostile(w); h.x = 15.5; h.y = 5.5;
      for (let i = 0; i < 90; i++) { stepWorld(w, { ...IDLE_INPUT, aim: Math.PI }, STEP, () => ({ ...IDLE_INPUT, moveY: 1, aim: 0 })); senseFor(w, w.actors[0], intel, STEP); }
      return JSON.stringify([...intel.contacts.values()]); };
    expect(run()).toBe(run());
    for (let i = 0; i < 500; i++) { const n = noise3(i, i * 7, 3); expect(n).toBeGreaterThanOrEqual(-1); expect(n).toBeLessThanOrEqual(1); }
  });
});
