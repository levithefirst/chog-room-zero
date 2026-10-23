import { describe, expect, it } from 'vitest';
import { armorCeiling, createWorld, hpCeiling, player, stepWorld, IDLE_INPUT, revealed, type ActorInput } from '../src/sim/world';
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
const far = [{ name: 'T', hero: 'benja', patrol: [[11, 3]] as [number, number][], flanker: false }];

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
  it('a full-health actor overheals by the pickup (capped at +25%), and it stays (GP: no phantom drain)', () => {
    const w = createWorld({ map: ROOM, bots: [] });
    const p = player(w);
    p.x = 5.5; p.y = 1.5;
    stepWorld(w, IDLE_INPUT);
    expect(w.pickups.find((k) => k.kind === 'health')!.active).toBe(false);
    expect(p.hp).toBeCloseTo(Math.min(hpCeiling(p), p.maxHp + TUNING.pickups.health.amount), 0);
    const over = p.hp - p.maxHp;
    p.x = 2.5;
    expect(over).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 30; i++) stepWorld(w, IDLE_INPUT);
    expect(p.hp - p.maxHp).toBeCloseTo(over, 6);
  });
  it('at the overheal ceiling a health pickup is left for someone else', () => {
    const w = createWorld({ map: ROOM, bots: [] });
    const p = player(w);
    p.hp = hpCeiling(p);
    p.x = 5.5; p.y = 1.5;
    stepWorld(w, IDLE_INPUT);
    expect(w.pickups.find((k) => k.kind === 'health')!.active).toBe(true);
  });
  it('armour at its cap goes up to 25 over it, and it stays (GP: no phantom drain)', () => {
    const w = createWorld({ map: ROOM, bots: [] });
    const p = player(w);
    p.armor = p.maxArmor;
    p.x = 8.5; p.y = 1.5;
    stepWorld(w, IDLE_INPUT);
    expect(p.armor).toBeCloseTo(armorCeiling(p), 1);
    expect(armorCeiling(p)).toBe(p.maxArmor + TUNING.pickups.overArmor);
    p.x = 2.5;
    for (let i = 0; i < 60 * 30; i++) stepWorld(w, IDLE_INPUT);
    expect(p.armor).toBeCloseTo(armorCeiling(p), 6);
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
    const w = createWorld({ map: ROOM, hero: 'toad', bots: [] });
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
    const w = createWorld({ map: ROOM, hero: 'benja', bots: far });
    const p = player(w);
    stepWorld(w, input({ ability: true }));
    expect(revealed(w, p).length).toBe(1);
    expect(w.sounds.some((s) => s.type === 'sonar')).toBe(true);
    for (let i = 0; i < TUNING.abilities.sonarSeconds * 60 + 2; i++) stepWorld(w, IDLE_INPUT);
    expect(revealed(w, p).length).toBe(0);
  });
  it('Slab (barrier) blocks bullets while it stands, then disappears', () => {
    const w = createWorld({ map: ROOM, hero: 'yot', bots: [] });
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
    const w = createWorld({ map: ROOM, hero: 'tonashiro', bots: [] });
    const p = player(w);
    p.hp = 50;
    p.x = 2.5; p.y = 3.5;
    stepWorld(w, input({ ability: true }));
    expect(p.hp).toBe(85);
    p.hp = p.maxHp - 5;
    p.abilityCd = 0;
    stepWorld(w, input({ ability: true }));
    expect(p.hp).toBe(p.maxHp);
  });
});
