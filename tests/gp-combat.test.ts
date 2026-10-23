// GP gameplay reality pass (owner 2026-10-17): stationary 360 fire, no phantom health loss, no unexplained slow or
// freeze on a hit. Root causes and fixes: docs/ROOM_ZERO_GAMEPLAY_REALITY.md.
import { describe, expect, it } from 'vitest';
import { createWorld, player, stepWorld, IDLE_INPUT, type ActorInput, type World } from '../src/sim/world';
import { HEROES, squadFor } from '../src/config/heroes';
import { TUNING } from '../src/config/tuning';
import { leadTarget, stepCamera, createCamera } from '../src/render/camera';
import { Lobby } from '../server/room';
import type { ServerMsg } from '../src/net/protocol';
import { PROTOCOL } from '../src/net/protocol';

const DEG = Math.PI / 180;
const STEP = TUNING.simStepSeconds;
const OPEN = ['##############################', ...Array.from({ length: 16 }, () => '#............................#'), '##############################'];
const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const inp = (o: Partial<ActorInput>): ActorInput => ({ ...IDLE_INPUT, ...o });

/** Every bullet the player fires over `steps` while holding `o`, as [step, direction]. */
function fire(w: World, o: Partial<ActorInput>, steps: number) {
  const out: [number, number][] = [];
  const seen = new Set<object>();
  const p = player(w);
  for (let i = 0; i < steps; i++) {
    stepWorld(w, inp(o));
    if (p.ammo === 0) { p.ammo = p.weapon.magazine; p.reloadLeft = 0; }
    for (const b of w.bullets) if (b.owner === 0 && !seen.has(b)) { seen.add(b); out.push([i, Math.atan2(b.dy, b.dx)]); }
  }
  return out;
}

describe('stationary 360 fire (sim)', () => {
  const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315, 359];
  for (const h of HEROES) {
    it(`${h.name}: standing still, every one of 9 angles fires along the aim (within the weapon's spread)`, () => {
      for (const deg of ANGLES) {
        const w = createWorld({ map: OPEN, hero: h.id, bots: [] });
        const p = player(w);
        p.x = 15; p.y = 8.5;
        const shots = fire(w, { aim: deg * DEG, firing: true }, 60);
        expect(shots.length, `${deg} deg`).toBeGreaterThan(0);
        expect(Math.hypot(p.vx, p.vy)).toBe(0);
        // Every round leaves within the turn allowance (40 deg) plus the weapon's own fan.
        for (const [, d] of shots) expect(angDiff(d, deg * DEG) / DEG, `${h.name} ${deg}`).toBeLessThanOrEqual(TUNING.combat.fireMaxLagDeg + p.weapon.spreadDeg * 2 + TUNING.combat.turnSpreadDeg + 1);
        // Once turned, rounds go where you aim.
        for (const [i, d] of shots) if (i >= 20) expect(angDiff(d, deg * DEG) / DEG).toBeLessThanOrEqual(p.weapon.spreadDeg * 2 + 1);
      }
    });
  }
  it('a 180 flick never fires backwards: the first round waits for the turn (at most 0.3 s) and goes the new way', () => {
    for (const h of HEROES) {
      const w = createWorld({ map: OPEN, hero: h.id, bots: [] });
      const p = player(w);
      p.x = 15; p.y = 8.5; p.facing = 0;
      const shots = fire(w, { aim: Math.PI, firing: true }, 40);
      expect(shots.length).toBeGreaterThan(0);
      expect(shots[0][0] * STEP).toBeLessThanOrEqual(0.3);
      // Before GP the first rounds left along the old facing (up to 168 deg off).
      expect(angDiff(shots[0][1], Math.PI) / DEG).toBeLessThanOrEqual(TUNING.combat.fireMaxLagDeg + p.weapon.spreadDeg * 2 + TUNING.combat.turnSpreadDeg + 1);
    }
  });
  it('a one-step tap made mid-turn is not lost: it fires once the body lines up', () => {
    const w = createWorld({ map: OPEN, hero: 'benja', bots: [] });
    const p = player(w);
    p.x = 15; p.y = 8.5; p.facing = 0;
    stepWorld(w, inp({ aim: Math.PI, firing: true }));
    for (let i = 0; i < 30; i++) stepWorld(w, inp({ aim: Math.PI }));
    expect(p.shots).toBe(1);
  });
  it('moving fire still works: strafing across while shooting sideways', () => {
    const w = createWorld({ map: OPEN, hero: 'benja', bots: [] });
    const p = player(w);
    p.x = 5; p.y = 8.5; p.facing = Math.PI / 2;
    const shots = fire(w, { moveX: 1, aim: Math.PI / 2, firing: true }, 90);
    expect(shots.length).toBeGreaterThan(4);
    expect(p.x).toBeGreaterThan(9);
  });
  it('PC camera (GP root cause): with a still cursor the aim stays put; before, the facing-led camera turned it, and behind you flipped it', () => {
    // Model of the client loop: aim = cursor angle from the player's screen spot; camera eases toward player + lead.
    const ppu = 40, T = TUNING.render;
    const run = (cursorLead: boolean, cursor: { x: number; y: number }) => {
      // Settled facing east first (lead out in front), then the cursor moves and stays still.
      const cam = createCamera(0, 0);
      for (let i = 0; i < 240; i++) stepCamera(cam, 0, 0, leadTarget(0, T, cursorLead ? { dx: 3, dy: 0 } : undefined), STEP, T);
      let facing = 0;
      const aims: number[] = [];
      for (let i = 0; i < 240; i++) {
        const sx = (0 - cam.x) * ppu, sy = (0 - cam.y) * ppu; // player at the world origin, screen centre = 0,0
        const aim = Math.atan2(cursor.y - sy, cursor.x - sx);
        facing += Math.max(-12 * DEG, Math.min(12 * DEG, Math.atan2(Math.sin(aim - facing), Math.cos(aim - facing))));
        aims.push(aim);
        stepCamera(cam, 0, 0, leadTarget(facing, T, cursorLead ? { dx: cursor.x / ppu, dy: cursor.y / ppu } : undefined), STEP, T);
      }
      return aims;
    };
    for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
      // A cursor 50 px away, the player having faced east: aim west, south-west...
      const c = { x: Math.cos(deg * DEG) * 50, y: Math.sin(deg * DEG) * 50 };
      const fixed = run(true, c);
      // While the lead swings over (0.5 s smoothing) the aim is never more than a few degrees off; settled, exact.
      for (const a of fixed) expect(angDiff(a, deg * DEG) / DEG, `cursor-led ${deg}`).toBeLessThan(25);
      for (const a of fixed.slice(150)) expect(angDiff(a, deg * DEG) / DEG, `cursor-led ${deg}`).toBeLessThan(1);
    }
    // The old camera (lead along the facing): a cursor 50 px behind you sat between your screen spot and the screen
    // centre, so the aim read the other way and stayed there: you could not turn round to shoot (the GP bug).
    const old = run(false, { x: -50, y: 0 }).slice(60);
    expect(Math.min(...old.map((a) => angDiff(a, Math.PI) / DEG))).toBeGreaterThan(90);
  });
});

