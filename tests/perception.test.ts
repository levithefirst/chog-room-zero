// Bot perception rules (docs/design/bots.md). Deterministic.
import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, IDLE_INPUT, hears, viewOf, type World, type SoundEvent, type HitEvent } from '../src/sim/world';
import { canSee, muzzleFlashSeen } from '../src/sim/vision';
import { TUNING } from '../src/config/tuning';

// 30x11 open hall. A wall stub at x=15 (rows 3..7) for occlusion tests.
const HALL = [
  '##############################',
  '#............................#',
  '#............................#',
  '#..............#.............#',
  '#..............#.............#',
  '#.P............#.............#',
  '#..............#.............#',
  '#..............#.............#',
  '#............................#',
  '#............................#',
  '##############################',
];
const spawn = (x: number, y: number, name = 'B') => ({ name, hero: 'kettle', x, y, patrol: [[x, y]] as [number, number][], flanker: false });
function setup(bots: [number, number][], map = HALL): World {
  const w = createWorld({ map, bots: bots.map(([x, y], i) => spawn(x, y, 'B' + i)), seed: 3, log: true });
  w.actors[0].hp = 1e9;
  return w;
}
function place(w: World, id: number, x: number, y: number, facing?: number) {
  const a = w.actors[id];
  a.x = x; a.y = y; a.vx = a.vy = 0;
  if (facing !== undefined) a.facing = facing;
}
const sources = (w: World, bot = 1) => (w.perceptionLog ?? []).filter((e) => e.bot === bot).map((e) => e.source);
// Pin bot pose every tick so only perception (not movement) is under test.
function run(w: World, ticks: number, inp: (i: number) => typeof IDLE_INPUT, pin?: () => void) {
  for (let i = 0; i < ticks; i++) {
    pin?.();
    stepWorld(w, inp(i));
  }
}

describe('vision', () => {
  it('visible: a bot facing the player in the open sees it (source seen)', () => {
    const w = setup([[8.5, 5.5]]);
    place(w, 0, 3.5, 5.5); place(w, 1, 8.5, 5.5, Math.PI);
    stepWorld(w, IDLE_INPUT);
    expect(w.brains.get(1)!.sawPlayer).toBe(true);
    expect(sources(w)).toContain('seen');
  });
  it('hidden behind a wall: no sight, no belief', () => {
    const w = setup([[20.5, 5.5]]);
    run(w, 60, () => IDLE_INPUT, () => { place(w, 0, 10.5, 5.5); place(w, 1, 20.5, 5.5, Math.PI); });
    expect(w.brains.get(1)!.sawPlayer).toBe(false);
    expect(sources(w)).toEqual([]);
    expect(w.brains.get(1)!.lastKnown).toBeNull();
  });
});

describe('hearing (footsteps by speed)', () => {
  // Bot 6 u from the player, facing away (cannot see). Player moves in place-ish along y.
  const walk = (quiet: boolean, move: boolean) => (i: number) => ({ ...IDLE_INPUT, moveY: move ? (Math.floor(i / 30) % 2 ? 1 : -1) : 0, quiet });
  const hearTest = (quiet: boolean, move: boolean) => {
    const w = setup([[10.5, 5.5]]);
    place(w, 0, 4.5, 5.5);
    run(w, 240, walk(quiet, move), () => { place(w, 1, 10.5, 5.5, 0); w.actors[0].x = 4.5; });
    return sources(w);
  };
  it('running (8 u) is heard at 6 u', () => expect(hearTest(false, true)).toContain('heard'));
  it('creeping (3 u) is not heard at 6 u', () => expect(hearTest(true, true)).not.toContain('heard'));
  it('standing still makes no sound', () => expect(hearTest(false, false)).toEqual([]));
});

