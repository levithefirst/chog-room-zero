# Chog: Room Zero - shared state

Source of truth. Rules: `docs/RULES.md`. Edit only in a handoff commit. Under 8,000 characters.
Last verified: 2026-10-20 by grokbot (UIX H37, PR #11 preview); production still claude H36 (d98ef8d).

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero`. Base branch `setup/skill-system` (LOCKED 2026-10-11: no `main`); never merge without owner. PR #10 = ccr-e7fadb8f-qtochk (= d98ef8d, live); docs-only commits stay on claude/h34-maps (no Render restart). Client and server ship from one commit.
- Vercel project `chog-room-zero` (protection off). Production `chogroomzero.xyz` = `dpl_SbSnNzyk1J8uxXbHbpK37hJuCWuw` (d98ef8d). Rollback: `dpl_46MAf8pLrnp2qn6ywR2haNvf8PRb` (e6f92a9) with Render on e6f92a9; no migration since H33. No `NFT_COMBAT` (power on). Game server: Render Free (0.1 CPU, 512 MB, est. 30-40 players) `https://room-zero-game.onrender.com` (redeploys on every push to the branch); `ALLOWED_ORIGINS` = production + branch preview.
- Chog Genesis (NFT-R1, EVIDENCE): Monad 143, contract `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763` (ChogMint, Sourcify), ERC-721, supply 1,969, catalogue in `data/chog-genesis/`; token id is NOT the displayed number. `/api/game/chain` checks it live.
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
9. Class system. CHANGED by the owner 2026-10-18 (CHOG SUPERPOWER SYSTEM, rule 6: "Do not use NFT rarity for generic health/damage stat inflation"): no tier adds health, armour or damage; a verified Chog's real traits give one superpower (Laser Eyes, Visor, Bubble, Drool Web, Aura; X-Ray Eyes has no trait, DEMO/Training only) in the single ability slot, ranked by its tier; owner 2026-10-18 IDENTITY pass: 150 health for every operator and free player, 200 for a verified Chog with no mapped power (no other edge), armour cap 65; the ten 1:1s keep their names and signatures; same upgrades for all; nothing sold. `src/config/superpowers.ts`, `docs/design/superpowers.md`. NFT power ON (`NFT_COMBAT=0` off).
10. Solo, 1v1, 3v3 open to all; 5v5 verified holders only, server-enforced (every squad member). Ownership verified server-side (SIWE, Monad); fails closed. Demo mode labelled, isolated, no rewards. 1:1 names used (owner 2026-10-14); art rights pending.
11. Accounts (GP 2026-10-17: Solo board beside Online; medals on the server): XP, levels, shards, upgrades, rating from validated online matches (server pull, idempotent) and, owner 2026-10-17 ("earn progression even when they lose"), capped ticketed solo practice (no rating). All progression on the account (callsign, medals, career too); localStorage keeps preferences only (owner 2026-10-14). Account progression separate from token history; transfers move no XP or currency. Reuse the owner's Neon; additive migrations in schema `room_zero`. No payments this phase. No custom contract, no $CHOG dependency, wallet never required for solo/1v1/3v3. Online on an authoritative server (RC-8); no paid host without the owner's yes.
12. Out of scope: Railway worker, custom contract, paid inference, $CHOG economy, real-money purchases, second simultaneous ability, loot chests, gear grid, clans, season pass. Exactly five locations open to all (Room Zero, Office, Supermarket, Metro Station, Construction Site; owner 2026-10-19 H34, was three), different in topology, tiles and light; pickups back 4 s after taken (owner 2026-10-18). Free roster of 7 (Benja, Toad, Ray, Tabsu, Tonashiro, Yot, Bill; 5 departments) with one ability each, and grenades for everyone (capacity 3/5/7/9/11/13 by verified tier, never upgrades, server-set) (owner 2026-10-14; `docs/design/roster-grenades.md`).
13. Every added system names an equal or larger cut.
14. No scheduled or background jobs without owner approval.
15. TypeScript, Vite, PixiJS v8, Vitest.
16. Win condition: eliminate all bots. RC-8 (owner): a shrinking danger zone can end a run (zone death = loss; every interval 20% longer, owner 2026-10-18); online, the last side standing wins.
17. Owner 2026-10-14: default game is YOU + 2 AI TEAMMATES vs bots; "Sign in" opens Google / Wallet sheet; minimal UI copy.

## PROPOSALS (not approved)
- All tuning numbers, art direction, maps, fonts, CHOG palette (`docs/BRAND.md`), NFT-R1 layers. Deps: @neondatabase/serverless, @electric-sql/pglite (dev), @noble/*.
- V2 (H31): perks, AI guard, challenges, Ace, solo board cap, telemetry.
- SP/ID (H32, H33): superpower numbers, Visor radii, drills, beam/orb rules; sawn-off 10 per pellet.
- H34: all five layouts, rail/deck/stairs rules, lit range 22 m, surface noise, medal thresholds.
- H36: location is a preference: after 10 s anyone in the mode meets on the longest waiter's pick (`anyMapAfterSec`; Infinity = strict per-location queues as H33).
- Owner decisions open: confirm the H36 location rule; game server plan for 400 players (Free ~30-40, Starter $7 ~150-200, Standard $25 ~400 at the limit; estimates); Supermarket solo hard (autopilot 1 of 8); powers #5 and #6 (not found); X-Ray trait (candidates in `docs/design/superpowers.md`); Squad/Breach drill; grenade capacity by tier; solo 1v5 wins 5 of 280 at 150 health; bot backfill online.

## UNKNOWN (never guess)
- Chog Genesis art and name rights; `baseURI`, totalSupply from chain; metadata hash (`docs/research/chog-genesis/`).
- Owner's Pixel 7 / iPhone 13. Chogathon deadline.
- Whether a real holder can play 5v5 (fake-chain holder passes locally).

## Implemented (EVIDENCE)
- H34 (live): five locations, RAIL/DECK/STAIRS tiles, lit areas, surfaces, hub leaderboard, map picker, 40 medals, device layer, protocol 2 (`docs/design/maps.md`, HANDOFFS H34).
- H35 (live): hub blink fixed (ping time redrew the hub).
- H36 (live): human 1v1 queue fix, dead sockets never seated, queue rejoins, a failing room stops alone (`docs/MULTIPLAYER.md`).
- UIX (H37, PR #11, not live): `docs/design/ui-audit.md`.
- ID (H33) and earlier: `docs/HANDOFFS.md`.

## Automated tests (EVIDENCE, Node 22.22)
H36 (d98ef8d): vitest 1030/1030, tsc clean, 11 browser suites, h34-blink 34/34, mp-human met 9.4 s. Load (local, bots): 400 mixed 398/398 started, p50 1.0 s, 0 hangs; churn 400 x 120 s 0 hangs. Production check 10/10 (different locations met 9.2 s).

## Not performed (needs the owner)
- Human play of CF to H34 (all five locations), real phones, real-GPU FPS, audio by ear, a real wallet, hosted 5v5 with a holder, art rights, demo video.

## Gates
Core Feel Gate: BLOCKED on owner playtests. G10: automated PASS; playtest not run.

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| MP, H34/ID/SP | claude | claude/h34-maps -> ccr-e7fadb8f-qtochk | see H32-H36 | Owner 2026-10-18/19 | live; owner: 10 human 1v1s, server plan, five maps |
| UIX | grokbot | PR #11 -> claude/h34-maps | see H37 | Owner UI/UX brief 2026-10-20 | owner reviews #11 |
| RC-8 | claude | PR #10 | see H16 | Owner RC-8 mandate | PR #10 not merged (owner decides) |

## Handoffs
Latest: H37 (2026-10-20, grokbot -> owner; UIX on PR #11, not live). H36 live. History: `docs/HANDOFFS.md`.
