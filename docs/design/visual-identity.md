# Visual identity

Status: PROPOSAL, except that effects must communicate gameplay (LOCKED by the owner's brief).

The look must feel chosen by a person, not assembled from defaults.

## Visual Bible comes after the feel works
Once Prototype 0 feels right, write `docs/VISUAL_BIBLE.md` with:
1. One specific sentence of intent (what the light is, what the room is made of, what the Chog looks like).
2. At most 6 colors, each with a gameplay role (lit floor, remembered floor, unknown, player, hostile, information marker). A color with no role is removed.
3. Shape language: what shapes mean friendly, hostile, hazard, information.
4. Two fonts chosen on purpose, with the reason.
5. A small sound palette that matches the look.
6. How the Chog reads at about 24 px. Use Genesis art only within the rights that are verified (UNKNOWN today, see `nft.md`).
7. The only effects allowed and what each one communicates.

## Readability tests (every visual change)
- Grayscale: player, bot, projectile, wall, remembered floor, markers are still distinguishable.
- Half size: still readable at phone scale.
- Squint: the most dangerous thing is the most noticeable.
- Motion: a bullet is visible for at least 3 frames before it can hit.

## Light is the art direction
The vision system is the lighting. Do not add a second fake lighting layer. A clean wall edge and a restrained falloff do more than bloom.

## Banned defaults
Generic neon cyberpunk, cyan and magenta on black, gradient everything, glow on everything, bloom, glassmorphism, rounded floating cards, sci-fi corner-bracket frames, scanline or glitch filters for decoration, particle confetti, shake as seasoning, lens flare, hexagon patterns, stock icon packs or emoji as game icons, stock-looking sprites, default font stacks used as "the game font", copy such as "SYSTEM ONLINE" or "INITIALIZING".

## Allowed effects
Muzzle read so you can see who fired, projectile streak, hit flash, death read, damage direction, ability wind-up telegraph, heard marker. Add one only with a brief.

## Assets
Budget is near zero. Prefer shapes drawn in code and a very small hand-made set. Every asset is original, or its license is recorded in `docs/ASSETS.md`. Do not copy any hero, UI, map, name, sound, or art from Bullet Echo or any other game.
