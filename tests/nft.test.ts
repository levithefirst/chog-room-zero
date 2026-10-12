import { describe, expect, it } from 'vitest';
import { GUEST, NFT_CONFIG, adapterFromUrl, mockAdapter, resolveIdentity, type OwnershipAdapter } from '../src/nft/identity';
import { loadHistory, recordRun, type KeyValueStore } from '../src/nft/history';
import { DEFAULT_OPERATOR } from '../src/sim/operators';

const memStore = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const run = { won: true, seconds: 120, kills: 5, shots: 40, hits: 18, at: '2026-10-12T00:00:00Z' };

describe('identity adapter fallback', () => {
  it('no adapter -> guest with the default operator', async () => {
    const r = await resolveIdentity(null);
    expect(r.identity).toEqual(GUEST);
    expect(r.identity.operator).toBe(DEFAULT_OPERATOR);
  });
  it('a throwing adapter (RPC down) -> guest', async () => {
    const bad: OwnershipAdapter = { name: 'chain', ownedTokens: async () => { throw new Error('rpc down'); } };
    const r = await resolveIdentity(bad);
    expect(r.identity.kind).toBe('guest');
    expect(r.note).toMatch(/rpc down/);
  });
  it('a hanging adapter times out -> guest', async () => {
    const hang: OwnershipAdapter = { name: 'chain', ownedTokens: () => new Promise(() => {}) };
    const r = await resolveIdentity(hang, 20);
    expect(r.identity.kind).toBe('guest');
  });
  it('no tokens or a malformed id -> guest', async () => {
    expect((await resolveIdentity(mockAdapter([]))).identity.kind).toBe('guest');
    expect((await resolveIdentity(mockAdapter(['abc']))).identity.kind).toBe('guest');
  });
  it('mock token -> bound identity labelled as a mock', async () => {
    const r = await resolveIdentity(adapterFromUrl('?mockChog=42'));
    expect(r.identity.kind).toBe('bound');
    expect(r.identity.tokenId).toBe('42');
    expect(r.identity.source).toBe('mock');
    expect(r.note).toMatch(/not a real ownership check/);
  });
  it('chain config is an unfilled placeholder (UNKNOWN, never guessed)', () => {
    expect(NFT_CONFIG.chainId).toBeNull();
    expect(NFT_CONFIG.contract).toBeNull();
  });
});

describe('history', () => {
  it('guest runs write nothing', () => {
    const s = memStore();
    expect(recordRun(s, null, run)).toBeNull();
    expect(s.data.size).toBe(0);
  });
  it('bound runs accumulate per token', () => {
    const s = memStore();
    recordRun(s, '7', run);
    const h = recordRun(s, '7', { ...run, won: false, kills: 2 })!;
    expect(h).toMatchObject({ runs: 2, wins: 1, deaths: 1, kills: 7, bestWinSeconds: 120 });
    expect(loadHistory(s, '8').runs).toBe(0);
  });
  it('corrupt storage starts fresh instead of crashing', () => {
    const s = memStore();
    s.data.set('chog-room-zero:history:7', '{not json');
    expect(loadHistory(s, '7').runs).toBe(0);
  });
});
