# Room Zero: Gameplay Reality Pass (GP)

Owner request 2026-10-17, "CHOG: ROOM ZERO — GAMEPLAY REALITY PASS". Branch `claude/gp-gameplay-reality`, shipped from
`ccr-e7fadb8f-qtochk`. Baseline: 7c7a78f (H29). Every number below was measured in this container (autopilot, headless
Chromium, PGlite); nothing here was played by a person.

## 1. What changed

| Request | Built | Where |
|---|---|---|
| Kill loot | An eliminated actor drops a bag of what it carried: its rounds (as magazines of its own gun, converted to the taker's), grenades, the armour left on it, and a 15 hp field dressing. The bag lies where it fell for 30 s. The nearest standing actor in reach, with a clear line, who can use something takes it: one taker per bag per step, each part only up to their own ceiling, and the rest stays. The server decides it all; snapshots send a bag (its kinds and its timeout, never its contents) only to teams that know about it. | `src/sim/world.ts` (Loot, dropLoot, lootTake, stepLoot), `server/room.ts` (lt), `src/render/render.ts`, `src/main.ts` (toast) |
| Downed and revive | 0 HP with a teammate standing means DOWNED: a 10 s window, then out. A teammate within 1.4 m who holds fire revives in 3 s, back at 30% health. The bleed waits during a revive. A hit, the rescuer firing, or the rescuer leaving the range resets it; hostiles can finish. A centre card counts down and shows who is reviving whom. 1v1 and the last one standing are out at once. | `stepRevive`, `TUNING.revive`, `#downcard` |
| AI teammates revive | Utility judgement: no hostile seen within 9 u, not hit for 1.2 s, only the nearest free teammate goes, and only if it can arrive inside the window. A downed AI keeps still while someone comes, otherwise it crawls to the nearest teammate. They say when they are coming for you. | `src/sim/bots.ts` allyRescue, downedThink |
| AI teammates use resources | Utility per item: need (health below 85%, armour against the hero's own start, ammo below two magazines, grenades lowest), minus the walk. Skipped near the last threat they know of, when hit within the last 2 s, when a teammate needs it more and is about as close, beyond 9.5 u of you (20 u if critical), and while covering a called spot. Loot only once their team knows of the bag. | allySupply, needOf, `TUNING.bots.supply` |
| More resources | 30 pickups (4 more ammo, in the corner rooms). Respawns: health 25 s (was 30), armour 30 s (35), ammo 14 s (20), grenades 50 s (unchanged: "grenades slower", and the "never a stream" bar). Plus every kill's bag. | `src/config/map.ts`, `TUNING.pickups` |
| 36 medals | 18 common, 10 uncommon, 6 rare, 2 epic. Awarded on the server from verified practice runs and settled online matches. Rare and epic bars set from data. | `src/ui/medals.ts`, `api/_lib/career.ts` awardDue, settle route |
| Real leaderboard | Two boards. Solo: kills in verified practice runs. Online: the owner's board, kills in settled online matches. Both ranked by kills, then wins or clears, then fewer matches. Your own rank is always on top. 20 a page. "Shown to others" lets anyone opt out; the smoke's test accounts are hidden. Migration v6. | `api/_lib/game.ts` leaderboard, `src/ui/hub.ts` |
| Game Docs | 19 sections, built from the game's own numbers, searchable. Opened from the hub (Game Docs) and the first-launch card. | `src/ui/docs.ts` |

## 2. Bugs: symptom, root cause, fix, regression test

1. **Stationary 360 fire (PC).**
   - **Symptom:** standing still, the aim crept off the cursor, and behind you it flipped: you could not turn round to shoot.
   - **Root cause:** the PC aim is the cursor's angle from the player's screen spot, and the camera led along the *facing*. The player's screen spot moved under a still cursor, so the aim turned with it. A cursor behind you sat between your screen spot and the screen centre, so the aim read the other way and stayed there (the browser probe measured shots 152° off).
   - **Fix:** on PC the camera leads by the cursor's offset from the screen centre. Player, centre and cursor stay on one line, so the aim stays where the cursor points.
   - **Tests:** `tests/gp-combat.test.ts` (camera model, the old camera still fails) and `tools/gp-aim.mjs` (real mouse and touch at 9 angles: 9/9 within the weapon's spread, PC and touch).
2. **Stationary 360 fire (all platforms).**
   - **Symptom:** a flick behind you fired its first rounds the wrong way.
   - **Root cause:** the body turns at the locked human cap (720°/s), and the trigger fired along the old facing for the 0.25 s a 180° turn takes (up to 168° off).
   - **Fix:** a new trigger pull waits until the body faces within 40° of the aim. A pull made mid-turn is queued for 0.3 s, so a tap is never lost.
   - **Tests:** `tests/gp-combat.test.ts` (every hero at 9 angles, the 180° flick, the mid-turn tap).
3. **Health ticking down out of combat.**
   - **Root cause:** overheal (a health pickup at full health) drained 2 hp/s and over-armour 1/s, with no hit, no sound and no zone.
   - **Fix:** the extra stays until damage takes it. The danger zone stays the one environmental damage, already named on the HUD.
   - **Tests:** `tests/gp-combat.test.ts` (40 s idle in the default game, solo and online 1v1: health unchanged) and `tests/pickups-abilities.test.ts`.
4. **"Getting hit slows or freezes me".**
   - **Measured:** hits never slow you. Rifle, shotgun, marksman, LMG, armour hits, low health and grenades all leave you at 90% or more of run speed within 50 ms.
   - **Root causes:** two real slows that were never named. Ray's Snare (the hostile "Stair" plays Ray) slows to 60% for 2 s. Being downed is a 25% crawl, announced only by a toast.
   - **Fix:** a "Slowed 40% · 1.4 s" status under your health, the downed card, and the docs FAQ. Snares never stack or exceed 2 s (tested).
   - **Tests:** `tests/gp-combat.test.ts`.
5. **Downed AI teammate dragged its own revive away.**
   - **Root cause:** a downed AI kept its patrol walk at crawl speed.
   - **Fix:** it holds still while someone comes (`downedThink`).
   - **Test:** `tests/gp-revive.test.ts`.
6. **Two AI teammates could both go to one revive.**
   - **Fix:** a teammate already on it, or within range, counts.
   - **Test:** `tests/gp-revive.test.ts`.
7. **AI teammates fetched armour at spawn.**
   - **Root cause:** need was measured against the shared 50 cap (the same bug the hostile squad had in FS).
   - **Fix:** need is measured against the hero's own start armour.
   - **Test:** `tests/qa-allies.test.ts`.
8. **A supply trip toward a threat ran on for up to 0.5 s.**
   - **Root cause:** a new threat was only noticed at the next re-judge.
   - **Fix:** danger is re-checked every step.
   - **Test:** `tests/gp-ai.test.ts`.
9. **A downed actor with no downing record crashed the team wipe** (`drop(..., null)`).
   - **Fix:** a safe fallback.
   - **Test:** `tests/gp-loot.test.ts`.
10. **Rarity inflation.**
    - **Symptom:** "In and Out" (rare, a clear under 60 s) came in 50 of 84 autopilot runs, and "Ace" (epic) in 4. "Survivor" (90 s alive) was rare.
    - **Fix:** In and Out is now under 30 s (3 of 84). Ace also needs no teammate lost (1 of 84). Survivor is common; Full Squad moved from epic to rare.
    - **Test:** `tests/gp-progress.test.ts`.
11. **The real player could not find themselves on the leaderboard.**
    - **Root cause:** the board counted online kills only. The real account has 65 practice runs and 0 online matches; seven "SmokeA" test accounts were the whole list.
    - **Fix:** a Solo board, My Rank, and a hidden flag (the migration backfills the smoke accounts).
    - **Test:** `tests/gp-progress.test.ts`.
12. **A tap on Back went through to the hub (it opened Career).**
    - **Root cause:** a press acts on pointerdown, and its own follow-up click (sent with `detail 0` by the emulated touch) was taken as a keyboard press on the new hub button under the finger.
    - **Fix:** a `detail 0` click within 700 ms of a pointer press is that press's own click.
    - **Test:** `tools/gp-ui.mjs`.

## 3. Measurements (this container)

- **AI teammates, 12 default matches (autopilot player):**
  - 47 items taken by AI teammates, 32 of them from loot bags;
  - the player was downed 5 times and got up twice;
  - 3 revives by AI teammates.
- **Medals, 84 autopilot runs:**
  - commons come often: Hat Trick 38, Scavenger 55, Looter 52;
  - In and Out 3, Last Stand 5, Ace 1, Untouched 0.
- **Comms:** 9.8 calls a minute (32 seeds; the bar stays under 10). The audit moved from 16 to 32 seeds because 16-seed samples of the same build differed by about 0.4 a minute. The call gap went from 2.8 s to 3.1 s.
- **Information (sb-lab, 16 seeds):** announced before seen 0.653 (bar 0.6); believed but not seen 0.178 (bar 0.15).
- **Resources, map-wide:**
  - health 12.8 hp/s (was 10.7);
  - armour 7.0/s (6.0);
  - ammo 1.4 magazines/s (0.6);
  - grenades 7.2 a minute (unchanged), plus five bags per solo match.

## 4. Tests

The final counts are in H30 (docs/HANDOFFS.md).

**New unit and integration tests:**
- tests/gp-combat
- tests/gp-revive
- tests/gp-loot
- tests/gp-ai
- tests/gp-progress
- tests/gp-docs

**New browser checks:**
- tools/gp-aim.mjs
- tools/gp-ui.mjs

**Changed tests**, each because a rule changed, never to loosen a bar:
- world, p0fix-input: the actor is pre-faced to the aim (the new turn-before-fire rule);
- pickup-layout, world: 30 pickups;
- pickups-abilities: no overheal drain;
- rc7-profile-medals: the new roster, and In and Out under 30 s;
- account-ui: two boards;
- api-hardening, game-api, leaderboard, mi-account: migration 6, the `total` field;
- sb-comms: 32 seeds.

## 5. Remaining limitations

- **Practice is still simulated in the browser.** Solo board kills and solo medals come from ticketed, timed, bounded and capped run reports, not from a server replay. The Online board and online medals are server-authoritative.
- **Revive in production:** the live smoke verifies the server sends downed and revive state, and the revive rules run on the server code tested here. A live revive between two real players needs two people.
