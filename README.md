# CHOG: Room Zero

CHOG: Room Zero is a dark, top-down tactical multiplayer shooter built for the Chogathon, with five maps and online 1v1, 3v3 and 5v5 modes plus a solo game against bots, where the real traits of a CHOG NFT change how you play by turning into a superpower that both sides can read and counter.

You see only what your light touches, everyone hears everything, bullets travel and walls stop them, so every fight is about information, position and timing rather than reflexes alone.

**Live demo:** https://chogroomzero.xyz (the game) and https://chogroomzero.xyz/library (the official game library with every rule, map and number).

## Why the CHOG NFT matters

A verified CHOG's real on-chain traits give it one superpower, which takes the single ability slot of your operator, so a holder plays a different kit, makes different decisions and is read differently by opponents, while a player without a CHOG keeps the whole game with the operator's own ability.

| Trait (exact metadata) | Superpower | What it does |
|---|---|---|
| Eyes: Purple, fire, Green or cyan laser; Head: Blue Laser | Laser Eyes | A charged beam that burns along a line, stopped by walls and cover; you walk slowly while it charges and fires |
| Eyes: Gradient, Sunset or Plasma visor | Visor | Always on: hostiles inside its radius appear as dots on your tracker, through walls, position only and no damage |
| Mouth: Bubblegum | Bubble | A slow glowing bubble that cages the player it catches for a few seconds |
| Mouth: Drooling | Drool Web | A glob that glues the target and drags it towards a nearby wall |
| Aura: any of its 22 values | Aura | A few seconds of immunity, during which you cannot shoot or throw |

The token's rarity ranks its power from Common to Epic, and the rank only changes the power's duration, reach or radius and cooldown, never your health, armour or weapon damage, and beam damage per second is the same at every rank.

Every power has a visible tell and a written counter: the match intro names each opponent's power, a coloured diamond next to a visible player's health bar shows it, each power has its own sound, beams show a charge line before they fire, and a player caught by a Visor sees TRACKED, so you can step off a laser line, sidestep a slow bubble, stay away from walls against Drool Web, or stop shooting and reload while an Aura is up.

Of the 1,969 CHOG Genesis tokens, 1,351 carry at least one power trait; a holder whose CHOG carries several picks one, the ten 1:1 CHOGs keep their own named signature abilities instead, and a verified CHOG with no power trait starts at 200 health instead of 150 as its only edge, while grenade capacity also rises with tier (3 for free players, up to 13).

X-Ray Eyes, a slow beam that passes through walls without revealing anyone, has no trait in the collection yet, so it exists only in DEMO and CHOG Training, together with the Legendary rank.

5v5 is for verified CHOG holders only and is enforced on the game server for every player and every squad member, while the solo game, 1v1 and 3v3 are open to everyone with the same seven operators, no wallet and no NFT.

Ownership is checked on the server and never trusted from the browser: you sign a free Sign-In with Ethereum message (no transaction, no approval) with MetaMask, Rabby or Zerion, the site reads the CHOG Genesis contract `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763` on Monad mainnet (chain 143) with `tokensOfOwner` and `metadataId` over public RPCs, and then signs a single-use 10 minute ticket that the game server checks with the site before any power or 5v5 access applies, and any failure simply leaves you playing as a free player.

Each CHOG also keeps its own match history, which stays with the token if it is sold, while XP, shards, upgrades and rating belong to the account, so removing the CHOG removes 5v5, the superpower or signature, its Training drill and the token's history.

## How to play

In the solo game (Vs bots) you and two AI teammates face five hostile bots and your side wins when every hostile is down, while online the last side with anyone standing wins, with a time limit after which the side with more health standing wins, although the danger zone usually ends the match first.

| Action | Keyboard and mouse (rebindable in Settings) | Touch (landscape) |
|---|---|---|
| Move | W A S D | Left thumb |
| Creep (quiet) | Hold Shift | Push the left stick less than 60% |
| Aim | Mouse | Right thumb |
| Fire | Hold left click | Push the right thumb past the inner ring |
| Ability or superpower | Space or Q | Ability button |
| Reload | R | Reload button |
| Grenade | Hold G and release, or right click (lands at the cursor) | Grenade button, tap or drag to aim |
| Tactical map | M (M or Esc closes it) | MAP button |
| Pause | Esc or P | Pause button, top right |

You see only inside your light cone, running is loud and creeping is quiet, and bots hear you by the same rules, so pale rings and "last known" marks show noises and positions you heard but did not see, while crates and barriers are half cover that stops bullets.

The tactical map (M) is a full-screen view of the current location with its areas, the danger zone and its next circle, stocked supplies, your side and every living hostile at its current spot, while the game view itself still hides hostiles behind walls; the match keeps running and your operator stands still while it is open.

There are seven operators (Benja, Toad, Ray, Tabsu, Tonashiro, Yot and Bill), each with one weapon and one ability, all starting at 150 health and differing in armour, speed, sight and weapon, and Benja's Ping is a sonar ability that reveals hostiles around you for a moment.

The five locations are Room Zero (the balanced baseline), Office (rooms and corridors), Supermarket (long aisles), Metro Station (chokepoints and tunnels) and Construction Site (high ground), all open to everyone, and online you are matched with players who picked the same location.

