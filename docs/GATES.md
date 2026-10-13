# Quality gates

Twelve gates. Each has automated checks (an agent can run and show output) and, where marked, a human playtest (only the owner can pass it).

How to use:
- Run only the gates your change touches (map at the bottom). Do not run all twelve every day.
- Record results in `docs/STATE.md`: gate status, evidence (command and result, or playtest record), build commit hash.
- A gate with a human playtest stays BLOCKED until the owner answers. Agents never mark a human half as passed.
- All numbers below are PROVISIONAL. They are starting guesses. G8 sets a real device baseline first, then the owner approves final numbers and they replace these.
- Test devices (LOCKED by owner): Pixel 7 and iPhone 13, plus one desktop browser. Whether the owner has both in hand is UNKNOWN until STATE says so.

Playtest record format (copy into STATE, Manual playtest results):
`date | device | build hash | tester | gate | questions asked | answers | verdict`

## Core Feel Gate (blocks switching on NFT combat power for real holders)

Passes only when G1, G2, G3, G4, G6, G7 are PASS, the G8 baseline is recorded, and the owner has played the combat prototype on BOTH the Pixel 7 and the iPhone 13. Until then the server flag `NFT_COMBAT` stays off in production, so verified holders get identity, history and 5v5 access but no starting-power advantage. Accounts, the database and ownership verification may be built before the gate (owner 2026-10-13). Agents never mark the human half passed.

## G1 Movement. Human playtest: YES (phones + PC)

Automated:
- Speed reaches 95% of max within the tuned accel time and drops to 0 within the tuned stop time (unit test on the sim, report both times).
- Turning follows the tuned turn behavior (test: the facing change per tick never exceeds the limit, if a limit is used).
- Sim state after 600 ticks is identical whether render ran at 30, 60, or 120 fps (hash compare).
- Walking along every wall and corner of the room never snags (scripted run, zero stuck ticks).
Playtest questions: Can you stop exactly where you mean to? Does turning feel deliberate, not floaty and not snappy? Is the camera ever surprising?
Pass: all automated pass and the owner accepts each question on each device.

## G2 Combat. Human playtest: YES

Automated:
- Firing creates a projectile entity that moves each tick. No hitscan path exists (test: a target 20 units away is not hit on the tick of firing).
- A projectile never passes through a wall at max speed, including thin walls (swept collision test).
- Hit applies damage; zero health triggers death; a dead entity stops acting.
- Hit-direction indicator angle is within 10 degrees of the true source for 8 test angles.
- Death records killer, direction, and the last sound events.
Playtest questions: Does a hit feel like it landed? Do you always know why you died? Is the game hard without feeling cheap?
Pass: automated pass and the owner can explain 10 deaths in a row.

## G3 Vision. Human playtest: YES

Automated (fixtures built from real wall geometry):
- A point directly behind a wall is not visible. A point in the open inside the range is visible.
- Corner cases: wall corner peek, thin wall, door gap, diagonal wall join. No light leaks through seams.
- Enemies outside visibility are not drawn (test on the draw list).
- The visibility shape is computed from the room's wall segments (test: moving a wall changes it).
- Cost of the visibility pass is measured on both phones and recorded (no pass/fail until the G8 baseline exists).
Playtest questions: Can you always tell what you can and cannot see? Does peeking a corner feel like a choice?
Pass: automated pass and the owner can describe the vision rules back after two minutes.

## G4 Audio. Human playtest: YES (headphones)

Automated:
- Every sound is triggered by a sim event with a position (no sound without a source event).
- Pan and volume functions return correct values for 8 source directions and 3 distances (unit test). A wall between source and listener lowers volume.
- Audio starts after the first touch on iPhone 13 Safari and Pixel 7 Chrome (manual device check, record result).
- The game is playable with sound off because key sound info also has a visual cue (owner checks).
Playtest questions: Can you point to where a shot came from? Can you tell shots, steps, and hits apart by ear?
Pass: automated pass and the owner locates direction correctly in 8 of 10 blind trials (proposal, owner may change).

## G5 Bots. Human playtest: YES

Automated (headless batch of at least 200 rooms with scripted dummy players):
- Zero bots stuck for more than 3 seconds.
- Every state (patrol, investigate, detect, pursue or attack, reposition, search, lose target) is entered at least once.
- No bot reacts to a player it could not see or hear (assert in the sim).
- In engagements, bots use cover or hold an angle in at least a tuned share of cases (set the number from the first batch; report it).
- Time to first contact is inside the tuned window.
Playtest questions: Did a bot ever seem to know something it should not? Did any feel dumb in a boring way? Could you bait one with sound?
Pass: automated pass and the owner names at least 3 distinct bot behaviors, none unfair.

## G6 Mobile controls. Human playtest: YES (Pixel 7 and iPhone 13)

