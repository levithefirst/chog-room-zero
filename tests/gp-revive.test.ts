// GP downed + revive (owner 2026-10-17): 0 HP -> DOWNED -> a 10 s window -> REVIVED or ELIMINATED. People and AI
// teammates revive; a revive takes 3 s, is interrupted by a hit, by firing or by stepping away; while it runs the
// bleed-out waits. Solo (you + 2 AI), online 1v1 / 3v3 / 5v5, and the server's disconnect and reconnect paths.
import { describe, expect, it } from 'vitest';
import { createWorld, downLeft, player, standing, stepWorld, IDLE_INPUT, type Actor, type ActorInput, type World } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';
import { HALL } from './helpers/duel';
import { Lobby } from '../server/room';
import type { ServerMsg } from '../src/net/protocol';
import { PROTOCOL } from '../src/net/protocol';

const R = TUNING.revive;
const STEP = TUNING.simStepSeconds;
const secs = (s: number) => Math.round(s / STEP);
// An open floor with a sealed pocket on the east (x 26-28) where the solo hostile waits: the match stays on.
const OPEN = ['##############################', ...Array.from({ length: 12 }, () => '#........................#...#'), '##############################'];
type Side = 'alpha' | 'bravo';
const versus = (spec: [Side, number, number][]): World => createWorld({
  seed: 3, map: HALL, zone: false,
  versus: spec.map(([t, x, y], i) => ({ name: `P${i}`, hero: 'kettle', team: t, x, y, facing: t === 'alpha' ? 0 : Math.PI })),
});
const idle = (a: Actor): ActorInput => ({ ...IDLE_INPUT, aim: a.facing });
const run = (w: World, steps: number, inp: (a: Actor) => Partial<ActorInput> = () => ({})) => { for (let i = 0; i < steps; i++) stepWorld(w, (a) => ({ ...idle(a), ...inp(a) })); };
/** Knock actor t down (or out) with actor by's bullets: point blank, perfect aim. */
function shootUntil(w: World, by: number, t: number, until: (x: Actor) => boolean, max = 900) {
  const s = w.actors[by], v = w.actors[t];
  s.facing = Math.atan2(v.y - s.y, v.x - s.x);
  for (let i = 0; i < max && !until(v); i++) stepWorld(w, (a) => (a.id === by ? { ...IDLE_INPUT, firing: true, reload: a.ammo === 0, aim: Math.atan2(v.y - s.y, v.x - s.x) } : idle(a)));
}
/** Solo: you + AI teammates on an open floor; one hostile shut in the pocket (so the match is not already won). */
function solo(allies: { name: string; hero: string }[]) {
  return createWorld({ map: OPEN, hero: 'benja', allies, bots: [{ name: 'H', hero: 'benja', patrol: [[27, 6]], flanker: false }], zone: false });
}
const downNow = (t: Actor, w: World) => { t.downed = true; t.hp = R.downHp; t.armor = 0; t.reviveProgress = 0; t.downInfo = { cause: 'shot', killerId: -1, weapon: 'test', fromX: t.x, fromY: t.y, toX: t.x, toY: t.y, tick: w.tick }; };

