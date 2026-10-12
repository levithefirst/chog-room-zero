import { describe, expect, it } from 'vitest';
import { ABILITIES, HEROES, heroById } from '../src/config/heroes';
import { WEAPONS } from '../src/config/weapons';
import { BOT_SPAWNS } from '../src/config/map';
import { nextPhase, simRuns, type Phase } from '../src/sim/match';
import { createWorld } from '../src/sim/world';

describe('hero data', () => {
  it('3-4 heroes, unique ids, valid weapons and abilities, sane numbers', () => {
    expect(HEROES.length).toBeGreaterThanOrEqual(3);
    expect(HEROES.length).toBeLessThanOrEqual(4);
    expect(new Set(HEROES.map((h) => h.id)).size).toBe(HEROES.length);
    for (const h of HEROES) {
      expect(WEAPONS[h.weapon], h.id).toBeDefined();
      expect(Object.values(ABILITIES)).toContain(h.ability);
      expect(h.maxHp).toBeGreaterThan(50);
      expect(h.maxArmor).toBeGreaterThanOrEqual(0);
      expect(h.speed).toBeGreaterThan(0.8);
      expect(h.speed).toBeLessThan(1.2);
      expect(h.vision.range).toBeGreaterThan(5);
      expect(h.vision.coneDeg).toBeGreaterThan(30);
    }
    expect(new Set(HEROES.map((h) => h.weapon)).size).toBe(HEROES.length);
    expect(new Set(HEROES.map((h) => h.ability.kind)).size).toBe(HEROES.length);
  });
  it('every weapon has the fields that make it differ', () => {
    for (const w of Object.values(WEAPONS)) {
      expect(w.damage).toBeGreaterThan(0);
      expect(w.pellets).toBeGreaterThanOrEqual(1);
      expect(w.falloffEnd).toBeGreaterThan(w.falloffStart);
      expect(w.magazine).toBeGreaterThan(0);
      expect(w.reloadSeconds).toBeGreaterThan(0);
    }
  });
  it('no hero beats another on health, armour, speed, and sight at once', () => {
    for (const a of HEROES) for (const b of HEROES) {
      if (a === b) continue;
      const better = a.maxHp >= b.maxHp && a.maxArmor >= b.maxArmor && a.speed >= b.speed && a.vision.range >= b.vision.range;
      expect(better, `${a.id} vs ${b.id}`).toBe(false);
    }
  });
  it('bots use hero archetypes from the same table', () => {
    for (const b of BOT_SPAWNS) expect(() => heroById(b.hero)).not.toThrow();
    const w = createWorld();
    for (const a of w.actors.slice(1)) expect(HEROES).toContain(a.hero);
  });
});

describe('match flow', () => {
  it('title -> select -> loading -> play -> pause -> play -> recap -> results -> restart', () => {
    let p: Phase = 'title';
    const seq: [Parameters<typeof nextPhase>[1], Phase][] = [
      ['start', 'select'], ['pick', 'loading'], ['loaded', 'play'], ['pause', 'pause'], ['resume', 'play'],
      ['died', 'recap'], ['recapDone', 'results'], ['restart', 'loading'], ['loaded', 'play'], ['won', 'results'], ['quit', 'select'],
    ];
    for (const [e, want] of seq) {
      p = nextPhase(p, e);
      expect(p, e).toBe(want);
    }
  });
  it('pause can restart or quit to title; odd events do nothing', () => {
    expect(nextPhase('pause', 'restart')).toBe('loading');
    expect(nextPhase('pause', 'quit')).toBe('title');
    expect(nextPhase('title', 'died')).toBe('title');
    expect(nextPhase('results', 'pause')).toBe('results');
  });
  it('the sim runs only in play (pause freezes it)', () => {
    expect(simRuns('play')).toBe(true);
    for (const p of ['title', 'select', 'loading', 'pause', 'recap', 'results'] as Phase[]) expect(simRuns(p)).toBe(false);
  });
});
