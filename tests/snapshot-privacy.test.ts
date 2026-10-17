// Owner 2026-10-17 network audit: a client must never receive exact hostile positions its player did not earn.
// server/room.ts snapshot: exact only for what YOU see (your light, a muzzle flash you saw, your Ping); a teammate's
// sighting is a SPOTTED spot near the hostile, refreshed every spottedRefresh s; heard hostiles arrive as the hearing
// estimate; bullets, grenades and hits never give away an unseen shooter.
import { describe, expect, it } from 'vitest';
import { Lobby } from '../server/room';
import type { ServerMsg } from '../src/net/protocol';
import { canSee, muzzleFlashSeen } from '../src/sim/vision';
import { revealed } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';

class FakeConn { got: ServerMsg[] = []; send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); } close() { /* closed */ } }

function match3v3() {
  let t = 0;
  const lobby = new Lobby({ now: () => t, seed: () => 5, countdownSec: 0 });
  const conns = Array.from({ length: 6 }, () => new FakeConn());
  const ids = conns.map((c) => lobby.connect(c));
  ids.forEach((id, i) => { lobby.message(id, JSON.stringify({ t: 'hello', v: 1, name: `P${i}`, hero: 'benja' })); lobby.message(id, JSON.stringify({ t: 'queue', mode: '3v3' })); });
  const room = [...lobby.rooms.values()][0];
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { t += 1 / 60; lobby.tick(); } };
  return { lobby, room, tick, w: room.world };
}

describe('teammate sightings never arrive as live hostile positions', () => {
  it('a hostile only your teammate sees is a spotted spot near it, not an actor; one you see is exact', () => {
    const { lobby, room, tick, w } = match3v3();
    tick(1);
    const [me, mate] = [w.actors[0], w.actors[1]];
    const foe = w.actors.find((a) => a.team !== me.team)!;
    // An open stretch of the north corridor (row 10, x 16-24): the mate faces the foe, you face away from it.
    me.x = 20.5; me.y = 10.5; me.facing = Math.PI; mate.x = 16.5; mate.y = 10.5; mate.facing = 0;
    foe.x = 23.5; foe.y = 10.5;
    for (const a of w.actors) if (a !== me && a !== mate && a !== foe) { a.x = 3; a.y = 2; }
    expect(canSee(w.level, me.x, me.y, me.facing, me.view, foe.x, foe.y)).toBe(false);
    expect(canSee(w.level, mate.x, mate.y, mate.facing, mate.view, foe.x, foe.y)).toBe(true);
    const s1 = lobby.snapshot(room, room.members[0]);
    expect(s1.actors.some((a) => a.id === foe.id)).toBe(false);
    const sp = s1.sp!.find((x) => x.id === foe.id)!;
    const d = Math.hypot(sp.x - foe.x, sp.y - foe.y);
    expect(d).toBeLessThanOrEqual(TUNING.intel.spottedRadius + 0.2);
    expect(d).toBeGreaterThan(0.1); // never the exact spot
    // The same spot until it is refreshed, then a new one.
    foe.x += 0.3;
    expect(lobby.snapshot(room, room.members[0]).sp!.find((x) => x.id === foe.id)).toEqual(sp);
    w.tick += Math.round(TUNING.sound.spottedRefresh / TUNING.simStepSeconds);
    expect(lobby.snapshot(room, room.members[0]).sp!.find((x) => x.id === foe.id)).not.toEqual(sp);
    // Turn round: you see it yourself, exact, and no spotted report.
    me.facing = 0;
    const s2 = lobby.snapshot(room, room.members[0]);
    expect(s2.actors.find((a) => a.id === foe.id)).toMatchObject({ x: foe.x, y: foe.y });
    expect(s2.sp?.some((x) => x.id === foe.id) ?? false).toBe(false);
    // The teammate itself still gets it exact (it sees it).
    expect(lobby.snapshot(room, room.members[1]).actors.some((a) => a.id === foe.id)).toBe(true);
  });

  it('a full 3v3 match: every hostile sent exact is one that player sees, saw flash, or Pings; every spot is near the truth', () => {
    const { lobby, room, w } = match3v3();
    const ids = room.members.map((m) => m.id);
    // Start both sides facing each other across the central atrium (the spawns are 60 u apart on Room Zero), so the
    // wandering players keep meeting: alpha at x 26-27, bravo mirrored at x 40-41.
    [[26.5, 19.5], [26.5, 22.5], [27.5, 21.5]].forEach(([x, y], i) => {
      const al = w.actors.filter((a) => a.team === 'alpha')[i], br = w.actors.filter((a) => a.team === 'bravo')[i];
      Object.assign(al, { x, y, facing: 0 });
      Object.assign(br, { x: 67 - x, y, facing: Math.PI });
    });
    let t2 = 0, exactSent = 0, spots = 0;
    for (let step = 0; step < 60 * 40 && w.outcome === 'playing'; step++) {
      // Everyone wanders and fires in a slow sweep (deterministic).
      room.members.forEach((m, i) => lobby.message(m.id, JSON.stringify({ t: 'input', seq: step + 1, mx: Math.cos(step / 90 + i), my: Math.sin(step / 70 + i * 2), aim: step / 40 + i, fire: step % 50 < 10, quiet: false, reload: false, ability: step % 400 === i * 30 })));
      (lobby as unknown as { opts: { now: () => number } }).opts.now = () => (t2 += 1 / 60);
      lobby.tick();
      if (step % 5) continue;
      room.members.forEach((m, i) => {
        const me = w.actors[i];
        const s = lobby.snapshot(room, m);
        for (const a of s.actors) {
          const e = w.actors[a.id];
          if (e.team === me.team || !e.alive) continue;
          exactSent++;
          const flash = w.tick - room.lastShot[e.id] <= TUNING.perception.flashSeconds / TUNING.simStepSeconds && muzzleFlashSeen(w.level, me.x, me.y, e.x, e.y);
          expect(me.alive && (canSee(w.level, me.x, me.y, me.facing, me.view, e.x, e.y) || flash || revealed(w, me).includes(e)), `step ${step}: ${e.name} sent to ${me.name}`).toBe(true);
        }
        for (const p of s.sp ?? []) { spots++; expect(w.actors[p.id].team).not.toBe(me.team); }
        // Hostile bullets: only ones you see or that pass close.
        for (const b of s.bullets) if (w.actors[b.owner].team !== me.team) expect(canSee(w.level, me.x, me.y, me.facing, me.view, b.x, b.y) || Math.hypot(me.x - b.x, me.y - b.y) <= 2.6).toBe(true);
        // A hit that is not on you or by you never gives away an unseen shooter.
        for (const h of s.hits) if (h.target !== i && h.by !== i && !s.actors.some((a) => a.id === h.by)) expect([h.fromX, h.fromY]).toEqual([h.x, h.y]);
      });
    }
    expect(ids.length).toBe(6);
    expect(exactSent).toBeGreaterThan(5);
    expect(spots).toBeGreaterThan(5);
  });
});