describe('gunfire', () => {
  it('muzzle flash in wall line of sight reveals the shooter at long range, outside the cone', () => {
    const w = setup([[26.5, 9.5]]);
    // Bot faces away (east), 23 u away with a clear line below the stub.
    run(w, 1, () => IDLE_INPUT, () => { place(w, 0, 3.5, 9.5); place(w, 1, 26.5, 9.5, 0); });
    run(w, 30, (i) => ({ ...IDLE_INPUT, aim: 0, firing: i < 2 }), () => { place(w, 0, 3.5, 9.5); place(w, 1, 26.5, 9.5, 0); });
    const ev = w.perceptionLog!.find((e) => e.source === 'flash');
    expect(ev).toBeTruthy();
    expect(Math.hypot(ev!.x - 3.5, ev!.y - 9.5)).toBeLessThan(0.01);
  });
  it('occluded gunfire: no flash through a wall; heard position is only an estimate', () => {
    const w = setup([[20.5, 5.5]]);
    run(w, 30, (i) => ({ ...IDLE_INPUT, aim: Math.PI, firing: i < 2 }), () => { place(w, 0, 10.5, 5.5); place(w, 1, 20.5, 5.5, 0); });
    const s = sources(w);
    expect(s).not.toContain('flash');
    expect(s).not.toContain('seen');
    for (const e of w.perceptionLog!) if (e.source === 'heard') expect(e.x === 10.5 && e.y === 5.5).toBe(false);
  });
  it('being shot gives direction-only suspicion (never the exact origin)', () => {
    const w = setup([[12.5, 9.5]]);
    // Player behind the bot (bot faces east); the bot cannot see; we still let the flash rule apply, so
    // remove the flash by checking the 'shot' entries only and their error.
    let got = 0;
    for (let i = 0; i < 240; i++) {
      place(w, 0, 6.5, 9.5); place(w, 1, 12.5, 9.5, 0);
      w.actors[1].hp = 1e9;
      stepWorld(w, { ...IDLE_INPUT, aim: 0, firing: true });
    }
    for (const e of w.perceptionLog!) if (e.source === 'shot') {
      got++;
      const d = Math.hypot(e.x - 6.5, e.y - 9.5);
      expect(d).toBeGreaterThan(0.01);
      const ang = Math.atan2(e.y - e.oy, e.x - e.ox), truth = Math.atan2(9.5 - e.oy, 6.5 - e.ox);
      expect(Math.abs(Math.atan2(Math.sin(ang - truth), Math.cos(ang - truth)))).toBeLessThanOrEqual(TUNING.perception.shotDirErrorDeg * Math.PI / 180 + 1e-6);
    }
    // The flash already gives the exact spot; 'shot' only fires when there is no sight. Either way no omniscience.
    expect(got + sources(w).filter((s) => s === 'flash').length).toBeGreaterThan(0);
  });
});

describe('reaction and aim', () => {
  it('reaction delay is seeded, varies per acquisition and stays in [min, max]', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const w = createWorld({ map: HALL, bots: [spawn(8.5, 5.5)], seed, log: true });
      place(w, 0, 3.5, 5.5); place(w, 1, 8.5, 5.5, Math.PI);
      stepWorld(w, IDLE_INPUT);
      const r = w.brains.get(1)!.reaction;
      expect(r).toBeGreaterThanOrEqual(TUNING.perception.reactionMin);
      expect(r).toBeLessThanOrEqual(TUNING.perception.reactionMax);
      seen.add(Math.round(r * 1000));
    }
    expect(seen.size).toBeGreaterThan(3);
  });
  it('no shot before the reaction delay', () => {
    const w = setup([[9.5, 5.5]]);
    place(w, 0, 3.5, 5.5); place(w, 1, 9.5, 5.5, Math.PI);
    stepWorld(w, IDLE_INPUT);
    const r = w.brains.get(1)!.reaction;
    for (let i = 0; i < Math.floor(r * 60) - 2; i++) { place(w, 0, 3.5, 5.5); stepWorld(w, IDLE_INPUT); }
    expect(w.actors[1].shots).toBe(0);
  });
});

