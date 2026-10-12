# Cover rules (IMPLEMENTED, P1F)

Single in-code source: `src/sim/cover.ts` (`COVER_RULES`, `coverStops`). `bulletBlockT` in `src/sim/level.ts`
uses it; `tests/p1f-combat.test.ts` checks it. Sight ignores half cover: you always see over a crate.

| Kind | Blocks sight | Blocks movement | Stops normal bullets | Shooter leaning (within 1.25 u of it) | Marksman (pierces cover) |
|---|---|---|---|---|---|
| Wall | yes | yes | yes | still stops | still stops |
| Crate | no | yes | yes | passes (fires over it) | passes |
| Brick slab | no | yes | yes | passes | passes |

Legibility: a bullet stopped by a crate or slab emits an impact flagged `blocked`; the client draws a bright
"blocked" spark (7 sparks + a cool-white ring) instead of the small wall puff, so "my shots did nothing" reads as
"the crate took it". Movement: corner assist (`movement.cornerAssist` 0.9 u) slides you around a box edge you are
nearly past instead of stopping dead (CHOG-MAP-001).
