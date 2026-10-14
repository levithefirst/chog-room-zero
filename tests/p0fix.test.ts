// P0 bug-fix sprint regressions (ADE QA ids in test names).
import { TUNING } from '../src/config/tuning';
import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, IDLE_INPUT, viewOf, type World } from '../src/sim/world';
import { canSee } from '../src/sim/vision';
import { shotClear, walkable, sightClear } from '../src/sim/level';
import { enemyDrawMode, clampMarker, THREAT_HIT_SECONDS } from '../src/render/visibility';
import { createSummaryGate, SUMMARY_LOCK_MS } from '../src/input/gate';
import { WEAPONS } from '../src/config/weapons';

// Open 24x9 arena; crate column 'c' at x=12. P = player spawn.
const ARENA = [
  '########################',
  '#......................#',
  '#......................#',
  '#...........c..........#',
  '#.P.........c..........#',
  '#...........c..........#',
  '#......................#',
  '#......................#',
  '########################',
];
const bot = (x: number, y: number) => ({ name: 'Dummy', hero: 'kettle', x, y, patrol: [[x, y]] as [number, number][], flanker: false });
function arena(bx: number, by: number): World {
  const w = createWorld({ map: ARENA, bots: [bot(bx, by)], seed: 1 });
  w.actors[0].hp = 1e9;
  return w;
}
function pin(w: World, px: number, py: number, bx: number, by: number) {
  const [p, b] = w.actors;
  p.x = px; p.y = py; p.vx = p.vy = 0; p.hp = 1e9;
  b.x = bx; b.y = by; b.vx = b.vy = 0; b.alive = true; b.hp = 1e9; b.armor = 0;
}

describe('CHOG-VIS-001 enemy visibility', () => {
  it('a bot 3 u ahead in the open is drawn as a body (sim canSee and draw rule agree)', () => {
    const w = arena(7.5, 4.5);
    pin(w, 4.5, 4.5, 7.5, 4.5);
    const p = w.actors[0]; p.facing = 0;
    const v = viewOf(p);
    expect(canSee(w.level, p.x, p.y, 0, v, 7.5, 4.5)).toBe(true);
    expect(enemyDrawMode(w.level, p, v, w.actors[1], { recapKiller: false, threatLeft: 0, pinged: false })).toBe('body');
  });
  it('a bot behind the player is hidden, but drawn (flash) right after it shoots the player', () => {
    const w = arena(2.5, 4.5);
    pin(w, 6.5, 4.5, 2.5, 4.5);
    const p = w.actors[0]; p.facing = 0;
    const v = viewOf(p);
    const a = w.actors[1];
    expect(enemyDrawMode(w.level, p, v, a, { recapKiller: false, threatLeft: 0, pinged: false })).toBe(null);
    expect(enemyDrawMode(w.level, p, v, a, { recapKiller: false, threatLeft: THREAT_HIT_SECONDS, pinged: false })).toBe('flash');
  });
  it('no wallhack: a threat behind a wall is not drawn', () => {
    const map = ARENA.map((r, y) => (y >= 1 && y <= 7 ? r.slice(0, 8) + '#' + r.slice(9) : r));
    const w = createWorld({ map, bots: [bot(4.5, 2.5)], seed: 1 });
    pin(w, 12.5, 4.5, 4.5, 4.5);
    const p = w.actors[0]; p.facing = 0;
    expect(enemyDrawMode(w.level, p, viewOf(p), w.actors[1], { recapKiller: false, threatLeft: 1, pinged: false })).toBe(null);
  });
  it('in real matches, every bot that hits the player is drawable at that moment (body or flash)', () => {
    let hits = 0, drawable = 0, inCone = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const w = createWorld({ seed });
      for (let i = 0; i < 60 * 60; i++) {
        w.actors[0].hp = 1e9;
        stepWorld(w, { ...IDLE_INPUT, moveX: Math.cos(i / 150 + seed), moveY: Math.sin(i / 190 + seed), aim: Math.sin(i / 90) * 2 + seed });
        const p = w.actors[0];
        for (const h of w.hits) {
          if (h.target !== 0) continue;
          hits++;
          // A grenade's visible source is its blast ring, drawn for anyone within radius + 1.5 u (render.ts).
          if (h.grenade) { if (Math.hypot(h.fromX - p.x, h.fromY - p.y) <= TUNING.grenade.radius + 1.5) drawable++; continue; }
          const a = w.actors[h.by];
          const m = enemyDrawMode(w.level, p, viewOf(p), a, { recapKiller: false, threatLeft: THREAT_HIT_SECONDS, pinged: false });
          if (m === 'body') inCone++;
          if (m === 'body' || m === 'flash' || !a.alive) drawable++;
        }
      }
    }
    expect(hits).toBeGreaterThan(100);
    // Before the fix only the in-cone share (~30%) was ever drawn.
    expect(inCone / hits).toBeLessThan(0.6);
    expect(drawable / hits).toBeGreaterThan(0.97);
  });
});

