# NFT identity

Status: the rules below marked LOCKED come from the owner. Chain, contract, metadata and ownership method are EVIDENCE from NFT-R1 (`docs/research/chog-genesis/`) and are re-checked live by the server before any benefit applies. Art and name rights are UNKNOWN: placeholders only.

The owner's master build prompt (2026-10-13) replaced "sidegrades only" with a class system. Owner 2026-10-14 (master integration pass): NFT combat power is on for verified holders (`NFT_COMBAT=0` turns it off); the Core Feel Gate playtest tunes the numbers. The ten 1:1s are shown by their real names (Blaze, Burning Skully, Chog Scream, Chogbomination, Frogger, Grim, Halo, Krown, Midas, Redd).

## LOCKED rules (owner, 2026-10-13 master build prompt)
- Anyone can play solo, 1v1 and 3v3 with no NFT, no wallet and no $CHOG.
- 5v5 is for verified Chog holders only, enforced on the game server, never by the browser.
- Owner 2026-10-18: a verified Chog's real traits give it one superpower (Laser Eyes, Visor, Bubble, Drool Web, Aura; X-Ray Eyes has no trait yet and lives in DEMO and Training) in the single ability slot, ranked by its rarity, with no health, armour or damage from rarity (`docs/design/superpowers.md`). The ten 1:1 Chogs keep their distinct signature abilities. No second simultaneous ability. Removal test: without the Chog the player has the operator's ability, not the power. A verified Chog with no power trait starts at 200 health instead of 150 (owner 2026-10-18, IDENTITY pass).
- Free players have an upgrade path (shards earned in validated matches). No combat power is ever sold. Competitive rating is separate from character power.
- Account progression (XP, level, shards, upgrades, rating) belongs to the account. Token history belongs to the token. A transfer never moves account XP or currency.
- Ownership is verified on the server (wallet signature, then a chain read). Every failure fails closed to free-player rules and leaves the game playable.
- A clearly labelled demo mode exists for development and judging. It never earns rewards, never counts as verified, and plays in its own queues.
- Guest runs (not signed in) are disposable. Removal test (below) must pass for every NFT-linked mechanic.

## Removal test (two parts, both must pass)
Question: if NFT ownership were removed, would the experience AND what persists stay almost the same? If yes, the mechanic fails. Redesign or cut it.

```
MECHANIC    <name>
PLAY DIFF   what the player decides or experiences differently with the token
            (not a bigger number: where they stand, how they peek, what they listen for)
PERSISTENCE what is saved only because the token is bound, and who can see it
RESULT      STRONG / WEAK -> KEEP / REDESIGN / CUT
```

Weak means the difference is only a skin, portrait, badge, access, title, color, or a flat stat boost.

## Class system (LOCKED direction; numbers in `src/config/power.ts`)
- Tier comes from the token's on-chain metadata (`Tier` trait via `metadataId`), never from a hash, a rank score or the browser.
- A tier changes health, armour and, for the 1:1s only, damage and the ability. Movement speed never changes with tier: positioning stays the skill.
- A tier also sets grenade capacity (owner 2026-10-14): free 3, Common 5, Uncommon 7, Rare 9, Epic 11, Legendary and 1:1 13. Upgrades never raise it; the game server sets it from the verified ticket. The character (free roster: Benja, Toad, Ray, Tabsu, Tonashiro, Yot, Bill) is the player's pick and is not NFT related.
- Caps, the measured duel shares and the reasons for each number are in `docs/design/power.md`. Any value outside those caps is an automatic CUT.
- A free player at full upgrades must keep a real chance against a Common holder (measured band in `power.md`).
- The four RC-1 sidegrades (Lamp, Wide, Steady, Spray) stay as shape-only options on top of the class (`tests/operators.test.ts`).

## Where traits come from
- Tier and the 1:1 name: Option A, the verified catalogue (`data/chog-genesis/`), keyed by `metadataId`.
- Sidegrade shape: Option B, the RC-1 deterministic hash (unchanged). Labelled as such in the UI.

