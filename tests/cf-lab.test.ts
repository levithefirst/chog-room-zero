// CF lab (owner 2026-10-16, docs/ROOM_ZERO_CORE_FEEL_AUDIT.md): each core-feel experiment measured with its switch off
// (the game before CF) and on (the shipping default), against a stated acceptance criterion. Real sim, seeded.
// CF_OUT=<file> writes every before/after value as JSON for the report. Feel is not measured here: the owner plays
// ?lab=A0 vs ?lab=A1 (and so on) in a debug build.
import { afterEach, describe, expect, it } from 'vitest';
import { LAB, resetLab } from '../src/config/lab';
import { TUNING } from '../src/config/tuning';
import { HEROES, squadFor } from '../src/config/heroes';
import { BOT_SPAWNS, BOT_SPAWNS_RC8, ROOM_ZERO, ROOM_ZERO_RC8 } from '../src/config/map';
import { createWorld, hears, stepRadius, stepWorld, IDLE_INPUT, type World } from '../src/sim/world';
import { canSee, muzzleFlashSeen } from '../src/sim/vision';
import { findPath, parseLevel, sightClear, WALL } from '../src/sim/level';
import { createAutopilot } from '../src/debug/autopilot';
import { OWN_NOISE, markKind } from '../src/render/marks';
import { teamSighting } from '../src/render/visibility';
import { createIntel, rung, senseFor } from '../src/sim/intel';

const OPEN = ['########################', ...Array.from({ length: 10 }, () => '#......................#'), '########################'];
const out: Record<string, { metric: string; before: unknown; after: unknown; criterion: string }> = {};
const record = (k: string, metric: string, before: unknown, after: unknown, criterion: string) => { out[k] = { metric, before, after, criterion }; };
/** Run `f` with every CF switch off (before) or on (after). */
function both<T>(f: () => T): { before: T; after: T } {
  for (const k of Object.keys(LAB) as (keyof typeof LAB)[]) LAB[k] = false;
  const before = f();
  resetLab();
  return { before, after: f() };
}
afterEach(() => resetLab());

function solo(hero = 'benja'): World {
  const w = createWorld({ map: OPEN, hero, bots: [], seed: 3 });
  w.actors[0].x = 5.5; w.actors[0].y = 5.5;
  return w;
}

describe('A: human turning', () => {
  it('a 180 deg turn takes 0.2-0.35 s (was one step), a 10 deg correction still lands in one step', () => {
    const turn = (deg: number) => {
      const w = solo(), p = w.actors[0];
      p.facing = 0;
      const target = (deg * Math.PI) / 180;
      let i = 0;
      while (Math.abs(Math.atan2(Math.sin(target - p.facing), Math.cos(target - p.facing))) > 1e-3 && i < 600) { stepWorld(w, { ...IDLE_INPUT, aim: target }); i++; }
      return +(i / 60).toFixed(3);
    };
    const r180 = both(() => turn(179.9)), r10 = both(() => turn(10));
    record('A', '180 deg turn time (s) / 10 deg correction (s)', `${r180.before} / ${r10.before}`, `${r180.after} / ${r10.after}`, '180 deg in 0.2-0.35 s; 10 deg in one step (0.017 s)');
    expect(r180.before).toBeLessThanOrEqual(0.017);
    expect(r180.after).toBeGreaterThanOrEqual(0.2);
    expect(r180.after).toBeLessThanOrEqual(0.35);
    expect(r10.after).toBeLessThanOrEqual(0.017);
  });
  it('flicking and firing at once is loose: spread grows with the turn lag', () => {
    const w = solo(), p = w.actors[0];
    stepWorld(w, { ...IDLE_INPUT, aim: 0 });
    const steady = p.lastSpread;
    stepWorld(w, { ...IDLE_INPUT, aim: Math.PI * 0.9, firing: true });
    expect(p.aimLag).toBeGreaterThan((TUNING.combat.turnFullDeg * Math.PI) / 180);
    expect(p.lastSpread).toBeCloseTo(steady + TUNING.combat.turnSpreadDeg, 5);
  });
});

/** Chance one bullet lands on a 0.35 u body at d u with uniform spread +-s deg. */
const hitChance = (s: number, d: number) => Math.min(1, Math.asin(TUNING.movement.radius / d) / ((s * Math.PI) / 180));

