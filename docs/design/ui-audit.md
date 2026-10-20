# UI/UX audit: Chog Room Zero vs 20 shooters (UIX, 2026-10-20)

Base: `claude/h34-maps` b0bc19d (= production d98ef8d + tools/docs). Research and the 45-item checklist (C1-C45):
`/workspace/reports/ui-research.md` (not in the repo). Before shots: `/workspace/shots/uix-before/` (7 viewports, headless
Chrome, emulated touch). The implementation is the source of truth. N/A = the game does not have it (not built here).

Overall before: a coherent dark-tactical identity already exists (Barlow Condensed + Plex Mono, CHOG purple/pink, thin
borders, SVG icons, parallelogram primary). The biggest amateur tell was **scale**: every menu and HUD was fixed-pixel for
1280x720, so at 1080p text was 11-14 px on a 1920 screen and at 1440p the HUD was a postage stamp (C11, C42). Second: the
loading screen spoke to the engine (FONTS / RENDERER / ROOM / PLAYER / ACCOUNT chips) instead of the player.

| Area | CHOG current (before) | World-class standard | Gap | P |
|---|---|---|---|---|
| Resolution scaling | Fixed px at every size; 1080p HUD text 11-14 px | HUD/menus scale with output res; HUD scale 80-130% (Fortnite, Doom, BF6) | No scaling, no setting | P0 |
| Loading (boot) | Logo, real bar + %, rotating tip, 5 engine step chips | Branded, real progress, content (map/loadout) not plumbing (Apex, Valorant) | Dev labels; no briefing | P0 |
| Loading (deploy) | Map name, operator, tip, ~0.4 s | Map + objective + loadout briefing (Valorant/R6 load screens) | No map, no objective, ability unnamed | P1 |
| Menu / hub | Strong: live room backdrop, big PLAY bottom-right, mode + 5-location picker, leaderboard | One-tap play, clear hierarchy | Minor: sub-12 px kickers | P2 |
| HUD health | Bar + number top-left, ghost drain, red when low | Segmented (25 HP) + number; low = colour + words + pulse (OW, C12-13) | No segments; low = colour only | P1 |
| HUD armour | Thin bar + number under health | Distinct break cue (Apex shield crack) | No break cue | P1 |
| Ammo / reload | Mag/reserve + ring; red only when fully dry; "-- reloading" | Low amber, empty red + RELOAD, progress visible (C16-18) | No low/empty-mag state | P1 |
| Weapon UI | Name + ammo panel bottom-right | Same | OK | P3 |
| Crosshair | Spread-aware cross (PC) | Spread + outline + hit confirm at reticle | No reticle hit confirm | P1 |
| Minimap / map UI | None in match; Visor tracker only for that power | Minimap only with legit info (fairness) | Deliberately absent (fog-of-war design) | P3 |
| Ping system | Ping is an operator ability (sonar), not a comms ping | Apex contextual ping | Different mechanic; no comms ping | N/A |
| Enemy indicators | Damage arc with distance for unseen shooter; reveal ring; red chevron pips | Edge arcs, shape+colour (C24, C26) | Good | P3 |
| Teammate indicators | Green ring + overhead bars, AI call-out chips | Same | OK | P3 |
| Objective / enemies left | "5 HOSTILES" + pips + zone phase/timer top-centre | Same | Good | P3 |
| Match timer / zone | Zone phase words + countdown, red edge outside | Same | Good | P3 |
| Hit feedback | World X 0.2 s (kill red), confirm tick sound, sparks | 200-500 ms marker, kill 500-800 ms + emphasis, damage numbers batched (C27-29) | Too short; no numbers | P1 |
| Damage feedback | Arc, vignette, hurt flash, shake by damage | Same + reduced-motion option | No motion option | P1 |
| Kill / elimination feed | Top-right feed 6 s + centre toast | Same | OK | P3 |
| Death | "Down" recap: killer, weapon, metres, compass, insights | Apex/CS2 recap | Good | P3 |
| Victory / defeat | Distinct headline colour, stats, medals, Again | Distinct + entrance + input gate (C32) | Gate exists (summary gate); OK | P2 |
| Post-match / rewards | Real stats, PB tag, reward box, medals | Same (C33) | "Under 20 s: no reward" copy reads like a rule dump | P2 |
| XP / levels / medals | Exist (account; 40 medals; level bar on hub) | Same | OK | P3 |
| Matchmaking / lobby | Online 1v1/3v3 queue, squads by code, 5v5 holders only (server) | Queue state, cancel | Exists; online not testable on a preview (server origin list) | P2 |
| Mode / map select | Mode tabs + 5 location cards (sheet on phones) | Same | Good | P3 |
| Pause | "Paused / The basement waits." + 3 buttons | Run state + controls + settings (Valorant/CS2 Esc) | No state, no legend | P1 |
| Settings | Volume, sound, stick, vibration, tips, share, quality | + HUD scale, reduced motion, colourblind (C11, C41, C43) | No HUD scale/motion | P1 |
| Colourblind | Hostile red / ally green, but shape differs (chevron vs ring) | Named presets (Valorant) | Shape carries it; no preset | P2 |
| Controls / keybinds | Hint pill, Game Docs, How to play | Legend on pause; remap | No legend in match | P2 |
| Mobile controls | Floating sticks, ability/grenade/reload in right-thumb arc, 56-72 px, stick size | 48 px+, safe areas, layout editor (C37-39) | No layout editor / left-hand swap | P2 |
| Portrait | Stage rotated 90 deg (landscape-locked by owner LOCKED 4) | Rotate prompt or real layout | Designed choice; OK | P3 |
| CHOG traits | DEMO labelled everywhere; class line on HUD; Training drills | Plain line, real numbers (C45) | Deploy did not name the ability/class | P1 |
| Notifications / toasts | Toast top-centre below band, hint pill | Never centre combat zone (Splitgate) | OK | P3 |
| Onboarding | First-run How to play, tips toggle, Training | Same | OK | P3 |
| Typography | Barlow Cond + Plex Mono tabular | Two faces, tabular | OK; sizes failed at 1080p+ (scale) | P0 (via scale) |
| Iconography | One SVG stroke set (hub, sys buttons, grenade) | Same | OK | P3 |
| Motion | rise 280-320 ms entrances, pulses; some reduced-motion rules | 150-250 ms; in-game toggle (C43) | No toggle; shake always | P1 |
| Accessibility | Text contrast tuned (pink 7.3:1); words with colour | 4.5:1, 12 px min, reduced motion | 10-11 px labels; no motion toggle | P1 |
| Performance | DOM touched only on value change; canvas FX | Same | OK; bundle 726 kB (236 kB gz) | P3 |
| Multiplayer HUD | Online uses the same HUD | Same | OK | P3 |
| Revive UI | Downed card with countdown + bar | Same | OK | P3 |
| "AI browser game" tells | Engine step chips; tiny fixed type on big screens; "The basement waits." filler | Purposeful copy | Fixed by C1-C3/C6 | P0/P1 |

