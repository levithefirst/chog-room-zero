// RC-8 cover, sniper shots and line of sight: the seven deterministic scenarios the owner asked for (2026-10-13).
// One geometry for everyone: bullets (player and bot), bot fire decisions (shotClear) and movement all read the same
// level boxes. Sight ignores waist-high cover by design (cover.ts); only walls block it.
import { beforeAll, describe, expect, it } from 'vitest';
import { createWorld, player, stepWorld, IDLE_INPUT, type Actor, type ActorInput, type World } from '../src/sim/world';
import { parseLevel, bulletBlockT, shotClear, sightClear } from '../src/sim/level';
import { coverStops, COVER_RULES } from '../src/sim/cover';
import { canSee } from '../src/sim/vision';
import { WEAPONS } from '../src/config/weapons';
import { TUNING } from '../src/config/tuning';
import { coverDrawBox } from '../src/render/footprint';
import type { Brain } from '../src/sim/bots';

const LEAN = TUNING.combat.coverLean;
const R = TUNING.movement.radius;
const input = (o: Partial<ActorInput>): ActorInput => ({ ...IDLE_INPUT, ...o });

// A long room. Crate column at x 8 (rows 2..4 -> y 2..5).
const RANGE = [
  '######################',
  '#....................#',
  '#.......c............#',
  '#.......c............#',
  '#.......c............#',
  '#....................#',
  '######################',
];

/** Player (hero) at (px,py) shoots once along `aim`; a frozen target at (tx,ty). Returns damage dealt and impacts. */
function duel(hero: string, px: number, py: number, tx: number, ty: number, aim: number, map = RANGE, ticks = 60) {
  const w = createWorld({ map, hero, bots: [{ name: 'T', hero: 'kettle', patrol: [[Math.floor(tx), Math.floor(ty)]], flanker: false }] });
  const p = player(w), t = w.actors[1];
  p.weapon = { ...p.weapon, spreadDeg: 0 };
  p.x = px; p.y = py;
  t.hp = t.maxHp = 1e6; t.armor = 0;
  const impacts: { x: number; y: number; blocked: boolean }[] = [];
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input({ aim, firing: i === 0 }), undefined, () => IDLE_INPUT);
    t.x = tx; t.y = ty; t.vx = t.vy = 0;
    p.x = px; p.y = py; p.vx = p.vy = 0;
    for (const s of w.sounds) if (s.type === 'impact') impacts.push({ x: s.x, y: s.y, blocked: !!s.blocked });
  }
  return { dealt: 1e6 - t.hp, impacts, w };
}

describe('RC-8 scenario 1: clear shot, no obstacle', () => {
  it('the marksman and the rifle both hit a target in the open', () => {
    for (const hero of ['wick', 'kettle']) {
      const r = duel(hero, 2.5, 1.5, 12.5, 1.5, 0);
      expect(r.dealt, hero).toBeGreaterThan(0);
      expect(r.impacts.length).toBe(0);
    }
  });
});

describe('RC-8 scenario 2: target fully behind a solid box', () => {
  it('the marksman (sniper) is stopped by the crate, with a blocked impact on the crate face', () => {
    const r = duel('wick', 2.5, 3.5, 10.5, 3.5, 0);
    expect(r.dealt).toBe(0);
    expect(r.impacts).toHaveLength(1);
    expect(r.impacts[0].blocked).toBe(true);
    expect(r.impacts[0].x).toBeCloseTo(8, 1);
  });
  it('every weapon is stopped the same way (no weapon pierces cover)', () => {
    for (const hero of ['kettle', 'mop', 'brick', 'wick']) {
      expect(duel(hero, 2.5, 3.5, 10.5, 3.5, 0).dealt, hero).toBe(0);
      expect(WEAPONS[duel(hero, 2.5, 3.5, 10.5, 3.5, 0).w.actors[0].weapon.id].piercesCover).toBe(false);
    }
  });
  it('a bot sniper is stopped by the same crate (same rule for bots)', () => {
    const w = createWorld({ map: RANGE, hero: 'kettle', bots: [{ name: 'S', hero: 'wick', patrol: [[2, 3]], flanker: false }] });
    const p = player(w), b = w.actors[1];
    p.x = 10.5; p.y = 3.5; p.hp = p.maxHp = 1e6; p.armor = 0;
    b.x = 3.5; b.y = 3.5; b.weapon = { ...b.weapon, spreadDeg: 0 };
    let fired = 0;
    for (let i = 0; i < 120; i++) {
      stepWorld(w, IDLE_INPUT, undefined, () => input({ aim: 0, firing: true }));
      b.x = 3.5; b.y = 3.5; b.vx = b.vy = 0; p.x = 10.5; p.y = 3.5; p.vx = p.vy = 0;
      fired = b.shots;
    }
    expect(fired).toBeGreaterThan(0);
    expect(p.hp).toBe(1e6);
  });
  it('the only way over a box is the lean rule: a shooter pressed against it (within 1.25 u) fires over it', () => {
    expect(duel('wick', 7.5 - 0.1, 3.5, 10.5, 3.5, 0).dealt).toBeGreaterThan(0); // 0.6 u from the crate
    expect(duel('wick', 8 - LEAN - 0.2, 3.5, 10.5, 3.5, 0).dealt).toBe(0); // 1.45 u: too far to lean
    expect(COVER_RULES.crate.lean).toBe(LEAN);
    expect(coverStops('crate', true, LEAN + 0.01)).toBe(true);
  });
});

