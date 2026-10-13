// NFT-R1: validation of the Chog Genesis research package in data/chog-genesis.
// Part 1 checks the data files as shipped (complete, unique, consistent, reproducible).
// Part 2 feeds the validators broken copies to prove they catch missing, duplicate, malformed and inconsistent records.
// Research only: nothing here touches the game.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_ORDER, MAX_SUPPLY, STARTING_INDEX_DERIVED,
  STARTER_PARTITION, buildCatalogue, compareWithOpenSea, metadataIdOf, nearDuplicates, parseName, partitionStats, rarityTable, spearman, tierAssociation, tokenIdOf, traitDictionary,
  validateCatalogue, validateRaw, vocabularyOverlap,
  type CatalogueRecord, type OpenSeaRow, type RawByFile, type TraitCategory,
} from '../tools/nft/lib';

const read = (p: string) => readFileSync(new URL(`../data/chog-genesis/${p}`, import.meta.url), 'utf8');
const raw = JSON.parse(read('raw/ipfs-metadata.json')) as RawByFile;
const sample = (JSON.parse(read('third-party/opensea-sample.json')) as { rows: OpenSeaRow[] }).rows;
const catalogue = JSON.parse(read('catalogue.json')) as { meta: { records: number }; records: CatalogueRecord[] };
const dictFile = JSON.parse(read('trait-dictionary.json')) as { categories: TraitCategory[] };
const rarityFile = JSON.parse(read('rarity.json')) as { rows: ReturnType<typeof rarityTable> };
const issuesFile = JSON.parse(read('issues.json')) as { validation: { rawErrors: number; catalogueErrors: number } };
const manifest = JSON.parse(read('manifest.json')) as { files: Record<string, { bytes: number; sha256: string }> };

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('contract rule: token id to metadata id', () => {
  it('is a permutation of 1..1969 and tokenIdOf inverts it', () => {
    const seen = new Set<number>();
    for (let t = 1; t <= MAX_SUPPLY; t++) {
      const m = metadataIdOf(t);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(MAX_SUPPLY);
      seen.add(m);
      expect(tokenIdOf(m)).toBe(t);
    }
    expect(seen.size).toBe(MAX_SUPPLY);
  });
  it('shows that token ids and displayed numbers are different things', () => {
    expect(metadataIdOf(1754)).toBe(1246);
    expect(metadataIdOf(299)).toBe(1760);
    expect(metadataIdOf(508)).toBe(1969);
    expect(metadataIdOf(1969)).toBe(1461);
    let same = 0;
    for (let t = 1; t <= MAX_SUPPLY; t++) if (metadataIdOf(t) === t) same++;
    expect(same).toBe(0); // with startingIndex 1461 no token shows its own number
  });
  it('agrees with all 50 token/name pairs read from OpenSea', () => {
    expect(sample).toHaveLength(50);
    for (const r of sample) expect(metadataIdOf(r.tokenId)).toBe(r.displayNumber);
  });
});

