# Chog: Room Zero - shared state

Source of truth for every agent. Rules: `docs/RULES.md`. Edit only in a handoff commit. Keep under 8,000 characters; move old rows to `docs/HANDOFFS.md`.
Last verified: 2026-10-16 by claude (CF deployed to production, H26).

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero` (private). Default/base branch `setup/skill-system` (LOCKED, owner 2026-10-11: no `main`). Never merge without the owner.
- Open PRs stacked #1 to #9, then PR #10 = ccr-e7fadb8f-qtochk. CF merged into ccr-e7fadb8f-qtochk and live (H26). The sim is shared with the server: client and server always ship from the same commit (Render `/stats` names its commit).
- Vercel project `chog-room-zero` (protection off). Production `chogroomzero.xyz` -> `dpl_2zr1LtzY5Z5qSceoANeFC2wmfWnM` (970c948, H26). Rollback: `dpl_EA71LQQByJRTvXiEAuifqHcjDJnt` (986b2a6, pre-CF; Render must go back with it). Sign-in env vars and `DATABASE_URL` (Neon) set by the owner. No `NFT_COMBAT` set: combat power is on by default (owner 2026-10-14). Game server: Render Free `https://room-zero-game.onrender.com` (redeploys on every push to ccr-e7fadb8f-qtochk); `ALLOWED_ORIGINS` = production domains + that branch's preview. Test hooks are not in production builds.
- Chog Genesis (NFT-R1, EVIDENCE): Monad 143, contract `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763` (ChogMint, Sourcify exact match), ERC-721, supply 1,969, catalogue in `data/chog-genesis/`; token id is NOT the displayed number. Live check 2026-10-14 (`/api/game/chain`): chain 143, `metadataId(1)` = 1462, ownerOf/tokensOfOwner agree.
- Chogathon 2026 (`docs/SUBMISSION.md`); judges gate on "the Chog NFT must be essential". Deadline and start date: UNKNOWN.

## LOCKED (owner; 2026-10-07, 2026-10-11, 2026-10-12, 2026-10-13)
1. Dark top-down tactical survival shooter, ~90 s rooms, mobile and PC, original IP. Bullet Echo is a benchmark only (P2 mandate): nothing copied.
2. 14 days. Playable by Day 7. Freeze after Day 11. Days 12-14 fixes, QA, submission.
3. $0 target, $20 hard cap, owner approval per spend.
4. Controls: mobile LANDSCAPE (owner 2026-10-13); upright devices get the landscape game turned 90 deg, first tap asks fullscreen + lock. Left thumb move, right thumb aim and fire outside deadzone, ability in right-thumb reach, no auto-fire; idle aim faces the walk (RC-5). PC: WASD, mouse aim, click fire, Space ability.
5. Test devices: Pixel 7, iPhone 13.
6. Projectiles travel visibly, no hitscan. Walls block bullets and vision via real occlusion.
7. Movement has deliberate acceleration, turning, stopping. Humans turn at a cap too (owner 2026-10-16 CF: "capped/weighted human turning").
8. Bots: patrol, investigate, detect, pursue, attack, reposition, disengage, lose target; cover, angles, break LOS; never just rush.
9. Class system (owner 2026-10-13, 2026-10-14 MASTER INTEGRATION PASS): rarity sets starting power (real, not cosmetic), the ten 1:1s are dominant with their real names and a signature each, a maxed free player reaches the lower tiers, rating separate from power, nothing sold. Numbers: `src/config/power.ts`, `docs/design/power.md`. NFT combat power ON for verified holders (`NFT_COMBAT=0` turns it off).
10. Solo, 1v1, 3v3 open to all; 5v5 verified holders only, server-enforced (every squad member). Ownership verified server-side (SIWE wallet, then Monad reads); fails closed. Labelled demo mode, isolated, no rewards. 1:1 names used (owner 2026-10-14); art rights still pending.
11. Accounts: XP, levels, shards, upgrades, rating from validated online matches only (server pull, idempotent). All progression on the account (callsign, medals, career too); localStorage keeps preferences only (owner 2026-10-14). Account progression separate from token history; transfers move no XP or currency. Reuse the owner's Neon; additive migrations in schema `room_zero`. No payments this phase. No custom contract, no $CHOG dependency, wallet never required for solo/1v1/3v3. Online 1v1/3v3/5v5 on an authoritative server (RC-8); no paid host without the owner's yes.
12. Out of scope: Railway worker, custom contract, paid inference, $CHOG economy, real-money purchases, second simultaneous ability, loot chests, gear grid, clans, season pass. One map; pickups. Free roster of 7 (Benja, Toad, Ray, Tabsu, Tonashiro, Yot, Bill; 5 departments) with one ability each, and grenades for everyone (capacity 3/5/7/9/11/13 by verified tier, never upgrades, server-set) (owner 2026-10-14; `docs/design/roster-grenades.md`).
13. Every added system names an equal or larger cut.
14. No scheduled or background jobs without owner approval.
15. Stack: TypeScript, Vite, PixiJS v8, Vitest.
16. Win condition: eliminate all bots. RC-8 (owner): a shrinking danger zone can end a run (zone death = loss); online, the last side standing wins.
17. Owner 2026-10-14 FINAL QA: the default game is YOU + 2 AI TEAMMATES vs bots (never confused with online 3v3); "Sign in" opens a sign-in sheet (Continue with Google / Continue with Wallet), never Settings; minimal UI copy.

