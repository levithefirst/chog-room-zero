# Chogathon submission draft (owner fills the blanks)

Source of the requirements: chogathon.chog.xyz, "What you'll submit" and "How we'll judge" (read 2026-10-12 through a cached copy from 2026-10-11 23:36 UTC). The deadline is UNKNOWN: the page says "Registrations stay open until Oct 11, 13:00 UTC" in one place and "It opens when submissions close: Oct 9, 15:00 UTC" in another. Confirm it in the Chog Discord before relying on either.

The judges' scoring sheet on that site says: "Gate = NFT essentiality (must pass to qualify)." Read the risk under 03 before submitting.

## 01 Your project
- Name: Chog: Room Zero
- Team members, Discord and X handles: OWNER TO FILL

## 02 What you built
A dark top-down tactical shooter in the browser, for PC and phones. One basement, five bots, about 90 seconds a run. You only see what your lamp touches, and sound is the other half of the information: gold rings mark noises you heard but did not see, and bots hear you the same way. Bullets travel and walls stop them. Bots take cover, investigate noises and only shoot you from inside your own sight range, so every death can be explained. Four heroes with one ability each (Kettle rifle and heal, Mop SMG and dash, Brick shotgun and portable cover, Wick marksman and sonar). Results and per-hero personal bests give a reason to replay.

What is new: a Chog is a tactical sidegrade, not a stat boost. Each trait changes how you see or shoot, costs something, and states its counterplay.

## 03 Why Chog matters
A token number maps to one of four sidegrades (Lamp: longer, narrower sight; Wide: wider, shorter sight; Steady: tight, small magazine, fast reload; Spray: big magazine, loose, slow reload) and a marking colour. A bound Chog keeps its own run history on the device.

Honest limit (say it in the submission): this is a labelled DEMO. No wallet is read and ownership is not checked, because the Chog Genesis chain, contract and ownership method were never verified for this project. The game plays fully without a Chog, which is the opposite of the judges' gate ("If you removed the NFT, would the experience still work the same way?"). Expect this to be the weakest part of the entry.

## 04 Show it working
- Working demo: the candidate preview URL (recorded in `docs/STATE.md` and the PR). Only the owner may promote it to production.
- Testing instructions: `README.md`, "How to test it".
- Video (up to 3 min): NOT RECORDED. Shot list for the owner, all features verified in tests:
  1. 0:00-0:15 Title, How to play, Got it.
  2. 0:15-0:35 Chog DEMO screen: the DEMO line, the trait table with counterplay; pick #1 Lamp, show the badge on the title.
  3. 0:35-0:50 Hero select (keys 1-4), Deploy.
  4. 0:50-1:50 Creep past a door; gold rings when a bot moves; a shot blocked by a crate (spark, clank, outline); take a hit and show the damage arc and the ringed shooter; down bots.
  5. 1:50-2:20 Clear the room (or die and show the summary lock, then Again).
  6. 2:20-2:50 Results (time, kills, accuracy, damage, NEW best); back to the title where the best shows.
  Play it yourself: the debug autopilot exists only for tests and must not appear in the video as if it were a person playing.

## 05 Under the hood
- Repository: github.com/levithefirst/chog-room-zero (private today; the judges need access or a public copy: OWNER TO DECIDE).
- Stack: TypeScript, Vite, PixiJS 8, Vitest, Vercel preview hosting. Sound is synthesized with WebAudio. Fonts: Barlow Condensed, IBM Plex Mono (OFL).
- Pre-existing work: none in the game code. Built with AI coding agents (Claude Code, GrokBot) under the owner's direction.

## 06 What's next
- User feedback: none gathered yet (OWNER TO FILL after the phone playtest).
- Next: real Chog Genesis ownership (wallet signature, server-side check, token-bound history), then more maps, operators and weapons. $CHOG is not used.