describe('as-acquired metadata', () => {
  it('has no validation errors', () => {
    expect(validateRaw(raw).filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('holds exactly files 1..1969, each with the same four fields', () => {
    const keys = Object.keys(raw).map(Number).sort((a, b) => a - b);
    expect(keys).toHaveLength(MAX_SUPPLY);
    expect(keys[0]).toBe(1);
    expect(keys[keys.length - 1]).toBe(MAX_SUPPLY);
    for (const [k, o] of Object.entries(raw)) {
      expect(Object.keys(o).sort()).toEqual(['attributes', 'description', 'image', 'name']);
      expect(parseName(o.name)?.n).toBe(Number(k));
    }
  });
  it('keeps text exactly as published (only the em dash is non-ASCII)', () => {
    const text = read('raw/ipfs-metadata.json');
    const odd = [...text].filter((c) => c.charCodeAt(0) > 127 && c !== '\u2014');
    expect(odd).toEqual([]);
    expect(text).not.toContain('\ufffd');
  });
});

describe('catalogue', () => {
  const rec = catalogue.records;
  it('has one record per token with unique token ids 1..1969 and unique metadata ids', () => {
    expect(rec).toHaveLength(MAX_SUPPLY);
    expect(catalogue.meta.records).toBe(MAX_SUPPLY);
    expect(new Set(rec.map((r) => r.tokenId)).size).toBe(MAX_SUPPLY);
    expect(new Set(rec.map((r) => r.metadataId)).size).toBe(MAX_SUPPLY);
    expect(Math.min(...rec.map((r) => r.tokenId))).toBe(1);
    expect(Math.max(...rec.map((r) => r.tokenId))).toBe(MAX_SUPPLY);
  });
  it('is exactly what the build produces from the raw files (no hand edits, not stale)', () => {
    expect(rec).toEqual(buildCatalogue(raw, sample, STARTING_INDEX_DERIVED));
  });
  it('has no validation errors', () => {
    expect(validateCatalogue(rec, dictFile.categories).filter((i) => i.severity === 'error')).toEqual([]);
    expect(issuesFile.validation.rawErrors + issuesFile.validation.catalogueErrors).toBe(0);
  });
  it('labels the basis of every token id honestly', () => {
    const observed = rec.filter((r) => r.tokenIdBasis === 'opensea-observed');
    expect(observed).toHaveLength(50);
    for (const r of observed) expect(sample.find((s) => s.tokenId === r.tokenId)?.displayNumber).toBe(r.metadataId);
    expect(rec.filter((r) => r.tokenIdBasis === 'derived')).toHaveLength(MAX_SUPPLY - 50);
  });
  it('keeps the rules the mapping documents rely on', () => {
    const tiers = new Map<string, number>();
    for (const r of rec) tiers.set(`${r.base}/${r.tier}`, (tiers.get(`${r.base}/${r.tier}`) ?? 0) + 1);
    expect(Object.fromEntries(tiers)).toEqual({ '1:1/Legendary': 10, 'Origin/Common': 1279, 'Origin/Uncommon': 590, 'Radioactive/Epic': 30, 'Skull/Rare': 60 });
    expect(rec.filter((r) => r.base === '1:1').every((r) => r.traitCount === 2 && r.specialName !== null)).toBe(true);
    // Within Origin tokens Side is just Tier written another way.
    for (const r of rec.filter((x) => x.base === 'Origin')) expect(r.traits.Side).toBe(r.tier === 'Common' ? 'Right' : 'Left');
  });
  it('has a unique trait combination for every token except the ten 1:1 tokens', () => {
    const combos = new Map<string, number>();
    for (const r of rec) { const k = CATEGORY_ORDER.map((c) => r.traits[c] ?? '').join('|'); combos.set(k, (combos.get(k) ?? 0) + 1); }
    const dup = [...combos.values()].filter((n) => n > 1);
    expect(dup).toEqual([10]);
    expect(combos.size).toBe(MAX_SUPPLY - 9);
  });
});

describe('trait dictionary', () => {
  it('matches a fresh recount of the catalogue', () => {
    expect(dictFile.categories).toEqual(traitDictionary(catalogue.records));
  });
  it('adds up: values sum to tokens with the category, and with + without = 1969', () => {
    for (const c of dictFile.categories) {
      expect(c.values.reduce((a, v) => a + v.count, 0)).toBe(c.tokensWithTrait);
      expect(c.tokensWithTrait + c.tokensWithout).toBe(MAX_SUPPLY);
    }
  });
  it('reproduces the 12 trait counts OpenSea displays on the page of token 1754 (an independent source)', () => {
    const shown: Record<string, [string, number]> = {
      Aura: ['Smoke', 57], Background: ['Light Purple', 183], Base: ['Origin', 1869], Body: ['dark tee', 12], Eyes: ['Base', 33], Form: ['Chog', 1899],
      Head: ['BTC Beanie', 25], Mouth: ['BTC Coin', 61], Naked: ['No', 1905], Side: ['Left', 650], Skin: ['Pink', 557], Tier: ['Uncommon', 590],
    };
    for (const [cat, [value, count]] of Object.entries(shown)) {
      expect(dictFile.categories.find((c) => c.category === cat)?.values.find((v) => v.value === value)?.count).toBe(count);
    }
  });
  it('reports the known near-duplicate spellings without merging them', () => {
    const groups = nearDuplicates(dictFile.categories).map((g) => `${g.category}:${g.values.map((v) => v.value).sort().join('/')}`).sort();
    expect(groups).toEqual(['Body:Stripe Shirt/Stripe shirts', 'Head:BOOB Cap/Boob Cap', 'Head:JEET Cap/Jeet Cap']);
  });
});

describe('rarity (calculated)', () => {
  const rows = rarityFile.rows;
  it('matches a fresh calculation', () => {
    expect(rows).toEqual(rarityTable(catalogue.records, dictFile.categories));
  });
  it('ranks within 1..1969 and puts the ten 1:1 tokens at the top of M1 and M5', () => {
    for (const r of rows) for (const k of ['rankIc', 'rankIcPresent', 'rankInverse', 'rankRarest', 'rankIcCount'] as const) { expect(r[k]).toBeGreaterThanOrEqual(1); expect(r[k]).toBeLessThanOrEqual(MAX_SUPPLY); }
    const ones = new Set(catalogue.records.filter((r) => r.base === '1:1').map((r) => r.tokenId));
    expect(rows.filter((r) => ones.has(r.tokenId)).every((r) => r.rankIc <= 12 && r.rankIcCount <= 12)).toBe(true);
  });
  it('M5 reproduces the OpenSea rank of every one of the 50 sampled tokens exactly', () => {
    const m5 = compareWithOpenSea(rows).find((c) => c.method.startsWith('M5'));
    expect(m5).toMatchObject({ n: 50, exactRankMatches: 50, maxAbsRankDifference: 0 });
    expect(m5?.spearman).toBe(1);
  });
  it('the plainer scores track OpenSea less closely (documented in RARITY.md)', () => {
    const by = Object.fromEntries(compareWithOpenSea(rows).map((c) => [c.method.slice(0, 2), c]));
    expect(by.M1.spearman).toBeGreaterThan(0.9);
    expect(by.M1.exactRankMatches).toBeLessThan(50);
    expect(by.M4.spearman).toBeLessThan(by.M1.spearman);
  });
  it('spearman works on known cases', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 10);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 10);
  });
});

