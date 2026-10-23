// FS final superiority pass (owner 2026-10-17 "if you find a bug, fix it"): regression tests for the sim audit.
// Each test failed before its fix (slab traps, one-trigger eliminations, lost kill credit, dash while downed, ammo over
// the cap, per-pellet knockback through a shield, revive reset by the wrong helper, grenades inside crates, overkill
// shards, lowest-id pickup wins, foreign-map pickup crash, Rush bonus read on landing).
import { describe, expect, it } from 'vitest';
import { ammoCeiling, createWorld, stepWorld, IDLE_INPUT, type Actor, type ActorInput, type World } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';
import { HALL } from './helpers/duel';
import { planZone } from '../src/sim/zone';

type Side = 'alpha' | 'bravo';
const vs = (spec: [Side, string, number, number][], map: readonly string[] = HALL): World => createWorld({
  seed: 3, map, zone: false,
  versus: spec.map(([t, hero, x, y], i) => ({ name: `P${i}`, hero, team: t, x, y, facing: t === 'alpha' ? 0 : Math.PI })),
});
const idle = (a: Actor): ActorInput => ({ ...IDLE_INPUT, aim: a.facing });
const run = (w: World, steps: number, f: (a: Actor) => ActorInput = idle) => { for (let i = 0; i < steps; i++) stepWorld(w, f); };

describe('slab placement', () => {
  it('never across a living actor (nobody is pushed into a wall), and a refused slab costs no cooldown', () => {
    // Enemy hugging the north wall of the hall, Yot just south of it facing it: the slab would cover the enemy.
    const w = vs([['alpha', 'yot', 10.5, 2.5], ['bravo', 'benja', 10.5, 1.4]]);
    const [yot, foe] = w.actors;
    yot.facing = -Math.PI / 2;
    stepWorld(w, (a) => (a === yot ? { ...IDLE_INPUT, aim: -Math.PI / 2, ability: true } : idle(a)));
    expect(w.barriers.length).toBe(0);
    expect(yot.abilityCd).toBe(0);
    expect(foe.y).toBeGreaterThan(1.3); // still in the hall, not in the wall row
  });
  it('its ends stop at walls (it never pokes into the next room)', () => {
    // Yot 0.4 u from the west wall, facing north: a 3 u Bulwark-length slab would reach x < 1.
    const w = vs([['alpha', 'yot', 1.6, 5.5], ['bravo', 'benja', 25.5, 5.5]]);
    const yot = w.actors[0];
    yot.ability = { ...yot.ability, length: 3 };
    yot.facing = -Math.PI / 2;
    stepWorld(w, (a) => (a === yot ? { ...IDLE_INPUT, aim: -Math.PI / 2, ability: true } : idle(a)));
    expect(w.barriers.length).toBe(1);
    expect(w.barriers[0].box.x0).toBeGreaterThanOrEqual(1);
  });
  it('facing straight into a wall: no slab, no cooldown spent', () => {
    const w = vs([['alpha', 'yot', 1.5, 5.5], ['bravo', 'benja', 25.5, 5.5]]);
    const yot = w.actors[0];
    yot.facing = Math.PI;
    stepWorld(w, (a) => (a === yot ? { ...IDLE_INPUT, aim: Math.PI, ability: true } : idle(a)));
    expect(w.barriers.length).toBe(0);
    expect(yot.abilityCd).toBe(0);
  });
});

