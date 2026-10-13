# Cover rules (IMPLEMENTED, P1F)

Single in-code source: `src/sim/cover.ts` (`COVER_RULES`, `coverStops`). `bulletBlockT` in `src/sim/level.ts`
uses it; `tests/p1f-combat.test.ts` checks it. Sight ignores half cover: you always see over a crate.

| Kind | Blocks sight | Blocks movement | Stops bullets (every weapon, player and bot) | Shooter leaning (within 1.25 u of it) |
|---|---|---|---|---|
| Wall | yes | yes | yes | still stops |
| Crate | no | yes | yes | passes (fires over it) |
| Barrier | no | yes | yes | passes |
| Brick slab | no | yes | yes | passes |

RC-8 (owner, 2026-10-13: "solid boxes and walls block sniper shots and bot targeting"): until RC-7 the marksman
rifle (Wick) passed through crates and slabs. That penetration rule is removed: no weapon pierces anything. The
only way to shoot over a box is the lean rule above, and it is symmetric (two operators pressed against the same
crate can shoot each other over it). Drawn crates and barriers fill their collision tile (`src/render/footprint.ts`).
The seven deterministic scenarios are `tests/rc8-cover.test.ts`.

Legibility: a bullet stopped by a crate or slab emits an impact flagged `blocked`; the client plays a distinct
"blocked" knock (not the concrete grit), flashes the cover piece's outline for 0.18 s, and draws a bright
"blocked" spark (7 sparks + a cool-white ring) instead of the small wall puff, so "my shots did nothing" reads as
"the crate took it". Movement: corner assist (`movement.cornerAssist` 0.9 u) slides you around a box edge you are
nearly past instead of stopping dead (CHOG-MAP-001).