describe('the 10 s window', () => {
  it('3v3: downed, nobody helps: eliminated at 10.0 s (not before 9.9), the downer gets the kill, nobody is signed out', () => {
    const w = versus([['alpha', 10, 4.5], ['bravo', 12, 4.5], ['bravo', 25, 2]]);
    shootUntil(w, 0, 1, (x) => x.downed);
    const d = w.actors[1];
    expect(d.downed).toBe(true);
    expect(w.outcome).toBe('playing');
    const t0 = w.tick;
    run(w, secs(9.9));
    expect(d.alive && d.downed).toBe(true);
    expect(downLeft(d)).toBeLessThan(0.2);
    run(w, secs(0.2));
    expect(d.alive).toBe(false);
    expect((w.tick - t0) * STEP).toBeLessThanOrEqual(10.2);
    expect(w.actors[0].kills).toBe(1);
    expect(d.death?.killerId).toBe(0);
  });
  it('revive at 9.9 s: a rescuer who arrives with 0.1 s left still gets them up (the bleed waits during a revive)', () => {
    const w = versus([['alpha', 10, 4.5], ['bravo', 12, 4.5], ['bravo', 25, 2]]);
    shootUntil(w, 0, 1, (x) => x.downed);
    const d = w.actors[1], m = w.actors[2];
    run(w, secs(9.9));
    expect(d.downed).toBe(true);
    m.x = d.x + 0.8; m.y = d.y;
    run(w, secs(R.seconds) + 2);
    expect(d.downed).toBe(false);
    expect(d.alive).toBe(true);
    expect(d.hp).toBe(Math.round(d.maxHp * R.hpShare));
    expect(d.armor).toBe(0);
  });
  it('enemy finishing: a downed player hit again goes out early; the kill goes to whoever downed them', () => {
    const w = versus([['alpha', 10, 4.5], ['alpha', 12, 6.5], ['bravo', 12, 4.5], ['bravo', 25, 2]]);
    shootUntil(w, 0, 2, (x) => x.downed);
    const d = w.actors[2];
    const t0 = w.tick;
    shootUntil(w, 1, 2, (x) => !x.alive);
    expect(d.alive).toBe(false);
    expect((w.tick - t0) * STEP).toBeLessThan(R.bleedSeconds - 2);
    expect(w.actors[0].kills).toBe(1);
    expect(w.actors[1].kills).toBe(0);
  });
});

describe('who revives whom', () => {
  it('a person revives a person in 3 s (online 3v3)', () => {
    const w = versus([['alpha', 10, 4.5], ['bravo', 12, 4.5], ['bravo', 12.8, 4.5]]);
    shootUntil(w, 0, 1, (x) => x.downed);
    run(w, secs(R.seconds) + 2);
    expect(w.actors[1].downed).toBe(false);
  });
  it('an AI teammate revives you (solo), says so, and holds fire while it does', () => {
    const w = solo([{ name: 'Toad', hero: 'toad' }]);
    const p = player(w), m = w.actors[1];
    p.x = 8; p.y = 6.5; m.x = 14; m.y = 6.5;
    downNow(p, w);
    let said = false, fired = false;
    for (let i = 0; i < secs(8) && p.downed; i++) {
      stepWorld(w, IDLE_INPUT);
      said ||= w.comms.some((c) => c.kind === 'reviving' && c.target === 0);
      if (m.reviveProgress > 0 || Math.hypot(m.x - p.x, m.y - p.y) < R.range) fired ||= m.firedLast;
    }
    expect(p.downed).toBe(false);
    expect(p.alive).toBe(true);
    expect(w.outcome).toBe('playing');
    expect(said).toBe(true);
    expect(fired).toBe(false);
  });
  it('you revive an AI teammate: stand beside it and hold fire', () => {
    const w = solo([{ name: 'Ray', hero: 'ray' }]);
    const p = player(w), m = w.actors[1];
    m.x = 8; m.y = 6.5; p.x = 9; p.y = 6.5;
    downNow(m, w);
    for (let i = 0; i < secs(R.seconds) + 2; i++) stepWorld(w, IDLE_INPUT);
    expect(m.downed).toBe(false);
  });
  it('an AI teammate revives another; only the nearer one goes, the other keeps its job', () => {
    const w = solo([{ name: 'A', hero: 'toad' }, { name: 'B', hero: 'ray' }, { name: 'C', hero: 'benja' }]);
    const p = player(w), [a, b, c] = w.actors.slice(1, 4);
    p.x = 3; p.y = 2; a.x = 12; a.y = 6.5; b.x = 15; b.y = 6.5; c.x = 23; c.y = 6.5;
    downNow(a, w);
    let cWent = 0;
    for (let i = 0; i < secs(6) && a.downed; i++) { stepWorld(w, IDLE_INPUT); if (w.brains.get(c.id)!.rescuing === a.id) cWent++; }
    expect(a.downed).toBe(false);
    expect(cWent).toBe(0);
  });
  it('two rescuers at once are no faster than one, and it is one revive', () => {
    const w = versus([['alpha', 10, 4.5], ['bravo', 12, 4.5], ['bravo', 12.8, 4.5], ['bravo', 11.6, 5.2]]);
    shootUntil(w, 0, 1, (x) => x.downed);
    let revives = 0;
    for (let i = 0; i < secs(R.seconds) - 6; i++) { stepWorld(w, idle); revives += w.sounds.filter((s) => s.type === 'revive').length; }
    expect(w.actors[1].downed).toBe(true);
    for (let i = 0; i < 12; i++) { stepWorld(w, idle); revives += w.sounds.filter((s) => s.type === 'revive').length; }
    expect(w.actors[1].downed).toBe(false);
    expect(revives).toBe(1);
  });
});

