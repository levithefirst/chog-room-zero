# Pillars, win condition, room, first 30 seconds

Status: PROPOSAL unless a line says LOCKED. Locked items are in `docs/RULES.md` section 3.

## The fantasy (from the owner's brief)
A small operator in the dark. Limited vision. Walls block sight and bullets. Sound carries information. Fast, lethal combat. Positioning, visibility, sound, engagement, retreat, and risk are the decisions. Easy to understand, hard to master. You take YOUR Chog through Room Zero.

## Core loop idea (PROPOSAL): see or be seen, hear or be heard
Your view and your noise give you away. Moving fast is loud. Shooting is louder. Standing still is quiet and blind. Bots follow the same rules. Every second trades information for safety.

Depth sources to protect:
1. Loud run versus quiet walk (one choice, mobile by stick pressure, PC by a key).
2. Checking a corner costs exposure.
3. Sound as bait: you can pull a bot by making noise.
4. Reading what a bot is about to do from its posture and its sounds.
A feature that feeds none of these needs a strong reason to exist.

## Win condition (UNKNOWN, owner decides)
The brief has no way to win a room. Candidates to test in the prototype:
- A. Extraction: an exit opens at about 45 s, reach it alive before 90 s. (Suggested default, not locked.)
- B. Survive 90 s while the safe area shrinks.
- C. Clear the room of bots.
Record the choice in STATE as LOCKED once the owner picks.

## Room scope (LOCKED by the owner: no second map)
One room for the MVP. It must be good, not big. Crossable in about 8 to 12 seconds at run speed (PROPOSAL). Needs at least: two routes between key points, one loop, two or three corners or door gaps, one long sightline, one dark pocket, and cover that blocks bullets. Authored as a small tile map checked into the repo. Test it by drawing sightlines: if one spot sees everything, redesign.

## First 30 seconds (PROPOSAL)
- Page load to controlling the character: at most 2 taps or clicks. No wallet, token, or account prompt before the first room ends.
- Teach by play. Tiny hints that fade ("Hold Shift to creep", "Push the right stick to fire").
- The first bot is visible before it sees the player.
- Retry after death in a few seconds. The player always knows why they died.

## Honest problems in the brief (watch these)
1. No win condition (above).
2. Lethal combat plus limited vision feels unfair if deaths are unexplained. Every death needs a visible cause (G2).
3. A token ID alone is only a number. Real traits depend on Genesis metadata that is UNKNOWN. See `nft.md`.
4. Operators must be sidegrades or "anyone can play" breaks.
5. Persistent history needs a backend and can be faked by a client-run game. Verification level is a PROPOSAL.
6. Phone speakers are often muted, so important sound info also needs a visual cue.
7. Claude and GrokBot cannot feel the game. Feel gates depend on the owner's playtests, so schedule them.
8. The scope is already near the limit for 14 days. See `schedule.md` for the cut order.
9. The right stick both aims and fires (LOCKED), so aiming the light without shooting is not possible on mobile. Open design question for the prototype: where does the vision cone point when the right stick is in its deadzone (last aim direction, or move direction)? Test both on the phones.
