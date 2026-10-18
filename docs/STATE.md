# Chog: Room Zero - shared state

Source of truth for every agent. Rules: `docs/RULES.md`. Edit only in a handoff commit. Under 8,000 characters.
Last verified: 2026-10-18 by claude (CHOG superpower system, live from ccr-e7fadb8f-qtochk, H32).

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero` (private). Base branch `setup/skill-system` (LOCKED 2026-10-11: no `main`); never merge without owner. PRs #1-#9 stacked, PR #10 = ccr-e7fadb8f-qtochk. CHOG superpowers (SP) and V2 live from ccr-e7fadb8f-qtochk (H32). Client and server always ship from one commit (Render `/stats` names it).
- Vercel project `chog-room-zero` (protection off). Production `chogroomzero.xyz` = `dpl_5axWehdTGuaDy6gzuPFKbH53S9aX` (7a256f1; code of H32). Rollback: `dpl_84DLkQYDr8cEBRSWTa88KQy6nokZ` (f82b511, V2) with Render on f82b511; no migration in SP. Sign-in env vars and `DATABASE_URL` (Neon) set by the owner; no `NFT_COMBAT` (power on). Game server: Render Free `https://room-zero-game.onrender.com` (redeploys on every push to ccr-e7fadb8f-qtochk); `ALLOWED_ORIGINS` = production + that branch's preview. No test hooks in production.
- Chog Genesis (NFT-R1, EVIDENCE): Monad 143, contract `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763` (ChogMint, Sourcify exact match), ERC-721, supply 1,969, catalogue in `data/chog-genesis/`; token id is NOT the displayed number. Live check 2026-10-17 (`/api/game/chain`): chain 143, `metadataId(1)` = 1462.
- Chogathon 2026 (`docs/SUBMISSION.md`): "the Chog NFT must be essential".

## LOCKED (owner; 2026-10-07, 2026-10-11, 2026-10-12, 2026-10-13)
1. Dark top-down tactical survival shooter, ~90 s rooms, mobile and PC, original IP. Bullet Echo is a benchmark only: nothing copied.
2. 14 days. Playable by Day 7. Freeze after Day 11. Days 12-14 fixes, QA, submission.
3. $0 target, $20 cap, owner approves each spend.
4. Controls: mobile LANDSCAPE (upright turned 90 deg); left thumb move, right thumb aim+fire outside deadzone, ability in right-thumb reach, no auto-fire. PC: WASD, mouse, click, Space.
5. Test devices: Pixel 7, iPhone 13.
6. Projectiles travel visibly, no hitscan. Walls block bullets and vision via real occlusion.
7. Movement has deliberate acceleration, turning, stopping. Humans turn at a cap too (owner 2026-10-16 CF: "capped/weighted human turning").
8. Bots: patrol, investigate, pursue, attack, reposition, disengage; cover, angles, break LOS; never just rush.
9. Class system. CHANGED by the owner 2026-10-18 (CHOG SUPERPOWER SYSTEM, rule 6: "Do not use NFT rarity for generic health/damage stat inflation"): no tier adds health, armour or damage; a verified Chog's real traits give one superpower (Laser Eyes, X-Ray Eyes, Bubble, Drool Web, Aura) in the single ability slot, ranked by its tier; the ten 1:1s keep their names and signatures; same upgrades for all; nothing sold. Was (2026-10-13/14): rarity starting stats, 1:1s dominant. `src/config/superpowers.ts`, `docs/design/superpowers.md`. NFT power ON (`NFT_COMBAT=0` off).
10. Solo, 1v1, 3v3 open to all; 5v5 verified holders only, server-enforced (every squad member). Ownership verified server-side (SIWE, Monad reads); fails closed. Demo mode labelled, isolated, no rewards. 1:1 names used (owner 2026-10-14); art rights pending.
11. Accounts (GP, owner 2026-10-17: a Solo leaderboard of verified practice kills beside the Online one; medals awarded on the server): XP, levels, shards, upgrades, rating from validated online matches (server pull, idempotent) and, owner 2026-10-17 ("earn progression even when they lose"), capped ticketed solo practice (no rating). All progression on the account (callsign, medals, career too); localStorage keeps preferences only (owner 2026-10-14). Account progression separate from token history; transfers move no XP or currency. Reuse the owner's Neon; additive migrations in schema `room_zero`. No payments this phase. No custom contract, no $CHOG dependency, wallet never required for solo/1v1/3v3. Online on an authoritative server (RC-8); no paid host without the owner's yes.
12. Out of scope: Railway worker, custom contract, paid inference, $CHOG economy, real-money purchases, second simultaneous ability, loot chests, gear grid, clans, season pass. One map; pickups. Free roster of 7 (Benja, Toad, Ray, Tabsu, Tonashiro, Yot, Bill; 5 departments) with one ability each, and grenades for everyone (capacity 3/5/7/9/11/13 by verified tier, never upgrades, server-set) (owner 2026-10-14; `docs/design/roster-grenades.md`).
13. Every added system names an equal or larger cut.
14. No scheduled or background jobs without owner approval.
15. TypeScript, Vite, PixiJS v8, Vitest.
16. Win condition: eliminate all bots. RC-8 (owner): a shrinking danger zone can end a run (zone death = loss); online, the last side standing wins.
17. Owner 2026-10-14: default game is YOU + 2 AI TEAMMATES vs bots; "Sign in" opens Google / Wallet sheet; minimal UI copy.