describe('downed state', () => {
  it('one shotgun blast downs a 3v-team target, it does not also empty the downed pool', () => {
    const w = vs([['alpha', 'tonashiro', 8.5, 4.5], ['bravo', 'benja', 10.5, 4.5], ['bravo', 'benja', 25.5, 2.5]]);
    const [sh, t] = w.actors;
    t.hp = 5; t.armor = 0;
    for (let i = 0; i < 30 && !t.downed && t.alive; i++) stepWorld(w, (a) => (a === sh ? { ...IDLE_INPUT, firing: true, aim: 0 } : idle(a)));
    expect(t.alive).toBe(true);
    expect(t.downed).toBe(true);
    expect(t.hp).toBeGreaterThan(TUNING.revive.downHp - 1); // a step of bleed, not 7 pellets
  });
  it('a downed actor stops dashing', () => {
    const w = vs([['alpha', 'benja', 6.5, 4.5], ['bravo', 'toad', 10.5, 4.5], ['bravo', 'benja', 25.5, 2.5]]);
    const [sh, t] = w.actors;
    t.hp = 1; t.armor = 0;
    t.dashLeft = 0.2; t.dashX = 1; t.dashY = 0;
    for (let i = 0; i < 60 && !t.downed; i++) stepWorld(w, (a) => (a === sh ? { ...IDLE_INPUT, firing: true, aim: Math.atan2(t.y - sh.y, t.x - sh.x) } : idle(a)));
    expect(t.downed).toBe(true);
    expect(t.dashLeft).toBe(0);
    const x0 = t.x;
    run(w, 24);
    expect(Math.abs(t.x - x0)).toBeLessThan(0.5);
  });
  it('the danger zone finishing a downed actor keeps the kill for whoever downed it', () => {
    const w = vs([['alpha', 'benja', 6.5, 4.5], ['bravo', 'benja', 9.5, 4.5], ['bravo', 'benja', 25.5, 2.5]]);
    const [sh, t] = w.actors;
    t.hp = 1; t.armor = 0;
    for (let i = 0; i < 60 && !t.downed; i++) stepWorld(w, (a) => (a === sh ? { ...IDLE_INPUT, firing: true, aim: 0 } : idle(a)));
    expect(t.downed).toBe(true);
    // A zone that has fully closed far away, burning hard.
    w.zone = planZone(w.level, 1, [{ x: 26.5, y: 4.5 }], { ...TUNING.zone, safeSeconds: 0, clearance: 0, stages: [{ warn: 0, shrink: 0.01, radius: 0.5, dps: 9999 }], finalDps: 9999 } as never);
    run(w, 2);
    expect(t.alive).toBe(false);
    expect(sh.kills).toBe(1);
    expect(t.death?.killerId).toBe(sh.id);
  });
  it('downed by your own grenade, finished by an enemy: the enemy gets the kill', () => {
    const w = vs([['alpha', 'benja', 6.5, 4.5], ['bravo', 'benja', 12.5, 4.5], ['bravo', 'benja', 25.5, 2.5]]);
    const [foe, t] = w.actors;
    t.hp = 1; t.armor = 0;
    w.grenades.push({ id: 99, x: t.x + 0.3, y: t.y, vx: 0, vy: 0, fuse: 0.01, owner: t.id, team: t.team, alive: true });
    run(w, 2);
    expect(t.downed).toBe(true);
    for (let i = 0; i < 200 && t.alive; i++) stepWorld(w, (a) => (a === foe ? { ...IDLE_INPUT, firing: true, reload: a.ammo === 0, aim: Math.atan2(t.y - foe.y, t.x - foe.x) } : idle(a)));
    expect(t.alive).toBe(false);
    expect(foe.kills).toBe(1);
  });
  it('a revive keeps going while any helper in range is clean (not only the first in actor order)', () => {
    // Two helpers by the downed actor; the lower-id one is hit every step.
    const w = vs([['alpha', 'benja', 10.5, 4.5], ['alpha', 'benja', 10.5, 3.5], ['alpha', 'benja', 10.5, 5.5], ['bravo', 'benja', 25.5, 4.5]]);
    const [down, h1] = w.actors;
    down.downed = true; down.hp = TUNING.revive.downHp; down.downInfo = { cause: 'shot', killerId: 3, weapon: 'x', fromX: 0, fromY: 0, toX: 0, toY: 0, tick: 0 };
    for (let i = 0; i < Math.ceil(TUNING.revive.seconds * 60) + 10 && down.downed; i++) { h1.lastHitTick = w.tick; stepWorld(w, idle); }
    expect(down.downed).toBe(false);
  });
});

