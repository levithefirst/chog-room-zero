// ABI helpers for reading the Chog Genesis contract over JSON-RPC (task NFT-R1). Pure functions, no network.
// Function selectors are computed with keccak-256 from the signature, never typed in from memory.
import { keccak_256 } from '@noble/hashes/sha3.js';

export const MONAD_RPCS = ['https://rpc.monad.xyz', 'https://rpc1.monad.xyz', 'https://rpc2.monad.xyz', 'https://rpc3.monad.xyz', 'https://rpc-mainnet.monadinfra.com'];

const hexOf = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const strip = (h: string) => (h.startsWith('0x') ? h.slice(2) : h);

export function selector(signature: string): string {
  return '0x' + hexOf(keccak_256(new TextEncoder().encode(signature)).slice(0, 4));
}

/** Calldata for a function whose arguments are all unsigned integers (uint256 / bytes4 given as a hex string). */
export function encodeCall(signature: string, args: (bigint | number | string)[] = []): string {
  const word = (a: bigint | number | string) => {
    if (typeof a === 'string') return strip(a).padEnd(64, '0'); // bytes4: left aligned
    return BigInt(a).toString(16).padStart(64, '0');
  };
  return selector(signature) + args.map(word).join('');
}

export function decodeUint(result: string): bigint {
  const h = strip(result);
  if (h.length < 64) throw new Error(`result too short for a uint256: ${result}`);
  return BigInt('0x' + h.slice(0, 64));
}

export function decodeBool(result: string): boolean {
  return decodeUint(result) === 1n;
}

export function decodeAddress(result: string): string {
  return '0x' + strip(result).slice(24, 64);
}

export function decodeBytes32(result: string): string {
  return '0x' + strip(result).slice(0, 64);
}

/** ABI-encoded dynamic string: offset word, length word, then the bytes. */
export function decodeString(result: string): string {
  const h = strip(result);
  const offset = Number(BigInt('0x' + h.slice(0, 64))) * 2;
  const len = Number(BigInt('0x' + h.slice(offset, offset + 64)));
  const body = h.slice(offset + 64, offset + 64 + len * 2);
  if (body.length !== len * 2) throw new Error('string result is truncated');
  return new TextDecoder().decode(Uint8Array.from(body.match(/../g) ?? [], (x) => parseInt(x, 16)));
}

/** The reads tools/nft/read-chain.ts makes. Each must exist in the Sourcify-verified ABI (tests/nft-chain.test.ts checks that). */
export const READS = [
  { name: 'name', signature: 'name()', returns: 'string' },
  { name: 'symbol', signature: 'symbol()', returns: 'string' },
  { name: 'totalSupply', signature: 'totalSupply()', returns: 'uint' },
  { name: 'maxSupply', signature: 'maxSupply()', returns: 'uint' },
  { name: 'reserveMax', signature: 'reserveMax()', returns: 'uint' },
  { name: 'revealed', signature: 'revealed()', returns: 'bool' },
  { name: 'startingIndex', signature: 'startingIndex()', returns: 'uint' },
  { name: 'baseURI', signature: 'baseURI()', returns: 'string' },
  { name: 'placeholderURI', signature: 'placeholderURI()', returns: 'string' },
  { name: 'provenanceHash', signature: 'provenanceHash()', returns: 'bytes32' },
] as const;