## PROPOSALS (not approved)
- All tuning numbers (upgrades, revives, signatures, zone, lean rules), art direction, map, fonts, CHOG palette (`docs/BRAND.md`), NFT-R1 layers. Deps: @neondatabase/serverless, dev @electric-sql/pglite, @noble/*.
- V2 (H31): perks, AI guard, daily challenges, Ace rule, solo board 25 runs/day, telemetry fields.
- SP (H32): every superpower number, the trait mapping (X-Ray = visor Eyes), Training cooldowns, beam/orb rules.
- Owner decisions open: approved powers #5 and #6 (not found anywhere; not invented); X-Ray = visor; grenade capacity by tier; 618 tokens without a power trait; paid always-on game server; labelled bot backfill online.

## UNKNOWN (never guess)
- Chog Genesis art and name rights; `baseURI`, totalSupply read from chain; metadata hash check (`docs/research/chog-genesis/`).
- Owner's Pixel 7 / iPhone 13. Chogathon deadline.
- Whether a real holder can sign in and play 5v5 (fake-chain holder passes locally).

## Implemented (EVIDENCE)
- SP (H32, live): trait-to-power table generated from the catalogue (1,351 of 1,969 tokens), five powers in the sim (server-authoritative online), ticket carries the holder's pick only if the token carries it, tier stats removed, snapshot privacy (X-Ray hit blurred, beam line only near you), render/HUD/audio, opponent power named and shown, CHOG Training (5 drills, DEMO picker, records nothing), Game Docs section. `docs/design/superpowers.md`.
- V2 (H31): session revocation, downed card, perks, AI guard, solo board cap, telemetry, daily challenges, kill feed (`docs/ROOM_ZERO_V2_SUPERIORITY.md`). GP (H30) and earlier: `docs/HANDOFFS.md`.

## Automated tests (EVIDENCE, Node 22.22)
SP (H32): vitest 955/955 (98 files), tsc clean. Browser (headless Chromium, emulated, local stack): qa-journey 38/38, gp-ui 34/34, master-ui 8/8, qa-errors 7/7, qa-rewards 13/13, qa-screens clean, sp-training 21/21, sp-online 8/8, rc8-online 3v3 PASS, 1v1 PASS on rerun (first run: clients not matched in time). Production: health (migrations 1-8), config, chain self-check, solo board 200; live bundle has the powers, no test hooks; no runtime errors; Render /stats = 7a256f1.

## Not performed (needs the owner)
- Human play of CF to SP (15-30 players, 150+ matches), real phones, real-GPU FPS, audio by ear, a real wallet, hosted 5v5 with a holder, art rights, the demo video.

## Gates
Core Feel Gate: BLOCKED on owner playtests (class numbers, CF, SB, FP). G10: automated PASS; playtest not run.

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| SP | claude | ccr-e7fadb8f-qtochk | see H32 | Owner 2026-10-18 CHOG SUPERPOWER SYSTEM | live (H32); #5/#6 + human playtest open |
| V2 | claude | ccr-e7fadb8f-qtochk | see H31 | Owner 2026-10-18 V2 SUPERIORITY PASS | live; human playtest open |
| RC-8 | claude | ccr-e7fadb8f-qtochk, PR #10 | see H16 | Owner RC-8 mandate | PR #10 not merged (stacked on #9; owner decides) |

## Handoffs
Latest: H32 (2026-10-18, claude -> owner; CHOG superpowers live on chogroomzero.xyz). History: `docs/HANDOFFS.md`.
