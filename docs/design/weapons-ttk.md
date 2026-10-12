# Weapons TTK: shotgun (Brick) vs marksman (Wick)

THEORETICAL model, seeded and deterministic: `tests/ttk.test.ts` (400 duels per cell). It uses the in-code numbers
(`damageAt`, `mitigate` armour soak, pellets and spread, `moveSpreadDeg` when moving, bullet speed and life, hero HP
and armour). Both fire from t=0 at the target's current position (no lead), body radius 0.35 u. Strafing: both
move sideways at hero speed; the target's offset during the bullet's flight is uniform within +-(speed x flight
time), because strafes reverse. TTK = mean time to the first kill. Not measured in play; validate by playtest.

Design gate (asserted): the shotgun wins >60% at 2 and 4 u in both modes; the marksman wins >60% at 12 u.

## Before (falloffStart 3, spread 9 deg)
| range (u) | mode | shotgun win | marksman win | trade | median-ish TTK (s, mean) |
|---|---|---|---|---|---|
| 2 | stationary | 100% | 0% | 0% | 0.81 |
| 4 | stationary | 0% | 100% | 0% | 2.27 |
| 6 | stationary | 0% | 100% | 0% | 2.27 |
| 9 | stationary | 0% | 100% | 0% | 2.27 |
| 12 | stationary | 0% | 100% | 0% | 2.27 |
| 2 | strafing | 100% | 0% | 0% | 0.92 |
| 4 | strafing | 40% | 61% | 0% | 2.39 |
| 6 | strafing | 3% | 97% | 0% | 4.48 |
| 9 | strafing | 0% | 95% | 0% | 6.74 |
| 12 | strafing | 0% | 74% | 0% | 7.80 |

The shotgun lost every stationary 4 u duel (0%) and most strafing ones (40%): it was a ~2 u weapon only.

## After (falloffStart 4.5, spread 8 deg; nothing else changed)
| range (u) | mode | shotgun win | marksman win | trade | median-ish TTK (s, mean) |
|---|---|---|---|---|---|
| 2 | stationary | 100% | 0% | 0% | 0.81 |
| 4 | stationary | 100% | 0% | 0% | 1.53 |
| 6 | stationary | 0% | 100% | 0% | 2.27 |
| 9 | stationary | 0% | 100% | 0% | 2.27 |
| 12 | stationary | 0% | 100% | 0% | 2.27 |
| 2 | strafing | 100% | 0% | 0% | 0.89 |
| 4 | strafing | 69% | 31% | 0% | 2.00 |
| 6 | strafing | 19% | 81% | 0% | 4.26 |
| 9 | strafing | 0% | 95% | 0% | 6.74 |
| 12 | strafing | 0% | 74% | 0% | 7.80 |

Candidates tried: 4.5/8 (chosen, smallest change that flips 4 u), 4.5/7.5 (4 u strafing 78%, 6 u 22%), 5/8
(6 u strafing 26%). Past 6 u nothing changed: the marksman still owns range. The shotgun's reach (26 u/s x 0.4 s =
10.4 u) means it cannot hit at 12 u at all.


## P1FT: real-sim duels (supersede the model above for decisions)

Harness: `tests/p1ft-duels.test.ts`. It runs the REAL sim (`stepWorld`: bullets, spread rolls, collision, falloff,
armour). Setup:
- Open hall with no cover. Side A is the player actor (Brick); side B is one bot driven by a script, not its brain
  (via the test-only `botInput` argument of `stepWorld`).
- Both hold the trigger from t=0 and aim at the opponent's current position every tick, with no lead.
- Auto-reload on empty; abilities off.
- Seeds 1000..1199 (N=200 per cell). Win % carries a Wilson 95% CI. Timeout 15 s counts as a draw.

Strafe pattern (strafing cells): A strafes along y at full hero speed, reversing every 0.60 s and starting +y. B
reverses every 0.45 s, starting -y. Both stay in the lane y in [2.5, 6.5]. Hit rate = hits / bullets fired (shotgun
per pellet).

