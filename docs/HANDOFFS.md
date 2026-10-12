# Handoff history (append only)

Newest at the bottom. Never edit or delete another agent's entry. Format is in `docs/RULES.md` section 5.

```
HANDOFF H1  2026-10-11  claude -> owner
Branch @ commit : setup/skill-system @ (the commit that adds this file; read it with `git log -1 setup/skill-system`)   pushed: see PR or branch list
Task            : S1 recover, audit, and install the skill system. No game code.
Files changed   : CLAUDE.md, GROKBOT.md, .claude/settings.json, .claude/commands/{brief,gate,handoff}.md, .claude/skills/{chog-director,chog-brief,chog-gate-review,chog-nft-review,chog-anti-slop}/SKILL.md, docs/{STATE,RULES,GATES,HANDOFFS}.md, docs/design/{pillars,feel-and-controls,vision-audio,bots,nft,architecture,schedule,visual-identity,anti-slop}.md
Tests run       : structural checks only (frontmatter, JSON, links, dash check). See the final report for exact commands and results.
Known failures  : none known
Blockers        : none
Not verified    : fresh Claude Code session discovery (see final report); GrokBot reading GROKBOT.md (no GrokBot access from here); raw GrokBot audit text not seen
Locked decisions touched : none. Items previously treated as settled (3 rooms, Canvas 2D default, Shift quiet walk, extraction, feel numbers) were moved to PROPOSAL because the owner's brief did not lock them; "3 rooms" conflicts with the locked "no second map" and was dropped.
Next smallest task : P0-1 scaffold (see STATE), after the owner approves the stack
```

```
HANDOFF H2  2026-10-11  grokbot -> owner
Branch @ commit : grokbot/p0-1-project-scaffold @ 382518b68ff1d9ab597b9bd3fe2167bf4437c6c0   pushed: yes
Task            : P0-1 project scaffold (TS + Vite + PixiJS v8 + Vitest, one static shape). No gameplay.
Files changed   : package.json, package-lock.json, tsconfig.json, vite.config.ts, index.html, .gitignore, docs/DEV.md, src/main.ts, src/config/tuning.ts, src/sim/sim.ts, src/render/render.ts, src/input/input.ts, tests/sim.test.ts, docs/STATE.md, docs/HANDOFFS.md
Tests run       : npm ci -> exit 0 (EBADENGINE warning, Node 20.19.2 < vitest 5 requirement 22.12); npm run typecheck -> exit 0; npm test -> 3/3 passed; npm run build -> exit 0; npm run dev + curl / -> HTTP 200, #app and /src/main.ts present; headless Chrome on vite preview -> <canvas> present, screenshot shows centred circle
Known failures  : none
Blockers        : none
Not verified    : phone load (Pixel 7 / iPhone 13); run under Node >=22.12 (box has 20.19.2; engines field set to >=22.12); real-GPU browser (only swiftshader); README.md not touched (lives on S2 PR #1), commands are in docs/DEV.md
Locked decisions touched : added LOCKED 15 (TS, Vite, PixiJS, Vitest) and default branch setup/skill-system, approved by owner 2026-10-11 21:17 WAT; S1 closed by owner
Next smallest task : P0-2 PC movement only. Files: src/input/input.ts, src/sim/sim.ts, src/config/tuning.ts, src/render/render.ts, src/main.ts, tests/sim.test.ts
```