## Persistent identity (LOCKED direction; storage in Neon schema `room_zero`)
- History belongs to the token: rooms played, wins, kills, deaths, survival time, streak. "Notable runs" is a cut candidate.
- One result is written at match end, by the server settlement, for a validated online match. Nothing is written for a guest run or a demo run. Solo runs are simulated in the browser, so they earn no server rewards.
- Binding flow idea: connect wallet (lazy loaded) -> sign a plain message (no transaction, no approvals) -> server checks ownership -> operator bound. The client never reports ownership itself.
- If the token changes owner, the new owner binds and sees the token's history. Say so in the UI.
- Every failure (no wallet, wrong network, signature rejected, RPC down, token not owned, metadata missing) leaves the game playable as a guest.

## Verify before relying on anything (all UNKNOWN today)
Record each as EVIDENCE in STATE (source, date, who checked):
1. Chain.
2. Contract address.
3. Token standard and the real ownership read method (ERC-721 `ownerOf` is common, but confirm).
4. Metadata location and which traits exist.
5. Art rights: may the game redraw or animate the Chog, or only show original art as is?
6. A public RPC that is reliable and free enough, or the cheapest option if not.

Never write the guessed answer into code, config, or docs as if it were true.

## NFT copy and flow
No "unlock your power" or "pay to win" language. The tier is always shown to both sides (badge on the player card and the in-match name tag) so the opponent knows what they face. No mint or marketplace links in the play flow. Do not show the NFT screen before the player has finished a room.

## DEMO (built; labelled)
Any Chog number (1 to 1,969) can be tried without a wallet: the DEMO screen, `?mockChog=<n>`, and "Play online as DEMO" on the Online screen.
- **Copy, shown on screen:** "DEMO: no wallet is connected and no ownership is checked." plus that the tier is the token's real catalogue tier and demo power earns nothing.
- **Power:** the token's real tier and, for the ten 1:1s, its signature (`docs/design/power.md`). Solo, and online only against other demo players (server queue `|demo`). Never verified, never rewarded, never 5v5 with real holders.
- **Play-shape trait (RC-1, unchanged):** the number also picks one of four sidegrades by FNV-1a hash mod 4 and a marking colour.

| Trait | Effect | Counterplay |
|---|---|---|
| Lamp | Sight +22%, cone -28%. Spots enemies down halls first | Come from the side: its flanks are dark. Close fights in rooms favour you |
| Wide | Cone +40%, sight -17%. Owns rooms and corners | Stay at range down a corridor: it sees little far ahead |
| Steady | Tighter spread, reload -30%; magazine -30%, fire 12% slower | Push when it reloads |
| Spray | Magazine +40%, slightly faster fire; looser spread, reload +40% | Fight at range; punish the long reload |

Sidegrades never touch health, armour, damage or speed (`tests/operators.test.ts`); duel parity 25% to 75% vs the standard kit (`tests/rc-nft-demo.test.ts`).

## Verified holders (built 2026-10-14)
Wallet sign-in (SIWE) -> the site reads `tokensOfOwner` and `metadataId` on Monad -> a signed single-use ticket -> the game server checks it with the site. Holders get 5v5, a verified identity, token history, and their tier's power (on by default since 2026-10-14). Details: `docs/AUTH.md`, `docs/MULTIPLAYER.md`, `docs/DATABASE.md`.

## NFT-R1 research result (2026-10-13, EVIDENCE; full package in `docs/research/chog-genesis/`)
Answers to "Verify before relying on anything", checked from public sources, not from the chain (this environment had no RPC access):
1. Chain: Monad mainnet, chain id 143.
2. Contract: `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763`, `ChogMint`, source verified on Sourcify (exact match). Supply 1,969.
3. Standard ERC-721 (+ ERC-2981). Ownership reads: `ownerOf(uint256)` and `tokensOfOwner(address)` (one call lists a wallet's tokens). Not called yet. Monad RPCs reject `eth_getLogs` over more than 100 blocks, so do not rebuild ownership from logs.
4. Metadata: IPFS folder, 13 trait categories, permanent after the contract's reveal. All 1,969 records are in `data/chog-genesis/` (complete and consistent, not yet hash-verified). **Token id and the number shown in the name are different** (`metadataId = ((tokenId - 1 + startingIndex) % 1969) + 1`, `startingIndex` derived as 1461, not yet read). Key history by token id; show the metadata id.
5. Art rights: still UNKNOWN. No Chog art in the build until the owner has written terms.
6. RPC: five public endpoints listed at docs.monad.xyz/developer-essentials/network-information.
The class system (above) uses the verified catalogue's `Tier` trait. The site re-reads `metadataId` from the contract for every held token, so the derived `startingIndex` is not relied on for verified holders.
