# Vision and audio

Status: real occlusion by wall geometry, bullets blocked by walls, and sound as information are LOCKED. Numbers are PROPOSALS.

## Vision

Rules:
- The visible area is computed from the room's wall segments (raycasting into a visibility polygon). A decorative triangle or fixed cone drawn over the room is not allowed. Moving a wall must change what is visible (G3 tests this).
- Walls block both vision and projectiles, using the same wall data.
- View shape (PROPOSAL): a forward cone plus a small circle around the body so a wall or enemy right next to you is never invisible. Starting guess: cone about 70 degrees, range about 9 u, circle about 1.6 u.
- Three states, clearly different, readable in grayscale:
  1. Seen now: full detail.
  2. Remembered: walls and floor already seen, dimmed, never shows live enemies.
  3. Unknown: near black with a steady texture.
- Enemies outside the view are not drawn. They appear only through markers.
- Bots obey the same visibility. No wallhacks.

Markers show where information came from:
- Seen: the real unit.
- Heard: short-lived mark at the estimated area, wider when far or behind walls, fades in 1 to 2 s.
- Hit from: direction indicator for about 1 s.
Use different shapes per source (shape first, color second). Never show knowledge the player did not earn.

Tech notes (PROPOSAL): cache the polygon and recompute only when the player moves or turns past a small threshold. Do not fake light with full-screen blur or bloom. Light is the clip shape with a restrained edge. Fixture tests for corners, thin walls, door gaps, and diagonal joins.

## Audio

One sound event bus: every sound is an event `{ type, x, y, loudness_radius, source_id, tick }` from the sim. The same event feeds:
1. Audio output (positional).
2. Bot hearing.
3. The player's heard marker.
One source of truth keeps all three consistent.

Loudness radii (PROPOSAL, tune by feel): quiet step about 3 u, run step about 8 u, player shot about 22 u, impact about 10 u, ability wind-up 5 to 12 u, death about 12 u.

Positional rules: pan by direction, volume by distance, a wall between source and listener lowers volume and muffles. Quiet and run steps differ in tone and tempo, not only volume. A close threat sound must cut through everything. Almost no music during play. Cap simultaneous voices (guess: 24) and drop the lowest priority.

Phones and accessibility: audio must be unlocked on first touch, must not block startup, must handle tab switching. Sound-off must stay playable because key sounds also have a visual marker. Provide mute.

Sound production without budget (PROPOSAL): generate sounds in code with WebAudio (oscillators, noise, filters, envelopes) so no asset cost. Each sound must be told apart by ear in under 300 ms. Avoid stock sci-fi bleeps; choose a small set of timbres and stay inside it.
