// Minimal IPFS CAR v1 reader and verifier for the Chog Genesis metadata folder (task NFT-R1).
// Why it exists: the copy of the metadata in data/chog-genesis/raw came through a text-only fetch, so its bytes were never
// checked against their content ids. Run tools/nft/verify-ipfs.ts anywhere with normal internet access to fetch the folder
// as a CAR, hash every block, and check it is the folder the contract points at. No dependency beyond @noble/hashes.
import { sha256 } from '@noble/hashes/sha2.js';

export interface Cid { bytes: Uint8Array; version: number; codec: number; hashCode: number; digest: Uint8Array }
export interface Block { cid: Cid; key: string; data: Uint8Array }
export interface Car { roots: Cid[]; blocks: Block[] }

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function readVarint(b: Uint8Array, pos: number): [number, number] {
  let x = 0, shift = 0;
  for (;;) {
    const c = b[pos++];
    if (c === undefined) throw new Error('truncated varint');
    x += (c & 0x7f) * 2 ** shift;
    if (!(c & 0x80)) return [x, pos];
    shift += 7;
    if (shift > 49) throw new Error('varint too long');
  }
}

/** Reads one CID at pos. Supports CIDv0 (sha2-256 multihash) and CIDv1. */
export function readCid(b: Uint8Array, pos: number): [Cid, number] {
  if (b[pos] === 0x12 && b[pos + 1] === 0x20) {
    const bytes = b.slice(pos, pos + 34);
    return [{ bytes, version: 0, codec: 0x70, hashCode: 0x12, digest: bytes.slice(2) }, pos + 34];
  }
  const start = pos;
  let version: number, codec: number, hashCode: number, len: number;
  [version, pos] = readVarint(b, pos);
  if (version !== 1) throw new Error(`unsupported CID version ${version}`);
  [codec, pos] = readVarint(b, pos);
  [hashCode, pos] = readVarint(b, pos);
  [len, pos] = readVarint(b, pos);
  const digest = b.slice(pos, pos + len);
  if (digest.length !== len) throw new Error('truncated CID');
  return [{ bytes: b.slice(start, pos + len), version, codec, hashCode, digest }, pos + len];
}

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
/** CIDv1 to its usual text form (multibase base32 lower-case, "b..."). */
export function cidToString(cid: Cid): string {
  if (cid.version !== 1) throw new Error('only CIDv1 is printed');
  let bits = 0, value = 0, out = '';
  for (const byte of cid.bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return 'b' + out;
}

// ---- the few CBOR forms a CAR header uses: map, array, text, bytes, unsigned int, tag 42
type Cbor = number | string | Uint8Array | Cbor[] | { [k: string]: Cbor } | { tag: number; value: Cbor };
function cbor(b: Uint8Array, pos: number): [Cbor, number] {
  const initial = b[pos++];
  const major = initial >> 5;
  let arg = initial & 31;
  if (arg === 24) arg = b[pos++];
  else if (arg === 25) { arg = (b[pos] << 8) | b[pos + 1]; pos += 2; }
  else if (arg === 26) { arg = b[pos] * 2 ** 24 + ((b[pos + 1] << 16) | (b[pos + 2] << 8) | b[pos + 3]); pos += 4; }
  else if (arg > 26) throw new Error('unsupported CBOR length');
  switch (major) {
    case 0: return [arg, pos];
    case 2: return [b.slice(pos, pos + arg), pos + arg];
    case 3: return [new TextDecoder().decode(b.slice(pos, pos + arg)), pos + arg];
    case 4: { const out: Cbor[] = []; for (let i = 0; i < arg; i++) { let v: Cbor; [v, pos] = cbor(b, pos); out.push(v); } return [out, pos]; }
    case 5: { const out: { [k: string]: Cbor } = {}; for (let i = 0; i < arg; i++) { let k: Cbor, v: Cbor; [k, pos] = cbor(b, pos); [v, pos] = cbor(b, pos); out[String(k)] = v; } return [out, pos]; }
    case 6: { let v: Cbor; [v, pos] = cbor(b, pos); return [{ tag: arg, value: v }, pos]; }
    default: throw new Error(`unsupported CBOR major type ${major}`);
  }
}

export function parseCar(bytes: Uint8Array): Car {
  const [headerLen, afterLen] = readVarint(bytes, 0);
  let pos = afterLen;
  const [header] = cbor(bytes.slice(pos, pos + headerLen), 0);
  pos += headerLen;
  const h = header as { roots?: Cbor; version?: Cbor };
  if (h.version !== 1 || !Array.isArray(h.roots)) throw new Error('not a CAR v1 header');
  const roots = h.roots.map((r) => {
    const t = r as { tag: number; value: Uint8Array };
    if (t.tag !== 42 || t.value[0] !== 0) throw new Error('root is not a CID link');
    return readCid(t.value, 1)[0];
  });
  const blocks: Block[] = [];
  while (pos < bytes.length) {
    let len: number;
    [len, pos] = readVarint(bytes, pos);
    const end = pos + len;
    if (end > bytes.length) throw new Error('truncated block');
    const [cid, dataStart] = readCid(bytes, pos);
    blocks.push({ cid, key: hex(cid.bytes), data: bytes.slice(dataStart, end) });
    pos = end;
  }
  return { roots, blocks };
}

/** Hash every block and compare with the digest in its CID. Returns the keys that failed. */
export function verifyBlocks(car: Car): { checked: number; bad: string[] } {
  const bad: string[] = [];
  for (const b of car.blocks) {
    if (b.cid.hashCode !== 0x12) { bad.push(`${b.key}: unsupported hash ${b.cid.hashCode}`); continue; }
    if (hex(sha256(b.data)) !== hex(b.cid.digest)) bad.push(`${b.key}: hash mismatch`);
  }
  return { checked: car.blocks.length, bad };
}

// ---- dag-pb and UnixFS: just enough to list a flat directory and read its files
interface PbLink { cid: Cid; name: string }
function pbNode(data: Uint8Array): { links: PbLink[]; data: Uint8Array } {
  const links: PbLink[] = [];
  let payload = new Uint8Array(0);
  let pos = 0;
  while (pos < data.length) {
    let tag: number, len: number;
    [tag, pos] = readVarint(data, pos);
    if ((tag & 7) !== 2) throw new Error('unexpected dag-pb wire type');
    [len, pos] = readVarint(data, pos);
    const body = data.slice(pos, pos + len);
    pos += len;
    if (tag >> 3 === 1) payload = body;
    else if (tag >> 3 === 2) {
      let cid: Cid | null = null, name = '', p = 0;
      while (p < body.length) {
        let t: number, l: number;
        [t, p] = readVarint(body, p);
        if ((t & 7) === 0) { [, p] = readVarint(body, p); continue; }
        [l, p] = readVarint(body, p);
        const f = body.slice(p, p + l); p += l;
        if (t >> 3 === 1) cid = readCid(f, 0)[0];
        else if (t >> 3 === 2) name = new TextDecoder().decode(f);
      }
      if (!cid) throw new Error('dag-pb link without a hash');
      links.push({ cid, name });
    }
  }
  return { links, data: payload };
}

function unixfs(data: Uint8Array): { type: number; content: Uint8Array } {
  let type = -1, content = new Uint8Array(0), pos = 0;
  while (pos < data.length) {
    let tag: number;
    [tag, pos] = readVarint(data, pos);
    if ((tag & 7) === 0) { let v: number; [v, pos] = readVarint(data, pos); if (tag >> 3 === 1) type = v; }
    else if ((tag & 7) === 2) { let l: number; [l, pos] = readVarint(data, pos); if (tag >> 3 === 2) content = data.slice(pos, pos + l); pos += l; }
    else throw new Error('unexpected UnixFS wire type');
  }
  return { type, content };
}

/** Bytes of a file node (raw leaf, single dag-pb leaf, or chunked file), following child blocks in order. */
function fileBytes(blocks: Map<string, Block>, block: Block): Uint8Array {
  if (block.cid.codec === 0x55) return block.data;
  const node = pbNode(block.data);
  const u = unixfs(node.data);
  if (u.type !== 2 && u.type !== 0) throw new Error(`not a file (UnixFS type ${u.type})`);
  const parts: Uint8Array[] = [u.content];
  for (const l of node.links) {
    const child = blocks.get(hex(l.cid.bytes));
    if (!child) throw new Error('missing file chunk');
    parts.push(fileBytes(blocks, child));
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export interface Directory { root: string; files: Map<string, Uint8Array>; blocksChecked: number }
/** Verifies a CAR whose first root is a flat UnixFS directory, then returns name -> file bytes. Throws on any failure. */
export function readVerifiedDirectory(car: Car, expectedRoot?: string): Directory {
  if (car.roots.length < 1) throw new Error('CAR has no root');
  const root = car.roots[0];
  const rootText = root.version === 1 ? cidToString(root) : hex(root.bytes);
  if (expectedRoot && rootText !== expectedRoot) throw new Error(`root ${rootText} is not the expected ${expectedRoot}`);
  const v = verifyBlocks(car);
  if (v.bad.length) throw new Error(`${v.bad.length} blocks failed verification, first: ${v.bad[0]}`);
  const blocks = new Map(car.blocks.map((b) => [b.key, b]));
  const rootBlock = blocks.get(hex(root.bytes));
  if (!rootBlock) throw new Error('root block is not in the CAR');
  if (rootBlock.cid.codec !== 0x70) throw new Error('root is not dag-pb');
  const node = pbNode(rootBlock.data);
  const u = unixfs(node.data);
  if (u.type === 5) throw new Error('sharded (HAMT) directories are not supported by this reader');
  if (u.type !== 1) throw new Error(`root is not a directory (UnixFS type ${u.type})`);
  const files = new Map<string, Uint8Array>();
  for (const l of node.links) {
    if (files.has(l.name)) throw new Error(`duplicate directory entry ${l.name}`);
    const b = blocks.get(hex(l.cid.bytes));
    if (!b) throw new Error(`entry ${l.name} is missing from the CAR`);
    files.set(l.name, fileBytes(blocks, b));
  }
  return { root: rootText, files, blocksChecked: v.checked };
}
