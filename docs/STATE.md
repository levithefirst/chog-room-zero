# Chog: Room Zero - shared state

Source of truth for every agent. Rules: `docs/RULES.md`. Edit only in a handoff commit. Keep under 8,000 characters; move old rows to `docs/HANDOFFS.md`.
Last verified: 2026-10-12 by grokbot.

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero` (private). Default/base branch `setup/skill-system` (LOCKED, owner 2026-10-11: no `main`). Never merge without the owner.
- Open PRs, stacked: #1 S2 README; #2 P0-1 scaffold; #3 P0-2 movement (base P0-1); P1 MVP (base P0-2). Merge in order.
- Project start date, deadline, hackathon rules: UNKNOWN. Current day: UNKNOWN.

## LOCKED (owner; 2026-10-07, 2026-10-11, 2026-10-12)
1. Dark top-down tactical survival shooter, ~90 s rooms, mobile and PC, original IP, nothing from Bullet Echo.
2. 14 days. Playable by Day 7. Freeze after Day 11. Days 12-14 fixes, QA, submission.
3. $0 target, $20 hard cap, owner approval per spend.
4. Controls: mobile landscape, left thumb move, right thumb aim and fire outside deadzone, ability in right-thumb reach, no auto-fire. PC: WASD, mouse aim, left click fire, Space ability.
5. Test devices: Pixel 7, iPhone 13.
6. Projectiles travel visibly, no hitscan. Walls block bullets and vision via real occlusion.
7. Movement has deliberate acceleration, turning, stopping.
8. Bots: patrol, investigate, detect, pursue, attack, reposition, disengage, lose target; cover, angles, break LOS; never just rush.
9. Anyone can play. Guest runs save nothing. Bound Genesis NFT = persistent identity + token history. Sidegrades only, never flat damage, health, or speed. Removal test applies.
10. ~~No NFT/wallet/DB work before the Core Feel Gate.~~ Changed by owner mandate 2026-10-12 02:56 WAT: NFT layer authorized now. Built as interface + mock only; no wallet, chain, or DB code.
11. Bots, no multiplayer, no custom contract, no $CHOG dependency, wallet never required.
12. Out of scope: Railway worker, multiplayer, custom contract, paid inference, $CHOG economy, second map, second ability, loot chests, gear grid, clans, season pass.
13. Every added system names an equal or larger cut.
14. No scheduled or background jobs without owner approval.
15. Stack: TypeScript, Vite, PixiJS v8, Vitest (owner 2026-10-11 21:17 WAT).
16. Win condition: eliminate all bots (owner mandate 2026-10-12 02:56 WAT).

## PROPOSALS (not approved)
- Vercel, Neon, viem: not installed. viem waits for a real ownership read (contract UNKNOWN).
- All tuning numbers, the art direction (`docs/design/art-direction.md`), the map layout, the four sidegrades, quiet walk (Shift / half stick).
- Mandate example "faster move, smaller mag" was not used: it breaks LOCKED 9 (no speed edge). Sidegrades trade vision shape or weapon rhythm.

## UNKNOWN (never guess)
- Chog Genesis chain, contract, standard, ownership method, metadata, art rights.
- Owner access to Pixel 7 / iPhone 13. Hackathon name, deadline, rules.
- One ability (LOCKED 4 mentions Space): not designed or built.

## Implemented (EVIDENCE: branch `grokbot/p1-mvp` @ `b25bac0`)
- Room Zero 40x24 tile map (`src/config/map.ts`): walls, half cover, two long sightlines, a loop. Circle-vs-box collision with sliding.
- PC aim (mouse) and touch twin-stick (floating sticks, fire outside a 35% ring). Barrel shows facing. P0-2 movement values unchanged.
- Weapon: magazine, reload, spread (+3 deg while running) shown by crosshair gap / touch wedge; 30 u/s travelling bullets, swept vs walls, cover, bodies.
- Vision: visibility polygon raycast against wall segments is the light mask; remembered tiles dim; hostiles and bullets outside sight not drawn (`canSee`, `pointInPolygon`).
- Sound bus feeds WebAudio synthesis (pan, distance, wall muffle), bot hearing, heard rings, and edge wedges.
- 5 bots, one state machine: patrol, investigate, alert (0.4 s telegraph), engage, cover, pursue (2 flankers), search. Same rules, HP, damage as the player.
- Health 100, 34 damage. Death recap: killer revealed, shot line, distance and direction, 1.2 s freeze, summary, R/tap restart. Win: all bots down. Title + fading hint.
- NFT: `OwnershipAdapter`, guest default, dev mock (`?mockChog=`), placeholder config (null chain/contract). 4 sidegrades via `operatorFor`. Bound runs only write token history to localStorage.

## Automated tests (EVIDENCE, Node 22.23.3)
`npm ci` 0; `npm run typecheck` 0; `npm test` 60/60 (6 files: movement, input, world/collision/projectiles/sight/perception/determinism, bot batch, operator balance, NFT fallback/history); `npm run build` 0 (main chunk 282 kB, 86 kB gzip).

## Browser run (EVIDENCE, headless Chrome swiftshader, `tools/browser-run.mjs`)
Console errors: none (dev and preview). Bot behind wall at 4 u in cone: 0 bots drawn; through door gap: 1. Recap, win, 844x390 touch run OK. Software-render FPS ~29 idle, ~28 with ~150 bullets (not phone evidence). Shots: `/workspace/shots/p1-*.png` (box only).

## Not performed (needs the owner)
- Phone run on Pixel 7 / iPhone 13: NOT PERFORMED (steps in `docs/DEV.md`).
- Feel, fairness, run length, audio by ear: NOT JUDGED. Owner playtest questions in `docs/DEV.md`.
- G8 baseline on phones: NOT RECORDED.

## Gates
Core Feel Gate: BLOCKED on owner playtests. G1-G7, G9, G11, G12 built, awaiting playtest. G8 not recorded. G10 interface + mock only (BLOCKER: verified chain, contract, ownership method; server verification for a DB).

## Current task
S1, P0-1, P0-2: see HANDOFFS H1-H3.

| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| P1 | grokbot | grokbot/p1-mvp (base `grokbot/p0-2-pc-movement`) | `src/**`, `tests/**`, `index.html`, `public/favicon.svg`, `docs/design/art-direction.md`, `docs/DEV.md`, `tools/browser-run.mjs`, `docs/STATE.md`, `docs/HANDOFFS.md` | full MVP per owner mandate; Node 22 ci/typecheck/test/build pass; scripted browser run | done, awaiting owner review and playtest (mandate 2026-10-12 02:56 WAT) |

## Next smallest task (PROPOSED)
P1-F1: owner playtest on PC and both phones; grokbot fixes the top 3 reported issues. Files: decided by the reports.

## Handoffs
Latest: H4 (2026-10-12, grokbot -> owner, P1). History: `docs/HANDOFFS.md`.
