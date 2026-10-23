// RC-1 NFT DEMO: deterministic traits, sidegrades only, and duel parity (seeded) vs the standard kit.
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { traitsFor, sampleTokens, TRAIT_INFO, DEMO_COPY, isTokenId } from '../src/nft/traits';
import { SIDEGRADES, type Sidegrade } from '../src/sim/operators';
import { createWorld, stepWorld, viewFor, weaponFor, IDLE_INPUT, type Actor, type ActorInput } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';

describe('RC-1 NFT DEMO traits', () => {
  it('is deterministic and covers every sidegrade with effect + counterplay text', () => {
    for (const t of ['1', '7', '42', '9999']) expect(traitsFor(t)).toEqual(traitsFor(t));
    for (const s of SIDEGRADES) { expect(TRAIT_INFO[s.id].effect.length).toBeGreaterThan(10); expect(TRAIT_INFO[s.id].counterplay.length).toBeGreaterThan(10); }
    const samples = sampleTokens();
    expect(new Set(samples.map((t) => traitsFor(t).sidegrade.id)).size).toBe(SIDEGRADES.length);
  });
  it('says DEMO and that no wallet or ownership is checked', () => {
    expect(DEMO_COPY).toMatch(/DEMO/); expect(DEMO_COPY).toMatch(/no wallet/); expect(DEMO_COPY).toMatch(/no ownership/);
    expect(isTokenId('12')).toBe(true); expect(isTokenId('1e3')).toBe(false); expect(isTokenId('')).toBe(false);
  });
});

// Seeded duel parity: hero X with a sidegrade vs the same hero standard, mirrored, strafing, 3 ranges.
const HALL = ['##############################', ...Array.from({ length: 7 }, () => '#............................#'), '##############################'];
function duel(hero: string, sg: Sidegrade, d: number, seed: number, swap: boolean): 'A' | 'B' | 'draw' {
  // A = the sidegraded side. Two equal players (no bot-only rules such as the bot fire gate, which turned a longer
  // lamp into a disadvantage once fights lasted longer at 150 health); swap which slot it occupies to cancel slot bias.
  const w = createWorld({ seed, map: HALL, zone: false, versus: [
    { name: 'L', hero, team: 'alpha', x: 15 - d / 2, y: 4.5, facing: 0 },
    { name: 'R', hero, team: 'bravo', x: 15 + d / 2, y: 4.5, facing: Math.PI },
  ] });
  const [A, B] = swap ? [w.actors[1], w.actors[0]] : [w.actors[0], w.actors[1]];
  A.weapon = weaponFor(A.hero, sg); A.ammo = A.weapon.magazine; A.reserve = A.weapon.reserve;
  A.view = viewFor(A.hero, sg); A.baseView = viewFor(A.hero, sg);
  const L = w.actors[0], R = w.actors[1];
  const dir = new Map<number, number>([[0, 1], [1, -1]]);
  const steer = (me: Actor, foe: Actor): ActorInput => ({ ...IDLE_INPUT, firing: true, reload: me.ammo === 0, aim: Math.atan2(foe.y - me.y, foe.x - me.x), moveY: dir.get(me.id)! });
  for (let i = 0; i < 60 * 15; i++) {
    for (const [me, period] of [[L, 36], [R, 27]] as const) if (i % period === 0 || me.y > 6.5 || me.y < 2.5) dir.set(me.id, me.y > 6.5 ? -1 : me.y < 2.5 ? 1 : -dir.get(me.id)!);
    stepWorld(w, (a) => (a.id === 0 ? steer(L, R) : steer(R, L)));
    if (!A.alive || !B.alive) return A.alive === B.alive ? 'draw' : A.alive ? 'A' : 'B';
  }
  return 'draw';
}

describe('RC-1 NFT DEMO duel parity (sidegrade vs standard, seeded, N=80 per cell incl. slot swap)', () => {
  let saved = 1;
  beforeAll(() => { saved = TUNING.bots.damageMul; (TUNING.bots as { damageMul: number }).damageMul = 1; });
  afterAll(() => { (TUNING.bots as { damageMul: number }).damageMul = saved; });
  for (const sg of SIDEGRADES) it(`${sg.name}: win share vs standard within 25-75% at 3, 6 and 9 u (Kettle)`, () => {
    for (const d of [3, 6, 9]) {
      let a = 0, b = 0;
      for (let i = 0; i < 40; i++) for (const swap of [false, true]) { const r = duel('kettle', sg, d, 500 + i, swap); if (r === 'A') a++; else if (r === 'B') b++; }
      const share = a / Math.max(1, a + b);
      expect(share, `${sg.name} at ${d} u: ${a}-${b}`).toBeGreaterThanOrEqual(0.25);
      expect(share, `${sg.name} at ${d} u: ${a}-${b}`).toBeLessThanOrEqual(0.75);
    }
  }, 60000);
});
