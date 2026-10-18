// CHOG Training (owner 2026-10-18 "CHOG SUPERPOWER SYSTEM"): one drill per superpower, for a verified Chog that carries
// it (or DEMO). Scripted dummies in a small room, the real sim and the power's real rank numbers; only the cooldown is
// shortened so a drill gives enough tries, and the screen says so. Training earns nothing and records nothing.
import type { SuperpowerId } from '../config/superpowers';
import type { Power } from '../config/power';
import { TUNING } from '../config/tuning';
import { IDLE_INPUT, createWorld, type Actor, type ActorInput, type World } from './world';
import { WALL, sightClear, tileAt } from './level';

export interface DrillDef {
  id: SuperpowerId;
  name: string;
  /** What to do, in one line (shown before and during the drill). */
  goal: string;
  seconds: number;
  map: readonly string[];
  player: { x: number; y: number; facing: number };
  dummies: { x: number; y: number; facing: number; hero: string }[];
  /** Cooldown in the drill (the real one is far longer than a drill). */
  cooldown: (real: number, seconds: number) => number;
  /** What a dummy does at drill time t (s). */
  move: (w: World, a: Actor, i: number, t: number) => ActorInput;
}

const ROOM = [
  '##########################',
  '#........................#',
  '#........................#',
  '#...............##.......#',
  '#...............##.......#',
  '#........................#',
  '#........................#',
  '#........................#',
  '#...............##.......#',
  '#...............##.......#',
  '#........................#',
  '#........................#',
  '##########################',
];
const SPLIT = [
  '##########################',
  '#........................#',
  '#........................#',
  '#........................#',
  '#..####################..#',
  '#........................#',
  '#........................#',
  '#........................#',
  '##########################',
];

/** Walk toward (x, y) at full speed, looking at the player; stand when there. */
function walkTo(w: World, a: Actor, x: number, y: number): ActorInput {
  const dx = x - a.x, dy = y - a.y, d = Math.hypot(dx, dy), p = w.actors[0];
  const aim = Math.atan2(p.y - a.y, p.x - a.x);
  return d < 0.15 ? { ...IDLE_INPUT, aim } : { ...IDLE_INPUT, aim, moveX: dx / d, moveY: dy / d };
}
/** A point going back and forth between two ends, once each `period` s, starting at `phase` (0..1). */
const pingPong = (t: number, period: number, phase: number) => { const u = ((t / period + phase) % 1 + 1) % 1; return u < 0.5 ? u * 2 : 2 - u * 2; };

export const DRILLS: Record<SuperpowerId, DrillDef> = {
  laser: {
    id: 'laser', name: 'Burn', seconds: 45, map: ROOM,
    goal: 'Keep the beam on target: one stands, one strafes, one peeks from the pillar.',
    player: { x: 4.5, y: 6.5, facing: 0 },
    dummies: [{ x: 11.5, y: 6.5, facing: Math.PI, hero: 'benja' }, { x: 13.5, y: 3.5, facing: Math.PI, hero: 'tabsu' }, { x: 18.5, y: 4.2, facing: Math.PI, hero: 'benja' }],
    cooldown: () => 3,
    move: (w, a, i, t) => i === 0 ? walkTo(w, a, 11.5, 6.5)
      : i === 1 ? walkTo(w, a, 13.5, 2.5 + 8 * pingPong(t, 4, 0))
        // Out of the pillar's shadow for about a second in every three.
        : walkTo(w, a, 18.5, t % 3 < 1.2 ? 6.4 : 4.2),
  },
  xray: {
    id: 'xray', name: 'Through the wall', seconds: 45, map: SPLIT,
    goal: 'They walk behind the wall. Find them by their steps and burn them through it.',
    player: { x: 12.5, y: 2, facing: Math.PI / 2 },
    dummies: [{ x: 6.5, y: 6.5, facing: 0, hero: 'benja' }, { x: 18.5, y: 6, facing: Math.PI, hero: 'toad' }],
    cooldown: () => 3,
    // Walk, stop, walk again: footsteps carry through the wall, silence means it stopped.
    move: (w, a, i, t) => {
      const span = i === 0 ? [5, 12] : [13, 20];
      const u = (t + i * 2.5) % 7;
      const x = u < 3 ? span[0] + (span[1] - span[0]) * (u / 3) : u < 3.5 ? span[1] : u < 6.5 ? span[1] - (span[1] - span[0]) * ((u - 3.5) / 3) : span[0];
      return walkTo(w, a, x, i === 0 ? 6.5 : 6);
    },
  },
  bubble: {
    id: 'bubble', name: 'Cage runners', seconds: 45, map: ROOM,
    goal: 'They run across your lanes. Lead them: the bubble is slow.',
    player: { x: 3.5, y: 6.5, facing: 0 },
    dummies: [{ x: 9.5, y: 2.5, facing: 0, hero: 'tabsu' }, { x: 12.5, y: 6.5, facing: 0, hero: 'benja' }, { x: 9.5, y: 10.5, facing: 0, hero: 'tabsu' }],
    cooldown: () => 3,
    move: (w, a, i, t) => walkTo(w, a, 8 + 7 * pingPong(t, i === 1 ? 5 : 3.6, i * 0.3), a.y),
  },
  drool: {
    id: 'drool', name: 'Pin them', seconds: 45, map: ROOM,
    goal: 'Glue them to a wall. Only one walking close enough to a wall can be dragged to it.',
    player: { x: 4.5, y: 6.5, facing: 0 },
    dummies: [{ x: 9.5, y: 2.5, facing: 0, hero: 'benja' }, { x: 12.5, y: 6.5, facing: 0, hero: 'toad' }, { x: 9.5, y: 10.5, facing: 0, hero: 'benja' }],
    cooldown: () => 3,
    move: (w, a, i, t) => walkTo(w, a, 8 + 6 * pingPong(t, 6, i * 0.25), i === 0 ? 2.5 : i === 1 ? 6.5 : 10.5),
  },
  aura: {
    id: 'aura', name: 'Hold the line', seconds: 45, map: ROOM,
    goal: 'Two marksmen fire a volley every 5 s (warning 1 s before). Raise the aura to take nothing.',
    player: { x: 5.5, y: 6.5, facing: 0 },
    dummies: [{ x: 21.5, y: 5.5, facing: Math.PI, hero: 'ray' }, { x: 21.5, y: 7.5, facing: Math.PI, hero: 'ray' }],
    // The aura must come back between volleys only if you time it: a little longer than it lasts.
    cooldown: (_real, seconds) => seconds + 4,
    move: (w, a, _i, t) => {
      const p = w.actors[0];
      return { ...IDLE_INPUT, aim: Math.atan2(p.y - a.y, p.x - a.x), firing: volleyOn(t), reload: a.ammo === 0 };
    },
  },
};

