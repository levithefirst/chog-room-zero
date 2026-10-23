// Chog Genesis research package (task NFT-R1): pure functions, no I/O, no game code.
// Used by tools/nft/build-catalogue.ts (run with `node tools/nft/build-catalogue.ts`, Node type stripping) and by
// tests/nft-catalogue.test.ts. Keep this file to erasable TypeScript so Node can run it directly.
//
// Vocabulary used everywhere in this package:
//   tokenId     the ERC-721 id on chain (1..1969). What ownerOf(tokenId) answers for.
//   metadataId  the number of the metadata file (N.json) and of the image (N.webp). The name "CHOG #N" shows it.
//               The collection is revealed with a shuffle: metadataId = ((tokenId - 1 + startingIndex) % maxSupply) + 1.
//   Observed facts (raw files, counts) and calculated scores (rarity) are kept in separate outputs.

export const CHAIN_ID = 143; // Monad mainnet, docs.monad.xyz/developer-essentials/network-information
export const CONTRACT = '0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763'; // checksum form from the Sourcify record
export const MAX_SUPPLY = 1969;
export const METADATA_CID = 'bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu';
export const IMAGE_CID = 'bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e';
// DERIVED, not read from the chain: the one value of startingIndex that makes the verified contract rule agree with
// all 50 token/name pairs in third-party/opensea-sample.json. tools/nft/read-chain.ts reads the real value.
export const STARTING_INDEX_DERIVED = 1461;

// Order in which categories appear in the metadata (a category may be missing from a record; the order itself is stable).
export const CATEGORY_ORDER = ['Background', 'Aura', 'Base', 'Skin', 'Side', 'Body', 'Mouth', 'Eyes', 'Head', 'Accessory', 'Form', 'Tier', 'Naked'] as const;
export type Category = (typeof CATEGORY_ORDER)[number];

export interface RawAttribute { trait_type: string; value: string }
export interface RawMeta { name: string; description: string; image: string; attributes: RawAttribute[] }
export type RawByFile = Record<string, RawMeta>;
export interface OpenSeaRow { tokenId: number; displayNumber: number; openseaRank: number }

export interface CatalogueRecord {
  tokenId: number;
  metadataId: number;
  name: string;
  specialName: string | null;
  description: string;
  imageUri: string;
  metadataUri: string;
  traits: Partial<Record<Category, string>>;
  traitCount: number;
  base: string;
  tier: string;
  // opensea-observed: the token id was read next to this name on OpenSea. derived: computed with STARTING_INDEX_DERIVED.
  tokenIdBasis: 'opensea-observed' | 'derived';
  openseaRank: number | null;
}

export interface Issue { severity: 'error' | 'warning'; code: string; message: string; subject?: string }

export function metadataIdOf(tokenId: number, startingIndex = STARTING_INDEX_DERIVED, maxSupply = MAX_SUPPLY): number {
  return ((tokenId - 1 + startingIndex) % maxSupply) + 1;
}

export function tokenIdOf(metadataId: number, startingIndex = STARTING_INDEX_DERIVED, maxSupply = MAX_SUPPLY): number {
  return ((((metadataId - 1 - startingIndex) % maxSupply) + maxSupply) % maxSupply) + 1;
}

/** "CHOG #1246" -> {n:1246, special:null}; "CHOG #53 (em dash) Blaze" -> {n:53, special:"Blaze"}. */
export function parseName(name: string): { n: number; special: string | null } | null {
  const m = /^CHOG #(\d+)(?: \u2014 (.+))?$/.exec(name);
  return m ? { n: Number(m[1]), special: m[2] ?? null } : null;
}

const fileKey = (n: number) => String(n);

// ---------------------------------------------------------------- validation of the raw files

