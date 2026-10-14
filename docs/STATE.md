# Chog: Room Zero - shared state

Source of truth for every agent. Rules: `docs/RULES.md`. Edit only in a handoff commit. Keep under 8,000 characters; move old rows to `docs/HANDOFFS.md`.
Last verified: 2026-10-14 by claude (MB-1 master build).

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero` (private). Default/base branch `setup/skill-system` (LOCKED, owner 2026-10-11: no `main`). Never merge without the owner.
- Open PRs, stacked #1 to #9 (head 43f5a5d), then PR #10 = branch `ccr-e7fadb8f-qtochk` (RC-3 to MB-1). Merge in order; README conflict at #1: keep the game README.
- Vercel project `chog-room-zero` (protection off). Production: `chogroomzero.xyz` and `chog-room-zero.vercel.app` -> MB-1 (H20 has the deployment id). Rollback: `dpl_5kxf2ZzZ9MVdX3BUn46ZyhmoLSMS` (RC-8 3743ded), more in H18. Sign-in env vars set by the owner. No `DATABASE_URL`, no `NFT_COMBAT` (both owner actions). Game server: Render Free `https://room-zero-game.onrender.com` (redeploys on every push to this branch); `ALLOWED_ORIGINS` = both production domains + branch preview. `VITE_GAME_SERVER_URL` = Production + Preview. Test hooks are not in production builds.
- Chog Genesis (NFT-R1, EVIDENCE): Monad 143, contract `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763` (ChogMint, Sourcify exact match), ERC-721, supply 1,969, catalogue in `data/chog-genesis/`; token id is NOT the displayed number. Live from production 2026-10-14 (`/api/game/chain`, rpc.monad.xyz): chain id 143, `metadataId(1)` = 1462 (so startingIndex 1461 holds), owner of token 1 lists token 1 in `tokensOfOwner`.
- Hackathon: Chogathon 2026; deliverables in `docs/SUBMISSION.md`; judges gate on "the Chog NFT must be essential". Deadline and project start date: UNKNOWN (page contradicts itself).

## LOCKED (owner; 2026-10-07, 2026-10-11, 2026-10-12, 2026-10-13)
1. Dark top-down tactical survival shooter, ~90 s rooms, mobile and PC, original IP. Bullet Echo is a benchmark only (P2 mandate): nothing copied.
2. 14 days. Playable by Day 7. Freeze after Day 11. Days 12-14 fixes, QA, submission.
3. $0 target, $20 hard cap, owner approval per spend.
4. Controls: mobile LANDSCAPE (owner 2026-10-13); upright devices get the landscape game turned 90 deg, first tap asks fullscreen + lock. Left thumb move, right thumb aim and fire outside deadzone, ability in right-thumb reach, no auto-fire; idle aim faces the walk (RC-5). PC: WASD, mouse aim, click fire, Space ability.
5. Test devices: Pixel 7, iPhone 13.
6. Projectiles travel visibly, no hitscan. Walls block bullets and vision via real occlusion.
7. Movement has deliberate acceleration, turning, stopping.
8. Bots: patrol, investigate, detect, pursue, attack, reposition, disengage, lose target; cover, angles, break LOS; never just rush.
9. Owner 2026-10-13 MASTER BUILD PROMPT (replaces "sidegrades only"): class system. Rarity sets starting power, the ten 1:1s are the top tier with a signature in the single ability slot, free players earn upgrades, rating separate from power, nothing sold. Numbers and caps: `src/config/power.ts`, `docs/design/power.md`. NFT combat power for real holders OFF (`NFT_COMBAT`) until the Core Feel Gate passes.
10. Solo, 1v1, 3v3 open to all; 5v5 verified holders only, server-enforced. Ownership verified server-side (SIWE wallet, then Monad reads); fails closed. Labelled demo mode for development and judging, isolated, no rewards. Art and name rights pending: placeholders only.
11. Accounts: XP, levels, shards, upgrades, rating from validated online matches only (server pull, idempotent). Account progression separate from token history; transfers move no XP or currency. Reuse the owner's Neon; additive migrations in schema `room_zero`. No payments this phase. No custom contract, no $CHOG dependency, wallet never required for solo/1v1/3v3. Online 1v1/3v3/5v5 on an authoritative server (RC-8); no paid host without the owner's yes.
12. Out of scope: Railway worker, custom contract, paid inference, $CHOG economy, real-money purchases, second simultaneous ability, loot chests, gear grid, clans, season pass. One map; 4 heroes with one ability each; pickups.
13. Every added system names an equal or larger cut.
14. No scheduled or background jobs without owner approval.
15. Stack: TypeScript, Vite, PixiJS v8, Vitest.
16. Win condition: eliminate all bots. RC-8 (owner): a shrinking danger zone can end a run (zone death = loss); online, the last side standing wins.

