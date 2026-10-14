# Operating rules (every agent follows these)

Applies to Claude Code, GrokBot, and any other agent in this repo. The owner's latest message beats this file. If it changes a locked decision, log it in `docs/STATE.md` the same turn.

Game in one line: Chog: Room Zero, a dark top-down tactical survival shooter, about 90 second rooms, mobile and PC, original IP, 14 day hackathon, target $0 spend, $20 hard cap.

## 1. Before you edit anything

1. Run `git status -sb`, `git branch --show-current`, `git log -1 --oneline`. Write down what you see.
2. If the tree has changes you did not make, stop and ask the owner. Never stash, reset, discard, or overwrite them.
3. Read `docs/STATE.md` in full.
4. Find your task card in STATE ("Current task"). No card means you propose one (section 4) and wait for the owner's OK.
5. Open only the design doc for your task (`docs/design/`). Do not read all of them.

## 2. What counts as true

Every claim in STATE.md carries one label.

- **LOCKED**: the owner decided it. Do not change it silently. To change one, ask the owner, then log who approved and when.
- **PROPOSAL**: a suggestion that needs owner approval. Do not build on it as if settled. Small, cheap, reversible proposals may be tried in a prototype if the task card says so.
- **UNKNOWN**: a fact nobody has verified. Verify it before relying on it. Never fill a gap with a guess (chain, contract address, metadata, ownership method, art rights, device availability, deadlines are all unknown until checked).
- **EVIDENCE**: something checked. It must name how: a file path plus commit hash, a command plus its result, or a playtest record (date, device, build hash, tester).

Rules of honesty:
- Do not say a file, test, deployment, dependency, or install exists until you checked it in this session (`ls`, `cat`, run the command).
- A summary from an earlier session is a lead, not a fact. Re-verify before copying it into STATE.
- Never write "it feels good" or "gameplay is fine". You cannot feel the game. Report what you measured, then state what the owner must try and what question to answer.
- Passing automated tests is necessary and never enough. Feel gates need a human playtest (`docs/GATES.md`).
- If you could not run something, say "not run" and why. Do not imply it passed.

## 3. Hard rules for the game (LOCKED by the owner)

- Bullets are projectiles that visibly travel. Hitscan is forbidden.
- Walls block bullets and vision. Vision is real occlusion from wall geometry, never a decorative cone.
- Mobile is landscape. Left thumb moves. Right thumb aims and fires while outside the aim deadzone, and returning to the deadzone stops firing. The ability button sits within right-thumb reach. No auto-fire on sight, ever.
- PC: WASD move, mouse aim, left click fires, Space uses the ability.
- Both platforms share one rule set. Input and UI are designed per platform.
- Movement has deliberate acceleration, turning, and stopping behavior.
- Hit direction, projectiles, deaths, and sound must tell the player useful things. Screen shake and effects are purposeful, never decoration.
- Bots use cover, hold angles, break line of sight, investigate sound, reposition. They do not just rush the player.
- Anyone can play solo, online 1v1 and online 3v3 with no wallet and no NFT. Online 5v5 is for verified CHOG Genesis holders only, enforced on the game server (owner, 2026-10-13 MASTER BUILD PROMPT).
- Guest runs are disposable and create no persistent history. A signed-in account keeps server-side progression (XP, level, shards, upgrades, rating, callsign, medals, career) whether or not it holds an NFT. No progression in localStorage: it keeps preferences only (owner, 2026-10-14).
- Binding a Chog Genesis NFT creates a persistent operator identity with token-specific history, kept separate from account progression.
- Class system (owner, 2026-10-13): NFT rarity sets starting power, and the ten 1:1 tokens are the top tier with a signature ability in the single ability slot. Every number lives in `src/config/power.ts` and stays inside the caps in `docs/design/power.md`. Free players reach more power through earned upgrades. No combat power is ever sold.
- NFT removal test (`docs/design/nft.md`): if removing ownership changes neither the play experience nor what persists, the integration fails.
- NFT benefits need server-verified ownership. A browser-supplied token or address is never trusted. NFT combat power for verified holders is ON in production (owner, 2026-10-14 MASTER INTEGRATION PASS: "NFT holders start with power... This is not cosmetic"); `NFT_COMBAT=0` switches it off. The Core Feel Gate playtest still decides the numbers (`docs/design/power.md`).
- Never invent chain, contract, metadata, ownership method, or art-rights details. Verify first.
- Out of scope for the MVP: Railway worker, custom smart contract, paid inference, $CHOG economy, real-money purchases and paid currency (monetization is decided later), second map, a second simultaneous ability, loot chests, gear grid, clans, season pass. (Online multiplayer was added by the owner in RC-8.)
- Gameplay never depends on $CHOG. Wallet connect is never required for solo, 1v1 or 3v3.
- Database: reuse the owner's Neon. Migrations are additive, live in their own schema (`room_zero`) and never drop or reset data.