describe('heard hostiles arrive as the hearing estimate, not their spot', () => {
  it('a hidden hostile\'s footstep through a wall is a bearing estimate, flagged; on a clear line a blurred spot', () => {
    const { lobby, room, tick, w } = match3v3();
    tick(1);
    const me = w.actors[0];
    const foe = w.actors.find((a) => a.team !== me.team)!;
    for (const a of w.actors) if (a !== me && a !== foe) { a.x = 3; a.y = 2; }
    // Foe in the north corridor below the gallery (a wall between), running: you hear its steps but cannot see it.
    me.x = 15.5; me.y = 4.5; me.facing = Math.PI;
    foe.x = 14.5; foe.y = 10.5;
    w.sounds = [{ type: 'step', x: foe.x, y: foe.y, radius: 9, sourceId: foe.id, team: foe.team, tick: w.tick }];
    const s = lobby.snapshot(room, room.members[0]);
    const snd = s.sounds.find((x) => x.source === foe.id)!;
    expect(snd.est).toBe('wall');
    expect(snd.x === foe.x && snd.y === foe.y).toBe(false);
    // Same room, clear line, behind you: a spot off by a share of the distance.
    foe.x = 19.5; foe.y = 4.5;
    w.sounds = [{ type: 'step', x: foe.x, y: foe.y, radius: 9, sourceId: foe.id, team: foe.team, tick: w.tick + 1 }];
    const c = lobby.snapshot(room, room.members[0]).sounds.find((x) => x.source === foe.id)!;
    expect(c.est).toBe('clear');
    expect(Math.hypot(c.x - foe.x, c.y - foe.y)).toBeLessThanOrEqual(4 * TUNING.intel.hearShare * TUNING.intel.hearMul.step + 0.01);
    // A sound of your own team stays exact.
    const mate = w.actors[1];
    w.sounds = [{ type: 'step', x: 14.5, y: 3.5, radius: 9, sourceId: mate.id, team: mate.team, tick: w.tick }];
    mate.x = 14.5; mate.y = 3.5;
    const own = lobby.snapshot(room, room.members[0]).sounds.find((x) => x.source === mate.id)!;
    expect(own.est).toBeUndefined();
    expect([own.x, own.y]).toEqual([14.5, 3.5]);
  });
});

describe('the client turns spotted reports into contacts (never bodies)', () => {
  it('a spotted spot becomes a PARTIAL teammate contact at that spot; a server estimate is not blurred again', async () => {
    const { createWorld } = await import('../src/sim/world');
    const { createIntel, senseFor } = await import('../src/sim/intel');
    const w = createWorld({ seed: 2, versus: [{ name: 'Me', hero: 'benja', team: 'alpha', x: 5.5, y: 5.5, facing: 0 }, { name: 'Foe', hero: 'benja', team: 'bravo', x: -100, y: -100, facing: 0 }], zone: false });
    const intel = createIntel();
    senseFor(w, w.actors[0], intel, 0.016, [], [], [{ id: 1, x: 30.25, y: 9.5 }]);
    expect(intel.contacts.get(1)).toMatchObject({ state: 'partial', source: 'teammate', x: 30.25, y: 9.5 });
    const est = { type: 'step' as const, x: 12.25, y: 5.5, radius: 9, sourceId: 1, team: 'bravo' as const, tick: 40, est: 'clear' as const };
    senseFor(w, w.actors[0], createIntel(), 0, [est]);
    const i2 = createIntel();
    senseFor(w, w.actors[0], i2, 0, [est]);
    expect(i2.contacts.get(1)).toMatchObject({ state: 'heard', x: 12.25, y: 5.5 });
  });
});
