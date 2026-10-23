// Fetch the Chog Genesis metadata folder from IPFS as one CAR, verify every block against its content id, and compare
// the result with the copy shipped in data/chog-genesis/raw. Needs normal internet access (this repo's authoring
// container had none for IPFS gateways, which is why the shipped copy is marked "not hash-verified").
//   node tools/nft/verify-ipfs.ts [gatewayBase]     default https://ipfs.io ; others: https://dweb.link, https://w3s.link
// Writes data/chog-genesis/raw/ipfs-verification.json. Exit code 0 only if every block verified and every file is identical.
import { readFileSync, writeFileSync } from 'node:fs';
process.on('uncaughtException', (e: Error & { cause?: { code?: string } }) => {
  console.error(`FAILED: ${e.message}${e.cause?.code ? ` (${e.cause.code})` : ''}. This tool needs normal internet access; nothing was written.`);
  process.exit(2);
});
import { METADATA_CID, MAX_SUPPLY } from './lib.ts';
import { parseCar, readVerifiedDirectory } from './car.ts';

const gateway = (process.argv[2] ?? 'https://ipfs.io').replace(/\/$/, '');
const root = new URL('../../', import.meta.url);
const shipped = JSON.parse(readFileSync(new URL('data/chog-genesis/raw/ipfs-metadata.json', root), 'utf8')) as Record<string, unknown>;

const url = `${gateway}/ipfs/${METADATA_CID}?format=car&dag-scope=all`;
console.log(`fetching ${url}`);
const res = await fetch(url, { headers: { Accept: 'application/vnd.ipld.car' } });
if (!res.ok) throw new Error(`gateway answered ${res.status}`);
const bytes = new Uint8Array(await res.arrayBuffer());
const dir = readVerifiedDirectory(parseCar(bytes), METADATA_CID); // throws if any block fails its hash or the root differs

let identical = 0;
const different: string[] = [], missing: string[] = [];
const fresh: Record<string, unknown> = {};
for (let n = 1; n <= MAX_SUPPLY; n++) {
  const f = dir.files.get(`${n}.json`);
  if (!f) { missing.push(`${n}.json`); continue; }
  const obj = JSON.parse(new TextDecoder().decode(f)) as unknown;
  fresh[String(n)] = obj;
  if (JSON.stringify(obj) === JSON.stringify(shipped[String(n)])) identical++; else different.push(`${n}.json`);
}
const extra = [...dir.files.keys()].filter((k) => !/^[1-9]\d*\.json$/.test(k) || Number(k.slice(0, -5)) > MAX_SUPPLY);
const ok = missing.length === 0 && different.length === 0 && extra.length === 0;
const report = { checkedAt: new Date().toISOString(), gateway, root: dir.root, carBytes: bytes.length, blocksVerified: dir.blocksChecked, files: dir.files.size, identicalToShipped: identical, different, missing, extra, ok };
writeFileSync(new URL('data/chog-genesis/raw/ipfs-verification.json', root), JSON.stringify(report, null, 1) + '\n');
if (!ok) writeFileSync(new URL('data/chog-genesis/raw/ipfs-metadata.verified.json', root), JSON.stringify(fresh));
console.log(JSON.stringify({ ...report, different: different.slice(0, 10), missing: missing.slice(0, 10) }, null, 1));
process.exit(ok ? 0 : 1);
