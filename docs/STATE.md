# Chog: Room Zero - shared state

Source of truth for every agent. Rules: `docs/RULES.md`. Edit only in a handoff commit. Keep under 8,000 characters; move old rows to `docs/HANDOFFS.md`.
Last verified: 2026-10-12 by claude (RC-4).

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero` (private). Default/base branch `setup/skill-system` (LOCKED, owner 2026-10-11: no `main`). Never merge without the owner.
- Open PRs, stacked: #1 S2; #2 P0-1; #3 P0-2; #4 P1 MVP; #5 P2; #6 P0F; #7 P1F; #8 P1FT; #9 RC-1/RC-2 (head 43f5a5d). RC-3 and RC-4 are branch `ccr-e7fadb8f-qtochk` on top of #9 (no PR yet). Merge in order. #1 adds a skill-system README.md; RC-3 adds the game README.md (conflict to resolve at merge: keep the game README).
- Vercel project `chog-room-zero` (protection off). Production `chog-room-zero.vercel.app` = `dpl_96e1NN2ggi4XyoXP2WPrHtNJtgGG`, a CLI upload of 969de1c (P1 MVP; 11/11 deployed source files match, bundle index-BGFnHEXD.js), verified 2026-10-12. Promoting the RC-4 candidate needs the owner's yes; current state in the owner reply.
- Hackathon: Chogathon 2026 (chogathon.chog.xyz, read 2026-10-12 from a 2026-10-11 cache). Deliverables and weights in `docs/SUBMISSION.md`. Judges gate on "the Chog NFT must be essential". Deadline: UNKNOWN (the page says both Oct 11 13:00 UTC and Oct 9 15:00 UTC). Project start date: UNKNOWN.

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
- Owner access to Pixel 7 / iPhone 13. Chogathon submission deadline.

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

## Automated tests (EVIDENCE, Node 22.22, 4 cores; RC-4, bundle index-BYEZY6NN.js)
`npx vitest run` 267/267 (31 files). Headless Chrome (emulated; NOT devices) on the local build of the same bundle: rc4-matrix 12/12 viewports, rc-e2e 11/11, rc3-input-probe 6/6, p1ft-e2e 12/12 idle x2 (11/12 once under load: tutorial pill timing), ring 20/20 (load), rc2-preview-checks 4/4, rc-autoplay SCRIPTED wins: desktop all 4 heroes, 844x390 touch Kettle+Brick, 820x1180 touch Kettle+Mop. Details: H12.

## Not performed (needs the owner)
- Pixel 7 / iPhone 13 / any real tablet, real-GPU FPS, feel, fairness, audio by ear, a human win, the demo video, scripted browser checks against the live URL (this container cannot reach *.vercel.app; the bundle is matched by hash instead).

## Gates
Core Feel Gate: BLOCKED on owner playtests. G10 interface + mock only (BLOCKER: verified chain, contract, ownership method).

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| RC-3 | claude | ccr-e7fadb8f-qtochk | see H11 | release hardening | done (H11) |
| RC-4 | claude | ccr-e7fadb8f-qtochk (from d14587d) | `index.html`, `src/{main.ts,input/input.ts,ui/orientation.ts,render/{camera,render}.ts}`, `tests/{rc4-orientation,p1ft-ui}.test.ts`, `tools/{rc4-matrix,rc-autoplay}.mjs`, `README.md`, `docs/{DEV,RELEASE,STATE,HANDOFFS}.md` | Cross-device playable release (owner prompt 2026-10-12): desktop, tablet, phone; rotation lifecycle; verified preview; production if the owner approves | done; candidate = branch head at H12; preview + production state in the owner reply |

Done rows P1-RC-2 moved to `docs/HANDOFFS.md` (H11 trim note).


## Handoffs
Latest: H12 (2026-10-12, claude -> owner, ADE; RC-4). History: `docs/HANDOFFS.md`.
