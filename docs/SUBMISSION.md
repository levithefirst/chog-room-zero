# Chogathon submission draft (owner fills the blanks)

Source of the requirements: chogathon.chog.xyz, "What you'll submit" and "How we'll judge" (read 2026-10-12 through a cached copy from 2026-10-11 23:36 UTC). The deadline is UNKNOWN: the page says "Registrations stay open until Oct 11, 13:00 UTC" in one place and "It opens when submissions close: Oct 9, 15:00 UTC" in another. Confirm it in the Chog Discord before relying on either.

The judges' scoring sheet on that site says: "Gate = NFT essentiality (must pass to qualify)." Read the risk under 03 before submitting.

## 01 Your project
- Name: Chog: Room Zero
- Team members, Discord and X handles: OWNER TO FILL

## 02 What you built
A dark top-down tactical shooter in the browser, for PC and phones. One basement, five bots, about 90 seconds a run. You only see what your lamp touches, and sound is the other half of the information: gold rings mark noises you heard but did not see, and bots hear you the same way. Bullets travel and walls stop them. Bots take cover, investigate noises and only shoot you from inside your own sight range, so every death can be explained. Four heroes with one ability each (Kettle rifle and heal, Mop SMG and dash, Brick shotgun and portable cover, Wick marksman and sonar). Results and per-hero personal bests give a reason to replay.

Online: 1v1 and 3v3 for everyone, 5v5 for verified Chog holders, on an authoritative server (the server decides every hit). A persistent, account-based leaderboard ranks players by opponents killed in saved matches; owning a Chog never moves anyone up it.

What is new: the Chog decides what you can play and how you start. Rarity sets starting power, the ten 1:1 Chogs each carry their own signature ability, and 5v5 is for holders only. Free players earn shards to climb to Common power; rating is separate from power.

## 03 Why Chog matters
Built and tested (2026-10-14, see `docs/design/power.md` and `docs/HANDOFFS.md`):
- **Real ownership check.** Sign in with the wallet (free signature, no transaction). The site then reads Monad mainnet (chain 143, contract `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763`): `tokensOfOwner` for the wallet and `metadataId` for each token, so the token-to-traits mapping comes from the contract, not from us. Any failure plays on as a free profile. The browser's claims are never trusted: the site signs a 10 minute single-use ticket and the game server asks the site whether it is genuine.
- **Holder-only 5v5**, enforced on the game server.
- **Rarity sets starting power** (Common to Epic: more health and armour; 1:1: the top tier plus one of ten signature abilities such as Flashfire, Howl, Gold Shell). Speed never changes. Every tier is shown to the other side.
- **Token history** is saved per token and stays with the token when it is sold; account XP and shards stay with the account.
- **Removal test:** remove the Chog and you lose 5v5, your tier and signature, and the token's history.

Honest limits (say them in the submission):
- NFT combat power for real holders is switched off in production until a person has playtested the feel (the project's own Core Feel Gate). Holders already get 5v5 and verified identity; the tier power can be seen in the labelled DEMO (any Chog number, solo or demo-only online rooms, no rewards).
- Saved progression and the leaderboard run on the owner's Neon database (connected 2026-10-14). They fill only from signed-in online matches; no match had been saved yet at the time of writing.
- A real holder signing in and playing 5v5 has not been tried yet. The holder flow is tested against a simulated chain, and the live chain path is checked on the deployed site by a read-only self-check (`/api/game/chain`).
- No Chog artwork or token titles are shown: their rights are not confirmed. The game uses its own operators and shows "Chog #N".

## 04 Show it working
- Working demo: the candidate preview URL (recorded in `docs/STATE.md` and the PR). Only the owner may promote it to production.
- Testing instructions: `README.md`, "How to test it".
- Demo link for judges without a Chog (labelled DEMO, no wallet, demo-only rooms, no rewards): `https://chogroomzero.xyz/?mockChog=53&online=1v1&demo=1&code=JUDGE1` (two people open it to play each other as 1:1s with Flashfire; change 53 to any Chog number from 1 to 1969). Live chain check: `https://chogroomzero.xyz/api/game/chain`.
- Video (up to 3 min): NOT RECORDED. Shot list for the owner, all features verified in tests:
  1. 0:00-0:15 Title, How to play, Got it.
  2. 0:15-0:35 Chog DEMO screen: the DEMO line, one token per tier; pick Chog #53 (1:1, Flashfire) and show the DEMO badge and tier on the HUD; use Flashfire on a bot (the ring, then the burst).
  3. 0:35-0:50 Hero select (keys 1-4), Deploy.
  4. 0:50-1:50 Creep past a door; gold rings when a bot moves; a shot blocked by a crate (spark, clank, outline); take a hit and show the damage arc and the ringed shooter; down bots.
  5. 1:50-2:20 Clear the room (or die and show the summary lock, then Again).
  6. 2:20-2:50 Results (time, kills, accuracy, damage, NEW best); then Online: the 5v5 button locked for a guest ("Verified Chog holders only"), and, with a holder wallet signed in, the held Chog and its tier read from Monad.
  Play it yourself: the debug autopilot exists only for tests and must not appear in the video as if it were a person playing.

## 05 Under the hood
- Repository: github.com/levithefirst/chog-room-zero (private today; the judges need access or a public copy: OWNER TO DECIDE).
- Stack: TypeScript, Vite, PixiJS 8, Vitest. Site and API on Vercel (one function for game actions), game server on Render Free, accounts in Postgres (the owner's Neon, schema `room_zero`). Chain reads over public Monad RPCs; no wallet library. Sound is synthesized with WebAudio. Fonts: Barlow Condensed, IBM Plex Mono (OFL).
- Pre-existing work: none in the game code. Built with AI coding agents (Claude Code, GrokBot) under the owner's direction.

## 06 What's next
- User feedback: none gathered yet (OWNER TO FILL after the phone playtest).
- Next: the phone playtest and the Core Feel Gate, then switch on NFT combat power (`NFT_COMBAT=1`), connect the database, tune the marksman tier gap, ask ChogLabs about art rights. $CHOG is not used. Nothing is for sale.
