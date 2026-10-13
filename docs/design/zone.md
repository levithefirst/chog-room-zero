# Danger zone (RC-8)

Code: `src/sim/zone.ts` (pure, a function of match time and a plan), tuning `TUNING.zone`, map candidates
`ZONE_CENTRES`, tests `tests/rc8-zone.test.ts`, browser checks `tools/rc8-shots.mjs`.

| Phase | Time (default) | What the player sees | Damage outside |
|---|---|---|---|
| Safe | 0-45 s | HUD "Zone in 0:45", faint red outside the start circle (which covers the whole floor) | none |
| Warning (per stage) | 8 / 6 / 5 s | "Closes in 0:08", the next circle as a cream dashed ring | the previous stage's rate |
| Shrinking (per stage) | 15 / 10 / 8 s | "Closing 0:12", the red edge moves in | 4 / 8 / 14 per s |
| Final | from 97 s | "Final zone", radius 3.5 u | 20 per s |

Outside the circle: "Outside zone" badge, red screen edge, a chevron pointing the shortest way in, a hurt tick every
0.75 s. Zone damage hits health directly (armour does not soak it), the same for the player, bots and online players.

Fairness: the last circle is drawn (seeded) from open floor with 1.5 u clear all round; every circle sits inside the
one before, so nobody inside is ever suddenly outside; online, only centres about equally far from both team spawns
are used. The plan uses its own seed stream, so turning the zone on changes nothing else in a run.

Bots and the test autopilot head in once they are within 1 u of the closing circle's edge, to the nearest point
inside on their own side (not the centre, which made all five bots pile onto one spot), and still shoot what they see
on the way under the usual token and cover rules.

Match end: solo, a zone death is a loss ("The danger zone got you") and recap and results say so; a bot taken by the
zone is down like any other (the win is still "every hostile down"). Online, the zone can decide a match; both sides
gone at once is a draw.

## Evidence for 45 s of open play (scripted autopilot, 40 seeds per hero, `tests/rc-victory.test.ts`)

| Wins of 40 | Kettle | Mop | Brick | Wick |
|---|---|---|---|---|
| No zone (RC-8 cover rules) | 26 | 5 | 5 | 16 |
| Zone, 30 s safe, bots to the centre | 22 | 0 | 2 | 15 |
| Zone, 30 s safe, bots to the near edge | 24 | 0 | 4 | 10 |
| Zone, 45 s safe (shipped) | 27 | 4 | 4 | 13 |

These are scripted results, not feel. Owner playtest question: does the zone push you into fights at a good moment,
or does it arrive while you are still hunting?

## Brief

```
BRIEF: Shrinking danger zone (RC-8)
PURPOSE      Rooms could stall (a camping player, a hiding bot); nothing pushed the end of a run. Online it ends matches.
GAMEPLAY     Hold a good angle vs move before the edge reaches you; take a fight on the way in vs go around it.
NFT RELATION Not NFT related.
PLAYER FEEL  Pressure you can read: 45 s calm, then a warned, visible squeeze; ~97 s to the last 3.5 u circle.
TECH COST    ~0.5 day; src/sim/zone.ts, world/bots/autopilot hooks, render + HUD; no dependency.
RISK         Unfair placement, bots dying in it, solo win rate drop. Mitigated and measured above.
SCOPE        Owner mandate RC-8. Cut to fund it: no zone variants or minimap, one map only, no zone in tutorials.
QUALITY BAR  An unreadable or instant-death zone would be mediocre: words + countdown + dashed next ring + chevron.
VERDICT      KEEP (owner mandate 2026-10-13).
```
