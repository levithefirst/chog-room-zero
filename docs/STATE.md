# Chog: Room Zero - shared state

Source of truth. Rules: `docs/RULES.md`. Edit only in a handoff commit. Under 8,000 characters.
Last verified: 2026-11-15 by claude (H47: Hard mode, five Impossible locations; HANDOFFS H47).

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero`. Base branch `setup/skill-system` (LOCKED 2026-10-11: no `main`); never merge without owner. PR #10 = ccr-e7fadb8f-qtochk (live; claude/h34-maps holds H34-H36). Client and server ship from one commit.
- Vercel project `chog-room-zero`. Production `chogroomzero.xyz`: H46 commit (HANDOFFS H46). Rollback: `dpl_GPrDAbJkaji568GEE5UKY1p7N5Es` (a1d5c4b, H45) with Render on a1d5c4b; no migration since H33. No `NFT_COMBAT` (power on). Game server: Render Free `https://room-zero-game.onrender.com` (redeploys on every push to the branch; origins in render.yaml).
- Chog Genesis (NFT-R1, EVIDENCE): Monad 143, contract `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763` (ChogMint, Sourcify), ERC-721, supply 1,969, catalogue in `data/chog-genesis/`; token id is NOT the displayed number. `/api/game/chain` checks it live.
- Chogathon 2026 (`docs/SUBMISSION.md`): "the Chog NFT must be essential".

## LOCKED (owner; 2026-10-07, 2026-10-11, 2026-10-12, 2026-10-13)
1. Dark top-down tactical survival shooter, ~90 s rooms, mobile and PC, original IP. Bullet Echo is a benchmark only.
2. 14 days. Playable by Day 7. Freeze after Day 11. Days 12-14 fixes, QA, submission.
3. $0 target, $20 cap, owner approves each spend.
4. Controls: mobile LANDSCAPE (upright turned 90 deg); left thumb move, right thumb aim+fire outside deadzone, ability in right-thumb reach, no auto-fire. PC: WASD, mouse, click, Space.
5. Test devices: Pixel 7, iPhone 13.
6. Projectiles travel visibly, no hitscan. Walls block bullets and vision via real occlusion.
7. Movement has deliberate acceleration, turning, stopping. Humans turn at a cap too.
8. Bots: patrol, investigate, pursue, attack, reposition, disengage; cover, angles, break LOS; never just rush.
9. Class system. CHANGED by the owner 2026-10-18 (CHOG SUPERPOWER SYSTEM, rule 6: "Do not use NFT rarity for generic health/damage stat inflation"): no tier adds health, armour or damage; a verified Chog's real traits give one superpower (Laser Eyes, Visor, Bubble, Drool Web, Aura; X-Ray Eyes has no trait, DEMO/Training only) in the single ability slot, ranked by its tier; owner 2026-10-18 IDENTITY pass: 150 health for every operator and free player, 200 for a verified Chog with no mapped power (no other edge), armour cap 65; the ten 1:1s keep their names and signatures; same upgrades for all; nothing sold. `src/config/superpowers.ts`, `docs/design/superpowers.md`. NFT power ON (`NFT_COMBAT=0` off).
10. Solo, 1v1, 3v3 open to all; 5v5 verified holders only, server-enforced (every squad member). Ownership verified server-side (SIWE, Monad); fails closed. Demo mode labelled, isolated, no rewards. 1:1 names used (owner 2026-10-14); art rights pending.
11. Accounts (GP 2026-10-17: Solo board beside Online; medals on the server): XP, levels, shards, upgrades, rating from validated online matches (server pull, idempotent) and, owner 2026-10-17 ("earn progression even when they lose"), capped ticketed solo practice (no rating). All progression on the account (callsign, medals, career too); localStorage keeps preferences only (owner 2026-10-14). Account progression separate from token history; transfers move no XP or currency. Reuse the owner's Neon; additive migrations in schema `room_zero`. No payments this phase. No custom contract, no $CHOG dependency, wallet never required for solo/1v1/3v3. Online on an authoritative server (RC-8); no paid host without the owner's yes.
12. Out of scope: Railway worker, custom contract, paid inference, $CHOG economy, real-money purchases, second simultaneous ability, loot chests, gear grid, clans, season pass. Ten locations open to all: the five (Room Zero, Office, Supermarket, Metro Station, Construction Site; owner 2026-10-19 H34) and five Impossible (Abyss, Echo Labyrinth, Killing Field, Flooded, Vertigo; CHANGED by the owner 2026-11-15), different in topology, tiles and light; Hard mode for Vs bots (owner 2026-11-15); pickups back 4 s after taken (owner 2026-10-18). Free roster of 7 (Benja, Toad, Ray, Tabsu, Tonashiro, Yot, Bill; 5 departments) with one ability each, and grenades for everyone (capacity 3/5/7/9/11/13 by verified tier, never upgrades, server-set) (owner 2026-10-14; `docs/design/roster-grenades.md`).
13. Every added system names an equal or larger cut.
14. No scheduled or background jobs without owner approval.
15. TypeScript, Vite, PixiJS v8, Vitest.
16. Win condition: eliminate all bots. RC-8 (owner): a shrinking danger zone can end a run (zone death = loss; every interval 20% longer, owner 2026-10-18); online, the last side standing wins.
17. Owner 2026-10-14: default game is YOU + 2 AI TEAMMATES vs bots; "Sign in" opens Google / Wallet sheet; minimal UI copy.

