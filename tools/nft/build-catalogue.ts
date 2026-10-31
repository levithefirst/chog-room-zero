// Builds the Chog Genesis research outputs from the as-acquired metadata.
//   node tools/nft/build-catalogue.ts
// Reads  data/chog-genesis/raw/ipfs-metadata.json, data/chog-genesis/third-party/opensea-sample.json
// Writes data/chog-genesis/{catalogue.json,catalogue.csv,trait-dictionary.json,rarity.json,issues.json,manifest.json}
//        docs/research/chog-genesis/TRAIT-DICTIONARY.md
// Refuses to write anything if the raw data has validation errors. Pure logic lives in lib.ts.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  CATEGORY_ORDER, CHAIN_ID, STARTER_PARTITION, CONTRACT, MAX_SUPPLY, METADATA_CID, IMAGE_CID, METHODS, SEMANTIC_NEAR_DUPLICATE_CANDIDATES, STARTING_INDEX_DERIVED,
  backgroundFamilies, buildCatalogue, compareWithOpenSea, couplings, displayFlags, distinctCombos, nearDuplicates, notNakedWithoutBody, rarityTable, toCsv, traitDictionary, twinGroups,
  partitionStats, tierAssociation, uniqueValueHolders, vocabularyOverlap, validateCatalogue, validateRaw,
  type OpenSeaRow, type RawByFile,
} from './lib.ts';

const root = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const rawText = read('data/chog-genesis/raw/ipfs-metadata.json');
const sampleText = read('data/chog-genesis/third-party/opensea-sample.json');
const raw = JSON.parse(rawText) as RawByFile;
const sample = (JSON.parse(sampleText) as { rows: OpenSeaRow[] }).rows;

const rawIssues = validateRaw(raw);
if (rawIssues.some((i) => i.severity === 'error')) {
  for (const i of rawIssues.filter((x) => x.severity === 'error').slice(0, 20)) console.error(`ERROR ${i.code} ${i.subject ?? ''} ${i.message}`);
  throw new Error('raw metadata failed validation; nothing written');
}

const records = buildCatalogue(raw, sample);
const dict = traitDictionary(records);
const catIssues = validateCatalogue(records, dict);
if (catIssues.some((i) => i.severity === 'error')) {
  for (const i of catIssues.filter((x) => x.severity === 'error').slice(0, 20)) console.error(`ERROR ${i.code} ${i.subject ?? ''} ${i.message}`);
  throw new Error('catalogue failed validation; nothing written');
}
const rarity = rarityTable(records, dict);
const comparison = compareWithOpenSea(rarity);

const lines = (rows: unknown[]) => '[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]';
const out = (p: string, s: string) => writeFileSync(new URL(p, root), s);

const catalogueMeta = {
  generatedBy: 'tools/nft/build-catalogue.ts',
  chainId: CHAIN_ID, contract: CONTRACT, standard: 'ERC-721 (OpenZeppelin ERC721 + ERC2981 + AccessControl), per the Sourcify-verified source',
  maxSupply: MAX_SUPPLY, records: records.length, tokenIdRange: [1, MAX_SUPPLY], metadataIdRange: [1, MAX_SUPPLY],
  metadataFolder: `ipfs://${METADATA_CID}/`, imageFolder: `ipfs://${IMAGE_CID}/`,
  mapping: { rule: 'metadataId = ((tokenId - 1 + startingIndex) % maxSupply) + 1', startingIndex: STARTING_INDEX_DERIVED, startingIndexStatus: 'DERIVED from 50 OpenSea token/name pairs; not read on chain', observedTokenIds: sample.length },
  verification: 'metadata acquired from the IPFS folder through a gateway as text; files not hash-verified against their CIDs; baseURI not read on chain (see issues.json "unverified")',
};
out('data/chog-genesis/catalogue.json', `{"meta":${JSON.stringify(catalogueMeta)},\n"records":${lines(records)}}\n`);
out('data/chog-genesis/catalogue.csv', toCsv(records));
out('data/chog-genesis/trait-dictionary.json', `{"collectionSize":${records.length},"categories":[\n${dict.map((c) => JSON.stringify(c)).join(',\n')}\n]}\n`);

