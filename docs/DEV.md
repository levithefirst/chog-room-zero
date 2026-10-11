# Local development

Requires Node `^22.12.0 || ^24.0.0 || >=26.0.0` (Vitest 5's range; Node 23 and 25 are excluded) and npm.

```
git clone https://github.com/levithefirst/chog-room-zero.git
cd chog-room-zero
npm ci              # install exact locked deps
npm run dev         # dev server at http://localhost:5173 (dark canvas, cyan circle, WASD moves it)
npm run typecheck   # tsc --noEmit
npm test            # vitest run (tests/**/*.test.ts)
npm run build       # typecheck + vite build -> dist/
npm run preview     # serve dist/ at http://localhost:4173
```

Full validation before a handoff: `npm ci && npm run typecheck && npm test && npm run build`

Layout: `src/sim` pure simulation (no pixi/DOM), `src/render` PixiJS, `src/input` input, `src/config/tuning.ts` every tunable number, `tests/` Vitest.

## Owner checks (not automatable)

PC movement playtest (P0-2): `npm run dev`, open http://localhost:5173, click the page, then hold W/A/S/D.
Questions: does start-up feel snappy rather than floaty? Does stopping plant the feet? Does a reversal (D then A) feel deliberate but not sluggish? Is the diagonal speed the same as straight? Numbers live in `src/config/tuning.ts` (`movement`).

Phone load check (BLOCKED: needs the owner's Pixel 7 / iPhone 13):
1. On the dev machine: `npm run dev -- --host`, then note the `Network:` URL Vite prints (http://<LAN-IP>:5173).
2. Put the phone on the same Wi-Fi and open http://<LAN-IP>:5173.
3. Rotate to landscape. Expect a full-screen dark canvas with a centred cyan circle and no scrolling or zoom. (There are no touch controls yet.)
4. Report: device, browser, whether the circle shows, and any visual glitch.
