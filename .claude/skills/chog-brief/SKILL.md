---
name: chog-brief
description: Use before building any new system, mechanic, enemy behavior, ability, operator trait, screen, endpoint, or dependency in Chog: Room Zero, when the owner proposes an idea or says "also" or "what if we add", and when a day is slipping or scope needs a cut. Produces a short brief that ends in KEEP, MODIFY, or CUT, and names the equal or larger scope cut.
---

# Chog Brief

Follow `docs/RULES.md` section 6. Read it now if it is not in context; it has the template and the automatic CUT and MODIFY triggers.

## Procedure
1. Check `docs/STATE.md`: is this already LOCKED, already a PROPOSAL, or on the Cut list? If it was cut before, say so and why.
2. Write the BRIEF block. Be concrete:
   - GAMEPLAY: name the decision and both sides. A decision with an obviously correct side is not a decision.
   - NFT RELATION: only fill the removal test if it touches the NFT; use skill `chog-nft-review`.
   - SCOPE: name the equal or larger thing this removes. Never leave it blank. No cut named means CUT.
   - QUALITY BAR: write the specific way it could feel cheap.
3. Give the verdict in one or two plain sentences. If MODIFY, state the new version. If CUT, offer the cheapest version that keeps the idea's spark.
4. In the handoff commit, log it in `docs/STATE.md`: KEEP or MODIFY under the task cards or PROPOSALS, CUT in the cut list with the reason.

## Slipping days
If a gate is red or a day slipped: name the gate, say whether it is a feel problem or a time problem, and cut from `docs/design/schedule.md` (cut order). Never cut Tier 1.

## Mini brief
For small changes, four lines are enough: Purpose, Decision created, Cost, Equal cut, Verdict. Bug fixes, tuning, and copy edits need no brief.

## Do not
Write code. Say yes to a system that cuts nothing. Accept anything on the out-of-scope list (`docs/RULES.md` section 3) without the owner changing the locked rule first.
