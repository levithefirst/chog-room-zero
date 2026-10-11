# Chog: Room Zero - skill system export for GrokBot

This is the process layer for the game. It has no game code. It was exported from the repo `levithefirst/chog-room-zero`, branch `setup/skill-system`, commit `f1971bb3c99f1a1286d8dc8d9d680a6d7da216d7`. Every file is an exact copy of that commit. Only this README is new.

## How to load it

1. Copy the contents of this folder into the root of the game repo, keeping the folder structure. The folders `docs/` and `docs/design/` and the file `GROKBOT.md` must end up in the repo root.
2. Give GrokBot `GROKBOT.md` as its instruction file. It is written for GrokBot and needs no Claude features.
3. Tell GrokBot to start every session with the steps in `GROKBOT.md`:
   - run `git status -sb`, `git branch --show-current`, `git log -1 --oneline`
   - read `docs/RULES.md` in full
   - read `docs/STATE.md` in full
   - find its task card in STATE, then read only the one `docs/design/` file its task needs

GrokBot does not need the files `CLAUDE.md` or the `.claude/` folder. They are for Claude Code. Keep them in the repo anyway so Claude Code works when you switch back.

## What each part is

| File | Use |
|---|---|
| `GROKBOT.md` | Entry point for GrokBot: first steps, ten rules, handoff, and what replaces Claude's commands |
| `docs/RULES.md` | The rulebook for both agents: git checks, task ownership, handoff, brief template, locked rules, scope |
| `docs/STATE.md` | Shared source of truth (see below) |
| `docs/GATES.md` | The 12 quality gates, which checks are automated, which need the owner to playtest, and the Core Feel Gate |
| `docs/HANDOFFS.md` | Append-only handoff log |
| `docs/design/*.md` | Design docs: pillars, feel and controls, vision and audio, bots, nft, architecture, schedule, visual identity, anti-slop |
| `CLAUDE.md`, `.claude/` | Claude Code only: imports the rulebook, 5 skills, 3 commands (`/brief`, `/gate`, `/handoff`), and a session-start hook. The skills and commands just point to the same `docs/` files |

The Claude skills have no reference files of their own. All the detail is in `docs/design/`, so GrokBot has the same information.

## Using `docs/STATE.md` when alternating with Claude Code

`docs/STATE.md` is the shared source of truth. Both agents read it before they edit anything, and update it before they stop.

- Each fact is labeled LOCKED (owner decided), PROPOSAL (not approved), UNKNOWN (not verified), or EVIDENCE (checked, with how).
- The "Current task" table says who owns what and which files they may edit. One open task per agent. Open tasks must not share files. If they would, stop and ask the owner.
- Work on your own branch: `grokbot/<task-id>-<slug>` for GrokBot, `claude/<task-id>-<slug>` for Claude Code. Never push to `main`, never force-push.
- Edit STATE.md only in your handoff commit. Keep it under 8,000 characters.
- Before stopping, append a HANDOFF block to the bottom of `docs/HANDOFFS.md` and give the owner the same block. It lists the branch and full commit hash, files changed, tests run, known failures, blockers, what was not verified, and the next smallest task.
- The next agent starts from the commit hash named in the last handoff, not from memory.
- Neither agent may claim a file, test, or deploy exists without checking it, or change a LOCKED item without the owner's approval.

## Things to know before you start

- The game repo had no code when this was exported. The current state is: no game code, no stack installed, project start date unknown. Check `docs/STATE.md` for what is true now.
- The next proposed task is P0-1 (project scaffold only). It needs your OK on the stack first.
- This was tested with Claude Code sessions, including one that was told to act as GrokBot using only `GROKBOT.md`. It has not been tested with the real GrokBot.
