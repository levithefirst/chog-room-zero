// SB readable time-to-kill (LAW 8). One trigger pull, every pellet landing at point blank, against each roster hero at
// full health and armour (armour rule: world.ts mitigate). The sawn-off one-shot was the root of Bill's 33 of 40.
import { describe, expect, it } from 'vitest';
import { HEROES } from '../src/config/heroes';
import { WEAPONS, damageAt } from '../src/config/weapons';
import { mitigate } from '../src/sim/world';

/** Health lost to one trigger pull (a burst weapon's whole burst), all pellets on target at 1 u. */
function onePull(weaponId: string, heroId: string): { hp: number; maxHp: number } {
  const W = WEAPONS[weaponId], h = HEROES.find((x) => x.id === heroId)!;
  let armor = h.maxArmor, hp = 0;
  for (let r = 0; r < (W.burst ?? 1); r++) for (let i = 0; i < W.pellets; i++) {
    const m = mitigate(armor, damageAt(W, 1), W.armorPen);
    armor -= m.armor;
    hp += m.hp;
  }
  return { hp, maxHp: h.maxHp };
}

describe('no trigger pull takes a full-health hero to zero, except where measured and owned', () => {
  it('the sawn-off: never (its second shell is the kill, 0.25 s later)', () => {
    for (const h of HEROES) expect(onePull('sawnoff', h.id).hp, h.id).toBeLessThan(onePull('sawnoff', h.id).maxHp);
  });
  it('every gun but the pump shotgun: never', () => {
    for (const w of Object.keys(WEAPONS)) if (w !== 'shotgun') for (const h of HEROES) {
      const r = onePull(w, h.id);
      expect(r.hp, `${w} vs ${h.id}`).toBeLessThan(r.maxHp);
    }
  });
  it('the pump shotgun one-shots only the three lightest heroes (Bill, Ray, Tabsu), and only with all eight pellets at point blank (flagged for the owner)', () => {
    const killed = HEROES.filter((h) => { const r = onePull('shotgun', h.id); return r.hp >= r.maxHp; }).map((h) => h.id).sort();
    expect(killed).toEqual(['bill', 'ray', 'tabsu']);
  });
});