/** Aura drill: a volley every 5 s, 1.2 s long; the warning shows 1 s before. */
export const VOLLEY = { every: 5, length: 1.2, warn: 1, first: 3 } as const;
export const volleyOn = (t: number) => t >= VOLLEY.first && (t - VOLLEY.first) % VOLLEY.every < VOLLEY.length;
export const volleyIn = (t: number) => (t < VOLLEY.first ? VOLLEY.first - t : (VOLLEY.every - ((t - VOLLEY.first) % VOLLEY.every)) % VOLLEY.every);

export interface TrainingRun {
  drill: DrillDef;
  t: number;
  done: boolean;
  /** Uses of the power, power hits that landed (beam pulses with damage, cages, glues), damage by the power. */
  uses: number;
  landed: number;
  damage: number;
  /** Laser and X-Ray: beam pulses burnt. X-Ray: hits through a wall. Drool: glued against a wall. */
  pulses: number;
  lastPulse: number;
  lastCharge: number;
  special: number;
  /** Aura drill: volleys fired, volleys you took nothing from, and damage taken. */
  volleys: number;
  blocked: number;
  judged: number;
  taken: number;
  volleyHurt: boolean;
}

/** The drill's world: you (with your power at its real rank, only the cooldown shortened) and the dummies. */
export function createTraining(id: SuperpowerId, power: Power, hero: string): { run: TrainingRun; world: World } {
  const d = DRILLS[id];
  const world = createWorld({
    seed: 1, map: d.map, zone: false,
    versus: [
      { name: 'You', hero, team: 'alpha', x: d.player.x, y: d.player.y, facing: d.player.facing, power },
      ...d.dummies.map((m, i) => ({ name: `Dummy ${i + 1}`, hero: m.hero, team: 'bravo' as const, x: m.x, y: m.y, facing: m.facing })),
    ],
  });
  const me = world.actors[0];
  me.ability = { ...me.ability, cooldown: d.cooldown(me.ability.cooldown, me.ability.seconds ?? 0) };
  // Dummies soak a whole drill; in the aura drill you can take a few volleys too.
  for (const a of world.actors.slice(1)) { a.maxHp = a.hp = 5000; a.armor = 0; }
  if (id === 'aura') { me.maxHp = me.hp = 600; }
  return { world, run: { drill: d, t: 0, done: false, uses: 0, landed: 0, damage: 0, pulses: 0, lastPulse: 0, lastCharge: 0, special: 0, volleys: 0, blocked: 0, judged: 0, taken: 0, volleyHurt: false } };
}

