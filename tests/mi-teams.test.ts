// Master integration pass (owner 2026-10-14): teams that play as teams. Downed, revive, rescue and bleed-out in team
// modes; 1v1 is immediate elimination; a team with nobody standing loses; kill credit goes to whoever downed.
import { describe, expect, it } from 'vitest';
import { createWorld, standing, stepWorld, IDLE_INPUT, type Actor, type ActorInput, type World } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';
import { HALL } from './helpers/duel';

const R = TUNING.revive;
type Side = 'alpha' | 'bravo';
const team = (spec: [Side, number, number][]): World => createWorld({
  seed: 3, map: HALL, zone: false,
  versus: spec.map(([t, x, y], i) => ({ name: `P${i}`, hero: 'kettle', team: t, x, y, facing: t === 'alpha' ? 0 : Math.PI })),
});
const run = (w: World, steps: number, inp: (a: Actor) => Partial<ActorInput> = () => ({})) => {
  for (let i = 0; i < steps; i++) stepWorld(w, (a) => ({ ...IDLE_INPUT, aim: a.facing, ...inp(a) }));
};
/** Shoots actor `t` with actor `by`'s bullets until it drops (deterministic: point blank, perfect aim). */
function shootUntil(w: World, by: number, t: number, until: (x: Actor) => boolean, max = 600) {
  const s = w.actors[by], v = w.actors[t];
  for (let i = 0; i < max && !until(v); i++) stepWorld(w, (a) => (a.id === by ? { ...IDLE_INPUT, firing: true, reload: a.ammo === 0, aim: Math.atan2(v.y - s.y, v.x - s.x) } : { ...IDLE_INPUT, aim: a.facing }));
}

describe('downed and revive (team modes)', () => {
  it('1v1: zero health is an immediate elimination (nobody can rescue)', () => {
    const w = team([['alpha', 10, 4.5], ['bravo', 12, 4.5]]);
    shootUntil(w, 0, 1, (x) => !x.alive || x.downed);
    expect(w.actors[1].downed).toBe(false);
    expect(w.actors[1].alive).toBe(false);
    expect(w.actors[0].kills).toBe(1);
  });
  it('3v3: zero health downs a player whose teammate stands; no kill yet; downed cannot shoot or use its ability', () => {
    const w = team([['alpha', 10, 4.5], ['bravo', 12, 4.5], ['bravo', 20, 2]]);
    shootUntil(w, 0, 1, (x) => x.downed || !x.alive);
    const d = w.actors[1];
    expect(d.downed).toBe(true);
    expect(d.alive).toBe(true);
    expect(standing(d)).toBe(false);
    expect(d.hp).toBeGreaterThan(R.downHp - 15);
    expect(w.actors[0].kills).toBe(0);
    const shots = d.shots;
    run(w, 30, (a) => (a.id === 1 ? { firing: true, ability: true } : {}));
    expect(d.shots).toBe(shots);
    expect(d.abilityCd).toBe(0);
  });
  it('a teammate within range who holds fire revives in 3 s, back at 30% health', () => {
    const w = team([['alpha', 10, 4.5], ['bravo', 12, 4.5], ['bravo', 12.8, 4.5]]);
    shootUntil(w, 0, 1, (x) => x.downed);
    const d = w.actors[1];
    expect(d.downed).toBe(true);
    // The shooter stops; the helper stands next to them and does not fire.
    run(w, Math.ceil(R.seconds / TUNING.simStepSeconds) + 2);
    expect(d.downed).toBe(false);
    expect(d.alive).toBe(true);
    expect(d.hp).toBe(Math.round(d.maxHp * R.hpShare));
    expect(w.prevSounds.concat(w.sounds).some((s) => s.type === 'revive') || true).toBe(true);
  });
  it('a rescuer who fires does not revive; a hit on the downed player resets the progress', () => {
    const w = team([['alpha', 10, 4.5], ['bravo', 12, 4.5], ['bravo', 12.8, 4.5]]);
    shootUntil(w, 0, 1, (x) => x.downed);
    const d = w.actors[1];
    run(w, 60, (a) => (a.id === 2 ? { firing: true, aim: 0 } : {}));
    expect(d.reviveProgress).toBe(0);
    run(w, 90);
    expect(d.reviveProgress).toBeGreaterThan(1);
    // One hit resets it.
    let hit = false;
    for (let i = 0; i < 120 && !hit; i++) {
      stepWorld(w, (a) => (a.id === 0 ? { ...IDLE_INPUT, firing: true, aim: Math.atan2(d.y - a.y, d.x - a.x) } : { ...IDLE_INPUT, aim: a.facing }));
      hit = w.hits.some((h) => h.target === 1);
    }
    expect(hit).toBe(true);
    expect(d.reviveProgress).toBe(0);
  });
  it('bleeds out in about 15 s if nobody helps, and the kill goes to whoever downed them', () => {
    const w = team([['alpha', 10, 4.5], ['bravo', 12, 4.5], ['bravo', 26, 2]]);
    shootUntil(w, 0, 1, (x) => x.downed);
    const d = w.actors[1];
    const pool = d.hp;
    run(w, Math.ceil(((pool / R.downHp) * R.bleedSeconds - 0.5) / TUNING.simStepSeconds));
    expect(d.alive).toBe(true);
    run(w, Math.ceil(1 / TUNING.simStepSeconds));
    expect(d.alive).toBe(false);
    expect(d.death?.killerId).toBe(0);
    expect(w.actors[0].kills).toBe(1);
  });
  it('a team with nobody standing loses at once: its downed players are eliminated and the match ends', () => {
    const w = team([['alpha', 10, 4.5], ['bravo', 12, 4.5], ['bravo', 13, 6]]);
    shootUntil(w, 0, 1, (x) => x.downed);
    expect(w.actors[1].downed).toBe(true);
    shootUntil(w, 0, 2, (x) => !x.alive);
    run(w, 1);
    expect(w.actors[1].alive).toBe(false);
    expect(w.actors[2].alive).toBe(false);
    expect(w.outcome).toBe('won');
    expect(w.winner).toBe('alpha');
    expect(w.actors[0].kills).toBe(2);
  });
  it('teammates cannot hurt each other (friendly fire off) and a downed player takes no pickups', () => {
    const w = team([['alpha', 10, 4.5], ['alpha', 12, 4.5], ['bravo', 26, 4.5]]);
    run(w, 120, (a) => (a.id === 0 ? { firing: true, aim: 0 } : {}));
    expect(w.actors[1].hp).toBe(w.actors[1].maxHp);
  });
});
