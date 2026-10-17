# Chog: Room Zero - shared state

Source of truth for every agent. Rules: `docs/RULES.md`. Edit only in a handoff commit. Under 8,000 characters.
Last verified: 2026-10-17 by claude (FS final superiority pass, live from ccr-e7fadb8f-qtochk, H29).

## Snapshot (EVIDENCE)
- Repo `levithefirst/chog-room-zero` (private). Default/base branch `setup/skill-system` (LOCKED, owner 2026-10-11: no `main`). Never merge without the owner.
- Open PRs stacked #1 to #9, then PR #10 = ccr-e7fadb8f-qtochk. FS (with SB, FP) live from ccr-e7fadb8f-qtochk (H29). Client and server always ship from one commit (Render `/stats` names it).
- Vercel project `chog-room-zero` (protection off). Production `chogroomzero.xyz`: see the Latest handoff (H29). Rollback: `dpl_89HnmzDpcasvKLoQ94MUxikF4r4z` (95acb6d, FP; Render must go back with it; migration v5 is additive and harmless to it). Sign-in env vars and `DATABASE_URL` (Neon) set by the owner; no `NFT_COMBAT` (power on). Game server: Render Free `https://room-zero-game.onrender.com` (redeploys on every push to ccr-e7fadb8f-qtochk); `ALLOWED_ORIGINS` = production + that branch's preview. No test hooks in production.
- Chog Genesis (NFT-R1, EVIDENCE): Monad 143, contract `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763` (ChogMint, Sourcify exact match), ERC-721, supply 1,969, catalogue in `data/chog-genesis/`; token id is NOT the displayed number. Live check 2026-10-17 (`/api/game/chain`): chain 143, `metadataId(1)` = 1462.
- Chogathon 2026 (`docs/SUBMISSION.md`): "the Chog NFT must be essential". Deadline and start: UNKNOWN.

## LOCKED (owner; 2026-10-07, 2026-10-11, 2026-10-12, 2026-10-13)
1. Dark top-down tactical survival shooter, ~90 s rooms, mobile and PC, original IP. Bullet Echo is a benchmark only: nothing copied.
2. 14 days. Playable by Day 7. Freeze after Day 11. Days 12-14 fixes, QA, submission.
3. $0 target, $20 hard cap, owner approval per spend.
4. Controls: mobile LANDSCAPE (owner 2026-10-13); upright devices get it turned 90 deg. Left thumb move, right thumb aim and fire outside deadzone, ability in right-thumb reach, no auto-fire; idle aim faces the walk (RC-5). PC: WASD, mouse aim, click fire, Space ability.
5. Test devices: Pixel 7, iPhone 13.
6. Projectiles travel visibly, no hitscan. Walls block bullets and vision via real occlusion.
7. Movement has deliberate acceleration, turning, stopping. Humans turn at a cap too (owner 2026-10-16 CF: "capped/weighted human turning").
8. Bots: patrol, investigate, detect, pursue, attack, reposition, disengage, lose target; cover, angles, break LOS; never just rush.
9. Class system (owner 2026-10-13, 2026-10-14 MASTER INTEGRATION PASS): rarity sets starting power (real, not cosmetic), the ten 1:1s are dominant with their real names and a signature each, a maxed free player reaches the lower tiers, rating separate from power, nothing sold. Numbers: `src/config/power.ts`, `docs/design/power.md`. NFT combat power ON for verified holders (`NFT_COMBAT=0` turns it off).
10. Solo, 1v1, 3v3 open to all; 5v5 verified holders only, server-enforced (every squad member). Ownership verified server-side (SIWE, Monad reads); fails closed. Demo mode labelled, isolated, no rewards. 1:1 names used (owner 2026-10-14); art rights pending.
11. Accounts: XP, levels, shards, upgrades, rating from validated online matches (server pull, idempotent) and, owner 2026-10-17 ("earn progression even when they lose"), capped ticketed solo practice (no rating). All progression on the account (callsign, medals, career too); localStorage keeps preferences only (owner 2026-10-14). Account progression separate from token history; transfers move no XP or currency. Reuse the owner's Neon; additive migrations in schema `room_zero`. No payments this phase. No custom contract, no $CHOG dependency, wallet never required for solo/1v1/3v3. Online on an authoritative server (RC-8); no paid host without the owner's yes.
12. Out of scope: Railway worker, custom contract, paid inference, $CHOG economy, real-money purchases, second simultaneous ability, loot chests, gear grid, clans, season pass. One map; pickups. Free roster of 7 (Benja, Toad, Ray, Tabsu, Tonashiro, Yot, Bill; 5 departments) with one ability each, and grenades for everyone (capacity 3/5/7/9/11/13 by verified tier, never upgrades, server-set) (owner 2026-10-14; `docs/design/roster-grenades.md`).
13. Every added system names an equal or larger cut.
14. No scheduled or background jobs without owner approval.
15. Stack: TypeScript, Vite, PixiJS v8, Vitest.
16. Win condition: eliminate all bots. RC-8 (owner): a shrinking danger zone can end a run (zone death = loss); online, the last side standing wins.
17. Owner 2026-10-14 FINAL QA: the default game is YOU + 2 AI TEAMMATES vs bots (never confused with online 3v3); "Sign in" opens a sign-in sheet (Continue with Google / Continue with Wallet), never Settings; minimal UI copy.

