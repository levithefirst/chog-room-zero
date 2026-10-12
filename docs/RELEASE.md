# Chog: Room Zero, release candidate RC-1

- **Branch:** `grokbot/rc-1` (PR base `grokbot/p1-follow-through`).
- **RC SHA:** the final commit of PR "RC-1: Chogathon release candidate". The SHA is recorded in the PR body, /workspace/reports/rc-acceptance.md and rc-ade-brief.md. This file can't contain its own commit hash.
- **RC-2 (targeted follow-up, owner task 2026-10-12 12:53 WAT):** commits after 6759d1f on the same branch/PR #9. The RC SHA is the PR head, recorded in /workspace/reports/rc2-ade-retest.md. Changes: resume/menu press never fires, ring-hint e2e setup, perception test timeout, debug-only autoplay, preview check tools.
- **RC-3 (release hardening, owner task 2026-10-12 "final finish-line"):** branch `ccr-e7fadb8f-qtochk`, based on `grokbot/rc-1` @ 43f5a5d (PR #9 head). The candidate SHA and its verified preview URL are in `docs/STATE.md` (RC-3 row) and handoff H11. Changes: only the menu press is swallowed after a menu (a resting move thumb no longer eats the first shot); the RC-1 Resume shot root cause pinned by a test; results accuracy per bullet (the shotgun read 369%); ring-hint e2e runs in a real desktop tab; README and submission draft.
- **Production:** still 969de1c. This RC is a preview only.

## What is in RC-1
- **Fairness:** a bot may only fire at, or damage, you from inside your own sight range (hero vision incl. sidegrade) with line of sight. The shooter is ringed on every hit, along with the damage arc.
- **Death screen:** every input waits 0.75 s plus a fresh press: Again, Change Chog, Enter/Space, keys 1-4, touch.
- **Movement:** corner assist slides off door-frame corners. A door that opened onto a wall was moved.
- **Difficulty:** bots aim 12° settling over 2 s, react in 0.40-0.65 s, and deal 60% damage. The scripted player wins with every hero (docs/design/bots.md).
- **Loop:** first-launch How to play; results with time, kills, accuracy, damage dealt and taken, and hero; personal bests per hero and overall (device only, guests included).
- **NFT DEMO:** a token number maps to one of 4 sidegrades plus a marking. DEMO badge at every entry point. No wallet, no ownership check.
- **Polish:** Space confirms menus; audio master limiter.

## Known limitations
- **Physical devices:** Pixel 7 and iPhone 13 are UNVERIFIED. All mobile checks are headless emulation.
- **Real NFT verification:** DEFERRED. Chain, contract, ownership method and metadata are UNKNOWN. The DEMO traits don't match any Chog art or metadata.
- **Chogathon gate:** the rules require the NFT to be essential. Today a Chog changes play style (sidegrade) and tracks device history, but the game plays fully without one. This is a judging risk.
- **Personal bests:** localStorage only. Lost if site data is cleared, and not shared across devices.
- **Difficulty:** tuned against a scripted player (Mop, Brick and Wick win 5-6 of 40, Kettle 25 of 40). Not tuned against human play.
- **Ring hint e2e:** fixed in RC-3. The flake was the test, not the game: once touch emulation is on, `(pointer: coarse)` stays true for the life of a headless tab, so the "desktop" setup still ran in touch mode with the aim pinned east. Section 4 now opens a fresh tab and proves desktop mode first. 20/20 under heavy load.
- **Wounded bots (known, not changed):** a bot below 50% health that sees you goes back to cover before it can fire, so a wounded bot never shoots again unless it heals; it shuffles between cover spots. Making it shoot again cut scripted Mop wins from 5/40 to 1/40, so it is a balance call for the owner after a human playtest.
- **Scripted stalls:** the autopilot can stall (about 3 in 40 Mop runs) by backing away from a bot it sees behind cover, pinned on a wall. A scripted-player limitation; humans flank. The game has no match timer.
- **Rear hits:** no pre-hit rear warning; only the damage arc plus the shooter ring.
- **Content:** one map and placeholder art (no Chog Genesis art used).

## Deferred vision
3 maps, 6 operators, 5 weapons, real Chog NFT verification (wallet signature, server-side ownership, token-bound history), and $CHOG integration (optional bonus; not designed).

## 60-90 s demo sequence
1. **0-10 s:** title; "How to play" card; Got it.
2. **10-20 s:** "Chog DEMO": point at the DEMO copy and trait table; pick #1 Lamp (badge on the title chip).
3. **20-30 s:** Enter; hero select (press 3 for Brick, 1 for Kettle); Deploy.
4. **30-60 s:** creep (Shift) past a door; gold rings when a bot moves; fire; a blocked shot on a crate (spark and clank); take a hit and see the arc and the ringed shooter; down a bot.
5. **60-75 s:** die or clear. Clicking during the summary does nothing; after 0.75 s, Again works.
6. **75-90 s:** results (time, kills, hits / bullets and accuracy, damage, best NEW, "saved on this device only"); back to the title, where the best is shown.

## RC-3 ADE retest brief (exact candidate only)
Give ADE: the candidate SHA and preview URL from `docs/STATE.md` (RC-3 row), and the files changed since 43f5a5d: `src/input/input.ts`, `src/sim/world.ts`, `src/main.ts`, `tests/rc3-input.test.ts`, `tests/rc3-accuracy.test.ts`, `tools/{rc3-input-probe,p1ft-e2e,p1ft-ring-repeat,rc-autoplay,rc-e2e}.mjs`, `README.md`, `docs/{SUBMISSION,RELEASE,STATE,HANDOFFS}.md`.
Report each as PASS, FAIL or UNVERIFIED, with the steps and what you saw:
1. PC: click Resume (short and long press). No shot. The next click fires.
2. PC: tap fire, then press Esc at once; resume with Esc. No shot on resume.
3. Phone: rest the left thumb on the screen during Deploy's loading bar. The first right-thumb push past the ring fires.
4. Phone: tap Resume, and tap Resume while holding the move stick. No shot; the next right push fires.
5. First click/push after Deploy fires (PC and phone).
6. Results as Brick: "Hits / bullets" and accuracy at or below 100%.
7. Death screen: clicks, taps, Enter, Space during the first 0.75 s do nothing; Again works after.
8. Win with any hero by hand: results, NEW best, best shown on the title after reload. (A human win is still UNVERIFIED.)
9. Wick bot far down a corridor never damages Brick from beyond Brick's sight; every hit rings the shooter.
10. Pixel 7 and iPhone 13: Deploy, move, aim, fire, pause/resume, rotate, background and return.
