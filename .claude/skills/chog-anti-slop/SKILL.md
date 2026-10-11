---
name: chog-anti-slop
description: Use before showing or committing any UI, visual, effect, animation, name, copy, code, architecture choice, or document in Chog: Room Zero, and when something looks generic or AI-generated. Applies the specificity test and the banned list so output looks chosen, simple, and specific to this game.
---

# Chog Anti-Slop

The checklist is in `docs/design/anti-slop.md`; the banned visual defaults are in `docs/design/visual-identity.md`. Read them now if they are not in context.

## Procedure
1. Run the six-question self-check in `docs/design/anti-slop.md` on your own output before showing it.
2. For each visual, name, or copy choice, finish: "I chose X because in this game it does Y." If you cannot, change it.
3. Check code: no abstraction with one user, no unneeded options, no `Manager` or `Util` names, no allocation in per-frame code, numbers in the tuning file.
4. Check documents: plain words, short sentences, no filler headings, no emoji, no em dashes.
5. Fix what you find. If a fix needs a decision (a name, a color), give two specific options with reasons and pick one by default.

## Do not
Add effects that do not communicate gameplay. Copy anything from Bullet Echo or any other game. Use the word "Echo" in names.
