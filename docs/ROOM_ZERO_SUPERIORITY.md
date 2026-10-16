# Room Zero superiority build (SB)

Owner task 2026-10-16 "SUPERIORITY BUILD". Branch `claude/sb-superiority` from `159b421` (production at H26). Not deployed.
Every number names how it was measured. Autopilot numbers find systemic problems and regressions; they are not human
play (the autopilot navigates with perfect knowledge and never uses information). Feel is the owner's playtest.

## The ten weaknesses, by player impact (all found in the code at 159b421)

| # | Weakness | Evidence at 159b421 | Done |
|---|---|---|---|
| 1 | Information was a pile of one-shot effects: a ring per sound (1.4 s), a direction tick (1.1 s), a 1.6 s afterimage, SPOTTED marks. No belief per hostile, no confidence, no precision, no decay rule. | `main.ts afterStep`, `render.ts` ghosts/spotted/dirTicks | Contact intel model |
| 2 | AI teammates were silent and shared nothing: no call-outs, never acted on what another saw or heard. | `bots.ts` (no comms) | Call-outs + covering |
| 3 | Bill won 33 of 40 solo runs (next best 8): one sawn-off shell (162) took any hero but Tonashiro to zero, faster than a reaction. | `tests/rc-victory.test.ts`, lever-by-lever runs below | Readable TTK |
| 4 | Deaths were not explained: the recap said who and where, never why. | `main.ts showRecap` | Death insight |
| 5 | Online, your own operator moved a full round trip after the stick (150 / 267 / 433 ms at 80 / 200 / 350 ms RTT). | `client.ts update` (newest server state, nudged) | Prediction |
| 6 | Online, hiding the page (a call, an app switch) left your last input held: the render loop stops, so the release never went out. | `main.ts visibilitychange` | Release on hide |
| 7 | Matchmaking ignored skill and power: oldest-first fill. | `room.ts tryMatch` | Rating band |
| 8 | In a busy fight the 24-voice cap dropped gunshots and your hurt cue like footsteps. | `audio.ts play` | Priority voices |
| 9 | No way to read real-device numbers in a playtest (frame time, load, network, what the match was like). | none | `?perf` + telemetry |
| 10 | The tip pill sat over the DOWN headline on phones; the new systems had no first-meeting tip. | owner report, `main.ts showRecap` | Fixed + 2 tips |

## What changed

**Contact intel** (`src/sim/intel.ts`, `TUNING.intel`). One belief per hostile for the player: state (visible, partial,
last known, heard, directional, suspected, lost), source (sight, flash, ping, teammate, call-out, sound), estimate,
uncertainty radius, confidence, age. A weaker report never overwrites a fresher, more precise one. Out of sight a
sighting becomes LAST KNOWN where it was; its circle grows at 2 u/s (where it could be by now) and it fades over 6 s.
A heard spot is off by a share of the distance (a shot sharp, a creep step vague); through a wall only a bearing and a
distance band. Each belief fades from its own confidence over its source's lifetime. Deterministic (no Math.random).
The renderer draws ONE mark per hostile (red dotted ring = where it could be; footprints keep a short trail). The lab
now measures the ladder through the model the game draws.

