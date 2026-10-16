// Browser side of sign-in (RC-7). Talks to /api/auth/* (see api/_lib/auth.ts). Optional: the game never waits on it
// and plays fully as a guest. Wallets are found with EIP-6963 (each extension announces itself); MetaMask, Rabby and
// Zerion are offered. Connecting a wallet does nothing by itself: sign-in needs the signed challenge to verify.

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

interface Announced { info: { uuid: string; name: string; rdns: string }; provider: Eip1193 }

// The wallets the owner asked for (EIP-6963 reverse-DNS ids).
const WANTED: Record<string, string> = { 'io.metamask': 'MetaMask', 'io.rabby': 'Rabby', 'io.zerion.wallet': 'Zerion' };

const found = new Map<string, { name: string; provider: Eip1193 }>();

/** Ask installed wallets to announce themselves; resolves after a short wait with the ones we support. */
export function discoverWallets(waitMs = 300): Promise<{ id: string; name: string }[]> {
  return new Promise((resolve) => {
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<Announced>).detail;
      const name = d?.info && WANTED[d.info.rdns];
      if (name && d.provider) found.set(d.info.rdns, { name, provider: d.provider });
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      // Older injectors without EIP-6963: one window.ethereum, named by its flags.
      const legacy = (window as unknown as { ethereum?: Eip1193 & { isMetaMask?: boolean; isRabby?: boolean; isZerion?: boolean } }).ethereum;
      if (!found.size && legacy) {
        const name = legacy.isRabby ? 'Rabby' : legacy.isZerion ? 'Zerion' : legacy.isMetaMask ? 'MetaMask' : 'Browser wallet';
        found.set('legacy', { name, provider: legacy });
      }
      resolve([...found].map(([id, w]) => ({ id, name: w.name })));
    }, waitMs);
  });
}

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

/** Connect, get a challenge, ask the wallet to sign it, let the server verify. Throws a readable message on failure. */
export async function walletSignIn(id: string): Promise<ServerIdentity> {
  const w = found.get(id);
  if (!w) throw new Error('Wallet not available, try again');
  const accounts = (await w.provider.request({ method: 'eth_requestAccounts' })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error('No account shared by the wallet');
  const chainHex = (await w.provider.request({ method: 'eth_chainId' })) as string;
  const ch = await fetch('/api/auth/wallet/challenge', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address, chainId: parseInt(chainHex, 16) }),
  });
  if (!ch.ok) throw new Error('Sign-in unavailable, try again');
  const { message } = (await ch.json()) as { message: string };
  const signature = (await w.provider.request({ method: 'personal_sign', params: [toHex(message), address] })) as string;
  const v = await fetch('/api/auth/wallet/verify', {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  const j = (await v.json().catch(() => ({}))) as { identity?: ServerIdentity; error?: string };
  if (!v.ok || !j.identity) throw new Error(j.error === 'expired' ? 'Took too long, try again' : 'Signature not accepted');
  return j.identity;
}

// ---- Enter with CHOG (CF, owner 2026-10-16) ----
// CHOG ownership is ELIGIBILITY; the wallet signature is AUTHENTICATION. The flow below checks the shared address for a
// Chog on Monad first (POST /api/game/eligibility, read-only, signs nobody in), then asks for the same Sign-In with
// Ethereum signature as Continue with Wallet, which the server verifies to start the normal session. Power and 5v5
// still come only from the server's own read of the signed-in wallet (GET /api/game/tokens, POST /api/game/ticket).

/** Monad mainnet, as the site reads it (api/_lib/chain.ts CHAIN_ID 143). */
export const MONAD_CHAIN_HEX = '0x8f';

export type ChogStep =
  | { s: 'pick' } | { s: 'connecting'; wallet: string } | { s: 'network'; wallet: string } | { s: 'checking' }
  | { s: 'none' } | { s: 'signing'; count: number; best: string | null } | { s: 'verifying' } | { s: 'loading' } | { s: 'done'; name: string }
  | { s: 'error'; code: ChogError };

export type ChogError = 'rejected' | 'network_rejected' | 'network_unknown' | 'no_account' | 'chain' | 'expired' | 'not_accepted' | 'unavailable' | 'provider';

/** Plain words for every way the flow can stop. Never an RPC message, a stack or a contract error. */
export const CHOG_ERRORS: Record<ChogError, string> = {
  rejected: 'Signature cancelled.',
  network_rejected: 'Switch networks to continue.',
  network_unknown: 'Add the Monad network to your wallet, then try again.',
  no_account: 'Your wallet did not share an account.',
  chain: 'Monad can not be reached right now. Try again in a moment.',
  expired: 'That took too long. Try again.',
  not_accepted: 'Your signature could not be checked. Try again.',
  unavailable: 'Sign-in is not available right now.',
  provider: 'Something went wrong. Try again.',
};

const code = (e: unknown) => (e as { code?: number })?.code;

/** Connect: the wallet shares an account (eth_requestAccounts). */
export async function chogConnect(id: string): Promise<{ address: string } | ChogError> {
  const w = found.get(id);
  if (!w) return 'provider';
  try {
    const accounts = (await w.provider.request({ method: 'eth_requestAccounts' })) as string[];
    return accounts?.[0] ? { address: accounts[0] } : 'no_account';
  } catch (e) {
    return code(e) === 4001 ? 'no_account' : 'provider';
  }
}

/** On Monad already, or switched there (wallet_switchEthereumChain). The chain is never added for the player. */
export async function chogNetwork(id: string, ask: boolean): Promise<'ok' | 'wrong' | ChogError> {
  const w = found.get(id);
  if (!w) return 'provider';
  try {
    const now = String(await w.provider.request({ method: 'eth_chainId' })).toLowerCase();
    if (parseInt(now, 16) === parseInt(MONAD_CHAIN_HEX, 16)) return 'ok';
    if (!ask) return 'wrong';
    await w.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_CHAIN_HEX }] });
    const after = String(await w.provider.request({ method: 'eth_chainId' })).toLowerCase();
    return parseInt(after, 16) === parseInt(MONAD_CHAIN_HEX, 16) ? 'ok' : 'network_rejected';
  } catch (e) {
    const c = code(e);
    return c === 4902 ? 'network_unknown' : c === 4001 ? 'network_rejected' : 'provider';
  }
}