/** Inputs for one step: yours for actor 0, the script for the dummies. */
export function trainingInput(run: TrainingRun, w: World, mine: ActorInput): (a: Actor) => ActorInput {
  return (a) => (a.id === 0 ? mine : run.drill.move(w, a, a.id - 1, run.t));
}

/** After each sim step: count what the power did, and end the drill on time. */
export function stepTraining(run: TrainingRun, w: World, dt: number = TUNING.simStepSeconds): void {
  if (run.done) return;
  const me = w.actors[0];
  const was = volleyOn(run.t);
  run.t += dt;
  for (const s of w.sounds) if (s.sourceId === 0 && (s.type === 'charge' || s.type === 'orb' || s.type === 'aura')) run.uses++;
  // A beam pulse just burnt: the sim raised its pulse timer this step, or the charge ended (the first pulse).
  if (me.beamPulse > run.lastPulse + 1e-9 || (run.lastCharge > 0 && me.chargeLeft === 0)) run.pulses++;
  run.lastPulse = me.beamPulse;
  run.lastCharge = me.chargeLeft;
  for (const h of w.hits) {
    if (h.by === 0 && h.power && h.target !== 0) {
      const t = w.actors[h.target];
      const dmg = h.hpDamage + h.armorDamage;
      if (dmg > 0 || run.drill.id === 'bubble' || run.drill.id === 'drool') run.landed++;
      run.damage += dmg;
      if (run.drill.id === 'xray' && dmg > 0 && !sightClear(w.level, me.x, me.y, t.x, t.y)) run.special++;
      if (run.drill.id === 'drool' && againstWall(w, t.pinX, t.pinY)) run.special++;
    }
    if (h.target === 0 && h.by !== 0) {
      run.taken += h.hpDamage + h.armorDamage;
      if (h.hpDamage + h.armorDamage > 0) run.volleyHurt = true;
    }
  }
  if (run.drill.id === 'aura') {
    const on = volleyOn(run.t);
    if (on && !was) { run.volleys++; run.volleyHurt = false; }
    // Judge each volley 0.6 s after it stops (its last bullets are still in flight when the trigger lets go).
    const ph = run.t - VOLLEY.first;
    if (ph >= 0 && run.judged < run.volleys && ph % VOLLEY.every >= VOLLEY.length + 0.6) { run.judged++; if (!run.volleyHurt) run.blocked++; }
  }
  if (run.t >= run.drill.seconds - 1e-9 || !me.alive) run.done = true;
}

/** A glued spot touching a wall (the goo dragged them all the way). */
export function againstWall(w: World, x: number, y: number): boolean {
  const r = TUNING.movement.radius + 0.08;
  return [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]].some(([dx, dy]) => tileAt(w.level, x + dx, y + dy) === WALL);
}

/** The drill's result in plain lines, with one score number. */
export function trainingSummary(run: TrainingRun): { score: number; lines: string[] } {
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  switch (run.drill.id) {
    case 'laser': return { score: Math.round(run.damage), lines: [`Damage burnt: ${Math.round(run.damage)}`, `Beam on target: ${pct(run.landed, run.pulses)}% of ${run.pulses} pulses`, `Beams fired: ${run.uses}`] };
    case 'xray': return { score: Math.round(run.damage), lines: [`Damage through walls: ${Math.round(run.damage)}`, `Pulses landed through a wall: ${run.special}`, `Beams fired: ${run.uses}`] };
    case 'bubble': return { score: run.landed, lines: [`Caged: ${run.landed} of ${run.uses} bubbles (${pct(run.landed, run.uses)}%)`] };
    case 'drool': return { score: run.special, lines: [`Glued to a wall: ${run.special}`, `Glued in the open: ${run.landed - run.special}`, `Globs spat: ${run.uses}`] };
    case 'aura': return { score: run.blocked, lines: [`Volleys taken clean: ${run.blocked} of ${run.volleys}`, `Damage taken: ${Math.round(run.taken)}`, `Auras raised: ${run.uses}`] };
  }
}

/** HUD line during a drill. */
export function trainingStatus(run: TrainingRun): string {
  const left = Math.max(0, run.drill.seconds - run.t).toFixed(0);
  const s = trainingSummary(run);
  const warn = run.drill.id === 'aura' && !volleyOn(run.t) && volleyIn(run.t) <= VOLLEY.warn ? ` · VOLLEY IN ${volleyIn(run.t).toFixed(1)} s` : run.drill.id === 'aura' && volleyOn(run.t) ? ' · VOLLEY' : '';
  return `Training · ${run.drill.name} · ${left} s · ${s.lines[0]}${warn}`;
}

/** The drill a power can train, or null: only a Chog with a superpower (verified, or DEMO) has one. */
export const drillFor = (power: Power): SuperpowerId | null => power.superpower?.power ?? null;
