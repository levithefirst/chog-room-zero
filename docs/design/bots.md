# Bots

Status: the required behaviors are LOCKED (owner brief). Everything else is a PROPOSAL.

Simple and believable beats complicated and stupid.

## Required behaviors (LOCKED)
Patrol, investigate sounds, detect targets, pursue, attack, reposition, disengage, lose the target. Plus: use cover, hold angles, break line of sight. Bots must not simply rush the player.

## Fairness (PROPOSAL, strongly recommended)
- Same vision, hearing, speed, and projectile rules as the player. No wallhacks, no aim snap, no reading player input.
- Difficulty comes from reaction time, aim spread, and aggression, not cheating.
- Every dangerous action has a telegraph the player can notice.
- If a bot reacts, the player must be able to point to why (it heard a shot, it saw the light).

## States (one small state machine, parameterized)
1. Patrol: short route or hold an angle.
2. Investigate: a sound event in hearing range sends it to check the spot.
3. Detect: target in view, short reaction delay before committing.
4. Pursue: move toward the last known position (not the real one).
5. Attack: fire with spread, peek from cover instead of standing still.
6. Reposition: after losing line of sight or taking damage, move to cover or a new angle.
7. Disengage: low health or lost advantage, back off.
8. Search and lose: go to the last known spot, search a few seconds, return to patrol. Memory expires.

Cover and angles (how "use cover" becomes testable): the room data marks cover points and angle-holding spots. Attack and reposition choose among them. Gate G5 measures how often engagements use them.

## Perception spec (IMPLEMENTED, P1F; numbers in `src/config/tuning.ts` -> `perception`, `vision`, `sound`)
Rule zero: a bot only knows what a player in its place could know. Every belief update is logged
(`World.perceptionLog`, `?debug` overlay) with its source, and `tests/perception.test.ts` checks every acquisition
in a full scripted match is backed by a real signal (no omniscience).

| Source | Trigger (same rule the player gets) | What the bot learns | Suspicion |
|---|---|---|---|
| `seen` | target inside its cone (hero `coneDeg`, `range`) or within `nearRadius` 1.6 u, AND wall LOS (`canSee`). Crates/slabs never block sight | exact position | 1.0 |
| `flash` | target fired and the muzzle is in wall LOS (`muzzleFlashSeen`), any range, outside the cone too | exact shooter position | 0.9 |
| `heard` | sound within its radius; radius x`wallFactor` 0.6 when a wall is in between (`hears`). Run step 8 u, creep step 3 u, standing 0, gunfire 22 u | position + jitter (`hearErrorShare` 15% of distance) | 0.6 |
| `shot` | it was hit | DIRECTION only: a point along the incoming ray, +-`shotDirErrorDeg` 20 deg, range x0.6-1.4 | 0.8 |
| `sonar` | the Wick Ping ability pulse (same as the player's) | exact position for the pulse | 1.0 |
| `memory` | no new signal | keeps the believed position; suspicion decays to 0 over `memorySeconds` 6 s, then it searches and returns to patrol | decays |

THE reveal rule (one rule, symmetric): **a muzzle flash in wall line of sight reveals the shooter for
`flashSeconds` 0.7 s, at any range, for both sides. Being hit reveals only the direction.** The player sees a bot
that fires at them from outside the cone (ringed); a bot learns `flash` from the player's shots the same way.
(Replaces P0F's "0.9 s after a hit / 0.5 s within 8 u" rule, which had an arbitrary cut-off and no bot twin.)

Reaction: on a new acquisition a bot waits a seeded `reactionMin..reactionMax` = 250-450 ms before firing.
Aim: error starts wide and converges while the target stays seen; it aims at the current position (no lead).
Attack tokens: at most `attackTokens` = 2 bots fire at the player at once. Without a token a bot holds its angle
(no fire) or, if a flanker, moves to a flank. Tokens are released on leaving engage or on death.
Repath throttle: a bot re-plans at most every `repathSeconds` 0.35 s unless its goal moves `repathDistance` 1.5 u;
Brick slabs mark nav tiles blocked (`Level.dyn`) and invalidate every path.

Debug overlay (`?debug`; `&nooverlay` hides it): per bot name, state, `[T]` token holder (gold ring), source,
suspicion %, a line to the believed position coloured by source (seen red, flash amber, heard blue, shot orange,
sonar green, memory grey), and its cone edges.

Tests (`tests/perception.test.ts`): vision visible / hidden behind wall; hearing running heard, creeping not heard,
still silent; gunfire LOS flash outside the cone, occluded gunfire not revealed, direction-only shot; reaction
seeded range, no shot before the delay; attack-token cap; no omniscience over a full match.
