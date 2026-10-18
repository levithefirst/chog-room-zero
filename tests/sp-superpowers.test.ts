// CHOG superpowers (owner 2026-10-18 "CHOG SUPERPOWER SYSTEM", docs/design/superpowers.md): the trait table against the
// verified catalogue, who gets a power (only a verified Chog whose real traits carry it, or DEMO), rank scaling without
// stat inflation, and each power's effect, cooldown, duration and counterplay in the real sim.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASE_POWER, TIERS, TIER_DEFS, powerFor, powerForToken, tierOfMetadataId, type Power } from '../src/config/power';
import { ONE_OF_ONE_IDS } from '../src/nft/tier-table';
import { POWER_TRAITS } from '../src/nft/power-table';
import { BEAM, RANKS, SUPERPOWERS, SUPERPOWER_IDS, pickPower, powersOf, superAbility, type Rank, type SuperpowerId } from '../src/config/superpowers';
import { HEROES } from '../src/config/heroes';
import { createWorld, stepWorld, IDLE_INPUT, revealed, wallSpot, type ActorInput, type World } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';
import { HALL } from './helpers/duel';

const records = (JSON.parse(readFileSync(new URL('../data/chog-genesis/catalogue.json', import.meta.url), 'utf8')) as {
  records: { metadataId: number; traits: Record<string, string> }[];
}).records;

/** What the catalogue says a token carries, straight from its traits (independent of the generated table). */
const fromTraits = (traits: Record<string, string>): SuperpowerId[] =>
  SUPERPOWER_IDS.filter((p) => POWER_TRAITS.some((f) => f.power === p && traits[f.category] !== undefined && ((f.values as readonly string[])[0] === '*' || (f.values as readonly string[]).includes(traits[f.category]))));

/** First token in the catalogue that carries exactly these powers at this tier, or undefined. */
const tokenWith = (powers: SuperpowerId[], tier?: string) => records.find((r) => {
  const p = powersOf(r.metadataId);
  return p.length === powers.length && powers.every((x) => p.includes(x)) && (!tier || tierOfMetadataId(r.metadataId) === tier);
})?.metadataId;

describe('trait -> power table matches the verified catalogue', () => {
  it('every token, both ways', () => {
    expect(records.length).toBe(1969);
    for (const r of records) expect(powersOf(r.metadataId), `#${r.metadataId}`).toEqual(fromTraits(r.traits));
  });
  it('counts per power and rarity (the mapping table in docs/design/superpowers.md)', () => {
    const count: Record<string, Record<string, number>> = {};
    for (const r of records) for (const p of powersOf(r.metadataId)) {
      count[p] ??= {};
      const t = tierOfMetadataId(r.metadataId)!;
      count[p][t] = (count[p][t] ?? 0) + 1;
    }
    expect(count.laser).toEqual({ common: 194, uncommon: 68, rare: 15, epic: 1 });
    expect(count.xray).toEqual({ common: 157 });
    expect(count.bubble).toEqual({ common: 112, uncommon: 56 });
    expect(count.drool).toEqual({ common: 116, uncommon: 68 });
    expect(count.aura).toEqual({ common: 605, uncommon: 279, rare: 60, epic: 30 });
    expect(records.filter((r) => powersOf(r.metadataId).length === 0).length).toBe(618);
    // The ten 1:1s carry no power trait: they keep their signatures.
    for (const id of ONE_OF_ONE_IDS) expect(powersOf(id)).toEqual([]);
  });
  it('out-of-range ids carry nothing', () => {
    for (const bad of [0, -3, 1970, 2.5, NaN, null, undefined]) expect(powersOf(bad as number)).toEqual([]);
  });
});