describe('interruptions and limits', () => {
  it('a hit, firing, or stepping out of range stops the revive and the progress starts again', () => {
    for (const how of ['fire', 'leave', 'hit'] as const) {
      const w = versus([['alpha', 10, 4.5], ['bravo', 12, 4.5], ['bravo', 12.8, 4.5]]);
      shootUntil(w, 0, 1, (x) => x.downed);
      const d = w.actors[1], m = w.actors[2];
      run(w, secs(2));
      expect(d.reviveProgress).toBeGreaterThan(1.5);
      if (how === 'fire') run(w, 2, (a) => (a.id === 2 ? { firing: true, aim: Math.PI } : {}));
      if (how === 'leave') { m.x = d.x + 3; run(w, 2); }
      if (how === 'hit') shootUntil(w, 0, 1, () => d.reviveProgress === 0, 120);
      expect(d.reviveProgress, how).toBeLessThan(0.1);
      expect(d.downed, how).toBe(true);
    }
  });
  it('no revive through a wall, from far away, twice, or after the end', () => {
    const WALLED = ['##############################', '#.............#..............#', '#.............#..............#', '#.............#..............#', '##############################'];
    const w = createWorld({ seed: 3, map: WALLED, zone: false, versus: [
      { name: 'A', hero: 'kettle', team: 'alpha', x: 3, y: 2.5, facing: 0 }, { name: 'B', hero: 'kettle', team: 'bravo', x: 13.6, y: 2.5, facing: 0 },
      { name: 'C', hero: 'kettle', team: 'bravo', x: 15.3, y: 2.5, facing: 0 }, { name: 'D', hero: 'kettle', team: 'bravo', x: 25, y: 2.5, facing: 0 }] });
    const b = w.actors[1];
    downNow(b, w);
    // C is 1.7 u away, behind the wall at x = 14 (out of range anyway); D is far.
    run(w, secs(4));
    expect(b.downed).toBe(true);
    // Out (bled out): nothing brings them back.
    run(w, secs(7));
    expect(b.alive).toBe(false);
    w.actors[2].x = b.x + 0.5; w.actors[2].y = b.y;
    run(w, secs(4));
    expect(b.alive).toBe(false);
    expect(b.downed).toBe(false);
  });
  it('a downed player cannot shoot, reload, use the ability, throw or take a pickup', () => {
    const w = versus([['alpha', 10, 4.5], ['bravo', 12, 4.5], ['bravo', 25, 2]]);
    shootUntil(w, 0, 1, (x) => x.downed);
    const d = w.actors[1];
    const [shots, nades, cd] = [d.shots, d.grenades, d.abilityCd];
    run(w, 60, (a) => (a.id === 1 ? { firing: true, ability: true, grenade: true, reload: true } : {}));
    expect([d.shots, d.grenades, d.abilityCd, d.reloadLeft]).toEqual([shots, nades, cd, 0]);
  });
});

