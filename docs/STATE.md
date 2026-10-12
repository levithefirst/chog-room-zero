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

## Current task
S1, P0-1, P0-2: see HANDOFFS H1-H3 (P0-1, P0-2 done, PRs open).

| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| P1 | grokbot | grokbot/p1-mvp (base `grokbot/p0-2-pc-movement`) | `src/**`, `tests/**`, `index.html`, `public/favicon.svg`, `docs/design/art-direction.md`, `docs/DEV.md`, `tools/browser-run.mjs`, `docs/STATE.md`, `docs/HANDOFFS.md` | full MVP per owner mandate; Node 22 ci/typecheck/test/build pass; scripted browser run | approved, in progress (owner mandate 2026-10-12 02:56 WAT) |

## Handoffs
Latest: H3. History: `docs/HANDOFFS.md`.