Automated:
- Input mapping test: firing is true if and only if the right stick is outside the aim deadzone; it turns false when the stick returns inside.
- With an enemy in view and the right stick idle, zero projectiles in 10 simulated seconds (no auto-fire on sight).
- Three simultaneous touches are tracked by pointer id. No page scroll, zoom, long-press menu, or text selection (check on both phones).
- Layout is landscape. The ability button is inside the right-thumb reach zone (record measured position on both screens).
Playtest questions: Did your thumb ever slip? Can you reach every control without shifting your grip? Does it feel made for a phone?
Pass: automated pass and the owner plays a full room on each phone with no control complaint.

## G7 PC controls. Human playtest: YES

Automated:
- WASD moves, mouse sets aim, left click fires, Space uses the ability (input mapping tests).
- Focus loss pauses the game.
Playtest questions: Does the aim feel attached to your hand? Any input lag you can notice?
Pass: automated pass and the owner plays a full room with no complaint.

## G8 Performance. Human playtest: partial (hitches only)

Step 1, baseline (needed before the Core Feel Gate): run a scripted 3 minute session on the Pixel 7 and iPhone 13. Record frame time p50, p95, p99, count of frames over 20 ms, and load time. Commit the numbers to STATE.
Step 2: the owner approves frame and load budgets from the baseline. Only then are they hard requirements.
Later automated: re-run the session after each large change and compare to the budget; heap size flat over 10 rooms.
Pass: numbers recorded and inside the approved budget; the owner notices no hitches.

## G9 UX. Human playtest: YES (new players)

Automated:
- Steps from page load to controlling the character is at most 2 taps or clicks (count them).
- The HUD shows only the allowed items (health, ability cooldown, timer, objective hint).
- Error states (no wallet, RPC down, signature rejected, offline) show a plain message and leave the game playable.
Playtest: give the build to 3 to 5 people who have not seen it and say nothing. Record how many move, aim, and shoot correctly within 30 seconds, and how many retry after dying.
Pass: most new players play correctly within 30 seconds and retry willingly.

## G10 NFT integration and class system. Human playtest: YES. Combat power for real holders stays off until the Core Feel Gate passes.

Automated:
- Removal test table is complete for every NFT-linked mechanic (`docs/design/nft.md`).
- Every tier, upgrade and 1:1 signature profile matches `src/config/power.ts`, is ordered free < Common < Uncommon < Rare < Epic < Legendary, and stays inside the caps in `docs/design/power.md` (property test). Movement speed is never changed by tier.
- Measured duel win shares for each tier against a free player sit inside the bands in `power.md` (seeded sim test).
- A guest run writes nothing (test). A settled match writes exactly one result per player and one token-history row per bound token, and settling twice changes nothing (test).
- Ownership is verified on the server with `tokensOfOwner` / `metadataId` on Monad 143 (record evidence). A forged, expired, replayed or demo ticket cannot enter the verified 5v5 queue (server test).
- With the RPC or database down, solo, 1v1 and 3v3 still work and NFT benefits fail closed.
Playtest questions: Can you tell at a glance which operators are stronger and why? Is a fight against a higher tier still worth taking? Does a 1:1 signature read clearly before it hits?
Pass: automated pass and the owner answers yes to all three after playing.

## G11 Visual consistency. Human playtest: YES

Automated: colors used in game code are a subset of the Visual Bible palette (script or manual list); no item from the banned list in `docs/design/visual-identity.md`; grayscale screenshot and 50 percent size screenshot saved as evidence.
Playtest questions: Does it look like one game with one point of view? Does anything look stock or generated?
Pass: automated pass and the owner points to nothing out of place.

## G12 Final game feel. Human playtest: YES

Automated: G1 to G11 are PASS on the latest build hash; 10 runs in a row on each device with no crash or stuck state; retry from death to playing is under the tuned time.
Playtest: play 10 minutes without stopping, then answer: Did you want one more run? Best moment? Worst moment? First thing to change?
Pass: the owner chooses "one more run" at least 3 times in a row and names a best moment.

## Which changes reopen which gates

| Change | Re-run |
|---|---|
| Input, camera, speed, turning | G1, G6, G7, G12 |
| Weapons, projectiles, damage, death | G2, G5, G12 |
| Walls, rooms, visibility | G3, G5, G8, G11 |
| Sounds | G4, G5 |
| Bot code | G5, G2 |
| HUD, screens | G6, G7, G9, G11 |
| Operators, NFT, persistence | G10, G2, G9 |
| Art, effects | G11, G8 |
| Hot loop code | G8 |

## Submission checklist (not a gate)

Before the deadline (UNKNOWN until the owner records it in STATE): deployed URL loads cold on both phones and desktop; recording captured with sound; README and submission text match what is built; no secrets in the repo; hackathon rules re-read against the build.
