# Local development

Requires Node `^22.12.0 || ^24.0.0 || >=26.0.0` (Vitest 5's range) and npm.

```
npm ci              # install exact locked deps
npm run dev         # http://localhost:5173
npm run typecheck   # tsc --noEmit
npm test            # vitest run (tests/**/*.test.ts)
npm run build       # typecheck + vite build -> dist/
npm run preview     # serve dist/ at http://localhost:4173
```

Full validation: `npm ci && npm run typecheck && npm test && npm run build`

Browser run (headless Chrome, screenshots, console errors): start `npm run dev`, then
`node tools/browser-run.mjs http://localhost:5173/ /tmp/shots [all|desktop|phone]` (writes `p2-*.png`).

Layout: `src/sim` pure deterministic simulation (no pixi, DOM, or clock): `world.ts` (match step, armour, pickups, abilities), `bots.ts`, `vision.ts`, `level.ts` (map, collision, lean rule, A*), `match.ts` (flow table), `geom.ts`, `operators.ts` (NFT sidegrades). `src/render` PixiJS (`bake.ts` one-time map bake, `render.ts` per frame). `src/input` keyboard, mouse, touch. `src/audio` WebAudio synthesis. `src/nft` identity adapters and token history. `src/config` tuning, map, heroes, weapons. Add a hero: one entry in `src/config/heroes.ts`.

Dev flags: `?mockChog=1234` binds a mock Chog (not a real ownership check). `?debug` exposes `window.__chog` in a production build.

## Owner playtest: PC
1. `npm run dev`, open http://localhost:5173, click to enter.
2. Pick a Chog (1-4 cards). WASD move, Shift creep, mouse aim, hold left click to fire, R reload, Space ability, Esc pause.
3. Try: creep past a door without being heard; fire once and watch for heard rings; get shot and read the recap; clear the room.
4. Answer: Is movement snappy, not floaty? Is a death always explained by the recap? Can you tell a heard ring from a seen enemy at a glance? Do bots ever feel like they cheat (know where you are without seeing or hearing you)? How long did a clear take?
5. Then try `?mockChog=7` and `?mockChog=8` to feel two sidegrades.

## Owner playtest: phone (BLOCKED until done on Pixel 7 and iPhone 13)
1. On the dev machine: `npm run dev -- --host`; note the `Network:` URL (http://<LAN-IP>:5173).
2. Phone on the same Wi-Fi, open that URL, turn to landscape, tap to enter. Tap the speaker icon to check audio (the choice is remembered).
3. Left thumb anywhere on the left half: move (half push creeps). Right thumb on the right half: aim; push past the inner ring to fire. Ability and Reload buttons sit at the right edge; pause and mute top-right.
4. Report: device, browser, smooth or stuttering, sticks comfortable, sound works after the first tap, text readable, anything cut off by the notch.
