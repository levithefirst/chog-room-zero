# Chog: Room Zero, release candidate RC-1

- **Branch:** `grokbot/rc-1` (PR base `grokbot/p1-follow-through`).
- **RC SHA:** the final commit of PR "RC-1: Chogathon release candidate". The SHA is recorded in the PR body, /workspace/reports/rc-acceptance.md and rc-ade-brief.md. This file can't contain its own commit hash.
- **Production:** still 969de1c. This RC is a preview only.

## What is in RC-1
- **Fairness:** a bot may only fire at, or damage, you from inside your own sight range (hero vision incl. sidegrade) with line of sight. The shooter is ringed on every hit, along with the damage arc.
- **Death screen:** every input waits 0.75 s plus a fresh press: Again, Change Chog, Enter/Space, keys 1-4, touch.
- **Movement:** corner assist slides off door-frame corners. A door that opened onto a wall was moved.
- **Difficulty:** bots aim 12° settling over 2 s, react in 0.40-0.65 s, and deal 60% damage. The scripted player wins with every hero (docs/design/bots.md).
- **Loop:** first-launch How to play; results with time, kills, accuracy, damage dealt and taken, and hero; personal bests per hero and overall (device only, guests included).
- **NFT DEMO:** a token number maps to one of 4 sidegrades plus a marking. DEMO badge at every entry point. No wallet, no ownership check.
- **Polish:** Space confirms menus; audio master limiter.

## Known limitations
- **Physical devices:** Pixel 7 and iPhone 13 are UNVERIFIED. All mobile checks are headless emulation.
- **Real NFT verification:** DEFERRED. Chain, contract, ownership method and metadata are UNKNOWN. The DEMO traits don't match any Chog art or metadata.
- **Chogathon gate:** the rules require the NFT to be essential. Today a Chog changes play style (sidegrade) and tracks device history, but the game plays fully without one. This is a judging risk.
- **Personal bests:** localStorage only. Lost if site data is cleared, and not shared across devices.
- **Difficulty:** tuned against a scripted player (Mop, Brick and Wick win 5-6 of 40, Kettle 25 of 40). Not tuned against human play.
- **Ring hint e2e:** the headless ring-hint check is timing-flaky on the P1FT and RC builds alike. The code is unchanged since P1F.
- **Rear hits:** no pre-hit rear warning; only the damage arc plus the shooter ring.
- **Content:** one map and placeholder art (no Chog Genesis art used).

## Deferred vision
3 maps, 6 operators, 5 weapons, real Chog NFT verification (wallet signature, server-side ownership, token-bound history), and $CHOG integration (optional bonus; not designed).

## 60-90 s demo sequence
1. **0-10 s:** title; "How to play" card; Got it.
2. **10-20 s:** "Chog DEMO": point at the DEMO copy and trait table; pick #1 Lamp (badge on the title chip).
3. **20-30 s:** Enter; hero select (press 3 for Brick, 1 for Kettle); Deploy.
4. **30-60 s:** creep (Shift) past a door; gold rings when a bot moves; fire; a blocked shot on a crate (spark and clank); take a hit and see the arc and the ringed shooter; down a bot.
5. **60-75 s:** die or clear. Clicking during the summary does nothing; after 0.75 s, Again works.
6. **75-90 s:** results (time, kills, accuracy, damage, best NEW, "saved on this device only"); back to the title, where the best is shown.
