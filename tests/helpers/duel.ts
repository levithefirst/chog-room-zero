// Seeded mirror duel between two online-style actors with any power profile (class system balance, docs/design/power.md).
// Both sides strafe on their own rhythm and fire at each other down a hall; slots swap to cancel slot bias.
import { createWorld, stepWorld, IDLE_INPUT, type Actor, type ActorInput } from '../../src/sim/world';
import type { Power } from '../../src/config/power';

export const HALL = ['##############################', ...Array.from({ length: 7 }, () => '#............................#'), '##############################'];

export function duel(heroA: string, pa: Power, heroB: string, pb: Power, d: number, seed: number, swap: boolean, useAbility = false): 'A' | 'B' | 'draw' {
  const left = { name: 'L', team: 'alpha' as const, y: 4.5, facing: 0 };
  const right = { name: 'R', team: 'bravo' as const, y: 4.5, facing: Math.PI };
  const [la, lb] = swap ? [{ hero: heroB, power: pb }, { hero: heroA, power: pa }] : [{ hero: heroA, power: pa }, { hero: heroB, power: pb }];
  const w = createWorld({ seed, map: HALL, zone: false, versus: [{ ...left, ...la, x: 15 - d / 2 }, { ...right, ...lb, x: 15 + d / 2 }] });
  const L = w.actors[0], R = w.actors[1];
  const dir = new Map<number, number>([[0, 1], [1, -1]]);
  const steer = (me: Actor, foe: Actor): ActorInput => ({
    ...IDLE_INPUT, firing: true, reload: me.ammo === 0, aim: Math.atan2(foe.y - me.y, foe.x - me.x), moveY: dir.get(me.id)!,
    // Abilities: fire when off cooldown and the foe is close enough for a signature to matter (both sides get the same rule).
    ability: useAbility && me.abilityCd === 0 && Math.hypot(foe.x - me.x, foe.y - me.y) < 5,
  });
  for (let i = 0; i < 60 * 20; i++) {
    for (const [me, period] of [[L, 36], [R, 27]] as const) {
      if (i % period === 0 || me.y > 6.5 || me.y < 2.5) dir.set(me.id, me.y > 6.5 ? -1 : me.y < 2.5 ? 1 : -dir.get(me.id)!);
    }
    stepWorld(w, (a) => (a.id === 0 ? steer(L, R) : steer(R, L)));
    if (!L.alive || !R.alive) {
      if (L.alive === R.alive) return 'draw';
      const aWon = swap ? R.alive : L.alive;
      return aWon ? 'A' : 'B';
    }
  }
  return 'draw';
}

/** Share of decided duels won by side A over `n` seeds x 2 slot orders at distance d. */
export function share(heroA: string, pa: Power, heroB: string, pb: Power, d: number, n = 30, useAbility = false): number {
  let a = 0, b = 0;
  for (let i = 0; i < n; i++) for (const swap of [false, true]) { const r = duel(heroA, pa, heroB, pb, d, 900 + i, swap, useAbility); if (r === 'A') a++; else if (r === 'B') b++; }
  return a / Math.max(1, a + b);
}