describe('structure the mapping proposal depends on', () => {
  const rec = catalogue.records;
  it('Common and Uncommon Origin tokens draw from nearly separate trait pools', () => {
    const o = Object.fromEntries(vocabularyOverlap(rec).map((v) => [v.category, v]));
    expect(o.Aura.sharedValues).toBe(0);
    expect(o.Accessory.onlyUncommon).toBe(9);
    expect(o.Body.sharedValues).toBe(2);
    expect(o.Head.sharedValues).toBe(2);
    expect(o.Eyes.sharedValues).toBe(4);
  });
  it('every category except Naked is tied to Tier among Origin tokens (so Tier cannot be treated as independent of traits)', () => {
    const t = tierAssociation(rec);
    expect(t.filter((x) => !x.tiedToTier).map((x) => x.category)).toEqual(['Naked']);
    expect(tierAssociation(rec)).toEqual(t); // seeded, reproducible
  });
  it('the starter partition only lists real trait values, with no value in two families', () => {
    for (const axis of STARTER_PARTITION) {
      const s = partitionStats(rec, dictFile.categories, axis);
      expect(s.unknownValues).toEqual([]);
      expect(s.overlappingValues).toEqual([]);
      expect(s.families.reduce((a, f) => a + f.tokens, 0)).toBe(MAX_SUPPLY);
    }
  });
  it('the issues register lists what is unverified, including the three open on-chain facts', () => {
    const ids = ((JSON.parse(read('issues.json')) as { unverified: { id: string; status: string }[] }).unverified).map((u) => u.id);
    expect(ids).toEqual(expect.arrayContaining(['starting-index', 'base-uri', 'metadata-bytes', 'art-rights', 'ownership']));
  });
});