describe('no phantom health loss', () => {
  it('default game (you + 2 AI), spawned safe and idle for 40 s with the hostiles far away: health and armour unchanged', () => {
    for (const seed of [1, 2, 3]) {
      const w = createWorld({ seed, hero: 'benja', zone: true, allies: squadFor('benja', seed) });
      for (const a of w.actors) if (a.team === 'bot') { a.x = 60; a.y = 40.5; }
      const side = w.actors.filter((a) => a.team === 'player');
      const before = side.map((a) => [a.hp, a.armor]);
      for (let i = 0; i < 40 * 60; i++) {
        for (const a of w.actors) if (a.team === 'bot') { a.x = 60; a.y = 40.5; a.vx = a.vy = 0; }
        stepWorld(w, IDLE_INPUT);
      }
      // The zone does not close for the first 40 s (it is announced on the HUD when it does). You stand still: exactly
      // what you had. Your AI teammates may pick something up (more), never lose any.
      expect(side[0].hp).toBe(before[0][0]);
      expect(side[0].armor).toBe(before[0][1]);
      side.forEach((a, k) => { expect(a.hp, a.name).toBeGreaterThanOrEqual(before[k][0]); expect(a.armor, a.name).toBeGreaterThanOrEqual(before[k][1]); });
    }
  });
  it('overheal and over-armour stay until damage takes them (they drained 2 hp and 1 armour a second with no hit)', () => {
    const w = createWorld({ map: OPEN, hero: 'benja', bots: [] });
    const p = player(w);
    p.hp = p.maxHp + 20; p.armor = p.maxArmor + 10;
    for (let i = 0; i < 60 * 30; i++) stepWorld(w, IDLE_INPUT);
    expect(p.hp).toBe(p.maxHp + 20);
    expect(p.armor).toBe(p.maxArmor + 10);
  });
  it('online 1v1: both idle far apart for 20 s, the server never changes their health', () => {
    let t = 0;
    const lobby = new Lobby({ now: () => t, seed: () => 3, countdownSec: 0, idleTimeoutSec: 999 });
    const conn = () => ({ got: [] as ServerMsg[], send(m: ServerMsg) { this.got.push(m); }, close() { /* closed */ } });
    const a = conn(), b = conn();
    const ia = lobby.connect(a), ib = lobby.connect(b);
    for (const [id, n] of [[ia, 'A'], [ib, 'B']] as const) { lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: n, hero: 'benja' })); lobby.message(id, JSON.stringify({ t: 'queue', mode: '1v1' })); }
    const w = ([...lobby.rooms.values()][0] as unknown as { world: World }).world;
    const hp0 = w.actors.map((x) => x.hp);
    for (let i = 0; i < 20 * 60; i++) { t += 1 / 60; lobby.tick(); }
    expect(w.actors.map((x) => x.hp)).toEqual(hp0);
    const snap = [...a.got].reverse().find((m) => m.t === 'snap') as Extract<ServerMsg, { t: 'snap' }>;
    expect(snap.actors.find((x) => x.id === 0)!.hp).toBe(hp0[0]);
  });
});

