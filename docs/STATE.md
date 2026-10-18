# Chog: Room Zero - shared state

Source of truth for every agent. Rules: `docs/RULES.md`. Edit only in a handoff commit. Under 8,000 characters.
Last verified: 2026-10-18 by claude (V2 superiority pass, live from ccr-e7fadb8f-qtochk, H31).

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero` (private). Default/base branch `setup/skill-system` (LOCKED, owner 2026-10-11: no `main`). Never merge without owner.
- Open PRs stacked #1 to #9, then PR #10 = ccr-e7fadb8f-qtochk. V2 (with GP, FS, SB, FP) live from ccr-e7fadb8f-qtochk (H31). Client and server always ship from one commit (Render `/stats` names it).
- Vercel project `chog-room-zero` (protection off). Production `chogroomzero.xyz` = `dpl_84DLkQYDr8cEBRSWTa88KQy6nokZ` (f82b511). Rollback: `dpl_ELJaG68acs2YeTABLvrtq14xBonp` (18ccfdc, GP) with Render on 18ccfdc; migrations 7-8 are additive and harmless to it. Sign-in env vars and `DATABASE_URL` (Neon) set by the owner; no `NFT_COMBAT` (power on). Game server: Render Free `https://room-zero-game.onrender.com` (redeploys on every push to ccr-e7fadb8f-qtochk); `ALLOWED_ORIGINS` = production + that branch's preview. No test hooks in production.
- Chog Genesis (NFT-R1, EVIDENCE): Monad 143, contract `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763` (ChogMint, Sourcify exact match), ERC-721, supply 1,969, catalogue in `data/chog-genesis/`; token id is NOT the displayed number. Live check 2026-10-17 (`/api/game/chain`): chain 143, `metadataId(1)` = 1462.
- Chogathon 2026 (`docs/SUBMISSION.md`): "the Chog NFT must be essential".

## LOCKED (owner; 2026-10-07, 2026-10-11, 2026-10-12, 2026-10-13)
1. Dark top-down tactical survival shooter, ~90 s rooms, mobile and PC, original IP. Bullet Echo is a benchmark only: nothing copied.
2. 14 days. Playable by Day 7. Freeze after Day 11. Days 12-14 fixes, QA, submission.
3. $0 target, $20 hard cap, owner approval per spend.
4. Controls: mobile LANDSCAPE (owner 2026-10-13); upright devices get it turned 90 deg. Left thumb move, right thumb aim and fire outside deadzone, ability in right-thumb reach, no auto-fire; idle aim faces the walk (RC-5). PC: WASD, mouse aim, click fire, Space ability.
5. Test devices: Pixel 7, iPhone 13.
6. Projectiles travel visibly, no hitscan. Walls block bullets and vision via real occlusion.
7. Movement has deliberate acceleration, turning, stopping. Humans turn at a cap too (owner 2026-10-16 CF: "capped/weighted human turning").
8. Bots: patrol, investigate, detect, pursue, attack, reposition, disengage, lose target; cover, angles, break LOS; never just rush.
9. Class system (owner 2026-10-13, 2026-10-14 MASTER INTEGRATION PASS): rarity sets starting power (real, not cosmetic), the ten 1:1s are dominant with their real names and a signature each, a maxed free player reaches the lower tiers, rating separate from power, nothing sold. Numbers: `src/config/power.ts`, `docs/design/power.md`. NFT combat power ON for verified holders (`NFT_COMBAT=0` turns it off).
10. Solo, 1v1, 3v3 open to all; 5v5 verified holders only, server-enforced (every squad member). Ownership verified server-side (SIWE, Monad reads); fails closed. Demo mode labelled, isolated, no rewards. 1:1 names used (owner 2026-10-14); art rights pending.
11. Accounts (GP, owner 2026-10-17: a Solo leaderboard of verified practice kills beside the Online one; medals awarded on the server): XP, levels, shards, upgrades, rating from validated online matches (server pull, idempotent) and, owner 2026-10-17 ("earn progression even when they lose"), capped ticketed solo practice (no rating). All progression on the account (callsign, medals, career too); localStorage keeps preferences only (owner 2026-10-14). Account progression separate from token history; transfers move no XP or currency. Reuse the owner's Neon; additive migrations in schema `room_zero`. No payments this phase. No custom contract, no $CHOG dependency, wallet never required for solo/1v1/3v3. Online on an authoritative server (RC-8); no paid host without the owner's yes.
12. Out of scope: Railway worker, custom contract, paid inference, $CHOG economy, real-money purchases, second simultaneous ability, loot chests, gear grid, clans, season pass. One map; pickups. Free roster of 7 (Benja, Toad, Ray, Tabsu, Tonashiro, Yot, Bill; 5 departments) with one ability each, and grenades for everyone (capacity 3/5/7/9/11/13 by verified tier, never upgrades, server-set) (owner 2026-10-14; `docs/design/roster-grenades.md`).
13. Every added system names an equal or larger cut.
14. No scheduled or background jobs without owner approval.
15. Stack: TypeScript, Vite, PixiJS v8, Vitest.
16. Win condition: eliminate all bots. RC-8 (owner): a shrinking danger zone can end a run (zone death = loss); online, the last side standing wins.
17. Owner 2026-10-14 FINAL QA: the default game is YOU + 2 AI TEAMMATES vs bots (never confused with online 3v3); "Sign in" opens a sign-in sheet (Continue with Google / Continue with Wallet), never Settings; minimal UI copy.

