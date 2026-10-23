// FS performance on the 68 x 42 venue (owner 2026-10-17: "profile ... frame time, simulation cost, network
// messages"). The sim runs in the browser at 60 Hz (16.7 ms a frame for everything) and on the game server for every
// room; the snapshot goes to every player 20 times a second. Bars are budgets with room to spare, measured on this
// container (one shared CPU); a phone is slower (not measured here: no device).
import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld } from '../src/sim/world';
import { HEROES, squadFor } from '../src/config/heroes';
import { createAutopilot } from '../src/debug/autopilot';
import { findPath } from '../src/sim/level';
import { TACTICAL_POINTS } from '../src/config/map';
import { Lobby } from '../server/room';
import type { ServerMsg } from '../src/net/protocol';
import { PROTOCOL } from '../src/net/protocol';

const out = (...a: unknown[]) => (globalThis as { process?: { stdout: { write(s: string): void } } }).process?.stdout.write(`\nPERF ${a.join(' ')}`);

describe('simulation cost', () => {
  it('the default game (you + 2 AI vs 5, zone on): mean step well under 1 ms, 99% of steps well inside a 16.7 ms frame', () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const hero = HEROES[seed % HEROES.length].id;
      const w = createWorld({ hero, seed, zone: true, allies: squadFor(hero, seed) });
      const ap = createAutopilot(seed, 3);
      for (let i = 0; i < 90 * 60 && w.outcome === 'playing'; i++) { const inp = ap.next(w); const t0 = performance.now(); stepWorld(w, inp); times.push(performance.now() - t0); }
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length, p99 = times[Math.floor(times.length * 0.99)], p999 = times[Math.floor(times.length * 0.999)], max = times[times.length - 1];
    out('sim step ms mean', mean.toFixed(3), 'p99', p99.toFixed(3), 'p99.9', p999.toFixed(3), 'max', max.toFixed(2), 'steps', times.length);
    // Bars hold with the whole suite running beside it (the CPU is shared with every other test file); the idle
    // numbers are in docs/ROOM_ZERO_FINAL_SUPERIORITY.md section 8.
    expect(mean).toBeLessThan(1);
    expect(p99).toBeLessThan(12);
  }, 120000);
  it('A* across the venue: every pair of tactical points in under 0.5 ms each on average', () => {
    const w = createWorld({ seed: 1 });
    const t0 = performance.now();
    let n = 0;
    for (const a of TACTICAL_POINTS) for (const b of TACTICAL_POINTS) if (a !== b) { findPath(w.level, a.x, a.y, b.x, b.y); n++; }
    const each = (performance.now() - t0) / n;
    out('A* ms per path', each.toFixed(3), 'paths', n);
    expect(each).toBeLessThan(0.5);
  });
});

class Conn { bytes = 0; snaps = 0; send(m: ServerMsg) { if (m.t === 'snap') { this.bytes += JSON.stringify(m).length; this.snaps++; } } close() { /* closed */ } }

describe('game server cost', () => {
  it('two 3v3 rooms at once: a server tick (both steps, 12 snapshots every 3rd) under 3 ms on average; a snapshot under 6 KB', () => {
    let t = 0;
    const lobby = new Lobby({ now: () => t, seed: () => 9, countdownSec: 0 });
    const conns = Array.from({ length: 10 }, () => new Conn());
    const ids = conns.map((c) => lobby.connect(c));
    // 5v5 needs verified holders (tickets from the site), so the load is two 3v3 rooms: 12 players, more than one 5v5.
    ids.forEach((id, i) => { lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: `P${i}`, hero: HEROES[i % HEROES.length].id })); lobby.message(id, JSON.stringify({ t: 'queue', mode: '3v3' })); });
    const extra = [new Conn(), new Conn()];
    extra.forEach((c, i) => { const id = lobby.connect(c); lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: `X${i}`, hero: 'benja' })); lobby.message(id, JSON.stringify({ t: 'queue', mode: '3v3' })); });
    const all = [...conns, ...extra];
    const rooms = [...lobby.rooms.values()];
    expect(rooms.length).toBe(2);
    const t0 = performance.now();
    let ticks = 0;
    for (let step = 0; step < 60 * 30; step++) {
      rooms.forEach((r) => r.members.forEach((m, i) => lobby.message(m.id, JSON.stringify({ t: 'input', seq: step + 1, mx: Math.cos(step / 80 + i), my: Math.sin(step / 60 + i), aim: step / 30 + i, fire: step % 40 < 12, quiet: false, reload: false, ability: false }))));
      t += 1 / 60;
      lobby.tick();
      ticks++;
    }
    const perTick = (performance.now() - t0) / ticks;
    const snaps = all.reduce((s, c) => s + c.snaps, 0), bytes = all.reduce((s, c) => s + c.bytes, 0);
    out('server ms per tick (two 3v3 rooms, inputs parsed)', perTick.toFixed(3), 'snapshot bytes mean', (bytes / snaps).toFixed(0), 'snapshots', snaps);
    expect(perTick).toBeLessThan(3);
    expect(bytes / snaps).toBeLessThan(6000);
  }, 120000);
});