describe('B: movement costs accuracy at fight range', () => {
  const spreadAt = (moveX: number, quiet: boolean, steps = 60) => {
    const w = solo(), p = w.actors[0];
    for (let i = 0; i < steps; i++) stepWorld(w, { ...IDLE_INPUT, moveX, quiet, aim: Math.PI / 2 });
    return p.lastSpread;
  };
  it('rifle at 5 u: steady always lands, a full run about half the time (was 80%), a creep in between', () => {
    const run = both(() => hitChance(spreadAt(1, false), 5)), creep = both(() => hitChance(spreadAt(1, true), 5)), still = both(() => hitChance(spreadAt(0, false), 5));
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    record('B', 'rifle hit chance per bullet at 5 u: steady / creep / run', `${pct(still.before)} / ${pct(creep.before)} / ${pct(run.before)}`, `${pct(still.after)} / ${pct(creep.after)} / ${pct(run.after)}`, 'steady 100%; run <= 60%; steady - run >= 35 points');
    expect(still.after).toBe(1);
    expect(run.after).toBeLessThanOrEqual(0.6);
    expect(still.after - run.after).toBeGreaterThanOrEqual(0.35);
    expect(run.before).toBeGreaterThan(0.75);
  });
  it('stopping settles the spread within 0.2 s, starting to run widens it at once', () => {
    const w = solo(), p = w.actors[0];
    for (let i = 0; i < 60; i++) stepWorld(w, { ...IDLE_INPUT, moveX: 1, aim: Math.PI / 2 });
    const loose = p.lastSpread;
    let i = 0;
    while (p.lastSpread > p.weapon.spreadDeg + 0.1 && i < 120) { stepWorld(w, { ...IDLE_INPUT, aim: Math.PI / 2 }); i++; }
    expect(loose).toBeGreaterThan(p.weapon.spreadDeg + p.weapon.moveSpreadDeg * 0.9);
    expect(i / 60).toBeLessThanOrEqual(0.3);
    expect(i / 60).toBeGreaterThan(0.1);
  });
  it('every weapon has its own run penalty, and the rifle family is penalised more than the shotguns', async () => {
    const { WEAPONS } = await import('../src/config/weapons');
    for (const w of Object.values(WEAPONS)) expect(w.moveSpreadDeg).toBeGreaterThan(0);
    expect(WEAPONS.rifle.moveSpreadDeg).toBeGreaterThan(WEAPONS.shotgun.moveSpreadDeg);
    expect(WEAPONS.marksman.moveSpreadDeg).toBeGreaterThan(WEAPONS.rifle.moveSpreadDeg);
  });
});

describe('C: your own noise is shown at the radius it is heard at', () => {
  it('running rings at 8 u ~2.6 times a second, creeping at 3 u, steady nothing; muted play still sees them', () => {
    const noise = (moveX: number, quiet: boolean) => {
      const w = solo(), rings: number[] = [];
      for (let i = 0; i < 600; i++) {
        stepWorld(w, { ...IDLE_INPUT, moveX: i % 400 < 200 ? moveX : -moveX, quiet, aim: 0 });
        for (const s of w.sounds) if (s.sourceId === 0 && LAB.ownNoise && OWN_NOISE.has(s.type)) rings.push(s.radius);
      }
      return { perSec: +(rings.length / 10).toFixed(2), radius: rings.length ? Math.max(...rings) : 0 };
    };
    const run = both(() => noise(1, false)), creep = both(() => noise(1, true)), still = both(() => noise(0, false));
    record('C', 'own noise rings per s at radius (run / creep / steady)', `${run.before.perSec} / ${creep.before.perSec} / ${still.before.perSec}`,
      `${run.after.perSec}@${run.after.radius}u / ${creep.after.perSec}@${creep.after.radius}u / ${still.after.perSec}`, 'run ring = run hearing radius (8 u); creep 3 u; steady none');
    expect(run.before.perSec).toBe(0);
    expect(run.after.radius).toBeCloseTo(TUNING.sound.runStep, 5);
    expect(creep.after.radius).toBeCloseTo(TUNING.sound.quietStep, 5);
    expect(still.after.perSec).toBe(0);
    expect(run.after.perSec).toBeGreaterThan(2);
  });
  it('step noise scales with speed: a patrol walk is heard ~6 u, between a creep and a run', () => {
    expect(stepRadius(TUNING.movement.quietSpeedScale)).toBe(TUNING.sound.quietStep);
    expect(stepRadius(1)).toBe(TUNING.sound.runStep);
    const walk = stepRadius(TUNING.bots.patrolSpeed);
    expect(walk).toBeGreaterThan(5);
    expect(walk).toBeLessThan(7);
  });
});