## PROPOSALS (not approved)
- All tuning numbers, art direction, maps, fonts, CHOG palette (`docs/BRAND.md`), NFT-R1 layers. Deps: @neondatabase/serverless, @electric-sql/pglite (dev), @noble/*.
- V2 (H31) perks, AI guard, challenges, telemetry; H32-H34 power numbers, Visor radii, drills, layouts, rail/deck rules, medal thresholds; H37 map look, 1v1 opponent rule.
- H36: location is a preference: after 10 s anyone in the mode meets on the longest waiter's pick (`anyMapAfterSec`; Infinity = strict per-location queues as H33).
- H47 Hard numbers (`TUNING.hard`, gentlest in the owner's ranges) and the five Impossible layouts.
- Owner decisions open: H47 Hard is 0/24 for the autopilot (count is the lever); H36 location rule; server plan for 400 players (estimates: HANDOFFS H36); Supermarket solo hard; powers #5/#6; X-Ray trait; Squad/Breach drill; grenade capacity; bot backfill online.

## UNKNOWN (never guess)
- Chog Genesis art and name rights; `baseURI`, totalSupply from chain; metadata hash (`docs/research/chog-genesis/`).
- Owner's Pixel 7 / iPhone 13. Chogathon deadline.
- Whether a real holder can play 5v5 (fake-chain holder passes locally).

## Implemented (EVIDENCE)
- H34/H35 (live): five locations, 40 medals, protocol 2 (`docs/design/maps.md`).
- H37 (live): tactical map (MAP, M). `docs/design/tactical-map.md`.
- H36-H41 (live): 1v1 fix, UI pass, hub + loading, Library at /library (25 pages since H47). `docs/MULTIPLAYER.md`, `docs/design/ui-audit.md`.
- H44/H45 (grokbot): shards 10/10/30 online and practice, 1,000/day; map shows every living hostile (online `mh`).
- H47 (owner 2026-11-15, not deployed): Hard mode (Vs bots: 7 hostiles, sharper AI, 80% damage, faster zone, slower supplies), five Impossible locations, protocol 3. `docs/design/maps.md`.
- H46 (owner 2026-10-23): upgrade ranks, prices and caps (`docs/design/power.md`); medal goals (`src/ui/medals.ts`).

## Automated tests (EVIDENCE, Node 22.22)
H47: see HANDOFFS H47. H46: vitest 1196/1196, tsc, qa-rewards 13/13. Older: HANDOFFS.

## Not performed (needs the owner)
- Human play (all ten locations, Hard mode), real phones (BLOCKED), real-GPU FPS, audio by ear, a real wallet, hosted 5v5 with a holder, art rights, demo video.

## Gates
Core Feel Gate: BLOCKED on owner playtests. G10: automated PASS; playtest not run.

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| HM | claude | ccr-b6143158-sfobsl | see H47 | Owner 2026-11-15 HARD MODE + 5 IMPOSSIBLE | H47 committed, not pushed (owner confirms) |
| TM, MP, ID/SP, UIX, UIX2 | claude | ccr-e7fadb8f-qtochk | see H32-H43 | Owner 2026-10-18..21 | live |
| SHARDS/MAP | grokbot | same | see H44/H45 | Owner 2026-10-21 | live (a1d5c4b) |
| UP | claude | same | see H46 | Owner 2026-10-23 | H46; Hoarder/Pack Rat reach unproven |
| RC-8 | claude | PR #10 | see H16 | Owner RC-8 mandate | PR #10 not merged (owner decides) |

## Handoffs
Latest: H47 (claude; Hard mode, Impossible locations). History: `docs/HANDOFFS.md`.
