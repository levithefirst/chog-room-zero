---
description: Close out a work session with a handoff (commit, update STATE, append to HANDOFFS)
---

Follow docs/RULES.md section 5 exactly.

1. Run git status -sb, branch, and last commit. Confirm only your task's files changed.
2. Update docs/STATE.md (task card, evidence, test results, playtest requests, blockers, next smallest task, latest handoff line). Keep it under 8,000 characters.
3. Append the HANDOFF block to the bottom of docs/HANDOFFS.md.
4. Commit on your branch. Push if the remote allows. Use the real commit hash in the block.
5. Give the owner the same block, then the one playtest they should do next, if any.

Do not claim tests or files you did not check in this session.