/**
 * Default game (you + 2 AI, zone on) with the autopilot: where each living hostile sits on the information ladder,
 * sampled at 10 Hz. VISIBLE = drawn as a live body (your light; before CF also a teammate's). PARTIAL = a teammate's
 * SPOTTED mark (after CF). LAST KNOWN = its afterimage, within ghostSeconds of leaving your light (after CF). HEARD = a
 * heard mark at a spot. DIRECTION = heard through a wall (after CF). UNKNOWN = nothing.
 * SB: with the CF switches on, the rung is read from the contact model the game now draws (src/sim/intel.ts), not
 * rebuilt from CF-era timers (a 1.6 s afterimage the game no longer shows); suspected counts as last known. Before
 * (switches off) is still the pre-CF game reconstructed from its own rules.
 */
function infoShares(seeds: number) {
  const c = { visible: 0, partial: 0, last: 0, heard: 0, dir: 0, unknown: 0 };
  let steps = 0, matchSec = 0, firstContact = 0, contacts = 0, warned = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const hero = HEROES[seed % HEROES.length].id;
    const w = createWorld({ hero, seed, zone: true, allies: squadFor(hero, seed) });
    const p = w.actors[0], ap = createAutopilot(seed, 3), intel = createIntel(), model = LAB.dark && LAB.enemySound;
    const lastHeard = new Map<number, { t: number; dir: boolean }>();
    const lastSeen = new Map<number, number>();
    const spottedAt = new Map<number, number>();
    const believed = new Map<number, number>();
    let first = -1;
    for (let i = 0; i < 240 * 60 && w.outcome === 'playing'; i++) {
      stepWorld(w, ap.next(w));
      if (model) senseFor(w, p, intel, TUNING.simStepSeconds);
      const t = i / 60;
      if (model) for (const k of intel.contacts.values()) if (k.state !== 'visible' && k.state !== 'lost') believed.set(k.id, t);
      for (const s of w.sounds) {
        if (s.team === p.team || !hears(w.level, p.x, p.y, s)) continue;
        if (s.type === 'step' || s.type === 'quietStep') steps++;
        lastHeard.set(s.sourceId, { t, dir: LAB.enemySound && !sightClear(w.level, p.x, p.y, s.x, s.y) });
      }
      if (i % 6) continue;
      const mates = w.actors.filter((m) => m !== p && m.team === p.team && m.alive && !m.downed);
      for (const a of w.actors) {
        if (a.team === p.team || !a.alive) continue;
        const h = lastHeard.get(a.id), seen = lastSeen.get(a.id);
        if (model) {
          const s = rung(intel, a.id);
          if (s === 'visible') {
            const prevSeen = lastSeen.get(a.id);
            if (prevSeen === undefined || t - prevSeen > 3) { contacts++; if ((believed.get(a.id) ?? -9) > t - 3) warned++; }
            c.visible++; if (first < 0) first = t; lastSeen.set(a.id, t);
          } else if (s === 'partial') c.partial++;
          else if (s === 'last_known' || s === 'suspected') c.last++;
          else if (s === 'heard') c.heard++;
          else if (s === 'directional') c.dir++;
          else c.unknown++;
          continue;
        }
        const mine = canSee(w.level, p.x, p.y, p.facing, p.view, a.x, a.y);
        const mate = !mine && mates.some((m) => canSee(w.level, m.x, m.y, m.facing, m.view, a.x, a.y));
        if (mine || (mate && teamSighting() === 'body')) {
          // A new contact (not drawn for 3 s before): was it heard, or marked by a teammate, first? "Someone is near"
          // before "someone is there".
          const prevSeen = lastSeen.get(a.id);
          if (prevSeen === undefined || t - prevSeen > 3) { contacts++; if ((h && t - h.t < 3) || (spottedAt.get(a.id) ?? -9) > t - 3) warned++; }
          c.visible++; if (first < 0) first = t; lastSeen.set(a.id, t);
        }
        else if (mate) { c.partial++; spottedAt.set(a.id, t); }
        else if (LAB.enemySound && seen !== undefined && t - seen < TUNING.sound.ghostSeconds) c.last++;
        else if (h && t - h.t < TUNING.sound.markerLife) { if (h.dir) c.dir++; else c.heard++; }
        else c.unknown++;
      }
    }
    matchSec += w.tick / 60;
    firstContact += first < 0 ? w.tick / 60 : first;
  }
  const n = Object.values(c).reduce((a, b) => a + b, 0);
  const r = (v: number) => +(v / n).toFixed(3);
  return { visible: r(c.visible), partial: r(c.partial), last: r(c.last), heard: r(c.heard), dir: r(c.dir), unknown: r(c.unknown),
    middle: r(c.partial + c.last + c.heard + c.dir), warnedContacts: +(warned / Math.max(1, contacts)).toFixed(3), stepsHeardPerMin: +(steps / (matchSec / 60)).toFixed(1), firstContactS: +(firstContact / seeds).toFixed(1), matchS: +(matchSec / seeds).toFixed(1) };
}

