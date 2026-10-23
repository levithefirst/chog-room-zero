# Collection-wide rarity analysis (task NFT-R1)

Three kinds of numbers appear in this package and are never mixed in one file:

| Kind | Where | Meaning |
|---|---|---|
| **Observed** | `data/chog-genesis/raw/`, `trait-dictionary.json`, `TRAIT-DICTIONARY.md` | counts read straight from the 1,969 metadata files |
| **Calculated** | `data/chog-genesis/rarity.json`, `analysis.json` | scores and structure computed here by `tools/nft/lib.ts` |
| **Third party** | `data/chog-genesis/third-party/opensea-sample.json` | OpenSea's own rank for 50 tokens, with its stated method |

Every percentage below is a share of 1,969 tokens unless it says otherwise.

## 1. Observed frequencies

The full table (every value, count, percent) is `TRAIT-DICTIONARY.md`. Summary:

| Category | Values | Tokens with it | Without | Commonest value | Rarest values |
|---|---|---|---|---|---|
| Background | 32 | 1,959 | 10 | Light Purple 183 (9.29%) | five values held by 1 token each |
| Aura | 22 | 974 | 995 | Burning Aura 82 (4.16%) | White Aura 1 |
| Base | 4 | 1,969 | 0 | Origin 1,869 (94.92%) | 1:1 10 |
| Skin | 14 | 1,959 | 10 | Pink 557 (28.29%) | Grey 3 |
| Side | 2 | 1,959 | 10 | Right 1,309 (66.48%) | Left 650 (33.01%) |
| Body | 96 | 1,762 | 207 | Tuxedo 55 (2.79%) | five values held by 1 token each |
| Mouth | 15 | 1,804 | 165 | normal smile 195 (9.90%) | Grit 47 (2.39%) |
| Eyes | 58 | 1,959 | 10 | Happy 121 (6.15%) | eight values held by 1 token each |
| Head | 66 | 1,716 | 253 | Mon Cap 70 (3.56%) | eight values held by 1 token each |
| Accessory | 9 | 195 | 1,774 | Fwog 28 (1.42%) | PEPE 13 (0.66%) |
| Form | 2 | 1,959 | 10 | Chog 1,899 (96.44%) | Skull 60 (3.05%) |
| Tier | 5 | 1,969 | 0 | Common 1,279 (64.96%) | Legendary 10 (0.51%) |
| Naked | 2 | 1,959 | 10 | No 1,905 (96.75%) | Yes 54 (2.74%) |

327 distinct values in total; 27 are held by exactly one token. "Without" means the metadata omits the category. The ten tokens that lack Background, Skin, Side, Eyes, Form and Naked are the 1:1 tokens.

## 2. Methods (calculated)

All five use the shares in section 1. An absent category is counted as its own value, "none", in M1, M5 (the OpenRarity convention); M2 to M4 ignore absent categories.

| Id | Score | Rank 1 is |
|---|---|---|
| M1 | sum over the 13 categories of `-log2(share of tokens with this token's value, or without the category)` | highest sum |
| M2 | same sum over the traits the token has | highest sum |
| M3 | sum over present traits of `1 / share` (the classic "rarity score") | highest sum |
| M4 | share held by the token's single rarest trait | smallest share |
| **M5** | **M1 plus `-log2(share of tokens with the same number of traits)`**: the number of traits is treated as one more trait | highest sum |

Ties share the best rank (1 plus the number of strictly rarer tokens). Information content in bits is used because it sums independent surprises on one scale; the ranking is the same if the sum is divided by the collection entropy.

## 3. Comparison with the existing OpenSea ranking (third party)

OpenSea's Help Center says its ranking follows the OpenRarity standard with "Double Sort and Trait Count updates", computed from the creator-published trait data (https://support.opensea.io/en/articles/8867099-what-is-openrarity). The exact formula is not given there. OpenSea ranks for 50 tokens were read from its listing page (rank 1 is rarest).

| Method | Spearman vs OpenSea (n = 50) | Ranks matched exactly | Largest rank difference |
|---|---|---|---|
| M1 | 0.976 | 3 | 565 |
| M2 | 0.914 | 0 | 709 |
| M3 | 0.888 | 0 | 740 |
| M4 | 0.722 | 0 | 813 |
| **M5** | **1.000** | **50** | **0** |

M5 reproduces the OpenSea rank of every sampled token exactly, across ranks 133 to 1,942. A rank depends on every other token's score, so an exact match on 50 spread-out tokens is also strong evidence that the whole catalogue agrees with what OpenSea indexes. It is evidence about the 50 sampled tokens, not proof that OpenSea's formula is M5 everywhere; the Double Sort rule concerns tokens with a unique trait value and none of the 50 may exercise it.

