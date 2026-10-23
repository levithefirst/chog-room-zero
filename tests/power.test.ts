// Class system (owner master build prompt 2026-10-13, docs/design/power.md): tier table from the verified catalogue,
// ordering and caps, signature abilities in the sim, and measured duel bands for the chosen numbers.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BASE_POWER, CAPS, MAX_UPGRADES, ONE_OF_ONE, SIGNATURES, chogName, TIERS, TIER_DEFS, UPGRADES, UPGRADE_IDS, clampUpgrades, powerFor, powerForToken, signatureFor, tierOfMetadataId, type Power,
} from '../src/config/power';
import { ONE_OF_ONE_IDS, TIER_TABLE } from '../src/nft/tier-table';
import { HEROES } from '../src/config/heroes';
import { TUNING } from '../src/config/tuning';
import { SUPERPOWER_IDS, superAbility } from '../src/config/superpowers';
import { createWorld, stepWorld, IDLE_INPUT, type ActorInput, type World } from '../src/sim/world';
import { HALL, share } from './helpers/duel';

const MAX_U = MAX_UPGRADES;
const records = (JSON.parse(readFileSync(new URL('../data/chog-genesis/catalogue.json', import.meta.url), 'utf8')) as {
  records: { metadataId: number; traits: Record<string, string> }[];
}).records;

describe('tier table matches the verified catalogue', () => {
  it('one tier per metadata id, same as the Tier trait, and the ten 1:1 ids', () => {
    expect(TIER_TABLE.length).toBe(1969);
    for (const r of records) expect(TIER_DEFS[tierOfMetadataId(r.metadataId)!].label.replace('1:1', 'Legendary')).toBe(r.traits.Tier);
    const counts = Object.fromEntries(TIERS.map((t) => [t, 0]));
    for (let m = 1; m <= 1969; m++) counts[tierOfMetadataId(m)!]++;
    expect(counts).toEqual({ free: 0, common: 1279, uncommon: 590, rare: 60, epic: 30, legendary: 10 });
    expect([...ONE_OF_ONE_IDS]).toEqual(records.filter((r) => r.traits.Base === '1:1').map((r) => r.metadataId).sort((a, b) => a - b));
  });
  it('out-of-range ids give no tier, and fail closed to free power', () => {
    for (const bad of [0, -1, 1970, 1.5, NaN]) expect(tierOfMetadataId(bad)).toBeNull();
    expect(powerForToken(0, null, false).tier).toBe('free');
  });
  it('every 1:1 has its own signature; nobody else has one', () => {
    expect(new Set(ONE_OF_ONE_IDS.map((id) => signatureFor(id)!.name)).size).toBe(10);
    expect(Object.keys(SIGNATURES).map(Number).sort((a, b) => a - b)).toEqual([...ONE_OF_ONE_IDS]);
    expect(signatureFor(1)).toBeNull();
    expect(powerFor('epic', null, SIGNATURES[53]).signature).toBeNull();
    expect(powerForToken(53, null, false).signature?.name).toBe('Flashfire');
  });
});