/** Checks the as-acquired metadata (one object per N.json). Errors mean the data is not usable as is. */
export function validateRaw(raw: RawByFile, supply = MAX_SUPPLY): Issue[] {
  const out: Issue[] = [];
  const err = (code: string, message: string, subject?: string) => out.push({ severity: 'error', code, message, subject });
  const warn = (code: string, message: string, subject?: string) => out.push({ severity: 'warning', code, message, subject });
  const keys = Object.keys(raw);
  if (keys.length !== supply) err('raw-count', `expected ${supply} metadata files, found ${keys.length}`);
  for (let n = 1; n <= supply; n++) if (!(fileKey(n) in raw)) err('raw-missing', `metadata file ${n}.json is missing`, String(n));
  for (const k of keys) if (!/^[1-9]\d*$/.test(k) || Number(k) > supply) err('raw-extra', `unexpected metadata file key ${k}`, k);
  const allowed = new Set<string>(CATEGORY_ORDER);
  const names = new Map<number, number>();
  for (const [k, o] of Object.entries(raw)) {
    const n = Number(k);
    if (!o || typeof o !== 'object') { err('raw-shape', 'record is not an object', k); continue; }
    const fields = Object.keys(o).sort().join(',');
    if (fields !== 'attributes,description,image,name') err('raw-fields', `unexpected fields: ${fields}`, k);
    const nm = typeof o.name === 'string' ? parseName(o.name) : null;
    if (!nm) { err('raw-name', `name does not match "CHOG #N": ${String(o.name)}`, k); continue; }
    if (nm.n !== n) err('raw-name-number', `name says #${nm.n} but the file is ${n}.json`, k);
    names.set(nm.n, (names.get(nm.n) ?? 0) + 1);
    if (o.image !== `ipfs://${IMAGE_CID}/${n}.webp`) err('raw-image', `image is ${String(o.image)}, expected ipfs://${IMAGE_CID}/${n}.webp`, k);
    if (typeof o.description !== 'string' || !o.description) err('raw-description', 'description missing', k);
    if (!Array.isArray(o.attributes)) { err('raw-attributes', 'attributes is not an array', k); continue; }
    const seen = new Set<string>();
    let lastPos = -1;
    for (const a of o.attributes) {
      if (!a || typeof a.trait_type !== 'string' || typeof a.value !== 'string') { err('raw-attribute-shape', 'attribute needs string trait_type and value', k); continue; }
      if (!allowed.has(a.trait_type)) err('raw-category', `unknown trait category "${a.trait_type}"`, k);
      if (seen.has(a.trait_type)) err('raw-duplicate-category', `category "${a.trait_type}" appears twice`, k);
      seen.add(a.trait_type);
      if (a.value === '' || a.value !== a.value.trim() || /\s{2,}/.test(a.value)) err('raw-value-format', `value "${a.value}" is empty or has stray spaces`, k);
      const pos = (CATEGORY_ORDER as readonly string[]).indexOf(a.trait_type);
      if (pos < lastPos) warn('raw-order', `attribute order differs from the usual order at "${a.trait_type}"`, k);
      lastPos = Math.max(lastPos, pos);
    }
  }
  for (const [num, c] of names) if (c > 1) err('raw-name-duplicate', `name number ${num} used ${c} times`, String(num));
  return out;
}

// ---------------------------------------------------------------- catalogue

export function buildCatalogue(raw: RawByFile, sample: OpenSeaRow[], startingIndex = STARTING_INDEX_DERIVED): CatalogueRecord[] {
  const observed = new Map(sample.map((r) => [r.displayNumber, r]));
  const records: CatalogueRecord[] = [];
  for (let m = 1; m <= MAX_SUPPLY; m++) {
    const o = raw[fileKey(m)];
    if (!o) continue;
    const parsed = parseName(o.name);
    const traits: Partial<Record<Category, string>> = {};
    for (const a of o.attributes) traits[a.trait_type as Category] = a.value;
    const seen = observed.get(m);
    records.push({
      tokenId: seen ? seen.tokenId : tokenIdOf(m, startingIndex),
      metadataId: m,
      name: o.name,
      specialName: parsed?.special ?? null,
      description: o.description,
      imageUri: o.image,
      metadataUri: `ipfs://${METADATA_CID}/${m}.json`,
      traits,
      traitCount: o.attributes.length,
      base: traits.Base ?? '',
      tier: traits.Tier ?? '',
      tokenIdBasis: seen ? 'opensea-observed' : 'derived',
      openseaRank: seen ? seen.openseaRank : null,
    });
  }
  return records.sort((a, b) => a.tokenId - b.tokenId);
}

// ---------------------------------------------------------------- trait dictionary

