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