## PROPOSALS (not approved)
- Class numbers, upgrades, revive timings, signatures (`docs/design/power.md`). Hub, medals, tips. Deps: @neondatabase/serverless, dev @electric-sql/pglite, @noble/*.
- NFT-R1 layers (`docs/research/chog-genesis/IDENTITY-AND-MAPPING.md`). PROVISIONAL CHOG palette (`docs/BRAND.md`), zone tuning, operator art.
- All tuning numbers (roster, weapons, grenades), lean rules, art direction, the map, fonts.
- FS (H29): venue, 26 pickups and respawns, TUNING.bots.squad, comms gap 2.8 s, practice limits, the solo 1v5 bar per roster. FP: reward amounts, heal delay, tier worth. SB/CF: intel, comms, turn cap, lab (`?lab`).

## UNKNOWN (never guess)
- Chog Genesis art and name rights; `baseURI`, totalSupply read from chain; metadata hash check (`docs/research/chog-genesis/`).
- Owner access to Pixel 7 / iPhone 13. Chogathon submission deadline.
- Whether a real holder can sign in and play 5v5 (fake-chain holder passes locally).

## Implemented (EVIDENCE)
- FS (H29, live): 68 x 42 mirrored venue; 26 zoned pickups; an active hostile squad from legit info (audited); a wallet chooser with logos, phone links, Monad add/switch, no dead ends; 57 audit fixes (API, netcode, client, sim) with tests. `docs/ROOM_ZERO_FINAL_SUPERIORITY.md`.
- FP (H28): rewards for every match, ticketed practice, zoned pickups, snapshot privacy, power-aware matching. `docs/ROOM_ZERO_FINAL_PASS.md`. SB (H27): contact intel, call-outs, death insight, prediction. `docs/ROOM_ZERO_SUPERIORITY.md`. CF and earlier: `docs/HANDOFFS.md`.

## Automated tests (EVIDENCE, Node 22.22)
FS (H29): vitest 786/786 (79 files), tsc clean. Browser (headless Chromium, emulated, local stack): qa-journey 38/38, qa-rewards 13/13, cf-chog 18/18, fs-wallet 28/28, master-ui 8/8, qa-errors 7/7, qa-screens clean, rc8-online 1v1+3v3 PASS, cf-visual 11 sizes (320 to 2560 wide) x 10 screens, no page errors. Production smoke: see H29.

## Not performed (needs the owner)
- CF/SB/FP/FS: any human play (the new venue, the active squad, rewards, pickups, prediction on a real network), a real wallet extension or phone wallet app through Enter with CHOG.
- Pixel 7 / iPhone 13, real-GPU FPS, audio by ear, hosted 5v5 with a real holder, art rights in writing, the demo video.

## Gates
Core Feel Gate: BLOCKED on owner playtests (class numbers, CF, SB, FP). G10: automated PASS; playtest not run.

## Current task
| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| FS | claude | claude/fs-final-superiority | see H29 | Owner 2026-10-17 FINAL SUPERIORITY PASS | live (H29); owner: playtest venue + squad, real wallet, flankers alone |
| FP, SB | claude | claude/sb-superiority | see H28, H27 | Owner 2026-10-17 / 10-16 | live; owner playtest |
| RC-8 | claude | ccr-e7fadb8f-qtochk, PR #10 | see H16 | Owner RC-8 mandate | PR #10 not merged (stacked on #9; owner decides) |

## Handoffs
Latest: H29 (2026-10-17, claude -> owner; FS live on chogroomzero.xyz). History: `docs/HANDOFFS.md`.