describe('ladder and caps', () => {
  it('every tier starts at base stats (owner 2026-10-18 rule 6: no rarity health or damage), and never changes speed', () => {
    for (const t of TIERS) expect([TIER_DEFS[t].hpMul, TIER_DEFS[t].armor, TIER_DEFS[t].damageMul], t).toEqual([1, 0, 1]);
    for (const t of Object.values(TIER_DEFS)) expect(Object.keys(t).some((k) => /speed/i.test(k))).toBe(false);
    const w = createWorld({ power: powerFor('legendary', MAX_U, SIGNATURES[1376]) });
    expect(w.actors[0].hero.speed).toBe(1);
  });
  it('every tier at max upgrades stays inside the caps; bad upgrade input is clamped', () => {
    for (const t of TIERS) {
      const p = powerFor(t, MAX_U);
      expect(p.hpMul).toBeLessThanOrEqual(CAPS.hpMul);
      expect(p.armor).toBeLessThanOrEqual(CAPS.armor);
      expect(p.damageMul).toBeLessThanOrEqual(CAPS.damageMul);
      expect(p.cooldownMul).toBeGreaterThanOrEqual(CAPS.cooldownMul);
    }
    expect(clampUpgrades({ vitality: 99, plating: -4, focus: Infinity })).toEqual({ vitality: 12, plating: 0, firepower: 0, focus: 0 });
    for (const id of UPGRADE_IDS) expect(UPGRADES[id].costs.length).toBe(UPGRADES[id].ranks);
    // The caps are exactly the maxed upgrades (owner 2026-10-23): a maxed profile sits on them.
    const m = powerFor('free', MAX_U);
    expect([Math.round(m.baseHp * m.hpMul), m.armor, m.damageMul, m.cooldownMul]).toEqual([270, CAPS.armor, expect.closeTo(CAPS.damageMul, 6), expect.closeTo(CAPS.cooldownMul, 6)]);
    expect(CAPS).toEqual({ hpMul: 2, armor: 60, damageMul: 3.45, cooldownMul: 0.36 });
  });
  it('owner 2026-10-23 upgrades: +10 health, +5 armour, +35% damage, -8% cooldown a rank; 12 / 12 / 7 / 8 ranks', () => {
    expect(UPGRADE_IDS.map((id) => UPGRADES[id].ranks)).toEqual([12, 12, 7, 8]);
    expect(MAX_U).toEqual({ vitality: 12, plating: 12, firepower: 7, focus: 8 });
    expect(UPGRADE_IDS.map((id) => UPGRADES[id].text)).toEqual(['+10 health per rank', '+5 armour per rank', '+35% weapon damage per rank', '-8% ability cooldown per rank']);
    // Vitality is flat: +10 health a rank on the free base (150) and on a no-power Chog base (200) alike.
    for (const v of [0, 1, 6, 12]) {
      const f = powerFor('free', { vitality: v });
      expect(Math.round(f.baseHp * f.hpMul)).toBe(150 + 10 * v);
    }
    const chog = powerForToken(ONE_OF_ONE_IDS[0], { vitality: 12 }, false);
    expect(Math.round(chog.baseHp * chog.hpMul)).toBe(chog.baseHp + 120);
    expect(powerFor('free', { plating: 7 }).armor).toBe(35);
    expect(powerFor('free', { firepower: 3 }).damageMul).toBeCloseTo(2.05, 6);
    expect(powerFor('free', { focus: 5 }).cooldownMul).toBeCloseTo(0.6, 6);
  });
  it('owner 2026-10-23 prices: earlier prices x1.25 (Firepower x2, never both), nearest 5; ranks already bought stay', () => {
    expect(UPGRADES.vitality.costs).toEqual([15, 50, 90, 125, 175, 225, 290, 365, 440, 525, 625, 740]);
    expect(UPGRADES.plating.costs).toEqual(UPGRADES.vitality.costs);
    // The old 150 / 250 / 350 doubled; x1.25 on top would be 375 / 625 / 875.
    expect(UPGRADES.firepower.costs).toEqual([300, 500, 700, 900, 1100, 1300, 1500]);
    expect(UPGRADES.focus.costs).toEqual([40, 75, 140, 225, 340, 475, 640, 825]);
    for (const id of UPGRADE_IDS) for (const c of UPGRADES[id].costs) expect(c % 5, id).toBe(0);
    // An account bought at the old maximum (6/8, 6/8, 3/3, 4/4) keeps every rank and can buy on.
    const old = { vitality: 6, plating: 6, firepower: 3, focus: 4 };
    expect(clampUpgrades(old)).toEqual(old);
    for (const id of UPGRADE_IDS) expect(old[id]).toBeLessThan(UPGRADES[id].ranks);
  });
  it('a free player and a holder buy the same upgrades to the same numbers', () => {
    for (const t of TIERS) {
      const p = powerFor(t, MAX_U), f = powerFor('free', MAX_U);
      expect([p.hpMul, p.armor, p.damageMul, p.cooldownMul], t).toEqual([f.hpMul, f.armor, f.damageMul, f.cooldownMul]);
    }
  });
  it('every 1:1 has its real name and its own colour', () => {
    expect(Object.keys(ONE_OF_ONE).map(Number).sort((a, b) => a - b)).toEqual([...ONE_OF_ONE_IDS]);
    expect(new Set(Object.values(ONE_OF_ONE).map((o) => o.color)).size).toBe(10);
    expect(Object.values(ONE_OF_ONE).map((o) => o.name).sort()).toEqual(['Blaze', 'Burning Skully', 'Chog Scream', 'Chogbomination', 'Frogger', 'Grim', 'Halo', 'Krown', 'Midas', 'Redd']);
    for (const r of records.filter((x) => x.traits.Base === '1:1')) expect((r as unknown as { name: string }).name).toContain(ONE_OF_ONE[r.metadataId].name);
    expect(chogName(53)).toBe('Blaze (#53)');
    expect(chogName(812)).toBe('Chog #812');
    for (const sig of Object.values(SIGNATURES)) { expect(sig.telegraph, sig.name).toBeTruthy(); expect(sig.counter, sig.name).toBeTruthy(); }
  });
  it('spawn applies upgrades, never the tier: health, armour, armour cap, ability cooldown', () => {
    const p = powerFor('rare', { focus: 2, vitality: 2, plating: 3 });
    const a = createWorld({ hero: 'benja', power: p }).actors[0];
    const k = HEROES.find((h) => h.id === 'benja')!;
    expect(a.maxHp).toBe(k.maxHp + 20);
    expect(a.hp).toBe(a.maxHp);
    expect(a.armor).toBe(k.maxArmor + 15);
    expect(a.maxArmor).toBe(TUNING.combat.armorCap + 15);
    expect(a.ability.cooldown).toBeCloseTo(k.ability.cooldown * 0.84, 6);
    expect(createWorld({ hero: 'benja' }).actors[0].maxHp).toBe(k.maxHp);
  });
});