Design intent (weapons.ts and docs): the shotgun owns close range (≤ ~4.5 u) and is weak past 8 u; the marksman
punishes long lanes; the rifle is the honest middle. ADE's regression suite expects the shotgun to beat the rifle at
≤4 u. Named test for ADE's 4 u case: "ADE 4 u test: Brick shotgun vs Wick marksman at 4 u, stationary".

### Before (P1F shotgun: damage 12, 7 pellets, spread 8°)

**Shotgun (Brick) vs marksman (Wick)**

| range | mode | shotgun win | 95% CI | opp. win | draw | TTK p10 / median / p90 (s) | hit rate shotgun (per pellet) / opp. |
|---|---|---|---|---|---|---|---|
| 2 u | stationary | 100.0% | 98.1–100.0% | 0.0% | 0.0% | 0.87 / 0.87 / 0.87 | 0.64 / 1.00 |
| 4 u | stationary | 100.0% | 98.1–100.0% | 0.0% | 0.0% | 0.95 / 1.73 / 1.73 | 0.44 / 1.00 |
| 6 u | stationary | 0.0% | 0.0–1.9% | 100.0% | 0.0% | 2.37 / 2.37 / 2.37 | 0.37 / 1.00 |
| 9 u | stationary | 0.0% | 0.0–1.9% | 100.0% | 0.0% | 2.43 / 2.43 / 2.43 | 0.17 / 1.00 |
| 2 u | strafing | 100.0% | 98.1–100.0% | 0.0% | 0.0% | 0.88 / 0.88 / 1.7 | 0.54 / 1.00 |
| 4 u | strafing | 74.0% | 67.5–79.6% | 26.0% | 0.0% | 1.75 / 2.33 / 2.55 | 0.36 / 0.78 |
| 6 u | strafing | 61.0% | 54.1–67.5% | 39.0% | 0.0% | 5.27 / 6.45 / 7.25 | 0.26 / 0.42 |
| 9 u | strafing | 0.0% | 0.0–1.9% | 60.0% | 40.0% | 6.07 / 12.72 / 13.45 | 0.18 / 0.25 |

**Shotgun (Brick) vs rifle (Kettle)**

| range | mode | shotgun win | 95% CI | opp. win | draw | TTK p10 / median / p90 (s) | hit rate shotgun (per pellet) / opp. |
|---|---|---|---|---|---|---|---|
| 2 u | stationary | 100.0% | 98.1–100.0% | 0.0% | 0.0% | 0.87 / 0.87 / 0.87 | 0.79 / 1.00 |
| 4 u | stationary | 0.0% | 0.0–1.9% | 100.0% | 0.0% | 1.17 / 1.17 / 1.17 | 0.52 / 0.91 |
| 6 u | stationary | 0.0% | 0.0–1.9% | 100.0% | 0.0% | 1.22 / 1.22 / 1.22 | 0.36 / 0.91 |
| 9 u | stationary | 0.0% | 0.0–1.9% | 100.0% | 0.0% | 1.32 / 1.43 / 1.67 | 0.21 / 0.75 |
| 2 u | strafing | 22.0% | 16.8–28.2% | 78.0% | 0.0% | 1.23 / 1.5 / 1.7 | 0.55 / 0.75 |
| 4 u | strafing | 37.0% | 30.6–43.9% | 63.0% | 0.0% | 1.98 / 2.55 / 3.38 | 0.34 / 0.42 |
| 6 u | strafing | 6.5% | 3.8–10.8% | 93.5% | 0.0% | 2.87 / 5.98 / 7.28 | 0.25 / 0.27 |
| 9 u | strafing | 0.0% | 0.0–1.9% | 99.5% | 0.5% | 6.18 / 9.32 / 11.17 | 0.18 / 0.19 |

**Concrete problem:** the shotgun LOST to the rifle at close range. It won 0% at 4 u stationary, 22% at 2 u
strafing and 37% at 4 u strafing. The rifle kills Brick in ~1.2 s at 4 u; the shotgun needs 3 pumps (1.6 s).

### After (damage 14, 8 pellets, spread 7.5°; falloff, rate and reach unchanged)

**Shotgun (Brick) vs marksman (Wick)**

