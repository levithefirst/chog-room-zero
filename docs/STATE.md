# Chog: Room Zero - shared state

Source of truth for every agent. Rules: `docs/RULES.md`. Edit only in a handoff commit. Keep under 8,000 characters; move old rows to `docs/HANDOFFS.md`.
Last verified: 2026-10-14 by claude (QA final QA + bug elimination pass).

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero` (private). Default/base branch `setup/skill-system` (LOCKED, owner 2026-10-11: no `main`). Never merge without the owner.
- Open PRs stacked #1 to #9, then PR #10 = this branch. Merge in order; README conflict at #1: keep the game README.
- Vercel project `chog-room-zero` (protection off). Production `chogroomzero.xyz` -> `dpl_47vJS2AYM4Ly8EX8wyvCd9k46kSo` (b57a5a7, H23). Rollback: `dpl_7TftYsmp4TmfckyYawSr2JVWeUT1` (MB-2), more in H18/H21. Sign-in env vars and `DATABASE_URL` (Neon) set by the owner. No `NFT_COMBAT` set: combat power is on by default (owner 2026-10-14). Game server: Render Free `https://room-zero-game.onrender.com` (redeploys on every push to this branch); `ALLOWED_ORIGINS` = both production domains + branch preview. `VITE_GAME_SERVER_URL` = Production + Preview. Test hooks are not in production builds.
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
9. Class system (owner 2026-10-13, 2026-10-14 MASTER INTEGRATION PASS): rarity sets starting power (real, not cosmetic), the ten 1:1s are dominant with their real names and a signature each, a maxed free player reaches the lower tiers, rating separate from power, nothing sold. Numbers: `src/config/power.ts`, `docs/design/power.md`. NFT combat power ON for verified holders (`NFT_COMBAT=0` turns it off).
10. Solo, 1v1, 3v3 open to all; 5v5 verified holders only, server-enforced (every squad member). Ownership verified server-side (SIWE wallet, then Monad reads); fails closed. Labelled demo mode, isolated, no rewards. 1:1 names used (owner 2026-10-14); art rights still pending.
11. Accounts: XP, levels, shards, upgrades, rating from validated online matches only (server pull, idempotent). All progression on the account (callsign, medals, career too); localStorage keeps preferences only (owner 2026-10-14). Account progression separate from token history; transfers move no XP or currency. Reuse the owner's Neon; additive migrations in schema `room_zero`. No payments this phase. No custom contract, no $CHOG dependency, wallet never required for solo/1v1/3v3. Online 1v1/3v3/5v5 on an authoritative server (RC-8); no paid host without the owner's yes.
12. Out of scope: Railway worker, custom contract, paid inference, $CHOG economy, real-money purchases, second simultaneous ability, loot chests, gear grid, clans, season pass. One map; 4 heroes with one ability each; pickups.
13. Every added system names an equal or larger cut.
14. No scheduled or background jobs without owner approval.
15. Stack: TypeScript, Vite, PixiJS v8, Vitest.
16. Win condition: eliminate all bots. RC-8 (owner): a shrinking danger zone can end a run (zone death = loss); online, the last side standing wins.
17. Owner 2026-10-14 FINAL QA: the default game is YOU + 2 AI TEAMMATES vs bots (never confused with online 3v3); "Sign in" opens a sign-in sheet (Continue with Google / Continue with Wallet), never Settings; minimal UI copy.

## PROPOSALS (not approved)
- Class numbers, upgrade costs, rewards, revive timings, the ten signatures (`docs/design/power.md`; measured, not felt). Hub layout, medals, tips. Deps: @neondatabase/serverless 1.1.0, dev @electric-sql/pglite 0.5.8, @noble/*.
- NFT-R1: Eyes/Mouth-keyed sidegrades, prestige and cosmetic layers, display-name layer (`docs/research/chog-genesis/IDENTITY-AND-MAPPING.md`).
- RC-8: PROVISIONAL CHOG palette (`docs/BRAND.md`), zone tuning, operator art. Marksman does not pierce crates/slabs (owner RC-8).
- All tuning numbers, heroes, weapons, armour, lean rules, art direction, the map, the four sidegrades, the fonts.

## UNKNOWN (never guess)
- Chog Genesis art and name rights; `baseURI`, totalSupply read from chain; metadata hash check (`docs/research/chog-genesis/`).
- Owner access to Pixel 7 / iPhone 13. Chogathon submission deadline.
- Whether a real holder can sign in and play 5v5 (no real holder wallet tried; fake-chain holder passes locally). A settled match on Neon (none played live yet; settles on PGlite end to end).

## Implemented (EVIDENCE)
- QA (H23): AI teammates in the sim (shared brain, team vision, revive), sign-in sheet (Google + Wallet, return context), minimal hub/screens, centred Upgrades, Continue on results, fetch timeouts, Cancel while connecting, browser Back, phone fixes.
- MI (H22): loading screen, hub (identity, XP, shards, rating, class panel, modes, leaderboard preview, squads), Upgrades/Leaderboard/Career/Medals, online results, account-owned profile (migration 3), class rescale, pickup over-cap, downed/revive, 1:1 cues, server squads.
- Earlier: P2 (H5), RC-7 (H15), RC-8 online (H16-H18), MB-1 classes/5v5 gate (H20), MB-2 Neon leaderboard (H21). See `docs/HANDOFFS.md`.

## Automated tests (EVIDENCE, Node 22.22)
`npx vitest run` 523/523 (54 files), `tsc --noEmit` clean. Browser (headless Chrome, emulated, local stack): qa-journey 31/31, qa-screens 5 devices clean, qa-errors 7/7, rc8-online 1v1+3v3, master-ui 8/8 (H23).

## Not performed (needs the owner)
- RC-8: hosted 3v3/5v5, hosted reconnect, phones on separate networks, touch online, readability by a person, Mop balance.
- Pixel 7 / iPhone 13 / tablets, real-GPU FPS, feel, fairness, audio by ear, a human win, the demo video.
- NFT-R1: `verify-ipfs.ts`, art rights in writing. MI: Core Feel Gate playtest of tier gaps, signatures, revive timings (`docs/design/power.md`); a real holder wallet; hosted 3v3/5v5 with squads; a live match settling on Neon; the hub on a real phone.

## Gates
Core Feel Gate: BLOCKED on owner playtests (tunes the class numbers; NFT combat already on by owner decision). G10: automated part PASS (tests above, live chain self-check); playtest part not run.

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| QA | claude | ccr-e7fadb8f-qtochk | see H23 | Owner 2026-10-14 FINAL QA + BUG ELIMINATION | in production; live journeys need real players |
| RC-8 | claude | ccr-e7fadb8f-qtochk, PR #10 | see H16 | Owner RC-8 mandate | PR #10 not merged (stacked on #9; owner decides) |

## Handoffs
Latest: H23 (2026-10-14, claude -> owner; QA final QA pass). History: `docs/HANDOFFS.md`.