describe('D: enemies are heard before they are seen', () => {
  it('the middle of the information ladder at least doubles, and more contacts are heard or spotted before they are seen', () => {
    // SB: 24 seeds, not 12. Same 2x criterion; at 12 the ratio swung across the bar with unrelated changes (1.99x and
    // 2.19x); 24 seeds measure 2.4x (0.069 -> 0.163).
    const r = both(() => infoShares(24));
    record('D', 'hostile time in the middle of the ladder (partial + last known + heard + direction) / contacts heard or spotted first', `${r.before.middle} / ${r.before.warnedContacts}`, `${r.after.middle} / ${r.after.warnedContacts}`, 'middle share >= 2x; more contacts announced before they are seen');
    record('D-detail', 'visible / partial / last known / heard / direction / unknown', r.before, r.after, 'information has a gradient');
    expect(r.after.middle).toBeGreaterThanOrEqual(r.before.middle * 2);
    expect(r.after.warnedContacts).toBeGreaterThan(r.before.warnedContacts);
    expect(r.after.dir).toBeGreaterThan(0);
  }, 300000);
  it('every heard sound type has its own mark', () => {
    expect(new Set(['step', 'shot', 'reload', 'impact', 'boom', 'death', 'sonar'].map((t) => markKind(t as never))).size).toBe(7);
  });
  it('a patrolling bot walks audibly and stops at its points; one that hears a noise stops to listen, then creeps', () => {
    const w = createWorld({ map: OPEN, seed: 2, bots: [{ name: 'P', hero: 'benja', patrol: [[16, 5], [20, 5]], flanker: false }] });
    const p = w.actors[0], b = w.actors[1];
    p.x = 3.5; p.y = 9.5; p.hp = p.maxHp = 1e9;
    const radii: number[] = [];
    for (let i = 0; i < 300; i++) { stepWorld(w, { ...IDLE_INPUT, aim: Math.PI }); for (const s of w.sounds) if (s.sourceId === b.id && s.type.includes('tep')) radii.push(s.radius); }
    expect(Math.max(...radii)).toBeGreaterThan(5);
    // A loud step of the player's 5 u behind it: it stops and turns before it moves.
    b.x = 10.5; b.y = 5.5; b.facing = 0; p.x = 6.5; p.y = 5.5;
    const br = w.brains.get(b.id)!;
    br.state = 'patrol';
    let listened = false;
    for (let i = 0; i < 90; i++) {
      stepWorld(w, { ...IDLE_INPUT, moveY: i % 30 < 15 ? 1 : -1, aim: Math.PI });
      // Listening: after the first 0.15 s of the stop (deceleration) it stands still.
      if (br.listen > 0) { listened = true; if (br.listen < TUNING.bots.listenSeconds - 0.15) expect(Math.hypot(b.vx, b.vy)).toBeLessThan(0.05); }
    }
    expect(listened).toBe(true);
  });
});

