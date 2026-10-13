# Online multiplayer (RC-8)

Status 2026-10-13: **hosted on Render Free** (`https://room-zero-game.onrender.com`, owner-created), connected to the RC-8
preview only. 1v1 verified end to end on the hosted server; 3v3/5v5 hosted runs and real devices still to do (below).
Solo play against bots is unchanged and needs no server.

## Before RC-8

Everything was local: one browser ran the whole sim (`src/sim`) against five bots. No server, no network code.
`api/auth/*` (Vercel Functions) only proves identities; it holds no game state.

## Approach (lowest cost that is genuinely authoritative)

One small Node process runs every match with the **same deterministic sim** the solo game uses, at its fixed 60 Hz
step. Browsers send controls only and draw what the server sends.

| Piece | File | What it does |
|---|---|---|
| Protocol | `src/net/protocol.ts` | JSON messages; `parseClientMsg` validates every client message (size, types, ranges); move vector clamped to 1, aim normalised. |
| Lobby and rooms | `server/room.ts` | Guest hello (callsign validated, unknown operator -> Kettle), session token, queues per mode and optional private code, rooms of 2 / 6 / 10, teams alternate in join order (west vs east spawns), 3 s countdown, sim step, snapshots, results. Transport-free, unit-tested. |
| Host | `server/index.ts` | `ws` WebSocket server on `/ws`, health text on `/`, `/stats`, 512-byte message cap, text frames only, optional `ALLOWED_ORIGINS`. |
| Client | `src/net/client.ts` | Connect, queue, controls at 30 Hz (taps sent at once), snapshot buffer, interpolation, reconnect with the token, a "view world" the normal renderer and HUD draw (you are actor 0). |
| Game UI | `src/main.ts`, `src/ui/screens.ts` | Menu > Online: mode (1v1 / 3v3 / 5v5), private code, queue status, cancel; online pause (match goes on, you stand still); online results (not mixed into solo records or medals). |

### What the server decides (the browser never does)