describe('a hit never freezes or slows you (only an announced Snare does)', () => {
  // A runner crosses in front of a shooter that never misses at point blank: speed right after each hit.
  const runUnderFire = (shooterHero: string, opts: { armor?: number; hp?: number; grenade?: boolean } = {}) => {
    const w = createWorld({ map: OPEN, hero: 'benja', bots: [{ name: 'S', hero: shooterHero, patrol: [[15, 4]], flanker: false }] });
    const p = player(w), s = w.actors[1];
    p.x = 3; p.y = 9.5; p.hp = p.maxHp = opts.hp ?? 1e6; p.armor = opts.armor ?? 0;
    s.ability = { ...s.ability, cooldown: 1e9 }; s.abilityCd = 1e9;
    let hits = 0, worst = Infinity, after = 0;
    const cap = TUNING.movement.maxSpeed * p.hero.speed;
    for (let i = 0; i < 360 && p.alive; i++) {
      const dir = Math.floor(i / 120) % 2 === 0 ? 1 : -1;
      const throwNow = opts.grenade && i % 90 === 10;
      stepWorld(w, inp({ moveX: dir, aim: 0 }), undefined, (a) => a.id === 1 ? inp({ aim: Math.atan2(p.y - s.y, p.x - s.x), firing: !opts.grenade, grenade: !!throwNow, throwDist: Math.hypot(p.x - s.x, p.y - s.y) }) : null);
      s.x = 15; s.y = 6; s.vx = s.vy = 0; s.grenades = 3;
      if (s.ammo === 0) { s.ammo = s.weapon.magazine; s.reloadLeft = 0; }
      const hit = w.hits.some((h) => h.target === 0);
      if (hit) { hits++; after = 3; }
      // Three steps after a hit (50 ms), mid-run (not while turning round at a wall).
      else if (after > 0 && --after === 0 && i % 120 > 20 && i % 120 < 100) worst = Math.min(worst, Math.hypot(p.vx, p.vy) / cap);
    }
    return { hits, worst, slowed: p.slowLeft };
  };
  for (const [label, hero, o] of [
    ['rifle (Benja)', 'benja', {}], ['shotgun (Tonashiro)', 'tonashiro', {}], ['marksman (Ray)', 'ray', {}], ['LMG (Toad)', 'toad', {}],
    ['armour hit', 'benja', { armor: 200 }], ['low health', 'benja', { hp: 400 }], ['grenades', 'benja', { grenade: true }],
  ] as const) {
    it(`${label}: back to at least 90% of run speed within 50 ms of every hit`, () => {
      const r = runUnderFire(hero, o);
      expect(r.hits).toBeGreaterThan(0);
      expect(r.worst).toBeGreaterThanOrEqual(0.9);
      expect(r.slowed).toBe(0);
    });
  }
  it('the Snare (Ray\'s ability) is the one slow: 60% for 2 s, never stacking, never longer, shown as a status', () => {
    const w = createWorld({ map: OPEN, hero: 'benja', bots: [{ name: 'R', hero: 'ray', patrol: [[12, 8]], flanker: false }] });
    const p = player(w), r = w.actors[1];
    p.x = 10; p.y = 8.5; r.x = 12; r.y = 8.5; r.facing = Math.PI;
    const ab = r.ability;
    expect(ab.kind).toBe('scream');
    // Two Snares 0.5 s apart: still at most 2 s left and 60%, never 36%.
    let maxLeft = 0, minMul = 1;
    for (let i = 0; i < 60 * 4; i++) {
      const cast = i === 0 || i === 30;
      if (cast) r.abilityCd = 0;
      stepWorld(w, inp({ moveX: 0.01 }), undefined, (a) => a.id === 1 ? inp({ aim: Math.PI, ability: cast }) : null);
      r.x = 12; r.y = 8.5;
      maxLeft = Math.max(maxLeft, p.slowLeft);
      if (p.slowLeft > 0) minMul = Math.min(minMul, p.slowMul);
    }
    expect(maxLeft).toBeLessThanOrEqual((ab.seconds ?? 0) + 1e-9);
    expect(minMul).toBeCloseTo(ab.amount ?? 1, 6);
    expect(p.slowLeft).toBe(0);
  });
  it('downed is the one crawl (25%), and it is a state the HUD names (downed card), not a freeze', () => {
    const w = createWorld({ map: OPEN, hero: 'benja', bots: [], allies: [{ name: 'M', hero: 'toad' }] });
    const p = player(w), m = w.actors[1];
    p.x = 5; p.y = 8.5; m.x = 25; m.y = 3.5;
    p.downed = true; p.hp = TUNING.revive.downHp;
    for (let i = 0; i < 60; i++) stepWorld(w, inp({ moveX: 1 }));
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(TUNING.movement.maxSpeed * p.hero.speed * TUNING.revive.crawl, 1);
  });
});