## PROPOSALS (not approved)
- MB-1 numbers: tier values, upgrade costs, rewards, rating offsets, the ten signatures (`docs/design/power.md`; measured, not felt). Deps: @neondatabase/serverless 1.1.0, dev @electric-sql/pglite 0.5.8, server-only @noble/*. RC-7 medals, tips, settings, menu layout.
- NFT-R1: Eyes/Mouth-keyed sidegrades, prestige and cosmetic layers, display-name layer (`docs/research/chog-genesis/IDENTITY-AND-MAPPING.md`).
- RC-8: PROVISIONAL CHOG palette (`docs/BRAND.md`), zone tuning, operator art. Marksman does not pierce crates/slabs (owner RC-8).
- All tuning numbers, heroes, weapons, armour and lean rules (`docs/design/benchmark.md`), art direction, the map, the four sidegrades, the fonts.

## UNKNOWN (never guess)
- Chog Genesis art and name rights; `baseURI`, totalSupply read from chain; metadata hash check (`docs/research/chog-genesis/`).
- Owner access to Pixel 7 / iPhone 13. Chogathon submission deadline.
- Owner's Neon connection string (not in Vercel). Whether a real holder can sign in and play 5v5 (no holder wallet tried).

## Implemented (EVIDENCE)
- P2 base game (map, 4 heroes, weapons, armour, lean, pickups, bots, match flow, HUD, fonts): list moved to `docs/HANDOFFS.md` (H15 trim note); see H5 for SHA.
- RC-8 (H16): touch pickups, true-size CHOG-inspired operators, solid cover for every bullet (7 scenarios), danger zone, PROVISIONAL palette (CSS + Pixi), authoritative online server + client, hosted on Render Free (H17), in production (H18).
- RC-7 (H15): boot screen, main menu, callsign, player card, 12 medals, settings, tips, results, optional sign-in functions. Map: `docs/REFERENCE-MAP.md`.
- MB-1 (H20): class system in the sim (tiers, upgrades, caps, 10 signatures with telegraphs), Neon persistence layer (`docs/DATABASE.md`), game tickets + live Monad ownership read + ticket check, holder-only 5v5 and demo queues on the server, settlement pull, Online identity panel, Progress tab, rewards line, demo invite link. In production (H20).

## Automated tests (EVIDENCE, Node 22.22)
`npx vitest run` 473/473 (48 files; MB-1 added 56), `tsc --noEmit` clean. Browser (headless Chrome, emulated): rc8-online 1v1 + 3v3 PASS, master-ui 7/7 (H20).

## Not performed (needs the owner)
- RC-8: hosted 3v3/5v5, hosted reconnect, Render logs, phones on separate networks, touch input online, zone and operator readability by a person, Mop balance (scripted Mop wins ~3% of seeds).
- Pixel 7 / iPhone 13 / any real tablet (fullscreen + lock, iOS safe areas), real-GPU FPS, feel, fairness, audio by ear, a human win, the demo video.
- NFT-R1: `verify-ipfs.ts`, art rights in writing. MB-1: Core Feel Gate playtest of tier gaps and signatures (questions in `docs/design/power.md`); a real holder signing in; hosted 5v5; Neon connected.

## Gates
Core Feel Gate: BLOCKED on owner playtests (blocks `NFT_COMBAT=1`). G10: automated part PASS (tests above, live chain self-check); playtest part not run.

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| MB-1 | claude | ccr-e7fadb8f-qtochk | rules, power, api/game, server tickets, client UI (H20) | Owner MASTER BUILD PROMPT 2026-10-13 | in production; DB and NFT_COMBAT wait on the owner |
| RC-8 | claude | ccr-e7fadb8f-qtochk, PR #10 | see H16 | Owner RC-8 mandate | PR #10 not merged (stacked on #9; owner decides) |

## Handoffs
Latest: H20 (2026-10-14, claude -> owner; MB-1 master build). History: `docs/HANDOFFS.md`.
