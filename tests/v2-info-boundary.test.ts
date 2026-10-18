// V2 information integrity (forensic report 2026-10-18 §3.4, weakness 11: "shot from outside the cone").
// Online, a long-sight shooter may hit a victim who cannot see it: that is the sniper's earned information, not a
// leak. What must hold: the shooter only ever receives the victim while it sees it, the victim never receives the
// shooter before it fires, and once it fires the victim is told exactly where the shot came from (the muzzle flash on
// a clear line, and the hit's origin), at any range.
import { describe, expect, it } from 'vitest';
import { Lobby } from '../server/room';
import type { ServerMsg } from '../src/net/protocol';
import { canSee } from '../src/sim/vision';
import type { Level } from '../src/sim/level';

class FakeConn { got: ServerMsg[] = []; send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); } close() { /* closed */ } }
const input = (o: Record<string, unknown>) => JSON.stringify({ t: 'input', seq: 1, mx: 0, my: 0, aim: 0, fire: false, quiet: false, reload: false, ability: false, ...o });

function duel() {
  let t = 0;
  const lobby = new Lobby({ now: () => t, seed: () => 5, countdownSec: 0 });
  const conns = [new FakeConn(), new FakeConn()];
  const ids = conns.map((c) => lobby.connect(c));
  lobby.message(ids[0], JSON.stringify({ t: 'hello', v: 1, name: 'Sniper', hero: 'ray' }));
  lobby.message(ids[1], JSON.stringify({ t: 'hello', v: 1, name: 'Victim', hero: 'tonashiro' }));
  ids.forEach((id) => lobby.message(id, JSON.stringify({ t: 'queue', mode: '1v1' })));
  const room = [...lobby.rooms.values()][0];
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { t += 1 / 60; lobby.tick(); } };
  tick(1);
  return { lobby, room, tick, w: room.world, ids };
}

/** An open horizontal run of floor at least `len` long, (no hard-coded coordinates). */
function openRow(level: Level, len: number): { x: number; y: number } {
  const floor = (x: number, y: number) => level.tiles[y * level.w + x] === 0;
  for (let y = 2; y < level.h - 2; y++) {
    let run = 0;
    for (let x = 1; x < level.w - 1; x++) {
      run = floor(x, y) ? run + 1 : 0;
      if (run >= len) return { x: x - len + 1, y };
    }
  }
  throw new Error('no open row');
}

describe('online shooter boundary: earned information only, and the victim always learns where the shot came from', () => {
  it('a sniper beyond the victim\'s sight: hidden before it fires, exact after, and the hit names its origin', () => {
    const { lobby, room, tick, w, ids } = duel();
    const [sniper, victim] = [w.actors[0], w.actors[1]];
    expect(sniper.view.range).toBeGreaterThan(victim.view.range + 2);
    const row = openRow(w.level, 11);
    const gap = (sniper.view.range + victim.view.range) / 2; // inside the sniper's sight, outside the victim's
    victim.x = row.x + 0.5; victim.y = row.y + 0.5; victim.facing = Math.PI; // facing away, as if walking west
    sniper.x = victim.x + gap; sniper.y = victim.y; sniper.facing = Math.PI;
    for (const a of [sniper, victim]) { a.vx = 0; a.vy = 0; }
    expect(canSee(w.level, sniper.x, sniper.y, sniper.facing, sniper.view, victim.x, victim.y)).toBe(true);
    // Even turned round the victim could not see the sniper: it is beyond the victim's sight range.
    expect(canSee(w.level, victim.x, victim.y, 0, victim.view, sniper.x, sniper.y)).toBe(false);
    // Before the shot: the sniper is told about the victim (it sees it); the victim is told nothing about the sniper.
    expect(lobby.snapshot(room, room.members[0]).actors.some((a) => a.id === victim.id)).toBe(true);
    expect(lobby.snapshot(room, room.members[1]).actors.some((a) => a.id === sniper.id)).toBe(false);
    // The sniper fires until a bullet lands.
    let hit: { fromX: number; fromY: number } | undefined, flashSeen = false;
    for (let i = 0; i < 180 && !hit; i++) {
      lobby.message(ids[0], input({ seq: i + 2, aim: Math.atan2(victim.y - sniper.y, victim.x - sniper.x), fire: true }));
      lobby.message(ids[1], input({ seq: i + 2, aim: Math.PI }));
      tick(1);
      const s = lobby.snapshot(room, room.members[1], [], w.hits);
      if (s.actors.some((a) => a.id === sniper.id)) flashSeen = true;
      hit = s.hits.find((h) => h.target === victim.id && h.by === sniper.id);
    }
    expect(hit).toBeDefined();
    expect(flashSeen).toBe(true);
    // The hit says where it came from: the sniper's muzzle, within a step of where it stands.
    expect(Math.hypot(hit!.fromX - sniper.x, hit!.fromY - sniper.y)).toBeLessThan(1);
  });

  it('a shooter that cannot see the victim is never sent the victim, even standing in its range', () => {
    const { lobby, room, w } = duel();
    const [sniper, victim] = [w.actors[0], w.actors[1]];
    const row = openRow(w.level, 11);
    victim.x = row.x + 0.5; victim.y = row.y + 0.5;
    sniper.x = victim.x + 6; sniper.y = victim.y; sniper.facing = 0; // looking away, beyond its near radius
    expect(canSee(w.level, sniper.x, sniper.y, sniper.facing, sniper.view, victim.x, victim.y)).toBe(false);
    expect(lobby.snapshot(room, room.members[0]).actors.some((a) => a.id === victim.id)).toBe(false);
  });
});
