// Browser side of sign-in (RC-7). Talks to /api/auth/* (see api/_lib/auth.ts). Optional: the game never waits on it
// and plays fully as a guest. Wallets are found with EIP-6963 (each extension announces itself, with its own name and
// icon); every announced wallet is offered, since each speaks the same EIP-1193 requests this flow uses
// (eth_requestAccounts, eth_chainId, wallet_switchEthereumChain / wallet_addEthereumChain, personal_sign). Connecting a
// wallet does nothing by itself: sign-in needs the signed challenge to verify. FS (owner 2026-10-17): a real chooser
// with logos, recommendations and mobile links that are verified to open a dapp, and no dead ends (every wallet
// request has a timeout and a plain-words outcome).
import { WALLET_LOGOS } from './walletLogos';

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, f: (...a: unknown[]) => void): void;
  removeListener?(event: string, f: (...a: unknown[]) => void): void;
}

interface Announced { info: { uuid: string; name: string; rdns: string; icon?: string }; provider: Eip1193 }

/** A wallet in this browser: `logo` is our vendored mark for a known wallet, else `icon` is the one it announced. */
export interface WalletChoice { id: string; name: string; rdns: string; logo: string | null; icon: string | null }

/**
 * Wallets we know by their EIP-6963 id: their own name (an extension cannot rename itself MetaMask unless it also takes
 * MetaMask's id), a logo, and for some an install page and a mobile link that opens this page in the wallet's own
 * browser. Recommended only where Monad support and the link format are documented (2026-10-17: MetaMask custom
 * network, Phantom and Trust Wallet native Monad, Rabby custom network; links: metamask.app.link, Phantom
 * docs "browse", Trust Wallet docs "open_url"). Coinbase Wallet, OKX Wallet, Zerion, Backpack and Rainbow are listed
 * when they are installed, never recommended (Monad support or the link format not confirmed).
 */