describe('RC-8 scenario 3: target partly exposed around a corner', () => {
  // Target at y 1.85: its body spans y 1.5..2.2, the crate starts at y 2, so the top 0.5 u is exposed.
  it('a shot at the exposed part hits; a shot at the covered part hits the crate', () => {
    expect(duel('wick', 2.5, 1.75, 10.5, 1.85, 0).dealt).toBeGreaterThan(0);
    const covered = duel('wick', 2.5, 2.15, 10.5, 1.85, 0);
    expect(covered.dealt).toBe(0);
    expect(covered.impacts[0]?.blocked).toBe(true);
  });
  it('around a wall corner: exposed shoulder is hittable, the rest is not', () => {
    const MAP = [
      '##############',
      '#............#',
      '#............#',
      '#.......######',
      '#.......#....#',
      '##############',
    ];
    // Wall from y 3. Target at (10.5, 2.75): body y 2.4..3.1 sticks 0.6 u above the wall.
    expect(duel('kettle', 2.5, 2.6, 10.5, 2.75, 0, MAP).dealt).toBeGreaterThan(0);
    // From lower down the line to the target crosses the wall at x 8 (y 3.3): stopped.
    expect(duel('kettle', 2.5, 4.5, 10.5, 2.75, Math.atan2(2.75 - 4.5, 8), MAP).dealt).toBe(0);
  });
});

describe('RC-8 scenario 4: several obstacles between shooter and target', () => {
  const MAP = [
    '######################',
    '#....................#',
    '#.....c....#....b....#',
    '#....................#',
    '######################',
  ];
  it('the first obstacle stops the bullet (crate), and removing it leaves the wall and barrier in the way', () => {
    const r = duel('wick', 2.5, 2.5, 19.5, 2.5, 0, MAP);
    expect(r.dealt).toBe(0);
    expect(r.impacts[0].x).toBeCloseTo(6, 1);
    const noCrate = MAP.map((row) => row.replace('c', '.'));
    const r2 = duel('wick', 2.5, 2.5, 19.5, 2.5, 0, noCrate);
    expect(r2.dealt).toBe(0);
    expect(r2.impacts[0].x).toBeCloseTo(11, 1);
    expect(r2.impacts[0].blocked).toBe(false); // a wall, not cover
    const onlyBarrier = noCrate.map((row) => row.replace('#....b', '.....b'));
    const r3 = duel('wick', 2.5, 2.5, 19.5, 2.5, 0, onlyBarrier);
    expect(r3.dealt).toBe(0);
    expect(r3.impacts[0].x).toBeCloseTo(16, 1);
    expect(r3.impacts[0].blocked).toBe(true);
  });
  it('shotClear (what bots and the autopilot check) agrees with the bullets', () => {
    const l = parseLevel(MAP);
    expect(shotClear(l, 2.5, 2.5, 19.5, 2.5, true, LEAN)).toBe(false);
    expect(shotClear(l, 2.5, 1.5, 19.5, 1.5, true, LEAN)).toBe(true);
  });
});