## 4. Tasks, files, and who owns them

- Work happens in tasks. A task card in STATE.md has: id, owner (`claude`, `grokbot`, or `owner`), branch, exact file list, done-when, status.
- One open task per agent. File lists of open tasks must not overlap. If you need a file another open task lists, stop and ask the owner.
- Branch name: `<agent>/<task-id>-<short-slug>`, for example `claude/p0-movement`. Never push to `main`. Never force-push. Never change remotes. Never delete files unless the task says so.
- Only edit files on your task's list. A needed change outside the list becomes a note in your handoff.
- The next agent starts from the commit hash named in the previous handoff, not from memory.
- Do not start scheduled workflows, cron jobs, or background jobs without the owner's explicit approval.
- Do not spend money or add paid services. Spending over $0 needs the owner's yes and a named blocker.

## 5. Handoff (required before you stop)

1. Commit your work on your branch. Push it if the remote allows.
2. Update `docs/STATE.md`: your task card status, evidence, test results, playtest requests, blockers, next smallest task, and the "Latest handoff" line. Keep STATE under 8,000 characters (move old rows to `docs/HANDOFFS.md` or `docs/PLAYTESTS.md`).
3. Append (never rewrite) the block below to the bottom of `docs/HANDOFFS.md`, and reply to the owner with the same block:

```
HANDOFF H<n>  <date>  <from> -> <to>
Branch @ commit : <branch> @ <full hash>   pushed: yes/no
Task            : <id> <one line>
Files changed   : <list>
Tests run       : <exact command> -> <result>   (or "none run")
Known failures  : <list or none>
Blockers        : <list or none>
Not verified    : <list or none>
Locked decisions touched : none | <what, approved by whom>
Next smallest task : <one task, with its file list>
```

STATE.md is edited only in a handoff commit, so two agents do not fight over it. If it conflicts when you rebase, re-read it and merge by hand. Never overwrite the other agent's entries.

## 6. Brief before building

Before any new system, mechanic, feature, trait, screen, endpoint, or dependency, write this and get a verdict. Small changes (bug fix, tuning, copy) skip it.

```
BRIEF: <name>
PURPOSE      what player problem does this solve?
GAMEPLAY     what decision does the player now make? (name both sides)
NFT RELATION why does the NFT matter here? (removal test, or "not NFT related")
PLAYER FEEL  what should this feel like? (words plus a number)
TECH COST    hours, files, new dependency?
RISK         what can go wrong?
SCOPE        fits the schedule? WHAT EQUAL OR BIGGER THING DOES IT CUT?
QUALITY BAR  what would make it feel mediocre, and how do we avoid that?
VERDICT      KEEP / MODIFY / CUT, one or two plain sentences
```

- The SCOPE line is mandatory at all times. Every added system names an equal or larger cut. No cut named means no.
- Automatic CUT: custom contract, $CHOG in gameplay, NFT-gating solo, 1v1 or 3v3, selling combat power, stat values outside the caps in `docs/design/power.md`, anything on the out-of-scope list in section 3.
- Automatic MODIFY: works on one platform only, gives information the player did not earn, has no readable telegraph.
- Log CUTs in STATE (Cut list) with the reason, so they do not return in disguise.
- Reject owner ideas that weaken the game. Give the reason in plain words and offer the cheapest version that keeps the spark. The owner decides; if they insist, log it and build it well.

## 7. Schedule and freeze

- 14 day window. Playable prototype by Day 7. Feature freeze after Day 11 (bug fixes and tuning only). Days 12 to 14: fixes, mobile QA, recording, submission.
- The project start date is UNKNOWN until the owner sets it in STATE. Do not guess the current day.
- Tier 1 (movement, aiming, projectiles, vision, sound cues, death clarity, fast retry) is protected. Never cut it to fund anything else. When a day slips, cut from the order in `docs/design/schedule.md`.

## 8. Build rules

- Keep gameplay simulation separate from rendering, effects, audio, wallets, and network access.
- All tuning numbers live in one tuning file with a comment saying what the number should feel like.
- Persist match results once, at match end. Never on every frame.
- Simple code. No abstraction before its second real use. No boilerplate for its own sake. See `docs/design/anti-slop.md`.
- Do not install dependencies that the task does not need.

## 9. Where things are

- State: `docs/STATE.md`
- Quality gates: `docs/GATES.md`
- Design docs: `docs/design/` (`pillars`, `feel-and-controls`, `vision-audio`, `bots`, `nft`, `architecture`, `visual-identity`, `anti-slop`, `schedule`)