In 1v1 there are no revives, in 3v3 and 5v5 a downed player can be revived by a teammate, and friends can queue together as a squad with a squad code.

Signed-in players earn XP, levels, shards and an Elo-style rating on their account, and shards buy upgrades that are the same for everyone, with nothing for sale and no loot boxes:

- **Online match:** 10 shards for playing, 30 for a win, 10 per kill (up to five) and a small damage bonus, for matches of at least 20 seconds, up to 20 rewarded matches a day, and private rooms and DEMO play earn nothing.
- **Solo practice:** the same 10 for a run, 10 per kill and 30 for a clear, with less XP and a smaller damage bonus, up to 1,000 practice shards and 25 rewarded runs per rolling 24 hours.

Rewards are settled on the server: an online result is pulled from the game server, and a practice run only pays with a signed session and a server-issued run start.

## Quick test for judges

1. Open https://chogroomzero.xyz on a desktop browser, read the first-run How to play screen and press Got it.
2. Play as a guest with no sign-in, or press Sign in for Google or a wallet (MetaMask, Rabby or Zerion) if you want rewards saved to an account.
3. On the hub pick an operator, the Vs bots mode and a location, then press Play to start a solo game, and press M during the match to open the tactical map.
4. To try a CHOG power without owning one, open the DEMO button on the main menu, pick a CHOG number or one of the sample tokens per tier, and play solo with its real catalogue tier and traits, all clearly labelled DEMO.
5. On the same DEMO screen, CHOG Training lets you pick any of the six powers (X-Ray included) at any rank and play its short drill against dummies, which records nothing.
6. For online play, choose 1v1 or 3v3 on the hub; a guest sees the 5v5 button locked to verified holders, and two people can meet as DEMO CHOGs by both opening https://chogroomzero.xyz/?mockChog=53&online=1v1&demo=1&code=JUDGE1 (change 53 to any number from 1 to 1969).
7. Open https://chogroomzero.xyz/library for the rules, controls, maps, superpowers, rewards and FAQ, and https://chogroomzero.xyz/api/game/chain for a read-only live check of the Monad ownership path.

## Run it locally

You need Node `^22.12.0 || ^24.0.0 || >=26.0.0` (production runs on Node 22) and npm.

```
npm ci                  # install the locked dependencies
npm run dev             # game at http://localhost:5173
npm test                # unit and simulation tests (Vitest)
npm run typecheck       # TypeScript check
npm run build           # typecheck, game build and library build into dist/
npm run preview         # serve dist/ at http://localhost:4173
npm run build:server    # build the multiplayer game server
npm run server          # start it (port 8787 by default)
```

The solo game runs with no configuration, while the online, account and holder features need these environment variables (names only):

- **Browser build:** `VITE_GAME_SERVER_URL` (the game server's `ws://` or `wss://` address).
- **Site API (Vercel functions):** `AUTH_SECRET`, `AUTH_ORIGIN`, `AUTH_ALLOWED_HOSTS` (optional), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `GAME_SERVER_URL`, `NFT_COMBAT` (set to `0` to switch CHOG powers off).
- **Game server:** `PORT`, `ALLOWED_ORIGINS`, `TICKET_CHECK_URL`, `FRIENDLY_FIRE` (optional).

## Tech stack

- **Game client:** TypeScript, Vite and PixiJS 8, with a deterministic simulation in `src/sim` that has no DOM or clock, and sound synthesized with WebAudio.
- **Multiplayer:** an authoritative Node.js WebSocket server (`ws`) in `server/`, hosted on Render.
- **Site and API:** Vercel, serving the game, the prerendered library and serverless functions for sign-in, tickets, settlement and the leaderboard.
- **Data:** Neon Postgres (`@neondatabase/serverless`), with PGlite for database tests.
- **Wallet and chain:** Sign-In with Ethereum verified with `@noble/curves` and `@noble/hashes`, and plain JSON-RPC reads of Monad mainnet, with no wallet library.
- **Tests:** Vitest unit and simulation tests, including duel-balance tests for every power.

## Notes and honest limitations

- The superpower numbers are proposals that still need tuning from more real playtests, and a real holder playing hosted 5v5 has not been tested yet, while the holder flow is tested against a simulated chain and the live chain path is checked by the read-only `/api/game/chain` endpoint.
- DEMO is always labelled on screen ("DEMO: no wallet is connected and no ownership is checked."), never counts as verified, earns nothing and only meets other DEMO players online.
- No CHOG artwork is shown because the art rights are not confirmed, so the game uses its own original operators and shows tokens as "Chog #N" with their tier.
- Desktop with keyboard and mouse is the most tested way to play, and phones and tablets work in landscape with touch controls, while wallet sign-in on a phone needs a wallet's in-app browser because WalletConnect is not included.
- Online play uses a free Render instance, so the first connection after a quiet period can take a little while to wake the server.
- Guests can play every mode except 5v5, but only signed-in players keep progression, and solo bests and medals for a guest last only for the session.

## License

MIT. See [LICENSE](LICENSE).
