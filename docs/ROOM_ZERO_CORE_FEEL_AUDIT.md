# Room Zero core feel audit (CF)

Owner task 2026-10-16 "Bullet Echo-level core feel + game UX rebuild". Bullet Echo is a benchmark for principles only; nothing is copied.
Audit by claude on branch `claude/cf-core-feel` from `eb8e45f`. The read-only audit page (same numbers, longer prose) was published for the owner.
Every number names how it was measured. Feel claims are not made: the owner's playtest decides (`docs/GATES.md`).

## 1. Current architecture (EVIDENCE, source read at eb8e45f)

| System | File | What it does today |
|---|---|---|
| Sim step | `src/sim/world.ts` | 60 Hz fixed step, seeded RNG. Input, bullets, grenades, zone, pickups, revive, slabs. |
| Movement | `src/sim/sim.ts`, `TUNING.movement` | accel 52.5, decel 70, reverse x1.5, 4.2 u/s x hero speed. Creep 55% (Shift, or stick under 60%). |
| Facing | `world.ts applyInput` | humans: `facing = aim` every step (instant). Bots: 300 deg/s. |
| Shooting | `world.ts fireRound`, `src/config/weapons.ts` | travelling bullets 26-46 u/s, uniform spread = base + 2.5 deg x speed share for every gun. |
| Vision | `src/sim/vision.ts` | raycast polygon from wall segments: hero cone 46-90 deg, 7.5-12 u, plus a 1.6 u near circle. |
| Reveal | `src/render/render.ts`, `render/visibility.ts` | hostile drawn in your cone, in ANY teammate's cone (live body), after a muzzle flash with LOS (0.7 s, any range), or by Ping. |
| Sound | `world.ts emit/hears`, `src/audio/audio.ts` | one bus for audio, bot hearing, heard rings; wall shrinks radius to 60%. |
| Heard rings | `src/main.ts afterStep` | one cream ring shape for every sound type, 1.4 s, 8% error. |
| Bots | `src/sim/bots.ts` | patrol on creep, investigate, alert, engage, cover, pursue, search, heal; 2 attack tokens; dept styles. |
| Darkness | `src/render/bake.ts`, `lightmesh.ts` | dim baked map always drawn; fog over unexplored only. |
| Network | `server/room.ts`, `src/net/client.ts` | authoritative server, 20 Hz snapshots, 30 Hz input, no own-movement prediction, others interpolated 100 ms, unseen hostiles culled. |
| Auth | `api/_lib/auth.ts`, `api/auth/*` | Google OAuth and SIWE wallet sign-in; HMAC session cookie; ownership read live from Monad (`api/_lib/chain.ts`) only for the session's wallet. |
| UI | `index.html`, `src/ui/hub.ts`, `src/ui/screens.ts`, `src/main.ts` | loading screen, hub (identity strip, class card, leaderboard card, hero carousel, mode chips, PLAY, nav row), sub-screens. |

## 2. Measurements before CF (EVIDENCE)

Method: scratch vitest file against the real sim (52 full matches, autopilot from `src/debug/autopilot.ts`, seeds 1-20, zone on), geometry
sweeps, and headless Chromium 1194 on `npx vite` at 1440x900, 844x390, 932x430 (emulated touch).

- Movement: full speed in 83 ms, stop in 67 ms over 0.09 u, reversal 133 ms.
- Turning: humans instant, bots 300 deg/s.
- Accuracy at 4 u (rifle, chance one bullet hits a 0.35 u body): 100% standing, 100% at full run. At 7 u: 100% vs 57%.
- Fight range: player hits median 3.6 u (p90 7.1), bot shots median 5.3 u, first sight median 7.5 u.
- Information per living hostile (10 Hz samples, you + 2 AI): own cone 8.5%, teammate cone 5.7%, heard/flash/ping only 2.9%, unknown 82.9%.
- Enemy run-step rings seen: 8.2 per minute (bots patrol on creep, 3 u).
- Unlit floor luma 33 vs lit 69 vs wall 27 (1440x900 frame): layout fully readable in the dark.
- First contact 4.4-5.2 s in 16 of 16 default matches; matches 30-62 s.
- Map: 6 open straight runs of 42 u, 18 over 12 u; crates never block sight; 22% of floor pairs within 20 u have LOS.
- Teammates: 32% of first sightings, ~44% of kills, 0.4 of 2 die per match, 61% of samples behind your facing, 5.45 of 6 grenades thrown.
- Loading screen: bar drawn at ~60% while the label says READY 100% (desktop-00-loading capture).