const rarityMeta = {
  note: 'CALCULATED scores. Rank 1 is the rarest. Probabilities are shares of the 1,969 tokens. Not the project\'s or OpenSea\'s ranking.',
  methods: METHODS,
  comparisonWithOpenSeaSample: { source: 'data/chog-genesis/third-party/opensea-sample.json', note: 'Spearman correlation of the OpenSea rank with each method over the tokens in the sample', results: comparison },
};
out('data/chog-genesis/rarity.json', `{"meta":${JSON.stringify(rarityMeta)},\n"rows":${lines(rarity)}}\n`);

// What is NOT verified, with the reason and the way to close it. Kept next to the code so the report cannot drift from it.
const UNVERIFIED = [
  { id: 'starting-index', claim: 'startingIndex is 1461', status: 'derived', evidence: 'the verified contract rule (metadataId = ((id - 1 + startingIndex) % maxSupply) + 1) fits all 50 token/name pairs read from OpenSea only for 1461', notEvidence: 'not read from the chain', howToClose: 'node tools/nft/read-chain.ts (reads startingIndex, and with --all checks metadataId for all 1,969 tokens)' },
  { id: 'base-uri', claim: `baseURI is ipfs://${METADATA_CID}/`, status: 'inferred', evidence: 'OpenSea reports tokenUri .../ipfs/<this CID>/1246.json for token 1754, and the contract builds tokenURI as baseURI + metadataId + ".json"', notEvidence: 'not read from the chain', howToClose: 'node tools/nft/read-chain.ts' },
  { id: 'metadata-bytes', claim: 'the 1,969 files in data/chog-genesis/raw are exactly what the CID names', status: 'not verified', evidence: 'fetched as one CAR through a text-only scraping service from OpenSea\'s gateway; all 1,969 parse, the directory lists exactly 1.json to 1969.json, file 1246.json is identical on two gateways, 12 of 12 trait counts match OpenSea', notEvidence: 'blocks were not hashed against their content ids (the transport turned bytes into text), and each object was assigned to its file number by the number in its own name and image URI, not by the directory entry that points at it (those entries are binary)', howToClose: 'node tools/nft/verify-ipfs.ts (hashes every block, compares every file)' },
  { id: 'total-supply', claim: 'totalSupply() is 1,969 (fully minted)', status: 'reported', evidence: 'mint.chog.xyz shows "Minted 1,969 / 1,969" and says phase counts are read from the contract; OpenSea lists 1,969 items', notEvidence: 'not read by this project', howToClose: 'node tools/nft/read-chain.ts' },
  { id: 'official-address', claim: 'this contract is the official CHOG Genesis contract', status: 'strong, not cryptographic', evidence: 'official mint site mint.chog.xyz links to the OpenSea collection chog-genesis, whose items use this address; the source is verified on Sourcify as ChogMint (exact match, 2026-09-03); supply and metadata description (1969 pieces) agree', notEvidence: 'no ChogLabs page found that prints the address; the official site renders it with JavaScript this project could not run', howToClose: 'owner or ChogLabs confirms the address in an official channel' },
  { id: 'mint-accounting', claim: 'every minted token is accounted for by the published mint phases', status: 'gap', evidence: 'mint site phases: GTD 1,206, FCFS Chest 350, FCFS Roles 157, FCFS 0, Public 0 = 1,713 of 1,969', notEvidence: '256 tokens are not explained by the phase list (probably the reserve / team mint, which the contract supports)', howToClose: 'read reserveMinted() and the Minted events' },
  { id: 'ownership', claim: 'who owns each token', status: 'not acquired', evidence: 'ownerOf(uint256) is in the verified ABI', notEvidence: 'no owner was read; ownership changes and is not catalogue data', howToClose: 'at bind time, server side, with ownerOf (design in docs/design/nft.md)' },
  { id: 'art-rights', claim: 'what the game may do with the artwork', status: 'UNKNOWN', evidence: 'no collection-specific terms were found (only general articles on NFT licensing)', notEvidence: 'the contract source is MIT licensed; that is the code, not the art', howToClose: 'owner asks ChogLabs for written terms; until then use no Chog art in the build' },
  { id: 'images', claim: 'image files exist and match their names', status: 'not checked', evidence: 'image URIs follow ipfs://<image CID>/<n>.webp for all 1,969 records', notEvidence: 'no image was downloaded or looked at, so every visual statement in the docs comes from trait names only', howToClose: 'download from the image CID and view a sample' },
  { id: 'third-party-rank', claim: 'OpenSea rarity rank for all tokens', status: 'sample only', evidence: '50 ranks read from one listing page, all reproduced exactly by calculated score M5; OpenSea says its ranking follows OpenRarity with Double Sort and Trait Count updates', notEvidence: 'the ranks of the other 1,919 tokens were not read and OpenSea\'s full formula is not published', howToClose: 'not needed for the game; the OpenSea API with a key would list every rank' },
];

