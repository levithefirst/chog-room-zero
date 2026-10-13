# Chog Genesis collection intelligence (task NFT-R1)

Research and data acquisition only. No game code, no wallet, no gameplay mechanic was added. Date: 2026-10-13. Author: claude.
Companion files: `SOURCES.md` (where every fact came from), `RARITY.md` (statistics), `IDENTITY-AND-MAPPING.md` (proposal), `ISSUES.md` (missing, conflicting, unverified), `TRAIT-DICTIONARY.md` (generated). Data: `data/chog-genesis/` (see its README).

## Headline

- **Supply: 1,969.** Records acquired and validated: **1,969 of 1,969** metadata records (no gap, no duplicate), one catalogue record per token id 1 to 1,969.
- **Not yet hash-verified, not yet read from the chain.** The metadata came through a text-only fetch, so its bytes were not checked against their content ids, and this environment could not reach any Monad RPC. Two small tools close both gaps in one command each (see Next steps). Until they run, treat the full-coverage claim as "complete and internally consistent", not "cryptographically verified".
- **Token id and displayed number are different numbers** for every token (rule below). Mixing them up would show players the wrong Chog.

## Verified facts

| Fact | Value | Status | Source (details in `SOURCES.md`) |
|---|---|---|---|
| Chain | Monad mainnet, chain id 143 | EVIDENCE | docs.monad.xyz network information |
| Contract | `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763` (the previously identified address, checksum form) | EVIDENCE | Sourcify record for chain 143; OpenSea item URLs; same address as the brief |
| Contract name and code | `ChogMint`, Solidity 0.8.28, OpenZeppelin `ERC721` + `ERC2981` + `AccessControl`, source verified (exact match on creation and runtime code, 2026-09-03), code licence MIT | EVIDENCE | Sourcify |
| Deployment | block 101,704,036, tx `0x23347f41...e4bd`, deployer `0x79bbEc62F13BF1756e2F29F465240814EC1876F4` | EVIDENCE | Sourcify |
| Token standard | ERC-721 (with ERC-2981 royalties). Ownership read: `ownerOf(uint256)` | EVIDENCE | verified source and ABI; OpenSea shows "ERC721". `ownerOf` was not called |
| Total supply | 1,969 | EVIDENCE for the number (three sources agree); not read from the chain by this project | OpenSea "1,969 items"; mint.chog.xyz "Minted 1,969 / 1,969"; 1,969 metadata files |
| Token id range | 1 to 1,969, minted in order | EVIDENCE | contract source (`firstId = totalSupply() + 1`); OpenSea sample includes token 1969 |
| Metadata id range | 1 to 1,969 | EVIDENCE | IPFS folder lists exactly `1.json` to `1969.json` |
| Token id to metadata id | `metadataId = ((tokenId - 1 + startingIndex) % 1969) + 1` | EVIDENCE for the rule (verified source) | contract `metadataId()` and `tokenURI()` |
| `startingIndex` | 1461 | DERIVED, not read | the only value that fits all 50 token/name pairs read from OpenSea |
| Metadata permanence | after `reveal()` (callable once) `setBaseURI()` reverts with `MetadataFrozen`; so `baseURI` and `startingIndex` are permanent once revealed, and the content-addressed folder cannot change | EVIDENCE from the verified source; that the contract is already revealed is inferred, `revealed()` not read | Sourcify source |
| Owner lookup | `ownerOf(uint256)` and `tokensOfOwner(address)` (one read-only call returning every token id a wallet holds). The contract is not enumerable and the source notes Monad RPCs reject `eth_getLogs` over more than 100 blocks | EVIDENCE from source and ABI; not called | Sourcify source |
| Metadata format | ERC-721 metadata JSON: `name`, `description`, `image`, `attributes[{trait_type, value}]`, all strings | EVIDENCE | the 1,969 files |
| Metadata location | `ipfs://bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu/<metadataId>.json` | INFERRED (rule is verified, the base address is OpenSea's reading) | OpenSea `tokenUri` for token 1754 |
| Images | `ipfs://bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/<metadataId>.webp` | EVIDENCE for the URIs; no image was downloaded | metadata `image` field |
| Official links | https://mint.chog.xyz (official mint, links to the OpenSea collection), https://opensea.io/collection/chog-genesis, https://chog.xyz (project site) | EVIDENCE that they exist and link to each other | search results and pages |
| Art rights | no terms found | **UNKNOWN** | see `SOURCES.md` |
| Creator name "ChogLabs" | taken from the brief | not seen in any source read | |

The fungible `$CHOG` token (`0x35003555...7777` per chog.xyz) is a different contract. Room Zero never depends on it.

### Token id versus displayed number

The contract reveals the collection with a shuffle. Token 1754 is shown as "CHOG #1246", token 299 as "CHOG #1760", token 508 as "CHOG #1969", and with `startingIndex` 1461 no token is shown under its own id. Ownership (`ownerOf`) and anything stored for a player belong to the **token id**. The name, image and traits belong to the **metadata id**. Rules for Room Zero: show the metadata id to players ("Chog #1246"), key persistent history by the token id, and convert with the contract's own `metadataId(tokenId)` once `startingIndex` is read from the chain.

## What the data says

1. **13 trait categories, 327 distinct values.** Background 32, Aura 22, Base 4, Skin 14, Side 2, Body 96, Mouth 15, Eyes 58, Head 66, Accessory 9, Form 2, Tier 5, Naked 2. `Accessory` appears on only 195 tokens, so a catalogue built from one sample token would miss it.
2. **Absent means omitted.** The metadata leaves a category out instead of writing "None". Records carry 9 to 13 attributes, except ten with 2. Aura is absent on 995 tokens, Accessory on 1,774, Head on 253, Body on 207, Mouth on 165.
3. **Ten named one-of-ones.** Base `1:1`, Tier `Legendary`, only two attributes, a name with a suffix: Blaze, Burning Skully, Chog Scream, Chogbomination, Frogger, Grim, Halo, Krown, Midas, Redd. Their trait lists are identical, so only the name and the image tell them apart.
4. **`Tier` is a project label with five values**: Common 1,279, Uncommon 590, Rare 60, Epic 30, Legendary 10. Rare, Epic and Legendary are exactly the Skull, Radioactive and 1:1 bases. No tier had to be invented.
5. **Common and Uncommon are close to two separate art sets.** They share no Aura value, 2 of 84 Body values, 2 of 44 Head values, 4 of 39 Eyes values; `Side` is Right for every Common and Left for every Uncommon Origin token; `Accessory` exists only on Uncommon. So `Side` is `Tier` written another way, and a collection-wide rarity rank mostly re-encodes the series.
6. **Every non-1:1 token has a unique trait combination** (1,959 distinct). Eleven groups of two or three tokens differ only in Side, Background and Aura.
7. **27 trait values are held by exactly one token**, mostly rare Eyes, Head, Body and Background values.
8. **Naming problems in the metadata itself**: three spelling variants of the same trait (`Boob Cap`/`BOOB Cap`, `JEET Cap`/`Jeet Cap`, `Stripe Shirt`/`Stripe shirts`), eleven more look-alike candidates, 143 tokens that say `Naked: No` but have no Body trait, and 357 tokens carrying at least one value a person should review before it is shown in a game (slurs, crude wording, third-party franchise names). Details in `ISSUES.md`.

## Rarity in one paragraph

Five calculated scores are in `data/chog-genesis/rarity.json` (observed counts stay in `trait-dictionary.json`; third-party ranks stay in `third-party/`). M5, information content with absent categories and the number of traits counted as traits, reproduces OpenSea's published rank for all 50 sampled tokens exactly (the plainer scores correlate 0.72 to 0.98). That also cross-validates the whole dataset, since each rank depends on all 1,969 records. The ranking mostly restates `Tier` and the series split: the top decile is every Legendary, Epic and Rare token plus 97 Uncommon. Method and caveats in `RARITY.md`.

## Integration recommendation in one paragraph

Use rarity for **prestige** (the five existing tiers, the ten named one-of-ones, a "holds a one-of-a-kind trait" mark) and for **cosmetics and sound** (aura, backdrop, headwear, accessory). Keep **play** differences to two sidegrade axes keyed to Eyes (vision profile) and Mouth (weapon rhythm), with a complete default for every missing trait, and prove strength-neutrality with the duel-parity test the repo already has, not with the trait list. The mapping is a PROPOSAL, needs `/brief` approval, and nothing may be built before the Core Feel Gate. Details in `IDENTITY-AND-MAPPING.md`.

## Limits

- No artwork was downloaded or looked at. Every statement about how a Chog looks comes from trait names only.
- The 1,969 files were not hash-verified; `baseURI`, `startingIndex`, `totalSupply` were not read from the chain; owners were not read at all.
- OpenSea rank is a 50-token sample. Trait counts shown on one OpenSea page (12 values) all matched this catalogue.
- This container's network policy blocked OpenSea, the Monad RPCs, explorers and IPFS gateways. All retrieval went through the Firecrawl connector the session was given (a third-party scraping service in the path; its output is not signed). Details in `SOURCES.md`.

## Next steps (smallest first)

1. On any machine with internet: `node tools/nft/read-chain.ts --all` (closes `startingIndex`, `baseURI`, `totalSupply`, and checks all 1,969 mappings) and `node tools/nft/verify-ipfs.ts` (hashes every block; compares every file). Both exit 0 only if everything holds and write their reports next to the data. Neither could be run here; their parsing code is covered by `tests/nft-car.test.ts`.
2. Owner asks ChogLabs for written terms on use of the art in a game. Until then no Chog art goes in the build.
3. Download and look at a sample of images (tiers, one-of-ones, near-duplicate traits) before any visual claim.
4. Owner decides whether the mapping proposal is wanted; if yes, `/brief` it, name the cut, then build only after the Core Feel Gate passes.
5. Decide the display-name layer for crude trait names.

## Files created

`data/chog-genesis/` (raw metadata, catalogue JSON and CSV, trait dictionary, rarity, analysis, issues, manifest, contract evidence, OpenSea sample, README), `docs/research/chog-genesis/` (this report and five companions), `tools/nft/` (`lib.ts`, `build-catalogue.ts`, `car.ts`, `chain.ts`, `verify-ipfs.ts`, `read-chain.ts`), `tests/nft-catalogue.test.ts`, `tests/nft-car.test.ts`.
