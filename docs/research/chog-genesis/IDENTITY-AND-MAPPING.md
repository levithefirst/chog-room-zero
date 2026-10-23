# Identity research and sidegrade mapping proposal (task NFT-R1)

Everything in sections 4 to 8 is a **PROPOSAL** (docs/RULES.md section 2). It does not touch the game, the RC-1 DEMO (`src/nft/`) or any LOCKED rule, and it cannot be built before the Core Feel Gate passes (`docs/GATES.md`) and a `/brief` returns KEEP or MODIFY. No artwork was viewed: every statement about how a Chog looks comes from trait names, so nothing here assigns a gameplay effect because of how art looks.

## 1. How a token becomes one Chog

| Thing | What it is | Use |
|---|---|---|
| `tokenId` (1 to 1,969) | the ERC-721 id. `ownerOf` and `tokensOfOwner` speak this | key for ownership and for persistent history |
| `metadataId` (1 to 1,969) | the number in `N.json`, `N.webp` and the name "CHOG #N" | what a player calls their Chog; key into traits and art |
| conversion | `metadataId = ((tokenId - 1 + startingIndex) % 1969) + 1`, `startingIndex` 1461 (derived) | read `startingIndex` once from the chain, then bake the table |
| name | "CHOG #N", or "CHOG #N" plus a title for ten tokens | callsign. The ten: Blaze, Burning Skully, Chog Scream, Chogbomination, Frogger, Grim, Halo, Krown, Midas, Redd |
| traits | up to 13 categories, absent ones omitted | cosmetics and the sidegrade key |
| image | `ipfs://<image CID>/<metadataId>.webp`, static | not used until the art rights are known |

A Chog is fully identified by its metadata id. Its trait list is unique for 1,959 tokens; the ten 1:1 tokens share one identical list and are told apart by name and art only.

## 2. Structure in the data that shapes any mapping

Measured, reproducible with `node tools/nft/build-catalogue.ts` (see `data/chog-genesis/analysis.json`):

1. **Two series.** Origin-base tokens split into Right/Common (1,279, no Accessory) and Left/Uncommon (590, may have an Accessory). They share no Aura value, 2 of 84 Body values, 2 of 44 Head values, 4 of 39 Eyes values. Within Origin tokens `Side` is `Tier` written another way.
2. **Every category except Naked is tied to Tier.** Cramer's V against Tier among Origin tokens (observed vs the 95th percentile of 200 shuffles): Body 0.93 vs 0.24, Head 0.90 vs 0.18, Eyes 0.89 vs 0.17, Aura 0.69 vs 0.12, Mouth 0.67 vs 0.12, Background 0.60 vs 0.13, Skin 0.58 vs 0.07, Accessory 0.50 vs 0.10, Side 1.00 vs 0.04. Only Naked (0.02 vs 0.05) is independent. Consequence: you cannot pick a category whose families are spread evenly across tiers, so strength-neutrality has to be proved by duel tests, not assumed from the distribution.
3. **Higher tiers are made of fixed recipes.** Skull base: Form Skull, Tier Rare, no Mouth, no Accessory (60). Radioactive base: Background Radioactive, Side Left, Tier Epic, no Mouth, no Accessory (30). 1:1: only Base and Tier (10).
4. **Missing traits are common.** Mouth missing on 165 tokens (all Skull, Radioactive and 1:1, plus 65 Common), Eyes on the ten 1:1 only, Body on 207 (54 naked, 10 1:1, 143 unexplained "not naked but no Body").
5. **Naming noise.** Three exact spelling variants and eleven look-alike candidates (`ISSUES.md`). A table keyed to value strings must list variants explicitly.

## 3. Identity hooks the data offers (candidates, art unseen)

| Hook | Data | Tokens | Idea (cosmetic or prestige only) |
|---|---|---|---|
| Named one-of-one | Base 1:1, special name | 10 | callsign title; own portrait frame |
| Skull form | Base Skull, Form Skull | 60 | distinct silhouette or hit-flash tint |
| Radioactive | Base Radioactive, Background Radioactive | 30 | its own aura colour |
| One-of-a-kind trait | 27 values held by 1 token | 24 | a mark on the player card ("unique trait: Noble Blue") |
| Aura | 22 values, present on 49.5% | 974 | muzzle or footstep glow colour |
| Background and Skin | 32 and 14 colour names | 1,959 | portrait backdrop and operator tint (a tint of the original operator, not the Chog art) |
| Accessory | 9 values, Uncommon only | 195 | weapon charm |
| Headwear | 66 values | 1,716 | small overlay in the player card |
| Mouth | 15 values | 1,804 | pick of callout or ping sound set |
| Eyes (laser, visor) | 7 values, 434 tokens | 434 | hit-marker or vision-cone tint |

Animations: the art is static `.webp`; nothing in the data supports animation. Using the actual Chog art is blocked by UNKNOWN art rights; tinting the project's original operators with trait colours is not.

## 4. Layers (PROPOSAL)

| Layer | Source | Changes | Power? |
|---|---|---|---|
| L0 Identity | metadata id, name | "Chog #1246" on card, HUD, results; history keyed to `tokenId` | none |
| L1 Prestige | existing `Tier` (5 values), named 1:1, unique-trait mark | title, frame, results line | none. No new tiers or scores invented: the five tiers are in the data, and M5 matches OpenSea if a number is ever shown |
| L2 Cosmetic and sound | Aura, Background, Skin, Accessory, Headwear, Mouth | tints, overlays, sound set | none |
| L3 Sidegrade | Eyes and Mouth families (section 5) | shape of play, within the existing power budget | **the only gameplay layer**, and per `docs/design/nft.md` the only part that can pass the removal test |

