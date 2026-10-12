// RC-1 fairness rule: a bot may only damage the player from within the player's effective sight distance
// (hero vision incl. sidegrade) with wall line of sight. 10 seeded long-range Wick encounters, risky setups.
import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, playerSightRange, IDLE_INPUT, type ActorInput } from '../src/sim/world';
import { SIDEGRADES } from '../src/sim/operators';

const HALL = ['##############################', '#............................#', '#............................#', '#............................#', '#P...........................#', '#............................#', '#............................#', '#............................#', '##############################'];
const WALLED = HALL.map((r, i) => (i > 0 && i < 8 ? r.slice(0, 14) + '#' + r.slice(15) : r));
const wick = (x: number, y: number) => ({ name: 'W', hero: 'wick', patrol: [[x, y]] as [number, number][], flanker: false });

interface Enc { seed: number; hero: string; dist: number; mode: 'still' | 'backpedal' | 'strafe'; sg?: number }
const ENCOUNTERS: Enc[] = [
  { seed: 1, hero: 'brick', dist: 12, mode: 'still' },
  { seed: 2, hero: 'brick', dist: 10, mode: 'backpedal' },
  { seed: 3, hero: 'brick', dist: 9, mode: 'strafe' },
  { seed: 4, hero: 'mop', dist: 11, mode: 'still' },
  { seed: 5, hero: 'mop', dist: 8.5, mode: 'strafe' },
  { seed: 6, hero: 'kettle', dist: 12, mode: 'backpedal' },
  { seed: 7, hero: 'kettle', dist: 10, mode: 'still' },
  { seed: 8, hero: 'brick', dist: 8, mode: 'still', sg: 1 }, // Wide sidegrade: 0.83x range (6.2 m)
  { seed: 9, hero: 'wick', dist: 12, mode: 'strafe' },
  { seed: 10, hero: 'mop', dist: 12, mode: 'backpedal', sg: 0 }, // Lamp sidegrade: 1.22x range
];

function run(e: Enc, map = HALL, seconds = 14) {
  const w = createWorld({ map, hero: e.hero, sidegrade: e.sg === undefined ? undefined : SIDEGRADES[e.sg], seed: e.seed, bots: [wick(Math.floor(1.5 + e.dist), 4)] });
  const p = w.actors[0];
  const R = playerSightRange(w);
  const out = { R, beyond: 0, within: 0, hits: [] as { d: number; fromX: number; fromY: number }[] };
  for (let i = 0; i < seconds * 60 && w.outcome === 'playing'; i++) {
    const t = i / 60;
    const inp: ActorInput = { ...IDLE_INPUT, aim: Math.PI }; // facing away from the bot: the riskiest case
    if (e.mode === 'backpedal') inp.moveX = p.x > 1.8 ? -1 : 0;
    if (e.mode === 'strafe') inp.moveY = Math.floor(t / 0.6) % 2 ? 1 : -1;
    stepWorld(w, inp);
    for (const h of w.hits) if (h.target === 0) {
      const d = Math.hypot(h.fromX - h.x, h.fromY - h.y);
      out.hits.push({ d, fromX: h.fromX, fromY: h.fromY });
      if (d > R + 0.4) out.beyond++; else out.within++;
    }
  }
  return out;
}

describe('RC-1 fairness: no damage from beyond the player\'s sight', () => {
  for (const e of ENCOUNTERS) {
    it(`seed ${e.seed}: Wick bot at ${e.dist} m vs ${e.hero}${e.sg !== undefined ? ` (${SIDEGRADES[e.sg].name})` : ''}, ${e.mode}`, () => {
      const r = run(e);
      expect(r.beyond).toBe(0);
      // Attack-direction feedback: every hit carries the shooter's origin (drives the damage arc + reveal).
      for (const h of r.hits) expect(Number.isFinite(h.fromX) && Number.isFinite(h.fromY)).toBe(true);
    });
  }
  it('the bot still engages: it closes in and lands hits within range in most encounters', () => {
    const engaged = ENCOUNTERS.filter((e) => run(e).within > 0).length;
    expect(engaged).toBeGreaterThanOrEqual(5);
  });
  it('walls still block: a wall between player and bot means zero damage', () => {
    for (const e of ENCOUNTERS.slice(0, 5)) expect(run({ ...e, dist: 18 }, WALLED, 8).hits.length).toBe(0);
  });
  it('a bullet from beyond the sight range is capped even if fired (projectile cap)', () => {
    const w = createWorld({ map: HALL, hero: 'brick', seed: 1, bots: [wick(20, 4)] });
    const p = w.actors[0];
    const ox = p.x + 10;
    w.bullets.push({ x: p.x + 1, y: p.y, ox, oy: p.y, dx: -1, dy: 0, life: 1, owner: 1, weapon: w.actors[1].weapon, alive: true });
    const hp = p.hp + p.armor;
    for (let i = 0; i < 10; i++) stepWorld(w, IDLE_INPUT);
    expect(p.hp + p.armor).toBe(hp);
  });
});
