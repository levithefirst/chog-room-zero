# Class system: tiers, upgrades, signatures, caps

Status: the direction is LOCKED (owner, 2026-10-13 master build prompt: holders get combat power, rarity sets starting power, the ten 1:1s are the top tier with a signature ability, free players get an upgrade path, rating is separate from power). The numbers below are PROPOSALS chosen from measured duels; the owner's illustrative health figures (free 100, Common 500, 1:1 1,500) were explicitly "not a final balance specification" and were not used, because a 5x health gap makes a free player unable to win at all.

Code: `src/config/power.ts` (every number), `src/nft/tier-table.ts` (generated from the verified catalogue by `tools/nft/build-tiers.ts`), `src/sim/world.ts` (applies them). Tests: `tests/power.test.ts`.

NFT combat power for real holders is OFF in production (`NFT_COMBAT` unset) until the Core Feel Gate passes. Demo tokens show it, labelled, in solo and in demo-only online rooms.

## Tiers

Tier is the token's `Tier` trait from the verified catalogue, looked up by the metadata id the contract itself returns (`metadataId(tokenId)`). Never a hash, a rank score or anything the browser says.

| Tier | Tokens | Health | Armour | Damage | Ability |
|---|---|---|---|---|---|
| Free | everyone | x1.00 | +0 | x1.00 | hero ability |
| Common | 1,279 | x1.06 | +6 | x1.00 | hero ability |
| Uncommon | 590 | x1.10 | +8 | x1.00 | hero ability |
| Rare | 60 | x1.15 | +12 | x1.00 | hero ability |
| Epic | 30 | x1.20 | +15 | x1.00 | hero ability |
| 1:1 | 10 | x1.25 | +18 | x1.05 | signature (replaces the hero ability) |

Speed never changes with tier or upgrade: where you stand and when you peek stay the skill. Armour is added to both the starting armour and the armour cap.

## Upgrades (shards, earned only by playing)

| Upgrade | Per rank | Ranks | Costs |
|---|---|---|---|
| Vitality | +2% health | 3 | 40, 90, 160 |
| Plating | +2 armour | 3 | 40, 90, 160 |
| Focus | -5% ability cooldown | 4 | 30, 60, 110, 180 |

All upgrades cost 960 shards (about 64 wins or 190 losses at the rates in `src/config/progression.ts`). A maxed free profile has exactly Common starting health and armour (tested). Holders can buy upgrades too.

## Caps (an automatic CUT outside them, `docs/RULES.md` section 6)

| | Cap |
|---|---|
| Health multiplier | 1.35 |
| Armour bonus | +25 |
| Damage multiplier | 1.05 |
| Cooldown multiplier | 0.80 (no faster than 80%) |
| Speed | never changed |

`tests/power.test.ts` checks every tier at max upgrades against these caps, and that bad upgrade input is clamped.

## Measured duels (why these numbers)

Harness: `tests/helpers/duel.ts`. Two copies of the same hero in a 28 x 7 hall, both strafing on their own rhythm and firing at each other with perfect aim, 20 seeds x 2 slot orders per cell, at 3 / 6 / 9 m. Share = wins of the stronger side over decided duels. Measured 2026-10-14 on the committed values.

| Matchup | Kettle (rifle) | Mop (SMG) | Wick (marksman) | Brick (shotgun) |
|---|---|---|---|---|
| Common vs free | 0.67 / 0.56 / 0.57 | 0.61 / 0.57 / 0.55 | 0.97 / 0.75 / 0.75 | 0.63 / 0.76 / n/a |
| Uncommon vs free | 0.67 / 0.56 / 0.57 | 0.73 / 0.65 / 0.57 | 0.97 / 0.75 / 0.75 | 0.63 / 0.87 / n/a |
| Rare vs free | 0.81 / 0.69 / 0.67 | 0.73 / 0.68 / 0.75 | 0.97 / 0.75 / 0.75 | 0.85 / 0.97 / n/a |
| Epic vs free | 0.81 / 0.69 / 0.67 | 0.90 / 0.77 / 0.85 | 0.97 / 0.75 / 0.75 | 0.85 / 1.00 / n/a |
| 1:1 (no signature) vs free | 0.88 / 0.84 / 0.87 | 0.95 / 0.85 / 0.87 | 0.97 / 0.75 / 0.75 | 1.00 / 1.00 / n/a |
| Maxed free vs Common | 0.50 / 0.50 / 0.50 | 0.50 / 0.50 / 0.50 | 0.50 / 0.50 / 0.50 | 0.50 / 0.50 / n/a |