**Call-outs** (`bots.ts callOut / hearCalls`, `TUNING.comms`, `src/ui/comms.ts`). Teammates say what THEY perceive:
"Contact, north." "Behind us!" "Lost him. Heading west." "Footsteps, east." "Shots, south." "Reloading!" "I'm hit, cover
me!" One voice at a time (2.2 s), each kind rests per teammate, heard calls are skipped when you stand beside the
caller. A heard or lost call makes the others point their lamps at it; a seen contact stays the caller's (everyone keeps
their arc). A call becomes your bounded contact (the caller's error plus distance), never a live body. Line above the
caller, a squelch from its side.

**Readable TTK** (`weapons.ts` sawn-off 18 -> 9 per pellet, spread 8 -> 5.5). No shell kills from full health; the second
shell is the kill, 0.25 s later.

**Death insight** (`src/sim/insight.ts`). From the last 6 s of your own record: blindside (and how they found you:
your steps, your muzzle flash, their Ping), outnumbered, firing on the run, caught reloading, out-ranged with a shotgun,
warned but facing away, a grenade ring. At most two, in plain words with what to do. Solo and online.

**Prediction** (`src/net/predict.ts`, `world.ts moveBody`). The server's movement rule, extracted into one function,
runs on your own operator from your inputs; each snapshot says the newest input it had (`ack`) and how many steps it
applied it (`as`); the client replays the rest and blends any difference over 0.1 s. Protocol fields are optional.

**Also**: `OnlineSession.release` on hide/blur/pagehide; rating-band matchmaking (strength = rating + its tier's power
offset, band 150 + 20 per second waited, team means balanced in 3v3/5v5, new accounts rated no higher than 1000, private
codes untouched; rating rides in the signed ticket); audio priority voices; `?perf` overlay and on-device telemetry;
the death screen clears the tip; tips for a first call-out and a first lost contact.

## Before -> after (EVIDENCE)

| Metric (how) | 159b421 | SB |
|---|---|---|
| Solo 1v5 wins of 40 per hero (rc-victory) | Benja 8, Toad 3, Ray 2, Tabsu 2, Tonashiro 6, Yot 4, **Bill 33** | 8, 3, 2, 2, 6, 4, **Bill 8** |
| Default game (you + 2) wins of 20 per hero (scratch compare, both trees) | Bill 19, others 12-15, total 101/140 | Bill 15, others 9-15, total 95/140 |
| Bill levers (40 seeds): shell gap 0.45 s / speed 1.0 / no Rush / 9 u lamp / uniform fairness reach / dmg 12-15 | 30 / 24 / 30 / 26 / 31 / 16-21 | the one-shot was the cause |
| Ladder middle / contacts announced first (cf-lab D, 24 seeds) | 0.069 / 0.466 (pre-CF game) | 0.163 / 0.641 |
| Live-body share of hostile time (cf-lab E) | 0.176 (pre-CF) | 0.111 |
| Drawn circle holds the hostile: heard / last known / direction (sb-lab, 16 seeds) | no model | 0.98 / 0.67 / 1.0 |
| Call-outs per minute / sightings called first / covering teammates (sb-comms, 16 seeds) | 0 / 0 / - | 9.2 / 0.265 / 100% of 5 |
| Every call backed by the caller's own perception log; every call belief by a call | - | 104 of 104 calls audited |
| Autopilot wins, calls on vs off (40+40 seeds x 7 heroes) | - | 380 vs 395 of 560 (within noise) |
| Deaths with at least one reason (sb-insight, 80 runs) | 0 | 33 of 46 |
| Own movement answers the stick (sb-predict, 80 / 200 / 350 ms) | 150 / 267 / 433 ms | 33 ms at every RTT |
| Drawn vs where the server will have you, mean (same) | 0.44 / 0.82 / 1.38 u | 0 / 0.014 / 0 u; jittery 200 ms: 0.15 u (waiting 0.94), no snaps |
| First contact, autopilot (cf-lab F) | 7.1 s | 7.1 s (not changed: 64% of contacts are announced first) |

Tests: `npx vitest run` 653/653 (68 files; 604 at 159b421), `tsc --noEmit` clean. Browser suites and screenshots: see
HANDOFF H27.

## Not done, and decisions for the owner

- **NFT combat power vs the brief's LAW 9/10.** LOCKED 9 (owner 2026-10-14) says holders start with real power; this
  brief says no NFT gameplay power and "their account was stronger" must not happen. Not changed (a LOCKED decision).
  SB does match on rating plus the tier's power offset, so a holder meets equal strength. The owner decides.
- **The pump one-shots Bill, Ray and Tabsu at point blank** with all 8 pellets (tests/sb-balance.test.ts). Left as a
  bruiser-over-flanker counter; flagged, not changed.
- **Online, teammates' sightings arrive as live enemy positions** (drawn as SPOTTED). A modified client could draw
  them live. Server-side quantised reports would close it (P2 integrity).
- A dash is not predicted (one 0.15 s correction). Heard-with-a-clear-line is a tiny rung (0.5% of hostile time).
- Not performed: any human play of SB, real phones, real Monad wallet, real mobile networks.