export const WALLETS: Record<string, { name: string; install?: string; mobile?: (url: string) => string; rank: number }> = {
  'io.metamask': { name: 'MetaMask', install: 'https://metamask.io/download/', mobile: (u) => `https://metamask.app.link/dapp/${u.replace(/^https?:\/\//, '')}`, rank: 1 },
  'app.phantom': { name: 'Phantom', install: 'https://phantom.com/download', mobile: (u) => `https://phantom.com/ul/browse/${encodeURIComponent(u)}?ref=${encodeURIComponent(new URL(u).origin)}`, rank: 2 },
  'io.rabby': { name: 'Rabby', install: 'https://rabby.io/', rank: 3 },
  'com.trustwallet.app': { name: 'Trust Wallet', install: 'https://trustwallet.com/download', mobile: (u) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(u)}`, rank: 4 },
  'com.coinbase.wallet': { name: 'Coinbase Wallet', rank: 5 },
  'com.okex.wallet': { name: 'OKX Wallet', rank: 6 },
  'io.zerion.wallet': { name: 'Zerion', rank: 7 },
  'app.backpack': { name: 'Backpack', rank: 8 },
  'me.rainbow': { name: 'Rainbow', rank: 9 },
};

/** A wallet we suggest when none is installed: get it (desktop) or open this page in it (phone). */
export interface WalletOffer { rdns: string; name: string; logo: string; href: string }
export function walletOffers(mobile: boolean, pageUrl: string): WalletOffer[] {
  return Object.entries(WALLETS)
    .filter(([, w]) => (mobile ? w.mobile : w.install))
    .sort((a, b) => a[1].rank - b[1].rank)
    .map(([rdns, w]) => ({ rdns, name: w.name, logo: WALLET_LOGOS[rdns] ?? '', href: mobile ? w.mobile!(pageUrl) : w.install! }));
}
/** A phone or tablet browser (where wallets are apps, not extensions). */
export const isMobileBrowser = (nav: { userAgent: string; maxTouchPoints?: number } = navigator) =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1);

/** An announced icon we can show: a data: image URI of a safe type, not huge. Anything else is dropped. */
export function safeIcon(icon: unknown): string | null {
  if (typeof icon !== 'string' || icon.length > 100_000) return null;
  return /^data:image\/(svg\+xml|png|webp|jpeg|gif)(;base64)?,[A-Za-z0-9+/=%._~:;,'()*!@$&\-#?\s]*$/.test(icon) && !/["<>\\]/.test(icon) ? icon : null;
}
/** An announced name, cleaned: no control characters, at most 32 characters. */
export const safeName = (n: unknown) => (typeof n === 'string' ? n.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32).trim() : '') || 'Wallet';

const found = new Map<string, { choice: WalletChoice; provider: Eip1193 }>();
let listening = false;
function onAnnounce(e: Event) {
  const d = (e as CustomEvent<Announced>).detail;
  if (!d?.info || !d.provider || typeof d.provider.request !== 'function') return;
  const rdns = typeof d.info.rdns === 'string' ? d.info.rdns.slice(0, 80) : '';
  const known = WALLETS[rdns];
  const id = rdns || `uuid:${String(d.info.uuid).slice(0, 40)}`;
  found.set(id, { provider: d.provider, choice: { id, rdns, name: known?.name ?? safeName(d.info.name), logo: WALLET_LOGOS[rdns] ?? null, icon: WALLET_LOGOS[rdns] ? null : safeIcon(d.info.icon) } });
}

/**
 * Ask installed wallets to announce themselves; resolves after a short wait with every wallet found, known ones first.
 * The listener stays on, so a wallet that announces late (a slow extension) is there the next time.
 */
export function discoverWallets(waitMs = 300): Promise<WalletChoice[]> {
  if (!listening) { window.addEventListener('eip6963:announceProvider', onAnnounce); listening = true; }
  return new Promise((resolve) => {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => {
      // Older injectors without EIP-6963 (and some in-app wallet browsers): one window.ethereum, named by its flags.
      const legacy = (window as unknown as { ethereum?: Eip1193 & Record<string, unknown> }).ethereum;
      const announced = [...found.keys()].some((k) => k !== 'legacy');
      if (!announced && legacy && typeof legacy.request === 'function') {
        const rdns = legacy.isRabby ? 'io.rabby' : legacy.isPhantom ? 'app.phantom' : legacy.isTrust || legacy.isTrustWallet ? 'com.trustwallet.app'
          : legacy.isCoinbaseWallet ? 'com.coinbase.wallet' : legacy.isOkxWallet || legacy.isOKExWallet ? 'com.okex.wallet' : legacy.isZerion ? 'io.zerion.wallet' : legacy.isMetaMask ? 'io.metamask' : '';
        found.set('legacy', { provider: legacy, choice: { id: 'legacy', rdns, name: WALLETS[rdns]?.name ?? 'Browser wallet', logo: WALLET_LOGOS[rdns] ?? null, icon: null } });
      } else if (announced) found.delete('legacy');
      resolve([...found.values()].map((w) => w.choice).sort((a, b) => (WALLETS[a.rdns]?.rank ?? 99) - (WALLETS[b.rdns]?.rank ?? 99)));
    }, waitMs);
  });
}

/** Wallet events the flow follows: the account or network changed in the wallet, or it disconnected. */
export function watchWallet(id: string, on: { accounts?: (a: string[]) => void; chain?: (hex: string) => void; disconnect?: () => void }): () => void {
  const p = found.get(id)?.provider;
  if (!p?.on) return () => undefined;
  const acc = (a: unknown) => on.accounts?.(Array.isArray(a) ? a.map(String) : []);
  const ch = (c: unknown) => on.chain?.(String(c));
  const dis = () => on.disconnect?.();
  p.on('accountsChanged', acc);
  p.on('chainChanged', ch);
  p.on('disconnect', dis);
  return () => { p.removeListener?.('accountsChanged', acc); p.removeListener?.('chainChanged', ch); p.removeListener?.('disconnect', dis); };
}

/** The wallet's error code, including the ones wrapped by mobile wallets (MetaMask Mobile: -32603 with the real one inside). */
export function walletCode(e: unknown): number | 'timeout' | null {
  const x = e as { code?: unknown; data?: { originalError?: { code?: unknown }; code?: unknown }; cause?: { code?: unknown }; message?: unknown };
  if (x?.code === 'timeout') return 'timeout';
  for (const c of [x?.data?.originalError?.code, x?.cause?.code, x?.data?.code, x?.code]) if (typeof c === 'number' && c !== -32603) return c;
  const m = typeof x?.message === 'string' ? x.message : '';
  if (/user (rejected|denied|cancel)/i.test(m)) return 4001;
  if (/already pending|request.*pending/i.test(m)) return -32002;
  if (/unrecognized chain|not been added|unknown chain|4902/i.test(m)) return 4902;
  return typeof x?.code === 'number' ? x.code : null;
}

/** A wallet request that never hangs the flow: after `ms` it rejects with code 'timeout' (the wallet may still answer later). */
function ask<T>(p: Eip1193, method: string, params: unknown[] | undefined, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject({ code: 'timeout' }), ms);
    p.request({ method, ...(params ? { params } : {}) }).then((v) => { clearTimeout(t); resolve(v as T); }, (e) => { clearTimeout(t); reject(e); });
  });
}
/** fetch with a timeout (the site and Monad reads can be slow, never endless). */
const fetchT = (url: string, init: RequestInit, ms = 15000) => fetch(url, { ...init, signal: AbortSignal.timeout(ms) });

export interface ServerIdentity { provider: 'google' | 'wallet'; subject: string; label: string }

/** {google, wallet} when the auth server answers; false when this address has none (e.g. local preview). */
export async function fetchAuthConfig(): Promise<{ google: boolean; wallet: boolean } | false> {
  try {
    const r = await fetch('/api/auth/config', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return false;
    const j = (await r.json()) as { google?: unknown; wallet?: unknown };
    return { google: j.google === true, wallet: j.wallet === true };
  } catch {
    return false;
  }
}

export async function fetchSession(): Promise<ServerIdentity[]> {
  try {
    const r = await fetch('/api/auth/session', { credentials: 'same-origin', signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { identities?: ServerIdentity[] };
    return Array.isArray(j.identities) ? j.identities : [];
  } catch {
    return [];
  }
}

export function googleSignIn(): void {
  location.assign('/api/auth/google/start');
}

export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(8000) }).catch(() => undefined);
}

const toHex = (s: string) => '0x' + Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Continue with Wallet: connect, then the same challenge, signature and server check as Enter with CHOG (no CHOG
 * needed, no network switch: the signed message names Monad whatever network the wallet is on). Never throws.
 */
export async function walletSignIn(id: string, onSigning: () => void = () => undefined): Promise<ServerIdentity | ChogError> {
  const c = await chogConnect(id);
  if (typeof c === 'string') return c;
  onSigning();
  return chogSign(id, c.address, () => undefined);
}

// ---- Enter with CHOG (CF, owner 2026-10-16; FS 2026-10-17) ----
// CHOG ownership is ELIGIBILITY; the wallet signature is AUTHENTICATION. The flow below checks the shared address for a
// Chog on Monad first (POST /api/game/eligibility, read-only, signs nobody in), then asks for the same Sign-In with
// Ethereum signature as Continue with Wallet, which the server verifies to start the normal session. Power and 5v5
// still come only from the server's own read of the signed-in wallet (GET /api/game/tokens, POST /api/game/ticket).

/** Monad mainnet, as the site reads it (api/_lib/chain.ts CHAIN_ID 143). */
export const MONAD_CHAIN_HEX = '0x8f';
/**
 * Added to a wallet that does not know Monad yet (wallet_addEthereumChain), from the official Monad docs
 * (docs.monad.xyz "Add Monad Mainnet to Wallet", checked 2026-10-17) and the RPC the site itself reads (chain.ts RPCS).
 */
export const MONAD_PARAMS = {
  chainId: MONAD_CHAIN_HEX, chainName: 'Monad', nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://rpc.monad.xyz'], blockExplorerUrls: ['https://monadvision.com'],
};
/** How long a wallet gets to answer: opening or unlocking it can take a while; a signature too. */
export const WALLET_WAIT_MS = { connect: 90_000, quick: 10_000, switch: 60_000, sign: 120_000 };

export type ChogStep =
  | { s: 'pick' } | { s: 'connecting'; wallet: string } | { s: 'network'; wallet: string } | { s: 'switching'; wallet: string }
  | { s: 'checking'; address: string } | { s: 'none'; address: string } | { s: 'signing'; count: number; best: string | null } | { s: 'verifying' }
  | { s: 'loading' } | { s: 'done'; name: string } | { s: 'error'; code: ChogError };

export type ChogError = 'rejected' | 'network_rejected' | 'network_unknown' | 'no_account' | 'chain' | 'expired' | 'not_accepted' | 'unavailable' | 'provider'
  | 'pending' | 'timeout' | 'offline';

/** Plain words for every way the flow can stop. Never an RPC message, a stack or a contract error. */
export const CHOG_ERRORS: Record<ChogError, string> = {
  rejected: 'Signature cancelled.',
  network_rejected: 'Switch networks to continue.',
  network_unknown: 'Add Monad (chain 143) in your wallet, or use another wallet.',
  no_account: 'Your wallet did not share an account.',
  chain: 'Monad can not be reached right now. Try again in a moment.',
  expired: 'That took too long. Try again.',
  not_accepted: 'Your signature could not be checked. Try again.',
  unavailable: 'Sign-in is not available right now.',
  provider: 'Something went wrong. Try again.',
  pending: 'A request is open in your wallet. Finish it there, then retry.',
  timeout: 'Your wallet did not answer. Unlock it, then try again.',
  offline: 'The site can not be reached. Check your connection.',
};

/** A failed wallet request in the flow's words. */
function walletError(e: unknown, rejected: ChogError): ChogError {
  const c = walletCode(e);
  return c === 4001 ? rejected : c === -32002 ? 'pending' : c === 'timeout' ? 'timeout' : c === 4100 ? 'no_account' : 'provider';
}

/** Connect: the wallet shares an account (eth_requestAccounts). */
export async function chogConnect(id: string): Promise<{ address: string } | ChogError> {
  const w = found.get(id);
  if (!w) return 'provider';
  try {
    const accounts = await ask<string[]>(w.provider, 'eth_requestAccounts', undefined, WALLET_WAIT_MS.connect);
    return accounts?.[0] ? { address: String(accounts[0]) } : 'no_account';
  } catch (e) {
    return walletError(e, 'no_account');
  }
}

/** Another account from the same wallet: the wallet's account picker where it has one (wallet_requestPermissions). */
export async function chogPickAccount(id: string): Promise<{ address: string } | ChogError> {
  const w = found.get(id);
  if (!w) return 'provider';
  try {
    await ask(w.provider, 'wallet_requestPermissions', [{ eth_accounts: {} }], WALLET_WAIT_MS.connect);
  } catch (e) {
    const c = walletCode(e);
    if (c === 4001 || c === -32002 || c === 'timeout') return walletError(e, 'no_account');
    // No picker in this wallet: the plain connect (the player switches the account in the wallet itself).
  }
  return chogConnect(id);
}

/** The wallet's current network is Monad. */
async function onMonad(p: Eip1193): Promise<boolean> {
  return parseInt(String(await ask(p, 'eth_chainId', undefined, WALLET_WAIT_MS.quick)), 16) === parseInt(MONAD_CHAIN_HEX, 16);
}

/**
 * On Monad already, or switched there (wallet_switchEthereumChain). A wallet that does not know Monad (4902, also
 * wrapped) is asked to add it (wallet_addEthereumChain), then to switch.
 */
export async function chogNetwork(id: string, switchNow: boolean): Promise<'ok' | 'wrong' | ChogError> {
  const w = found.get(id);
  if (!w) return 'provider';
  try {
    if (await onMonad(w.provider)) return 'ok';
    if (!switchNow) return 'wrong';
  } catch (e) {
    return walletError(e, 'provider');
  }
  try {
    await ask(w.provider, 'wallet_switchEthereumChain', [{ chainId: MONAD_CHAIN_HEX }], WALLET_WAIT_MS.switch);
  } catch (e) {
    if (walletCode(e) !== 4902) return walletError(e, 'network_rejected');
    try {
      await ask(w.provider, 'wallet_addEthereumChain', [MONAD_PARAMS], WALLET_WAIT_MS.switch);
      // Most wallets switch on add; the rest are asked again.
      if (!(await onMonad(w.provider))) await ask(w.provider, 'wallet_switchEthereumChain', [{ chainId: MONAD_CHAIN_HEX }], WALLET_WAIT_MS.switch);
    } catch (e2) {
      const c = walletCode(e2);
      return c === 4001 ? 'network_rejected' : c === -32002 || c === 'timeout' ? walletError(e2, 'network_rejected') : 'network_unknown';
    }
  }
  try {
    return (await onMonad(w.provider)) ? 'ok' : 'network_rejected';
  } catch (e) {
    return walletError(e, 'provider');
  }
}

/** Eligibility: how many Chogs this address holds on Monad and the best tier (read-only). */
export async function chogEligibility(address: string): Promise<{ count: number; best: string | null } | ChogError> {
  try {
    const r = await fetchT('/api/game/eligibility', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }),
    }, 12000);
    if (!(r.headers.get('content-type') ?? '').includes('json')) return 'unavailable';
    const j = (await r.json()) as { ok?: boolean; count?: number; best?: string | null; error?: string };
    if (j.ok && typeof j.count === 'number') return { count: j.count, best: j.best ?? null };
    return j.error === 'chain_unavailable' ? 'chain' : 'unavailable';
  } catch {
    return 'chain';
  }
}

/** Authentication: the challenge, the wallet's signature and the server's check. */
export async function chogSign(id: string, address: string, onSent: () => void): Promise<ServerIdentity | ChogError> {
  const w = found.get(id);
  if (!w) return 'provider';
  let message: string;
  try {
    const ch = await fetchT('/api/auth/wallet/challenge', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address, chainId: parseInt(MONAD_CHAIN_HEX, 16) }),
    });
    if (!ch.ok) return 'unavailable';
    message = String(((await ch.json()) as { message?: unknown }).message ?? '');
    if (!message) return 'unavailable';
  } catch {
    return 'offline';
  }
  let signature: string;
  try {
    signature = await ask<string>(w.provider, 'personal_sign', [toHex(message), address], WALLET_WAIT_MS.sign);
  } catch (e) {
    return walletError(e, 'rejected');
  }
  onSent();
  try {
    const v = await fetchT('/api/auth/wallet/verify', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, signature }),
    });
    const j = (await v.json().catch(() => ({}))) as { identity?: ServerIdentity; error?: string };
    if (v.ok && j.identity) return j.identity;
    return j.error === 'expired' || j.error === 'no_challenge' || j.error === 'replayed' ? 'expired' : j.error === 'unavailable' ? 'unavailable' : 'not_accepted';
  } catch {
    return 'offline';
  }
}
