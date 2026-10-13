import { describe, expect, it } from 'vitest';
import { createWorld, mitigate, player, stepWorld, IDLE_INPUT, type ActorInput } from '../src/sim/world';
import { WEAPONS, damageAt } from '../src/config/weapons';
import { parseLevel, shotClear } from '../src/sim/level';
import { TUNING } from '../src/config/tuning';

const input = (o: Partial<ActorInput>): ActorInput => ({ ...IDLE_INPUT, ...o });
// Long open room with a crate column at x = 8 and a wall stub near the bottom.
const RANGE = [
  '######################',
  '#....................#',
  '#.......c............#',
  '#.......c............#',
  '#.......c............#',
  '#....................#',
  '######################',
];
const bot = (hero = 'kettle') => [{ name: 'T', hero, patrol: [[15, 3]] as [number, number][], flanker: false }];

function shootAt(hero: string, px: number, tx: number, ticks = 1) {
  const w = createWorld({ map: RANGE, hero, bots: bot() });
  const p = player(w), t = w.actors[1];
  p.x = px; p.y = 3.5;
  t.hp = t.maxHp = 1e6;
  t.armor = 0;
  for (let i = 0; i < ticks; i++) {
    stepWorld(w, input({ aim: 0, firing: i === 0 }));
    t.x = tx; t.y = 3.5; t.vx = t.vy = 0;
  }
  return { w, p, t };
}

describe('armour and damage math', () => {
  it('armour soaks 60% of a hit until it runs out; armour-pen lowers the soak', () => {
    expect(mitigate(100, 20, 0)).toEqual({ hp: 8, armor: 12 });
    expect(mitigate(5, 20, 0)).toEqual({ hp: 15, armor: 5 });
    expect(mitigate(100, 20, 0.5)).toEqual({ hp: 14, armor: 6 });
    expect(mitigate(0, 20, 0)).toEqual({ hp: 20, armor: 0 });
  });
  it('falloff: full damage up close, linear drop, floor at long range', () => {
    const r = WEAPONS.rifle;
    expect(damageAt(r, 2)).toBe(r.damage);
    expect(damageAt(r, (r.falloffStart + r.falloffEnd) / 2)).toBeCloseTo(r.damage * (1 + r.minDamageMul) / 2, 5);
    expect(damageAt(r, 100)).toBeCloseTo(r.damage * r.minDamageMul, 5);
  });
});

describe('weapons behave differently', () => {
  it('shotgun fires its pellet count in one trigger pull; rifle fires one', () => {
    const w = createWorld({ map: RANGE, hero: 'brick', bots: [] });
    stepWorld(w, input({ aim: 0, firing: true }));
    expect(w.bullets.length).toBe(WEAPONS.shotgun.pellets);
    const w2 = createWorld({ map: RANGE, hero: 'kettle', bots: [] });
    stepWorld(w2, input({ aim: 0, firing: true }));
    expect(w2.bullets.length).toBe(1);
  });
  it('shotgun is lethal close and weak far (falloff)', () => {
    const near = shootAt('brick', 10.5, 12.5, 30);
    const far = shootAt('brick', 10.5, 18.5, 40);
    const dNear = 1e6 - near.t.hp, dFar = 1e6 - far.t.hp;
    expect(dNear).toBeGreaterThan(60);
    expect(dFar).toBeLessThan(dNear * 0.5);
  });
  // RC-8 (owner 2026-10-13, "solid boxes block sniper shots"): this asserted the old penetration rule (the marksman
  // went through). The rule was reversed on purpose; the check is as strict, with the opposite outcome.
  it('a crate stops the marksman and the rifle alike (no weapon pierces cover, RC-8)', () => {
    const m = shootAt('wick', 3.5, 15.5, 40);
    expect(m.t.hp).toBe(1e6);
    const r = shootAt('kettle', 3.5, 15.5, 40);
    expect(r.t.hp).toBe(1e6);
  });
  it('fire rate: the SMG fires several shots in the time the marksman fires one', () => {
    const count = (hero: string) => {
      const w = createWorld({ map: RANGE, hero, bots: [] });
      for (let i = 0; i < 60; i++) stepWorld(w, input({ aim: 0, firing: true }));
      return player(w).shots;
    };
    expect(count('mop')).toBeGreaterThan(count('wick') * 5);
  });
  it('magazine empties, reload draws from reserve, no reserve means no reload', () => {
    const w = createWorld({ map: RANGE, hero: 'brick', bots: [] });
    const p = player(w);
    const mag = p.weapon.magazine;
    for (let i = 0; i < 600 && p.ammo > 0; i++) stepWorld(w, input({ aim: Math.PI, firing: true }));
    expect(p.ammo).toBe(0);
    expect(p.reloadLeft).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) stepWorld(w, IDLE_INPUT);
    expect(p.ammo).toBe(mag);
    expect(p.reserve).toBe(p.weapon.reserve - mag);
    p.ammo = 0; p.reserve = 0; p.reloadLeft = 0;
    stepWorld(w, input({ reload: true }));
    expect(p.reloadLeft).toBe(0);
  });
});

describe('half-cover rule', () => {
  const l = parseLevel(RANGE);
  it('a crate stops a shot from far away', () => {
    expect(shotClear(l, 3.5, 3.5, 12.5, 3.5, false, TUNING.combat.coverLean)).toBe(false);
  });
  it('a shooter leaning on the crate (within 1.25 u) shoots over it', () => {
    expect(shotClear(l, 7.4, 3.5, 12.5, 3.5, false, TUNING.combat.coverLean)).toBe(true);
  });
  it('a target hugging the crate is still protected from a far shooter', () => {
    expect(shotClear(l, 14.5, 3.5, 7.4, 3.5, false, TUNING.combat.coverLean)).toBe(false);
  });
  it('in the sim: rifle bullets from a leaning shooter hit past the crate', () => {
    const r = shootAt('kettle', 7.45, 12.5, 30);
    expect(r.t.hp).toBeLessThan(1e6);
  });
});

describe('death and victory', () => {
  it('killing the last bot is a win; armour absorbed part of the damage', () => {
    const w = createWorld({ map: RANGE, hero: 'kettle', bots: bot('brick') });
    const p = player(w), t = w.actors[1];
    p.x = 10.5; p.y = 5.5;
    for (let i = 0; i < 900 && t.alive; i++) {
      stepWorld(w, input({ aim: 0, firing: true }));
      t.x = 14.5; t.y = 5.5; t.vx = t.vy = 0;
      t.abilityCd = 99; // no slab: this test is about damage
    }
    expect(t.alive).toBe(false);
    expect(t.armor).toBeLessThan(t.hero.maxArmor);
    expect(w.outcome).toBe('won');
    expect(p.damageDealt).toBeGreaterThan(t.maxHp);
  });
});