describe('CHOG-HUD-001 markers stay in the map', () => {
  it('jittered markers near every perimeter tile clamp inside the level onto walkable tiles', () => {
    const w = createWorld();
    const l = w.level;
    let rng = 7;
    const r = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
      if (!walkable(l.tiles[y * l.w + x])) continue;
      for (let k = 0; k < 6; k++) {
        const err = 3;
        const m = clampMarker(l, x + 0.5 + r() * err, y + 0.5 + r() * err, x + 0.5, y + 0.5, walkable);
        expect(m.x).toBeGreaterThanOrEqual(0.5); expect(m.x).toBeLessThanOrEqual(l.w - 0.5);
        expect(m.y).toBeGreaterThanOrEqual(0.5); expect(m.y).toBeLessThanOrEqual(l.h - 0.5);
        expect(walkable(l.tiles[Math.floor(m.y) * l.w + Math.floor(m.x)])).toBe(true);
      }
    }
  });
  it('a killer marker outside the map falls back to the killer position', () => {
    const l = createWorld().level;
    const m = clampMarker(l, -4, -4, 3.5, 3.5, () => false);
    expect(m).toEqual({ x: 3.5, y: 3.5 });
  });
});

describe('CHOG-FLOW-001 summary gate', () => {
  it('rapid clicks during and after death cannot skip the summary; a fresh press after the lock can', () => {
    const g = createSummaryGate();
    for (let t = -500; t < 0; t += 30) g.press(t); // spamming through the death freeze
    g.open(0);
    expect(g.canRestart()).toBe(false);
    for (let t = 0; t < SUMMARY_LOCK_MS; t += 25) {
      g.press(t);
      expect(g.canRestart()).toBe(false);
    }
    g.press(SUMMARY_LOCK_MS + 10);
    expect(g.canRestart()).toBe(true);
  });
  it('a button held since before the summary does not restart (needs release + new press)', () => {
    const g = createSummaryGate();
    g.press(-100); // pressed while dying, still held
    g.open(0);
    expect(g.canRestart()).toBe(false);
  });
  it('the gate re-locks for every new summary', () => {
    const g = createSummaryGate();
    g.open(0); g.press(900); expect(g.canRestart()).toBe(true);
    g.open(5000); expect(g.canRestart()).toBe(false);
  });
});

describe('Rifle near/through cover (CHOG-WPN-001/002 investigation)', () => {
  function fire(w: World, px: number, py: number, bx: number, by: number, seconds: number): { shots: number; hits: number } {
    const p = w.actors[0];
    const ang = Math.atan2(by - py, bx - px);
    const s0 = p.shots, h0 = p.hits;
    for (let i = 0; i < seconds * 60; i++) {
      pin(w, px, py, bx, by);
      p.reserve = 999;
      stepWorld(w, { ...IDLE_INPUT, aim: ang, firing: true });
    }
    return { shots: p.shots - s0, hits: p.hits - h0 };
  }
  it('held fire cadence matches fireInterval (1.5 s hold, full mag)', () => {
    const w = arena(20.5, 1.5);
    const r = fire(w, 4.5, 7.5, 20.5, 1.5, 1.5);
    const expected = 1.5 / WEAPONS.rifle.fireInterval;
    expect(r.shots).toBeGreaterThanOrEqual(Math.floor(expected) - 1);
  });
  it('open lane 5 u: rifle hits', () => {
    const w = arena(9.5, 7.5);
    const r = fire(w, 4.5, 7.5, 9.5, 7.5, 1);
    expect(r.hits / r.shots).toBeGreaterThan(0.6);
  });
  it('target hugging half cover, shooter 4-6 u away (beyond the 1.25 u lean): cover blocks by rule', () => {
    for (const d of [4, 5, 6]) {
      const w = arena(13.5, 4.5);
      const sx = 13.5 - d;
      expect(shotClear(w.level, sx, 4.5, 13.5, 4.5)).toBe(false);
      const r = fire(w, sx, 4.5, 13.5, 4.5, 1);
      expect(r.hits).toBe(0);
      // ...while sight is NOT blocked by half cover, so the target is visible: the reported "no damage".
      expect(sightClear(w.level, sx, 4.5, 13.5, 4.5)).toBe(true);
    }
  });
  it('shooter within 1.25 u of the cover shoots over it', () => {
    const w = arena(16.5, 4.5);
    const r = fire(w, 11.2, 4.5, 16.5, 4.5, 1);
    expect(r.hits / r.shots).toBeGreaterThan(0.5);
  });
  it('angled shot past the crate end is not clipped (swept collision is exact)', () => {
    const w = arena(15.5, 1.5);
    // Line from (8.5,6.5) to (15.5,1.5) passes x=12..13 at y≈3.6..2.9, i.e. above/at the crate top edge y=3.
    const clear = shotClear(w.level, 8.5, 7.5, 15.5, 1.5);
    const r = fire(w, 8.5, 7.5, 15.5, 1.5, 1);
    if (clear) expect(r.hits).toBeGreaterThan(0);
    else expect(r.hits).toBe(0);
  });
});
