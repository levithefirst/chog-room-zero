# Chog: Room Zero - shared state

Source of truth. Rules: `docs/RULES.md`. Edit only in a handoff commit. Under 8,000 characters.
Last verified: 2026-10-19 by claude (H34 maps pass, live from ccr-e7fadb8f-qtochk).

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero`. Base branch `setup/skill-system` (LOCKED 2026-10-11: no `main`); never merge without owner. PRs #1-#9 stacked, PR #10 = ccr-e7fadb8f-qtochk. H34, ID, SP, V2 live from it. Client and server always ship from one commit (Render `/stats`).
- Vercel project `chog-room-zero` (protection off). Production `chogroomzero.xyz` = `dpl_F2u9XN72Py12WWGbNPzfwxv1Fjqu` (8068224, H34 code). Rollback: `dpl_8gcYGXbzA997cAZCtyxqqVtDBNXv` (1b93756) with Render on 1b93756; no migration in H34. No `NFT_COMBAT` (power on). Game server: Render Free `https://room-zero-game.onrender.com` (redeploys on every push to the branch); `ALLOWED_ORIGINS` = production + branch preview.
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
- Owner decisions open: Supermarket solo is hard (autopilot won 1 of 8); approved powers #5 and #6 (not found; not invented); which trait carries X-Ray (none literal; candidates in `docs/design/superpowers.md`); Squad/Breach drill (3 holders); grenade capacity by tier; solo 1v5 autopilot wins fell 39 to 5 of 280 at 150 health; paid always-on game server; labelled bot backfill online.

## UNKNOWN (never guess)
- Chog Genesis art and name rights; `baseURI`, totalSupply from chain; metadata hash (`docs/research/chog-genesis/`).
- Owner's Pixel 7 / iPhone 13. Chogathon deadline.
- Whether a real holder can play 5v5 (fake-chain holder passes locally).

## Implemented (EVIDENCE)
- H34 (live): five locations (`docs/design/maps.md`); tiles RAIL (blocks movement, not sight or shots), DECK (high ground ignores half cover), STAIRS (0.65 speed); lit areas seen to 22 m; carpet quiet, deck and tunnel loud; hub leaderboard replaces TODAY (Daily on Career); map picker (sheet on phones); 40 medals ~30% harder; device layer (`src/ui/device.ts`); protocol 2, older clients told to reload.
- ID (H33), SP (H32), V2 (H31), GP (H30) and earlier: `docs/HANDOFFS.md`.

## Automated tests (EVIDENCE, Node 22.22)
H34 (8068224): vitest 1023/1023 (101 files), tsc clean. Browser (headless, emulated, local stack): all 11 suites pass (id-maps 35/35; counts in H34), HUD at 7 sizes clean. Production smoke 20/20: endpoints 200, migrations 1-8, five maps in the bundle, no localhost or test hooks; metro queue matched on metro, 'moon' refused, protocol 1 told to reload; Render /stats = 8068224; no runtime errors.

## Not performed (needs the owner)
- Human play of CF to H34 (all five locations), real phones, real-GPU FPS, audio by ear, a real wallet, hosted 5v5 with a holder, art rights, demo video.

## Gates
Core Feel Gate: BLOCKED on owner playtests. G10: automated PASS; playtest not run.

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| H34 | claude | claude/h34-maps -> ccr-e7fadb8f-qtochk | see H34 | Owner 2026-10-19 H34 | live; owner plays five maps |
| ID | claude | ccr-e7fadb8f-qtochk | see H33 | Owner 2026-10-18 IDENTITY | live; X-Ray trait, Squad drill open |
| SP | claude | ccr-e7fadb8f-qtochk | see H32 | Owner 2026-10-18 SUPERPOWERS | live; #5/#6 open |
| RC-8 | claude | PR #10 | see H16 | Owner RC-8 mandate | PR #10 not merged (owner decides) |

## Handoffs
Latest: H34 (2026-10-19, claude -> owner; five locations, hub leaderboard, 40 medals live). History: `docs/HANDOFFS.md`.