/** Eligibility: how many Chogs this address holds on Monad and the best tier (read-only). */
export async function chogEligibility(address: string): Promise<{ count: number; best: string | null } | ChogError> {
  try {
    const r = await fetch('/api/game/eligibility', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }), signal: AbortSignal.timeout(10000),
    });
    if (!(r.headers.get('content-type') ?? '').includes('json')) return 'unavailable';
    const j = (await r.json()) as { ok?: boolean; count?: number; best?: string | null; error?: string };
    if (j.ok && typeof j.count === 'number') return { count: j.count, best: j.best ?? null };
    return j.error === 'chain_unavailable' ? 'chain' : 'unavailable';
  } catch {
    return 'chain';
  }
}

/** Authentication: the same challenge, signature and server verification as Continue with Wallet. */
export async function chogSign(id: string, address: string, onSent: () => void): Promise<ServerIdentity | ChogError> {
  const w = found.get(id);
  if (!w) return 'provider';
  try {
    const ch = await fetch('/api/auth/wallet/challenge', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, chainId: parseInt(MONAD_CHAIN_HEX, 16) }),
    });
    if (!ch.ok) return 'unavailable';
    const { message } = (await ch.json()) as { message: string };
    let signature: string;
    try {
      signature = (await w.provider.request({ method: 'personal_sign', params: [toHex(message), address] })) as string;
    } catch (e) {
      return code(e) === 4001 ? 'rejected' : 'provider';
    }
    onSent();
    const v = await fetch('/api/auth/wallet/verify', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, signature }),
    });
    const j = (await v.json().catch(() => ({}))) as { identity?: ServerIdentity; error?: string };
    if (v.ok && j.identity) return j.identity;
    return j.error === 'expired' ? 'expired' : 'not_accepted';
  } catch {
    return 'provider';
  }
}
