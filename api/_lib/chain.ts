// Chog Genesis ownership, read live from Monad mainnet (master build, stage D). Read-only eth_call over public RPCs:
// no wallet, no signing, no transactions, no API key. Every failure fails closed (the caller treats the player as free).
// Facts used here are EVIDENCE from NFT-R1 (docs/research/chog-genesis/SOURCES.md) and are re-checked on every read:
// the RPC must report chain id 143 and the answers must decode cleanly, or nothing is trusted.
import { keccak_256 } from '@noble/hashes/sha3.js';

export const CHAIN_ID = 143;
export const CONTRACT = '0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763';
export const MAX_SUPPLY = 1969;
export const RPCS = ['https://rpc.monad.xyz', 'https://rpc1.monad.xyz', 'https://rpc2.monad.xyz', 'https://rpc3.monad.xyz', 'https://rpc-mainnet.monadinfra.com'];

const enc = new TextEncoder();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function selector(signature: string): string {
  return '0x' + hex(keccak_256(enc.encode(signature)).slice(0, 4));
}

const word = (v: bigint | number) => BigInt(v).toString(16).padStart(64, '0');

export function encodeAddressCall(signature: string, address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('bad address');
  return selector(signature) + address.slice(2).toLowerCase().padStart(64, '0');
}

export function encodeUintCall(signature: string, v: number): string {
  return selector(signature) + word(v);
}

/** ABI uint256[] return value. Throws on anything malformed or implausible. */
export function decodeUintArray(result: string, max = MAX_SUPPLY): number[] {
  const h = result.startsWith('0x') ? result.slice(2) : result;
  if (h.length < 128 || h.length % 64) throw new Error('bad array result');
  const offset = Number(BigInt('0x' + h.slice(0, 64))) * 2;
  const len = Number(BigInt('0x' + h.slice(offset, offset + 64)));
  if (!Number.isSafeInteger(len) || len > max || h.length < offset + 64 + len * 64) throw new Error('bad array length');
  return Array.from({ length: len }, (_, i) => {
    const v = BigInt('0x' + h.slice(offset + 64 + i * 64, offset + 128 + i * 64));
    if (v < 1n || v > BigInt(MAX_SUPPLY)) throw new Error('token id out of range');
    return Number(v);
  });
}

export function decodeUint(result: string): number {
  const h = result.startsWith('0x') ? result.slice(2) : result;
  if (h.length !== 64) throw new Error('bad uint result');
  const v = BigInt('0x' + h);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('uint too large');
  return Number(v);
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

interface RpcAnswer { id: number; result?: string; error?: { message: string } }

async function batch(rpc: string, calls: { method: string; params: unknown[] }[], f: Fetch, timeoutMs: number): Promise<string[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await f(rpc, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify(calls.map((c, i) => ({ jsonrpc: '2.0', id: i + 1, ...c }))),
    });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const list = (await res.json()) as RpcAnswer[];
    if (!Array.isArray(list) || list.length !== calls.length) throw new Error('rpc batch mismatch');
    return list.sort((a, b) => a.id - b.id).map((r) => {
      if (r.error || typeof r.result !== 'string') throw new Error('rpc error');
      return r.result;
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface Holding { tokenId: number; metadataId: number }
export interface OwnershipRead { ok: true; address: string; holdings: Holding[]; rpc: string; block: string }
export type OwnershipResult = OwnershipRead | { ok: false; reason: string };

/**
 * The Chog Genesis tokens `address` owns right now, each with its metadata id as the contract computes it
 * (`metadataId(tokenId)`, so the token-to-traits mapping is read, not assumed). Tries each public RPC in turn.
 */
export async function readOwnership(address: string, f: Fetch = fetch, rpcs = RPCS, timeoutMs = 4000): Promise<OwnershipResult> {
  let last = 'no rpc';
  for (const rpc of rpcs) {
    try {
      const [chain, block, owned] = await batch(rpc, [
        { method: 'eth_chainId', params: [] },
        { method: 'eth_blockNumber', params: [] },
        { method: 'eth_call', params: [{ to: CONTRACT, data: encodeAddressCall('tokensOfOwner(address)', address) }, 'latest'] },
      ], f, timeoutMs);
      if (parseInt(chain, 16) !== CHAIN_ID) { last = 'wrong chain'; continue; }
      const ids = decodeUintArray(owned);
      if (!ids.length) return { ok: true, address, holdings: [], rpc, block };
      const metas = await batch(rpc, ids.slice(0, 50).map((id) => ({
        method: 'eth_call', params: [{ to: CONTRACT, data: encodeUintCall('metadataId(uint256)', id) }, block],
      })), f, timeoutMs);
      const holdings = ids.slice(0, 50).map((tokenId, i) => {
        const metadataId = decodeUint(metas[i]);
        if (metadataId < 1 || metadataId > MAX_SUPPLY) throw new Error('metadata id out of range');
        return { tokenId, metadataId };
      });
      return { ok: true, address, holdings, rpc, block };
    } catch (e) {
      last = e instanceof Error ? e.message : 'rpc failed';
    }
  }
  return { ok: false, reason: last };
}

export type SelfCheck = { ok: boolean; rpc?: string; block?: string; checks: Record<string, boolean>; reason?: string };

/**
 * Live proof that the ownership path works from this server, with no wallet: the owner of token 1 (ownerOf) must list
 * token 1 in tokensOfOwner, and metadataId(1) must equal the catalogue's 1462. Read-only; nothing about any player.
 */
export async function selfCheck(f: Fetch = fetch, rpcs = RPCS): Promise<SelfCheck> {
  let reason = 'no rpc';
  for (const rpc of rpcs) {
    try {
      const [chain, block, owner, meta] = await batch(rpc, [
        { method: 'eth_chainId', params: [] },
        { method: 'eth_blockNumber', params: [] },
        { method: 'eth_call', params: [{ to: CONTRACT, data: encodeUintCall('ownerOf(uint256)', 1) }, 'latest'] },
        { method: 'eth_call', params: [{ to: CONTRACT, data: encodeUintCall('metadataId(uint256)', 1) }, 'latest'] },
      ], f, 4000);
      const ownerAddr = '0x' + owner.replace(/^0x/, '').slice(24, 64);
      const r = await readOwnership(ownerAddr, f, [rpc]);
      const checks = {
        chainId143: parseInt(chain, 16) === CHAIN_ID,
        metadataIdOfToken1Is1462: decodeUint(meta) === 1462,
        ownerOfToken1ListsToken1: r.ok && r.holdings.some((h) => h.tokenId === 1 && h.metadataId === 1462),
      };
      return { ok: Object.values(checks).every(Boolean), rpc, block, checks };
    } catch (e) {
      reason = e instanceof Error ? e.message : 'rpc failed';
    }
  }
  return { ok: false, checks: {}, reason };
}