// ---- issues: what is missing, conflicting, unverified, odd
const groupsSkip = [[], ['Side'], ['Background'], ['Side', 'Background'], ['Side', 'Background', 'Aura']] as const;
const specials = records.filter((r) => r.base === '1:1').map((r) => ({ tokenId: r.tokenId, metadataId: r.metadataId, name: r.name, specialName: r.specialName }));
const issues = {
  generatedBy: 'tools/nft/build-catalogue.ts',
  validation: { rawErrors: rawIssues.filter((i) => i.severity === 'error').length, catalogueErrors: catIssues.filter((i) => i.severity === 'error').length, warnings: [...rawIssues, ...catIssues].filter((i) => i.severity === 'warning') },
  unverified: UNVERIFIED,
  missingRecords: { metadataFiles: 0, tokenRecords: 0, note: 'all 1,969 metadata files present; the IPFS directory node lists exactly 1.json to 1969.json' },
  missingData: [
    { id: 'owners', what: 'current owner of each token', why: 'ownership changes; it must be read with ownerOf at bind time, not stored in a catalogue', status: 'not acquired' },
    { id: 'onchain-token-uri', what: 'tokenURI(id) read from the contract', why: 'this container cannot reach a Monad RPC; baseURI inferred from OpenSea', status: 'not acquired; tools/nft/read-chain.ts closes it' },
    { id: 'images', what: 'the 1,969 image files', why: 'not downloaded; image URIs recorded only. Art rights are UNKNOWN, so no art was copied into the repo', status: 'not acquired by design' },
    { id: 'rankings-other', what: 'rarity rankings from sites other than OpenSea', why: 'none was fetched', status: 'not acquired' },
    { id: 'rarity-all-opensea', what: 'OpenSea rank for every token', why: 'only the 50 shown on one listing page were read', status: 'sample only (50 of 1,969)' },
  ],
  conflicts: {
    betweenSources: [],
    checked: [
      { check: 'supply', sources: ['OpenSea collection page: 1,969 items', 'mint.chog.xyz: minted 1,969 / 1,969', 'IPFS metadata folder: 1,969 files', 'metadata description: 1969-piece collection'], result: 'agree' },
      { check: 'token page traits (token 1754, 12 traits)', sources: ['IPFS 1246.json', 'OpenSea item page'], result: 'agree, 12 of 12 values' },
      { check: 'trait counts (the 12 counts OpenSea shows for token 1754)', sources: ['this catalogue', 'OpenSea item page'], result: 'agree, 12 of 12 counts' },
      { check: 'file 1246.json bytes', sources: ['ipfs2.seadn.io gateway', 'gateway.pinata.cloud gateway'], result: 'identical' },
      { check: 'token id to displayed number', sources: ['Sourcify-verified contract rule with startingIndex 1461', '50 OpenSea listing pairs'], result: 'agree, 50 of 50' },
    ],
    internal: 'no conflicting records; the inconsistencies below are naming inconsistencies inside the metadata itself',
  },
  nearDuplicateTraitValues: nearDuplicates(dict),
  semanticNearDuplicateCandidates: SEMANTIC_NEAR_DUPLICATE_CANDIDATES.map((c) => ({ ...c, counts: c.values.map((v) => dict.find((d) => d.category === c.category)?.values.find((x) => x.value === v)?.count ?? 0) })),
  displayReview: displayFlags(dict),
  notNakedWithoutBody: { count: notNakedWithoutBody(records).length, metadataIds: notNakedWithoutBody(records), note: 'Naked=No but no Body trait. Unexplained by the metadata; check the art before treating Body as always present' },
  specialTokens: specials,
};
out('data/chog-genesis/issues.json', JSON.stringify(issues, null, 1) + '\n');