describe('who gets a power', () => {
  const laserC = tokenWith(['laser'], 'common')!;
  const both = tokenWith(['laser', 'aura'], 'common')!;
  const none = tokenWith([], 'common')!;
  it('a verified Chog gets the power its real traits carry, ranked by its own tier', () => {
    const p = powerForToken(laserC, null, false);
    expect(p.superpower?.kind).toBe('laser');
    expect(p.superpower?.rank).toBe('common');
    const epic = tokenWith(['aura'], 'epic')!;
    expect(powerForToken(epic, null, false).superpower).toMatchObject({ kind: 'aura', rank: 'epic', seconds: SUPERPOWERS.aura.ranks.epic.seconds });
  });
  it('the holder picks among the token\'s own powers; anything else falls back to its first', () => {
    expect(powerForToken(both, null, false, 'aura').superpower?.kind).toBe('aura');
    expect(powerForToken(both, null, false, 'laser').superpower?.kind).toBe('laser');
    expect(powerForToken(both, null, false, 'bubble').superpower?.kind).toBe('laser');
    expect(powerForToken(both, null, false, 'nonsense').superpower?.kind).toBe('laser');
    expect(pickPower(laserC, 'aura')).toBe('laser');
  });
  it('free players never get one: no token, NFT power off (tier free), or a token without a power trait', () => {
    expect(BASE_POWER.superpower).toBeNull();
    expect(powerFor('free').superpower).toBeNull();
    // NFT power off: the server grants tier 'free' even for a verified token.
    expect(powerFor('free', null, null, false, laserC, 'laser').superpower).toBeNull();
    expect(powerForToken(none, null, false).superpower).toBeNull();
    // A tier without a token id cannot invent one.
    expect(powerFor('rare', null, null, false, null, 'laser').superpower).toBeNull();
    const w = createWorld({ hero: 'benja' });
    expect(w.actors[0].ability.kind).toBe(HEROES[0].ability.kind);
  });
  it('a 1:1 keeps its signature and never gets a superpower', () => {
    for (const id of ONE_OF_ONE_IDS) {
      const p = powerForToken(id, null, false);
      expect(p.signature).not.toBeNull();
      expect(p.superpower).toBeNull();
    }
  });
  it('the power takes the single ability slot (the hero ability is traded away)', () => {
    const w = createWorld({ hero: 'tonashiro', power: powerForToken(laserC, null, false) });
    expect(w.actors[0].ability.kind).toBe('laser');
    expect(w.actors[0].ability.name).toBe('Laser Eyes');
  });
});

describe('rank scaling: rarer is stronger, never more health or damage', () => {
  it('every tier starts at base stats (rule 6: no rarity health/damage inflation)', () => {
    for (const t of TIERS) expect([TIER_DEFS[t].hpMul, TIER_DEFS[t].armor, TIER_DEFS[t].damageMul], t).toEqual([1, 0, 1]);
    const k = HEROES.find((h) => h.id === 'benja')!;
    for (const id of [tokenWith(['aura'], 'epic')!, tokenWith(['laser'], 'rare')!, ONE_OF_ONE_IDS[0]]) {
      const a = createWorld({ hero: 'benja', power: powerForToken(id, null, false) }).actors[0];
      expect([a.maxHp, a.armor, a.power.damageMul]).toEqual([k.maxHp, k.maxArmor, 1]);
    }
  });
  it('each rank is at least as good as the one below on every number and better on one; beam damage per second is flat', () => {
    for (const id of SUPERPOWER_IDS) {
      for (let i = 1; i < RANKS.length; i++) {
        const a = SUPERPOWERS[id].ranks[RANKS[i - 1]], b = SUPERPOWERS[id].ranks[RANKS[i]];
        expect(b.seconds, id).toBeGreaterThanOrEqual(a.seconds);
        expect(b.range, id).toBeGreaterThanOrEqual(a.range);
        expect(b.area, id).toBeGreaterThanOrEqual(a.area);
        expect(b.dps, id).toBe(a.dps);
        expect(b.charge, id).toBe(a.charge);
        if (id !== 'aura') expect(b.cooldown, id).toBeLessThanOrEqual(a.cooldown);
        else expect(b.cooldown - b.seconds, id).toBe(a.cooldown - a.seconds); // 45 s without it at every rank
        expect(b.seconds > a.seconds || b.range > a.range || b.area > a.area || b.cooldown < a.cooldown, id).toBe(true);
      }
    }
  });
  it('Aura scales heavily (owner: Uncommon 10 s, Legendary 30 s)', () => {
    expect(SUPERPOWERS.aura.ranks.uncommon.seconds).toBe(10);
    expect(SUPERPOWERS.aura.ranks.legendary.seconds).toBe(30);
  });
  it('every power has a telegraph and a counter written next to it', () => {
    for (const id of SUPERPOWER_IDS) {
      const ab = superAbility(id, 'common');
      expect(ab.telegraph!.length, id).toBeGreaterThan(20);
      expect(ab.counter!.length, id).toBeGreaterThan(20);
    }
  });
});

