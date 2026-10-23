---
name: chog-nft-review
description: Use for anything involving Chog Genesis NFTs, operators, token-derived traits, rarity tiers and starting power, the ten 1:1 signature operators, persistent Chog history, guest versus bound runs, wallet connect, ownership checks, holder-only 5v5, or $CHOG in Chog: Room Zero. Applies the two-part removal test, the class-system caps, server-verified ownership, and the rule to verify chain, contract, metadata, ownership method, and art rights instead of assuming them.
---

# Chog NFT Review

The rules are in `docs/design/nft.md` (identity, history, ownership) and `docs/design/power.md` (tiers, caps, upgrades). Read them now if they are not in context.

## Gate check first
NFT combat power for real holders stays switched off in production (`NFT_COMBAT`) until the Core Feel Gate passes (`docs/GATES.md`). Accounts, the database and ownership verification may be built before it (owner 2026-10-13). Never mark the human half of the gate passed.

## Procedure
1. Check what is still UNKNOWN or unverified in `docs/STATE.md`. Never write a guessed chain, contract, metadata, ownership method or art-rights detail into code or docs. Record each fact as EVIDENCE with source and date.
2. Fill the removal table for every NFT-linked mechanic (play difference and persistence). WEAK means redesign or cut.
3. Check the class system: every power number comes from `src/config/power.ts`, stays inside the caps in `power.md`, and the property tests pass. Free players have an earned path to more power. No combat power is sold.
4. Check trust: ownership, tier and 1:1 identity come from the server (chain read plus the verified metadata table), never from the browser. 5v5 refuses anyone without a verified holder ticket, on the game server.
5. Check persistence: guests write nothing. Account progression (XP, shards, upgrades, rating) belongs to the account. Token history belongs to the token. A transfer moves neither the account's progress nor its currency. Settlement is server-side and idempotent per match.
6. Check failure paths: no wallet, wrong network, rejected signature, RPC down, token not owned, database down. Each leaves solo, 1v1 and 3v3 playable; NFT benefits fail closed.
7. Check demo separation: demo bindings are labelled DEMO, play in their own queues, and never write rewards or token history.
8. Report KEEP, REDESIGN, or CUT per mechanic, then run G10.

## Do not
Make anything depend on $CHOG. Gate solo, 1v1 or 3v3 behind ownership. Trust a client-reported token, address, win or reward. Present demo data as verified. Use Chog art or names beyond verified rights. Sell combat power.