// ---- generated issues document (mirror of issues.json for people)
const iss: string[] = [];
const esc = (x: string) => x.replace(/\|/g, '\\|');
iss.push('# Missing, conflicting and unverified records (task NFT-R1)', '', 'GENERATED by `node tools/nft/build-catalogue.ts` from the same data as `data/chog-genesis/issues.json`. Do not edit by hand.', '');
iss.push('## Result of the automated validation', '', `- Raw metadata errors: ${issues.validation.rawErrors}. Catalogue errors: ${issues.validation.catalogueErrors}. Warnings: ${issues.validation.warnings.length}.`, `- Missing records: none. All ${MAX_SUPPLY} metadata files and all ${MAX_SUPPLY} token records are present; the IPFS directory lists exactly \`1.json\` to \`${MAX_SUPPLY}.json\`.`, '');
iss.push('Warnings:', '', ...issues.validation.warnings.map((w) => `- ${w.code}: ${w.message}`), '');
iss.push('## Unverified claims', '', '| Claim | Status | What supports it | What is missing | How to close it |', '|---|---|---|---|---|');
for (const u of UNVERIFIED) iss.push(`| ${esc(u.claim)} | ${u.status} | ${esc(u.evidence)} | ${esc(u.notEvidence)} | ${esc(u.howToClose)} |`);
iss.push('', '## Missing data', '', '| What | Why | Status |', '|---|---|---|');
for (const m of issues.missingData) iss.push(`| ${esc(m.what)} | ${esc(m.why)} | ${m.status} |`);
iss.push('', '## Conflicts', '', 'No conflicting records between sources were found. Checks made:', '', '| Check | Sources | Result |', '|---|---|---|');
for (const c of issues.conflicts.checked) iss.push(`| ${esc(c.check)} | ${esc(c.sources.join('; '))} | ${c.result} |`);
iss.push('', '## Inconsistencies inside the metadata itself', '', '### Spelling variants of one trait (exact strings differ by case, spacing or plural)', '');
for (const g of issues.nearDuplicateTraitValues) iss.push(`- ${g.category}: ${g.values.map((v) => `"${v.value}" (${v.count})`).join(' and ')}`);
iss.push('', '### Look-alike candidates (from reading the dictionary; need a look at the art, not merged)', '');
for (const g of issues.semanticNearDuplicateCandidates) iss.push(`- ${g.category}: ${g.values.map((v, i) => `"${v}" (${g.counts[i]})`).join(', ')}`);
iss.push('', `### Tokens that say Naked = No but have no Body trait (${issues.notNakedWithoutBody.count})`, '', `Metadata ids: ${issues.notNakedWithoutBody.metadataIds.join(', ')}.`, '', issues.notNakedWithoutBody.note + '.', '');
iss.push('### The ten 1:1 tokens (two attributes, named)', '', '| Token id | Metadata id | Name |', '|---|---|---|');
for (const s of issues.specialTokens) iss.push(`| ${s.tokenId} | ${s.metadataId} | CHOG #${s.metadataId} (${s.specialName}) |`);
iss.push('', '## Values to review before they appear in a game UI', '', 'Matched by name only (patterns in `tools/nft/lib.ts`), no judgement about the art. Counts are tokens holding the value.', '', '| Reason | Category | Value | Tokens |', '|---|---|---|---|');
for (const f of issues.displayReview) iss.push(`| ${f.reason} | ${f.category} | ${esc(f.value)} | ${f.tokens} |`);
out('docs/research/chog-genesis/ISSUES.md', iss.join('\n') + '\n');

