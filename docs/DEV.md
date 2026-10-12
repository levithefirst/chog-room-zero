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

P1 follow-through checks (Node 22; build first, then `npx vite preview --port 4331`):
- `npx vitest run tests/p1ft-duels.test.ts` duel tables (N=200 per cell, Wilson 95% CI; writes nothing unless `DUEL_OUT=<file>`)
- `npx vitest run tests/p1ft-map-eval.test.ts` spawn-crate evaluation (old vs shipped layout)
- `node tools/p1ft-e2e.mjs http://localhost:4331 /tmp/e2e.json` headless checks (key select, slab nav, HUD labels, tutorial, touches, rotation, background)
- `node tools/p1ft-shots.mjs http://localhost:4331 p1ft-after` screenshots to /workspace/shots

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

## RC-1 run, controls, features (the README lives on the S2 branch; this is the RC copy)
Run (Node 22): `npm ci && npm run dev`, then open http://localhost:5173. Production build: `npm run build && npm run preview`.

Controls:
- **PC:** WASD move · Shift creep · mouse aim · hold left click fire · R reload · Space ability · Esc/P pause · 1-4 pick a hero · Enter/Space confirm.
- **Phone (landscape):** left thumb moves (a half push creeps) · right thumb aims, push past the ring to fire · Ability and Reload buttons · pause and mute top-right.

Features: one map (Room Zero), 4 heroes (Kettle rifle/Patch, Mop SMG/Slip, Brick shotgun/Slab, Wick marksman/Ping), 5 bots that see, hear and investigate. The rule set:
- One reveal rule.
- Bots only shoot from within your sight range.
- First-launch How to play (re-open it from the title).
- Results: time, kills, accuracy, damage dealt and taken.
- Personal bests per hero and overall, saved on this device only.
- NFT DEMO traits: no wallet, no ownership check.

Checks:
- `npm test`: unit + sim tests, including rc-fairness, rc-death, rc-snag, rc-victory, rc-records, rc-nft-demo.
- `node tools/rc-e2e.mjs <url> out.json`: onboarding, DEMO badges, death screen (keyboard + touch), victory + personal best persistence, browser fairness, 844x390/667x375 fit, console errors.
- `node tools/p1ft-e2e.mjs <url> out.json`: regression checks.
- `VICTORY_OUT=f.json npx vitest run tests/rc-victory.test.ts`: per-hero autopilot win table.

Known limitations: see docs/RELEASE.md.

## RC-2: scripted victory rerun and preview checks
- **Autoplay (debug only, SCRIPTED):** `?debug&nooverlay&autoplay=<seed>&hero=<kettle|mop|brick|wick>`. The in-match input comes
  from `src/debug/autopilot.ts`, the same autopilot `tests/rc-victory.test.ts` uses. It plays the normal match against the normal bots:
  no bot deletion, no damage or health changes. Menus still need real clicks or keys. Each "Again" uses seed + run index.
  The autopilot has full map knowledge and no reaction delay, so its win rate overstates a human's (ADE rc1-code-check). Human wins stay UNVERIFIED.
- **Browser rerun:** `node tools/rc-autoplay.mjs <baseUrl> <out.json> [maxAttempts=30] [heroes=kettle,mop,brick,wick]`. It clears
  localStorage once, then for each hero clicks Enter/Deploy, waits for results, clicks Again after the 0.75 s gate until a win, then
  reloads and reads the saved personal best from storage and the title.
- **Preview checks:** `node tools/rc2-preview-checks.mjs <baseUrl> <out.json>` (`ONLY=A,C1,B,C2` to pick sections): A is the door-stall sweep on the
  bundled sim (`__chog.lab`), C1 is Wick vs Brick on the bundled sim, B is the live blocked-shot flash/spark/cue (screenshot next to the JSON),
  and C2 is a live Brick match audit (every hit from within sight range, shooter revealed).
- **Ring hint repeat:** `node tools/p1ft-ring-repeat.mjs <baseUrl> 20 <out.json>` runs p1ft-e2e section 4 verbatim N times from the leaked touch state.
