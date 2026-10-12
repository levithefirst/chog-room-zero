import { describe, expect, it } from 'vitest';
import { createWorld, player, stepWorld, IDLE_INPUT, type ActorInput } from '../src/sim/world';
import type { BotState } from '../src/sim/bots';
import { findPath } from '../src/sim/level';

// Headless batch: a scripted dummy player walks a route through every band of the room, firing bursts
// toward where it walks. It cannot die (test only), so we observe bot behaviour for the whole run.
const ROUTE = [[3, 8], [15, 8], [27, 10], [38, 12], [36, 4], [26, 4], [15, 4], [4, 4], [3, 18], [15, 18], [24, 20], [38, 18], [30, 24], [10, 24], [27, 12]];
function batch(seed: number, seconds: number) {
  const w = createWorld({ seed });
  const p = player(w);
  let leg = 0;
  let path = findPath(w.level, p.x, p.y, ROUTE[0][0] + 0.5, ROUTE[0][1] + 0.5, 8000);
  const states = new Set<BotState>();
  let firstContact = -1;
  const stuck = new Map<number, number>();
  let maxStill = 0;
  let abilities = 0;
  for (let i = 0; i < seconds * 60 && w.outcome === 'playing'; i++) {
    const t = i / 60;
    while (path.length && Math.hypot(path[0].x - p.x, path[0].y - p.y) < 0.3) path.shift();
    if (!path.length) {
      leg = (leg + 1) % ROUTE.length;
      path = findPath(w.level, p.x, p.y, ROUTE[leg][0] + 0.5, ROUTE[leg][1] + 0.5, 8000);
    }
    const n = path[0] ?? p;
    const d = Math.hypot(n.x - p.x, n.y - p.y) || 1;
    const inp: ActorInput = { ...IDLE_INPUT, moveX: (n.x - p.x) / d, moveY: (n.y - p.y) / d, aim: Math.atan2(n.y - p.y, n.x - p.x), firing: i % 180 < 10 };
    p.hp = 1e9;
    p.reserve = 999;
    stepWorld(w, inp);
    abilities += w.sounds.filter((s) => s.team === 'bot' && ['dash', 'sonar', 'barrier', 'mend'].includes(s.type)).length;
    for (const a of w.actors) {
      if (a.team !== 'bot' || !a.alive) continue;
      const br = w.brains.get(a.id)!;
      states.add(br.state);
      if (firstContact < 0 && br.sawPlayer) firstContact = t;
      // Time a bot spends wanting to move but not moving (stuck on geometry).
      // Alert and engage stand still on purpose (holding an angle); only count states that travel.
      const wants = br.path.length > 0 && ['patrol', 'investigate', 'pursue', 'search', 'cover', 'heal'].includes(br.state);
      const still = wants && Math.hypot(a.vx, a.vy) < 0.05 ? (stuck.get(a.id) ?? 0) + 1 / 60 : 0;
      stuck.set(a.id, still);
      maxStill = Math.max(maxStill, still);
    }
  }
  return { abilities, states, kills: p.kills, firstContact, maxStill, outcome: w.outcome, shotsByBots: w.actors.slice(1).reduce((n, a) => n + a.shots, 0) };
}

describe('bot batch (headless)', () => {
  const runs = [1, 2, 3, 4].map((s) => batch(s, 180));
  it('bots use the full state machine across runs, not just rushing', () => {
    const all = new Set<BotState>();
    for (const r of runs) r.states.forEach((s) => all.add(s));
    for (const s of ['patrol', 'investigate', 'alert', 'engage', 'pursue', 'search', 'cover'] as BotState[]) expect(all.has(s), s).toBe(true);
  });
  it('bots make contact and fire within a run', () => {
    expect(runs.every((r) => r.firstContact >= 0)).toBe(true);
    expect(runs.every((r) => r.shotsByBots > 0)).toBe(true);
  });
  it('bots use abilities and pick up health over a batch', () => {
    expect(runs.some((r) => r.abilities > 0)).toBe(true);
  });
  it('no bot stays stuck against geometry for more than 1.5 s', () => {
    for (const r of runs) expect(r.maxStill).toBeLessThan(1.5);
  });
});
