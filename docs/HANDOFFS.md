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

HANDOFF H10  2026-10-12  grokbot -> owner, ADE
Branch @ commit : grokbot/rc-1 (PR #9, commits after 6759d1f; no force-push). Final SHA + preview in /workspace/reports/rc2-ade-retest.md   pushed: yes
Task            : RC-2 targeted follow-up (owner task, chat 2026-10-12 12:53 WAT; scope frozen)
Fixes           : a menu press never fires (fire is held only while that press is still down; the first click after Deploy fires); ring-hint e2e setup (desktop mode, sim-tick waits; assertion unchanged); explicit 30 s timeout for the perception audit; debug-only ?autoplay
Tests run       : npm test (counts/timing in rc2-ade-retest.md); rc-e2e, p1ft ring x20, rc2-preview-checks, rc-autoplay on the preview
Not verified    : physical phones; human wins; resume-fire root cause (not reproducible in headless Chrome; fixed defensively)
Locked decisions touched : none. No dependency added
Next smallest task : ADE retest per /workspace/reports/rc2-ade-retest.md

STATE trim note (H11): these done task rows left STATE (it was 8,467 characters, over the 8,000 limit):

| Id | Owner | Branch | Files | Done when | Status |
|---|---|---|---|---|---|
| P1 | grokbot | grokbot/p1-mvp | see H4 | MVP | done, awaiting owner review |
| P2 | grokbot | grokbot/p2-benchmark-overhaul (base `grokbot/p1-mvp`) | `src/**`, `tests/**`, `index.html`, `public/fonts/**`, `docs/design/{benchmark,art-direction}.md`, `docs/DEV.md`, `tools/browser-run.mjs`, `docs/STATE.md`, `docs/HANDOFFS.md` | benchmark overhaul phases A-F per owner mandate "COMPLETE BULLET ECHO BENCHMARK OVERHAUL" (chat, 2026-10-12 04:09 WAT); Node 22 ci/typecheck/test/build; browser run; preview deploy | done, awaiting owner review and playtest |
| P0F | grokbot | grokbot/p0-bugfix-sprint (base `grokbot/p2-benchmark-overhaul`) | `src/main.ts`, `src/input/{input,gate}.ts`, `src/render/{render,visibility}.ts`, `tests/p0fix*.test.ts`, `tools/p0fix-run.mjs`, `docs/STATE.md`, `docs/HANDOFFS.md` | P0 bug-fix sprint per owner task (chat, 2026-10-12 05:28 WAT) on ADE QA report: CHOG-VIS-001, FLOW-001, INPUT-001, HUD-001, FLOW-002 (+blur); rifle investigation; preview deploy | done, awaiting owner review |
| P1F | grokbot | grokbot/p1-fairness-readability (base `grokbot/p0-bugfix-sprint`) | `src/sim/{bots,world,level,vision,geom,cover}.ts`, `src/render/{render,lightmesh,bake,visibility}.ts`, `src/config/{tuning,weapons}.ts`, `src/main.ts`, `index.html`, `tests/{perception,p1f-combat,ttk,world}.test.ts`, `tools/p1f-shots.mjs`, `docs/design/{bots,cover,weapons-ttk}.md`, `docs/STATE.md`, `docs/HANDOFFS.md` | P1 fairness and readability sprint (owner task, chat 2026-10-12 05:50 WAT): one reveal rule, perception spec + tests, readability, snag/slab/cover/TTK, perf, preview | done, awaiting owner review |
| P1FT | grokbot | grokbot/p1-follow-through (base `grokbot/p1-fairness-readability`) | `src/main.ts`, `src/ui/{heroKeys,orientation}.ts`, `src/render/{labels,camera,render}.ts`, `src/sim/{world,bots,cover}.ts`, `src/config/{map,tuning,weapons}.ts`, `src/audio/audio.ts`, `tests/p1ft-*.test.ts`, `tools/p1ft-{e2e,shots}.mjs`, `docs/design/{bots,cover,weapons-ttk}.md`, `docs/{DEV,STATE,HANDOFFS}.md` | P1 follow-through (owner task, chat 2026-10-12 07:29 WAT): UI-001, AI-002, AI-001, HUD-002, DES-001, debug labels, MAP-001, shotgun duels, blocked feedback, rotation | done, awaiting owner review |
| RC-1 | grokbot | grokbot/rc-1 (base `grokbot/p1-follow-through`) | `src/sim/{world,bots,geom}.ts`, `src/config/{map,tuning}.ts`, `src/input/{gate,input}.ts`, `src/main.ts`, `index.html`, `src/ui/records.ts`, `src/nft/{traits,identity}.ts`, `src/audio/audio.ts`, `tests/rc-*.test.ts`, `tests/helpers/autopilot.ts`, `tools/rc-e2e.mjs`, `docs/design/{bots,nft}.md`, `docs/{DEV,RELEASE,STATE,HANDOFFS}.md` | Chogathon release candidate (owner task, chat 2026-10-12 08:47 WAT): fairness range rule, death-screen gate, snags, difficulty, onboarding, results, personal bests, NFT DEMO | done, awaiting owner + ADE review |
| RC-2 | grokbot | grokbot/rc-1 (PR #9) | `src/input/input.ts`, `src/main.ts`, `src/debug/autopilot.ts`, `tests/rc2-resume.test.ts`, `tests/perception.test.ts`, `tests/helpers/autopilot.ts`, `tools/{rc-e2e,p1ft-e2e,p1ft-ring-repeat,rc-autoplay,rc2-preview-checks}.mjs`, `docs/{DEV,RELEASE,STATE,HANDOFFS}.md` | Targeted RC-1 follow-up (owner task 2026-10-12 12:53 WAT): resume click fire, ring e2e setup, suite timing, preview checks, scripted victory, Wick vs Brick | done, awaiting owner + ADE retest (/workspace/reports/rc2-ade-retest.md) |
P2-F1 (proposed): owner plays the preview on PC, Pixel 7, iPhone 13; grokbot fixes the top 3 reported issues.

HANDOFF H11  2026-10-12  claude -> owner, ADE
Branch @ commit : ccr-e7fadb8f-qtochk @ c02a9041d599a848bb06f1335fd2afe246e19c6d (last code commit; this handoff is the next commit and is the candidate)   pushed: yes
Task            : RC-3 final release hardening (owner prompt "FINAL FINISH-LINE EXECUTION", 2026-10-12), on top of grokbot/rc-1 @ 43f5a5d (PR #9 head, unchanged)
Files changed   : src/input/input.ts, src/sim/world.ts, src/main.ts, tests/rc3-input.test.ts, tests/rc3-accuracy.test.ts, tools/rc3-input-probe.mjs (new), tools/p1ft-e2e.mjs, tools/p1ft-ring-repeat.mjs, tools/rc-autoplay.mjs, tools/rc-e2e.mjs, README.md (new), docs/SUBMISSION.md (new), docs/RELEASE.md, docs/STATE.md, docs/HANDOFFS.md
Fixes           : (1) RC-2 blocked fire while ANY pointer was down at play start: a resting move thumb swallowed the first right-thumb push (0 shots, reproduced). Now only the pointer ids down at the transition are ignored. (2) Resume-shot root cause reproduced on 6759d1f: a click latched just before Esc survived the pause and fired on resume; fixed since RC-2, now pinned by a test. (3) Results accuracy per bullet: Brick showed hits 59 / shots 16 (369%). (4) Ring-hint e2e: touch emulation keeps (pointer: coarse) true for the tab's life, so the "desktop" setup still ran in touch mode; section 4 now uses a fresh tab plus a precondition check, assertion unchanged
Tests run       : npx vitest run -> 264/264 (30 files) x3, 15-17 s, idle 4-core container (no concurrent workload). Headless Chrome (swiftshader) on vite preview of bundle index-BasVRbXf.js: tools/rc-e2e.mjs 11/11; tools/rc3-input-probe.mjs 6/6 (same probe on 6759d1f: Resume shot reproduced; on 43f5a5d: held-thumb first shot 0); tools/p1ft-e2e.mjs 12/12; tools/p1ft-ring-repeat.mjs 20 -> 20/20 (load avg ~8 on 4 cores; old setup 20/20 idle but by luck); tools/rc2-preview-checks.mjs: door sweep 4 x 952 no stall, Wick v Brick sim 48 hits 0 beyond 7.5 m, blocked flash pass, live Brick 91 hits 0 beyond 0 unrevealed; SEEDS=mop:5 tools/rc-autoplay.mjs (bundle index-DzaQnr4r.js, same sim) -> SCRIPTED wins Kettle 0:53 (1 attempt), Mop 1:21 (1, seed override), Brick 0:45 (2), Wick 0:27 (5); bests per hero persisted after reload; console errors 0
Known failures  : none in automated checks
Blockers        : this container cannot reach *.vercel.app (proxy), so browser checks ran on the byte-identical local bundle; the preview was matched by Vercel git metadata and the served bundle hash
Not verified    : Pixel 7, iPhone 13, a human win, feel, audio by ear, ADE retest (brief in docs/RELEASE.md), the submission deadline
Known, not changed : wounded bots never fire again (hurt -> cover before firing; the fix cut scripted Mop wins 5/40 -> 1/40, an owner balance call); autopilot stalls ~3/40 Mop runs (script backs off a covered bot); default browser seeds give Mop no win in 30 (sim-predicted)
Locked decisions touched : none. No dependency added. Production untouched (969de1c); no merge
Next smallest task : ADE retest of the candidate preview per docs/RELEASE.md "RC-3 ADE retest brief"; then the owner's phone playtest and demo video. No files

HANDOFF H12  2026-10-12  claude -> owner, ADE
Branch @ commit : ccr-e7fadb8f-qtochk @ cf796298 (last code/tool commit; this handoff is the next commit and is the candidate). Game code commit: 5d19a97cd3d7115c08e3e7073f39abc44940f8db   pushed: yes
Task            : RC-4 cross-device playable release (owner prompt "FINAL FIX, CROSS-DEVICE QA & PLAYABLE RELEASE", 2026-10-12)
Files changed   : index.html, src/main.ts, src/input/input.ts, src/ui/orientation.ts, src/render/camera.ts, src/render/render.ts, tests/rc4-orientation.test.ts (new), tests/p1ft-ui.test.ts, tools/rc4-matrix.mjs (new), tools/rc-autoplay.mjs, README.md, docs/{DEV,RELEASE,STATE,HANDOFFS}.md
Fixes           : tools/rc4-matrix.mjs on d14587d: 4/12 viewports. (1) Tablet portrait was blocked by the phone prompt (rule was portrait and width <= 820); now only portrait under 600 px wide (phones). (2) A desktop window narrower than tall got phone wording; it now reads "Make the window wider". (3) The prompt names the paused run (hero, hostiles left, nothing lost). (4) Play started behind the prompt (Deploy in portrait) pauses at once. (5) Every orientation flip releases sticks, keys and the fire latch. (6) On an axis the view fully covers (portrait tablet), the camera centres the map instead of showing void; landscape unchanged
Tests run       : npx vitest run -> 267/267 (31 files). Headless Chrome (swiftshader, emulated viewports/touch) on vite preview of bundle index-BYEZY6NN.js: rc4-matrix 12/12; rc-e2e 11/11; rc3-input-probe 6/6; p1ft-e2e 11/12 at load avg ~8.6 (tutorial pill still visible at 7.5 s wall time), then 12/12 twice idle; p1ft-ring-repeat 20/20 (under load); rc2-preview-checks door sweep/Wick-Brick sim/blocked flash/live Brick all pass; rc-autoplay SCRIPTED wins: 1280x720 Kettle 0:53, Mop 1:21 (SEEDS=mop:5), Brick 0:45, Wick 0:27; 844x390 touch Kettle, Brick; 820x1180 touch Kettle, Mop; bests persisted after reload; console errors 0
Known failures  : none open. Tutorial-pill check is wall-clock sensitive under heavy load (see RELEASE.md)
Blockers        : production promotion needs the owner's yes
Not verified    : physical phones and tablets, real iOS Safari rotation/address bar, a human win, feel, audio by ear, ADE retest of this candidate
Locked decisions touched : LOCKED 4 (mobile is landscape) kept for phones; tablets now also play in portrait under the owner's cross-device mandate (2026-10-12). No dependency added
Next smallest task : ADE retest per docs/RELEASE.md on the candidate preview, plus rotation and tablet portrait on real hardware. No files
H12 addendum (production, owner approved in chat 2026-10-12): the API promote of preview dpl_5yu7vpD13YuzGt7w7EAunpuEA42v was refused (422: a preview build cannot be promoted without a rebuild), so a production deployment was built from the same commit: dpl_98JQWcLkHkKF2iBaiZwc8a2sZ3Lf, target production, githubCommitSha 0ca9f76fee624254a4f2380e8cb43d5a37cd30a9, aliases chog-room-zero.vercel.app. Verified: it serves index-BYEZY6NN.js (same as the tested local build and the preview); an external browser (Firecrawl, 844x390) renders the How to play card over the arena. Rollback target: dpl_96e1NN2ggi4XyoXP2WPrHtNJtgGG (969de1c).

HANDOFF H13  2026-10-12  claude -> owner, ADE
Branch @ commit : ccr-e7fadb8f-qtochk @ ade5e4c33acc7f623d88cce72e0f1b1c581ec9d0 (last commit before this handoff; this handoff is the candidate). Game code: 88e3ae4   pushed: yes
Task            : RC-5 portrait-first mobile play (owner "CRITICAL PRODUCT REQUIREMENT CHANGE: PORTRAIT-FIRST MOBILE GAMEPLAY", 2026-10-12). LOCKED 4 changed by the owner (logged in STATE)
Files changed   : index.html, src/main.ts, src/input/input.ts, src/ui/orientation.ts, src/config/tuning.ts, src/render/{camera,render,visibility}.ts, tests/{rc4-orientation,p1ft-ui}.test.ts, tests/rc5-touch-facing.test.ts (new), tools/rc5-touchplay.mjs (new), tools/{rc4-matrix,p1ft-e2e,rc3-input-probe}.mjs, README.md, docs/{DEV,RELEASE,STATE,HANDOFFS}.md
Design          : one sim; portrait camera ~15 u across (26 px/u at 390 px), 3 u aim lead, HUD-safe framing measured from live HUD rects (map instead of void, player never under a band); red edge chevrons for SEEN hostiles past the screen edge (Wick 12 u > ~10.5 u ahead); portrait HUD (vitals TL, pause/mute + hostiles TR, ammo bottom-centre, Ability/Reload on the right edge); menus reflow; no turn-sideways screen; an orientation flip pauses the same run and releases input. Touch facing: aim thumb idle -> face the walk (0.6 s aim hold after firing); found because a touch player could not look without shooting. Landscape/desktop framing unchanged
Tests run       : npx vitest run -> 272/272 (32 files). Headless Chrome (swiftshader, emulated) on vite preview of bundle index-C-ePlzbG.js: rc4-matrix 12/12 (1024x768 re-run after a test-only aim fix); rc-e2e 11/11; rc3-input-probe 6/6; p1ft-e2e 11/12 under load (tutorial pill timing) then 12/12 idle x2; p1ft-ring-repeat 20/20; rc2-preview-checks 4/4; rc5-touchplay (real touch events, scripted decisions): 390x844 Kettle 2 kills, Mop 1, Wick 3 (11/22 hits, edge chevron seen), 375x667 Brick 1, each death -> results -> Again -> new run, best saved; rc-autoplay SCRIPTED wins: 1280x720 Kettle 0:53 Mop 1:21 (SEEDS=mop:5) Brick 0:45 Wick 0:27; 390x844 touch Kettle Mop Brick; 375x667 touch Kettle Wick; console errors 0
Known failures  : none open. Tutorial-pill check is wall-clock sensitive under heavy load
Not verified    : physical phones/tablets (iOS Safari, Android Chrome), a human win in portrait, feel of the portrait framing and touch facing, audio by ear, ADE retest
Locked decisions touched : LOCKED 4 (mobile landscape -> portrait-first, landscape supported), approved by the owner in chat 2026-10-12. No dependency added. Production unchanged (0ca9f76) pending owner authorization
Next smallest task : owner plays the candidate preview on a real phone held upright; ADE retest per docs/RELEASE.md. No files

HANDOFF H14  2026-10-13  claude -> owner
Branch @ commit : ccr-e7fadb8f-qtochk @ 883a73fcbb17a9ccc5cf9075e6bf037153cf9469 (last code commit; this handoff is the next commit, docs only, same bundle)   pushed: yes
Task            : RC-6 landscape launch (owner "FINAL LANDSCAPE LAUNCH FIX & PRODUCTION RELEASE", 2026-10-13). LOCKED 4 changed back to landscape by the owner (logged in STATE)
Files changed   : index.html, src/main.ts, src/input/input.ts, src/ui/stage.ts (new), src/ui/orientation.ts, src/config/tuning.ts (comment), tests/rc6-stage.test.ts (new), tools/rc6-launch.mjs (new), tools/{rc4-matrix,rc5-touchplay,p1ft-e2e}.mjs, README.md, docs/{DEV,RELEASE,STATE,HANDOFFS}.md
Design          : every layer moved into #stage. Touch device + upright browser -> stage laid out landscape (w = screen height) and turned 90 deg clockwise (translate(W,0) rotate(90deg)); the canvas, camera and HUD are the landscape ones from the first frame. Pointer coordinates, HUD rects and safe-area insets map through the stage; viewport media queries became stage classes (compact, narrow). First tap (pointerup/click = user activation) -> requestFullscreen({navigationUI:'hide'}) then screen.orientation.lock('landscape'); once per load, never re-forced; Full screen button on the title, pause card and HUD; fullscreen change releases input; leaving fullscreen mid-run pauses. Orientation flip mid-run still pauses the same run and releases input. Desktop unchanged; a narrow desktop window keeps the RC-5 portrait camera
Fixes during RC-6: (1) title Full screen as a returning visitor's first tap requested fullscreen/lock twice (auto launch + button): the auto launch now skips Full screen buttons and requests never overlap; (2) rc6-launch step 11 raced a reload frozen by the pause (test now waits for it and logs ammo/reload); (3) leftover headless Chrome processes (77) and a local preview server that hit its 2 h cap invalidated two earlier runs; all results below are from one clean run on the final bundle
Tests run       : npx vitest run -> 276/276 (33 files). Headless Chrome (swiftshader, emulated touch/viewports; NOT devices) on vite preview of bundle index-DyIkGcjU.js: rc6-launch 6/6 variants x3 (android 390x844/375x667: open upright turned + drawn, first tap fullscreen then lock inside the gesture, turn to landscape on the title, play, controls, pause/resume, exit fullscreen mid-run -> pause + Full screen -> back, flip mid-run and back with a finger held; denied 390x844; iphone 390x844/375x667: no API, no button, turned stage plays; return 390x844: one request); rc4-matrix 12/12; rc-e2e 11/11; rc3-input-probe 6/6; p1ft-e2e 12/12; rc2-preview-checks 4/4; rc5-touchplay full matches (real touch events, scripted decisions) 390x844 Kettle, 375x667 Wick (turned stage), 844x390 Mop, 667x375 Brick: death -> results -> Again -> new run, best saved; rc-autoplay SCRIPTED wins desktop Kettle 0:53 Mop 1:21 Brick 0:45 Wick 0:27, 390x844 touch Kettle 0:53 Brick 0:45, 375x667 touch Wick 0:27; p1ft-ring-repeat 20/20; console errors 0
Preview         : 883a73f -> dpl_25NGu48sCuqLC9W56ZLiVRvQB5EU https://chog-room-zero-1vax707c2-levithefirst-1227s-projects.vercel.app (READY; githubCommitSha matches; serves index-DyIkGcjU.js = the tested bundle). External render (Firecrawl, 390x844) loads and draws; its browser reports a fine pointer, so it shows the desktop narrow-window path, not touch
Domains         : chog-room-zero.vercel.app and chogroomzero.xyz both alias dpl_98JQWcLkHkKF2iBaiZwc8a2sZ3Lf (0ca9f76, RC-4). chogroomzero.xyz verified, Vercel nameservers, not misconfigured
Known failures  : none open
Blockers        : production promotion of RC-6 needs the owner's yes (both domains)
Not verified    : physical phones/tablets (Android Chrome fullscreen + lock, iOS Safari turned stage, safe areas, toolbar), a human win, feel, audio by ear
Locked decisions touched : LOCKED 4 (portrait-first -> landscape), approved by the owner in chat 2026-10-13. No dependency added. No merge. Production unchanged
Next smallest task : owner opens the candidate preview on a real phone held upright, taps once, turns it; then authorizes production. No files
H14 trim note: STATE rows RC-3 (release hardening, done H11) and RC-4 (cross-device, done; 0ca9f76 in production, preview chog-room-zero-64rq3bqri-levithefirst-1227s-projects.vercel.app) moved here.

H14 addendum (production, owner approved in chat 2026-10-13: "Promote 62bccd8 to production on chog-room-zero.vercel.app and chogroomzero.xyz"): production deployment built from the same commit via create_deployment (target production, gitSource sha 62bccd89da9377ca8986ac4eb7925920e0e19b00): dpl_FDwxDzTdcg83ySTYeJEY6yXjnUKa, https://chog-room-zero-2na9u5stf-levithefirst-1227s-projects.vercel.app, READY, meta githubCommitSha matches. Aliases: chogroomzero.xyz, chog-room-zero.vercel.app (get_alias on each -> this deployment). Verified: both domains return HTTP 200 over HTTPS (HSTS present) with the same ETag and serve /assets/index-DyIkGcjU.js (the tested bundle); real-browser renders (Firecrawl, 844x390) of both show the How to play card over the arena. Rollback targets, both READY: dpl_98JQWcLkHkKF2iBaiZwc8a2sZ3Lf (0ca9f76) then dpl_96e1NN2ggi4XyoXP2WPrHtNJtgGG (969de1c). Not verified: physical phones; the container cannot run scripted browser tests against *.vercel.app or the custom domain.

HANDOFF H15  2026-10-13  claude -> owner
Branch @ commit : ccr-e7fadb8f-qtochk @ 92e420af3693786e0c06df51f1d086adbd929859 (last code commit; this handoff is the next commit, docs only)   pushed: yes
Task            : RC-7 owner "MASTER EXECUTION PROMPT" with the 19-page Bullet Echo reference: menus, player card, medals, settings, tips, optional sign-in
Files changed   : index.html, vite.config.ts, tsconfig.json, package.json, package-lock.json, api/_lib/auth.ts, api/auth/{config,session,logout}.ts, api/auth/google/{start,callback}.ts, api/auth/wallet/{challenge,verify}.ts, src/main.ts, src/audio/audio.ts, src/input/input.ts, src/render/render.ts, src/sim/match.ts, src/ui/{art,auth,medals,profile,screens,tips}.ts (new), src/ui/{records,stage}.ts, tests/rc7-profile-medals.test.ts, tests/rc7-auth.test.ts (new), tests/rc-records.test.ts, tools/rc7-menus.mjs (new), README.md, docs/{AUTH,REFERENCE-MAP}.md (new), docs/{DEV,RELEASE,STATE,HANDOFFS}.md
Reference       : all 19 pages inspected; coverage table in docs/REFERENCE-MAP.md (implemented / present / deferred with reasons). Deferred: shop, chests, currencies, leagues, clans, weapon tuning, gear grid, voice chat, music, language/region, ads, promo codes, socials (no real system; several out of scope by LOCKED 12)
Fixes during RC-7: (1) Vercel functions crashed (ERR_MODULE_NOT_FOUND): native ESM needs .js on relative imports; fixed and re-checked on the preview; (2) a startup /api/auth/config request 404ed on static hosts (matrix "failed requests" check): sign-in is now only asked for in Settings or after Google returns; (3) pickup tips fired for pickups behind the player in the dark: now only for a pickup in the lamp (canSee); (4) master volume default kept at 100% (the old mix)
Tests run       : npx vitest run -> 305/305 (35 files; +28: profile, settings, medals, tips, flow, 12 auth incl. web3.js personal_sign vector). Headless Chrome (swiftshader, emulated; NOT devices) on vite preview of bundle index-Dit45WXK.js (BUILD_SHA=92e420a): rc7-menus 7/7 viewports (23-24 checks each); rc6-launch 6/6; rc4-matrix 12/12; rc-e2e 11/11; rc3-input-probe 6/6; p1ft-e2e 12/12; rc2-preview-checks 4/4; rc5-touchplay 390x844 Kettle, 375x667 Wick, 844x390 Mop, 667x375 Brick (death -> results -> Again, records with new totals); rc-autoplay SCRIPTED wins desktop Kettle 0:53 Mop 1:21 Brick 0:45 Wick 0:27, touch 390x844 Kettle Brick, 375x667 Wick; p1ft-ring-repeat 20/20; console errors 0
Vercel preview  : 92e420a -> dpl_3rvPCsF4TMowP9Srzf6QScEiwbyE https://chog-room-zero-k5don22pe-levithefirst-1227s-projects.vercel.app READY; /api/auth/config {"google":false,"wallet":false}, /api/auth/session {"identities":[]}, /api/auth/google/start 503 not_configured (no env vars set)
Known failures  : none open
Blockers        : production needs the owner's yes; sign-in needs the owner's env vars and Google OAuth client (docs/AUTH.md)
Not verified    : physical phones/tablets; Google and wallet sign-in end to end on a deployment (no credentials; this container cannot POST to *.vercel.app); real wallets (only a public signature vector and generated keys); a human playthrough of the new menus; audio by ear
Locked decisions touched : LOCKED 10 (sign-in allowed as identity only; also lifts RULES 3 "no wallet work before the Core Feel Gate" for sign-in), approved by the owner in chat 2026-10-13. New dependencies @noble/curves, @noble/hashes (server-only). No merge
Next smallest task : owner sets AUTH_SECRET/AUTH_ORIGIN (+ Google client) on Vercel, opens the preview on a phone, plays a run, opens Player card and Settings; then authorizes production. No files
H15 trim note: moved from STATE:
## Implemented (EVIDENCE: branch `grokbot/p2-benchmark-overhaul`, see H5 for SHA)
- Benchmark doc with cited facts vs assumptions, checklist, gap audit.
- Rendering: map baked once (procedural tile/concrete/metal/dock, grime, shadows, lit wall rims, doors, crates, barriers). Dim desaturated map always visible, fog on unexplored, lit map through soft + sharp cones with falloff and glow. Actors and bullets drawn only when the sim LOS says so; Ping shows outlines.
- 4 heroes (`src/config/heroes.ts`): Kettle rifle/Patch heal, Mop SMG/Slip dash, Brick shotgun/Slab barrier, Wick marksman/Ping sonar. Bots use the same table.
- Weapons (`src/config/weapons.ts`): damage, pellets, falloff, rate, spread, magazine + reserve, reload, armour-pen, cover pierce, own sound/tracer/muzzle.
- Armour soak rule, lean rule for half cover, health/armour/ammo pickups with respawn timers and labels.
- Bots: + health seeking, abilities, range-aware engage, fair sonar.
- Match flow table (`src/sim/match.ts`): title, hero select, loading, play, pause (freezes sim; auto on tab hide), recap, results.
- HUD: health/armour bars + numbers, weapon, ammo/reserve, reload ring, ability cooldown button, hostiles + pips, persisted mute, pause, safe-area insets, Full screen (touch). Damage arc, hurt flash, low-HP vignette, hit/kill marks, toasts.
- Fonts: Barlow Condensed + IBM Plex Mono (OFL) in `public/fonts/`.
| RC-5 | claude | ccr-e7fadb8f-qtochk | see H13 | Portrait-first mobile (owner 2026-10-12) | superseded by RC-6 (owner 2026-10-13); never in production |