describe('modes', () => {
  it('1v1: zero health is out at once (nobody can revive)', () => {
    const w = versus([['alpha', 10, 4.5], ['bravo', 12, 4.5]]);
    shootUntil(w, 0, 1, (x) => !x.alive || x.downed);
    expect(w.actors[1].downed).toBe(false);
    expect(w.actors[1].alive).toBe(false);
  });
  it('5v5: downed while four teammates stand; the side loses only when nobody stands', () => {
    const spec: [Side, number, number][] = [];
    for (let i = 0; i < 5; i++) { spec.push(['alpha', 10, 1.5 + i]); spec.push(['bravo', 13, 1.5 + i]); }
    const w = versus(spec);
    shootUntil(w, 1, 0, (x) => x.downed);
    expect(w.actors[0].downed).toBe(true);
    expect(w.outcome).toBe('playing');
    // Everyone else on alpha goes down too: the last one standing drops and every downed member is out with them.
    for (const a of w.actors) if (a.team === 'alpha' && a.id !== 0) downNow(a, w);
    stepWorld(w, idle);
    expect(w.actors.filter((a) => a.team === 'alpha').every((a) => !a.alive)).toBe(true);
    stepWorld(w, idle);
    expect(w.outcome).toBe('won');
    expect(w.winner).toBe('bravo');
  });
  it('the match ending while you are downed: your side won, you are revived later never (the match is over), no crash', () => {
    const w = versus([['alpha', 10, 4.5], ['alpha', 25, 2], ['bravo', 12, 4.5]]);
    shootUntil(w, 2, 0, (x) => x.downed);
    expect(w.actors[0].downed).toBe(true);
    shootUntil(w, 1, 2, (x) => !x.alive);
    stepWorld(w, idle);
    expect(w.outcome).toBe('won');
    expect(w.winner).toBe('alpha');
  });
  it('solo default game: you down while a teammate stands keeps the match going; the match ends only when you are out', () => {
    const w = solo([{ name: 'Toad', hero: 'toad' }]);
    const p = player(w);
    p.x = 4; p.y = 2; w.actors[1].x = 20; w.actors[1].y = 12;
    downNow(p, w);
    for (let i = 0; i < secs(2); i++) stepWorld(w, IDLE_INPUT);
    expect(w.outcome).toBe('playing');
    expect(standing(w.actors[1])).toBe(true);
  });
});

describe('online: disconnect and reconnect while downed', () => {
  const conn = () => ({ got: [] as ServerMsg[], send(m: ServerMsg) { this.got.push(m); }, close() { /* closed */ } });
  function room3v3() {
    let t = 0;
    const lobby = new Lobby({ now: () => t, seed: () => 5, countdownSec: 0, idleTimeoutSec: 999, reconnectGraceSec: 20 });
    const cs = Array.from({ length: 6 }, () => conn());
    const ids = cs.map((c, i) => { const id = lobby.connect(c); lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: `P${i}`, hero: 'benja' })); lobby.message(id, JSON.stringify({ t: 'queue', mode: '3v3' })); return id; });
    const room = [...lobby.rooms.values()][0] as unknown as { world: World; members: { id: number }[] };
    const step = (s: number) => { for (let i = 0; i < secs(s); i++) { t += STEP; lobby.tick(); } };
    return { lobby, cs, ids, room, w: room.world, step };
  }
  it('dropping while downed: still downed in the world, a teammate can still revive it, and a resume finds it revived', () => {
    const { lobby, cs, room, w, step } = room3v3();
    step(0.1);
    const meIdx = 0, me = w.actors[meIdx];
    const mate = w.actors.find((a) => a.team === me.team && a !== me)!;
    downNow(me, w);
    const token = (cs[0].got.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>).token;
    lobby.disconnect(room.members[meIdx].id);
    mate.x = me.x + 0.8; mate.y = me.y;
    step(R.seconds + 0.2);
    expect(me.alive).toBe(true);
    expect(me.downed).toBe(false);
    const back = conn();
    const id = lobby.connect(back);
    lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: 'P0', hero: 'benja', token }));
    expect((back.got.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>).resumed).toBe(true);
    step(0.2);
    const snap = [...back.got].reverse().find((m) => m.t === 'snap') as Extract<ServerMsg, { t: 'snap' }>;
    expect(snap.actors.find((a) => a.id === me.id)!.downed).toBe(false);
  });
  it('reconnecting while still downed: the snapshot shows downed with its revive state; it bleeds out on time', () => {
    const { lobby, cs, room, w, step } = room3v3();
    step(0.1);
    const me = w.actors[0];
    for (const a of w.actors) if (a.team === me.team && a !== me) { a.x = 60; a.y = 40; }
    downNow(me, w);
    const token = (cs[0].got.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>).token;
    lobby.disconnect(room.members[0].id);
    step(3);
    const back = conn();
    const id = lobby.connect(back);
    lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: 'P0', hero: 'benja', token }));
    step(0.2);
    const snap = [...back.got].reverse().find((m) => m.t === 'snap') as Extract<ServerMsg, { t: 'snap' }>;
    const mine = snap.actors.find((a) => a.id === me.id)!;
    expect(mine.downed).toBe(true);
    expect(mine.hp).toBeLessThan(R.downHp * 0.8);
    step(R.bleedSeconds);
    expect(me.alive).toBe(false);
  });
});
