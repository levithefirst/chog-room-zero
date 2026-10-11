# Chog: Room Zero - shared state

Source of truth for every agent. Rules: `docs/RULES.md`. Edit this file only in a handoff commit. Keep it under 8,000 characters (the session hook cuts off near 10,000); move old rows to `docs/HANDOFFS.md` or `docs/PLAYTESTS.md`.
Last verified: 2026-10-11 by claude.

## Snapshot (EVIDENCE)
- Repo: `levithefirst/chog-room-zero` (private). `git ls-remote origin` on 2026-10-11 returned no refs: the remote is empty. GitHub lists a push at 2026-10-07 13:56 UTC but no branch or commit exists. Unexplained.
- This branch: `setup/skill-system`. Base: none (first commit in the repo).
- Project start date, deadline, hackathon name and rules: UNKNOWN. Current project day: UNKNOWN. Do not guess it.
- Claude Code in the build environment: 2.1.296.

## LOCKED (owner decided; source: owner brief, 2026-10-07 and 2026-10-11)
1. Dark top-down tactical survival shooter, about 90 s rooms, mobile and PC, original IP, nothing copied from Bullet Echo.
2. 14 day window. Playable prototype by Day 7. Feature freeze after Day 11. Days 12 to 14: fixes, mobile QA, recording, submission.
3. Target $0 spend, $20 hard cap, spend only for a real blocker with owner approval.
4. Controls: mobile landscape, left thumb move, right thumb aim and fire outside the deadzone (stops inside it), ability button in right-thumb reach, no auto-fire on sight. PC: WASD, mouse aim, left click fire, Space ability.
5. Test devices: Pixel 7 and iPhone 13.
6. Projectiles travel visibly. Hitscan forbidden. Walls block bullets and vision. Real occlusion from wall geometry.
7. Movement has deliberate acceleration, turning, stopping.
8. Bots: patrol, investigate sound, detect, pursue, attack, reposition, disengage, lose target; use cover, hold angles, break line of sight; never just rush.
9. Anyone can play. Guest runs are disposable, no persistent history. Binding a Genesis NFT gives persistent identity and token history. Traits are fair sidegrades, never flat damage, health, or speed. Removal test applies, including persistence.
10. No NFT, wallet, or database work until the Core Feel Gate passes (both phones).
11. Bots, not real-time multiplayer. No custom contract. No $CHOG dependency. Wallet never required to play.
12. Out of scope: Railway worker, multiplayer, custom contract, paid inference, $CHOG economy, second map, second ability, loot chests, gear grid, clans, season pass.
13. Every added system names an equal or larger cut.
14. No scheduled or background jobs without explicit owner approval.

## PROPOSALS (need owner approval before they count)
- Stack: TypeScript, Vite, PixiJS, custom sim, Vercel, Neon, viem lazy loaded, GitHub (owner called it a starting proposal).
- Win condition: extraction (exit opens about 45 s). Not locked.
- Quiet walk (stick pressure on mobile, Shift on PC) as the loud/quiet choice.
- Vision shape (forward cone plus small circle), sound radii, all numbers in `docs/design/*`.
- Sound made in code (WebAudio) instead of recorded files.
- Operator set of about 6 to 9, built from metadata traits or a token-ID function.
- Leaderboard and replay verification (first in the cut order).
- Handoff and branch rules in `docs/RULES.md` sections 4 and 5, and the 12 gate criteria in `docs/GATES.md`.

## UNKNOWN (verify before use; never guess)
- Chog Genesis: chain, contract address, token standard, ownership read method, metadata and traits, art rights.
- Whether the owner has a Pixel 7 and iPhone 13 available.
- Hackathon name, deadline, rules, judging criteria.
- Whether the enemy in Prototype 0 shoots back; where the vision cone points when the right stick is idle; body turn rate.
- Relation of the public repo `levithefirst/chog-acc` to this game (not inspected).
- Raw text of the GrokBot audit (only the owner's summary was available).

## Implemented features (EVIDENCE)
None. The repo has no game code. Verified 2026-10-11: no files existed before this branch.

## Automated test results
None run. No code exists.

## Manual playtest results
None. Record as: `date | device | build hash | tester | gate | answers | verdict`.

## Gates (details and criteria: `docs/GATES.md`)
Core Feel Gate: BLOCKED (nothing built). It needs G1, G2, G3, G4, G6, G7 PASS, G8 baseline recorded, and the owner's playtest on both phones.

| Gate | Status | Human playtest needed | Evidence |
|---|---|---|---|
| G1 Movement | not started | yes | |
| G2 Combat | not started | yes | |
| G3 Vision | not started | yes | |
| G4 Audio | not started | yes | |
| G5 Bots | not started | yes | |
| G6 Mobile controls | not started | yes | |
| G7 PC controls | not started | yes | |
| G8 Performance | not started | partial | |
| G9 UX | not started | yes | |
| G10 NFT integration | blocked by Core Feel Gate | yes | |
| G11 Visual consistency | not started | yes | |
| G12 Final game feel | not started | yes | |

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| S1 | claude | setup/skill-system | `CLAUDE.md`, `GROKBOT.md`, `.claude/**`, `docs/**` | owner reviews the branch and merges or requests changes | ready for owner review |

## Next smallest task (PROPOSED, not started, needs owner OK and an assigned agent)
P0-1: scaffold the project and nothing else. Files: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/tuning.ts`. Done when: `npm run build` succeeds and a blank canvas loads on a phone. Needs the owner to confirm the stack proposal first. No game features.

## Scope and freeze
Out-of-scope list: LOCKED item 12. Feature freeze after Day 11 (day count starts when the owner records a start date here). Cut list so far: none. Cut order: `docs/design/schedule.md`.

## Handoffs
Latest: H1 (2026-10-11, claude -> owner). Full history: `docs/HANDOFFS.md`.
