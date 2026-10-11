# NFT identity

Status: the rules below marked LOCKED come from the owner. Mechanics and the binding flow are PROPOSALS. Chain, contract, metadata, ownership method, and art rights are UNKNOWN and must be verified, never assumed.

Nothing here is built until the Core Feel Gate passes (`docs/GATES.md`).

## LOCKED rules
- Anyone can play the core loop. No NFT or $CHOG needed.
- Guest runs are disposable. They create no persistent Chog operator history.
- Binding a Chog Genesis NFT creates a persistent operator identity with token-specific history.
- Token-derived traits are fair sidegrades. Never flat damage, health, or movement speed advantages.
- Removal test (below) must pass for every NFT-linked mechanic.
- Token-ID traits alone are not enough if owning the token has no meaningful persistent consequence.

## Removal test (two parts, both must pass)
Question: if NFT ownership were removed, would the experience AND what persists stay almost the same? If yes, the mechanic fails. Redesign or cut it.

```
MECHANIC    <name>
PLAY DIFF   what the player decides or experiences differently with the token
            (not a bigger number: where they stand, how they peek, what they listen for)
PERSISTENCE what is saved only because the token is bound, and who can see it
RESULT      STRONG / WEAK -> KEEP / REDESIGN / CUT
```

Weak means the difference is only a skin, portrait, badge, access, title, color, or a flat stat boost.

## Sidegrades (PROPOSAL)
- Three trait areas at most: weapon behavior, vision profile, one ability.
- Change the shape of play, not the size of numbers. Examples of the kind of difference that counts: a narrow long view versus a wide short view; a steady weapon versus a burst weapon with a rhythm; an ability that makes a decoy sound versus one that briefly quiets footsteps.
- Every operator, including the default, spends the same power budget. Strength in one place costs something elsewhere. Base damage, health, and speed are identical across operators (G10 tests this).
- The default operator is a complete, fun design that can win.
- Rarity may make an operator stranger, never better.

## Where traits come from (UNKNOWN, decide after verifying)
- Option A: real Genesis metadata traits, mapped by a hand-written table to a small set of designed operators. Needs the metadata to be checked first.
- Option B: a deterministic function of the token ID choosing among a small hand-designed set (about 6 to 9). Honest and works offline, but traits will not match the art, so the UI must not pretend they do.
- Either way it is a pure function `operatorFor(tokenId, traits?)` in the sim data, fully tested.

## Persistent identity (PROPOSAL)
- History belongs to the token: rooms played, wins, kills, deaths, survival time, streak. "Notable runs" is a cut candidate.
- One result is written at match end for a bound run. Nothing is written for a guest run.
- Binding flow idea: connect wallet (lazy loaded) -> sign a plain message (no transaction, no approvals) -> server checks ownership -> operator bound. The client never reports ownership itself.
- If the token changes owner, the new owner binds and sees the token's history. Say so in the UI.
- Every failure (no wallet, wrong network, signature rejected, RPC down, token not owned, metadata missing) leaves the game playable as a guest.

## Verify before relying on anything (all UNKNOWN today)
Record each as EVIDENCE in STATE (source, date, who checked):
1. Chain.
2. Contract address.
3. Token standard and the real ownership read method (ERC-721 `ownerOf` is common, but confirm).
4. Metadata location and which traits exist.
5. Art rights: may the game redraw or animate the Chog, or only show original art as is?
6. A public RPC that is reliable and free enough, or the cheapest option if not.

Never write the guessed answer into code, config, or docs as if it were true.

## NFT copy and flow
No "unlock your power" language. No rarity color as a power signal. No mint or marketplace links in the play flow. Do not show the NFT screen before the player has finished a room.
