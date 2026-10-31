// Final QA (owner 2026-10-14): the default game is YOU + 2 AI TEAMMATES against the hostile bots. Teammates are real
// actors in the simulation (team 'player', bot brain, Actor.ai): they spawn with the player, move, find hostiles by
// sight and sound, shoot, take damage, kill, get downed, revive and are revived, and never hurt the player.
import { describe, expect, it } from 'vitest';
import { createWorld, player, stepWorld, IDLE_INPUT, type World } from '../src/sim/world';
import { createAutopilot } from '../src/debug/autopilot';
import { TUNING } from '../src/config/tuning';
import { walkable } from '../src/sim/level';

const ALLIES = [{ name: 'Toad', hero: 'toad' }, { name: 'Ray', hero: 'ray' }];
const def = (seed: number, hero = 'benja'): World => createWorld({ seed, hero, zone: true, allies: ALLIES });

function play(w: World, seconds: number, pilotSeed: number) {
  const pilot = createAutopilot(pilotSeed);
  for (let i = 0; i < seconds * 60 && w.outcome === 'playing'; i++) stepWorld(w, pilot.next(w));
}

describe('default game: you + 2 AI teammates', () => {
  it('spawns three on the player side (two of them AI) on free floor, five hostile bots, all on separate spots', () => {
    const w = def(1);
    const side = w.actors.filter((a) => a.team === 'player');
    expect(side.map((a) => [a.name, a.ai])).toEqual([['You', false], ['Toad', true], ['Ray', true]]);
    expect(w.actors.filter((a) => a.team === 'bot')).toHaveLength(5);
    for (const a of side) expect(walkable(w.level.tiles[Math.floor(a.y) * w.level.w + Math.floor(a.x)])).toBe(true);
    expect(new Set(side.map((a) => `${a.x},${a.y}`)).size).toBe(3);
    expect(w.brains.has(1) && w.brains.has(2)).toBe(true);
    // The rule tests stay isolated: no teammates unless asked for.
    expect(createWorld({ seed: 1 }).actors.filter((a) => a.team === 'player')).toHaveLength(1);
  });
  it('with nothing to fight, teammates move with the squad and wander near the player, not glued to them (owner 2026-10-14)', () => {
    const w = def(2);
    const mates = w.actors.slice(1, 3);
    const start = mates.map((a) => ({ x: a.x, y: a.y }));
    const p = player(w);
    for (let i = 0; i < 60 * 4; i++) stepWorld(w, { ...IDLE_INPUT, moveX: 1, aim: 0 });
    for (const [k, a] of mates.entries()) expect(Math.hypot(a.x - start[k].x, a.y - start[k].y), a.name).toBeGreaterThan(1.5);
    // The player stands still for 8 s: teammates keep moving around (not frozen at a fixed offset), stay with the squad
    // (never more than 9.5 u away), and do not stand on top of the player.
    const dists: number[][] = mates.map(() => []);
    const moved = mates.map(() => 0);
    for (let i = 0; i < 60 * 8; i++) {
      const before = mates.map((a) => ({ x: a.x, y: a.y }));
      stepWorld(w, { ...IDLE_INPUT, aim: 0 });
      mates.forEach((a, k) => { moved[k] += Math.hypot(a.x - before[k].x, a.y - before[k].y); if (i % 30 === 0) dists[k].push(Math.hypot(a.x - p.x, a.y - p.y)); });
    }
    for (const [k, a] of mates.entries()) {
      expect(moved[k], `${a.name} wanders`).toBeGreaterThan(2);
      expect(Math.max(...dists[k]), `${a.name} stays with the squad (regroups past 9 u)`).toBeLessThan(10.5);
      const mean = dists[k].reduce((x, y) => x + y, 0) / dists[k].length;
      expect(mean, `${a.name} not glued to the player`).toBeGreaterThan(1.8);
    }
  });
  it('across real matches teammates shoot, deal damage, take damage and down hostiles (8 seeds, scripted player)', () => {
    let shots = 0, dealt = 0, taken = 0, kills = 0, wins = 0;
    for (let s = 1; s <= 8; s++) {
      const w = def(100 + s);
      play(w, 150, s);
      for (const a of w.actors.slice(1, 3)) { shots += a.shots; dealt += a.damageDealt; taken += a.damageTaken; kills += a.kills; }
      if (w.outcome === 'won') wins++;
    }
    expect(shots).toBeGreaterThan(50);
    expect(dealt).toBeGreaterThan(300);
    expect(taken).toBeGreaterThan(50);
    expect(kills).toBeGreaterThanOrEqual(3);
    expect(wins).toBeGreaterThanOrEqual(1);
  }, 240000);
  it('a teammate never hurts the player (no friendly fire), even firing through them', () => {
    const w = createWorld({ seed: 3, zone: false, bots: [], allies: ALLIES, map: ['##############', '#............#', '#P...........#', '#............#', '##############'] });
    const p = player(w), m = w.actors[1];
    m.x = p.x - 1; m.y = p.y; p.hp = p.maxHp;
    for (let i = 0; i < 60; i++) stepWorld(w, (a) => (a.id === 0 ? IDLE_INPUT : { ...IDLE_INPUT, firing: true, aim: 0 }), undefined, (a) => (a.id === 1 ? { ...IDLE_INPUT, firing: true, aim: 0 } : null));
    expect(m.shots).toBeGreaterThan(0);
    expect(p.hp).toBe(p.maxHp);
  });
  it('the player goes DOWN (not out) while a teammate stands, and an AI teammate comes and revives them', () => {
    const MAP = ['####################', '#..................#', '#..P...............#', '#..................#', '####################'];
    const w = createWorld({ seed: 4, zone: false, map: MAP, allies: ALLIES, bots: [{ name: 'T', hero: 'benja', patrol: [[9, 2]], flanker: false }] });
    const p = player(w), hostile = w.actors[3];
    hostile.grenades = 0; // revive only here; a blast finishing a downed player is tested in tests/gr-grenades.test.ts
    hostile.hp = hostile.maxHp = 1e6; // it must live long enough to down the player (the teammates shoot it too)
    // Teammates a few metres behind the player (west), so the hostile's nearest target is the player.
    w.actors[1].x = 1.5; w.actors[1].y = 1.5; w.actors[2].x = 1.5; w.actors[2].y = 3.5;
    p.hp = 3; p.armor = 0;
    let downedAt = -1, revivedAt = -1;
    for (let i = 0; i < 60 * 30 && revivedAt < 0; i++) {
      stepWorld(w, { ...IDLE_INPUT, aim: 0 });
      if (downedAt < 0 && p.downed) { downedAt = i; hostile.hp = 0; hostile.alive = false; }
      if (downedAt >= 0 && !p.downed && p.alive) revivedAt = i;
    }
    expect(downedAt, 'player was downed').toBeGreaterThanOrEqual(0);
    expect(w.playerKill, 'not eliminated').toBeNull();
    expect(revivedAt, 'revived by an AI teammate').toBeGreaterThan(downedAt);
    expect((revivedAt - downedAt) / 60).toBeLessThan(TUNING.revive.bleedSeconds);
    expect(p.hp).toBe(Math.round(p.maxHp * TUNING.revive.hpShare));
  });
  it('alone (both teammates out), zero health is the end of the run, as before', () => {
    const MAP = ['####################', '#..................#', '#..P...............#', '#..................#', '####################'];
    const w = createWorld({ seed: 5, zone: false, map: MAP, allies: ALLIES, bots: [{ name: 'T', hero: 'benja', patrol: [[9, 2]], flanker: false }] });
    for (const m of w.actors.slice(1, 3)) { m.alive = false; m.hp = 0; }
    const p = player(w);
    p.hp = 3; p.armor = 0;
    for (let i = 0; i < 60 * 20 && w.outcome === 'playing'; i++) stepWorld(w, { ...IDLE_INPUT, aim: 0 });
    expect(p.downed).toBe(false);
    expect(w.outcome).toBe('dead');
  });
});
