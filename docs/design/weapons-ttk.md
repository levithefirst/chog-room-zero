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
