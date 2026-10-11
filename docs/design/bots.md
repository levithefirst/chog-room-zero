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

## Perception
- Sight: its own cone blocked by walls, with a short ramp so the player can slip past the edge.
- Hearing: reads sound events within their radius, reduced by walls. Keeps heard positions with uncertainty.
- Last known position is all it chases after losing sight.

## Scope (PROPOSAL)
- Prototype 0 has exactly one enemy.
- Later: parameter sets over the same state machine (for example a holder that favors angles, a hunter that favors sound). If a new set needs a new state, cut the set.
- Active bots in the room: a small number (guess 3 to 5), set by the batch results and the phone baseline.

## Pathing
Coarse nav grid built at load. Path search with a cost cap. Re-path only when the goal changes meaningfully. A stuck timer forces a re-path, then a reposition.

## Testing
Headless batch sim against scripted dummy players: record time to first contact, stuck events, state coverage, cover use share, bot deaths. See G5 in `docs/GATES.md`. The owner then judges believability.