```
HANDOFF H3  2026-10-11  grokbot -> owner
Branch @ commit : grokbot/p0-2-pc-movement @ aac0bb4b71bd64b741bbc2d4707439e635b9f90f   pushed: yes
Task            : P0-2 PC WASD movement (stacked on P0-1 PR #2); plus P0-1 gaps: Node 22 validation, engines range fix, phone steps
Files changed   : src/input/input.ts, src/sim/sim.ts, src/config/tuning.ts, src/render/render.ts, src/main.ts, tests/sim.test.ts, tests/input.test.ts, package.json, package-lock.json, docs/DEV.md, docs/STATE.md, docs/HANDOFFS.md
Tests run       : Node 22.23.3: npm ci -> exit 0; npm run typecheck -> exit 0; npm test -> 17/17 passed; npm run build -> exit 0; npm run dev + curl / -> HTTP 200; headless Chrome CDP: canvas 800x363, D+S 0.6 s moved circle (400,181)->(484,265), console only favicon.ico 404
Known failures  : none (favicon.ico 404 in console, cosmetic; index.html not on card)
Blockers        : phone check BLOCKED on owner devices
Not verified    : phone load (Pixel 7 / iPhone 13); movement feel (owner PC playtest); real-GPU browser; render interpolation not implemented (marker updates per frame at sim positions)
Locked decisions touched : none
Next smallest task : P0-3 PC mouse aim only. Files: src/input/input.ts, src/sim/sim.ts, src/config/tuning.ts, src/render/render.ts, src/main.ts, tests/input.test.ts, tests/sim.test.ts
```

```
HANDOFF H4  2026-10-12  grokbot -> owner
Branch @ commit : grokbot/p1-mvp @ b25bac0deb789082158613dee3bad40a90315bc4   pushed: yes
Task            : P1 Room Zero MVP under the owner mandate (2026-10-12 02:56 WAT). Stacked on P0-2 (PR base grokbot/p0-2-pc-movement)
Files changed   : index.html, public/favicon.svg, src/main.ts, src/config/{tuning,map}.ts, src/sim/{sim,world,bots,vision,level,geom,operators}.ts, src/render/render.ts, src/input/input.ts, src/audio/audio.ts, src/nft/{identity,history}.ts, tests/{sim,input,world,bots,operators,nft}.test.ts, tools/browser-run.mjs, docs/design/art-direction.md, docs/DEV.md, docs/STATE.md, docs/HANDOFFS.md
Tests run       : Node 22.23.3: npm ci -> 0; npm run typecheck -> 0; npm test -> 60/60; npm run build -> 0; node tools/browser-run.mjs (headless Chrome) -> title, explore, hidden enemy (0 drawn), visible through door (1 drawn), combat tracers, death recap, summary, win, 844x390 touch: all reached, console errors none; vite preview console errors none
Known failures  : none in automated checks. Defects listed in the P1 PR (no shipped font file, no ability, single-thread A*, per-frame allocations in vision and Pixi redraws)
Blockers        : phone run (owner devices); NFT chain adapter and server history need verified chain, contract, ownership method (UNKNOWN)
Not verified    : feel, fairness, run length, audio by ear, phone performance (G8), real GPU
Locked decisions touched : LOCKED 10 changed by owner mandate (NFT layer allowed now; built as interface + mock only). LOCKED 16 added: win = all bots eliminated (mandate). No dependency added; viem stays PROPOSAL (no real read possible)
Next smallest task : P1-F1 owner playtest on PC and both phones, then fix the top 3 reported issues. Files decided by the reports
```
STATE trim note (H4): the gate table (all "not started") and the P0-1/P0-2 evidence rows were removed from STATE; P0 evidence is in H2 and H3 above.