// ---- analysis facts used by the docs (observed counts and structure), kept in one file
const analysis = {
  generatedBy: 'tools/nft/build-catalogue.ts',
  traitCountDistribution: Object.fromEntries([...records.reduce((m, r) => m.set(r.traitCount, (m.get(r.traitCount) ?? 0) + 1), new Map<number, number>())].sort((a, b) => a[0] - b[0])),
  tierByBase: Object.fromEntries([...records.reduce((m, r) => m.set(`${r.base}/${r.tier}`, (m.get(`${r.base}/${r.tier}`) ?? 0) + 1), new Map<string, number>())].sort()),
  distinctFullCombinations: distinctCombos(records),
  twinsIgnoring: groupsSkip.map((skip) => { const g = twinGroups(records, skip); return { ignored: [...skip], distinctCombinations: distinctCombos(records, skip), groups: g.length, tokensInGroups: g.reduce((a, x) => a + x.groupSize, 0), largest: g.reduce((a, x) => Math.max(a, x.groupSize), 0) }; }),
  twinGroupsIgnoringSideBackgroundAura: twinGroups(records, ['Side', 'Background', 'Aura']).filter((g) => g.groupSize > 1 && !records.find((r) => r.metadataId === g.metadataIds[0] && r.base === '1:1')),
  labelCouplings: couplings(records).filter((c) => /^(Base|Form|Tier|Naked)=/.test(c.when)),
  backgroundFamiliesOfOriginBase: backgroundFamilies(records),
  uniqueValueHolders: uniqueValueHolders(dict, records),
  vocabularyOverlapCommonVsUncommon: vocabularyOverlap(records),
  tierAssociationAmongOriginTokens: tierAssociation(records),
  starterPartition: STARTER_PARTITION.map((a) => ({ ...partitionStats(records, dict, a), note: a.note, families_defined: a.families })),
  topAndBottomByM5: { rarest: [...rarity].sort((a, b) => a.rankIcCount - b.rankIcCount).slice(0, 30), commonest: [...rarity].sort((a, b) => b.rankIcCount - a.rankIcCount).slice(0, 10) },
};
out('data/chog-genesis/analysis.json', JSON.stringify(analysis, null, 1) + '\n');

// ---- generated trait dictionary document
const md: string[] = [];
md.push('# Chog Genesis trait dictionary', '', 'GENERATED by `node tools/nft/build-catalogue.ts` from `data/chog-genesis/raw/ipfs-metadata.json`. Do not edit by hand.', '',
  `Every count is a share of ${records.length} tokens. "Without" is the number of tokens that have no entry for the category (the metadata omits a category instead of writing "None"). Values are exact strings from the metadata, spelling and case included.`, '');
md.push('| Category | Distinct values | Tokens with it | Tokens without |', '|---|---|---|---|');
for (const c of dict) md.push(`| ${c.category} | ${c.distinctValues} | ${c.tokensWithTrait} | ${c.tokensWithout} |`);
for (const c of dict) {
  md.push('', `## ${c.category}`, '', `${c.distinctValues} values; ${c.tokensWithTrait} tokens have it (${(100 * c.tokensWithTrait / records.length).toFixed(2)}%), ${c.tokensWithout} do not.`, '', '| Value | Tokens | % of collection | % of tokens that have it |', '|---|---|---|---|');
  for (const v of c.values) md.push(`| ${v.value.replace(/\|/g, '\\|')} | ${v.count} | ${v.pctOfCollection.toFixed(2)} | ${v.pctOfPresent.toFixed(2)} |`);
}
out('docs/research/chog-genesis/TRAIT-DICTIONARY.md', md.join('\n') + '\n');

// ---- manifest
const files = ['raw/ipfs-metadata.json', 'third-party/opensea-sample.json', 'contract/ChogMint.sol', 'contract/sourcify-summary.json', 'catalogue.json', 'catalogue.csv', 'trait-dictionary.json', 'rarity.json', 'issues.json', 'analysis.json'];
const manifest = { generatedBy: 'tools/nft/build-catalogue.ts', files: Object.fromEntries(files.map((f) => { const t = read(`data/chog-genesis/${f}`); return [f, { bytes: Buffer.byteLength(t), sha256: sha(t) }]; })), categories: CATEGORY_ORDER, tokens: records.length };
out('data/chog-genesis/manifest.json', JSON.stringify(manifest, null, 1) + '\n');
console.log(`ok: ${records.length} records, ${dict.reduce((a, c) => a + c.distinctValues, 0)} distinct trait values, ${catIssues.filter((i) => i.severity === 'warning').length} warnings`);
