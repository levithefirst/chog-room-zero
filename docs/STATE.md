# Chog: Room Zero - shared state

Source of truth for every agent. Rules: `docs/RULES.md`. Edit only in a handoff commit. Keep under 8,000 characters; move old rows to `docs/HANDOFFS.md`.
Last verified: 2026-10-12 by grokbot (P2).

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero` (private). Default/base branch `setup/skill-system` (LOCKED, owner 2026-10-11: no `main`). Never merge without the owner.
- Open PRs, stacked: #1 S2; #2 P0-1; #3 P0-2; #4 P1 MVP; P2 benchmark overhaul (base `grokbot/p1-mvp`). Merge in order.
- Vercel project `chog-room-zero`: preview deploys only by grokbot (protection off, owner 2026-10-12). One accidental production deploy from P1 exists; untouched.
- Project start date, deadline, hackathon rules: UNKNOWN.

## LOCKED (owner; 2026-10-07, 2026-10-11, 2026-10-12)
1. Dark top-down tactical survival shooter, ~90 s rooms, mobile and PC, original IP. Bullet Echo is a benchmark only (P2 mandate): nothing copied.
2. 14 days. Playable by Day 7. Freeze after Day 11. Days 12-14 fixes, QA, submission.
3. $0 target, $20 hard cap, owner approval per spend.
4. Controls: mobile landscape, left thumb move, right thumb aim and fire outside deadzone, ability in right-thumb reach, no auto-fire. PC: WASD, mouse aim, left click fire, Space ability.
5. Test devices: Pixel 7, iPhone 13.
6. Projectiles travel visibly, no hitscan. Walls block bullets and vision via real occlusion.
7. Movement has deliberate acceleration, turning, stopping.
8. Bots: patrol, investigate, detect, pursue, attack, reposition, disengage, lose target; cover, angles, break LOS; never just rush.
9. Anyone can play. Guest runs save nothing. Bound Genesis NFT = identity + token history. NFT sidegrades only, never flat damage, health, armour, or speed. (Heroes differ in speed/HP/armour; heroes are not NFT traits.)
10. NFT layer: interface + labelled mock only; no wallet, chain, or DB code (mandates 2026-10-12 02:56 and 04:09 WAT).
11. Bots, no multiplayer, no custom contract, no $CHOG dependency, wallet never required.
12. Out of scope: Railway worker, multiplayer, custom contract, paid inference, $CHOG economy, loot chests, gear grid, clans, season pass. Changed by P2 mandate (04:09 WAT): the map was replaced (still one map), 3-4 heroes with one ability each, pickups.
13. Every added system names an equal or larger cut.
14. No scheduled or background jobs without owner approval.
15. Stack: TypeScript, Vite, PixiJS v8, Vitest.
16. Win condition: eliminate all bots.

## PROPOSALS (not approved)
- Neon, viem: not installed. Vercel: preview hosting only.
- All tuning numbers, heroes, weapons, armour and lean rules (`docs/design/benchmark.md`), art direction, the map, the four sidegrades, the fonts.

## UNKNOWN (never guess)
- Chog Genesis chain, contract, standard, ownership method, metadata, art rights.
- Owner access to Pixel 7 / iPhone 13. Hackathon name, deadline, rules.

## Implemented (EVIDENCE: branch `grokbot/p2-benchmark-overhaul`, see H5 for SHA)
- Benchmark doc with cited facts vs assumptions, checklist, gap audit.
- Rendering: map baked once (procedural tile/concrete/metal/dock, grime, shadows, lit wall rims, doors, crates, barriers). Dim desaturated map always visible, fog on unexplored, lit map through soft + sharp cones with falloff and glow. Actors and bullets drawn only when the sim LOS says so; Ping shows outlines.
- 4 heroes (`src/config/heroes.ts`): Kettle rifle/Patch heal, Mop SMG/Slip dash, Brick shotgun/Slab barrier, Wick marksman/Ping sonar. Bots use the same table.
- Weapons (`src/config/weapons.ts`): damage, pellets, falloff, rate, spread, magazine + reserve, reload, armour-pen, cover pierce, own sound/tracer/muzzle.
- Armour soak rule, lean rule for half cover, health/armour/ammo pickups with respawn timers and labels.
- Bots: + health seeking, abilities, range-aware engage, fair sonar.
- Match flow table (`src/sim/match.ts`): title, hero select, loading, play, pause (freezes sim; auto on tab hide), recap, results.
- HUD: health/armour bars + numbers, weapon, ammo/reserve, reload ring, ability cooldown button, hostiles + pips, persisted mute, pause, safe-area insets, portrait prompt. Damage arc, hurt flash, low-HP vignette, hit/kill marks, toasts.
- Fonts: Barlow Condensed + IBM Plex Mono (OFL) in `public/fonts/`.

## Automated tests (EVIDENCE, Node 22)
See H5: ci, typecheck, 97 tests in 9 files, build. Headless Chrome 1280x720 + 844x390 touch + portrait: all states reached, console errors none. Sim 0.07 ms/step with 21 actors (Node).

## Not performed (needs the owner)
- Pixel 7 / iPhone 13 run, real-GPU FPS, feel, fairness, audio by ear.

## Gates
Core Feel Gate: BLOCKED on owner playtests. G10 interface + mock only (BLOCKER: verified chain, contract, ownership method).

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| P1 | grokbot | grokbot/p1-mvp | see H4 | MVP | done, awaiting owner review |
| P2 | grokbot | grokbot/p2-benchmark-overhaul (base `grokbot/p1-mvp`) | `src/**`, `tests/**`, `index.html`, `public/fonts/**`, `docs/design/{benchmark,art-direction}.md`, `docs/DEV.md`, `tools/browser-run.mjs`, `docs/STATE.md`, `docs/HANDOFFS.md` | benchmark overhaul phases A-F per owner mandate "COMPLETE BULLET ECHO BENCHMARK OVERHAUL" (chat, 2026-10-12 04:09 WAT); Node 22 ci/typecheck/test/build; browser run; preview deploy | done, awaiting owner review and playtest |
| P0F | grokbot | grokbot/p0-bugfix-sprint (base `grokbot/p2-benchmark-overhaul`) | `src/main.ts`, `src/input/{input,gate}.ts`, `src/render/{render,visibility}.ts`, `tests/p0fix*.test.ts`, `tools/p0fix-run.mjs`, `docs/STATE.md`, `docs/HANDOFFS.md` | P0 bug-fix sprint per owner task (chat, 2026-10-12 05:28 WAT) on ADE QA report: CHOG-VIS-001, FLOW-001, INPUT-001, HUD-001, FLOW-002 (+blur); rifle investigation; preview deploy | done, awaiting owner review |
| P1F | grokbot | grokbot/p1-fairness-readability (base `grokbot/p0-bugfix-sprint`) | `src/sim/{bots,world,level,vision,geom,cover}.ts`, `src/render/{render,lightmesh,bake,visibility}.ts`, `src/config/{tuning,weapons}.ts`, `src/main.ts`, `index.html`, `tests/{perception,p1f-combat,ttk,world}.test.ts`, `tools/p1f-shots.mjs`, `docs/design/{bots,cover,weapons-ttk}.md`, `docs/STATE.md`, `docs/HANDOFFS.md` | P1 fairness and readability sprint (owner task, chat 2026-10-12 05:50 WAT): one reveal rule, perception spec + tests, readability, snag/slab/cover/TTK, perf, preview | done, awaiting owner review |
| P1FT | grokbot | grokbot/p1-follow-through (base `grokbot/p1-fairness-readability`) | `src/main.ts`, `src/ui/{heroKeys,orientation}.ts`, `src/render/{labels,camera,render}.ts`, `src/sim/{world,bots,cover}.ts`, `src/config/{map,tuning,weapons}.ts`, `src/audio/audio.ts`, `tests/p1ft-*.test.ts`, `tools/p1ft-{e2e,shots}.mjs`, `docs/design/{bots,cover,weapons-ttk}.md`, `docs/{DEV,STATE,HANDOFFS}.md` | P1 follow-through (owner task, chat 2026-10-12 07:29 WAT): UI-001, AI-002, AI-001, HUD-002, DES-001, debug labels, MAP-001, shotgun duels, blocked feedback, rotation | done, awaiting owner review |

P2-F1: owner plays the preview on PC, Pixel 7, iPhone 13; grokbot fixes the top 3 reported issues.

## Handoffs
Latest: H7 (2026-10-12, grokbot -> owner, P1 fairness and readability sprint). History: `docs/HANDOFFS.md`.
