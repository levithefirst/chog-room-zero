---
name: chog-gate-review
description: Use after changing a major system in Chog: Room Zero (movement, combat, vision, audio, bots, mobile or PC controls, performance, UX, NFT integration, visuals), before a handoff that claims a gate passes, and when asked whether the game is ready. Runs the gates in docs/GATES.md with measured evidence and a specific owner playtest.
---

# Chog Gate Review

The gates, their automated checks, and which need a human playtest are in `docs/GATES.md`. Read it now if it is not in context.

## Procedure
1. Use the "Which changes reopen which gates" table. Run only those gates.
2. Run each automated check. Show the exact command and its real result. A check you could not run is "not run", never "pass".
3. For gates with a human playtest, write 3 to 5 questions and exact things to try, from the gate's list. Status stays BLOCKED until the owner answers. You never mark the human half passed.
4. Report:
```
GATE <id> <name>   build <hash>
AUTOMATED   <check: result> ...
PLAYTEST    <questions for the owner, or the owner's recorded answers with date and device>
VERDICT     PASS / FAIL / BLOCKED (waiting on owner)
IF FAIL     <the one most valuable fix, and whether it is a feel problem or a time problem>
```
5. Record status and evidence in `docs/STATE.md` (gate table, test results, playtest results) in the handoff commit.

## Core Feel Gate
Before anything NFT, wallet, or database: G1, G2, G3, G4, G6, G7 PASS, G8 baseline recorded, owner playtest on the Pixel 7 and iPhone 13. If asked to start NFT work earlier, refuse and cite the rule.

## Honesty
Green tests do not pass a feel gate. If the owner has not played the build since the last relevant change, the playtest is BLOCKED. Numbers in GATES.md are provisional until the G8 baseline is approved. If measurements miss a provisional target but the owner says it feels right, record both and keep the owner's call.

## Do not
Run all twelve gates daily. Invent thresholds that are not in the doc without saying they are your proposal. Count a gate passed from a summary; look at the evidence.