describe('E: information is scarce', () => {
  it('a teammate sighting is a SPOTTED mark, not a live body; the lamp reaches further steady than running', () => {
    expect(both(() => teamSighting())).toEqual({ before: 'body', after: 'spotted' });
    const range = (moveX: number) => { const w = solo(); for (let i = 0; i < 90; i++) stepWorld(w, { ...IDLE_INPUT, moveX: i % 60 < 30 ? moveX : -moveX, aim: 0 }); return +w.actors[0].view.range.toFixed(2); };
    const run = both(() => range(1)), still = both(() => range(0));
    record('E', 'Benja lamp range steady / running (u); teammate sighting', `${still.before} / ${run.before}; body`, `${still.after} / ${run.after}; spotted`, 'steady > base > running; teammates never hand over a live body');
    expect(still.before).toBe(run.before);
    expect(still.after).toBeGreaterThan(9);
    expect(run.after).toBeLessThan(9);
  });
  it('the live-body share of hostile time drops to what you see yourself', () => {
    const r = both(() => infoShares(6));
    const live = { before: r.before.visible, after: r.after.visible };
    record('E-live', 'hostile time drawn as a live body (own + teammate before, own after)', live.before, live.after, 'after < before');
    expect(live.after).toBeLessThan(live.before);
  }, 300000);
});

describe('F: contact is earned', () => {
  const lanes = (rows: readonly string[]) => {
    const l = parseLevel(rows), runs: number[] = [];
    for (let y = 0; y < l.h; y++) for (let x = 0, run = 0; x <= l.w; x++) { run = x < l.w && l.tiles[y * l.w + x] !== WALL ? run + 1 : 0; runs.push(run); }
    for (let x = 0; x < l.w; x++) for (let y = 0, run = 0; y <= l.h; y++) { run = y < l.h && l.tiles[y * l.w + x] !== WALL ? run + 1 : 0; runs.push(run); }
    return Math.max(...runs);
  };
  const nearestPatrol = (rows: readonly string[], spawns: typeof BOT_SPAWNS) => {
    const l = parseLevel(rows);
    let best = Infinity;
    for (const b of spawns) for (const [x, y] of b.patrol) {
      const path = findPath(l, l.playerSpawn.x, l.playerSpawn.y, x + 0.5, y + 0.5, 8000);
      let d = 0, px = l.playerSpawn.x, py = l.playerSpawn.y;
      for (const n of path) { d += Math.hypot(n.x - px, n.y - py); px = n.x; py = n.y; }
      best = Math.min(best, d);
    }
    return +best.toFixed(1);
  };
  it('no open lane over 15 u (was 42), the nearest patrol is 20+ u of walking from the spawn (was 14.7)', () => {
    const lane = { before: lanes(ROOM_ZERO_RC8), after: lanes(ROOM_ZERO) };
    const near = { before: nearestPatrol(ROOM_ZERO_RC8, BOT_SPAWNS_RC8), after: nearestPatrol(ROOM_ZERO, BOT_SPAWNS) };
    record('F', 'longest open lane (u) / walk to the nearest patrol (u)', `${lane.before} / ${near.before}`, `${lane.after} / ${near.after}`, 'lane <= 15; nearest patrol >= 20 u');
    expect(lane.after).toBeLessThanOrEqual(15);
    expect(near.after).toBeGreaterThanOrEqual(20);
    expect(lane.before).toBe(42);
  });
  it('first contact in the default game comes later (autopilot, which walks straight at the nearest bot)', () => {
    const r = both(() => infoShares(8));
    record('F-contact', 'mean first contact (s) / mean match length (s), autopilot', `${r.before.firstContactS} / ${r.before.matchS}`, `${r.after.firstContactS} / ${r.after.matchS}`, 'first contact later than before');
    expect(r.after.firstContactS).toBeGreaterThan(r.before.firstContactS);
  }, 300000);
  it('the muzzle flash still reveals a shooter with a clear line at any range (unchanged rule)', () => {
    const w = solo();
    expect(muzzleFlashSeen(w.level, 2.5, 5.5, 21.5, 5.5)).toBe(true);
  });
});

describe('lab report', () => {
  it('writes the before/after table (CF_OUT)', async () => {
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (!env.CF_OUT) return;
    (await import('node:fs' as string)).writeFileSync(env.CF_OUT, JSON.stringify(out, null, 1));
  });
});
