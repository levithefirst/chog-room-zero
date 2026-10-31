// FS (owner 2026-10-17): "ENTER WITH CHOG must open a proper wallet chooser ... extremely robust ... no dead ends".
// The wallet layer (src/ui/auth.ts) driven with fake EIP-1193 wallets: discovery (EIP-6963 and the old
// window.ethereum), logos and announced icons, recommendations and mobile links, every wallet answer the flow can get
// (approve, reject, a request already open, no answer, an unknown network wrapped the MetaMask Mobile way), account and
// network changes, and the sheet: every waiting state can be left. A real wallet extension is NOT tested here.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { chogHtml, authHtml, noWalletHtml } from '../src/ui/hub';
import {
  CHOG_ERRORS, MONAD_PARAMS, WALLET_WAIT_MS, chogConnect, chogNetwork, chogPickAccount, chogSign, discoverWallets, isMobileBrowser,
  safeIcon, safeName, walletCode, walletOffers, walletSignIn, watchWallet, type ChogStep,
} from '../src/ui/auth';

type Handler = (params?: unknown[]) => unknown;
class FakeWallet {
  calls: string[] = [];
  handlers: Record<string, Handler> = {};
  listeners = new Map<string, Set<(...a: unknown[]) => void>>();
  chain = '0x1';
  constructor(h: Record<string, Handler> = {}) {
    this.handlers = {
      eth_requestAccounts: () => ['0x2222222222222222222222222222222222222222'],
      eth_chainId: () => this.chain,
      wallet_switchEthereumChain: (p) => { const id = (p![0] as { chainId: string }).chainId; if (id !== '0x8f' || !this.knows) throw { code: 4902 }; this.chain = id; return null; },
      wallet_addEthereumChain: () => { this.knows = true; this.chain = '0x8f'; return null; },
      personal_sign: () => '0xsig',
      ...h,
    };
  }
  knows = true;
  async request({ method, params }: { method: string; params?: unknown[] }) {
    this.calls.push(method);
    const f = this.handlers[method];
    if (!f) throw { code: -32601, message: 'method not found' };
    return f(params);
  }
  on(e: string, f: (...a: unknown[]) => void) { if (!this.listeners.has(e)) this.listeners.set(e, new Set()); this.listeners.get(e)!.add(f); }
  removeListener(e: string, f: (...a: unknown[]) => void) { this.listeners.get(e)?.delete(f); }
  emit(e: string, ...a: unknown[]) { for (const f of this.listeners.get(e) ?? []) f(...a); }
}

