# Tactical map

Owner prompt 2026-10-20 "FULL-SCREEN TACTICAL MAP". A MAP button on the combat HUD (or M on a keyboard) opens a full-screen map of the location in play. RETURN, M or Esc closes it.

Code:
- `src/ui/tactical.ts`: what is drawn (pure). Geometry, markers, the information rule, and the zoom/pan maths.
- `src/ui/tactical-view.ts`: the overlay. Sizing, the per-frame paint, wheel, drag and pinch.
- `src/main.ts`: the button, the M key, and input gating while the map is open.
- `index.html`: `#mapbtn`, `#tmap`.

Tests:
- `tests/tm-tactical.test.ts`: geometry per location, the information rules (solo, 5v5 world, online 1v1 and 3v3 through the real Lobby and client), Visor, view maths, Game Docs.
- `tools/tm-map.mjs`: headless Chrome. Ten viewports, the five locations, input gating, zoom, pan and pinch, repeated open/close, online 1v1 and 3v3 with no reconnect.

## Brief

```
BRIEF: Full-screen tactical map
PURPOSE      Five locations of 64-80 x 40-46 u: a player cannot hold the layout in their head, so they do not know
             where they are, where the zone is closing, or which route reaches their team.
GAMEPLAY     Look (the match keeps running; you stand still and can be shot) or keep fighting blind to the layout.
NFT RELATION Not NFT related, except that a Visor holder's tracker marks appear on it.
PLAYER FEEL  One tap to open, one to close, under 1 frame either way (no reload, no reconnect, no remount).
TECH COST    About a day. Three new files, no dependency, no protocol change.
RISK         A wallhack. Avoided: the map reads only the player's contact intel and the server's scoped snapshot.
SCOPE        Owner-requested (the owner's message beats RULES section 6). No new game state: it reads the Level,
             the intel, the Visor list and the zone. No equal cut was named by the owner; logged as open.
QUALITY BAR  Mediocre = a generic grid with dots. Avoided: every tile kind, material and named area of the level
             is drawn, so each location reads as itself.
VERDICT      KEEP.
```

## One source of geometry

The map draws `world.level`: the very Level the sim collides, sees and paths on, parsed from `MAPS[id].rows`.
- **Walls:** the sight outline and merged wall boxes.
- **Cover and barriers.**
- **Doors.**
- **Rails** (track edges, railings): dashed yellow.
- **Decks** (high ground): purple with a lit edge.
- **Stairs:** step stripes.
- **Floor:** the location's materials and lit areas.

Area names come from the location's own pickup zones (`landmarks()`): "boardroom", "platform", "scaffold" and so on. Change a map's rows or zones and the tactical map follows. Nothing is drawn by hand.

A Training drill room has no location, so it gets no area names and is titled "Training room".

## Information rule (EVIDENCE: `tests/tm-tactical.test.ts`)

The map shows exactly what the HUD already knows:

| Shown | Source | Online |
|---|---|---|
| You (position, facing) | your actor | your predicted actor |
| Teammates (position, facing, downed) | your side's actors | the server always sends your side |
| A hostile, live | contact intel VISIBLE now (your light, its flash, your Ping, a Marker hit by your side; the same bodies the game view draws) | sent only when the server says you see it |
| A hostile, last known | contact intel weaker than VISIBLE: a fading circle at the believed spot, never the body | teammate-spotted reports arrive blurred by the server |
| Visor marks | `visorDots()`, the same list as the HUD tracker | the server's `vt` list, sent to the holder alone |
| Danger zone, stocked supplies | shared match state | sent to everyone |

Solo, the client sim holds every bot, but the map never reads a hostile position unless intel says VISIBLE (or a Ping or Marker reveal).

Online, the client only holds what `server/room.ts` snapshot chose to send. A modified client gains nothing from the map. No protocol change was needed.

**1v1 decision.** The brief asked for the opponent "visible on the tactical map" and also for the existing visibility rules to be respected. Respecting the rules wins:
- The opponent shows while you see it.
- It shows as a last-known circle after you lose it.
- It shows as a Visor mark if you hold the Visor.
- It never shows otherwise.

Showing it always would be a wallhack in a 1v1.

## While it is open

- **The match keeps running.** Solo, the bots do not wait. Online, the server never pauses.
- **Your operator stands still:** idle input, holding its facing.
- **Nothing reaches the game:** no fire, ability, grenade or reload. Held keys and sticks are released on open, and fire is held until a fresh press on close.
- **Map gestures stay on the map.** Touches and clicks on it never become sticks or shots.
- **The match closes it.** Leaving play (death, pause, results) closes the map.

## Open

- Human play: is the map readable at a glance on a real phone, and is standing still too costly to use mid-fight?
- No equal scope cut named (RULES section 6).
- The reference image named in the brief was not attached to the message. The look follows the CHOG HUD palette.
