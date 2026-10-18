// Free roster (owner 2026-10-14, docs/design/roster-grenades.md): seven characters, five departments, scrambled
// abilities, no NFT dependency, old hero ids still resolve, and a measured duel matrix that shows every character has
// an edge and a weakness and none is simply better than another.
import { describe, expect, it } from 'vitest';
import { DEPARTMENTS, HEROES, LEGACY_HERO, heroById, heroIdOf } from '../src/config/heroes';
import { WEAPONS } from '../src/config/weapons';
import { BASE_POWER, SIGNATURES, powerFor } from '../src/config/power';
import { createWorld, stepWorld, IDLE_INPUT, type Actor, type ActorInput } from '../src/sim/world';
import { canSee } from '../src/sim/vision';
import { practiceRecords, onlineCareer } from '../api/_lib/career';
import { HALL } from './helpers/duel';
import type { Tx } from '../api/_lib/db';

describe('free roster', () => {
  it('exactly BENJA, TOAD, RAY, TABSU, TONASHIRO, YOT, BILL with their departments', () => {
    expect(HEROES.map((h) => [h.name.toUpperCase(), h.dept])).toEqual([
      ['BENJA', 'assault'], ['TOAD', 'tank'], ['RAY', 'sniper'], ['TABSU', 'flanker'], ['TONASHIRO', 'bruiser'], ['YOT', 'assault'], ['BILL', 'flanker'],
    ]);
    for (const h of HEROES) expect(h.role).toBe(DEPARTMENTS[h.dept]);
  });
  it('distinct identities: a different weapon and a different ability kind each, never the same kit twice', () => {
    expect(new Set(HEROES.map((h) => h.weapon)).size).toBe(7);
    expect(new Set(HEROES.map((h) => h.ability.kind)).size).toBe(7);
    expect(new Set(HEROES.map((h) => h.ability.name)).size).toBe(7);
    // Same department, different everything else.
    const [benja, yot] = [heroById('benja'), heroById('yot')], [tabsu, bill] = [heroById('tabsu'), heroById('bill')];
    expect([benja.weapon, benja.ability.kind]).not.toEqual([yot.weapon, yot.ability.kind]);
    expect([tabsu.weapon, tabsu.ability.kind]).not.toEqual([bill.weapon, bill.ability.kind]);
  });
  it('abilities are scrambled away from the old pairings (no renamed hero: Kettle had Patch, Mop Slip, Brick Slab, Wick Ping)', () => {
    expect(heroById('benja').ability.name).not.toBe('Patch');
    expect(heroById('tabsu').ability.name).not.toBe('Slip');
    expect(heroById('toad').ability.name).not.toBe('Slab');
    expect(heroById('ray').ability.name).not.toBe('Ping');
  });
  it('free abilities that share a 1:1 kind are weaker than the 1:1 version (the 1:1s stay on top)', () => {
    const snare = heroById('ray').ability, shell = heroById('tabsu').ability, rush = heroById('bill').ability;
    const howl = SIGNATURES[434], gold = SIGNATURES[1373], red = SIGNATURES[1376];
    expect(snare.radius!).toBeLessThan(howl.radius!);
    expect(snare.seconds!).toBeLessThan(howl.seconds!);
    expect(snare.amount!).toBeGreaterThan(howl.amount!); // 0.6 speed is a milder slow than 0.55
    expect(shell.seconds!).toBeLessThan(gold.seconds!);
    expect(rush.amount!).toBeLessThan(red.amount!);
    expect(rush.seconds!).toBeLessThan(red.seconds!);
  });
  it('no NFT dependency: a character spawns with its own body, weapon and ability, and tier power is separate', () => {
    for (const h of HEROES) {
      const a = createWorld({ hero: h.id, bots: [] }).actors[0];
      expect([a.maxHp, a.armor, a.weapon.id, a.ability.name]).toEqual([h.maxHp, h.maxArmor, h.weapon, h.ability.name]);
      // A holder tier never swaps the kit (only a Chog's superpower or a 1:1's signature takes the ability slot), and
      // since owner 2026-10-18 it adds no health, armour or damage either.
      const e = createWorld({ hero: h.id, bots: [], power: powerFor('epic') }).actors[0];
      expect([e.weapon.id, e.ability.name, e.hero.id]).toEqual([h.weapon, h.ability.name, h.id]);
      expect([e.maxHp, e.armor]).toEqual([a.maxHp, a.armor]);
    }
    expect(HEROES.every((h) => !('tier' in h))).toBe(true);
    expect(BASE_POWER.tier).toBe('free');
  });
  it('pre-roster ids still resolve to their replacement (stored records, old clients); unknown ids do not', () => {
    expect(LEGACY_HERO).toEqual({ kettle: 'benja', mop: 'tabsu', brick: 'toad', wick: 'ray' });
    for (const [old, now] of Object.entries(LEGACY_HERO)) { expect(heroIdOf(old)).toBe(now); expect(heroById(old).id).toBe(now); }
    for (const h of HEROES) expect(heroIdOf(h.id)).toBe(h.id);
    expect(heroIdOf('admin')).toBeNull();
    expect(heroIdOf(5)).toBeNull();
  });
  it('account records stored under an old id merge into the character that replaced it (practice and online)', async () => {
    const q = (rows: unknown[]): Tx => ({ query: async () => rows as never });
    const best = (hero: string, runs: number, wins: number, best: number | null, most: number) =>
      ({ hero, runs, wins, best, most, kills: most, bullets: 10, hits: 5, dealt: 100, taken: 50, seconds: 60, pickups: 1, abilities: 1 });
    const r = await practiceRecords(q([best('kettle', 3, 1, 70, 4), best('benja', 2, 2, 55, 5), best('ray', 1, 0, null, 1)]), 'acc');
    expect(Object.keys(r.heroes).sort()).toEqual(['benja', 'ray']);
    expect(r.heroes.benja).toMatchObject({ runs: 5, wins: 3, bestWinSeconds: 55, mostKills: 5, kills: 9 });
    expect(r.overall.runs).toBe(6);
    const o = await onlineCareer(q([{ hero: 'wick', n: '2', w: '1', k: '3', d: '10', s: '1' }, { hero: 'ray', n: '1', w: '1', k: '2', d: '5', s: '0' }]), 'acc');
    expect(o.heroes).toEqual({ ray: { matches: 3, wins: 2, kills: 5 } });
  });
});