describe('RC-8 scenario 5: bot visibility and shooting', () => {
  const MAP = [
    '##############',
    '#............#',
    '#............#',
    '#.....c......#',
    '#............#',
    '#............#',
    '##############',
  ];
  function setup(px: number, py: number) {
    const w = createWorld({ map: MAP, hero: 'kettle', seed: 3, bots: [{ name: 'S', hero: 'wick', patrol: [[2, 3]], flanker: false }] });
    const p = player(w), b = w.actors[1];
    p.x = px; p.y = py; p.hp = p.maxHp = 1e6; p.armor = 0;
    b.facing = 0;
    return { w, p, b, br: w.brains.get(b.id) as Brain };
  }
  function run(w: World, p: Actor, b: Actor, ticks: number) {
    const px = p.x, py = p.y;
    for (let i = 0; i < ticks; i++) {
      stepWorld(w, IDLE_INPUT);
      p.x = px; p.y = py; p.vx = p.vy = 0;
      b.x = 2.5; b.y = 3.5; b.vx = b.vy = 0; // hold its angle (no reposition) so the test isolates the fire decision
    }
  }
  it('a bot sees a player behind waist-high cover but does not fire into the crate', () => {
    const { w, p, b, br } = setup(9.5, 3.5);
    run(w, p, b, 240);
    expect(br.sawPlayer).toBe(true);
    expect(br.state).toBe('engage');
    expect(b.shots).toBe(0);
    expect(p.hp).toBe(1e6);
  });
  it('the same bot fires and hits once the player steps out', () => {
    const { w, p, b } = setup(9.5, 1.6);
    run(w, p, b, 240);
    expect(b.shots).toBeGreaterThan(0);
    expect(p.hp).toBeLessThan(1e6);
  });
  it('a full wall hides the player from the bot (no sight, no shot)', () => {
    const WALLED = MAP.map((row, y) => (y >= 1 && y <= 5 ? row.slice(0, 6) + '#' + row.slice(7) : row));
    const l = parseLevel(WALLED);
    expect(sightClear(l, 2.5, 3.5, 9.5, 3.5)).toBe(false);
    expect(canSee(l, 2.5, 3.5, 0, { range: 12, coneRad: Math.PI / 2, nearRadius: 1.6 }, 9.5, 3.5)).toBe(false);
  });
});

describe('RC-8 scenario 6: movement collision and projectile collision use the same boxes', () => {
  const MAP = [
    '######################',
    '#....................#',
    '#....#.....c.....b...#',
    '#....................#',
    '######################',
  ];
  it('solid (movement) boxes are exactly the wall boxes plus the cover boxes (bullets)', () => {
    const l = parseLevel(MAP);
    expect(l.solidBoxes).toEqual([...l.wallBoxes, ...l.coverBoxes]);
  });
  it('for a wall, a crate and a barrier: a body stops at its face and a bullet stops at the same face', () => {
    for (const x of [5, 11, 17]) {
      const w = createWorld({ map: MAP, hero: 'kettle', bots: [] });
      const p = player(w);
      p.x = x - 2.5; p.y = 2.5;
      for (let i = 0; i < 90; i++) stepWorld(w, input({ moveX: 1, aim: 0 }));
      expect(p.x, `body vs box at ${x}`).toBeCloseTo(x - R, 2);
      const t = bulletBlockT(w.level, x - 3, 2.5, x - 3, 2.5, x + 0.5, 2.5, false, LEAN);
      expect((x - 3) + t * 3.5, `bullet vs box at ${x}`).toBeCloseTo(x, 5);
    }
  });
  it("Brick's slab blocks movement and bullets while it stands, and neither after it expires", () => {
    const w = createWorld({ map: ['##########', '#........#', '#........#', '#........#', '##########'], hero: 'brick', bots: [] });
    const p = player(w);
    p.x = 2.5; p.y = 2.5;
    stepWorld(w, input({ aim: 0, ability: true }));
    expect(w.barriers).toHaveLength(1);
    const box = w.barriers[0].box;
    expect(w.level.solidBoxes).toContain(box);
    expect(w.level.coverBoxes).toContain(box);
    expect(shotClear(w.level, 1.2, 2.5, 8.5, 2.5, true, 0)).toBe(false);
    for (let i = 0; i < TUNING.abilities.barrierSeconds * 60 + 5; i++) stepWorld(w, IDLE_INPUT);
    expect(w.level.solidBoxes).not.toContain(box);
    expect(shotClear(w.level, 1.2, 2.5, 8.5, 2.5, true, 0)).toBe(true);
  });
  it('drawn cover covers its collision tile (what you see is what stops you and your bullets)', () => {
    for (const kind of ['crate', 'barrier'] as const) {
      const d = coverDrawBox(kind, 4, 2);
      expect(d.x0 - 4).toBeLessThanOrEqual(0.03);
      expect(5 - d.x1).toBeLessThanOrEqual(0.03);
      expect(d.y0 - 2).toBeLessThanOrEqual(0.03);
      expect(3 - d.y1).toBeLessThanOrEqual(0.03);
    }
  });
});