// Two actors in a hall; returns the world after `ticks` with actor 0 pressing ability once on the first tick.
function arena(sig: keyof typeof SIGNATURES, gap = 2, map = HALL): World {
  return createWorld({
    seed: 1, map, zone: false,
    versus: [
      { name: 'S', hero: 'benja', team: 'alpha', x: 10, y: 4.5, facing: 0, power: powerFor('legendary', null, SIGNATURES[sig]) },
      { name: 'T', hero: 'benja', team: 'bravo', x: 10 + gap, y: 4.5, facing: Math.PI },
      { name: 'A', hero: 'benja', team: 'alpha', x: 10, y: 6, facing: 0 },
    ],
  });
}
const run = (w: World, ticks: number, input: (id: number, tick: number) => Partial<ActorInput> = () => ({})) => {
  for (let i = 0; i < ticks; i++) stepWorld(w, (a) => ({ ...IDLE_INPUT, aim: a.facing, ...input(a.id, i) }));
};
const pressOnce = (id: number, t: number) => (id === 0 && t === 0 ? { ability: true } : {});

describe('1:1 signature abilities in the sim', () => {
  it('Flashfire: telegraph first, then damage within range and sight only', () => {
    const w = arena(53);
    run(w, 1, pressOnce);
    expect(w.sounds.some((s) => s.type === 'windup')).toBe(true);
    expect(w.actors[1].hp).toBe(w.actors[1].maxHp);
    run(w, 40);
    const t = w.actors[1];
    expect(t.hp + t.armor).toBeLessThan(t.maxHp + 25);
    expect(w.actors[2].hp).toBe(w.actors[2].maxHp); // allies untouched
    const far = arena(53, 5);
    run(far, 60, pressOnce);
    expect(far.actors[1].hp).toBe(far.actors[1].maxHp);
    const walled = arena(53, 2, ['##############################', ...Array.from({ length: 7 }, () => '#..........#.................#'), '##############################']);
    run(walled, 60, pressOnce);
    expect(walled.actors[1].hp).toBe(walled.actors[1].maxHp);
  });
  it('a 1:1 signature sound carries its token, so every client plays that Chog\'s own voice and colour', () => {
    const w = createWorld({ seed: 1, map: HALL, zone: false, versus: [
      { name: 'S', hero: 'benja', team: 'alpha', x: 10, y: 4.5, facing: 0, power: powerForToken(53, null, false) },
      { name: 'T', hero: 'benja', team: 'bravo', x: 12, y: 4.5, facing: Math.PI },
    ] });
    run(w, 1, pressOnce);
    expect(w.sounds.find((s) => s.type === 'windup')?.sig).toBe(53);
    const plain = arena(53);
    run(plain, 1, pressOnce);
    expect(plain.sounds.find((s) => s.type === 'windup')?.sig).toBeUndefined(); // no token behind it: generic cue
  });
  it('Hellfire ignores armour', () => {
    const w = arena(392);
    const armor = w.actors[1].armor;
    run(w, 70, pressOnce);
    expect(w.actors[1].armor).toBe(armor);
    expect(w.actors[1].hp).toBeLessThan(w.actors[1].maxHp - 29);
  });
  it('Howl slows hostiles in sight', () => {
    const w = arena(434);
    run(w, 1, pressOnce);
    expect(w.actors[1].slowLeft).toBeGreaterThan(0);
    expect(w.actors[2].slowLeft).toBe(0);
    run(w, 60, (id) => (id === 1 ? { moveX: 1 } : {}));
    const slowed = w.actors[1].x;
    const free = arena(53);
    run(free, 61, (id) => (id === 1 ? { moveX: 1 } : {}));
    expect(slowed).toBeLessThan(free.actors[1].x - 0.3);
  });
  it('Gold Shell stops all bullet damage and its holder cannot fire', () => {
    const w = arena(1373);
    run(w, 30, (id, t) => (id === 0 ? { ability: t === 0, firing: true } : id === 1 ? { firing: true, aim: Math.PI } : {}));
    expect(w.actors[0].hp).toBe(w.actors[0].maxHp);
    expect(w.actors[0].shots).toBe(0);
  });
  it('Red Rush raises bullet damage by its amount while it lasts', () => {
    const dealt = (sig: number, use: boolean) => {
      const w = arena(sig as 1376);
      run(w, 20, (id, t) => (id === 0 ? { ability: use && t === 0, firing: true } : {}));
      return w.actors[0].damageDealt;
    };
    expect(dealt(1376, true) / dealt(1376, false)).toBeCloseTo(SIGNATURES[1376].amount!, 2);
  });
  it('Halo heals allies in range; Crown Guard restores armour', () => {
    const w = arena(1159);
    w.actors[0].hp = 50; w.actors[2].hp = 50;
    run(w, 1, pressOnce);
    expect(w.actors[0].hp).toBe(50 + SIGNATURES[1159].amount!);
    expect(w.actors[2].hp).toBe(50 + SIGNATURES[1159].amount!);
    const c = arena(1290);
    c.actors[0].armor = 0; c.actors[0].hp = 50;
    run(c, 1, pressOnce);
    expect(c.actors[0].armor).toBe(SIGNATURES[1290].armor);
    expect(c.actors[0].hp).toBe(50 + SIGNATURES[1290].amount!);
  });
  it('Leap goes further than Slip; Bulwark is longer and lasts longer than Slab; Deadsight reaches 18 m', () => {
    const leap = arena(973);
    run(leap, 19, (id, t) => (id === 0 ? { ability: t === 0, moveX: -1 } : {}));
    const slip = createWorld({ seed: 1, map: HALL, zone: false, versus: [{ name: 'M', hero: 'toad', team: 'alpha', x: 10, y: 4.5, facing: 0 }] });
    run(slip, 19, (id, t) => (id === 0 ? { ability: t === 0, moveX: -1 } : {}));
    expect(10 - leap.actors[0].x).toBeGreaterThan(3.5);
    expect(10 - leap.actors[0].x).toBeGreaterThan(10 - slip.actors[0].x + 1);
    const bw = arena(494);
    run(bw, 1, pressOnce);
    expect(bw.barriers[0].left).toBeGreaterThan(13);
    const b = bw.barriers[0].box;
    expect(Math.max(b.x1 - b.x0, b.y1 - b.y0)).toBeCloseTo(3, 6);
    expect(SIGNATURES[1006].radius).toBe(18);
  });
});

