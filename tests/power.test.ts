// Class system (owner master build prompt 2026-10-13, docs/design/power.md): tier table from the verified catalogue,
// ordering and caps, signature abilities in the sim, and measured duel bands for the chosen numbers.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BASE_POWER, CAPS, MAX_UPGRADES, ONE_OF_ONE, SIGNATURES, chogName, TIERS, TIER_DEFS, UPGRADES, UPGRADE_IDS, clampUpgrades, powerFor, powerForToken, signatureFor, tierOfMetadataId,
} from '../src/config/power';
import { ONE_OF_ONE_IDS, TIER_TABLE } from '../src/nft/tier-table';
import { HEROES } from '../src/config/heroes';
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
  it('each tier is at least as strong as the one below, and never changes speed', () => {
    for (let i = 1; i < TIERS.length; i++) {
      const a = TIER_DEFS[TIERS[i - 1]], b = TIER_DEFS[TIERS[i]];
      expect(b.hpMul).toBeGreaterThanOrEqual(a.hpMul);
      expect(b.armor).toBeGreaterThanOrEqual(a.armor);
      expect(b.damageMul).toBeGreaterThanOrEqual(a.damageMul);
      expect(b.hpMul + b.armor / 100).toBeGreaterThan(a.hpMul + a.armor / 100);
    }
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
    expect(clampUpgrades({ vitality: 99, plating: -4, focus: Infinity })).toEqual({ vitality: 8, plating: 0, firepower: 0, focus: 0 });
    for (const id of UPGRADE_IDS) expect(UPGRADES[id].costs.length).toBe(UPGRADES[id].ranks);
  });
  it('a maxed free player starts past Uncommon and below Rare (the free upgrade path climbs past the lower tiers)', () => {
    const f = powerFor('free', MAX_U), u = powerFor('uncommon'), r = powerFor('rare');
    expect(f.hpMul).toBeGreaterThanOrEqual(u.hpMul);
    expect(f.armor).toBeGreaterThanOrEqual(u.armor);
    expect(f.damageMul).toBeGreaterThanOrEqual(u.damageMul);
    expect(f.hpMul).toBeLessThan(r.hpMul);
    expect(f.armor).toBeLessThan(r.armor);
  });
  it('the 1:1 tier is the dominant one, and every 1:1 has its real name and its own colour', () => {
    const l = TIER_DEFS.legendary, e = TIER_DEFS.epic;
    expect(l.hpMul - e.hpMul).toBeGreaterThanOrEqual(0.3);
    expect(l.damageMul).toBeGreaterThan(e.damageMul);
    expect(Object.keys(ONE_OF_ONE).map(Number).sort((a, b) => a - b)).toEqual([...ONE_OF_ONE_IDS]);
    expect(new Set(Object.values(ONE_OF_ONE).map((o) => o.color)).size).toBe(10);
    expect(Object.values(ONE_OF_ONE).map((o) => o.name).sort()).toEqual(['Blaze', 'Burning Skully', 'Chog Scream', 'Chogbomination', 'Frogger', 'Grim', 'Halo', 'Krown', 'Midas', 'Redd']);
    for (const r of records.filter((x) => x.traits.Base === '1:1')) expect((r as unknown as { name: string }).name).toContain(ONE_OF_ONE[r.metadataId].name);
    expect(chogName(53)).toBe('Blaze (#53)');
    expect(chogName(812)).toBe('Chog #812');
    for (const sig of Object.values(SIGNATURES)) { expect(sig.telegraph, sig.name).toBeTruthy(); expect(sig.counter, sig.name).toBeTruthy(); }
  });
  it('spawn applies the tier: health, armour, armour cap, ability cooldown', () => {
    const p = powerFor('rare', { focus: 2 });
    const a = createWorld({ hero: 'kettle', power: p }).actors[0];
    const k = HEROES.find((h) => h.id === 'kettle')!;
    expect(a.maxHp).toBe(Math.round(k.maxHp * 1.32));
    expect(a.hp).toBe(a.maxHp);
    expect(a.armor).toBe(k.maxArmor + 18);
    expect(a.maxArmor).toBe(50 + 18);
    expect(a.ability.cooldown).toBeCloseTo(k.ability.cooldown * 0.9, 6);
    expect(createWorld({ hero: 'kettle' }).actors[0].maxHp).toBe(k.maxHp);
  });
});

