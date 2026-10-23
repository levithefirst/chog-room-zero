# Sources and verification report (task NFT-R1)

All retrieval happened on 2026-10-13. Labels follow `docs/RULES.md`: EVIDENCE names how it was checked; anything not checked says so.

## How data could be reached

This session runs in a container with an egress policy. Direct requests from the container to `opensea.io`, `api.opensea.io`, `rpc.monad.xyz` (and the four other public Monad RPCs), `monadvision.com`, `monadscan.com`, `api.etherscan.io`, `ipfs.io`, `dweb.link`, `w3s.link`, `gateway.pinata.cloud`, `nftstorage.link`, `trustless-gateway.link`, `ipfs2.seadn.io` and `chogathon.chog.xyz` were refused by the proxy (HTTP 403 on CONNECT). The proxy documentation says not to retry policy denials, so none was worked around from the shell.

All data was therefore read through the **Firecrawl connector** the session was given (`firecrawl_scrape`, `firecrawl_search`): a third-party service that fetches a public URL and returns text. Consequences that matter:

- A third-party service sat between the source and this repo. Its output is not signed.
- Only GET requests are possible. JSON-RPC (POST) cannot be made, so **nothing was read from the chain with `eth_call`**.
- Binary responses come back decoded as text, which is why the IPFS data is "parsed but not hash-verified".
- Cost: about 30 Firecrawl credits for this task. No money was spent and no paid plan was touched.

## Sources used

| Id | Source | What it supplied | Class | Used as |
|---|---|---|---|---|
| S1 | docs.monad.xyz network information and block explorer pages | chain id 143, public RPC list, explorers (MonadVision, Monadscan) | official network docs | EVIDENCE for chain id |
| S2 | Sourcify (`sourcify-api-monad.blockvision.org/v2/contract/143/<address>`) | verified source `ChogMint.sol`, ABI, compiler, deployment tx, block, deployer, `exact_match` for creation and runtime code, verified 2026-09-03T20:00:52Z | public verification service, bytecode-matched | primary source for contract logic. Stored in `data/chog-genesis/contract/` |
| S3 | IPFS folder `bafybeid4ybujnscdipkno7ps5utqelp5ry5ryreqhay3zhgk3a6x4jruqu`, read as a CAR from `ipfs2.seadn.io` (OpenSea's IPFS gateway), plus file `1246.json` from `gateway.pinata.cloud` | directory listing (`1.json` to `1969.json`, 1,969 entries) and all 1,969 metadata objects | the metadata itself (content addressed), through a scraper | primary source for traits. Stored in `data/chog-genesis/raw/ipfs-metadata.json`. Not hash-verified |
| S4 | mint.chog.xyz (official mint site) | "MONAD, 1,969 pieces", "Minted 1,969 / 1,969", mint phase counts, link to the OpenSea collection | project official | supply corroboration, link chain to the contract |
| S5 | opensea.io collection page `chog-genesis` | 1,969 items, item URLs containing the contract address and token ids, card titles (displayed numbers) and rarity ranks for 50 listings | third-party marketplace | cross-check only. 50 rows stored in `third-party/opensea-sample.json` |
| S6 | opensea.io item page, token 1754 | ERC721, Monad, 12 traits with OpenSea's counts, rarity rank 325, `tokenUri` pointing at the IPFS folder and `1246.json`, original image URL | third-party marketplace | cross-check; the only place `baseURI` was seen |
| S7 | OpenSea Help Center "What is OpenRarity?" | OpenSea's ranking follows OpenRarity with Double Sort and Trait Count updates, computed from creator-published trait data | third-party documentation | methodology note for the existing ranking |
| S8 | chog.xyz | project site, `$CHOG` fungible token address (a different contract) | project official | disambiguation only |
| S9 | web search results for terms and licences | general articles on NFT licensing; nothing specific to this collection | general | none; shows no collection terms were found |

Rejected or unusable: Monadscan's V1 API (deprecated; V2 needs a key this project does not have), MonadVision token page (renders with JavaScript; returned nothing), `ipfs.io` and `trustless-gateway.link` (a browser service-worker page and a Cloudflare 525), `?format=tar` (not supported by the gateway).

## Chain of custody for the metadata

1. OpenSea item page for token 1754 showed `tokenUri` = `https://ipfs2.seadn.io/ipfs/bafybeid4y.../1246.json`, which is OpenSea's gateway form of the folder CID plus the file named by the contract rule.
2. File `1246.json` was fetched from two independent gateways (`ipfs2.seadn.io`, `gateway.pinata.cloud`): identical.
3. The folder's root node was fetched alone (`?format=car&dag-scope=entity`): its entries are exactly `1.json` to `1969.json`, no gap, no extra, no duplicate.
4. The whole folder was fetched in one request (`?format=car&dag-scope=all`, 2.5 MB). All 1,969 JSON objects parsed. First parse found 1,959 and missed ten whose names carry a suffix; the pattern was fixed and the count became 1,969.
5. Structural validation (`validateRaw`) found no error: four fields per record, name number equals file number, image URI equals `ipfs://<image CID>/<n>.webp`, no unknown or repeated category, no stray spaces. The only non-ASCII character in the whole file is the em dash in the descriptions and in the ten special names (1,979 occurrences), so the text transport damaged nothing visible.

Not done: hashing the blocks against their CIDs, and linking each directory entry to its block. The text transport made the binary directory entries unreadable, so each object was assigned to its file number by the number in its own name (which also matches its image URI in all 1,969 cases). `tools/nft/verify-ipfs.ts` does both properly where there is network access.

## Verification matrix

| Claim | Checks that agree | Check that is missing |
|---|---|---|
| Chain 143, Monad | S1 | none needed |
| Contract address | brief; S2 (verified, named ChogMint); S5/S6 URLs; S4 links to S5 | an official page that prints the address |
| ERC-721 | S2 source imports OpenZeppelin `ERC721`; S6 "ERC721" | `supportsInterface` call |
| Supply 1,969 | S3 (1,969 files); S4; S5; metadata description | `totalSupply()` and `maxSupply()` calls |
| Token ids 1 to 1,969 | S2 mint logic; token 1969 seen in S5 | none |
| id to displayed number rule | S2 `metadataId()`; 50 of 50 OpenSea pairs (S5) | `startingIndex()` call |
| Traits per token | S3; 12 of 12 values for token 1754 match S6; 12 of 12 OpenSea trait counts match this catalogue | byte verification |
| Rarity | calculated here; M5 reproduces the S5 rank of 50 of 50 sampled tokens exactly | OpenSea's formula is not published in full; ranks for the other 1,919 tokens not read |
| Art rights | none found | written terms |

## Licences and terms

- Contract code is MIT (SPDX line in the verified source). That says nothing about the art.
- Metadata files were read from public IPFS. They are descriptive text; no image was copied into the repo.
- OpenSea and Etherscan-family terms were respected by reading a handful of public pages (two collection or item pages for OpenSea) and by keeping only 50 token ids, displayed numbers and ranks as a cross-check sample. No bulk crawl of a marketplace was made.
- Nothing secret was used or stored. No API key was needed or created.

## Reproduce

```
node tools/nft/build-catalogue.ts     # rebuilds every derived file from the raw files; refuses to write if validation fails
npx vitest run tests/nft-catalogue.test.ts tests/nft-car.test.ts
node tools/nft/verify-ipfs.ts         # needs internet; hash-verifies the folder and compares every file
node tools/nft/read-chain.ts --all    # needs internet; read-only eth_call against a public Monad RPC
```
