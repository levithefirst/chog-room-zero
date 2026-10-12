# Benchmark: Bullet Echo (ZeptoLab), for P2

Purpose: learn what makes the reference readable and tactical, then build our own version. **Nothing is copied**: no names, art, layouts, UI, icons, or heroes. Researched 2026-10-12 with WebSearch/WebFetch. **Video was not watched** (tools cannot play video), so motion, timing, and exact on-screen layout are ASSUMPTIONS.

Sources: [AS] App Store listing https://apps.apple.com/us/app/bullet-echo-pvp-shooter/id1500726361 · [GP] Google Play https://play.google.com/store/apps/details?id=com.zeptolab.bulletecho.google · [ZL] https://www.zeptolab.com/games/bullet-echo · [BE] https://www.bulletecho.game/ · [HC] Help Center https://zepto.helpshift.com/hc/en/10-bullet-echo/section/82-gameplay/?p=all and FAQ 1039 (hero weapons and abilities) · [BR] third-party guides https://boostroom.com/blog/bullet-echo-best-heroes-guide-classes-abilities-and-how-to-choose-your-main and ...-game-modes-guide-... (community source; lower confidence).

## CONFIRMED (cited)
| Area | Observation | Src |
|---|---|---|
| Vision / fog | Vision is limited to a flashlight beam; enemy steps and shots can be heard outside it. "It's dark out there"; a Visor item widens the visible area. | AS, ZL, HC |
| Team vision | In team modes you share teammates' field of view. | HC |
| Heroes | "Dozens" of heroes; 21 at launch; each has its own gun, play style, abilities. Launch classes: tanks, ambushers, snipers. Current third-party docs list 5 classes (Scouts, Troopers, Enforcers, Gunners, Snipers). | AS, BE, BR |
| Abilities | Each hero has four abilities, unlocked by tier, 18 levels each. | HC |
| Weapons | Gun is fixed per hero. You start with a pistol and switch to the main gun on first ammo pickup. Examples: SMG (agile, less accurate), shotgun, heavy MG with overheating, snipers with strong penetration. | HC, BR |
| Health / armour | HP plus armour; armour penetration is a key damage stat. | HC, GP |
| Pickups | Equipment icons and crates on the map; in-match weapon upgrades. | HC |
| Modes | Team vs Team / Squad vs Squad (5v5), Solo, Battle Royale (5 teams of 3), King of the Hill, TDM, Sabotage, Custom. Maps random per match. | AS, ZL, BE, GP, BR |
| Firing | "Quick fights and auto shooting". | BE |
| Controls | Touch only during battle; no controller support. | HC |
| Knockouts | Downed players can be revived by allies before a timer runs out. | HC |

## ASSUMPTIONS (not verified, treat as guesses)
- Art: stylised top-down, high-contrast characters on muted floors; walls drawn as solid blocks with clear edges; floor geometry stays faintly visible outside the beam.
- Palette: desaturated environment, saturated team/enemy colours, bright tracers.
- Lighting: cone with soft edges; out-of-beam areas dim, not black.
- HUD: health bar near the hero or a corner, ammo near the fire control, ability buttons in right-thumb reach, kill feed / team count at top.
- Sound cues: per-weapon gunshot timbres, footstep direction readable on stereo.
- Pacing: matches of a few minutes; short time-to-kill once you are caught in the open.

## Benchmark checklist (status in our P2 build)
| # | Item | P2 |
|---|---|---|
| 1 | Map readable everywhere; never pitch black outside the cone | DONE (dim baked map, darker fog for unexplored) |
| 2 | Soft vision cone; walls occlude actors and bullets | DONE (soft outer cone + falloff; sim-tested LOS) |
| 3 | Distinct floor materials, walls with edges, cover props, shadows | DONE (procedural bake) |
| 4 | Strong team vs enemy silhouettes, weapon visible | DONE |
| 5 | Heroes with distinct weapon, body, one ability; data-driven | DONE (4 heroes, `src/config/heroes.ts`) |
| 6 | Weapons that truly differ (pellets, falloff, penetration, rate) | DONE (rifle, shotgun, marksman, SMG) |
| 7 | HP + armour with clear rule; healing | DONE (60% soak minus armour-pen; health pickups; Patch) |
| 8 | Pickups visible, labelled, respawning | DONE |
| 9 | Hearing as information (rings, edge markers, per-gun sounds) | DONE |
| 10 | Mobile HUD: vitals, ammo + reload ring, ability cooldown, enemies left, pause, mute, safe areas, portrait prompt | DONE |
| 11 | Damage direction, low-health warning, hit/kill confirmation | DONE |
| 12 | Hero select, loading, pause, recap, results with transitions | DONE |
| 13 | Team play, revive, modes, progression, upgrades | NOT DOING (LOCKED 11/12: solo vs bots) |
| 14 | Auto-fire | DIVERGENCE ON PURPOSE (LOCKED 4: no auto-fire) |

## Gap audit of the P1 build (before P2), by priority
1. Unexplored and out-of-sight areas near black; the map read as void (readability).
2. Flat single-colour floors and walls; no materials, props, shadows, or depth.
3. One shared weapon and identical bodies: no reason to play differently.
4. No armour, healing, or pickups: no resource decisions.
5. No ability (LOCKED 4 asks for one).
6. HUD: health number and thin bar only; no reload ring, no ability, no pause, mute not persisted, no safe-area for buttons, no portrait prompt.
7. No hero select, loading, pause; screens shared one plain card.
8. No font shipped (system monospace fallback).
9. Half cover blocked all shots, even from a shooter leaning on it.
10. Map: few chokepoints, one material, no zones.

## Rules we wrote (documented here so tests can hold them)
- **Armour**: each hit, armour soaks 60% x (1 - weapon armour-pen) of the damage until the armour pool is empty; the rest hits health. Max armour 50 for everyone.
- **Half cover (lean rule)**: crates and barriers stop bullets unless the bullet was fired within 1.25 u of that piece of cover (the shooter is leaning over it). A target hugging cover stays protected from far shooters. The marksman rifle pierces half cover; nothing pierces walls. Cover never blocks sight.
- **Falloff**: linear from falloffStart to falloffEnd down to minDamageMul (`src/config/weapons.ts`).
