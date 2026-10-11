---
name: chog-nft-review
description: Use for anything involving Chog Genesis NFTs, operators, token-derived traits, persistent Chog history, guest versus bound runs, wallet connect, ownership checks, or $CHOG in Chog: Room Zero. Applies the two-part removal test, the fair-sidegrade rule, and the rule to verify chain, contract, metadata, ownership method, and art rights instead of assuming them.
---

# Chog NFT Review

The rules and the test are in `docs/design/nft.md`. Read it now if it is not in context.

## Gate check first
NFT, wallet, and database work is blocked until the Core Feel Gate passes (`docs/GATES.md`). If STATE does not show it passed, stop and say so. Design notes and briefs are fine; code is not.

## Procedure
1. List what is UNKNOWN in `docs/STATE.md` (chain, contract, standard, ownership method, metadata, art rights). Do not write any of them into code or docs until the owner or a real check provides them. Record each as EVIDENCE with source and date.
2. For every NFT-linked mechanic, fill the removal table (play difference and persistence). WEAK means redesign or cut.
3. Check fairness: identical base damage, health, and speed across operators. Strength in one area costs something in another. The default operator is complete and can win.
4. Check persistence: guest runs write nothing. A bound run writes one result at match end, keyed to the token. Ownership is verified on the server.
5. Check failure paths: no wallet, wrong network, rejected signature, RPC down, token not owned, metadata missing. Each one leaves the game playable.
6. Report KEEP, REDESIGN, or CUT per mechanic, then run G10 when code exists.

## Do not
Accept skins, badges, titles, access, or flat stat boosts as NFT mechanics. Make anything depend on $CHOG. Gate play behind ownership. Show NFT screens before the first finished room. Assume ERC-721 or any contract detail.
