// SB telemetry (src/sim/telemetry.ts) and mobile lifecycle (OnlineSession.release): counters that say whether a match
// worked, and an online match never keeps walking you after the page hides.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { createWorld, stepWorld, IDLE_INPUT } from '../src/sim/world';
import { createIntel, senseFor } from '../src/sim/intel';
import { gaitOf } from '../src/sim/insight';
import { createTelemetry, stepTelemetry, summary } from '../src/sim/telemetry';
import { OnlineSession } from '../src/net/client';

const OPEN = ['########################', ...Array.from({ length: 10 }, () => '#......................#'), '########################'];

describe('match telemetry', () => {
  it('counts time per gait, gait changes and every rung a hostile enters', () => {
    const w = createWorld({ map: OPEN, seed: 2, bots: [{ name: 'H', hero: 'benja', patrol: [[9, 5]], flanker: false }] });
    const p = w.actors[0]; p.x = 4.5; p.y = 5.5; p.hp = p.maxHp = 1e9;
    const intel = createIntel(), tm = createTelemetry();
    for (let i = 0; i < 240; i++) {
      stepWorld(w, { ...IDLE_INPUT, moveX: i < 120 ? 0 : 1, aim: i < 60 ? 0 : Math.PI }, TUNING.simStepSeconds, () => ({ ...IDLE_INPUT, aim: Math.PI }));
      senseFor(w, p, intel, TUNING.simStepSeconds);
      stepTelemetry(tm, gaitOf(p), intel, TUNING.simStepSeconds);
    }
    expect(tm.seconds).toBeCloseTo(4, 1);
    expect(tm.gait.still).toBeGreaterThan(1.5);
    expect(tm.gait.run).toBeGreaterThan(1);
    expect(tm.gaitChanges).toBeGreaterThanOrEqual(1);
    expect(tm.info.visible).toBeGreaterThanOrEqual(1);
    expect(tm.info.last_known).toBeGreaterThanOrEqual(1);
    expect(tm.firstContactS).not.toBeNull();
    const s = summary(tm);
    expect(s.gait).toMatch(/^\d+\/\d+\/\d+$/);
  });
});

describe('mobile lifecycle: the page hides during an online match', () => {
  it('release() sends an idle input at once (not throttled), so the server stops walking you', () => {
    const sent: string[] = [];
    class FakeWS { static OPEN = 1; readyState = 1; onopen: unknown; onmessage: unknown; onclose: unknown; send(m: string) { sent.push(m); } close() {} }
    const g = globalThis as unknown as { WebSocket: unknown };
    const prev = g.WebSocket;
    g.WebSocket = FakeWS;
    try {
      const s = new OnlineSession('ws://test/ws', () => 'Me', () => 'benja', null);
      s.connect();
      s.state = 'match';
      s.sendInput({ ...IDLE_INPUT, moveY: -1 }, 1000);
      s.sendInput({ ...IDLE_INPUT, moveY: -1 }, 1001); // throttled: inside 1/30 s
      expect(sent.filter((m) => m.includes('"t":"input"')).length).toBe(1);
      s.release(0.5);
      const last = JSON.parse(sent[sent.length - 1]);
      expect(last).toMatchObject({ t: 'input', mx: 0, my: 0, fire: false, aim: 0.5, seq: 2 });
    } finally { g.WebSocket = prev; }
  });
});