export interface TraitValue { value: string; count: number; pctOfCollection: number; pctOfPresent: number; singleton: boolean }
export interface TraitCategory { category: string; tokensWithTrait: number; tokensWithout: number; distinctValues: number; values: TraitValue[] }
export interface NearDuplicateGroup { category: string; values: { value: string; count: number }[]; basis: string }

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function traitDictionary(records: CatalogueRecord[]): TraitCategory[] {
  const total = records.length;
  return CATEGORY_ORDER.map((category) => {
    const counts = new Map<string, number>();
    for (const r of records) {
      const v = r.traits[category];
      if (v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const present = [...counts.values()].reduce((a, b) => a + b, 0);
    const values = [...counts.entries()]
      .map(([value, count]) => ({ value, count, pctOfCollection: round4((100 * count) / total), pctOfPresent: round4((100 * count) / present), singleton: count === 1 }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    return { category, tokensWithTrait: present, tokensWithout: total - present, distinctValues: values.length, values };
  });
}

/** Strings that differ only by case, spacing, punctuation or a trailing plural s inside one category. Reported, never merged. */
export function nearDuplicates(dict: TraitCategory[]): NearDuplicateGroup[] {
  const out: NearDuplicateGroup[] = [];
  for (const c of dict) {
    const groups = new Map<string, TraitValue[]>();
    for (const v of c.values) {
      const key = v.value.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
      groups.set(key, [...(groups.get(key) ?? []), v]);
    }
    for (const g of groups.values()) if (g.length > 1) out.push({ category: c.category, values: g.map((v) => ({ value: v.value, count: v.count })), basis: 'same text after lower-casing, removing punctuation and a trailing s' });
  }
  return out;
}

/**
 * Hand-picked pairs that look like the same trait written two ways. These are CANDIDATES from reading the dictionary,
 * not facts: someone has to look at the art. They are listed so a mapping table does not treat them as unrelated.
 */
export const SEMANTIC_NEAR_DUPLICATE_CANDIDATES: { category: Category; values: string[] }[] = [
  { category: 'Eyes', values: ['Normal', 'Normal Eye', 'Base'] },
  { category: 'Eyes', values: ['Round', 'Round Eye'] },
  { category: 'Aura', values: ['Royal Blue', 'Royal Blue Aura', 'Royal Aura'] },
  { category: 'Aura', values: ['Rose Aura', 'Rose Scent'] },
  { category: 'Aura', values: ['Purple', 'Light Purple', 'Violet'] },
  { category: 'Background', values: ['Rose Pink', 'Rosy Pink', 'Rosie'] },
  { category: 'Background', values: ['Aqua', 'Aqua Blue', 'Aqua Mint'] },
  { category: 'Head', values: ['Peace hat', 'Peace Cap', 'Red Peace Cap'] },
  { category: 'Head', values: ['MCGA', 'MCGA Cap', 'MMGA Cap'] },
  { category: 'Body', values: ['Squid Game', 'Squid Game Guard'] },
  { category: 'Body', values: ['Jesus', 'Jesus Robe'] },
];

// Strings a person should look at before they are shown in a game UI. A name match only, no judgement about the art.
export const DISPLAY_REVIEW_PATTERNS: { id: string; reason: string; pattern: RegExp }[] = [
  { id: 'slur', reason: 'contains a slur; use a curated display name', pattern: /retard/i },
  { id: 'crude', reason: 'crude or sexual wording; use a curated display name', pattern: /\bmilf\b|\bbbc\b|boner|thots|virgin|horny|\bboob|\bballs\b/i },
  { id: 'third-party-reference', reason: 'names a third-party franchise or character; art rights need a look', pattern: /squid game|\bgojo\b|\bguko\b/i },
  { id: 'religious', reason: 'refers to a religious figure', pattern: /\bjesus\b|holy seal/i },
];

export interface DisplayFlag { id: string; reason: string; category: string; value: string; tokens: number }
export function displayFlags(dict: TraitCategory[]): DisplayFlag[] {
  const out: DisplayFlag[] = [];
  for (const c of dict) for (const v of c.values) for (const p of DISPLAY_REVIEW_PATTERNS) if (p.pattern.test(v.value)) out.push({ id: p.id, reason: p.reason, category: c.category, value: v.value, tokens: v.count });
  return out;
}

// ---------------------------------------------------------------- rarity (calculated, not observed)

export interface RarityRow {
  tokenId: number;
  metadataId: number;
  tier: string;
  // M1: information content in bits, an absent category counts as its own value ("none"), the OpenRarity-style choice.
  icBits: number; rankIc: number;
  // M2: same sum over present traits only. Ten 1:1 tokens carry two traits, so this ranks them as common.
  icPresentBits: number; rankIcPresent: number;
  // M3: sum of 1/p over present traits (the classic "rarity score").
  inverseScore: number; rankInverse: number;
  // M4: probability of the single rarest present trait, as a percent of the collection. Lower is rarer.
  rarestTraitPct: number; rankRarest: number;
  // M5: M1 plus -log2(share of tokens with the same number of traits). Reproduces the OpenSea rank of all 50 sampled tokens exactly.
  icCountBits: number; rankIcCount: number;
  openseaRank: number | null;
}

export type MethodKey = 'rankIc' | 'rankIcPresent' | 'rankInverse' | 'rankRarest' | 'rankIcCount';
export const METHODS: { key: MethodKey; label: string; describe: string }[] = [
  { key: 'rankIc', label: 'M1 information content, absence counted', describe: 'sum over the 13 categories of -log2(share of tokens with that value, or without the category)' },
  { key: 'rankIcPresent', label: 'M2 information content, present traits only', describe: 'sum over the traits the token has of -log2(share of tokens with that value)' },
  { key: 'rankInverse', label: 'M3 inverse frequency sum', describe: 'sum over the traits the token has of 1 / share of tokens with that value' },
  { key: 'rankRarest', label: 'M4 rarest single trait', describe: 'share of tokens holding the token\'s rarest trait; smaller is rarer' },
  { key: 'rankIcCount', label: 'M5 information content, absence counted, plus trait count', describe: 'M1 plus -log2(share of tokens that have the same number of traits); the number of traits is treated as one more trait' },
];

/** Rank 1 is the rarest. Ties share the best rank (1 + number of strictly rarer tokens). */
function rankBy(rows: RarityRow[], score: (r: RarityRow) => number, higherIsRarer: boolean): Map<RarityRow, number> {
  const sorted = [...rows].sort((a, b) => (higherIsRarer ? score(b) - score(a) : score(a) - score(b)));
  const ranks = new Map<RarityRow, number>();
  let rank = 1;
  sorted.forEach((r, i) => {
    if (i > 0 && score(r) !== score(sorted[i - 1])) rank = i + 1;
    ranks.set(r, rank);
  });
  return ranks;
}

export function rarityTable(records: CatalogueRecord[], dict: TraitCategory[]): RarityRow[] {
  const total = records.length;
  const countShare = new Map<number, number>();
  for (const r of records) countShare.set(r.traitCount, (countShare.get(r.traitCount) ?? 0) + 1 / total);
  const share = new Map<string, number>(); // "Category\u0000value" and "Category\u0000" for absence
  for (const c of dict) {
    for (const v of c.values) share.set(`${c.category}\u0000${v.value}`, v.count / total);
    share.set(`${c.category}\u0000`, c.tokensWithout / total);
  }
  const rows: RarityRow[] = records.map((r) => {
    let ic = 0, icp = 0, inv = 0, rarest = 1;
    for (const c of CATEGORY_ORDER) {
      const v = r.traits[c];
      const p = share.get(`${c}\u0000${v ?? ''}`) ?? 1;
      ic += -Math.log2(p);
      if (v !== undefined) { icp += -Math.log2(p); inv += 1 / p; rarest = Math.min(rarest, p); }
    }
    return { tokenId: r.tokenId, metadataId: r.metadataId, tier: r.tier, icBits: ic, rankIc: 0, icPresentBits: icp, rankIcPresent: 0, inverseScore: inv, rankInverse: 0, rarestTraitPct: 100 * rarest, rankRarest: 0, icCountBits: ic - Math.log2(countShare.get(r.traitCount) ?? 1), rankIcCount: 0, openseaRank: r.openseaRank };
  });
  const m5 = rankBy(rows, (r) => r.icCountBits, true), m1 = rankBy(rows, (r) => r.icBits, true), m2 = rankBy(rows, (r) => r.icPresentBits, true), m3 = rankBy(rows, (r) => r.inverseScore, true), m4 = rankBy(rows, (r) => r.rarestTraitPct, false);
  for (const r of rows) { r.rankIc = m1.get(r)!; r.rankIcPresent = m2.get(r)!; r.rankInverse = m3.get(r)!; r.rankRarest = m4.get(r)!; r.rankIcCount = m5.get(r)!; }
  for (const r of rows) { r.icBits = Math.round(r.icBits * 1e3) / 1e3; r.icPresentBits = Math.round(r.icPresentBits * 1e3) / 1e3; r.inverseScore = Math.round(r.inverseScore * 1e2) / 1e2; r.rarestTraitPct = round4(r.rarestTraitPct); r.icCountBits = Math.round(r.icCountBits * 1e3) / 1e3; }
  return rows.sort((a, b) => a.tokenId - b.tokenId);
}

/** Spearman rank correlation of two equal-length samples (average ranks for ties). */
export function spearman(a: number[], b: number[]): number {
  const rank = (xs: number[]) => {
    const idx = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const out = new Array<number>(xs.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) out[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return out;
  };
  const ra = rank(a), rb = rank(b), n = a.length;
  const ma = ra.reduce((x, y) => x + y, 0) / n, mb = rb.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}

export function compareWithOpenSea(rows: RarityRow[]): { method: string; n: number; spearman: number; exactRankMatches: number; maxAbsRankDifference: number }[] {
  const known = rows.filter((r) => r.openseaRank !== null);
  return METHODS.map((m) => {
    const diffs = known.map((r) => Math.abs(r[m.key] - (r.openseaRank as number)));
    return { method: m.label, n: known.length, spearman: Math.round(spearman(known.map((r) => r.openseaRank as number), known.map((r) => r[m.key])) * 1e4) / 1e4, exactRankMatches: diffs.filter((d) => d === 0).length, maxAbsRankDifference: Math.max(...diffs) };
  });
}

// ---------------------------------------------------------------- combinations

const comboKey = (r: CatalogueRecord, skip: readonly string[] = []) => CATEGORY_ORDER.filter((c) => !skip.includes(c)).map((c) => `${c}=${r.traits[c] ?? ''}`).join('|');

export interface ComboGroup { skipped: string[]; groupSize: number; metadataIds: number[] }
/** Groups of tokens that are identical once the skipped categories are ignored. skip=[] gives exact duplicates. */
export function twinGroups(records: CatalogueRecord[], skip: readonly string[] = []): ComboGroup[] {
  const by = new Map<string, number[]>();
  for (const r of records) by.set(comboKey(r, skip), [...(by.get(comboKey(r, skip)) ?? []), r.metadataId]);
  return [...by.values()].filter((g) => g.length > 1).map((g) => ({ skipped: [...skip], groupSize: g.length, metadataIds: g.sort((a, b) => a - b) }));
}

export function distinctCombos(records: CatalogueRecord[], skip: readonly string[] = []): number {
  return new Set(records.map((r) => comboKey(r, skip))).size;
}

export interface Coupling { when: string; always: string; tokens: number }
/** For every value held by at least minTokens tokens: other category values that always come with it (and are not the whole collection). */
export function couplings(records: CatalogueRecord[], minTokens = 5): Coupling[] {
  const out: Coupling[] = [];
  const total = records.length;
  for (const a of CATEGORY_ORDER) {
    const groups = new Map<string, CatalogueRecord[]>();
    for (const r of records) { const v = r.traits[a]; if (v !== undefined) groups.set(v, [...(groups.get(v) ?? []), r]); }
    for (const [v, rs] of groups) {
      if (rs.length < minTokens) continue;
      for (const b of CATEGORY_ORDER) {
        if (b === a) continue;
        const vals = new Set(rs.map((r) => r.traits[b] ?? '(absent)'));
        if (vals.size !== 1) continue;
        const only = [...vals][0];
        const overall = records.filter((r) => (r.traits[b] ?? '(absent)') === only).length;
        if (overall === total) continue;
        out.push({ when: `${a}=${v}`, always: `${b}=${only}`, tokens: rs.length });
      }
    }
  }
  return out;
}

export interface BackgroundFamily { sides: string[]; tiers: string[]; accessoryPossible: boolean; backgrounds: { value: string; tokens: number }[]; tokens: number }
/** Origin-base backgrounds grouped by which Side, Tier and Accessory availability they come with. Observation only. */
export function backgroundFamilies(records: CatalogueRecord[]): BackgroundFamily[] {
  const per = new Map<string, CatalogueRecord[]>();
  for (const r of records) if (r.base === 'Origin' && r.traits.Background) per.set(r.traits.Background, [...(per.get(r.traits.Background) ?? []), r]);
  const fam = new Map<string, BackgroundFamily>();
  for (const [bg, rs] of per) {
    const sides = [...new Set(rs.map((r) => r.traits.Side ?? ''))].sort();
    const tiers = [...new Set(rs.map((r) => r.tier))].sort();
    const accessoryPossible = rs.some((r) => r.traits.Accessory !== undefined);
    const key = `${sides}|${tiers}|${accessoryPossible}`;
    const f = fam.get(key) ?? { sides, tiers, accessoryPossible, backgrounds: [], tokens: 0 };
    f.backgrounds.push({ value: bg, tokens: rs.length }); f.tokens += rs.length;
    fam.set(key, f);
  }
  return [...fam.values()].map((f) => ({ ...f, backgrounds: f.backgrounds.sort((a, b) => b.tokens - a.tokens) })).sort((a, b) => b.tokens - a.tokens);
}

/** Metadata ids of tokens that say Naked=No but carry no Body trait. */
export function notNakedWithoutBody(records: CatalogueRecord[]): number[] {
  return records.filter((r) => r.base !== '1:1' && r.traits.Naked === 'No' && r.traits.Body === undefined).map((r) => r.metadataId).sort((a, b) => a - b);
}

export function uniqueValueHolders(dict: TraitCategory[], records: CatalogueRecord[]): { category: string; value: string; metadataId: number; tokenId: number }[] {
  const out: { category: string; value: string; metadataId: number; tokenId: number }[] = [];
  for (const c of dict) for (const v of c.values) if (v.singleton) {
    const r = records.find((x) => x.traits[c.category as Category] === v.value);
    if (r) out.push({ category: c.category, value: v.value, metadataId: r.metadataId, tokenId: r.tokenId });
  }
  return out;
}

// ---------------------------------------------------------------- what is tied to Tier (for fair mapping)

export interface TierAssociation { category: string; cramersV: number; nullMeanV: number; nullP95V: number; tiedToTier: boolean }

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function cramersV(values: string[], tiers: string[]): number {
  const n = values.length;
  const cell = new Map<string, number>(), row = new Map<string, number>(), col = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    cell.set(`${values[i]}\u0000${tiers[i]}`, (cell.get(`${values[i]}\u0000${tiers[i]}`) ?? 0) + 1);
    row.set(values[i], (row.get(values[i]) ?? 0) + 1);
    col.set(tiers[i], (col.get(tiers[i]) ?? 0) + 1);
  }
  let chi = 0;
  for (const [v, rn] of row) for (const [t, cn] of col) { const e = (rn * cn) / n; const o = cell.get(`${v}\u0000${t}`) ?? 0; chi += (o - e) ** 2 / e; }
  const k = Math.min(row.size, col.size) - 1;
  return k > 0 ? Math.sqrt(chi / (n * k)) : 0;
}

/**
 * Among Origin-base tokens (Common or Uncommon), how strongly each category is tied to Tier, compared with what shuffling
 * the tiers would give (a permutation null, seeded so the result is reproducible). "Absent" counts as a value.
 * A category that is tied to Tier would turn a rarity label into a hidden power signal if it drove a sidegrade.
 */
export function tierAssociation(records: CatalogueRecord[], shuffles = 200, seed = 1): TierAssociation[] {
  const origin = records.filter((r) => r.base === 'Origin');
  const tiers = origin.map((r) => r.tier);
  const rand = mulberry32(seed);
  const shuffled: string[][] = [];
  for (let s = 0; s < shuffles; s++) {
    const t = tiers.slice();
    for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
    shuffled.push(t);
  }
  return CATEGORY_ORDER.filter((c) => c !== 'Tier' && c !== 'Base' && c !== 'Form').map((category) => {
    const values = origin.map((r) => r.traits[category] ?? '(absent)');
    const observed = cramersV(values, tiers);
    const nulls = shuffled.map((t) => cramersV(values, t)).sort((a, b) => a - b);
    const mean = nulls.reduce((a, b) => a + b, 0) / nulls.length;
    const p95 = nulls[Math.floor(0.95 * (nulls.length - 1))];
    return { category, cramersV: Math.round(observed * 1e4) / 1e4, nullMeanV: Math.round(mean * 1e4) / 1e4, nullP95V: Math.round(p95 * 1e4) / 1e4, tiedToTier: observed > p95 };
  });
}

export interface VocabularyOverlap { category: string; sharedValues: number; onlyCommon: number; onlyUncommon: number; commonTokensInSharedValues: number; commonTokens: number; uncommonTokensInSharedValues: number; uncommonTokens: number }
/** For Origin-base tokens: how many values of each category appear in both Common and Uncommon tokens. A low overlap means the two tiers are close to separate art sets. */
export function vocabularyOverlap(records: CatalogueRecord[]): VocabularyOverlap[] {
  const origin = records.filter((r) => r.base === 'Origin');
  return (['Background', 'Aura', 'Skin', 'Body', 'Mouth', 'Eyes', 'Head', 'Accessory'] as Category[]).map((category) => {
    const count = (tier: string) => {
      const m = new Map<string, number>();
      for (const r of origin) if (r.tier === tier && r.traits[category] !== undefined) m.set(r.traits[category]!, (m.get(r.traits[category]!) ?? 0) + 1);
      return m;
    };
    const c = count('Common'), u = count('Uncommon');
    const shared = [...c.keys()].filter((v) => u.has(v));
    const sum = (m: Map<string, number>, keys: string[]) => keys.reduce((a, k) => a + (m.get(k) ?? 0), 0);
    return { category, sharedValues: shared.length, onlyCommon: c.size - shared.length, onlyUncommon: u.size - shared.length, commonTokensInSharedValues: sum(c, shared), commonTokens: sum(c, [...c.keys()]), uncommonTokensInSharedValues: sum(u, shared), uncommonTokens: sum(u, [...u.keys()]) };
  });
}

// ---------------------------------------------------------------- starter partition for the sidegrade proposal

export interface Family { id: string; values: string[] }
export interface Axis { axis: string; category: Category; families: Family[]; defaultFamily: string; note: string }
/**
 * ILLUSTRATIVE. Value lists were written by reading the dictionary; the names are a thematic hint, not knowledge of the art.
 * They exist so balance and tier-independence can be measured. Anything not listed (and every absent trait) gets the default family.
 */
export const STARTER_PARTITION: Axis[] = [
  {
    axis: 'vision profile', category: 'Eyes', defaultFamily: 'standard',
    note: 'eyewear that suggests a focused view versus a framed view; everything else keeps the standard view',
    families: [
      { id: 'lens', values: ['Purple laser', 'fire laser', 'Green laser', 'cyan laser', 'Gradient visor', 'Sunset visor', 'Plasma visor'] },
      { id: 'frames', values: ['Anime Glass', 'Retro Glass', '3D Glass', 'BTC Glass', 'Modern VR', 'Classic VR'] },
    ],
  },
  {
    axis: 'weapon rhythm', category: 'Mouth', defaultFamily: 'standard',
    note: 'composed mouths versus loud, messy mouths; the rest and the missing keep the standard rhythm',
    families: [
      { id: 'steady', values: ['normal smile', 'Smile', 'Flat', 'Grit'] },
      { id: 'burst', values: ['Rainbow Puke', 'Bubblegum', 'Drooling', 'Clown Mouth'] },
    ],
  },
];

export interface FamilyStats { family: string; tokens: number; pctOfCollection: number; byTier: Record<string, number>; pctOfTier: Record<string, number> }
export function partitionStats(records: CatalogueRecord[], dict: TraitCategory[], axis: Axis): { axis: string; category: string; families: FamilyStats[]; unknownValues: string[]; overlappingValues: string[] } {
  const known = new Set(dict.find((d) => d.category === axis.category)?.values.map((v) => v.value) ?? []);
  const listed = axis.families.flatMap((f) => f.values);
  const unknownValues = listed.filter((v) => !known.has(v));
  const overlappingValues = listed.filter((v, i) => listed.indexOf(v) !== i);
  const familyOf = (r: CatalogueRecord) => axis.families.find((f) => f.values.includes(r.traits[axis.category] ?? ''))?.id ?? axis.defaultFamily;
  const tierTotals = new Map<string, number>();
  for (const r of records) tierTotals.set(r.tier, (tierTotals.get(r.tier) ?? 0) + 1);
  const ids = [...axis.families.map((f) => f.id), axis.defaultFamily];
  const families = ids.map((id) => {
    const members = records.filter((r) => familyOf(r) === id);
    const byTier: Record<string, number> = {}, pctOfTier: Record<string, number> = {};
    for (const [t, total] of tierTotals) { const n = members.filter((r) => r.tier === t).length; byTier[t] = n; pctOfTier[t] = Math.round((10000 * n) / total) / 100; }
    return { family: id, tokens: members.length, pctOfCollection: Math.round((10000 * members.length) / records.length) / 100, byTier, pctOfTier };
  });
  return { axis: axis.axis, category: axis.category, families, unknownValues, overlappingValues };
}

// ---------------------------------------------------------------- catalogue validation

/** Cross-field rules found in the data. A violation is reported as an error because the mapping docs rely on them. */
export const BASE_TO_TIER: Record<string, string[]> = { '1:1': ['Legendary'], Skull: ['Rare'], Radioactive: ['Epic'], Origin: ['Common', 'Uncommon'] };

export function validateCatalogue(records: CatalogueRecord[], dict: TraitCategory[], startingIndex = STARTING_INDEX_DERIVED): Issue[] {
  const out: Issue[] = [];
  const err = (code: string, message: string, subject?: string) => out.push({ severity: 'error', code, message, subject });
  const warn = (code: string, message: string, subject?: string) => out.push({ severity: 'warning', code, message, subject });
  if (records.length !== MAX_SUPPLY) err('catalogue-count', `expected ${MAX_SUPPLY} records, found ${records.length}`);
  const tokens = new Set<number>(), metas = new Set<number>();
  const noBody: number[] = [];
  for (const r of records) {
    if (!Number.isInteger(r.tokenId) || r.tokenId < 1 || r.tokenId > MAX_SUPPLY) err('token-range', `tokenId ${r.tokenId} outside 1..${MAX_SUPPLY}`, String(r.metadataId));
    if (tokens.has(r.tokenId)) err('token-duplicate', `tokenId ${r.tokenId} appears twice`, String(r.tokenId));
    if (metas.has(r.metadataId)) err('metadata-duplicate', `metadataId ${r.metadataId} appears twice`, String(r.metadataId));
    tokens.add(r.tokenId); metas.add(r.metadataId);
    if (r.tokenIdBasis === 'derived' && metadataIdOf(r.tokenId, startingIndex) !== r.metadataId) err('mapping', `tokenId ${r.tokenId} does not map to metadataId ${r.metadataId}`, String(r.tokenId));
    if (r.tokenIdBasis === 'opensea-observed' && metadataIdOf(r.tokenId, startingIndex) !== r.metadataId) err('mapping-observed', `observed pair ${r.tokenId}/${r.metadataId} disagrees with startingIndex ${startingIndex}`, String(r.tokenId));
    const okTier = BASE_TO_TIER[r.base];
    if (!okTier) err('base-unknown', `unknown Base "${r.base}"`, String(r.metadataId));
    else if (!okTier.includes(r.tier)) err('tier-base', `Tier "${r.tier}" is not expected for Base "${r.base}"`, String(r.metadataId));
    if (r.base === '1:1' && (r.traitCount !== 2 || !r.specialName)) err('one-of-one', '1:1 tokens must have exactly two traits and a special name', String(r.metadataId));
    if (r.base !== '1:1' && r.specialName) err('special-name', 'only 1:1 tokens carry a special name', String(r.metadataId));
    if (r.base === 'Skull' && r.traits.Form !== 'Skull') err('form-base', 'Skull base without Skull form', String(r.metadataId));
    if (r.base === 'Radioactive' && r.traits.Background !== 'Radioactive') err('background-base', 'Radioactive base without Radioactive background', String(r.metadataId));
    if (r.base !== '1:1') for (const c of ['Background', 'Skin', 'Side', 'Eyes', 'Form', 'Tier', 'Naked'] as Category[]) if (r.traits[c] === undefined) err('required-category', `${c} missing`, String(r.metadataId));
    if (r.traits.Naked === 'No' && r.traits.Body === undefined && r.base !== '1:1') noBody.push(r.metadataId);
  }
  if (noBody.length) warn('no-body', `${noBody.length} tokens say Naked=No but have no Body trait (metadata ids ${noBody.slice(0, 8).join(', ')}, ...)`);
  for (let t = 1; t <= MAX_SUPPLY; t++) if (!tokens.has(t)) err('token-missing', `tokenId ${t} has no record`, String(t));
  // dictionary consistency
  for (const c of dict) {
    const sum = c.values.reduce((a, v) => a + v.count, 0);
    if (sum !== c.tokensWithTrait) err('dictionary-sum', `${c.category}: value counts add to ${sum}, expected ${c.tokensWithTrait}`);
    if (c.tokensWithTrait + c.tokensWithout !== records.length) err('dictionary-total', `${c.category}: with + without != ${records.length}`);
  }
  for (const g of nearDuplicates(dict)) warn('near-duplicate', `${g.category}: ${g.values.map((v) => `"${v.value}" (${v.count})`).join(' / ')} differ only by case, spacing or plural`, g.category);
  return out;
}

// ---------------------------------------------------------------- csv

const csvCell = (s: string | number | null) => { const t = s === null ? '' : String(s); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

export function toCsv(records: CatalogueRecord[]): string {
  const head = ['tokenId', 'metadataId', 'name', 'specialName', 'base', 'tier', 'traitCount', ...CATEGORY_ORDER, 'imageUri', 'metadataUri', 'tokenIdBasis', 'openseaRank'];
  const lines = [head.join(',')];
  for (const r of records) lines.push([r.tokenId, r.metadataId, r.name, r.specialName, r.base, r.tier, r.traitCount, ...CATEGORY_ORDER.map((c) => r.traits[c] ?? ''), r.imageUri, r.metadataUri, r.tokenIdBasis, r.openseaRank].map(csvCell).join(','));
  return lines.join('\n') + '\n';
}
