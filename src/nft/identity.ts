// Operator identity. Guest by default; a bound Chog Genesis token gives a persistent identity.
// The real chain, contract, ownership method, and metadata are UNKNOWN (docs/design/nft.md), so there is no
// chain adapter yet. BLOCKER: the owner must provide verified chain + contract + ownership read method.
// Until then: guest always works, and a mock adapter exists for development only (?mockChog=<tokenId>).
import { NO_SIDEGRADE, markingFor, operatorFor, type Sidegrade } from '../sim/operators';

/** Placeholders. Never fill these with a guess. */
export const NFT_CONFIG = {
  chainId: null as number | null,
  contract: null as string | null,
};

export interface Identity {
  kind: 'guest' | 'bound';
  tokenId: string | null;
  label: string;
  // A bound token adds one sidegrade on top of whichever hero is picked.
  sidegrade: Sidegrade;
  marking: number | null;
  // Where the binding came from, shown in the UI so a mock is never mistaken for a real check.
  source: 'guest' | 'mock' | 'chain';
}

/** Something that can say which Chog token ids the current player owns. */
export interface OwnershipAdapter {
  name: 'mock' | 'chain';
  ownedTokens(): Promise<string[]>;
}

export const GUEST: Identity = { kind: 'guest', tokenId: null, label: 'Guest', sidegrade: NO_SIDEGRADE, marking: null, source: 'guest' };

export function mockAdapter(tokenIds: string[]): OwnershipAdapter {
  return { name: 'mock', ownedTokens: async () => tokenIds };
}

export function boundIdentity(tokenId: string, source: Identity['source']): Identity {
  return { kind: 'bound', tokenId, label: `Chog #${tokenId}`, sidegrade: operatorFor(tokenId), marking: markingFor(tokenId), source };
}

/**
 * Resolve the identity to play as. Any failure (no adapter, rejected, timeout, no tokens, bad id) gives guest.
 * The game never waits longer than `timeoutMs`.
 */
export async function resolveIdentity(adapter: OwnershipAdapter | null, timeoutMs = 1500): Promise<{ identity: Identity; note: string }> {
  if (!adapter) return { identity: GUEST, note: 'Playing as guest.' };
  try {
    const tokens = await Promise.race([
      adapter.ownedTokens(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timed out')), timeoutMs)),
    ]);
    const id = tokens.find((t) => /^\d{1,10}$/.test(t));
    if (!id) return { identity: GUEST, note: 'No Chog found. Playing as guest.' };
    return { identity: boundIdentity(id, adapter.name), note: `Bound Chog #${id}${adapter.name === 'mock' ? ' (DEMO: no wallet connected, no ownership checked)' : ''}.` };
  } catch (e) {
    return { identity: GUEST, note: `Ownership check failed (${(e as Error).message}). Playing as guest.` };
  }
}

/** Dev-only: ?mockChog=1234 binds a mock token. Anything else is guest. */
export function adapterFromUrl(search: string): OwnershipAdapter | null {
  const id = new URLSearchParams(search).get('mockChog');
  return id ? mockAdapter([id]) : null;
}
