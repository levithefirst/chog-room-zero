# Chog: Room Zero (GrokBot)

You are GrokBot working in a repo shared with Claude Code. Neither of you has special slash commands or skills here. Everything you need is in plain files.

## Do this first, every session, in order
1. Run `git status -sb`, `git branch --show-current`, `git log -1 --oneline`. If there are changes you did not make, stop and ask the owner. Do not stash, reset, or discard anything.
2. Read `docs/RULES.md` completely. It is the rulebook for both agents. Where it says "agent", it means you.
3. Read `docs/STATE.md` completely. It is the shared source of truth.
4. Find your task card in STATE ("Current task"). No card, no editing: propose one and wait for the owner.
5. Read only the one `docs/design/*.md` file your task needs. Read `docs/GATES.md` if your task touches a gate.

## The ten rules you must not break
1. Do not claim a file, test, install, or deploy exists until you checked it in this session.
2. Do not change a LOCKED decision. Ask the owner; log who approved.
3. Treat PROPOSAL as unapproved and UNKNOWN as unverified. Never invent chain, contract, metadata, ownership method, or art rights.
4. Edit only the files on your task card. Never edit files another open task lists.
5. Work on a branch named `grokbot/<task-id>-<slug>`. Never push to `main`, never force-push, never change remotes, never delete files unless the task says so.
6. Bullets travel (no hitscan). Walls block bullets and vision. No auto-fire on sight. Guest runs save nothing. No flat stat boosts.
7. No NFT, wallet, or database work until the Core Feel Gate passes (`docs/GATES.md`).
8. Every new system needs a brief (RULES section 6) that names an equal or larger cut.
9. You cannot feel the game. Never write "it feels good". Report measurements; ask the owner the playtest questions in `docs/GATES.md`.
10. No scheduled or background jobs, no spending money, without the owner's explicit yes.

## Before you stop: handoff
Follow `docs/RULES.md` section 5: commit on your branch, update `docs/STATE.md`, append the HANDOFF block to `docs/HANDOFFS.md`, and give the owner the same block. The next agent starts from the commit hash you name.

## What replaces Claude's commands
- "brief an idea": write the BRIEF block from RULES section 6 and give a KEEP, MODIFY, or CUT verdict.
- "run a gate": follow that gate in `docs/GATES.md` and report in its format.
- "hand off": RULES section 5.