## 3. P0 (blocks the tactical loop)
1. Human turning is free (contradicts LOCKED 7 "deliberate turning").
2. Moving costs no accuracy at fight range (+2.5 deg for every gun).
3. The player cannot see their own noise.
4. Enemies are silent until they shoot; no NOTHING -> NEARBY -> DIRECTION -> LAST KNOWN -> PARTIAL -> CONTACT ladder.
5. The dark is a tint; the map layout is free information.
6. Contact at 4-5 s; long open lanes; cover never conceals.
7. Teammate cones hand over live enemy bodies (free omniscience).

## 4. P1
- Hit feedback thin at range (60 ms body flash, positional thud only), no health-loss ghost, no kill sound for the killer.
- Grenades: no landing preview before release on either platform; touch throws a fixed 6.5 u.
- Touch ability/grenade/reload sit in the aim thumb's resting zone.
- Bots never stop on patrol or hold an angle unless engaged; allies dump ~91% of grenades.
- Landing/hub reads as a dashboard: equal-weight panels, a small hero card, a generic purple PLAY slab, a row of bordered nav buttons.
- Loading bar does not match its percentage.
- No "Enter with CHOG" path: wallet sign-in is generic, ownership is only checked after sign-in, no wrong-network handling.

## 5. P2
- Online own movement waits a round trip (no prediction). Not changed in CF.
- No ready tone for abilities; reload has no tell beyond a 4 u sound.
- Tips banner covers the top centre during fights; vitals carry flavour text in play.

## 6. Proposed changes (the steady rule)
Standing still is quiet, accurate and sees further; moving is loud, loose and sees wide but short. Implemented as switchable lab
experiments (`?lab`, debug builds) with the shipping values chosen from measured results, then confirmed by the owner's playtest.
- A turning: body turns toward the aim at a cap; gun and lamp follow the body; spread grows while the body lags the aim.
- B accuracy: per-weapon run penalty with a short settle when you stop.
- C own noise: arc at the true hearing radius on each loud step.
- D enemy sound: audible patrols, patrol pauses, typed heard marks (step, shot, reload, impact, ability, grenade), a last-seen afterimage.
- E vision: darker unlit map, lamp shape by gait, pickups hidden outside light, teammate sightings as SPOTTED markers.
- F pacing: map pass (pillars that block sight, lanes broken, spawn distance), bots start further away.
- Feedback: confirm tick, kill sound, bar damage ghosts, grenade landing preview, ability ready tone.
- UX: landing with the live room behind the operator, one PLAY, "Enter with CHOG", authored loading tied to real steps, hub hierarchy.

## 7. Risks
- A turn cap can feel sluggish with a mouse. Mitigation: lab values 450/720/1080, owner picks.
- Darker maps can read as "broken" on cheap phone screens. Mitigation: walls keep an outline, near circle stays lit.
- The sim is shared with the game server: a sim change is an online change. The Render server deploys from `ccr-e7fadb8f-qtochk`, so CF stays on its own branch until the owner deploys both together.
- Victory-rate tests (`tests/rc-victory.test.ts`) and fairness tests depend on bot numbers; retuning may need their floors re-measured, never lowered silently.

## 8. Tests required
Turning cap and lag spread; per-weapon move spread and settle; own-noise event; bot patrol noise and pauses; afterimage and SPOTTED rules;
darkness/lamp shape; map reachability, snag, zone centres, spawn distance; CHOG flow (holder, no CHOG, wrong network, rejected
signature, success); Google and existing wallet sign-in unchanged; fresh first run; loading progress; landing CTA; mobile and desktop
layouts; full vitest + tsc + browser suites (qa-journey, qa-screens, qa-errors, master-ui).
