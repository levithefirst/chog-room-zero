// Read the Chog Genesis contract on Monad mainnet (read-only eth_call, no wallet, no signing, no transactions) and check
// it against the catalogue. Needs normal internet access (this repo's authoring container could not reach any Monad RPC).
//   node tools/nft/read-chain.ts [rpcUrl] [--all]      --all also checks metadataId(tokenId) for every token (20 batched calls)
// Writes data/chog-genesis/chain-reads.json. Exit code 0 only if every expectation held.
import { readFileSync, writeFileSync } from 'node:fs';
process.on('uncaughtException', (e: Error & { cause?: { code?: string } }) => {
  console.error(`FAILED: ${e.message}${e.cause?.code ? ` (${e.cause.code})` : ''}. This tool needs normal internet access; nothing was written.`);
  process.exit(2);
});
import { CHAIN_ID, CONTRACT, MAX_SUPPLY, METADATA_CID, STARTING_INDEX_DERIVED, metadataIdOf, type CatalogueRecord } from './lib.ts';
import { MONAD_RPCS, READS, decodeBool, decodeBytes32, decodeString, decodeUint, encodeCall } from './chain.ts';

const args = process.argv.slice(2);
const rpc = args.find((a) => a.startsWith('http')) ?? MONAD_RPCS[0];
const all = args.includes('--all');
const root = new URL('../../', import.meta.url);
const records = (JSON.parse(readFileSync(new URL('data/chog-genesis/catalogue.json', root), 'utf8')) as { records: CatalogueRecord[] }).records;

let id = 0;
async function rpcCall(batch: { method: string; params: unknown[] }[]): Promise<unknown[]> {
  const body = batch.map((b) => ({ jsonrpc: '2.0', id: ++id, ...b }));
  const res = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body.length === 1 ? body[0] : body) });
  if (!res.ok) throw new Error(`rpc answered ${res.status}`);
  const json = (await res.json()) as { id: number; result?: unknown; error?: { message: string } } | { id: number; result?: unknown; error?: { message: string } }[];
  const list = (Array.isArray(json) ? json : [json]).sort((a, b) => a.id - b.id);
  return list.map((r) => { if (r.error) throw new Error(r.error.message); return r.result; });
}
const call = async (data: string) => (await rpcCall([{ method: 'eth_call', params: [{ to: CONTRACT, data }, 'latest'] }]))[0] as string;

const [chainHex, block, code] = (await rpcCall([{ method: 'eth_chainId', params: [] }, { method: 'eth_blockNumber', params: [] }, { method: 'eth_getCode', params: [CONTRACT, 'latest'] }])) as string[];
const reads: Record<string, string | number | boolean> = {};
for (const r of READS) {
  const raw = await call(encodeCall(r.signature));
  reads[r.name] = r.returns === 'string' ? decodeString(raw) : r.returns === 'bool' ? decodeBool(raw) : r.returns === 'bytes32' ? decodeBytes32(raw) : Number(decodeUint(raw));
}
const erc721 = decodeBool(await call(encodeCall('supportsInterface(bytes4)', ['0x80ac58cd'])));
const sampleToken = 1754;
const tokenUri = decodeString(await call(encodeCall('tokenURI(uint256)', [sampleToken])));
const mapped = Number(decodeUint(await call(encodeCall('metadataId(uint256)', [sampleToken]))));

let allMismatches: number[] | null = null;
if (all) {
  allMismatches = [];
  for (let from = 1; from <= MAX_SUPPLY; from += 100) {
    const ids = Array.from({ length: Math.min(100, MAX_SUPPLY - from + 1) }, (_, i) => from + i);
    const out = (await rpcCall(ids.map((t) => ({ method: 'eth_call', params: [{ to: CONTRACT, data: encodeCall('metadataId(uint256)', [t]) }, 'latest'] })))) as string[];
    ids.forEach((t, i) => { const want = records.find((r) => r.tokenId === t)?.metadataId; if (Number(decodeUint(out[i])) !== want) allMismatches!.push(t); });
  }
}

const startingIndex = reads.startingIndex as number;
const expectations = [
  ['chain id is 143', parseInt(chainHex, 16) === CHAIN_ID],
  ['contract has code', code.length > 2],
  ['supports ERC-721', erc721],
  ['maxSupply is 1969', reads.maxSupply === MAX_SUPPLY],
  ['totalSupply is 1969 (fully minted)', reads.totalSupply === MAX_SUPPLY],
  ['revealed', reads.revealed === true],
  [`startingIndex is ${STARTING_INDEX_DERIVED} (the derived value)`, startingIndex === STARTING_INDEX_DERIVED],
  [`baseURI is ipfs://${METADATA_CID}/`, reads.baseURI === `ipfs://${METADATA_CID}/`],
  [`tokenURI(${sampleToken}) is <baseURI>${metadataIdOf(sampleToken)}.json`, tokenUri === `ipfs://${METADATA_CID}/${metadataIdOf(sampleToken)}.json`],
  [`metadataId(${sampleToken}) is ${metadataIdOf(sampleToken)}`, mapped === metadataIdOf(sampleToken)],
  ...(allMismatches ? [['metadataId(tokenId) matches the catalogue for all 1969 tokens', allMismatches.length === 0] as [string, boolean]] : []),
] as [string, boolean][];
const report = { readAt: new Date().toISOString(), rpc, contract: CONTRACT, blockNumber: parseInt(block, 16), reads, supportsErc721: erc721, tokenUriSample: { tokenId: sampleToken, tokenURI: tokenUri, metadataId: mapped }, allMismatches, expectations: expectations.map(([what, held]) => ({ what, held })), ok: expectations.every(([, held]) => held) };
writeFileSync(new URL('data/chog-genesis/chain-reads.json', root), JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify(report, null, 1));
process.exit(report.ok ? 0 : 1);
