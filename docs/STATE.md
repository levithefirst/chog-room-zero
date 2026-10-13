# Chog: Room Zero - shared state

Source of truth for every agent. Rules: `docs/RULES.md`. Edit only in a handoff commit. Keep under 8,000 characters; move old rows to `docs/HANDOFFS.md`.
Last verified: 2026-10-13 by claude (RC-8).

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero` (private). Default/base branch `setup/skill-system` (LOCKED, owner 2026-10-11: no `main`). Never merge without the owner.
- Open PRs, stacked: #1 S2; #2 P0-1; #3 P0-2; #4 P1 MVP; #5 P2; #6 P0F; #7 P1F; #8 P1FT; #9 RC-1/RC-2 (head 43f5a5d). RC-3 to RC-8 are branch `ccr-e7fadb8f-qtochk`, PR #10 on top of #9. Merge in order. #1 adds a skill-system README.md; RC-3 adds the game README.md (conflict to resolve at merge: keep the game README).
- Vercel project `chog-room-zero` (protection off). Production (get_alias, 2026-10-13 10:46 UTC): `chog-room-zero.vercel.app` AND `chogroomzero.xyz` alias `dpl_54KMsMZ5gYJpPdWyy2UNjPvzNCTR`, a dashboard redeploy (10:45 UTC, owner account) of RC-7 03a2409; RC-8 did not touch production. Rollback, newest first: `dpl_56bwkszpsVENmDkAfX8scxf69HCA` (03a2409), `dpl_FDwxDzTdcg83ySTYeJEY6yXjnUKa` (62bccd8), `dpl_98JQWcLkHkKF2iBaiZwc8a2sZ3Lf` (0ca9f76). Sign-in env vars set by the owner (production only). Game server: Render Free `https://room-zero-game.onrender.com` (owner-created from `render.yaml`, branch `ccr-e7fadb8f-qtochk`); Vercel `VITE_GAME_SERVER_URL` = Preview + this branch only. Hosted 1v1 PASS (H17).
- Hackathon: Chogathon 2026 (chogathon.chog.xyz, read 2026-10-12 from a 2026-10-11 cache). Deliverables and weights in `docs/SUBMISSION.md`. Judges gate on "the Chog NFT must be essential". Deadline: UNKNOWN (the page says both Oct 11 13:00 UTC and Oct 9 15:00 UTC). Project start date: UNKNOWN.

## LOCKED (owner; 2026-10-07, 2026-10-11, 2026-10-12, 2026-10-13)
1. Dark top-down tactical survival shooter, ~90 s rooms, mobile and PC, original IP. Bullet Echo is a benchmark only (P2 mandate): nothing copied.
2. 14 days. Playable by Day 7. Freeze after Day 11. Days 12-14 fixes, QA, submission.
3. $0 target, $20 hard cap, owner approval per spend.
4. Controls: mobile is LANDSCAPE (owner 2026-10-13, "FINAL LANDSCAPE LAUNCH FIX": reverses the 2026-10-12 portrait-first change). A touch device held upright gets the landscape game turned 90 deg, never a portrait layout or a rotate prompt; the first tap asks for fullscreen + landscape lock where the browser allows. Left thumb move, right thumb aim and fire outside deadzone, ability in right-thumb reach, no auto-fire; with the aim thumb idle you face the way you walk (RC-5). PC: WASD, mouse aim, left click fire, Space ability.
5. Test devices: Pixel 7, iPhone 13.
6. Projectiles travel visibly, no hitscan. Walls block bullets and vision via real occlusion.
7. Movement has deliberate acceleration, turning, stopping.
8. Bots: patrol, investigate, detect, pursue, attack, reposition, disengage, lose target; cover, angles, break LOS; never just rush.
9. Anyone can play. Guest runs save nothing. Bound Genesis NFT = identity + token history. NFT sidegrades only, never flat damage, health, armour, or speed. (Heroes differ in speed/HP/armour; heroes are not NFT traits.)
10. NFT layer: interface + labelled mock only; no chain reads, no ownership checks, no DB (mandates 2026-10-12 02:56 and 04:09 WAT). Changed by the owner 2026-10-13 ("MASTER EXECUTION PROMPT"): optional sign-in (Google OAuth, wallet SIWE for MetaMask/Rabby/Zerion) is allowed as identity only; this also lifts RULES 3 "no wallet work before the Core Feel Gate" for sign-in only.
11. Bots, no custom contract, no $CHOG dependency, wallet never required. Changed by the owner 2026-10-13 (RC-8): online multiplayer 1v1/3v3/5v5 on an authoritative server is allowed; no paid host without the owner's yes.
12. Out of scope: Railway worker, custom contract, paid inference, $CHOG economy, loot chests, gear grid, clans, season pass. Changed by P2 mandate (04:09 WAT): the map was replaced (still one map), 3-4 heroes with one ability each, pickups.
13. Every added system names an equal or larger cut.
14. No scheduled or background jobs without owner approval.
15. Stack: TypeScript, Vite, PixiJS v8, Vitest.
16. Win condition: eliminate all bots. RC-8 (owner): a shrinking danger zone can end a run (zone death = loss); online, the last side standing wins.

