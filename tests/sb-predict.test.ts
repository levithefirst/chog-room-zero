// SB own-movement prediction (src/net/predict.ts) against the REAL server rules (server/room.ts Lobby) through a
// simulated network with latency: inputs reach the server rtt/2 late, snapshots come back rtt/2 late. Measures how
// soon the drawn operator answers the stick, and how far the drawn spot is from where the server really has you.
// Simulated network, one process: NOT a real phone on a real mobile network (the owner's playtest decides the feel).
import { describe, expect, it } from 'vitest';
import { Lobby } from '../server/room';
import { TUNING } from '../src/config/tuning';
import { ROOM_ZERO } from '../src/config/map';
import { parseLevel } from '../src/sim/level';
import { heroById } from '../src/config/heroes';
import { Predictor } from '../src/net/predict';
import type { ServerMsg } from '../src/net/protocol';
import type { ActorInput } from '../src/sim/world';
import { PROTOCOL } from '../src/net/protocol';

const STEP = TUNING.simStepSeconds;

function run(rttMs: number, predict: boolean, seconds = 12, jitterMs = 0) {
  let t = 0;
  const lobby = new Lobby({ now: () => t, seed: () => 7, countdownSec: 0 });
  const half = rttMs / 2000;
  // Jitter: each message up to jitterMs/2 later than the base half trip, in order (a WebSocket is TCP: late, never shuffled).
  let rng = 12345, lastDown = 0, lastUp = 0;
  const late = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return (rng / 0x7fffffff) * jitterMs / 2000; };
  const downAt = () => (lastDown = Math.max(lastDown, t + half + late()));
  const upAt = () => (lastUp = Math.max(lastUp, t + half + late()));
  const down: { at: number; m: ServerMsg }[] = [];
  const mk = (name: string) => {
    const mine = name === 'Me';
    const id = lobby.connect({ send: (m: ServerMsg) => { if (mine) down.push({ at: downAt(), m: JSON.parse(JSON.stringify(m)) as ServerMsg }); }, close: () => undefined });
    lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name, hero: 'benja' }));
    lobby.message(id, JSON.stringify({ t: 'queue', mode: '1v1' }));
    return id;
  };
  const me = mk('Me'), other = mk('Other');
  const up: { at: number; raw: string }[] = [];
  const level = parseLevel(ROOM_ZERO);
  const pred = new Predictor();
  let you = -1, seq = 0, frame = 0;
  let server: { x: number; y: number } | null = null, serverAt = 0;
  const truth: { t: number; x: number; y: number }[] = [];
  const errs: number[] = [];
  const drawnHist: { t: number; x: number; y: number; frame: number }[] = [];
  let moveFrame = -1, answeredAt = -1;
  for (let f = 0; f < seconds * 60; f++) {
    t += STEP;
    frame++;
    // The stick: still for 1 s, then a walk east 1.2 s, north 1.2 s, west, south, repeating (turns and stops).
    const leg = Math.floor((frame - 60) / 72) % 4;
    const inp: ActorInput = frame < 60 ? { moveX: 0, moveY: 0, quiet: false, aim: 0, firing: false, reload: false, ability: false }
      : { moveX: [1, 0, -1, 0][leg], moveY: [0, -1, 0, 1][leg], quiet: false, aim: 0, firing: false, reload: false, ability: false };
    if (frame === 60) moveFrame = frame;
    if (frame % 2 === 0) {
      seq++;
      pred.sent(seq, inp);
      up.push({ at: upAt(), raw: JSON.stringify({ t: 'input', seq, mx: inp.moveX, my: inp.moveY, aim: inp.aim, fire: false, quiet: false, reload: false, ability: false }) });
    }
    while (up.length && up[0].at <= t) lobby.message(me, up.shift()!.raw);
    lobby.message(other, JSON.stringify({ t: 'ping', at: t }));
    lobby.tick();
    const room = (lobby as unknown as { rooms: Map<string, { world: { actors: { x: number; y: number }[] } }> }).rooms.values().next().value;
    if (room && you >= 0) truth.push({ t, x: room.world.actors[you].x, y: room.world.actors[you].y });
    while (down.length && down[0].at <= t) {
      const m = down.shift()!.m;
      if (m.t === 'match') you = m.you;
      if (m.t !== 'snap' || you < 0) continue;
      const s = m.actors.find((a) => a.id === you)!;
      server = { x: s.x, y: s.y }; serverAt = t;
      if (predict) pred.reconcile(level, { x: s.x, y: s.y, vx: s.vx, vy: s.vy, hero: heroById('benja'), slowLeft: 0, slowMul: 1, dashLeft: 0, dashX: 0, dashY: 0, downed: false }, m.ack!, m.as ?? 0);
    }
    if (!server) continue;
    // What the player sees of themself now.
    pred.advance(level, STEP);
    const drawn = predict && pred.drawn() ? pred.drawn()! : { x: server.x, y: server.y };
    void serverAt;
    drawnHist.push({ t, x: drawn.x, y: drawn.y, frame });
    if (answeredAt < 0 && frame >= moveFrame && Math.hypot(drawn.x - truth[0].x, drawn.y - truth[0].y) > 0.05) answeredAt = frame;
  }
  // Each drawn frame against where the server had you rtt/2 later (once the inputs you had sent by then arrived).
  for (const d of drawnHist) {
    if (d.frame <= 70) continue;
    const ahead = truth.find((q) => q.t >= d.t + half - 1e-9);
    if (ahead) errs.push(Math.hypot(d.x - ahead.x, d.y - ahead.y));
  }
  errs.sort((a, b) => a - b);
  return { answerMs: Math.round((answeredAt - moveFrame) * STEP * 1000), meanErr: +(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(3), p95Err: +errs[Math.floor(errs.length * 0.95)].toFixed(3), snaps: pred.snaps };
}

describe('own movement online: predicted vs waiting on the server', () => {
  it('a jittery 200 ms mobile link (+0-120 ms per message): corrections blend, none has to snap', () => {
    const on = run(200, true, 12, 120), off = run(200, false, 12, 120);
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (env.SB_PREDICT_OUT) (globalThis as { process?: { stdout: { write(s: string): void } } }).process?.stdout.write(`SB_PREDICT jitter ${JSON.stringify({ predicted: on, waiting: off })}\n`);
    expect(on.answerMs).toBeLessThanOrEqual(34);
    expect(on.meanErr).toBeLessThan(0.2);
    expect(on.meanErr).toBeLessThan(off.meanErr / 3);
    expect(on.snaps).toBe(0);
  });
  const rows: Record<string, unknown> = {};
  for (const rtt of [80, 200, 350]) {
    it(`${rtt} ms round trip: the operator answers the stick at once and stays where the server will have it`, () => {
      const on = run(rtt, true), off = run(rtt, false);
      rows[rtt] = { predicted: on, waiting: off };
      const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
      if (env.SB_PREDICT_OUT) (globalThis as { process?: { stdout: { write(s: string): void } } }).process?.stdout.write(`SB_PREDICT ${rtt} ${JSON.stringify(rows[rtt])}\n`);
      // Answers within two frames, whatever the network; waiting takes the round trip plus a snapshot.
      expect(on.answerMs).toBeLessThanOrEqual(34);
      expect(off.answerMs).toBeGreaterThanOrEqual(rtt * 0.8);
      // Drawn where the server will have you: within a few cm on average (the waiting view lags a whole round trip).
      expect(on.meanErr).toBeLessThan(0.12);
      expect(on.meanErr).toBeLessThan(off.meanErr / 3);
      expect(on.snaps).toBe(0);
    });
  }
});