// ---- the sim ----
const demo = (id: SuperpowerId, rank: Rank = 'common'): Power => ({ ...BASE_POWER, tier: rank, demo: true, superpower: superAbility(id, rank) });
const WALLED = ['##############################', ...Array.from({ length: 7 }, () => '#..........#.................#'), '##############################'];
/** Actor 0 holds the power at (10, y0) facing +x; actor 1 is a hostile `gap` u away; actor 2 an ally beside 0. */
function arena(id: SuperpowerId, gap = 4, opts: { rank?: Rank; map?: readonly string[]; y1?: number; ally?: boolean; targetPower?: Power } = {}): World {
  return createWorld({
    seed: 1, map: opts.map ?? HALL, zone: false,
    versus: [
      { name: 'S', hero: 'benja', team: 'alpha', x: 10, y: 4.5, facing: 0, power: demo(id, opts.rank) },
      { name: 'T', hero: 'benja', team: 'bravo', x: 10 + gap, y: opts.y1 ?? 4.5, facing: Math.PI, power: opts.targetPower },
      ...(opts.ally === false ? [] : [{ name: 'A', hero: 'benja', team: 'alpha' as const, x: 9, y: 6.5, facing: 0 }]),
    ],
  });
}
const STEP = TUNING.simStepSeconds;
const run = (w: World, ticks: number, input: (id: number, tick: number) => Partial<ActorInput> = () => ({})) => {
  for (let i = 0; i < ticks; i++) stepWorld(w, (a) => ({ ...IDLE_INPUT, aim: a.id === 0 ? Math.atan2(w.actors[1].y - a.y, w.actors[1].x - a.x) : a.facing, ...input(a.id, i) }));
};
const press = (id: number, t: number) => (id === 0 && t === 0 ? { ability: true } : {});
const health = (w: World, i: number) => w.actors[i].hp + w.actors[i].armor;
const secs = (s: number) => Math.round(s / STEP);

