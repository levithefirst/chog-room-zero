# Local development

Requires Node >= 22.12 (Vitest 5 engine requirement) and npm.

```
git clone https://github.com/levithefirst/chog-room-zero.git
cd chog-room-zero
npm ci              # install exact locked deps
npm run dev         # dev server at http://localhost:5173 (dark canvas, one cyan circle)
npm run typecheck   # tsc --noEmit
npm test            # vitest run (tests/**/*.test.ts)
npm run build       # typecheck + vite build -> dist/
npm run preview     # serve dist/ at http://localhost:4173
```

Full validation before a handoff: `npm ci && npm run typecheck && npm test && npm run build`

Layout: `src/sim` pure simulation (no pixi/DOM), `src/render` PixiJS, `src/input` input, `src/config/tuning.ts` every tunable number, `tests/` Vitest.

Phone check: `npm run dev -- --host`, open the Network URL on a phone on the same Wi-Fi.