| range | mode | shotgun win | 95% CI | opp. win | draw | TTK p10 / median / p90 (s) | hit rate shotgun (per pellet) / opp. |
|---|---|---|---|---|---|---|---|
| 2 u | stationary | 100.0% | 98.1–100.0% | 0.0% | 0.0% | 0.07 / 0.07 / 0.07 | 1.00 / 1.00 |
| 4 u | stationary | 100.0% | 98.1–100.0% | 0.0% | 0.0% | 0.93 / 0.93 / 0.93 | 0.50 / 1.00 |
| 6 u | stationary | 16.5% | 12.0–22.3% | 83.5% | 0.0% | 1.82 / 2.37 / 2.37 | 0.39 / 1.00 |
| 9 u | stationary | 0.0% | 0.0–1.9% | 100.0% | 0.0% | 2.43 / 2.43 / 2.43 | 0.19 / 1.00 |
| 2 u | strafing | 100.0% | 98.1–100.0% | 0.0% | 0.0% | 0.88 / 0.88 / 0.88 | 0.50 / 1.00 |
| 4 u | strafing | 100.0% | 98.1–100.0% | 0.0% | 0.0% | 1.75 / 1.75 / 1.75 | 0.33 / 0.72 |
| 6 u | strafing | 85.0% | 79.4–89.3% | 15.0% | 0.0% | 3.43 / 5.67 / 5.68 | 0.25 / 0.40 |
| 9 u | strafing | 0.0% | 0.0–1.9% | 59.5% | 40.5% | 6.08 / 11.97 / 13.47 | 0.19 / 0.25 |

**Shotgun (Brick) vs rifle (Kettle)**

| range | mode | shotgun win | 95% CI | opp. win | draw | TTK p10 / median / p90 (s) | hit rate shotgun (per pellet) / opp. |
|---|---|---|---|---|---|---|---|
| 2 u | stationary | 100.0% | 98.1–100.0% | 0.0% | 0.0% | 0.87 / 0.87 / 0.87 | 0.56 / 1.00 |
| 4 u | stationary | 71.5% | 64.9–77.3% | 28.5% | 0.0% | 0.93 / 0.95 / 1.17 | 0.55 / 0.90 |
| 6 u | stationary | 0.0% | 0.0–1.9% | 100.0% | 0.0% | 1.22 / 1.22 / 1.33 | 0.39 / 0.90 |
| 9 u | stationary | 0.0% | 0.0–1.9% | 100.0% | 0.0% | 1.32 / 1.43 / 1.67 | 0.23 / 0.75 |
| 2 u | strafing | 99.5% | 97.2–99.9% | 0.5% | 0.0% | 0.88 / 0.88 / 0.88 | 0.56 / 0.71 |
| 4 u | strafing | 91.5% | 86.8–94.6% | 8.5% | 0.0% | 1.75 / 1.77 / 2.33 | 0.36 / 0.35 |
| 6 u | strafing | 23.0% | 17.7–29.3% | 75.5% | 1.5% | 4.82 / 5.98 / 6.45 | 0.25 / 0.27 |
| 9 u | strafing | 0.0% | 0.0–1.9% | 98.5% | 1.5% | 6.07 / 7.47 / 11.05 | 0.18 / 0.19 |

Candidates tried (N=120 each, shotgun win % vs rifle at 2 u strafing / 4 u / 4 u strafing / 6 u):
- damage 14: 52 / 7 / 68 / 0
- damage 16: 97 / 42 / 93 / 0, but it also beat the marksman 23% at 6 u stationary
- 9 pellets: 71 / 0 / 64 / 0
- damage 14 + 8 pellets + 7°: 100 / 93 / 90 / 0, but it took 33% of 6 u stationary duels from the marksman
- **damage 14 + 8 pellets + 7.5° (chosen): 99 / 74 / 93 / 0.** The marksman keeps 6 u stationary (shotgun 16.5% at N=200) and 9 u.

Side effect to watch: at 6 u strafing the shotgun now beats the marksman more often (61% → 85%, N=200). The marksman is a
lane weapon and loses mobile mid-range fights by design, but this needs a playtest.