Movement (from controls, at the hero's speed; a longer move vector is clamped), firing, bullet travel, cover, hits,
damage, armour, kills, pickups, abilities, the danger zone and its damage, eliminations, the winner, the time limit.
A client message cannot carry a position, a hit, damage or a result: unknown fields are dropped by the validator.

### Fair information

A snapshot to a player holds their own team, and an enemy only when a teammate can see it (cone + walls), its muzzle
flash was seen in the last 0.7 s, a teammate's Ping shows it, or it is down. Bullets: own team's, or ones a teammate
can see. Sounds: those the player can hear (same hearing rule as solo). So a modified client cannot draw hidden enemies.

### Rules

- Modes 1v1, 3v3, 5v5; even teams; same map, operators, weapons, pickups and danger zone as solo. The zone's last
  circle is drawn from centres about equally far from both team spawns.
- Friendly fire **off** (as solo, CHOG-AI-002). A server can switch it on with `FRIENDLY_FIRE=1` (tested both ways).
- A match ends when one side has nobody standing (draw if neither does), or at 240 s: more health standing wins.
- Queue timeout 90 s (the client says so and offers solo). Idle socket 10 s -> closed (clients ping every 2 s).
- Disconnect in a match: the operator stands still for 20 s; the same tab (or a reload of it) resumes with its
  session token. Not back in time: out of the match (`left`), counted like any elimination.
- Rate limit: token bucket, 90 messages/s, burst 60; a sustained flood closes the socket.
- No accounts, no database, no NFT, no payments. Online names are callsigns (or Guest-XXXX); nothing is stored.

## Evidence (all on one machine, loopback network)

- `tests/rc8-online.test.ts`: 20 unit tests (validation, clamping, matchmaking for all three sizes, private codes,
  guest names, queue timeout, spawns, countdown, visibility filtering, server-decided kill and win with a forged
  `damage` field ignored, friendly fire off/on, time limit, rate limit, idle timeout, hello-first, resume, grace
  expiry, leaving).
- `tools/rc8-online.mjs`: the real server process plus one **separate headless Chrome process per player** (own
  profile directory), each running the real built game and driven only by real keyboard and mouse events. A scripted
  player in each walks to the final circle and fires at what its own screen shows. Results in `docs/HANDOFFS.md` H16.

## Status matrix

| Mode | Implemented | Tested with independent clients in one authoritative match | Deployed |
|---|---|---|---|
| 1v1 | yes | yes: 2 browser processes, loopback, incl. mid-match reload and resume; HOSTED: 2 external browsers via the preview and Render, full match | Render Free, preview only |
| 3v3 | yes | yes: 6 browser processes, loopback; hosted not run | Render Free, preview only |
| 5v5 | yes | yes: 10 browser processes, loopback (4-core machine at load ~36: slow frames, match still completed); hosted not run | Render Free, preview only |

Not tested: real internet latency and packet loss, phones or touch input online (the touch path produces the same
controls as in solo, but no online run used it), more than one match at a time on the server, a hosted server.

## Known limits

- No client-side prediction: your own operator moves when the server says so (about one round trip plus up to
  50 ms). Fine on loopback; on a phone network it will feel delayed. Next step if playtests say so.
- Others are drawn 100 ms in the past (interpolation), so on your screen a target is slightly behind where the
  server has it. No lag compensation: you lead your shots by your ping.
- One server process holds every room in memory; a restart ends running matches. Fine for a hackathon.
- Bots are never added online and nothing online is labelled as a person unless it is one.

## Hosting (owner decision; nothing is deployed or paid for)

| Option | Cost | Fit | Checked |
|---|---|---|---|
| Vercel (this project) | already paid by the project's plan | **No** for rooms: Functions can upgrade a WebSocket, but each connection is pinned to whichever function instance it reached, so two players are not guaranteed the same in-memory room or tick loop. | Vercel docs, `experimental_upgradeWebSocket`, 2026-10-13 |
| Render, free web service | $0 | Runs `server/index.ts` as is. Spins down after 15 min with no traffic (WebSocket messages count since Feb 2026); the first visitor waits about a minute; 750 free instance hours a month. | render.com/docs/free and changelog, 2026-10-13 |
| Cloudflare Durable Objects (Workers free plan) | $0 within daily limits | One object per room fits well, but needs a port of the host to the Workers runtime (the sim is plain TS). Free tier: 100k requests/day, WebSocket messages counted 20:1. | developers.cloudflare.com pricing, 2026-10-13 |
| Railway | trial credit, then a paid plan | Runs the Node server as is; an MCP tool is connected in this environment. Ongoing cost. | not priced here; needs the owner's yes |
| Fly.io | pay as you go (card) | Runs the Node server as is. Ongoing cost. | not checked this session |

**Recommendation:** Render free web service for the hackathon ($0, no code change): build `npm ci && npm run
build:server`, start `npm run server`, env `ALLOWED_ORIGINS=https://chogroomzero.xyz,https://chog-room-zero.vercel.app`.
Then set `VITE_GAME_SERVER_URL=wss://<service>.onrender.com/ws` in the Vercel project and redeploy the client. Until
then Online says plainly that the server is not deployed. Owner: create the service (needs an account) and approve.

## Render Free deployment (owner approved 2026-10-13)

`render.yaml` (repo root) is a Render Blueprint for exactly one service: `room-zero-game`, **plan free** (Render's
default for an omitted plan is the paid 0.5c-512mb), region frankfurt, branch `ccr-e7fadb8f-qtochk`, build
`npm ci && npm run build:server`, start `npm run server`, health check `/`. Environment variable names:
`NODE_VERSION` (22.22.0, the tested runtime; `package.json` engines has no upper bound) and `ALLOWED_ORIGINS` (the
RC-8 preview's stable branch URL only). `PORT` is provided by Render. No database, no disk, no secrets.

Owner steps (this agent has no Render access, and this environment's network blocks render.com and onrender.com):
1. dashboard.render.com > New > Blueprint > connect GitHub repo `levithefirst/chog-room-zero` > branch
   `ccr-e7fadb8f-qtochk` > Render reads `render.yaml` > check it says **Free** > Apply. No card is needed for Free.
2. Copy the service URL (`https://room-zero-game....onrender.com`). `GET /` must answer `room-zero game server ok`.
3. Then the agent sets `VITE_GAME_SERVER_URL=wss://<that host>/ws` on Vercel, Preview, branch
   `ccr-e7fadb8f-qtochk` only (production builds never see it), and redeploys the branch preview.
4. Testers use the branch URL https://chog-room-zero-git-ccr-e7fad-e59a4d-levithefirst-1227s-projects.vercel.app
   (the per-deployment preview URLs are not in `ALLOWED_ORIGINS`; the server answers them with HTTP 401).

Free-tier behaviour the client handles: the service sleeps after 15 minutes with no traffic and takes about a minute
to wake. Opening Online sends an HTTP request that wakes it and retries the socket every 3 s for up to 90 s, showing
"Waking the game server (free hosting, up to a minute)". An open game page pings every 2 s, which keeps it awake.
750 free instance hours a month per workspace; rooms live in memory, so a restart or redeploy ends running matches.

## Hosted results (2026-10-13)

- Render: `GET /` 200 `room-zero game server ok`, `/stats` 200 (checked from outside; this agent's container cannot
  reach onrender.com, its network policy rejects the host).
- Vercel: `VITE_GAME_SERVER_URL=wss://room-zero-game.onrender.com/ws`, type plain, target Preview, git branch
  `ccr-e7fadb8f-qtochk` only. Production variables unchanged. The built preview bundle contains the address.
- Hosted 1v1 (preview 6301737 + Render): two separate external headless browsers (a scraping service, US region),
  each opening `?debug&online=1v1&code=HOSTC5&drive=1` on the branch URL: connected, hello, matched in 1.4 s, 184
  snapshots each, round trip 107 / 122 ms, both moved from their spawns to the centre, exchanged fire (126 / 144
  damage), bravo was shot, alpha won at 10.6 s, and both received the same server result. PASS.
- Found and fixed on the way: (1) the keep-alive ping ran in the render loop, so a slow or backgrounded page was
  closed by the server's 10 s idle rule (seen live: "No messages for too long"); it now runs on a timer.
  (2) Render redeploys the server on every push to the branch, which ends running matches (seen live: both players
  dropped at once with close 1006 and could not resume). Do not push during play tests.
- Not run on the hosted server: 3v3 and 5v5 (the external browser service runs only 2 browsers at once), mid-match
  reload on the hosted server, a long zone-only match, physical phones, separate home/mobile networks, Render logs
  (owner dashboard only). All of these passed locally (`tools/rc8-online.mjs`, `tests/rc8-online.test.ts`).
- Testers must use the branch URL https://chog-room-zero-git-ccr-e7fad-e59a4d-levithefirst-1227s-projects.vercel.app;
  per-deployment preview URLs are refused by `ALLOWED_ORIGINS` (HTTP 401 on the socket).
- Debug hook for hosted checks: `?debug&online=1v1|3v3|5v5&code=XXXX&drive=1` joins at boot and lets a scripted
  player send controls on a 50 ms timer; `<body data-netlog>` carries the server-reported state and result.

## Run it locally

```
npm run build:server && PORT=8787 npm run server      # game server
npm run build && npx vite preview --port 4332          # game
open two browsers at http://localhost:4332/?server=ws://127.0.0.1:8787/ws  -> Online -> 1v1
node tools/rc8-online.mjs http://127.0.0.1:4332 out.json [shotDir]   # MODES=1v1,3v3,5v5
```

## Brief

```
BRIEF: Online multiplayer 1v1 / 3v3 / 5v5 (RC-8)
PURPOSE      Owner mandate: real players against each other, not only bots.
GAMEPLAY     Same choices as solo (cover, angles, sound, the zone) against people; team play in 3v3 and 5v5.
NFT RELATION Not NFT related. No wallet, no token, no gating; guests play.
PLAYER FEEL  The same game; on loopback no visible delay. On real networks: one round trip before you move (no prediction yet).
TECH COST    ~1 day; server/{room,index}.ts, src/net/{protocol,client}.ts, main/render/screens hooks; dependency: ws (server only).
RISK         Cheating, desync, hosting cost, latency. Server authority, visibility filtering, validation; host is the owner's call.
SCOPE        Changes LOCKED 11/12 (owner, RC-8). Cuts: no ranked play, accounts, chat, friends, parties, spectating,
             bots online, prediction or lag compensation, second map, persistent online stats.
QUALITY BAR  Fake "online" with bots, or results the browser decides, would be worse than none. Neither exists here.
VERDICT      MODIFY: built and tested locally; deploy after the owner picks a host.
```
