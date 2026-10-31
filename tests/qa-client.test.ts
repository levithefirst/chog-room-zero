// Final QA regressions in the online client (src/net/client.ts) with a fake WebSocket: Cancel while still connecting;
// a squad error that outlived the next squad action.
import { describe, expect, it, vi } from 'vitest';
import { OnlineSession } from '../src/net/client';

class FakeWS {
  static OPEN = 1; static CONNECTING = 0;
  readyState = 0; onopen: (() => void) | null = null; onclose: ((e: { code: number; reason: string }) => void) | null = null; onmessage = null;
  sent: string[] = [];
  constructor(public url: string) {}
  send(m: string) { this.sent.push(m); }
  close() { this.readyState = 3; this.onclose?.({ code: 1000, reason: '' }); }
}

describe('online client', () => {
  it('Cancel while the game server is still being reached stops trying and returns to idle (was stuck "connecting")', () => {
    vi.stubGlobal('WebSocket', FakeWS);
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('')));
    const s = new OnlineSession('ws://127.0.0.1:9/ws', () => 'Tester', () => 'kettle', null);
    s.joinQueue('1v1');
    expect(s.state).toBe('connecting');
    s.leave();
    expect(s.state).toBe('offline');
    expect(s.queue).toBeNull();
    vi.unstubAllGlobals();
  });

  it('a squad error ("no squad with that code") is cleared by the next squad action, so a good join shows no stale error', () => {
    vi.stubGlobal('WebSocket', FakeWS);
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('')));
    const s = new OnlineSession('ws://127.0.0.1:9/ws', () => 'Tester', () => 'kettle', null);
    const msg = (m: object) => (s as unknown as { onMsg(m: object): void }).onMsg(m);
    s.partyOp('join', 'ZZZZZ');
    const ws = (s as unknown as { ws: FakeWS }).ws;
    ws.readyState = 1;
    msg({ t: 'welcome', id: 1, token: 't' });
    msg({ t: 'error', code: 'party-not-found', message: 'No squad with that code.' });
    expect(s.message).toBe('No squad with that code.');
    s.partyOp('join', 'ABCDE');
    expect(s.message).toBe('');
    expect(JSON.parse(ws.sent[ws.sent.length - 1])).toEqual({ t: 'party', op: 'join', code: 'ABCDE' });
    vi.unstubAllGlobals();
  });
});