Counts: P0 3 (scale, boot loading, typography-at-scale), P1 11, P2 8, P3 rest; N/A 1 (comms ping).
What was implemented is listed in docs/HANDOFFS.md (UIX) and the PR.

## Hub and loading pass (owner 2026-10-20)

```
BRIEF: Hub as a game menu; loading as entering the world
PURPOSE      On a phone the hub's leaderboard and squad panels took a third of the screen and competed with PLAY;
             the loading screen read as a web page loading.
GAMEPLAY     None changed. The hub answers one question: what next? Pick location and mode, PLAY.
NFT RELATION Not NFT related.
PLAYER FEEL  PLAY is the one big control (measured: at least twice the area of any menu button at every viewport).
TECH COST    Half a day. No dependency, no new system: one screen (Squad) reusing the squad panel's own controls.
RISK         Squad harder to find. Kept as a named button with its member count (2/5) on the hub.
SCOPE        Owner-requested. It removes two hub panels and adds no system.
QUALITY BAR  Mediocre = a dashboard of cards, or a splash of generic shooter art. Avoided: compact destinations of
             one family; the loading backdrop is the location you are about to play, drawn from its own tiles.
VERDICT      KEEP.
```

Hub (`src/ui/hub.ts` `hubHtml`, `squadScreenHtml`; `index.html` "CF hub"):
- One menu, one family: Upgrades, Medals, Leaderboard, Career, Game Docs, Squad (and DEMO). Same height, icon, type, hover and focus states. A count or rank rides on the right (medals 28/40, your rank #1, squad 2/5).
- Leaderboard opens the existing full Leaderboard screen. Squad opens a Squad screen with the same Create, code, Join, members and Leave as the old panel. Browser Back and the screen's back button both return to the hub.
- The right column now holds only a verified Chog's card, if you have one.
- A short stage (`body.tiny`, 380 px tall or less: phones from 320 x 568 to 375 x 667) folds the menu to a two-column block of icons; each keeps its name as aria-label and tooltip.

Loading (`index.html` `#boot`, `src/main.ts` `bootBrief`, `src/ui/mapPreview.ts` world variant):
- Backdrop: the location you last picked, drawn from its real tiles with its lit areas and area names, tilted under one sweeping lamp. Its YOU ring sits on the real solo start.
- Left: the wordmark (CHOG: / ROOM ZERO), the game's own line "Information is a resource.", and three pillars that are real rules (hear, see, outplay).
- Bottom right: the deploy card (operator portrait, location, operator, weapon). Top right: the real counts (5 locations, 7 operators, up to 5v5) from the config.
- Bottom: one real tip, the bar and the real step it waits on. The bar moves only on `boot()` steps; nothing is staged for show.
- Reduced motion (system or Settings): nothing animates; the world is still drawn.

Evidence: `tools/uix2-hub-loading.mjs` (10 viewports from 320 x 568 to 3440 x 1440, emulated; NOT devices).
Open: the owner on a real phone: "is PLAY the first thing you see, and can you still find Squad?"