describe('RC-8 scenario 7: touch and desktop aiming reach the same shot', () => {
  class Doc extends EventTarget { visibilityState = 'visible'; body = { classList: { toggle() {} }, style: { setProperty() {} } }; }
  beforeAll(() => {
    const win = new EventTarget() as unknown as Record<string, unknown>;
    Object.assign(win, { innerWidth: 1280, innerHeight: 720 });
    Object.assign(globalThis, { window: win, document: new Doc(), matchMedia: () => ({ matches: false }) });
  });
  const ev = (type: string, o: Record<string, unknown>) => Object.assign(new Event(type), { preventDefault() {}, button: 0, clientX: 0, clientY: 0, pointerId: 1 }, o);

  it('a mouse aimed 30 deg below the right and a right-thumb push 30 deg below the right give the same aim and bullets', async () => {
    const { layoutStage } = await import('../src/ui/stage');
    const { createInput, touchStick } = await import('../src/input/input');
    layoutStage({ style: { cssText: '' } } as unknown as HTMLElement);
    const W = (globalThis as unknown as { window: EventTarget }).window;
    const ang = 30 * Math.PI / 180;
    // Desktop: player drawn at (640, 360); mouse 200 px along the angle, left button down.
    const elA = new EventTarget() as unknown as HTMLElement;
    const pc = createInput(elA);
    const mx = 640 + Math.cos(ang) * 200, my = 360 + Math.sin(ang) * 200;
    W.dispatchEvent(ev('pointermove', { pointerType: 'mouse', clientX: mx, clientY: my }));
    elA.dispatchEvent(ev('pointerdown', { pointerType: 'mouse', clientX: mx, clientY: my }));
    const a = pc.read(640, 360);
    pc.dispose();
    // Touch: right half of the screen, full push along the same angle.
    const elB = new EventTarget() as unknown as HTMLElement;
    const tc = createInput(elB);
    elB.dispatchEvent(ev('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 1000, clientY: 400 }));
    W.dispatchEvent(ev('pointermove', { pointerType: 'touch', pointerId: 7, clientX: 1000 + Math.cos(ang) * touchStick.radius, clientY: 400 + Math.sin(ang) * touchStick.radius }));
    const b = tc.read(640, 360);
    tc.dispose();
    expect(a.firing).toBe(true);
    expect(b.firing).toBe(true);
    expect(a.aim).toBeCloseTo(ang, 9);
    expect(b.aim).toBeCloseTo(ang, 9);
    // Same sim, same input -> same bullet and the same cover outcome.
    const MAP = ['##############', '#............#', '#............#', '#.......c....#', '#............#', '#............#', '##############'];
    const shoot = (inp: ActorInput) => {
      const w = createWorld({ map: MAP, hero: 'wick', seed: 9, bots: [] });
      const p = player(w);
      p.x = 3.5; p.y = 1.5;
      stepWorld(w, { ...inp, moveX: 0, moveY: 0 });
      return { dx: w.bullets[0].dx, dy: w.bullets[0].dy };
    };
    const sa = shoot(a), sb = shoot(b);
    // Same direction to float precision (atan2 of a mouse offset vs a stick push differ by ~1e-16).
    expect(sa.dx).toBeCloseTo(sb.dx, 12);
    expect(sa.dy).toBeCloseTo(sb.dy, 12);
  });
});
