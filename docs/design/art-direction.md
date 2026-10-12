# Art direction (P1)

Status: PROPOSAL, written by grokbot under the owner's P1 mandate (2026-10-12). The owner judges it by playing. Numbers live in `src/config/tuning.ts`.

## Intent, one sentence
A service basement after the power died: raw concrete, one hand lamp, and something rust-coloured moving where the lamp is not pointing.

## Value hierarchy (darkest to brightest)
Readable in grayscale. Each step up is something more urgent.

| Step | Role | Colour |
|---|---|---|
| 0 | Unknown (never seen) | `#07080a` |
| 1 | Walls (solid, with a `#2b2a27` rim where seen floor meets them) | `#111214` |
| 2 | Remembered floor (seen before, nothing live shown) | `#1b1b1a` |
| 3 | Lit floor (inside your light right now) | `#3a362f` |
| 4 | Half cover (blocks bullets and bodies, not sight) | `#6b6354` |
| 5 | Characters: you (bone) and hostiles (rust) | `#e8e1d0`, `#c4532c` |
| 6 | Projectiles, muzzle, heard marks (signal) | `#f2d98a` |

That is six roles. No colour exists without one. There is no cyan, no magenta, no neon, no gradient fill, no glow.

## Silhouettes
- You are round, with a barrel that sticks out past the body. The barrel is the facing indicator and reads at about 24 px.
- Hostiles are angular: a blunt arrowhead pointing where they look. Round means you; points mean danger.
- A bound Chog adds a thin inner ring in a muted marking colour. That ring is the only cosmetic change.
- Heard things are rings, never bodies. Seen things are bodies. Shape tells you where the information came from, then colour.

## Light
The vision polygon is the only lighting. Lit floor is clipped to it with a clean edge. No bloom, no blur, no second fake light layer. Faint tile seams exist only inside the light, so speed and distance read while you move.

## Motion and effects (each one says something)
- Tracer: a 0.9 u streak behind each bullet. Yours are signal; hostile ones are a warmer orange so you can tell incoming from outgoing.
- Muzzle flash, 0.05 s: who fired.
- Hit flash, 0.06 s white: that hit landed.
- Hit mark (X at the impact), 0.15 s; a kill mark is rust and thicker.
- Knockback 1.2 u/s: you were hit and from which side.
- Shake: 3 px for 0.12 s, only when you take damage.
- Low-health vignette: rust inset edge below 40% health.
- Heard ring: expands and fades over 1.4 s at the rough area of an unseen sound. Off-screen, a small wedge on the screen edge points at it.
- Alert tick: a short signal bar above a hostile that has seen something and is about to commit.
- Impact cross, 0.12 s: where a bullet hit a wall.
Nothing bounces, pulses, or floats for decoration. No particles beyond the impact cross.

## Typography
One monospace face for everything. Numbers (ammo, health, time) keep their width as they change, so the HUD never jitters. The CSS asks for Iosevka or JetBrains Mono and falls back to the system monospace. Known gap: no font file ships yet, so most players see the system monospace. Adding an OFL font file (with `docs/ASSETS.md`) is a follow-up.

## HUD rules
- Four corners, small, dim: operator top left, hostiles left top centre, health bottom left, ammo bottom right. Mute top right.
- Nothing in the centre of the screen during play except the hint, which fades out after 12 s.
- Copy is verbs and facts: "Shot by Pump from 6 m east." "Guest run. Nothing was saved." No exclamation marks, no emoji, no "SYSTEM" words.

## Audio identity
All sounds are made in code with WebAudio. The palette is dry filtered noise for anything mechanical or underfoot, plus a low sine thump for weight. There are no tonal bleeps and no music.
- Shot: band-passed crack plus a falling thump.
- Run step: brighter heel tick. Creep step: darker, shorter, quieter.
- Impact: high grit. Body hit: dull low thud.
- Death: a long falling tone.
- Reload: two dry clicks.

Pan follows direction, volume follows distance within the sound's radius, and a wall in between muffles it (low-pass) and shrinks the radius.

## Small screens
- The view is fitted so at least 11 u show vertically, which suits a phone in landscape.
- Touch sticks float where the thumb lands. The right stick shows its fire ring, and the reload button is 56 px.
- The HUD respects safe-area insets.

## Originality
Everything here is drawn in code or written for this game. Nothing is taken from Bullet Echo or any other game: no characters, silhouettes, maps, UI, icons, or sounds. No Chog Genesis art is used, because the art rights are UNKNOWN.
