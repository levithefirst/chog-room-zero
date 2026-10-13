# CHOG visual identity in Room Zero (RC-8)

**PROVISIONAL.** Source: `CHOG_Room_Zero_Brand_Guide.pdf` (owner, 2026-10-13). The guide itself states that no
official CHOG brand colour system exists. These values are proposals. They are **not** official or approved CHOG colours
and must not be described that way. No CHOG artwork, NFT image or logo is used; the operators are original drawings
from the guide's written character notes.

## One palette, two consumers

| Token | Value | CSS variable (`index.html :root`) | Pixi (`src/config/brand.ts px()`) |
|---|---|---|---|
| purple | #6B3FA0 | `--chog-purple` | operator body |
| purpleDeep | #4A2C7A | `--chog-purple-deep` | gear (Brick plate, Wick wick, Kettle lid) |
| purpleBright | #8B5CF6 | `--chog-purple-bright` (`--primary`) | operator rim light |
| cream | #FFF8E7 | `--chog-cream` (`--ink`) | face, reticle, own tracers, heard-sound rings, next-zone dashes |
| creamWarm | #F5E6C8 | `--chog-cream-warm` | hostile face, lamp glow in portraits |
| pink | #FF6B9D | `--chog-pink` (`--signal`) | cheeks, hands |
| pinkSoft | #FFB6C1 | `--chog-pink-soft` | hostile cheeks |
| bgDeep | #0E091C | `--bg-deep` (`--bg`) | keylines |
| bgPanel | #1A1228 | `--bg-panel` | pickup crate |
| bgElevated | #2A1F3D | `--bg-elevated` | gun |
| health | #22C55E | `--health` | own overhead bar, health pickups |
| armor | #3B82F6 | `--armor` | armour bars and pickups |
| ammo | #F59E0B | `--ammo` | ammo pickups, HUD magazine ring |
| damage | #EF4444 | `--damage` | low-health bar, hurt vignette |
| enemy | #DC2626 | `--enemy` | hostile outline, bar, pips, edge chevrons |
| ally | #10B981 | `--ally` | ally ring (you; teammates online) |
| pickup | #A78BFA | `--pickup` | "you need this" glow under a pickup |
| dangerZone | #FF2D2D | `--danger-zone` | zone fill, "Outside zone" badge |
| dangerGlow | #FF6B6B | `--danger-glow` (`--hostile` text) | zone edge, hostile tracers, way-back chevron |
| border | #C4BFD4 | `--border` (`--dim`) | button keyline, secondary text |
| disabled | #6B6580 | `--disabled` (`--faint`) | disabled buttons, dead bodies |

`tests/rc8-brand.test.ts` checks that every CSS variable equals `brand.ts`, that the Pixi palette is read from it,
and the contrast of each text treatment. `tools/rc8-shots.mjs` checks the computed CSS in a real browser.

## Treatment changes (token kept, treatment changed)

- **Bright purple is a fill, not small text:** 4.6:1 on `--bg-deep` but 4.3:1 on panels and 3.6:1 on elevated
  surfaces. Accent text uses pink (7.3:1 / 6.8:1). Primary buttons are bright purple with cream text (4.0:1, large
  bold caps, AA for large text).
- **Danger-zone fill at 22% (12% while it does no damage), not 60%.** At 60% the floor, cover and bodies under it
  stopped reading in the screenshots. The edge is a solid #FF6B6B line with a soft glow and a 1 px purple inner line.
- **Hostile text** (errors, "Run over") uses `--danger-glow` (#FF6B6B), not `--enemy` (#DC2626, 3.7:1 on panels).
- **Never colour alone:** allies have a round ring, hostiles a jagged outline that follows their spikes; pickups keep
  their cross / shield / bullets icons and names; the zone HUD says "Zone in / Closes in / Closing / Final zone /
  Outside zone" with a ring icon and a countdown; medal rarity has its label.

## Operators

`src/ui/chogShape.ts`: purple spiky body (valleys and tips straddle the 0.35 u hitbox), cream face toward the aim,
eyes, pink cheeks and hands, one silhouette cue per operator: Kettle a lid with a green knob, Mop a pink sweatband and
thin strands, Brick a square plate and blunt spikes, Wick a lit wick and a scope ring. The same parts draw the menu
portraits (`src/ui/art.ts`) and the bodies in the match (`src/render/render.ts`), at true size (actorScale 1).

## Not done

- No high-contrast mode yet (the guide recommends one). Next candidate if a playtester has trouble.
- Typography stays Barlow Condensed + IBM Plex Mono (both OFL, already shipped); the guide allows a clean sans.
- Not checked on physical phones or with a colour-blindness simulator; screenshots are headless Chrome.