HANDOFF H5  2026-10-12  grokbot -> owner
Branch @ commit : grokbot/p2-benchmark-overhaul @ 5204ddfb83f5dc9a813e7169ea46852e9c1066b0 (implementation; this handoff is the next commit)   pushed: yes
Task            : P2 benchmark overhaul, phases A-F, under owner mandate "COMPLETE BULLET ECHO BENCHMARK OVERHAUL" (chat, 2026-10-12 04:09 WAT). PR base grokbot/p1-mvp
Files changed   : index.html, public/fonts/* (4 woff2 + 2 OFL licences), src/config/{tuning,map,heroes,weapons}.ts, src/sim/{world,bots,level,operators,match}.ts, src/render/{render,bake}.ts, src/input/input.ts, src/audio/audio.ts, src/main.ts, src/nft/identity.ts, tests/{world,bots,operators,nft,combat,pickups-abilities,heroes-match}.test.ts, tools/browser-run.mjs, docs/design/{benchmark,art-direction}.md, docs/DEV.md, docs/STATE.md, docs/HANDOFFS.md
Tests run       : Node 22.23.3: npm ci -> 0; npm run typecheck -> 0; npm test -> 97/97 (9 files); npm run build -> 0. node tools/browser-run.mjs on vite preview ?debug: 1280x720 and 844x390 touch + 390x844 portrait, 23 screenshots /workspace/shots/p2-*.png, every state reached, console errors/warnings none
Known failures  : none in automated checks. Defects listed in the P2 PR
Blockers        : phone run and real-GPU FPS (owner devices); NFT chain adapter (contract UNKNOWN)
Not verified    : feel, fairness, balance, run length, audio by ear, phone performance
Locked decisions touched : LOCKED 1 and 12 amended by the P2 mandate (benchmark allowed, nothing copied; replaced map, heroes with one ability each, pickups). LOCKED 9 clarified: heroes may differ in speed/HP/armour, NFT sidegrades never do. No dependency added
Next smallest task : P2-F1 owner plays the preview on PC, Pixel 7, iPhone 13; grokbot fixes the top 3 reported issues
H5 addendum      : after preview verification, src/main.ts unlocks audio on pointerup/touchend/click/keydown (touch pointerdown is not a user activation, so phone audio could stay blocked; also present in P1). Re-verified: typecheck 0, 97/97, build 0, phone suite console errors none. Final commit = the one carrying this line

HANDOFF H6  2026-10-12  grokbot -> owner
Branch @ commit : grokbot/p0-bugfix-sprint (from 52acef6; PR base grokbot/p2-benchmark-overhaul); SHA in the PR   pushed: yes
Task            : P0 bug-fix sprint (owner task, chat 2026-10-12 05:28 WAT) on ADE's QA report (/workspace/qa/bug-ledger.md, release-report.md)
Files changed   : src/main.ts, src/input/input.ts, src/input/gate.ts (new), src/render/render.ts, src/render/visibility.ts (new), tests/p0fix.test.ts (new), tests/p0fix-input.test.ts (new), tools/p0fix-run.mjs (new), docs/STATE.md, docs/HANDOFFS.md
Fixes           : CHOG-VIS-001 root cause = 70% of bot hits on the player come from outside the view cone (median 4 u); renderer and LOS were correct (live and branch draw an in-cone bot: visibleBots 1). Fix: a shooter with a clear line is drawn ringed for 0.9 s after hitting / 0.5 s after firing within 8 u (never through walls). FLOW-001: 0.75 s summary lock + fresh press required, R no longer restarts. INPUT-001: tap latch + input consumed only on stepped frames, one shot per tap. HUD-001: sound rings and killer marker clamped to walkable map tiles. FLOW-002: blur also pauses; accumulator reset and first-frame skip on resume
Tests run       : Node 22: npm ci 0; typecheck 0; npm test 114/114 (11 files); build 0; node tools/p0fix-run.mjs (headless Chrome 1280x720 + 844x390 touch) 9/9 checks, console errors none, /workspace/shots/p0fix-*.png
Rifle (WPN-001/002): held cadence matches fireInterval; no collision bug. "No damage at 4-6 u" = the documented lean rule (half cover blocks unless the shooter is within 1.25 u of it) while half cover does not block sight. No change (balance/design out of scope)
Not fixed (scope) : MAP-001, UI-001 (key 3), AI-001 slab nav, HUD-002, VIS-002, BAL-001, AI-002, DES-001
Not verified    : real phones, feel, audio by ear
Locked decisions touched : none. No dependency added
Next smallest task : owner playtest of the preview; then P3-1 (light mesh + DPR cap) from /workspace/reports/chog-p3-research.md

HANDOFF H7  2026-10-12  grokbot -> owner
Branch @ commit : grokbot/p1-fairness-readability (from f5dc785; PR base grokbot/p0-bugfix-sprint); SHA in the PR   pushed: yes
Task            : P1 gameplay fairness and readability sprint (owner task, chat 2026-10-12 05:50 WAT); inputs ADE QA (/workspace/qa), Bullet Echo archive, P3 report, PR #6 review
Decisions       : ONE reveal rule: muzzle flash in wall LOS reveals the shooter 0.7 s, any range, both sides; being hit = direction only (bots get the same). Shotgun falloffStart 3->4.5, spread 9->8 (lost the 4 u duel 100% before; docs/design/weapons-ttk.md)
Files changed   : see the STATE P1F row
Tests run       : Node 22.23.3: npm ci 0; typecheck 0; npm test 142/142 (14 files); build 0. tools/p1f-shots.mjs before (958ce03) / after: console errors none
Perf (headless swiftshader, RELATIVE): 844x390 dpr2 11.4 -> 19.7 fps; 1280x720 dpr1 12.4 -> 17.4 fps (light mesh, same pixels); DPR cap 1.5
Known failures  : none in automated checks
Not verified    : real phones, real GPU, feel, bot fairness by hand, audio by ear
Locked decisions touched : none. No dependency added
Next smallest task : ADE physical-device pass (/workspace/reports/p1f-followup-plan.md)

HANDOFF H8  2026-10-12  grokbot -> owner
Branch @ commit : grokbot/p1-follow-through (from 0f3d56f; PR base grokbot/p1-fairness-readability); SHA in the PR   pushed: yes
Task            : P1 fairness and readability follow-through (owner task, chat 2026-10-12 07:29 WAT)
Fixes (one commit each) : UI-001 number keys select heroes; AI-002 no friendly fire (hostiles down = player eliminations); AI-001 progress-based stuck detection + cumulative repath avoid list; HUD-002 pickup labels avoid HUD panels; DES-001 camera lead smoothed (spawn offset 39.6 -> 3.6 px); debug labels stacked; MAP-001 spawn crates 1 tile west (south door unpinned, no new sight lines); shotgun 12x7 -> 14x8 spread 7.5 (wins the ADE 4 u test vs rifle 71.5%, CI 64.9-77.3); blocked shots spark + clank + cover flash; rotation pauses with a prompt
Tests run       : Node 22.23.3: npm ci, typecheck, npm test, build all 0; tools/p1ft-e2e.mjs 11/11 (before build 7/11); tools/p1ft-shots.mjs console errors none
Profile (headless swiftshader, RELATIVE): fps equal within noise; draw median 0.5 ms both builds. Dark map luminance unchanged; no defect
Not changed     : VIS-002 (QA: by design), perception/reveal rule (reviewed, matches spec)
Not verified    : real phones, real GPU, feel, audio by ear
Locked decisions touched : none. No dependency added
Next smallest task : ADE retest (/workspace/reports/p1ft-ade-retest.md)

HANDOFF H9  2026-10-12  grokbot -> owner, ADE
Branch @ commit : grokbot/rc-1 (from 498f8b5; PR base grokbot/p1-follow-through); final SHA in the PR and /workspace/reports/rc-ade-brief.md   pushed: yes
Task            : MASTER EXECUTION PROMPT, Chogathon release candidate (owner task, chat 2026-10-12 08:47 WAT)
Fixes           : ADE blockers 1-4 (fairness range rule; all post-death input gated; personal bests; NFT DEMO labelling) + door (11,13) moved off a wall + corner-vertex wedge + difficulty retune with evidence + onboarding + results stats + Space confirms + audio limiter
Tests run       : Node 22.23.3: npm ci 0, typecheck 0, npm test 255/255 (27 files), build 0; tools/rc-e2e.mjs + tools/p1ft-e2e.mjs on the final build (results in /workspace/reports/rc-acceptance.md)
Not verified    : physical phones, feel, difficulty with humans, audio by ear, real NFT ownership (DEFERRED)
Locked decisions touched : guest personal bests are device-local records, not token history (owner brief); DEMO screen reachable from the title (owner brief). No dependency added
Next smallest task : ADE retest of the preview per /workspace/reports/rc-ade-brief.md
