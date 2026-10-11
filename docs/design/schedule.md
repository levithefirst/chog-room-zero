# Schedule, Prototype 0, cut order

Status: the 14 day window, Day 7 prototype, Day 11 freeze, and Days 12 to 14 are LOCKED. The milestone order below is a PROPOSAL. Today's day number is UNKNOWN until the owner records a start date in STATE.

## Prototype 0 (LOCKED scope, first build)
One room with one wall. Movement. Aiming. One weapon. Travelling bullets. Bullet-wall collision. Wall-blocked vision. One enemy. Hit and death. Basic audio. Both control schemes (mobile and PC) so the owner can test on the Pixel 7 and iPhone 13.

Explicitly not in Prototype 0: NFT, wallet, database, server, extra rooms, extra bots, menus, progression.

Open questions to settle inside Prototype 0 (PROPOSAL, owner decides after playing): does the enemy shoot back, where does the vision cone point when the right stick is in its deadzone, how fast the body turns.

## Milestones (order matters more than day numbers)
1. Prototype 0 built, G8 baseline recorded on both phones.
2. Owner playtests on Pixel 7 and iPhone 13. Fix until the Core Feel Gate passes.
3. Only now: win condition and real room, full bot behavior set, ability, result screen.
4. Only now: NFT verification facts, binding, persistence, G10.
5. Day 7 target: playable prototype end to end.
6. Days 8 to 11: balance, bots, polish. Feature freeze after Day 11.
7. Days 12 to 14: fixes, mobile QA, recording, submission (see the submission checklist in `docs/GATES.md`).

Risk: because NFT work waits for the Core Feel Gate, a slow pass pushes the NFT identity work late. If the gate is not passed by about Day 4, start cutting from the list below instead of squeezing.

## Slip rule
When a day slips: name the failing gate and whether it is a feel problem (change the design or tuning) or a time problem (cut scope). Do not add days and do not hide the slip. Log the cut in STATE.

## Cut order (first cut first, PROPOSAL)
1. "Notable runs" and any history beyond rooms, wins, kills, deaths, best time
2. Leaderboard
3. Replay verification of scores
4. Any second bot variant
5. Killcam (keep the killer indicator)
6. Portrait mode polish
7. Second trait area for operators (keep one weapon trait, one vision trait, one ability)

Never cut: movement feel, vision, sound cues, death clarity, fast retry, a fun default operator.

## Hard stops
Every added system names an equal or larger cut, at any time. Feature freeze after Day 11. Nothing from the out-of-scope list (`docs/RULES.md` section 3) enters without the owner changing the locked rule first.
