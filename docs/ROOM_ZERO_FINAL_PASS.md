# Room Zero final pass (FP): rewards, pickups, network privacy, CHOG fairness

Owner task 2026-10-17 "final test -> improve -> retest -> deploy". Branch `claude/sb-superiority` from `12e6c24` (SB, H27).
Every number names how it was measured. Autopilot numbers find systemic problems; they are not human play.

## 1. Rewards (the existing currency: Shards; XP and levels; rating online)

Inspected first: `src/config/progression.ts` (REWARDS, levels, rating), `api/_lib/game.ts` (settlement pulled from the
game server, ledger with a unique key), `api/_lib/career.ts` (practice stored, paid nothing), `src/config/power.ts`
(UPGRADES bought with Shards). No new currency. What was wrong: solo practice (the default game) paid nothing at
all, and online kills paid no Shards, so a loss in practice was worth zero and fighting well never paid.

One rule, `rewardBreakdown()` (src/config/progression.ts), used by the server settlement, the practice endpoint and
both results screens (the screen prints the lines the server applied):

| Line | Online (validated) | Practice (solo) |
|---|---|---|
| Match played | 10 Shards, 40 XP | 4 Shards, 20 XP |
| Victory | +25 Shards, +60 XP | +12 Shards, +30 XP |
| Each kill (max 5) | +3 Shards, +10 XP | +1 Shard, +5 XP |
| Damage to opponents | +1 Shard per 50 (max 5) | +1 per 100 (max 3) |
| Nothing for | a quit while standing, under 20 s, the daily cap (20), a private room, demo, the lab | under 20 s, 25 paid runs per 24 h, no or bad start ticket, demo power |

- A win always beats any loss: online the best loss pays 30 Shards / 90 XP, the worst win 35 / 100; practice 12 / 45
  vs 16 / 50 (tests/rewards.test.ts checks both tables). Kills and damage are capped, so farming one match tops out.
- Leaving after being knocked out keeps the loss reward; quitting while standing forfeits it (the game server now
  records `quit` separately from `left`). Private room codes are friendly: history only, no Shards, XP, rating or wins.
- Practice is simulated in the browser, so it is paid only with a start ticket the site signs when the run begins
  (account, run id, start time), only once the claimed play time has really passed, once per run id (ledger unique key
  plus the practice_runs primary key), 25 paid runs per rolling 24 h. A forged run can never be worth more than an
  honest one. Migration v4 (additive: xp and shards on practice_runs).
- Results screens: every line, the total, the level bar, the rating change (online), the shard total and the next
  rank it buys ("Vitality 1 ready (10)" or "costs 40, 12 to go"), and an Upgrades button. A guest sees what the run
  would have paid and "Sign in to keep shards and XP".
- LOCKED 11 amended (owner request 2026-10-17): progression from validated online matches AND capped, ticketed practice.
- Damage dealt now counts opponents only (friendly fire could have farmed it).

## 2. Pickups

Before: 9 fixed pickups (3 health, 3 armour, 3 ammo), always on the same tiles. Now 15 in deliberate zones
(`PICKUP_ZONES`, src/sim/pickups.ts): 4 health, 4 armour, 3 grenades (new kind: +1, never above capacity), 4 ammo.

- Each zone is a room or part of one; the pickup sits on one of its tiles, drawn from the match seed, and comes back on
  another tile of the zone, never within 3 u of anyone standing. 60 seeds give 60 different layouts.
- Every tile: open floor reachable on foot, no crate or slab beside it, at most two walls on its sides (no corners or
  dead ends), at least 5 u from every spawn of the mode, at least 5 u from every other pickup.
- Even for both online sides: the map splits at x = 21 by walking distance, west and east zones pair up and draw from
  tiles the same walk from their own spawns, mid zones keep only tiles about as far from both. Per kind, the walk from
  each side differs by at most 3 tiles in all 60 seeds tested; over 60 matches the average gap per kind is under 0.75 tiles.
- Healing per minute on the map is about what it was (4 x 40 / 25 s = 6.4 hp/s, was 6.0), spread over more places.
  Grenades: 3 on the map, back after 40 s (about 4 extra throws a minute for the whole room).
- Online: the server sends every pickup's position when the layout changes (and on the first snapshot and a resume).
- Bots now heal from a pickup only after 2 s without being hit (they no longer break off mid-fight to reset at the
  new health spots). Measured, solo 1v5 autopilot wins in 160 seeds, Ray / Tabsu / Toad: old map 6 / 3 / 10, new
  map without the rule 3 / 6 / 12, with it 5 / 13 / 4. Call-out gap 2.2 -> 2.5 s (the squad met more contacts).
- The renderer remembers where you last saw each pickup and forgets it when you look at that spot and it has gone.

## 3. Network privacy (server/room.ts snapshot)

Before: a hostile seen by ANY teammate was sent to every client as a live actor (position, health, ammo), so a
modified client could draw teammates' sightings live; bullets and grenades in any teammate's view were sent; a hit on a
teammate carried the unseen shooter's position; heard sounds carried their exact source.

Now: exact only for your own team, the dead, and hostiles YOU see, whose muzzle flash YOU saw in the last 0.7 s, or
YOUR Ping shows. A hostile only a teammate sees (or a teammate's Ping or seen flash) is a spotted spot within 0.9 u,
refreshed every 0.5 s (the same rule the game already drew). Heard hostile sounds arrive as the hearing estimate the
game draws (flagged so the client does not blur twice). Hostile bullets: only seen or within 2.5 u. Grenades: seen
or within the blast ring + 1.5 u of you. Hits not on or by you carry no origin unless the shooter is shown to you.
tests/snapshot-privacy.test.ts runs a 3v3 match and checks every exact hostile in every snapshot against the rule.

## 4. CHOG fairness

Measured (perfect-aim mirror duels, Benja / Tabsu / Toad at 3 / 6 / 9 u, 32 duels each; real aim narrows every edge):

| Tier | vs fresh free player | vs maxed free player |
|---|---|---|
| Common | 0.66 | 0.33 |
| Uncommon | 0.78 | 0.46 |
| Rare | 0.86 | 0.56 |
| Epic | 0.91 | 0.70 |
| 1:1 | 0.98 | 0.90 |

The power numbers are LOCKED 9 (owner 2026-10-14: real starting power, 1:1s dominant) and were not changed. What was
unfair in the implementation: matchmaking counted a 1:1 as only 120 rating points stronger (the rating offset), so a
fresh free player could meet a 1:1 in the first second of queueing. Matching now counts each tier at its measured duel
worth (Common 115 ... 1:1 600 points); a small queue still fills after the band widens (about 23 s). A maxed free
player beats a Common holder and is even with Uncommon (tests/power.test.ts). Solo, 1v1 and 3v3 stay open to all.

## Not done, and decisions for the owner

- Practice payout is honest-client bounded, not proven: a cheater can claim a practice win, worth at most the daily
  practice cap (25 runs). Online rewards come only from the game server's record.
- The NFT power level (LOCKED 9) against "owning a CHOG should not simply mean stronger": the owner decides.
- Bot heal delay (2 s), call-out gap (2.5 s), reward amounts: PROPOSALS for the owner's playtest. I tried heal delays
  of 2, 3, 4 and 6 s; 3, 4 and 6 s each left one 16-seed information or call-out statistic just past its bar.
- Not performed: human play, real phones, real wallets, real mobile networks.
