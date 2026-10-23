// NFT-R1: the IPFS CAR verifier (tools/nft/car.ts) and the ABI helpers (tools/nft/chain.ts) on synthetic data and on the
// Sourcify-verified ABI. The network tools built on them (verify-ipfs.ts, read-chain.ts) were NOT run against the live
// network in the authoring environment (no IPFS or Monad RPC access there); these tests are what was run.
import { readFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2.js';
import { describe, expect, it } from 'vitest';
import { cidToString, parseCar, readCid, readVarint, readVerifiedDirectory, verifyBlocks } from '../tools/nft/car';
import { READS, decodeAddress, decodeBool, decodeString, decodeUint, encodeCall, selector } from '../tools/nft/chain';
import { METADATA_CID } from '../tools/nft/lib';

// ---- a tiny CAR writer, only for the fixtures
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const varint = (n: number) => { const o: number[] = []; while (n >= 128) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return Uint8Array.from(o); };
const text = (s: string) => new TextEncoder().encode(s);
const cidOf = (codec: number, data: Uint8Array) => cat(Uint8Array.from([1, codec, 0x12, 0x20]), sha256(data));
interface B { cid: Uint8Array; data: Uint8Array }
const raw = (data: Uint8Array): B => ({ cid: cidOf(0x55, data), data });
const lenField = (field: number, body: Uint8Array) => cat(varint((field << 3) | 2), varint(body.length), body);
const pbDir = (entries: [string, B][]): B => {
  const links = entries.map(([name, b]) => lenField(2, cat(lenField(1, b.cid), lenField(2, text(name)), varint(3 << 3), varint(b.data.length))));
  const data = cat(...links, lenField(1, Uint8Array.from([0x08, 0x01])));
  return { cid: cidOf(0x70, data), data };
};
const pbChunkedFile = (chunks: B[]): B => {
  const links = chunks.map((c) => lenField(2, cat(lenField(1, c.cid), lenField(2, text('')), varint(3 << 3), varint(c.data.length))));
  const data = cat(...links, lenField(1, Uint8Array.from([0x08, 0x02])));
  return { cid: cidOf(0x70, data), data };
};
const car = (root: B, blocks: B[]): Uint8Array => {
  const rootLink = cat(Uint8Array.from([0xd8, 0x2a, 0x58, root.cid.length + 1, 0x00]), root.cid);
  const header = cat(Uint8Array.from([0xa2, 0x65]), text('roots'), Uint8Array.from([0x81]), rootLink, Uint8Array.from([0x67]), text('version'), Uint8Array.from([0x01]));
  return cat(varint(header.length), header, ...[root, ...blocks].map((b) => cat(varint(b.cid.length + b.data.length), b.cid, b.data)));
};

const json = (n: number) => text(JSON.stringify({ name: `CHOG #${n}`, attributes: [] }));
const files = [1, 2, 3].map((n) => [`${n}.json`, raw(json(n))] as [string, B]);
const dir = pbDir(files);
const good = () => car(dir, files.map(([, b]) => b));

describe('CAR reader', () => {
  it('reads varints and CIDs', () => {
    expect(readVarint(Uint8Array.from([0xac, 0x02]), 0)).toEqual([300, 2]);
    const [cid] = readCid(dir.cid, 0);
    expect(cid).toMatchObject({ version: 1, codec: 0x70, hashCode: 0x12 });
  });
  it('prints a CIDv1 in base32 and round-trips the real metadata folder id', () => {
    const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
    let bits = 0, val = 0; const out: number[] = [];
    for (const ch of METADATA_CID.slice(1)) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
    const [cid] = readCid(Uint8Array.from(out), 0);
    expect(cid).toMatchObject({ version: 1, codec: 0x70, hashCode: 0x12 });
    expect(cid.digest).toHaveLength(32);
    expect(cidToString(cid)).toBe(METADATA_CID);
  });
  it('parses the header and every block', () => {
    const c = parseCar(good());
    expect(c.roots).toHaveLength(1);
    expect(c.blocks).toHaveLength(4);
    expect(verifyBlocks(c)).toEqual({ checked: 4, bad: [] });
  });
});

describe('directory verification', () => {
  it('returns each file by name when every hash checks out', () => {
    const d = readVerifiedDirectory(parseCar(good()));
    expect([...d.files.keys()]).toEqual(['1.json', '2.json', '3.json']);
    expect(new TextDecoder().decode(d.files.get('2.json'))).toBe(JSON.stringify({ name: 'CHOG #2', attributes: [] }));
    expect(d.blocksChecked).toBe(4);
    expect(d.root).toBe(cidToString(parseCar(good()).roots[0]));
  });
  it('rejects a file whose bytes changed', () => {
    const bytes = good();
    const at = bytes.length - 5; bytes[at] ^= 1; // flips a byte inside the last file block
    const c = parseCar(bytes);
    expect(verifyBlocks(c).bad).toHaveLength(1);
    expect(() => readVerifiedDirectory(c)).toThrow(/failed verification/);
  });
  it('rejects a different root than expected', () => {
    expect(() => readVerifiedDirectory(parseCar(good()), METADATA_CID)).toThrow(/not the expected/);
  });
  it('rejects a directory entry whose block is missing', () => {
    const c = parseCar(car(dir, files.slice(0, 2).map(([, b]) => b)));
    expect(() => readVerifiedDirectory(c)).toThrow(/missing from the CAR/);
  });
  it('rejects a duplicate entry name', () => {
    const dup = pbDir([['1.json', files[0][1]], ['1.json', files[1][1]]]);
    expect(() => readVerifiedDirectory(parseCar(car(dup, [files[0][1], files[1][1]])))).toThrow(/duplicate/);
  });
  it('joins a chunked file in order', () => {
    const a = raw(text('{"name":"CHOG #9",')), b = raw(text('"attributes":[]}'));
    const big = pbChunkedFile([a, b]);
    const d = pbDir([['9.json', big]]);
    const out = readVerifiedDirectory(parseCar(car(d, [big, a, b])));
    expect(new TextDecoder().decode(out.files.get('9.json'))).toBe('{"name":"CHOG #9","attributes":[]}');
  });
  it('rejects a root that is not a directory', () => {
    const f = pbChunkedFile([]);
    expect(() => readVerifiedDirectory(parseCar(car(f, [])))).toThrow(/not a directory/);
  });
});

describe('ABI helpers', () => {
  it('computes the standard selectors', () => {
    expect(selector('totalSupply()')).toBe('0x18160ddd');
    expect(selector('name()')).toBe('0x06fdde03');
    expect(selector('symbol()')).toBe('0x95d89b41');
    expect(selector('tokenURI(uint256)')).toBe('0xc87b56dd');
    expect(selector('ownerOf(uint256)')).toBe('0x6352211e');
    expect(selector('supportsInterface(bytes4)')).toBe('0x01ffc9a7');
  });
  it('encodes arguments', () => {
    expect(encodeCall('ownerOf(uint256)', [1754])).toBe('0x6352211e' + (1754).toString(16).padStart(64, '0'));
    expect(encodeCall('supportsInterface(bytes4)', ['0x80ac58cd'])).toBe('0x01ffc9a7' + '80ac58cd'.padEnd(64, '0'));
  });
  it('decodes results', () => {
    expect(decodeUint('0x' + (1969).toString(16).padStart(64, '0'))).toBe(1969n);
    expect(decodeBool('0x' + '1'.padStart(64, '0'))).toBe(true);
    expect(decodeAddress('0x' + '0'.repeat(24) + 'ab'.repeat(20))).toBe('0x' + 'ab'.repeat(20));
    const s = 'ipfs://bafy/';
    const body = Array.from(text(s), (x) => x.toString(16).padStart(2, '0')).join('').padEnd(64, '0');
    expect(decodeString('0x' + '20'.padStart(64, '0') + s.length.toString(16).padStart(64, '0') + body)).toBe(s);
    expect(() => decodeString('0x' + '20'.padStart(64, '0') + '40'.padStart(64, '0') + '00')).toThrow(/truncated/);
  });
  it('every read read-chain.ts makes exists in the Sourcify-verified ABI with the right return type', () => {
    const abi = (JSON.parse(readFileSync(new URL('../data/chog-genesis/contract/sourcify-summary.json', import.meta.url), 'utf8')) as { abi: { type: string; name?: string; inputs: { type: string }[]; outputs?: { type: string }[]; stateMutability?: string }[] }).abi;
    const fn = (name: string) => abi.find((a) => a.type === 'function' && a.name === name);
    for (const r of READS) {
      const f = fn(r.name);
      expect(f, r.name).toBeDefined();
      expect(f!.inputs).toHaveLength(0);
      expect(['view', 'pure']).toContain(f!.stateMutability);
      const out = f!.outputs![0].type;
      expect(r.returns === 'uint' ? out.startsWith('uint') : out).toBe(r.returns === 'uint' ? true : r.returns);
    }
    const owned = fn('tokensOfOwner');
    expect(owned?.inputs.map((i) => i.type)).toEqual(['address']);
    expect(owned?.outputs?.[0].type).toBe('uint256[]');
    for (const [name, input] of [['tokenURI', 'uint256'], ['metadataId', 'uint256'], ['ownerOf', 'uint256'], ['supportsInterface', 'bytes4']] as const) {
      expect(fn(name)!.inputs.map((i) => i.type), name).toEqual([input]);
      expect(selector(`${name}(${input})`)).toMatch(/^0x[0-9a-f]{8}$/);
    }
  });
});