## PROPOSALS (not approved)
- Neon, viem: not installed. Vercel: hosting + `api/auth/*` functions (sign-in). Env vars `AUTH_SECRET`, `AUTH_ORIGIN`, `GOOGLE_CLIENT_ID/SECRET` NOT set (owner, `docs/AUTH.md`). Server-only deps @noble/curves, @noble/hashes (RC-7).
- RC-7 medals (12), tips, settings and the menu layout (`docs/REFERENCE-MAP.md`).
- RC-8: PROVISIONAL CHOG palette from the owner's brand guide (no official CHOG colours exist; `docs/BRAND.md`); zone tuning (`docs/design/zone.md`); operator art; hosting recommendation Render free (`docs/MULTIPLAYER.md`). Marksman no longer pierces crates/slabs (owner RC-8, replaces the P2 proposal).
- All tuning numbers, heroes, weapons, armour and lean rules (`docs/design/benchmark.md`), art direction, the map, the four sidegrades, the fonts.

## UNKNOWN (never guess)
- Chog Genesis chain, contract, standard, ownership method, metadata, art rights.
- Owner access to Pixel 7 / iPhone 13. Chogathon submission deadline.
- Monad / Robinhood chain ids and RPCs (no chain-specific feature uses them). Google OAuth client (owner creates it).

## Implemented (EVIDENCE)
- P2 base game (map, 4 heroes, weapons, armour, lean, pickups, bots, match flow, HUD, fonts): list moved to `docs/HANDOFFS.md` (H15 trim note); see H5 for SHA.
- RC-8 (H16): touch pickups, true-size CHOG-inspired operators, solid cover for every bullet (7 scenarios), danger zone, PROVISIONAL palette (CSS + Pixi), authoritative online server + client, hosted on Render Free for the preview (H17).
- RC-7 (branch `ccr-e7fadb8f-qtochk`, H15): boot screen, main menu, callsign, controls diagram, operator portraits, player card (Player/Operators/Medals/Loadout), 12 medals, settings, contextual tips, pickup feedback, results with medals, optional sign-in functions. Reference map: `docs/REFERENCE-MAP.md`.

## Automated tests (EVIDENCE, Node 22.22, 4 cores; RC-8, details H16)
`npx vitest run` 369/369 (41 files). Headless Chrome (emulated; NOT devices) on the local build of 85572dd (= the preview's index-BMbTTpTN.js): rc8-shots 3/3 viewports (16 checks each), rc8-online 1v1 + 3v3 + 5v5 (one Chrome process per player, loopback), rc7-menus 7/7, rc6-launch 6/6, rc4-matrix 12/12, rc-e2e 11/11, rc3-input-probe 6/6, p1ft-e2e 12/12, rc2-preview-checks 4/4, rc5-touchplay x2, rc-autoplay SCRIPTED wins x4 (Mop needed a disclosed seed), ring 20/20.

## Not performed (needs the owner)
- RC-8: hosted 3v3/5v5, hosted reconnect, Render logs, phones on separate networks, touch input online, zone and operator readability by a person, Mop balance (scripted Mop wins ~3% of seeds).
- Pixel 7 / iPhone 13 / any real tablet (Android Chrome fullscreen + lock, iOS Safari turned stage and safe areas), real-GPU FPS, feel, fairness, audio by ear, a human win, the demo video, scripted browser checks against the live URL (this container cannot reach *.vercel.app; the bundle is matched by hash instead).

## Gates
Core Feel Gate: BLOCKED on owner playtests. G10 interface + mock only (BLOCKER: verified chain, contract, ownership method).

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| RC-7 | claude | ccr-e7fadb8f-qtochk | see H15 | Menus, profile, medals, settings, tips, sign-in | done; 03a2409 in production |
| RC-8 | claude | ccr-e7fadb8f-qtochk, PR #10 | see H16 | Owner "COMPLETE GAMEPLAY, COMBAT, MULTIPLAYER & BRAND IDENTITY UPGRADE" 2026-10-13: pickups, operators, cover, zone, PROVISIONAL palette, online | done on the branch; hosted preview 6301737 + Render Free; production waits for the owner |

Done rows P1-RC-6 moved to `docs/HANDOFFS.md` (H11, H14 trim notes).


## Handoffs
Latest: H17 (2026-10-13, claude -> owner; RC-8 hosting). History: `docs/HANDOFFS.md`.