describe('attack tokens', () => {
  it('at most N bots shoot the player at once, the rest flank or hold', () => {
    const w = setup([[10.5, 2.5], [10.5, 4.5], [10.5, 6.5], [10.5, 8.5], [12.5, 5.5]]);
    let maxShooters = 0, ticksWithCap = 0;
    const shotsBefore = () => w.actors.slice(1).map((a) => a.shots);
    for (let i = 0; i < 600; i++) {
      w.actors[0].hp = 1e9; w.actors[0].x = 4.5; w.actors[0].y = 5.5;
      for (const a of w.actors.slice(1)) { a.hp = 1e9; a.reserve = 999; }
      const b = shotsBefore();
      stepWorld(w, IDLE_INPUT);
      const shooters = w.actors.slice(1).filter((a, k) => a.shots > b[k]).length;
      expect(w.attackTokens.length).toBeLessThanOrEqual(TUNING.perception.attackTokens);
      maxShooters = Math.max(maxShooters, shooters);
      if (w.attackTokens.length === TUNING.perception.attackTokens) ticksWithCap++;
    }
    expect(maxShooters).toBeLessThanOrEqual(TUNING.perception.attackTokens);
    expect(ticksWithCap).toBeGreaterThan(0);
  });
});

describe('no omniscience across seeded matches', () => {
  it('every bot acquisition is backed by a valid signal', () => {
    let checked = 0;
    const counts: Record<string, number> = {};
    for (let seed = 1; seed <= 8; seed++) {
      const w = createWorld({ seed, log: true });
      let sounds: SoundEvent[] = [];
      let hits: HitEvent[] = [];
      for (let i = 0; i < 60 * 75; i++) {
        w.actors[0].hp = Math.max(w.actors[0].hp, 50);
        const t = i / 60;
        const before = w.perceptionLog!.length;
        stepWorld(w, { ...IDLE_INPUT, moveX: Math.cos(t * 0.4 + seed), moveY: Math.sin(t * 0.3), aim: t, firing: i % 120 < 10, quiet: i % 400 < 150 });
        for (const e of w.perceptionLog!.slice(before)) {
          const bot = w.actors[e.bot];
          checked++;
          counts[e.source] = (counts[e.source] ?? 0) + 1;
          switch (e.source) {
            case 'seen':
              expect(canSee(w.level, e.ox, e.oy, e.ofacing, viewOf(bot), e.px, e.py)).toBe(true);
              expect(Math.hypot(e.x - e.px, e.y - e.py)).toBeLessThan(1e-9);
              break;
            case 'flash':
              expect(sounds.some((s) => s.team === 'player' && s.type === 'shot' && s.x === e.x && s.y === e.y && muzzleFlashSeen(w.level, e.ox, e.oy, s.x, s.y))).toBe(true);
              break;
            case 'heard':
              expect(sounds.some((s) => s.team === 'player' && hears(w.level, e.ox, e.oy, s))).toBe(true);
              break;
            case 'shot':
              expect(hits.some((h) => h.target === e.bot)).toBe(true);
              break;
            case 'sonar':
              expect(bot.hero.ability.kind).toBe('sonar');
              expect(Math.hypot(e.px - e.ox, e.py - e.oy)).toBeLessThanOrEqual(TUNING.abilities.sonarRadius + 1e-9);
              break;
          }
        }
        sounds = w.sounds;
        hits = w.hits;
        if (w.outcome !== 'playing') break;
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(counts.seen).toBeGreaterThan(0);
    expect(counts.heard).toBeGreaterThan(0);
  // RC-2 (ADE rc1-code-check): explicit timeout. 8 seeds x 75 s of full sim (36k steps) with a line-of-sight check per acquisition
  // is deterministic and CPU-bound: 3.8 s on an idle box, 6.2-6.6 s on a loaded one, which tripped the 5 s default. Coverage unchanged.
  }, 30000);
});