Rarity feeds L1 and L2 only. Nothing in L3 is chosen by Tier or by any rarity score.

## 5. Sidegrade keys (PROPOSAL, illustrative)

Rule from `nft.md`: at most three areas (weapon behaviour, vision profile, one ability), change the shape of play not the size of numbers, same power budget for every operator including the default, "rarity may make an operator stranger, never better".

Starter partition, defined in `tools/nft/lib.ts` as `STARTER_PARTITION` so it can be measured. Value lists were written by reading the dictionary; the names are a thematic hint only. Unlisted values and absent traits get the default (`standard`) kit.

| Axis | Key | Family | Values | Tokens | Share |
|---|---|---|---|---|---|
| vision profile | Eyes | lens | Purple laser, fire laser, Green laser, cyan laser, Gradient visor, Sunset visor, Plasma visor | 434 | 22.04% |
| | | frames | Anime Glass, Retro Glass, 3D Glass, BTC Glass, Modern VR, Classic VR | 212 | 10.77% |
| | | standard | everything else, including absent | 1,323 | 67.19% |
| weapon rhythm | Mouth | steady | normal smile, Smile, Flat, Grit | 475 | 24.12% |
| | | burst | Rainbow Puke, Bubblegum, Drooling, Clown Mouth | 554 | 28.14% |
| | | standard | everything else, including absent | 940 | 47.74% |

Shape of each (reusing the shapes the RC-1 DEMO already tests): lens is the narrow, long view; frames is the wide, short view; steady is the tight-spread, small-magazine, quick-reload rhythm; burst is the large-magazine, faster-fire, loose-spread, slow-reload rhythm (DEMO names Steady and Spray). Both keep health, armour, damage and speed unchanged. Which numbers they use stays with the existing `tests/rc-nft-demo.test.ts` budget.

**What the measured shares say.**
- Every family is held by at least 10% of tokens, so none is a niche.
- Family mix differs by tier because of the series split: steady is 37.8% of Uncommon tokens but 19.7% of Common; lens is 27.4% of Common but 11.5% of Uncommon.
- Every Rare, Epic and Legendary token gets the standard rhythm (none has a Mouth), and every Epic and Legendary token gets the standard view. So rarity correlates with receiving the default kit, which is acceptable only because the default is a complete, winning design (a rule `nft.md` already states). It does mean rare holders get less playstyle variety, which L1 and L2 should compensate.
- 9 combinations of view and rhythm exist. Each sidegrade is budget-neutral alone, but the 9 combinations are untested. If parity fails for any, give each token one axis only.

**Third area (an ability twist) is not proposed.** It needs the hero ability list and a design pass; the data cannot decide it. Marked deferred.

## 6. Where the data lives at play time (PROPOSAL)

Because the metadata is permanent after reveal, the game never has to fetch IPFS or call a metadata endpoint. Generate once from the verified catalogue a compact table, `tokenId -> {viewFamily, rhythmFamily, tier, special?}` (about 2 bytes per token), shipped with the game. Ownership is the only live read (`ownerOf` or `tokensOfOwner`, server side, per `nft.md`). Failure paths then reduce to the ones `nft.md` already lists (no wallet, wrong network, rejected signature, RPC down, not owned) and all leave the game playable as guest. Trait strings are never shown raw (section 8).

## 7. Checks required before any build

1. `startingIndex` read from the chain and equal to 1461; `baseURI` read; every file hash-verified (`read-chain.ts --all`, `verify-ipfs.ts`).
2. Duel parity for every family against `standard` and, for the 9 combinations, against each other, inside the 25% to 75% band `tests/rc-nft-demo.test.ts` already uses; health, armour, damage and speed identical (`tests/operators.test.ts`).
3. A catalogue-driven test: a token's family is a pure function of its keyed trait value, never of Tier or rank.
4. Art rights answered in writing before any Chog image is used.
5. Removal test written for each mechanic (section 9) and G10 run on the finished code.

## 8. Display policy (PROPOSAL)

357 tokens carry at least one value flagged for review: 57 with a slur in Eyes or Head, 221 with crude wording in Body or Head, 68 naming a third-party franchise or character, 29 referring to a religious figure (`ISSUES.md` lists the values). The game should show **curated display names** looked up by internal id, never the raw string, and use a neutral fallback ("Headwear", "Visor") where no curated name exists. This is independent of art rights and protects the demo video and the submission.

## 9. Removal test (docs/design/nft.md)

| Mechanic | Play difference | What persists only because the token is bound | Result |
|---|---|---|---|
| Vision and rhythm sidegrade keyed to the Chog's traits | where the player stands, how they peek, when they reload; predictable from the Chog they own | token-keyed history, results, medals tied to `tokenId` | STRONG if persistence is built; today only a DEMO |
| Tier title, frame, named 1:1 callsign, unique-trait mark | none | shown to other players, kept with the token | WEAK alone (badge and title); keep as support for the row above, per `nft.md` |
| Aura, backdrop, sound set, charm | none | none by itself | WEAK; cosmetic support only |

Honest summary for the submission: today the integration is a DEMO (no wallet, no ownership check, traits from a hash). This research makes it possible to key the DEMO's four sidegrade shapes to real traits and to verify ownership, which is what the judges' removal test asks for. It does not make the integration real by itself.

## 10. Decisions for the owner

1. Is the two-axis, trait-keyed sidegrade wanted at all (needs `/brief` and a named equal or larger cut)?
2. Written art terms from ChogLabs: ask now, because section 3 and the portraits depend on it.
3. Display-name layer: accept section 8.
4. Show players the metadata id ("Chog #1246") and key history by `tokenId`: confirm.
5. Run the two network tools on a machine with internet and commit their reports (`SOURCES.md`).