describe('Laser Eyes', () => {
  const L = SUPERPOWERS.laser.ranks.common;
  it('charges first (no damage), then burns the first body in its line', () => {
    const w = arena('laser');
    const full = health(w, 1);
    run(w, secs(L.charge) - 2, press);
    expect(w.actors[0].chargeLeft).toBeGreaterThan(0);
    expect(health(w, 1)).toBe(full);
    run(w, secs(L.seconds) + 4);
    const dealt = full - health(w, 1);
    // dps x beam seconds, give or take one pulse.
    expect(dealt).toBeGreaterThan(L.dps * (L.seconds - 0.15));
    expect(dealt).toBeLessThan(L.dps * (L.seconds + 0.15));
    expect(w.actors[2].hp).toBe(w.actors[2].maxHp);
    expect(w.actors[0].abilityCd).toBeGreaterThan(L.cooldown - L.charge - L.seconds - 0.2);
  });
  it('walls stop it; it passes allies never', () => {
    const w = arena('laser', 3, { map: WALLED });
    const full = health(w, 1);
    run(w, secs(2), press);
    expect(health(w, 1)).toBe(full);
  });
  it('counter: a target strafing across it up close takes far less than one standing still', () => {
    const still = arena('laser', 3, { ally: false });
    const s0 = health(still, 1);
    run(still, secs(1.5), press);
    const strafe = arena('laser', 3, { ally: false });
    const f0 = health(strafe, 1);
    // The shooter keeps aiming straight ahead; the target walks off the line during the charge.
    run(strafe, secs(1.5), (id, t) => (id === 0 ? { ability: t === 0, aim: 0 } : id === 1 ? { moveY: 1 } : {}));
    expect(f0 - health(strafe, 1)).toBeLessThan((s0 - health(still, 1)) * 0.5);
  });
  it('the beam turns at a capped rate and slows its owner', () => {
    const w = arena('laser', 4, { ally: false });
    run(w, 1, press);
    run(w, 6, (id) => (id === 0 ? { aim: Math.PI / 2 } : {}));
    expect(w.actors[0].beamAng).toBeLessThanOrEqual(7 * STEP * BEAM.turnDegPerSec * Math.PI / 180 + 1e-9);
    const free = arena('bubble', 4, { ally: false });
    run(w, 30, (id) => (id === 0 ? { moveY: 1 } : {}));
    run(free, 30, (id) => (id === 0 ? { moveY: 1 } : {}));
    expect(w.actors[0].y - 4.5).toBeLessThan((free.actors[0].y - 4.5) * 0.8);
  });
  it('higher rank: longer reach', () => {
    const at = (rank: Rank) => { const w = arena('laser', 11.5, { rank, ally: false }); const f = health(w, 1); run(w, secs(2), press); return f - health(w, 1); };
    expect(at('common')).toBe(0);
    expect(at('epic')).toBeGreaterThan(30);
  });
});

describe('X-Ray Eyes', () => {
  const X = SUPERPOWERS.xray.ranks.common;
  it('goes through walls, after a longer charge than the laser', () => {
    expect(X.charge).toBeGreaterThan(SUPERPOWERS.laser.ranks.common.charge);
    const w = arena('xray', 3, { map: WALLED, ally: false });
    const full = health(w, 1);
    run(w, secs(X.charge) - 2, press);
    expect(health(w, 1)).toBe(full);
    run(w, secs(X.seconds) + 6);
    expect(full - health(w, 1)).toBeGreaterThan(X.dps * (X.seconds - 0.15));
  });
  it('is not vision: it reveals nobody behind the wall', () => {
    const w = arena('xray', 3, { map: WALLED, ally: false });
    run(w, secs(1.2), press);
    expect(revealed(w, w.actors[0])).toEqual([]);
    expect(w.actors[0].revealLeft).toBe(0);
  });
  it('counter: stepping off the line during the long charge avoids it entirely', () => {
    const w = arena('xray', 3, { map: WALLED, ally: false });
    const full = health(w, 1);
    run(w, secs(1.6), (id, t) => (id === 0 ? { ability: t === 0, aim: 0 } : id === 1 ? { moveY: 1 } : {}));
    expect(health(w, 1)).toBe(full);
  });
});