// Two actors in a hall; returns the world after `ticks` with actor 0 pressing ability once on the first tick.
function arena(sig: keyof typeof SIGNATURES, gap = 2, map = HALL): World {
  return createWorld({
    seed: 1, map, zone: false,
    versus: [
      { name: 'S', hero: 'kettle', team: 'alpha', x: 10, y: 4.5, facing: 0, power: powerFor('legendary', null, SIGNATURES[sig]) },
      { name: 'T', hero: 'kettle', team: 'bravo', x: 10 + gap, y: 4.5, facing: Math.PI },
      { name: 'A', hero: 'kettle', team: 'alpha', x: 10, y: 6, facing: 0 },
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
      { name: 'S', hero: 'kettle', team: 'alpha', x: 10, y: 4.5, facing: 0, power: powerForToken(53, null, false) },
      { name: 'T', hero: 'kettle', team: 'bravo', x: 12, y: 4.5, facing: Math.PI },
    ] });
    run(w, 1, pressOnce);
    expect(w.sounds.find((s) => s.type === 'windup')?.sig).toBe(53);
    const plain = arena(53);
    run(plain, 1, pressOnce);
    expect(plain.sounds.find((s) => s.type === 'windup')?.sig).toBeUndefined(); // no token behind it: generic cue
  });
  it('Hellfire ignores armour', () => {
    const w = arena(392);
    run(w, 70, pressOnce);
    expect(w.actors[1].armor).toBe(25);
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
    const slip = createWorld({ seed: 1, map: HALL, zone: false, versus: [{ name: 'M', hero: 'mop', team: 'alpha', x: 10, y: 4.5, facing: 0 }] });
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
  it('Common beats a fresh free player about 7 in 10 (Kettle, Mop): real, beatable; a 1:1 dominates (over 0.95)', () => {
    for (const hero of ['kettle', 'mop']) {
      const c = mean(hero, powerFor('common'), BASE_POWER);
      expect(c, hero).toBeGreaterThanOrEqual(0.6);
      expect(c, hero).toBeLessThanOrEqual(0.85);
      expect(mean(hero, powerFor('legendary'), BASE_POWER), hero).toBeGreaterThanOrEqual(0.95);
    }
  }, 120000);
  it('the ladder is monotonic (Kettle)', () => {
    const s = TIERS.slice(1).map((t) => mean('kettle', powerFor(t), BASE_POWER));
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThanOrEqual(s[i - 1]);
  }, 120000);
  it('a maxed free player beats a Common holder, is even with Uncommon, and still loses to a 1:1', () => {
    for (const hero of ['kettle', 'mop']) {
      expect(mean(hero, powerFor('free', MAX_U), powerFor('common')), hero).toBeGreaterThanOrEqual(0.6);
      const u = mean(hero, powerFor('free', MAX_U), powerFor('uncommon'));
      expect(u, hero).toBeGreaterThanOrEqual(0.4);
      expect(u, hero).toBeLessThanOrEqual(0.6);
      expect(mean(hero, powerFor('free', MAX_U), powerFor('legendary')), hero).toBeLessThanOrEqual(0.2);
    }
  }, 180000);
  it('no signature dominates a 1:1 with the plain hero ability (mean of 3 and 6 u within 0.3 to 0.85)', () => {
    for (const sig of Object.values(SIGNATURES)) {
      const s = mean('kettle', powerFor('legendary', null, sig), powerFor('legendary'), 12, true);
      expect(s, sig.name).toBeGreaterThanOrEqual(0.3);
      expect(s, sig.name).toBeLessThanOrEqual(0.85);
    }
  }, 240000);
});
