---
description: Run a quality gate from docs/GATES.md (for example G3, or vision). No argument runs the gates the latest changes reopen.
argument-hint: [gate id or name]
---

Use the chog-gate-review skill. Follow docs/GATES.md.

Gate requested: $ARGUMENTS

If empty, read docs/STATE.md and `git diff --stat` against the last handoff commit, and run only the gates the changes reopen. Show real commands and results. Leave human playtests BLOCKED with the exact questions for the owner. Record results in docs/STATE.md.