// Duel with player-level information: each side aims and fires only at what its own cone shows (vision.ts), strafing
// on its own rhythm down a hall. Abilities on (same rule for both: when the foe is within 5 u).
function duel(a: string, b: string, d: number, seed: number, swap: boolean): 'A' | 'B' | 'draw' {
  const [l, r] = swap ? [b, a] : [a, b];
  const w = createWorld({ seed, map: HALL, zone: false, versus: [
    { name: 'L', hero: l, team: 'alpha', x: 15 - d / 2, y: 4.5, facing: 0 }, { name: 'R', hero: r, team: 'bravo', x: 15 + d / 2, y: 4.5, facing: Math.PI }] });
  const L = w.actors[0], R = w.actors[1];
  const dir = new Map<number, number>([[0, 1], [1, -1]]);
  const steer = (me: Actor, foe: Actor): ActorInput => {
    const sees = canSee(w.level, me.x, me.y, me.facing, me.view, foe.x, foe.y);
    return { ...IDLE_INPUT, firing: sees, reload: me.ammo === 0, aim: Math.atan2(foe.y - me.y, foe.x - me.x), moveY: dir.get(me.id)!,
      ability: me.abilityCd === 0 && sees && Math.hypot(foe.x - me.x, foe.y - me.y) < 5 };
  };
  for (let i = 0; i < 60 * 20; i++) {
    for (const [me, period] of [[L, 36], [R, 27]] as const) if (i % period === 0 || me.y > 6.5 || me.y < 2.5) dir.set(me.id, me.y > 6.5 ? -1 : me.y < 2.5 ? 1 : -dir.get(me.id)!);
    stepWorld(w, (x) => (x.id === 0 ? steer(L, R) : steer(R, L)));
    if (!L.alive || !R.alive) return L.alive === R.alive ? 'draw' : (swap ? R.alive : L.alive) ? 'A' : 'B';
  }
  return 'draw';
}
function share(a: string, b: string, d: number, n = 16): number {
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) for (const swap of [false, true]) { const r = duel(a, b, d, 500 + i, swap); if (r === 'A') x++; else if (r === 'B') y++; }
  // Every duel a draw (nobody saw anybody at that range) is a coin flip, not a win for either side.
  return x + y === 0 ? 0.5 : x / (x + y);
}

