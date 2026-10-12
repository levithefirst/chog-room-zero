import { describe, expect, it } from 'vitest';
import { createWorld, player, stepWorld, IDLE_INPUT, revealed, type ActorInput } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';
import { shotClear } from '../src/sim/level';

const input = (o: Partial<ActorInput>): ActorInput => ({ ...IDLE_INPUT, ...o });
const ROOM = [
  '##############',
  '#P...h..a..m.#',
  '#............#',
  '#............#',
  '##############',
];
const far = [{ name: 'T', hero: 'kettle', patrol: [[11, 3]] as [number, number][], flanker: false }];

describe('pickups', () => {
  it('health heals up to max, goes inactive, and respawns on its timer', () => {
    const w = createWorld({ map: ROOM, bots: [] });
    const p = player(w);
    p.hp = 30;
    p.x = 5.5; p.y = 1.5;
    stepWorld(w, IDLE_INPUT);
    expect(p.hp).toBe(30 + TUNING.pickups.health.amount);
    const hp = w.pickups.find((k) => k.kind === 'health')!;
    expect(hp.active).toBe(false);
    p.x = 2.5;
    for (let i = 0; i < TUNING.pickups.health.respawn * 60 + 2; i++) stepWorld(w, IDLE_INPUT);
    expect(hp.active).toBe(true);
  });
  it('a full-health actor does not waste a health pickup', () => {
    const w = createWorld({ map: ROOM, bots: [] });
    const p = player(w);
    p.x = 5.5; p.y = 1.5;
    stepWorld(w, IDLE_INPUT);
    expect(w.pickups.find((k) => k.kind === 'health')!.active).toBe(true);
  });
  it('armour adds armour (capped); ammo adds two magazines to reserve', () => {
    const w = createWorld({ map: ROOM, bots: [] });
    const p = player(w);
    p.armor = 0;
    p.x = 8.5; p.y = 1.5;
    stepWorld(w, IDLE_INPUT);
    expect(p.armor).toBe(TUNING.pickups.armor.amount);
    const before = p.reserve;
    p.x = 11.5;
    stepWorld(w, IDLE_INPUT);
    expect(p.reserve).toBe(before + p.weapon.magazine * 2);
  });
});

describe('abilities', () => {
  it('Slip (dash) moves much further than running for the same time, then cools down', () => {
    const w = createWorld({ map: ROOM, hero: 'mop', bots: [] });
    const p = player(w);
    p.x = 2.5; p.y = 2.5;
    stepWorld(w, input({ moveX: 1, ability: true }));
    for (let i = 0; i < 11; i++) stepWorld(w, input({ moveX: 1 }));
    expect(p.x - 2.5).toBeGreaterThan(2);
    expect(p.abilityCd).toBeGreaterThan(5);
    const x = p.x;
    stepWorld(w, input({ ability: true }));
    expect(p.dashLeft).toBe(0);
    expect(p.x).toBeCloseTo(x, 0);
  });
  it('Ping (sonar) reveals hostiles in range through walls for its duration, and is heard', () => {
    const w = createWorld({ map: ROOM, hero: 'wick', bots: far });
    const p = player(w);
    stepWorld(w, input({ ability: true }));
    expect(revealed(w, p).length).toBe(1);
    expect(w.sounds.some((s) => s.type === 'sonar')).toBe(true);
    for (let i = 0; i < TUNING.abilities.sonarSeconds * 60 + 2; i++) stepWorld(w, IDLE_INPUT);
    expect(revealed(w, p).length).toBe(0);
  });
  it('Slab (barrier) blocks bullets while it stands, then disappears', () => {
    const w = createWorld({ map: ROOM, hero: 'brick', bots: [] });
    const p = player(w);
    p.x = 3.5; p.y = 2.5;
    stepWorld(w, input({ aim: 0, ability: true }));
    expect(w.barriers.length).toBe(1);
    expect(shotClear(w.level, 10.5, 2.5, 2.5, 2.5, false, TUNING.combat.coverLean)).toBe(false);
    for (let i = 0; i < TUNING.abilities.barrierSeconds * 60 + 2; i++) stepWorld(w, IDLE_INPUT);
    expect(w.barriers.length).toBe(0);
    expect(shotClear(w.level, 10.5, 2.5, 2.5, 2.5, false, TUNING.combat.coverLean)).toBe(true);
  });
  it('Patch (mend) restores 35 health, capped at max', () => {
    const w = createWorld({ map: ROOM, hero: 'kettle', bots: [] });
    const p = player(w);
    p.hp = 50;
    p.x = 2.5; p.y = 3.5;
    stepWorld(w, input({ ability: true }));
    expect(p.hp).toBe(85);
    p.hp = 95;
    p.abilityCd = 0;
    stepWorld(w, input({ ability: true }));
    expect(p.hp).toBe(100);
  });
});
