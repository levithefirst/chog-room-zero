// CHOG Training (owner 2026-10-18): one scored drill per superpower on the real sim, with the power's real rank numbers
// (only the cooldown shortened). A scripted player that uses the power well scores; one that does nothing does not.
import { describe, expect, it } from 'vitest';
import { BASE_POWER, powerForToken, type Power } from '../src/config/power';
import { SUPERPOWERS, SUPERPOWER_IDS, superAbility, type SuperpowerId } from '../src/config/superpowers';
import { IDLE_INPUT, stepWorld, visorTracks, type ActorInput, type World } from '../src/sim/world';
import { findPath, sightClear } from '../src/sim/level';
import { DRILLS, VOLLEY, createTraining, drillFor, stepTraining, trainingInput, trainingSummary, volleyIn, type TrainingRun } from '../src/sim/training';

const demo = (id: SuperpowerId): Power => ({ ...BASE_POWER, tier: 'common', demo: true, superpower: superAbility(id, 'common') });

function play(id: SuperpowerId, pilot: (w: World, run: TrainingRun) => Partial<ActorInput>): { run: TrainingRun; world: World } {
  const { run, world } = createTraining(id, demo(id), 'benja');
  while (!run.done) {
    stepWorld(world, trainingInput(run, world, { ...IDLE_INPUT, aim: world.actors[0].facing, ...pilot(world, run) }));
    stepTraining(run, world);
  }
  return { run, world };
}
/** Aim at the nearest dummy (true position: a test pilot, not a player) and use the power whenever it is ready. */
const sharp = (lead = 0) => (w: World) => {
  const me = w.actors[0];
  const live = w.actors.slice(1).filter((a) => a.alive);
  const t = live.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
  if (!t) return {};
  // Use the power once the target is inside its reach (a beam fired at nothing wastes the cooldown).
  const inReach = Math.hypot(t.x - me.x, t.y - me.y) <= (me.ability.radius ?? 99);
  return { aim: Math.atan2(t.y + t.vy * lead - me.y, t.x + t.vx * lead - me.x), ability: me.abilityCd === 0 && inReach };
};

describe('CHOG Training drills', () => {
  it('there is one drill per power, and only a Chog with a power has one', () => {
    expect(Object.keys(DRILLS).sort()).toEqual([...SUPERPOWER_IDS].sort());
    expect(drillFor(BASE_POWER)).toBeNull();
    expect(drillFor(powerForToken(36, null, false))).toBe('laser');
  });
  it('the drill plays the power at its real rank; only the cooldown is shortened', () => {
    const { world } = createTraining('bubble', demo('bubble'), 'benja');
    const ab = world.actors[0].ability;
    expect(ab.seconds).toBe(SUPERPOWERS.bubble.ranks.common.seconds);
    expect(ab.radius).toBe(SUPERPOWERS.bubble.ranks.common.range);
    expect(ab.cooldown).toBeLessThan(SUPERPOWERS.bubble.ranks.common.cooldown);
  });
  it('doing nothing scores nothing', () => {
    for (const id of SUPERPOWER_IDS) expect(trainingSummary(play(id, () => ({})).run).score, id).toBe(0);
  });
  it('Laser ("destroy 5 moving targets before they reach you"): the beam only, a steady aim destroys most of them', () => {
    const { run, world } = play('laser', sharp());
    expect(world.actors[0].ammo + world.actors[0].reserve).toBe(0); // the gun is empty: the beam does it
    expect(run.destroyed).toBeGreaterThanOrEqual(3);
    expect(run.destroyed + run.reached).toBeLessThanOrEqual(5);
    expect(run.landed).toBeLessThanOrEqual(run.pulses);
    const idle = play('laser', () => ({})).run;
    expect(idle.destroyed).toBe(0);
    expect(idle.reached).toBe(5); // nobody stops them
  });
  it('Hunter (Visor): the tracker leads to targets you cannot see; walking to them and shooting takes them down', () => {
    const { run, world } = play('visor', (w) => {
      const me = w.actors[0];
      const seen = visorTracks(w, me);
      expect(seen.length).toBeGreaterThan(0); // the whole small map is inside a Common tracker
      const t = seen.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
      const path = findPath(w.level, me.x, me.y, t.x, t.y);
      const n = path[0] ?? t;
      const d = Math.hypot(n.x - me.x, n.y - me.y) || 1;
      const clear = sightClear(w.level, me.x, me.y, t.x, t.y) && Math.hypot(t.x - me.x, t.y - me.y) < 7;
      return { aim: Math.atan2(t.y - me.y, t.x - me.x), firing: clear, reload: me.ammo === 0, moveX: clear ? 0 : (n.x - me.x) / d, moveY: clear ? 0 : (n.y - me.y) / d };
    });
    expect(world.actors[0].ability.kind).toBe('visor');
    expect(run.destroyed).toBeGreaterThanOrEqual(2);
  });
  it('X-Ray: hits land through the wall on dummies the player cannot see', () => {
    const { run } = play('xray', sharp());
    expect(run.special).toBeGreaterThan(5);
  });
  it('Bubble: leading the runners cages them', () => {
    expect(play('bubble', sharp(0.8)).run.landed).toBeGreaterThan(2);
  });
  it('Drool: the dummies walking by a wall get glued to it', () => {
    expect(play('drool', sharp(0.3)).run.special).toBeGreaterThan(1);
  });
  it('Aura: raised just before each volley, the volleys do nothing; never raised, every volley hurts', () => {
    const timed = play('aura', (w, run) => ({ ability: w.actors[0].auraLeft === 0 && w.actors[0].abilityCd === 0 && volleyIn(run.t) < 0.3 }));
    expect(timed.run.volleys).toBeGreaterThan(5);
    expect(timed.run.blocked).toBeGreaterThan(1);
    const idle = play('aura', () => ({})).run;
    expect(idle.blocked).toBe(0);
    expect(idle.taken).toBeGreaterThan(0);
    expect(VOLLEY.every).toBeGreaterThan(VOLLEY.length);
  });
});
