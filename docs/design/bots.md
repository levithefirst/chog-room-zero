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

Kill accounting (CHOG-AI-002, P1FT): no friendly fire for either team. Bullets pass through the shooter's teammates, so bots never eliminate each other and "Hostiles down" = player kills = eliminations. Tests: tests/p1ft-crossfire.test.ts.

## Fairness rule (RC-1)
A bot may only fire at, or damage, the player from a spot the player could see: within the player's effective sight distance (hero `vision.range` times the NFT sidegrade `rangeMul`) and with wall line of sight. A bot's own sight (Wick 12 m) never extends its attack range. Enforced twice: a fire gate in `bots.ts` (range = min(weapon reach, player sight - 0.25 m) plus `shotClear`) and a damage cap in `world.ts stepBullets` (a bot bullet whose origin is beyond the player's sight distance never damages the player). Walls are unchanged and nothing is revealed through walls. Every hit shows the damage arc toward the shooter and rings the shooter for the 0.7 s reveal window. Tests: `tests/rc-fairness.test.ts` (10 seeded long-range Wick encounters).

## Difficulty (RC-1, evidence)
Bots carry the hero weapons and health, so a 1v5 at parity was close to unwinnable. ADE never reached victory by hand. The scripted player (`tests/helpers/autopilot.ts`) only shoots what its own cone shows, with human aim error, and uses no ability tricks. Wins per 20 seeds at the old tuning: Kettle 8, Mop 0, Brick 0, Wick 1.

Lever sweep, wins over 4 heroes x 20 seeds (40 seeds for the last row):
- Aim 14 deg, settle 2.5 s, reaction 0.45-0.75 s or 1 attack token on their own: +0 to 2 wins. These are minor levers.
- Bot healing off: worse (bots stay in the fight).
- Dropping one bot: large gain (Kettle 15/20), but it changes the map design and the "five hostiles" premise.
- Chosen: aim 12 deg settling over 2 s, reaction 0.40-0.65 s, bot damage x0.6 (`TUNING.bots.damageMul`). Over 40 seeds: Kettle 25, Mop 5, Brick 5, Wick 6. Win times 26-78 s.

The bots stay dangerous: the scripted player still loses most runs as Mop, Brick and Wick. A human using doors, slabs and Ping should do better. Not verified by hand. `tests/rc-victory.test.ts` requires at least 2 wins in 40 for every hero. Weapon duels run at damage parity.

## AI teammates: the default game (owner 2026-10-14 final QA pass)
The default mode ("Vs bots" in the hub) is YOU + 2 AI TEAMMATES against the five hostile bots. It is not online 3v3 (that is three real players a side). Teammates are real actors in the simulation (`createWorld({ allies })`, team `player`, `Actor.ai = true`) driven by the same brain as the hostiles (`src/sim/bots.ts`):
- Perception is unchanged and symmetric: a bot's target is the nearest hostile it actually sees in its own cone (a downed one last), or a position it heard, saw a muzzle flash at, was shot from, or pinged. It never reads a hostile's position by identity.
- Teammates follow the player (a couple of metres off one side) when nothing is known, engage, take cover, heal, use their ability, and never wait for attack tokens (tokens only throttle the hostiles shooting at the player's side). Their bullets carry the same bot damage scale as the hostiles (`TUNING.bots.damageMul` 0.6, PROPOSAL), so the player stays the one who carries the room.
- Team rules: no friendly fire; the fairness rule protects every member of the player's side (a hostile bullet from beyond its target's own sight distance does no damage); the player's side can be downed and revived (TUNING.revive); hostile bots are always eliminated, never downed.
- A teammate rescues a downed teammate (the player included) when no hostile is in sight: it walks to them and holds fire for the 3 s revive.
- Team vision: a hostile any standing teammate sees is drawn for the player (their cone, their line of sight; nothing through walls).
- Outcome: the side wins when all five hostiles are down (anyone's kills count); the run ends when the player is eliminated (bled out, or the whole side down).
Evidence: `tests/qa-allies.test.ts` (spawn, follow, 8 real matches with the scripted player: teammates shoot, deal and take damage, kill, win; no friendly fire; the player downed and revived by an AI teammate; alone means eliminated). Browser: `tools/qa-journey.mjs` step 6.