const win = new EventTarget() as EventTarget & { ethereum?: unknown };
const announcers: (() => void)[] = [];
function announce(rdns: string, name: string, provider: FakeWallet, icon = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=') {
  const f = () => win.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid: `u-${rdns}`, name, rdns, icon }, provider } }));
  announcers.push(f);
  win.addEventListener('eip6963:requestProvider', f);
  f();
}
beforeAll(() => { (globalThis as { window?: unknown }).window = win; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const mm = new FakeWallet(), legacy = new FakeWallet(), odd = new FakeWallet(), evil = new FakeWallet();

describe('finding wallets', () => {
  it('an old injected window.ethereum is offered by its flags when no wallet announces itself', async () => {
    win.ethereum = Object.assign(legacy, { isRabby: true });
    const w = await discoverWallets(5);
    expect(w).toEqual([expect.objectContaining({ id: 'legacy', rdns: 'io.rabby', name: 'Rabby' })]);
    expect(w[0].logo).toMatch(/^<svg/);
  });
  it('every EIP-6963 wallet is offered, known ones first with our logo; others with their own icon if it is a safe image', async () => {
    announce('com.example.wallet', 'Example\u0007 Wallet with a very very long name indeed', odd, 'data:image/png;base64,iVBORw0KGgo=');
    announce('io.metamask', 'Totally MetaMask', mm);
    announce('io.evil', 'Evil', evil, 'javascript:alert(1)');
    const w = await discoverWallets(5);
    expect(w.map((x) => x.id)).toEqual(['io.metamask', 'com.example.wallet', 'io.evil']);
    expect(w.some((x) => x.id === 'legacy')).toBe(false); // announced wallets replace the old injection
    const [m, e, x] = w;
    expect(m.name).toBe('MetaMask'); // a known id keeps its own name, whatever it announces
    expect(m.logo).toMatch(/^<svg aria-hidden="true"/);
    expect(e.name).toBe('Example Wallet with a very very'); // control characters gone, 32 characters at most
    expect(e.name.length).toBeLessThanOrEqual(32);
    expect(e.icon).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(x.icon).toBeNull();
  });
  it('a wallet that announces late is there the next time the sheet looks (no reload)', async () => {
    const late = new FakeWallet();
    win.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid: 'late', name: 'Phantom', rdns: 'app.phantom', icon: '' }, provider: late } }));
    expect((await discoverWallets(5)).map((x) => x.id)).toContain('app.phantom');
  });
  it('icons and names are cleaned: only data: images of safe types, no markup', () => {
    expect(safeIcon('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).not.toBeNull();
    expect(safeIcon('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull();
    expect(safeIcon('https://evil.example/x.png')).toBeNull();
    expect(safeIcon('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(safeIcon('data:image/png;base64,' + 'A'.repeat(200_000))).toBeNull();
    expect(safeName('  <b>Bad</b>  ')).toBe('<b>Bad</b>'); // escaped where it is shown (hub.ts esc)
    expect(safeName(42)).toBe('Wallet');
  });
});

describe('recommendations', () => {
  const url = 'https://chogroomzero.xyz/?squad=AB12C';
  it('a computer gets install pages; a phone gets links that open this page inside the wallet app', () => {
    const desk = walletOffers(false, url);
    expect(desk.map((o) => o.name)).toEqual(['MetaMask', 'Phantom', 'Rabby', 'Trust Wallet']);
    expect(desk[0].href).toBe('https://metamask.io/download/');
    const phone = walletOffers(true, url);
    expect(phone.map((o) => o.name)).toEqual(['MetaMask', 'Phantom', 'Trust Wallet']);
    expect(phone[0].href).toBe('https://metamask.app.link/dapp/chogroomzero.xyz/?squad=AB12C');
    expect(phone[1].href).toBe(`https://phantom.com/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent('https://chogroomzero.xyz')}`);
    expect(phone[2].href).toBe(`https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`);
    // Never recommended (Monad support or the link format not confirmed): offered only when installed.
    for (const o of [...desk, ...phone]) expect(o.name).not.toMatch(/OKX|Coinbase|WalletConnect/);
    for (const o of [...desk, ...phone]) expect(o.logo).toMatch(/^<svg/);
  });
  it('knows a phone from a computer (iPad that says Macintosh included)', () => {
    expect(isMobileBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(true);
    expect(isMobileBrowser({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7)' })).toBe(true);
    expect(isMobileBrowser({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe(true);
    expect(isMobileBrowser({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 })).toBe(false);
  });
});

describe('wallet answers', () => {
  it('error codes, including the ones mobile wallets wrap', () => {
    expect(walletCode({ code: -32603, data: { originalError: { code: 4902 } } })).toBe(4902);
    expect(walletCode({ code: 4001 })).toBe(4001);
    expect(walletCode({ message: 'MetaMask Tx Signature: User denied transaction signature.' })).toBe(4001);
    expect(walletCode({ message: "Request of type 'wallet_requestPermissions' already pending for origin" })).toBe(-32002);
    expect(walletCode({ code: 'timeout' })).toBe('timeout');
  });
  it('connect: shared, rejected, a request already open, or no answer at all (locked wallet): never stuck', async () => {
    expect(await chogConnect('io.metamask')).toEqual({ address: '0x2222222222222222222222222222222222222222' });
    mm.handlers.eth_requestAccounts = () => { throw { code: 4001 }; };
    expect(await chogConnect('io.metamask')).toBe('no_account');
    mm.handlers.eth_requestAccounts = () => { throw { code: -32002, message: 'already pending' }; };
    expect(await chogConnect('io.metamask')).toBe('pending');
    mm.handlers.eth_requestAccounts = () => [];
    expect(await chogConnect('io.metamask')).toBe('no_account');
    vi.useFakeTimers();
    mm.handlers.eth_requestAccounts = () => new Promise(() => undefined);
    const p = chogConnect('io.metamask');
    await vi.advanceTimersByTimeAsync(WALLET_WAIT_MS.connect + 10);
    expect(await p).toBe('timeout');
    vi.useRealTimers();
    expect(await chogConnect('nope')).toBe('provider');
    mm.handlers.eth_requestAccounts = () => ['0x2222222222222222222222222222222222222222'];
  });
  it('network: already Monad, wrong without asking, switched, or added first when the wallet does not know Monad', async () => {
    mm.chain = '0x8f';
    expect(await chogNetwork('io.metamask', false)).toBe('ok');
    mm.chain = '0x1';
    expect(await chogNetwork('io.metamask', false)).toBe('wrong');
    expect(await chogNetwork('io.metamask', true)).toBe('ok');
    // Does not know Monad: 4902 wrapped the MetaMask Mobile way -> add (the official parameters) -> on Monad.
    mm.chain = '0x1'; mm.knows = false; mm.calls = [];
    let added: unknown = null;
    mm.handlers.wallet_switchEthereumChain = (p) => { if (!mm.knows) throw { code: -32603, data: { originalError: { code: 4902 } } }; mm.chain = (p![0] as { chainId: string }).chainId; return null; };
    mm.handlers.wallet_addEthereumChain = (p) => { added = p![0]; mm.knows = true; return null; };
    expect(await chogNetwork('io.metamask', true)).toBe('ok');
    expect(added).toEqual(MONAD_PARAMS);
    expect(MONAD_PARAMS).toMatchObject({ chainId: '0x8f', nativeCurrency: { symbol: 'MON', decimals: 18 }, rpcUrls: ['https://rpc.monad.xyz'] });
    expect(mm.calls).toEqual(['eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'eth_chainId', 'wallet_switchEthereumChain', 'eth_chainId']);
    // Adding refused / impossible, switching refused.
    mm.chain = '0x1'; mm.knows = false;
    mm.handlers.wallet_addEthereumChain = () => { throw { code: 4001 }; };
    expect(await chogNetwork('io.metamask', true)).toBe('network_rejected');
    mm.handlers.wallet_addEthereumChain = () => { throw { code: -32603, message: 'cannot add' }; };
    expect(await chogNetwork('io.metamask', true)).toBe('network_unknown');
    mm.knows = true;
    mm.handlers.wallet_switchEthereumChain = () => { throw { code: 4001 }; };
    expect(await chogNetwork('io.metamask', true)).toBe('network_rejected');
    // The wallet says yes but stays where it was.
    mm.handlers.wallet_switchEthereumChain = () => null;
    expect(await chogNetwork('io.metamask', true)).toBe('network_rejected');
    mm.handlers.wallet_switchEthereumChain = (p) => { mm.chain = (p![0] as { chainId: string }).chainId; return null; };
  });
  it('another account: the wallet\'s picker, or a plain connect where it has none', async () => {
    mm.calls = [];
    expect(await chogPickAccount('io.metamask')).toEqual({ address: '0x2222222222222222222222222222222222222222' });
    expect(mm.calls).toEqual(['wallet_requestPermissions', 'eth_requestAccounts']);
    mm.handlers.wallet_requestPermissions = () => { throw { code: 4001 }; };
    expect(await chogPickAccount('io.metamask')).toBe('no_account');
    delete mm.handlers.wallet_requestPermissions;
  });
  it('sign: the site unreachable, the signature refused, a replayed or expired challenge, and success', async () => {
    const answer = (verify: unknown, ok = true) => vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      if (u.endsWith('/challenge')) return Response.json({ message: 'chogroomzero.xyz wants you to sign in' });
      return Response.json(verify, { status: ok ? 200 : 401 });
    }));
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await chogSign('io.metamask', '0x22', () => undefined)).toBe('offline');
    answer({ identity: { provider: 'wallet', subject: '0x22', label: '0x22' } });
    mm.handlers.personal_sign = () => { throw { code: 4001 }; };
    expect(await chogSign('io.metamask', '0x22', () => undefined)).toBe('rejected');
    mm.handlers.personal_sign = () => '0xsig';
    let sent = 0;
    expect(await chogSign('io.metamask', '0x22', () => sent++)).toMatchObject({ provider: 'wallet' });
    expect(sent).toBe(1);
    answer({ error: 'replayed' }, false);
    expect(await chogSign('io.metamask', '0x22', () => undefined)).toBe('expired');
    answer({ error: 'bad_signature' }, false);
    expect(await chogSign('io.metamask', '0x22', () => undefined)).toBe('not_accepted');
    // Continue with Wallet goes the same way and never throws.
    answer({ identity: { provider: 'wallet', subject: '0x22', label: '0x22' } });
    expect(await walletSignIn('io.metamask')).toMatchObject({ provider: 'wallet' });
    mm.handlers.eth_requestAccounts = () => { throw { code: -32002 }; };
    expect(await walletSignIn('io.metamask')).toBe('pending');
    mm.handlers.eth_requestAccounts = () => ['0x2222222222222222222222222222222222222222'];
  });
  it('account, network and disconnect events reach the flow; unwatching stops them', () => {
    const got: string[] = [];
    const off = watchWallet('io.metamask', { accounts: (a) => got.push(`a:${a[0] ?? ''}`), chain: (c) => got.push(`c:${c}`), disconnect: () => got.push('d') });
    mm.emit('accountsChanged', ['0x3333']); mm.emit('chainChanged', '0x8f'); mm.emit('accountsChanged', []); mm.emit('disconnect');
    off();
    mm.emit('accountsChanged', ['0x4444']);
    expect(got).toEqual(['a:0x3333', 'c:0x8f', 'a:', 'd']);
  });
});

describe('the chooser never strands the player', () => {
  const wallets = [{ id: 'io.metamask', name: 'MetaMask', rdns: 'io.metamask', logo: '<svg id="mm"></svg>', icon: null }, { id: 'x', name: 'X<script>', rdns: 'x', logo: null, icon: 'data:image/png;base64,AAAA' }];
  const sheet = (step: ChogStep, o = {}) => chogHtml({ step, wallets, wallet: 'MetaMask', ready: true, off: false, ...o }, 'chogroomzero.xyz');
  it('wallets show their mark and name (escaped); a detected one says so', () => {
    const h = sheet({ s: 'pick' });
    expect(h).toMatch(/data-chogwallet="io\.metamask"><span class="wmark"><svg id="mm">/);
    expect(h).toContain('<img src="data:image/png;base64,AAAA" alt=""');
    expect(h).toContain('X&lt;script&gt;');
    expect(h).toMatch(/Detected/);
  });
  it('every waiting state has Cancel; every stop has a way on', () => {
    for (const st of [{ s: 'connecting', wallet: 'MetaMask' }, { s: 'switching', wallet: 'MetaMask' }, { s: 'checking', address: '0x2222222222222222222222222222222222222222' }, { s: 'signing', count: 1, best: 'Rare' }, { s: 'verifying' }, { s: 'loading' }] as ChogStep[]) {
      expect(sheet(st), st.s).toMatch(/data-act="chog-cancel"/);
    }
    for (const code of Object.keys(CHOG_ERRORS) as (keyof typeof CHOG_ERRORS)[]) expect(sheet({ s: 'error', code })).toMatch(/data-act="chog-retry".*data-act="chog-other"/s);
    const none = sheet({ s: 'none', address: '0x2222222222222222222222222222222222222222' });
    expect(none).toMatch(/0x2222…2222 holds no Chog Genesis on Monad/);
    expect(none).toMatch(/data-act="chog-account"/);
    expect(none).toMatch(/data-act="chog-other"/);
    expect(none).toMatch(/data-act="chog-free"/);
    expect(sheet({ s: 'network', wallet: 'MetaMask' })).toMatch(/data-act="chog-switch".*data-act="chog-other"/s);
  });
  it('no wallet: a computer gets install links and Look again; a phone gets open-in-app links', () => {
    const desk = sheet({ s: 'pick' }, { wallets: [] });
    expect(desk).toMatch(/Install one, then look again/);
    expect(desk).toMatch(/href="https:\/\/metamask\.io\/download\/"[^>]*target="_blank"/);
    expect(desk).toMatch(/data-act="wallet-rescan"/);
    const phone = sheet({ s: 'pick' }, { wallets: [], mobile: true, pageUrl: 'https://chogroomzero.xyz/' });
    expect(phone).toMatch(/Open Room Zero in your wallet app/);
    expect(phone).toMatch(/Open in MetaMask/);
    expect(phone).toMatch(/link\.trustwallet\.com\/open_url/);
    expect(noWalletHtml(true, 'https://chogroomzero.xyz/')).not.toMatch(/target="_blank"/); // a phone hands the link to the app
  });
  it('Continue with Wallet lists several wallets with marks, disabled while a request is open', () => {
    const base = { config: { google: true, wallet: true }, session: [], wallets, busy: true, message: 'Approve in your wallet', pickWallet: true };
    const h = authHtml(base, 'chogroomzero.xyz');
    expect(h).toMatch(/data-wallet="io\.metamask" disabled/);
    expect(h).toMatch(/data-act="signin-wallet" disabled/);
  });
});