describe('Bubble', () => {
  const B = SUPERPOWERS.bubble.ranks.common;
  it('a slow glob: nothing at once, then the hostile is caged and cannot leave, but can still shoot', () => {
    const w = arena('bubble', 4);
    run(w, 3, press);
    expect(w.orbs.length).toBe(1);
    expect(w.actors[1].trapLeft).toBe(0);
    run(w, secs(1));
    const t = w.actors[1];
    expect(t.trapLeft).toBeGreaterThan(0);
    const cx = t.trapX, cy = t.trapY;
    run(w, secs(1.5), (id) => (id === 1 ? { moveX: 1, firing: true, aim: Math.PI } : {}));
    expect(Math.hypot(t.x - cx, t.y - cy)).toBeLessThanOrEqual(B.area - TUNING.movement.radius + 1e-6);
    expect(t.shots).toBeGreaterThan(0);
    expect(t.hp).toBe(t.maxHp); // no damage on its own
  });
  it('the cage lasts its rank\'s seconds; rarer gum holds longer', () => {
    const caged = (rank: Rank) => { const w = arena('bubble', 2, { rank, ally: false }); run(w, secs(0.6), press); return w.actors[1].trapLeft; };
    expect(caged('common')).toBeLessThanOrEqual(B.seconds);
    expect(caged('legendary')).toBeGreaterThan(caged('common') + 2);
    const w = arena('bubble', 2, { ally: false });
    run(w, secs(0.6), press);
    run(w, secs(B.seconds + 0.1), (id) => (id === 1 ? { moveX: 1 } : {}));
    expect(w.actors[1].trapLeft).toBe(0);
    expect(w.actors[1].x).toBeGreaterThan(12 + B.area);
  });
  it('counter: it is slow enough to sidestep at range; walls stop it', () => {
    const w = arena('bubble', 8, { ally: false });
    run(w, secs(2), (id, t) => (id === 0 ? { ability: t === 0, aim: 0 } : id === 1 ? { moveY: 1 } : {}));
    expect(w.actors[1].trapLeft).toBe(0);
    const walled = arena('bubble', 3, { map: WALLED, ally: false });
    run(walled, secs(2), press);
    expect(walled.actors[1].trapLeft).toBe(0);
  });
});

describe('Drool Web', () => {
  const D = SUPERPOWERS.drool.ranks.common;
  it('drags the hostile to the nearest wall and glues it there: no walking, still shooting, no damage', () => {
    // Target 1.6 u below the top wall face (y = 1): the wall is within Common reach.
    const w = arena('drool', 4, { y1: 2.6, ally: false });
    run(w, secs(0.5), press);
    const t = w.actors[1];
    expect(t.pinLeft).toBeGreaterThan(0);
    run(w, secs(0.4), (id) => (id === 1 ? { moveX: 1, firing: true, aim: Math.PI } : {}));
    expect(t.y).toBeCloseTo(1 + TUNING.movement.radius, 1);
    const x = t.x;
    run(w, secs(D.seconds - 0.6), (id) => (id === 1 ? { moveX: 1, moveY: 1, firing: true } : {}));
    expect(t.x).toBeCloseTo(x, 6);
    expect(t.shots).toBeGreaterThan(0);
    expect(t.hp).toBe(t.maxHp);
    run(w, secs(1), (id) => (id === 1 ? { moveY: 1 } : {}));
    expect(t.pinLeft).toBe(0);
    expect(t.y).toBeGreaterThan(1.5);
  });
  it('no wall within reach: glued where it stands; rarer goo reaches further', () => {
    const spot = wallSpot(createWorld({ map: HALL, zone: false, versus: [] }).level, 14, 4.5, D.area);
    expect(spot).toEqual({ x: 14, y: 4.5, d: 0 });
    const far = wallSpot(createWorld({ map: HALL, zone: false, versus: [] }).level, 14, 4.5, SUPERPOWERS.drool.ranks.legendary.area);
    expect(far.d).toBeGreaterThan(2);
  });
});

