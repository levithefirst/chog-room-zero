// CF "Enter with CHOG": ownership is ELIGIBILITY (POST /api/game/eligibility, read-only, signs nobody in), the wallet
// signature is AUTHENTICATION (the existing /api/auth/wallet routes). Every sheet state speaks plain words.
import { describe, expect, it } from 'vitest';
import { handleGame, type Deps } from '../api/_lib/game-api';
import { CONTRACT, selector } from '../api/_lib/chain';
import { chogHtml, type ChogSheet } from '../src/ui/hub';
import { CHOG_ERRORS, type ChogError, type ChogStep } from '../src/ui/auth';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const HOST = 'chogroomzero.xyz';
const HOLDER = '0x2222222222222222222222222222222222222222';
const word = (n: number) => n.toString(16).padStart(64, '0');
let down = false;
const fakeFetch = async (_url: string, init: RequestInit): Promise<Response> => {
  if (down) throw new Error('fetch failed');
  const batch = JSON.parse(String(init.body)) as { id: number; method: string; params: [{ to: string; data: string }] }[];
  return Response.json(batch.map((c) => {
    if (c.method === 'eth_chainId') return { id: c.id, result: '0x8f' };
    if (c.method === 'eth_blockNumber') return { id: c.id, result: '0x10' };
    const { to, data } = c.params[0];
    expect(to).toBe(CONTRACT);
    if (data.startsWith(selector('tokensOfOwner(address)'))) {
      const ids = '0x' + data.slice(10 + 24) === HOLDER ? [5, 900] : [];
      return { id: c.id, result: '0x' + word(32) + word(ids.length) + ids.map(word).join('') };
    }
    if (data.startsWith(selector('metadataId(uint256)'))) return { id: c.id, result: '0x' + word(parseInt(data.slice(10), 16) === 5 ? 53 : 1462) };
    return { id: c.id, error: { message: 'unknown' } };
  }));
};
const deps: Deps = { env: { AUTH_SECRET: SECRET, AUTH_ORIGIN: `https://${HOST}` }, db: async () => null, fetch: fakeFetch, now: () => Date.now() };
const post = async (body: object, origin: string | null = `https://${HOST}`) => {
  const h = new Headers({ 'content-type': 'application/json' });
  if (origin) h.set('origin', origin);
  const r = await handleGame(new Request(`https://${HOST}/api/game/eligibility`, { method: 'POST', headers: h, body: JSON.stringify(body) }), 'eligibility', deps);
  return { status: r.status, cookie: r.headers.get('set-cookie'), j: (await r.json()) as Record<string, unknown> };
};

describe('eligibility: CHOG ownership before the signature', () => {
  it('a holder: count and best tier (Blaze is a 1:1); no cookie, so nobody is signed in by it', async () => {
    const r = await post({ address: HOLDER });
    expect(r.status).toBe(200);
    expect(r.j).toEqual({ ok: true, count: 2, best: '1:1' });
    expect(r.cookie).toBeNull();
  });
  it('a wallet without a Chog: count 0', async () => {
    expect((await post({ address: '0x3333333333333333333333333333333333333333' })).j).toEqual({ ok: true, count: 0, best: null });
  });
  it('refuses a bad address and a foreign page; Monad down fails closed', async () => {
    expect((await post({ address: 'nope' })).status).toBe(400);
    expect((await post({ address: HOLDER }, 'https://evil.example')).status).toBe(403);
    down = true;
    const r = await post({ address: HOLDER });
    down = false;
    expect(r.status).toBe(503);
    expect(r.j.error).toBe('chain_unavailable');
  });
});

describe('the Enter with CHOG sheet', () => {
  const sheet = (step: ChogStep, o: Partial<ChogSheet> = {}) => chogHtml({ step, wallets: [{ id: 'io.metamask', name: 'MetaMask', rdns: 'io.metamask', logo: '<svg></svg>', icon: null }], wallet: 'MetaMask', ready: true, off: false, ...o }, HOST);
  const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  it('every state names where it is, in plain words', () => {
    expect(text(sheet({ s: 'pick' }))).toMatch(/Your Chog is your operator/);
    expect(sheet({ s: 'pick' })).toMatch(/data-chogwallet="io.metamask"/);
    expect(text(sheet({ s: 'pick' }, { wallets: [] }))).toMatch(/No wallet in this browser/);
    expect(text(sheet({ s: 'pick' }, { ready: false }))).toMatch(/Looking for wallets/);
    expect(text(sheet({ s: 'pick' }, { off: true }))).toMatch(/Sign-in is not available right now/);
    expect(text(sheet({ s: 'connecting', wallet: 'MetaMask' }))).toMatch(/Connecting to MetaMask/);
    expect(text(sheet({ s: 'network', wallet: 'MetaMask' }))).toMatch(/Switch networks to continue\./);
    expect(text(sheet({ s: 'checking', address: HOLDER }))).toMatch(/Looking for your Chog/);
    expect(text(sheet({ s: 'none', address: HOLDER }))).toMatch(/CHOG not found in this wallet\./);
    expect(text(sheet({ s: 'signing', count: 2, best: '1:1' }))).toMatch(/2 Chog found · best 1:1.*free and sends nothing/);
    expect(text(sheet({ s: 'verifying' }))).toMatch(/Checking your signature/);
    expect(text(sheet({ s: 'done', name: 'Blaze' }))).toMatch(/CHOG verified\. Blaze/);
    expect(sheet({ s: 'none', address: HOLDER })).toMatch(/data-act="chog-free">Play free/);
  });
  it('errors are short human sentences with a way on; never RPC, stack or contract words', () => {
    for (const code of Object.keys(CHOG_ERRORS) as ChogError[]) {
      const h = sheet({ s: 'error', code });
      expect(text(h)).toContain(CHOG_ERRORS[code]);
      expect(h).toMatch(/data-act="chog-retry"/);
      expect(CHOG_ERRORS[code]).not.toMatch(/rpc|revert|stack|0x|undefined|exception|null/i);
      expect(CHOG_ERRORS[code].length).toBeLessThan(70);
    }
    expect(CHOG_ERRORS.rejected).toBe('Signature cancelled.');
    expect(CHOG_ERRORS.network_rejected).toBe('Switch networks to continue.');
    expect(CHOG_ERRORS.provider).toBe('Something went wrong. Try again.');
  });
  it('the step track moves forward: wallet, chog, signature, room zero', () => {
    const now = (h: string) => /<li class="now">([^<]+)<\/li>/.exec(h)?.[1];
    expect(now(sheet({ s: 'pick' }))).toBe('Wallet');
    expect(now(sheet({ s: 'checking', address: HOLDER }))).toBe('Chog');
    expect(now(sheet({ s: 'signing', count: 1, best: null }))).toBe('Signature');
    expect(now(sheet({ s: 'loading' }))).toBe('Room Zero');
  });
});