describe('duel matrix: every character has an edge and a weakness, none is simply better (16 seeds x 2 sides per cell)', () => {
  const ids = HEROES.map((h) => h.id), RANGES = [3, 6, 9, 11.5];
  const cell = new Map<string, number>();
  const get = (a: string, b: string, d: number) => cell.get(`${a}|${b}|${d}`)!;
  it('measures every pair at 3, 6, 9 and 11.5 u', () => {
    for (const a of ids) for (const b of ids) if (a < b) for (const d of RANGES) { const s = share(a, b, d); cell.set(`${a}|${b}|${d}`, s); cell.set(`${b}|${a}|${d}`, 1 - s); }
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (env.ROSTER_OUT) (globalThis as { process?: { stdout: { write(s: string): void } } }).process?.stdout.write(
      ids.map((a) => `${a}: ${ids.filter((b) => b !== a).map((b) => `${b} ${RANGES.map((d) => get(a, b, d).toFixed(2)).join('/')}`).join('  ')}`).join('\n') + '\n');
    expect(cell.size).toBe(7 * 6 * RANGES.length);
  }, 300000);
  it('each character wins some matchup (>= 60%) and loses some matchup (<= 40%)', () => {
    for (const a of ids) {
      const all = ids.filter((b) => b !== a).flatMap((b) => RANGES.map((d) => get(a, b, d)));
      expect(Math.max(...all), `${a} has an edge`).toBeGreaterThanOrEqual(0.6);
      expect(Math.min(...all), `${a} has a weakness`).toBeLessThanOrEqual(0.4);
    }
  });
  it('no character is dominant: average win share across everyone and every range stays at or under 70%', () => {
    for (const a of ids) {
      const all = ids.filter((b) => b !== a).flatMap((b) => RANGES.map((d) => get(a, b, d)));
      expect(all.reduce((x, y) => x + y, 0) / all.length, a).toBeLessThanOrEqual(0.7);
    }
  });
  it('no character beats another at every range (each pairing has a range the underdog can play for)', () => {
    for (const a of ids) for (const b of ids) if (a !== b) expect(RANGES.every((d) => get(a, b, d) >= 0.8), `${a} over ${b}`).toBe(false);
  });
});

describe('weapons', () => {
  it('the carbine fires three rounds per trigger pull; every other gun one (pellets aside)', () => {
    const w = createWorld({ hero: 'yot', bots: [] });
    const p = w.actors[0];
    stepWorld(w, { ...IDLE_INPUT, firing: true });
    for (let i = 0; i < 20; i++) stepWorld(w, IDLE_INPUT);
    expect([p.shots, p.bullets, WEAPONS.carbine.magazine - p.ammo]).toEqual([1, 3, 3]);
    const b = createWorld({ hero: 'benja', bots: [] });
    stepWorld(b, { ...IDLE_INPUT, firing: true });
    for (let i = 0; i < 20; i++) stepWorld(b, IDLE_INPUT);
    expect([b.actors[0].shots, b.actors[0].bullets]).toEqual([1, 1]);
  });
});
