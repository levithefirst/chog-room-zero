# Class system: tiers, upgrades, signatures, caps

Status: the direction is LOCKED (owner 2026-10-13 master build prompt; owner 2026-10-14 master integration pass: "NFT holders start with power, free players start lower and catch up. This is not cosmetic", the ten 1:1s are "legendary, God-tier and intentionally dominant", a fully progressed free player must be competitive with the lower NFT tiers). The numbers below are PROPOSALS chosen from measured duels; a person must judge them (playtest questions at the end).

Code: `src/config/power.ts` (every number), `src/nft/tier-table.ts` (generated from the verified catalogue), `src/sim/world.ts` (applies them). Tests: `tests/power.test.ts`.

NFT combat power is ON for verified holders (`NFT_COMBAT` unset or anything but `0`; `NFT_COMBAT=0` turns it off). Demo tokens show it, labelled, in practice and in demo-only online rooms.

## Tiers

Tier is the token's `Tier` trait from the verified catalogue, looked up by the metadata id the contract itself returns (`metadataId(tokenId)`). Never a hash or anything the browser says.

| Tier | Tokens | Health | Armour | Damage | Grenades | Ability |
|---|---|---|---|---|---|---|
| Free | everyone | x1.00 | +0 | x1.00 | 3 | character ability |
| Common | 1,279 | x1.15 | +8 | x1.00 | 5 | character ability |
| Uncommon | 590 | x1.22 | +12 | x1.02 | 7 | character ability |
| Rare | 60 | x1.32 | +18 | x1.04 | 9 | character ability |
| Epic | 30 | x1.42 | +24 | x1.06 | 11 | character ability |
| 1:1 | 10 | x1.75 | +35 | x1.12 | 13 | its own signature (replaces the character ability) |

Speed never changes with tier or upgrade. Armour is added to both the starting armour and the armour cap. Grenade capacity (owner 2026-10-14, `docs/design/roster-grenades.md`) is a tier advantage only: upgrades never raise it, and online the server sets it from the verified ticket.

## Upgrades (shards, earned only in saved online matches; never sold)

| Upgrade | Per rank | Ranks | Costs |
|---|---|---|---|
| Vitality | +3% health | 8 | 10, 40, 70, 100, 140, 180, 230, 290 |
| Plating | +2 armour | 8 | 10, 40, 70, 100, 140, 180, 230, 290 |
| Firepower | +1% damage | 3 | 150, 250, 350 |
| Focus | -5% ability cooldown | 4 | 30, 60, 110, 180 |

Everything costs 3,250 shards: about 160 wins or 325 losses (10 shards a saved match, 10 more for a win). The first rank costs 10, so one saved match always buys something. A maxed free profile has x1.24 health, +16 armour, x1.03 damage: past Uncommon starting power, below Rare (tested). Holders can buy upgrades too; "my NFT decides my starting class, my account decides how far I developed it".

## Caps (an automatic CUT outside them, `docs/RULES.md` section 6)

| | Cap |
|---|---|
| Health multiplier | 2.00 |
| Armour bonus | +52 |
| Damage multiplier | 1.15 |
| Cooldown multiplier | 0.80 |
| Speed | never changed |

## Measured duels (why these numbers)

Harness `tests/helpers/duel.ts`: two copies of the same hero in a 28 x 7 hall, strafing and firing with perfect aim, 12 seeds x 2 slot orders, at 3 / 6 m. Share = wins of the first side over decided duels. Measured 2026-10-14 on the committed values.

| Matchup | Kettle | Mop | Wick | Brick |
|---|---|---|---|---|
| Common vs free | 0.79 / 0.67 | 0.81 / 0.63 | 0.95 / 0.79 | 0.92 / 0.92 |
| Uncommon vs free | 0.79 / 0.67 | 0.92 / 0.78 | 0.95 / 0.79 | 1.00 / 1.00 |
| Rare vs free | 0.88 / 0.79 | 0.96 / 0.88 | 0.95 / 0.79 | 1.00 / 1.00 |
| Epic vs free | 0.88 / 0.91 | 1.00 / 1.00 | 0.95 / 0.79 | 1.00 / 1.00 |
| 1:1 (no signature) vs free | 0.96 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 | 1.00 / 1.00 |
| Maxed free vs Common | 0.82 / 0.74 | 0.63 / 0.67 | 0.50 / 0.50 | 0.96 / 0.92 |
| Maxed free vs Uncommon | 0.50 / 0.50 | 0.50 / 0.50 | 0.50 / 0.50 | 0.80 / 0.75 |
| Maxed free vs Rare | 0.35 / 0.41 | 0.42 / 0.33 | 0.50 / 0.50 | 0.20 / 0.16 |
| Maxed free vs 1:1 | 0.14 / 0.08 | 0.00 / 0.00 | 0.05 / 0.30 | 0.00 / 0.00 |

