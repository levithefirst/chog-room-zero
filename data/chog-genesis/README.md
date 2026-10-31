# Chog Genesis data package (task NFT-R1)

Research data for the CHOG Genesis collection on Monad (chain 143, contract `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763`, 1,969 tokens). Read `docs/research/chog-genesis/REPORT.md` first. Nothing here is imported by the game or served by Vite.

Vocabulary: `tokenId` is the ERC-721 id (what `ownerOf` answers); `metadataId` is the number in `N.json`, `N.webp` and the name "CHOG #N". They differ for every token (see the report).

| File | What it is | Kind |
|---|---|---|
| `raw/ipfs-metadata.json` | the 1,969 metadata objects exactly as published, keyed by file number | observed. Transported as text; NOT hash-verified (see `tools/nft/verify-ipfs.ts`) |
| `third-party/opensea-sample.json` | 50 token ids, displayed numbers and OpenSea rarity ranks from one listing page | third party, cross-check only |
| `contract/ChogMint.sol`, `contract/sourcify-summary.json` | verified contract source and ABI, compiler, deployment facts | observed (Sourcify, exact match) |
| `catalogue.json`, `catalogue.csv` | one record per token: ids, name, traits, trait count, tier, URIs, how the token id was obtained | derived from the raw files |
| `trait-dictionary.json` | every trait category and value with counts and percentages | derived (observed counts) |
| `rarity.json` | five calculated scores and ranks per token, and their comparison with the OpenSea sample | calculated |
| `analysis.json` | structure findings: combinations, couplings, background families, tier association, series overlap, starter partition | calculated |
| `issues.json` | validation result, unverified claims, missing data, conflicts checked, naming problems, display-review values | derived plus hand-written register |
| `manifest.json` | size and sha256 of every file above | integrity |
| `chain-reads.json`, `raw/ipfs-verification.json` | NOT PRESENT. Written by `tools/nft/read-chain.ts` and `tools/nft/verify-ipfs.ts` when someone runs them with internet access | |

## Catalogue record

```
tokenId        1754                 ERC-721 id, 1..1969
metadataId     1246                 file/image number and the "CHOG #N" shown to people
name           "CHOG #1246"         exactly as published (ten names carry a title after an em dash)
specialName    null | "Blaze"       parsed from the name
description, imageUri, metadataUri  as published / derived (metadataUri is presumed, see report)
traits         { Background: "Light Purple", ... }   only the categories the token has; absent = not listed
traitCount     12
base, tier     copies of the Base and Tier traits
tokenIdBasis   "opensea-observed" (50 tokens) | "derived" (the contract rule with startingIndex 1461)
openseaRank    null | number (50 tokens)
```

## Rebuild and check

```
node tools/nft/build-catalogue.ts                                  # validates the raw files first; writes nothing if they fail
npx vitest run tests/nft-catalogue.test.ts tests/nft-car.test.ts   # checks the shipped files, and that the validators catch broken data
node tools/nft/verify-ipfs.ts                                      # needs internet
node tools/nft/read-chain.ts --all                                 # needs internet, read-only
```

`tests/nft-catalogue.test.ts` also fails if any shipped file differs from what the build would produce, so hand edits and stale files are caught.
