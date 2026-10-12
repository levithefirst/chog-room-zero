# Chog: Room Zero

A dark top-down tactical shooter for the Chogathon. One basement, five bots, about 90 seconds a run. You see only what your lamp touches; everyone hears everything.

Plays in the browser on PC and on phones held sideways. No wallet or account is needed to play.

## How to test it (5 minutes)

1. Open the preview link in the PR or submission. On a phone, turn it sideways.
2. First launch shows **How to play**. Press **Got it**.
3. Optional: **Chog DEMO** and pick a token number (#1 to #4). This shows how a Chog changes play. It is a demo: no wallet and no ownership check.
4. **Enter**, pick a hero (keys 1 to 4, or tap a card), then **Deploy**.
5. Clear the room: down all five hostiles. If you die, the summary waits 0.75 s before any input counts, then **Again** restarts.
6. The results screen shows time, kills, accuracy, damage dealt and taken, and your best for that hero. Bests are saved on this device only.

### Controls

| | PC | Phone (landscape) |
|---|---|---|
| Move | WASD | Left thumb |
| Creep (quiet) | Hold Shift | Half push on the left stick |
| Aim | Mouse | Right thumb |
| Fire | Hold left click | Push the right thumb past the ring |
| Ability | Space | Ability button |
| Reload | R | Reload button |
| Pause | Esc or P | Pause button, top right |

### What to look for

- **Bullets travel and walls stop them.** Waist-high crates and slabs stop shots unless the shooter leans over from right behind them (Wick's marksman rifle shoots through crates). A blocked shot sparks, clanks, and the cover outline flashes.
- **Sound is information.** Gold rings mark a noise you heard but did not see. Running is loud, creeping is quiet, and bots hear you the same way.
- **Fair fights.** A bot only shoots you from inside your own sight range with line of sight, and the shooter is ringed whenever it hits you.
- **Four heroes, four weapons:** Kettle (rifle, Patch heal), Mop (SMG, Slip dash), Brick (shotgun, Slab cover), Wick (marksman, Ping sonar).

## Why the Chog matters (and its current limit)

A Chog token number maps to one of four tactical sidegrades (Lamp, Wide, Steady, Spray) plus a marking colour. Each trades one strength for a weakness and has a stated counterplay. None changes health, armour, damage or speed. A bound Chog also keeps its own run history on the device.

**Today this is a labelled DEMO.** Chain, contract, ownership method and metadata are not verified, so nothing reads a wallet. The game plays fully without a Chog. See `docs/RELEASE.md` for the known limitations and the deferred plan.

## Run it locally

Needs Node `^22.12.0 || ^24.0.0 || >=26.0.0`.

```
npm ci
npm run dev        # http://localhost:5173
npm test           # unit and simulation tests
npm run build      # typecheck + production build in dist/
npm run preview    # serve dist/ at http://localhost:4173
```

More commands (browser checks, scripted victory runs, duel tables) are in `docs/DEV.md`.

## Tech

TypeScript, Vite, PixiJS 8, Vitest. A deterministic simulation in `src/sim` (no DOM or clock), rendering in `src/render`, input in `src/input`, sound synthesized with WebAudio in `src/audio`. Fonts: Barlow Condensed and IBM Plex Mono (OFL, in `public/fonts`). No paid services and no backend.

Built during the hackathon with AI coding agents (Claude Code and GrokBot) under the owner's direction. Agent rules and the shared state live in `docs/`.