describe('Aura', () => {
  const A = SUPERPOWERS.aura.ranks.common;
  it('bullets, blasts and beams do nothing; it cannot shoot or throw', () => {
    const w = arena('aura', 3, { ally: false });
    run(w, secs(3), (id, t) => (id === 0 ? { ability: t === 0, firing: true, grenade: t === 30 } : id === 1 ? { firing: true, aim: Math.PI } : {}));
    expect(w.actors[0].hp).toBe(w.actors[0].maxHp);
    expect(w.actors[0].shots).toBe(0);
    expect(w.actors[0].thrown).toBe(0);
    const beam = arena('laser', 3, { ally: false, targetPower: demo('aura') });
    const full = health(beam, 1);
    run(beam, secs(2), (id, t) => (t === 0 ? { ability: true } : id === 1 ? {} : {}));
    expect(health(beam, 1)).toBe(full);
  });
  it('lasts its rank\'s seconds, then the holder fights normally; a fresh press drops it early', () => {
    const w = arena('aura', 3, { ally: false });
    run(w, secs(A.seconds) + 2, press);
    expect(w.actors[0].auraLeft).toBe(0);
    run(w, 30, (id) => (id === 0 ? { firing: true } : {}));
    expect(w.actors[0].shots).toBeGreaterThan(0);
    const c = arena('aura', 3, { ally: false });
    run(c, 10, press);
    expect(c.actors[0].auraLeft).toBeGreaterThan(0);
    run(c, 2, (id, t) => (id === 0 && t === 1 ? { ability: true } : {}));
    expect(c.actors[0].auraLeft).toBe(0);
    expect(c.actors[0].abilityCd).toBeGreaterThan(A.cooldown - 1);
  });
  it('the zone still hurts it, and its steps are never quiet', () => {
    const w = arena('aura', 3, { ally: false });
    run(w, 1, press);
    w.zone = { plan: [{ x: 100, y: 100, r: 1 }], cfg: { ...TUNING.zone } } as unknown as World['zone'];
    // Force the zone to bite: any circle that excludes the arena does, once its damage starts.
    const before = w.actors[0].hp;
    w.tick = 60 * 600;
    run(w, 30);
    expect(w.actors[0].hp).toBeLessThan(before);
    const q = arena('aura', 3, { ally: false });
    run(q, 1, press);
    let loudest = 0;
    for (let i = 0; i < 90; i++) { stepWorld(q, (a) => ({ ...IDLE_INPUT, aim: 0, quiet: a.id === 0, moveY: a.id === 0 ? 1 : 0 })); for (const s of q.sounds) if (s.sourceId === 0 && (s.type === 'step' || s.type === 'quietStep')) loudest = Math.max(loudest, s.radius); }
    expect(loudest).toBe(TUNING.sound.runStep);
  });
});

describe('cooldowns and determinism', () => {
  it('a power cannot be used again until its cooldown runs out', () => {
    for (const id of ['laser', 'bubble', 'drool'] as const) {
      const w = arena(id, 6, { ally: false });
      run(w, 1, press);
      const cd = SUPERPOWERS[id].ranks.common.cooldown;
      expect(w.actors[0].abilityCd, id).toBe(cd);
      run(w, secs(3), (i) => (i === 0 ? { ability: true } : {}));
      expect(w.actors[0].abilityCd, id).toBeGreaterThan(cd - 3.1);
      const sounds = w.sounds.filter((s) => s.type === 'orb' || s.type === 'charge');
      expect(sounds.length, id).toBe(0);
    }
  });
  it('the same inputs give the same match, power for power (what the server runs is what every client replays)', () => {
    const play = () => {
      const w = createWorld({ seed: 7, map: HALL, zone: false, versus: SUPERPOWER_IDS.map((id, i) => ({ name: id, hero: 'benja', team: (i % 2 ? 'bravo' : 'alpha') as 'alpha' | 'bravo', x: 6 + i * 4, y: 2.5 + (i % 3) * 2, facing: i % 2 ? Math.PI : 0, power: demo(id, RANKS[i]) })) });
      for (let t = 0; t < 600; t++) stepWorld(w, (a) => ({ ...IDLE_INPUT, aim: a.team === 'alpha' ? 0 : Math.PI, firing: t % 50 < 20, ability: t % 97 === a.id * 7, moveY: Math.sin(t / 30 + a.id) }));
      return JSON.stringify(w.actors.map((a) => [a.x, a.y, a.hp, a.armor, a.trapLeft, a.pinLeft, a.auraLeft, a.beamLeft])) + JSON.stringify(w.orbs);
    };
    expect(play()).toBe(play());
  });
});