describe('hits', () => {
  it('a shotgun blast pushes like one bullet, and a Shell stops push, hit count and revive reset', () => {
    const w = vs([['alpha', 'tonashiro', 8.5, 4.5], ['bravo', 'toad', 10, 4.5]]);
    const [sh, t] = w.actors;
    t.hp = t.maxHp = 1e6;
    stepWorld(w, (a) => (a === sh ? { ...IDLE_INPUT, firing: true, aim: 0 } : idle(a)));
    for (let i = 0; i < 6 && sh.hits === 0; i++) stepWorld(w, idle);
    expect(sh.hits).toBeGreaterThan(1);
    expect(Math.hypot(t.vx, t.vy)).toBeLessThanOrEqual(TUNING.combat.knockback + 1e-6);
    const w2 = vs([['alpha', 'tonashiro', 8.5, 4.5], ['bravo', 'toad', 10, 4.5]]);
    const [sh2, t2] = w2.actors;
    t2.shieldLeft = 5;
    stepWorld(w2, (a) => (a === sh2 ? { ...IDLE_INPUT, firing: true, aim: 0 } : idle(a)));
    for (let i = 0; i < 6; i++) stepWorld(w2, idle);
    expect(sh2.hits).toBe(0);
    expect(t2.lastHitTick).toBeLessThan(0);
    expect(Math.hypot(t2.vx, t2.vy)).toBe(0);
  });
  it('damage dealt (it pays shards) counts what the target lost, never overkill', () => {
    const w = vs([['alpha', 'ray', 6.5, 4.5], ['bravo', 'benja', 10.5, 4.5]]);
    const [sh, t] = w.actors;
    t.hp = 3; t.armor = 0;
    for (let i = 0; i < 60 && t.alive; i++) stepWorld(w, (a) => (a === sh ? { ...IDLE_INPUT, firing: true, aim: 0 } : idle(a)));
    expect(t.alive).toBe(false);
    expect(sh.damageDealt).toBe(3);
  });
  it('a Rush bonus belongs to the bullet: one fired during Rush keeps it after Rush ends', () => {
    const fire = (rushAtLanding: boolean, rushAtFire: boolean) => {
      const w = vs([['alpha', 'benja', 3.5, 4.5], ['bravo', 'toad', 11.5, 4.5]]);
      const [sh, t] = w.actors;
      t.hp = t.maxHp = 1e6; t.armor = 0;
      sh.ability = { kind: 'frenzy', name: 'Rush', cooldown: 18, seconds: 3, amount: 1.5, text: '' };
      sh.frenzyLeft = rushAtFire ? 5 : 0;
      stepWorld(w, (a) => (a === sh ? { ...IDLE_INPUT, firing: true, aim: 0 } : idle(a)));
      sh.frenzyLeft = rushAtLanding ? 5 : 0;
      for (let i = 0; i < 120 && t.damageTaken === 0; i++) stepWorld(w, idle);
      return t.damageTaken;
    };
    expect(fire(false, true)).toBeCloseTo(fire(true, true));
    expect(fire(true, false)).toBeCloseTo(fire(false, false));
    expect(fire(false, true)).toBeGreaterThan(fire(false, false) * 1.4);
  });
});

describe('pickups and grenades', () => {
  it('ammo never goes over its ceiling', () => {
    const w = vs([['alpha', 'benja', 5.5, 4.5], ['bravo', 'benja', 25.5, 4.5]]);
    const a = w.actors[0];
    a.reserve = ammoCeiling(a) - 1;
    w.pickups.push({ kind: 'ammo', x: a.x, y: a.y, active: true, respawnLeft: 0, zone: -1, moves: 0 });
    stepWorld(w, idle);
    expect(a.reserve).toBe(ammoCeiling(a));
  });
  it('a contested pickup goes to the nearest actor that wants it, whatever the ids', () => {
    const w = vs([['alpha', 'benja', 5.0, 4.5], ['bravo', 'benja', 5.6, 4.5]]);
    const [a, b] = w.actors;
    a.hp = b.hp = 40;
    w.pickups.push({ kind: 'health', x: 5.6, y: 4.5, active: true, respawnLeft: 0, zone: -1, moves: 0 });
    stepWorld(w, idle);
    expect(b.hp).toBeGreaterThan(40);
    expect(a.hp).toBe(40);
  });
  it('a grenade that stops on a crate rolls off it (the crate still shields the far side)', () => {
    const map = ['##########', '#........#', '#...cc...#', '#........#', '##########'];
    const w = createWorld({ seed: 1, map, zone: false, versus: [{ name: 'A', hero: 'benja', team: 'alpha', x: 1.5, y: 1.5, facing: 0 }, { name: 'B', hero: 'benja', team: 'bravo', x: 8.5, y: 3.5, facing: 0 }] });
    w.grenades.push({ id: 1, x: 4.9, y: 2.5, vx: 0, vy: 0, fuse: 5, owner: 0, team: 'alpha', alive: true });
    stepWorld(w, idle);
    const g = w.grenades[0];
    const inside = w.level.coverBoxes.some((b) => g.x > b.x0 && g.x < b.x1 && g.y > b.y0 && g.y < b.y1);
    expect(inside).toBe(false);
  });
  it('a foreign map with Room Zero pickup zones does not crash (unreachable sides, empty zones)', () => {
    expect(() => createWorld({ seed: 4, map: HALL, zone: false, pickupZones: [{ kind: 'health', name: 'nowhere', x0: 40, y0: 40, x1: 45, y1: 45 }] as never })).not.toThrow();
    expect(() => vs([['alpha', 'benja', 3.5, 4.5], ['bravo', 'benja', 25.5, 4.5]])).not.toThrow();
  });
});