// Measured with tests/helpers/duel.ts: perfect-aim mirror duels, slot-swapped, 3 / 6 / 9 u. Real play has aim error,
// which narrows every edge, so these bands are the upper bound of the advantage (docs/design/power.md).
describe('measured duel bands', () => {
  const mean = (hero: string, a: ReturnType<typeof powerFor>, b: ReturnType<typeof powerFor>, n = 12, ability = false) =>
    [3, 6].reduce((s, d) => s + share(hero, a, hero, b, d, n, ability), 0) / 2;
  it('a holder and a free player with the same operator and upgrades are even (no rarity stat edge)', () => {
    for (const hero of ['benja', 'tabsu']) for (const t of ['common', 'epic', 'legendary'] as const) {
      const s = mean(hero, powerFor(t, MAX_U), powerFor('free', MAX_U));
      expect(s, `${hero} ${t}`).toBeGreaterThanOrEqual(0.4);
      expect(s, `${hero} ${t}`).toBeLessThanOrEqual(0.6);
    }
  }, 120000);
  it('no signature dominates a 1:1 with the plain hero ability (mean of 3 and 6 u within 0.3 to 0.85)', () => {
    for (const sig of Object.values(SIGNATURES)) {
      const s = mean('benja', powerFor('legendary', null, sig), powerFor('legendary'), 12, true);
      expect(s, sig.name).toBeGreaterThanOrEqual(0.3);
      expect(s, sig.name).toBeLessThanOrEqual(0.85);
    }
  }, 240000);
  it('no superpower dominates the operator\'s own ability, at its lowest or highest rank (within 0.25 to 0.85)', () => {
    for (const id of SUPERPOWER_IDS) for (const rank of ['common', 'legendary'] as const) {
      const sp: Power = { ...BASE_POWER, tier: rank, superpower: superAbility(id, rank) };
      const s = mean('benja', sp, BASE_POWER, 12, true);
      expect(s, `${id} ${rank}`).toBeGreaterThanOrEqual(0.25);
      expect(s, `${id} ${rank}`).toBeLessThanOrEqual(0.85);
    }
  }, 240000);
});