## PROPOSALS (not approved)
- Class numbers, upgrades, revive timings, signatures (`docs/design/power.md`). Deps: @neondatabase/serverless, dev @electric-sql/pglite, @noble/*.
- NFT-R1 layers (`docs/research/chog-genesis/IDENTITY-AND-MAPPING.md`). PROVISIONAL CHOG palette (`docs/BRAND.md`), zone tuning, operator art.
- All tuning numbers, lean rules, art direction, the map, fonts.
- V2 (H31): perks (4, one slot, match only), AI guard, daily challenges and rewards, Ace damage rule, solo board 25 runs/day, telemetry fields. Earlier tuning: H25-H30.
- V2 owner decisions open (`docs/ROOM_ZERO_V2_SUPERIORITY.md` section 4): NFT combat power in open modes vs LOCKED 9 (recommended: power only in 5v5); paid always-on game server; labelled bot backfill online.

## UNKNOWN (never guess)
- Chog Genesis art and name rights; `baseURI`, totalSupply read from chain; metadata hash check (`docs/research/chog-genesis/`).
- Owner access to Pixel 7 / iPhone 13. Chogathon submission deadline.
- Whether a real holder can sign in and play 5v5 (fake-chain holder passes locally).

## Implemented (EVIDENCE)
- V2 (H31, live): forensic report checked against code; online shooter-boundary test + unseen-shooter distance tag; session revocation (migration 7); hidden pause card inert; downed card (who is coming, distance, known threat, BLED OUT); roster numbers; perks; AI guard; Ace tightened; solo board daily cap; anonymous match telemetry (migration 8, opt-out); daily challenges; kill feed. `docs/ROOM_ZERO_V2_SUPERIORITY.md`.
- GP (H30): kill loot, downed/revive, 36 medals, two boards, Game Docs. FS/FP/SB/CF and earlier: `docs/HANDOFFS.md`.

## Automated tests (EVIDENCE, Node 22.22)
V2 (H31): vitest 908/908 (95 files), tsc clean. Browser (headless Chromium, emulated, local stack): qa-journey 38/38, gp-ui 34/34, master-ui 8/8, qa-errors 7/7, qa-rewards 13/13, qa-screens clean, rc8-online 1v1+3v3 PASS. Production: health (migrations 1-8), challenges, report-summary, solo board 200; no runtime errors; Render /stats = f82b511.

## Not performed (needs the owner)
- Any human play of CF to V2 (15-30 players, 150+ matches; telemetry now records each), real phones, real-GPU FPS, audio by ear, a real wallet, hosted 5v5 with a holder, art rights, the demo video.

## Gates
Core Feel Gate: BLOCKED on owner playtests (class numbers, CF, SB, FP). G10: automated PASS; playtest not run.

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| V2 | claude | ccr-e7fadb8f-qtochk | see H31 | Owner 2026-10-18 V2 SUPERIORITY PASS (continuous) | passes 1-6 live (H31); owner decisions + human playtest open |
| GP, FS, FP, SB | claude | see H30-H27 | see those | Owner 2026-10-16/17 | live; owner playtest |
| RC-8 | claude | ccr-e7fadb8f-qtochk, PR #10 | see H16 | Owner RC-8 mandate | PR #10 not merged (stacked on #9; owner decides) |

## Handoffs
Latest: H31 (2026-10-18, claude -> owner; V2 live on chogroomzero.xyz). History: `docs/HANDOFFS.md`.
