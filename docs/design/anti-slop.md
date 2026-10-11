# Anti-slop

Slop is the most common option chosen without a reason. Fix: make a specific choice and be able to say why.

## Specificity test
For any decision, finish this sentence: "I chose X because in THIS game it does Y." If the honest answer is "it is common" or "it looks modern", change it.

## Self-check before showing work
1. Could this appear unchanged in any other game or app? Then it is generic. Make it specific or cut it.
2. Does every visual element communicate gameplay? If not, remove it.
3. Is there an abstraction with one user? Inline it.
4. Is there an option nobody asked for? Delete it.
5. Is there a comment that repeats the code? Delete it. Keep comments that say why, or what a number should feel like.
6. Is the copy something a person on this team would say out loud?

## UI and visuals
See `visual-identity.md` for the banned list.

## Names and copy
- No generic game words: Nexus, Protocol, Quantum, Neon, Cyber, Matrix, Omega, Prime. Avoid "Echo" (too close to Bullet Echo).
- Operators, abilities, and the room get short, plain, odd, specific names.
- Interface copy is verbs and facts. "Creep." "Heard at the east door." Not "Unleash your potential".
- No emoji in the UI. No exclamation marks as energy.
- Error messages say what happened and what to do, in one sentence.

## Code
- Plain data and small functions. A class hierarchy only when three kinds of thing truly share behavior.
- No `Manager`, `Handler`, `Service`, `Factory`, `Util`, `Helper` names unless it is exactly that.
- No premature generics, plugin systems, event buses (the sound event bus is the one exception), or dependency injection.
- Do not swallow errors. No defensive code for states that cannot happen. Validate at the edges (network, wallet, storage) and trust inside.
- Numbers in the tuning file, with a "feels like" comment.
- No allocation in per-frame code.
- Tests check things that matter (movement times, projectile sweep, vision fixtures, sound events, bot states, determinism), not coverage for its own sake.

## Animation and effects
Every animation has a gameplay reason and a duration chosen by feel. Actions respond fast (about 100 ms or less). No bounce, wobble, or pulse for decoration.

## Documents
README says what it is, how to run it, how to deploy. No marketing words, no feature lists for things not built. STATE.md is written for the next agent: plain, short, true. No "Overview / Key Features / Conclusion" filler, no emoji headers. Use plain punctuation and simple words.

## When you find slop
Fix it. If the fix needs a decision (a name, a color), offer two specific options with reasons and pick one by default.