(Brick at 9 m: the shotgun does not reach, every duel is a draw.)

Reading it honestly:
- These are the upper bound of the advantage. Mirror duels with perfect aim turn any extra hit point into a win; real play has misses, cover and positioning, which narrow every edge. A person must confirm the felt gap (playtest question below).
- The marksman is quantised: one shot more to kill flips almost every duel, so any tier above free wins 0.75 to 0.97 with Wick. This is the main balance risk and the first thing to tune after a playtest (option: give the marksman a damage value that does not sit on a kill threshold).
- A Common holder wins about 6 in 10 with the rifle and the SMG: noticeable, beatable.
- The ladder is monotonic (tested), and a maxed free player meets a Common holder exactly even (tested).

## The ten signatures (1:1 only, single ability slot)

Each one has a telegraph drawn for both sides and its own sound. Ability names are original; the tokens' titles are not shown in the game until name rights are confirmed.

| Chog | Signature | What it does | Telegraph | Duel share vs a 1:1 with Patch (3 / 6 / 9 m) |
|---|---|---|---|---|
| #53 | Flashfire | 0.45 s wind-up, then 28 to every hostile within 3 m in sight | ring of the true radius filling in, rising hiss | 0.50 / 0.50 / 0.50 |
| #392 | Hellfire | 0.8 s wind-up, then 30 straight to health within 3.5 m in sight | same ring, longer | 0.50 / 0.50 / 0.50 |
| #434 | Howl | hostiles within 6 m in sight move at 60% for 2.5 s | broken blue ring on the slowed, loud wail | 0.90 / 0.50 / 0.50 |
| #494 | Bulwark | a 3 m slab for 14 s | the slab itself | 1.00 / 0.50 / 0.50 |
| #973 | Leap | a 0.3 s dash (about 4 m) | dash sound | 0.45 / 0.50 / 0.50 |
| #1006 | Deadsight | shows hostiles within 18 m for 3.5 s | ping ring; they hear it | 0.50 / 0.50 / 0.50 |
| #1159 | Halo | +30 health to you and allies within 4 m | mend sound | 0.50 / 0.50 / 0.50 |
| #1290 | Crown Guard | +35 armour, +15 health | mend sound | 0.79 / 0.50 / 0.50 |
| #1373 | Gold Shell | untouchable for 1.2 s, cannot shoot | gold ring, bell | 0.65 / 0.50 / 0.50 |
| #1376 | Red Rush | +25% damage for 4 s | red outline, growl | 0.68 / 0.50 / 0.50 |

The harness fires abilities only inside 5 m, so 6 and 9 m measure the base 1:1 mirror. Howl and Bulwark at 3 m are scripted-harness extremes (the scripted players cannot step around a slab or out of a slow); `tests/power.test.ts` keeps the 3-and-6 m mean of every signature between 0.30 and 0.85. A person must judge them.

## Rating is separate from power

`src/config/progression.ts`: Elo, K 24, with a power offset per tier (free 0 to 1:1 +120) added to a side's rating when computing the expected score. A 1:1 beating a free player gains less than a free player beating a 1:1 (tested).

## Playtest questions for the owner (Core Feel Gate, before `NFT_COMBAT=1`)

1. Common vs free, both Kettle, five duels each way: does the free side feel it can win?
2. Any tier with Wick vs free Wick: is the extra shot to kill obvious and fair?
3. Flashfire and Howl from the receiving side: did the ring give you time to step out?
4. Gold Shell: did you understand why your shots did nothing?
