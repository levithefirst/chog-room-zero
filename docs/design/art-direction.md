# Art direction: Room Zero (P2 rewrite)

## Intent
A service basement after the power died, lit by one hand lamp. The level is **always readable**: you can always see the shape of the floor, walls, doors, and cover. The lamp decides what is **known now**; everything else is memory. Hostiles and bullets exist only where the lamp (or a Ping) shows them.

## Three states of every tile
| State | Look | Why |
|---|---|---|
| In the lamp | Full material colour, warm tint, additive glow near you, falloff toward the edge; a soft outer band (+10 deg each side, half brightness) so the cone never has a hard cut | Here is the truth |
| Seen before / out of sight | Same map, baked darker (~44%), 65% desaturated, slightly cool | Navigable memory, no actors |
| Never seen | The dim map under a 60% near-black fog | Unknown, but walls still faintly read: never pitch black |

## Value hierarchy (lightest to darkest)
1. Signal yellow `#f2d98a`: muzzle flash, player tracers, alerts, ready ability. Used sparingly.
2. Team bone `#e6dfcc` (round body, dark outline, hero accent ring) vs hostile rust `#c8502b` (angular arrowhead, dark outline). Shape AND colour differ, so it works for colour-blind players.
3. Pickup colours: health sage `#9fd18b` (cross), armour steel `#8fb0c8` (shield), ammo ochre `#d9c27a` (three rounds). Each has a word label.
4. Floors, mid values: tile (cool grey, 2x2 grout), concrete (warm grey, speckle, joints every 3 u), metal (dark blue-grey, diamond plate, seams, rivets), dock (olive, hazard band at its edge).
5. Cover: crates (wood, lid, braces) and barriers (concrete, ochre stripes). Lighter than walls, darker than signal.
6. Walls: the darkest masses, with a lit rim on every edge facing floor and a darker south face for height.

## Light and shadow
Light comes from the north-west: walls cast a 0.3-0.45 u shadow south-east, cover 0.25 u, actors a soft ellipse. Grime gathers along walls; cracks and stains sit on floors. All baked once (procedural, seeded; no image assets).

## Motion and feedback
Walk bob tied to the step cycle; recoil kick per gun; reload dips the gun and draws a ring; death shrinks and fades in 0.4 s, then leaves a decal. Tracers: marksman long and thick, shotgun short pellets, SMG thin. Hits: white cross, kill: rust cross plus sparks. Getting hit: red arc around you pointing at the shooter, screen-edge flash, shake, low thud. Low health: pulsing rust vignette.

## Typography (SIL OFL 1.1, self-hosted in `public/fonts/`, licences alongside)
Barlow Condensed (500/600) for words: narrow, industrial, fits landscape phones. IBM Plex Mono (400/600) for numbers so health and ammo never jitter.

## HUD and screens
Panels: near-black at 78% with a 1 px warm-grey line, 6 px radius. Vitals top-left, hostiles top-centre, mute/pause top-right, weapon bottom-right (bottom-centre on touch), ability and reload in right-thumb reach. All screens share one card style with a fade-and-rise transition. No gradients except the functional ability cooldown ring.

## Not allowed
Neon, purple-cyan gradients, glassmorphism, generic sci-fi glow, stock icons, anything resembling Bullet Echo's heroes, maps, or UI.

## Performance rules
Map baked once per distinct map into a 32 px/u RenderTexture (1408x832); per frame only two masks, one falloff and one glow sprite, and the actor and effect Graphics. Sparks come from a fixed pool of 60.
