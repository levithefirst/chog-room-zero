# Locations

Owner 2026-10-18 (IDENTITY + MAPS pass): keep Room Zero, add Office and Supermarket, open to free players and
holders alike, chosen before the match. Flow: PLAY, choose the location on the hub, then the mode, then the game.

Code: `src/config/maps.ts` (the registry), `tools/maps/build.py` (draws Office and Supermarket from rectangles, west
half mirrored, checks reachability), `src/sim/world.ts` (`createWorld({ mapId })`), `server/room.ts` (queues keyed
`mode:map:code`), `src/net/protocol.ts` (`queue.map`, validated; `match.map`). Tests: `tests/id-maps.test.ts`,
`tests/sp-online.test.ts` (queue by map, unknown map rejected).

A location is data: tiles, pickup zones, the solo hostile squad, tactical points, the danger zone's last centres,
online spawns (five a side, mirrored) and floor materials. Adding one is one entry in `MAPS`; matchmaking does not
change. Players are only matched with players who chose the same location and mode.

| Location | Fight | Pickups | Notes |
|---|---|---|---|
| Room Zero | Service basement: offices, side rooms, an exposed atrium, a long loading dock | 38 | the original map; 8 zones added this pass |
| Office | Open-plan floor: cubicle farms, a boardroom, a server room, three corridors | 32 | short sightlines, many doors |
| Supermarket | Shelf aisles, checkout lanes, a cluttered promo floor, the stockroom | 30 | long aisle lanes, close promo floor |

Shared rules (all locations):
- Pickups come back 4 s after they are taken, chosen by the server, never on top of a player, at least
  `TUNING.pickups.minSeparation` apart, and kept even between the two halves.
- The danger zone runs the same schedule (`docs/design/zone.md`) with each location's own last centres, all on open
  floor and at least one fair to both online sides (tested).

Status: layouts and numbers are PROPOSALS until people play them. Not checked by a person: sightline feel, readability
of the new floors on a phone.