## PROPOSALS (not approved)
- Class numbers, upgrades, rewards, revive timings, the ten signatures (`docs/design/power.md`). Hub, medals, tips. Deps: @neondatabase/serverless 1.1.0, dev @electric-sql/pglite 0.5.8, @noble/*.
- NFT-R1 layers (`docs/research/chog-genesis/IDENTITY-AND-MAPPING.md`). PROVISIONAL CHOG palette (`docs/BRAND.md`), zone tuning, operator art.
- All tuning numbers (roster, weapons, grenades), lean rules, art direction, the map, fonts.
- CF (H25): turn 720 deg/s, per-weapon run spread, wall muffle 0.8, dark 0.2, gait lamp, SPOTTED teammate marks (owner said "test whether"), the pillar map, Toad armour 55, Ray cone 52, LMG run 3.5. Lab switches A-F (`?lab`) for the owner's A/B.

## UNKNOWN (never guess)
- Chog Genesis art and name rights; `baseURI`, totalSupply read from chain; metadata hash check (`docs/research/chog-genesis/`).
- Owner access to Pixel 7 / iPhone 13. Chogathon submission deadline.
- Whether a real holder can sign in and play 5v5 (fake-chain holder passes locally).

## Implemented (EVIDENCE)
- CF (H25, live H26; H26 also fixed settlement, which had never worked in production): steady rule, turn cap, own-noise ring, typed heard marks, direction ticks, afterimages, SPOTTED, dark map, pillar map, feedback (confirm/kill/ready cues, bar ghosts, grenade aim preview), audible bots, ally roles; live-room hub, Enter with CHOG (eligibility then SIWE), loading checklist. `docs/ROOM_ZERO_CORE_FEEL_AUDIT.md`.
- GR (H24): free roster, grenades, department AI. QA (H23), MI (H22) and earlier: `docs/HANDOFFS.md`.

## Automated tests (EVIDENCE, Node 22.22)
Production smoke H26 (970c948, from a Vercel Sandbox): 31/31. CF (H25): `npx vitest run` 603/603 (604 at H26) (60 files), `tsc` clean. Browser (headless Chromium, emulated, local stack): cf-chog 18/18, qa-journey 38/38, qa-errors 7/7, master-ui 8/8, qa-screens clean, rc8-online 1v1+3v3 PASS, cf-visual 48 frames.

## Not performed (needs the owner)
- CF: any human play of the steady rule, turn cap, dark and sound (lab A/B), CF balance (Bill 33/40 solo), a real wallet through Enter with CHOG.
- Pixel 7 / iPhone 13, real-GPU FPS, audio by ear, hosted 5v5 with a holder and reconnect, a real holder, art rights in writing, the demo video.

## Gates
Core Feel Gate: BLOCKED on owner playtests (class numbers and now CF). G10: automated part PASS; playtest part not run.

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| CF | claude | claude/cf-core-feel | see H25 | Owner 2026-10-16 CORE FEEL + GAME UX | in production (H26); owner playtest (lab A/B) |
| GR | claude | ccr-e7fadb8f-qtochk | see H24 | Owner 2026-10-14 ROSTER + GRENADES | in production |
| RC-8 | claude | ccr-e7fadb8f-qtochk, PR #10 | see H16 | Owner RC-8 mandate | PR #10 not merged (stacked on #9; owner decides) |

## Handoffs
Latest: H26 (2026-10-16, claude -> owner; CF deployed, settlement fixed). History: `docs/HANDOFFS.md`.