describe('manifest', () => {
  it('lists the current size and sha256 of every data file', () => {
    for (const [file, info] of Object.entries(manifest.files)) {
      const text = read(file);
      expect(Buffer.byteLength(text)).toBe(info.bytes);
      expect(createHash('sha256').update(text).digest('hex')).toBe(info.sha256);
    }
  });
});

describe('validators catch broken data', () => {
  it('missing token record', () => {
    const r = clone(raw); delete r['777'];
    expect(codes(validateRaw(r))).toEqual(expect.arrayContaining(['raw-count', 'raw-missing']));
  });
  it('duplicate identifier (two files claim the same number)', () => {
    const r = clone(raw); r['778'].name = r['777'].name;
    expect(codes(validateRaw(r))).toEqual(expect.arrayContaining(['raw-name-number', 'raw-name-duplicate']));
  });
  it('extra file outside 1..1969', () => {
    const r = clone(raw); r['1970'] = r['1'];
    expect(codes(validateRaw(r))).toEqual(expect.arrayContaining(['raw-count', 'raw-extra']));
  });
  it('invalid metadata: bad name, wrong image, unknown field, empty description', () => {
    const r = clone(raw);
    r['5'].name = 'Chog five';
    r['6'].image = 'ipfs://bafyother/6.webp';
    (r['7'] as unknown as Record<string, unknown>).extra = 1;
    r['8'].description = '';
    const c = codes(validateRaw(r));
    expect(c).toEqual(expect.arrayContaining(['raw-name', 'raw-image', 'raw-fields', 'raw-description']));
  });
  it('inconsistent trait values: unknown category, duplicate category, stray spaces, non-string value', () => {
    const r = clone(raw);
    r['9'].attributes.push({ trait_type: 'Weapon', value: 'Sword' });
    r['10'].attributes.push({ ...r['10'].attributes[0] });
    r['11'].attributes[0].value = ' Lemon';
    (r['12'].attributes[0] as unknown as { value: unknown }).value = 5;
    const c = codes(validateRaw(r));
    expect(c).toEqual(expect.arrayContaining(['raw-category', 'raw-duplicate-category', 'raw-value-format', 'raw-attribute-shape']));
  });
  it('catalogue: duplicate token id, broken mapping, tier that does not fit the base, missing required trait, wrong count', () => {
    const base = buildCatalogue(raw, sample);
    const dict = traitDictionary(base);
    const dup = clone(base); dup[1].tokenId = dup[0].tokenId;
    expect(codes(validateCatalogue(dup, dict))).toEqual(expect.arrayContaining(['token-duplicate', 'token-missing']));
    const map = clone(base); map.find((r) => r.tokenIdBasis === 'derived')!.metadataId += 0; map.find((r) => r.tokenIdBasis === 'derived')!.tokenId = map.find((r) => r.tokenIdBasis === 'derived')!.tokenId === 1 ? 2 : 1;
    expect(codes(validateCatalogue(map, dict))).toEqual(expect.arrayContaining(['mapping']));
    const tier = clone(base); tier.find((r) => r.base === 'Skull')!.tier = 'Common';
    expect(codes(validateCatalogue(tier, dict))).toContain('tier-base');
    const req = clone(base); delete req.find((r) => r.base === 'Origin')!.traits.Eyes;
    expect(codes(validateCatalogue(req, dict))).toContain('required-category');
    const short = clone(base).slice(1);
    expect(codes(validateCatalogue(short, traitDictionary(short)))).toEqual(expect.arrayContaining(['catalogue-count', 'token-missing']));
  });
  it('dictionary that does not add up', () => {
    const base = buildCatalogue(raw, sample);
    const dict = traitDictionary(base); dict[0].values[0].count += 1;
    expect(codes(validateCatalogue(base, dict))).toContain('dictionary-sum');
  });
  it('parseName reads plain and special names', () => {
    expect(parseName('CHOG #1246')).toEqual({ n: 1246, special: null });
    expect(parseName('CHOG #53 \u2014 Blaze')).toEqual({ n: 53, special: 'Blaze' });
    expect(parseName('CHOG 53')).toBeNull();
  });
});
