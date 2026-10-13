# NFT identity

Status: the rules below marked LOCKED come from the owner. Chain, contract, metadata and ownership method are EVIDENCE from NFT-R1 (`docs/research/chog-genesis/`) and are re-checked live by the server before any benefit applies. Art and name rights are UNKNOWN: placeholders only.

The owner's master build prompt (2026-10-13) replaced "sidegrades only" with a class system. NFT combat power for real holders stays switched off (`NFT_COMBAT`) until the Core Feel Gate passes (`docs/GATES.md`); the database, verification and demo mode may be built before it.

## LOCKED rules (owner, 2026-10-13 master build prompt)
- Anyone can play solo, 1v1 and 3v3 with no NFT, no wallet and no $CHOG.
- 5v5 is for verified Chog holders only, enforced on the game server, never by the browser.
- Holders get a combat advantage and rarity sets starting power (tier ladder in `docs/design/power.md`). The ten 1:1 Chogs sit in the top tier and each has a distinct signature ability in the single ability slot. No second simultaneous ability.
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

## RC-1 NFT DEMO (built; DEMO only)
A real wallet and ownership check are DEFERRED: chain, contract and metadata are still UNKNOWN. The DEMO shows how a Chog would change play:
- **Entry points, all with a DEMO badge:** the title "Chog DEMO" button, a DEMO screen, the title identity chip, the hero select chip, the HUD chip and the results screen.
- **Copy, shown on screen:** "DEMO: no wallet is connected and no ownership is checked. Traits come only from the token number."
- **Non-holders:** play as guest (the default, or "Play as guest" on the DEMO screen). `?mockChog=<n>` still binds a DEMO token for testing.

Deterministic mapping (`src/nft/traits.ts`, Option B above): token number, then FNV-1a hash mod 4, then the sidegrade. A second hash mod 5 picks a cosmetic marking colour (Slate, Brass, Lilac, Moss, Clay). The same number always gives the same traits. Sample numbers: #1 Lamp, #2 Wide, #3 Steady, #4 Spray (found by `sampleTokens()`).

| Trait | Effect | Counterplay |
|---|---|---|
| Lamp | Sight +22%, cone -28%. Spots enemies down halls first | Come from the side: its flanks are dark. Close fights in rooms favour you |
| Wide | Cone +40%, sight -17%. Owns rooms and corners | Stay at range down a corridor: it sees little far ahead |
| Steady | Tighter spread, reload -30%; magazine -30%, fire 12% slower | Push when it reloads |
| Spray | Magazine +40%, slightly faster fire; looser spread, reload +40% | Fight at range; punish the long reload |

Sidegrades only: health, armour, damage and speed never change (`tests/operators.test.ts`). Seeded duel parity: each sidegrade vs the standard kit (Kettle, slot-swapped, strafing, 3/6/9 u, 80 duels per cell) must win between 25% and 75% (`tests/rc-nft-demo.test.ts`).

The owner's RC-1 brief changes two earlier notes. Guests now keep device-local personal bests; this is not Chog operator history, so the LOCKED guest rule still holds for token history. The DEMO screen is reachable from the title before any room is finished.

## NFT-R1 research result (2026-10-13, EVIDENCE; full package in `docs/research/chog-genesis/`)
Answers to "Verify before relying on anything", checked from public sources, not from the chain (this environment had no RPC access):
1. Chain: Monad mainnet, chain id 143.
2. Contract: `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763`, `ChogMint`, source verified on Sourcify (exact match). Supply 1,969.
3. Standard ERC-721 (+ ERC-2981). Ownership reads: `ownerOf(uint256)` and `tokensOfOwner(address)` (one call lists a wallet's tokens). Not called yet. Monad RPCs reject `eth_getLogs` over more than 100 blocks, so do not rebuild ownership from logs.
4. Metadata: IPFS folder, 13 trait categories, permanent after the contract's reveal. All 1,969 records are in `data/chog-genesis/` (complete and consistent, not yet hash-verified). **Token id and the number shown in the name are different** (`metadataId = ((tokenId - 1 + startingIndex) % 1969) + 1`, `startingIndex` derived as 1461, not yet read). Key history by token id; show the metadata id.
5. Art rights: still UNKNOWN. No Chog art in the build until the owner has written terms.
6. RPC: five public endpoints listed at docs.monad.xyz/developer-essentials/network-information.
Option A (real traits mapped by a hand-written table) is now possible. A proposal is in `IDENTITY-AND-MAPPING.md`; it needs a `/brief`, the Core Feel Gate, and the two network checks (`tools/nft/read-chain.ts`, `tools/nft/verify-ipfs.ts`) run once with internet access. The gate and all rules above are unchanged.
