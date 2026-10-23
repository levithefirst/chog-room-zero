// AI with the free roster (owner 2026-10-14): the department sets how a bot fights, bots use grenades for a reason and
// step out of a live ring, and the default game's two AI teammates are roster characters from other departments.
import { describe, expect, it } from 'vitest';
import { createWorld, player, stepWorld, IDLE_INPUT, type Actor, type World } from '../src/sim/world';
import { HEROES, heroById, squadFor } from '../src/config/heroes';
import { createAutopilot } from '../src/debug/autopilot';

const OPEN = ['##########################', ...Array.from({ length: 7 }, () => '#........................#'), '##########################'];

/** One hostile bot of `hero` facing a still, unkillable player `d` u to its west; the bot holds no grenades. */
function standoff(hero: string, d: number): { w: World; p: Actor; b: Actor } {
  const bx = 18.5, by = 4.5;
  const w = createWorld({ seed: 3, map: OPEN, zone: false, bots: [{ name: 'B', hero, patrol: [[Math.floor(bx), Math.floor(by)]], flanker: heroById(hero).dept === 'flanker' }] });
  const p = player(w), b = w.actors[1];
  p.x = bx - d; p.y = by; b.x = bx; b.y = by; b.facing = Math.PI; b.grenades = 0;
  return { w, p, b };
}
function watch(w: World, p: Actor, b: Actor, seconds: number): { d: number[]; lateral: number } {
  const d: number[] = [];
  let lateral = 0;
  for (let i = 0; i < seconds * 60; i++) {
    p.hp = p.maxHp; p.armor = p.maxArmor;
    const y0 = b.y;
    stepWorld(w, { ...IDLE_INPUT, aim: 0 });
    lateral += Math.abs(b.y - y0);
    if (i % 15 === 0) d.push(Math.hypot(b.x - p.x, b.y - p.y));
  }
  return { d, lateral };
}

describe('department fight styles (a hostile bot trading shots with a still player)', () => {
  it('sniper (Ray) backs off from anyone inside 6 u', () => {
    const { w, p, b } = standoff('ray', 3.5);
    const r = watch(w, p, b, 3);
    expect(Math.max(...r.d) - r.d[0]).toBeGreaterThan(1.2);
  });
  it('bruiser (Tonashiro) closes to shotgun range', () => {
    const { w, p, b } = standoff('tonashiro', 6.5);
    const r = watch(w, p, b, 3);
    expect(Math.min(...r.d)).toBeLessThan(4);
  });
  it('assault (Benja) closes to mid range', () => {
    const { w, p, b } = standoff('benja', 8.5);
    const r = watch(w, p, b, 3);
    expect(Math.min(...r.d)).toBeLessThan(7);
  });
  it('tank (Toad) holds its ground', () => {
    const { w, p, b } = standoff('toad', 6.5);
    const x0 = b.x, y0 = b.y;
    watch(w, p, b, 3);
    expect(Math.hypot(b.x - x0, b.y - y0)).toBeLessThan(0.6);
  });
  it('flanker (Tabsu) side-steps across the line instead of standing still', () => {
    const { w, p, b } = standoff('tabsu', 6.5);
    const r = watch(w, p, b, 3);
    expect(r.lateral).toBeGreaterThan(1);
  });
  it('the styles differ: not every department moves the same way (measured over the same 3 s)', () => {
    const moved = HEROES.map((h) => { const { w, p, b } = standoff(h.id, 6); const x0 = b.x, y0 = b.y; watch(w, p, b, 3); return Math.round(Math.hypot(b.x - x0, b.y - y0) * 10); });
    expect(new Set(moved).size).toBeGreaterThanOrEqual(3);
  });
});

describe('grenades in AI hands', () => {
  it('a bot that sees a target hugging a crate it cannot shoot through throws a grenade at it', () => {
    const map = ['##################', '#................#', '#.........c......#', '#................#', '##################'];
    const w = createWorld({ seed: 2, map, zone: false, bots: [{ name: 'B', hero: 'benja', patrol: [[3, 2]], flanker: false }] });
    const p = player(w), b = w.actors[1];
    p.x = 11.5; p.y = 2.5; b.x = 3.5; b.y = 2.5; b.facing = 0;
    for (let i = 0; i < 60 * 4 && !b.thrown; i++) { p.hp = p.maxHp; stepWorld(w, { ...IDLE_INPUT, aim: Math.PI }); }
    expect(b.thrown).toBe(1);
    expect(b.grenades).toBe(0);
  });
  it('a bot that sees a live hostile grenade by its feet moves out of the ring', () => {
    const { w, p, b } = standoff('toad', 7);
    w.grenades.push({ id: 1, x: b.x - 0.6, y: b.y, vx: 0, vy: 0, fuse: 1.3, owner: p.id, team: p.team, alive: true });
    for (let i = 0; i < 50; i++) stepWorld(w, { ...IDLE_INPUT, aim: 0 });
    expect(Math.hypot(b.x - (18.5 - 0.6), b.y - 4.5)).toBeGreaterThan(1.8);
  });
  it('in real default games (you + 2 AI), AI teammates and hostile bots both throw grenades (12 seeds)', () => {
    let mates = 0, hostiles = 0;
    for (let s = 1; s <= 12; s++) {
      const w = createWorld({ seed: 300 + s, hero: 'benja', zone: true, allies: squadFor('benja', s) });
      const pilot = createAutopilot(s);
      for (let i = 0; i < 150 * 60 && w.outcome === 'playing'; i++) stepWorld(w, pilot.next(w));
      for (const a of w.actors.slice(1)) if (a.team === 'player') mates += a.thrown; else hostiles += a.thrown;
    }
    expect(mates).toBeGreaterThan(0);
    expect(hostiles).toBeGreaterThan(0);
  }, 240000);
});

describe('the default game squad', () => {
  it('two AI teammates, roster characters, never the player, from three different departments in all', () => {
    for (const h of HEROES) for (const run of [0, 1, 2, 3]) {
      const sq = squadFor(h.id, run);
      expect(sq).toHaveLength(2);
      for (const m of sq) { expect(m.hero).not.toBe(h.id); expect(m.name).toBe(heroById(m.hero).name); }
      expect(new Set([h.dept, ...sq.map((m) => heroById(m.hero).dept)]).size).toBe(3);
    }
  });
  it('they spawn on your team as AI actors with their own weapons and abilities', () => {
    const w = createWorld({ seed: 1, hero: 'ray', allies: squadFor('ray') });
    const mates = w.actors.filter((a) => a.team === 'player' && a.ai);
    expect(mates).toHaveLength(2);
    for (const m of mates) { expect(m.weapon.id).toBe(m.hero.weapon); expect(m.ability.name).toBe(m.hero.ability.name); }
  });
});