Reading it honestly:
- These are upper bounds: perfect-aim mirror duels turn any extra hit point into a win. Misses, cover, positioning, team fights and revives narrow every edge.
- A fresh free player still wins about 3 in 10 against a Common holder with the rifle; a maxed free player beats Common and is even with Uncommon (tested bands in `tests/power.test.ts`).
- The 1:1 dominates a single opponent by design. It is beaten by numbers (3v3, 5v5), cover, its signature's counter and focus fire.
- The marksman (Wick) is quantised: one more shot to kill flips most duels. First thing to tune after a playtest.

## The ten 1:1s (single ability slot, real names since 2026-10-14)

Each has its own colour (rings, telegraphs, a slow identity ring around the body seen by both sides) and its own voice layered over the ability cue (`src/audio/audio.ts`), carried to every client by the sound event's token id.

| Chog | Name | Signature | Effect | Telegraph | Counter |
|---|---|---|---|---|---|
| #53 | Blaze | Flashfire (12 s) | 0.45 s wind-up, then 35 to every hostile within 3.2 m in sight | orange ring of the true radius filling, crackle | step out or break sight before it fills |
| #392 | Burning Skully | Hellfire (16 s) | 0.8 s wind-up, then 40 straight to health within 3.5 m in sight | red ring, deep roar | longest wind-up: back off |
| #434 | Chog Scream | Howl (15 s) | hostiles within 6.5 m in sight at 55% speed for 3 s | ice-blue shock ring, shriek | fight from beyond 6.5 m or behind cover |
| #494 | Chogbomination | Bulwark (16 s) | 3 m slab for 14 s | the slab, double slam | walk around it |
| #973 | Frogger | Leap (6 s) | 0.3 s leap, about 4 m | green ring, croak | it cannot shoot mid-leap; aim where it lands |
| #1006 | Grim | Deadsight (14 s) | shows hostiles within 18 m for 4 s; they hear it at 18 m | violet 18 m ring, toll | move when you hear the toll |
| #1159 | Halo | Halo (18 s) | +40 health to her and allies within 4.5 m | white-gold ring of the true radius, choir chord | spread out, burst one target |
| #1290 | Krown | Crown Guard (16 s) | +40 armour, +20 health | purple crown ring, plate clank | armour-piercing weapons |
| #1373 | Midas | Gold Shell (18 s) | untouchable 1.5 s, cannot shoot | gold shell, coin shimmer | stop firing and reload |
| #1376 | Redd | Red Rush (16 s) | +30% damage for 4.5 s | red outline, growl | break line of sight for 4.5 s |

Measured against a 1:1 with the plain hero ability (mean of 3 and 6 m, perfect-aim harness that fires abilities inside 5 m): every signature between 0.30 and 0.85 (tested). Howl 0.73 and Bulwark 0.75 are the strongest because the scripted players cannot step out of a slow or around a slab.

## Rating is separate from power

`src/config/progression.ts`: Elo, K 24, with a power offset per tier (free 0 to 1:1 +120). The leaderboard ranks by kills, never by tier.

## Playtest questions for the owner (Core Feel Gate)

1. Common vs free, both Kettle, five duels each way: does the free side feel it can win sometimes?
2. A maxed free player vs an Uncommon holder: does it feel even?
3. A 1:1 in 3v3: does it feel dominant but beatable by a coordinated team?
4. Each signature from the receiving side: did the telegraph give you time to react, and was the counter clear?
5. Downed and revive (3v3): is 3 s to revive and 15 s to bleed out right?