The plain M1 differs from OpenSea in a pattern that explains the trait-count rule: M1 ranks 11-trait tokens up to 118 places rarer than OpenSea does and 9 and 10-trait tokens up to 565 places more common.

## 4. What the ranking shows (M5)

- **Top of the table.** Rank 1 is shared by the ten 1:1 tokens (79.5 bits). Ranks 11 to 19 are Skull tokens; the first Radioactive token is rank 20. Beyond the 1:1s, no Origin token ranks above 98.
- **Bits.** Minimum 27.8, median 34.2, maximum 79.5. The commonest token (metadata #118) is rank 1,969.
- **Tier separation.** Median rank: Legendary 1, Epic 49, Rare 63, Uncommon 395, Common 1,324. No Common token ranks above the median Uncommon token. 319 of the 590 Uncommon tokens rank above the rarest Common token (rank 420).
- **Top 10 % (197 tokens)** is 10 Legendary, 30 Epic, 60 Rare and 97 Uncommon. In other words the statistical top decile is almost exactly "everything that is not Common, plus the rarest Uncommon". The ranking mostly restates the project's `Tier` and the series split (`IDENTITY-AND-MAPPING.md`, section 2). Inside a tier it still orders tokens usefully.
- **One-of-a-kind traits.** 24 tokens hold a trait value no other token has (27 such values). 49 tokens hold a trait shared with at most one other, 197 with at most nine others.

## 5. Complete trait combinations

| Question | Result |
|---|---|
| Tokens with an exact duplicate of another token's full trait set | 10, all of them the 1:1 tokens (identical lists: Base 1:1, Tier Legendary) |
| Distinct full combinations | 1,960 (1,959 unique non-1:1 combinations plus the one shared 1:1 list) |
| Distinct combinations ignoring Side | 1,960 (Side adds no distinction beyond Tier and Background) |
| Distinct combinations ignoring Background | 1,957 (three groups, 15 tokens) |
| Distinct combinations ignoring Side, Background and Aura | 1,946 (twelve groups, 35 tokens; eleven groups of two or three non-1:1 tokens) |

The eleven near-twin groups (metadata ids) are 829/1617, 713/1630, 333/1908, 88/594, 411/1218, 414/1389, 465/882, 481/537, and the triples 197/747/1910, 117/627/1041, 584/724/861. These share Body, Mouth, Eyes, Head, Skin and the rest and differ only in Side, Background or Aura. Candidates for sibling cosmetics, or for "do not treat as unrelated" in a mapping.

## 6. Structure that limits what rarity means here

1. **Tier is a project label** and is not recoverable from the visible traits alone: `Rare`, `Epic`, `Legendary` equal the `Skull`, `Radioactive`, `1:1` bases; `Common` is Side Right with no Accessory; `Uncommon` is Side Left and may carry an Accessory. Common and Uncommon tokens draw from nearly separate trait pools (shared values: Aura 0, Body 2 of 84, Head 2 of 44, Eyes 4 of 39). Frequencies therefore partly measure series size: the Common series has 1,279 tokens and the Uncommon 590, so an Uncommon-only value cannot reach the count of a Common-only value.
2. **Origin backgrounds fall into three families**: six backgrounds only on Right/Common tokens without accessories (512 tokens), four only on Left/Uncommon tokens (183), nine on both (1,174).
3. **Absence is information, not noise.** Whether a token has an Aura (49.5% do) or an Accessory (9.9%) changes its score.
4. **Spelling variants split counts.** Merging `BOOB Cap` into `Boob Cap` would move 3 tokens from a count of 3 to 49. Counts here use the exact strings published; merging is a decision for the owner and ChogLabs.
5. **The ten 1:1 tokens tie** because their metadata is identical. Only the name and the image tell them apart.
6. **Ranks cannot change through the metadata once the contract is revealed.** In the verified source `reveal()` runs once and `setBaseURI()` reverts with `MetadataFrozen` after it, and the folder is content addressed, so the traits behind these scores are permanent. That the contract is revealed is inferred (real names and traits are live) and not yet read from `revealed()`. OpenSea's own rank can still change if OpenSea changes its method.

## 7. Existing rarity information, by source

| Source | What it says | Method | Status |
|---|---|---|---|
| Project metadata | `Tier`: Common, Uncommon, Rare, Epic, Legendary | assigned by the project; counts in section 1 | observed |
| OpenSea | rarity rank per token | OpenRarity with Double Sort and Trait Count | 50 ranks read, stored with source and date; M5 reproduces them |
| Other rarity sites | not fetched | | not acquired |

## 8. Use in Room Zero (summary; the proposal is in `IDENTITY-AND-MAPPING.md`)

Rarity should drive prestige only. Prefer the five existing tiers plus two marks that are facts about the data (a named 1:1; holds a one-of-a-kind trait) over a new score or new tier names. If a numeric rank is ever shown, M5 is the one that agrees with what players already see on OpenSea.
