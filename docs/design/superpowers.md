# CHOG superpowers

Owner prompts 2026-10-18 "CHOG SUPERPOWER SYSTEM" and "CHOG IDENTITY + MAPS + COMBAT FEEL PASS". A verified Chog's real traits give it one superpower, ranked by its rarity. Free players keep the whole game without one.

Health (owner, IDENTITY pass):
- Every operator and every free player starts at 150 health.
- A verified Chog whose traits carry no power (618 tokens, the ten 1:1s among them) starts at 200 health instead. That is its only edge: no armour, damage or other stat, and no invented power. `BASE_HP` in `src/config/power.ts`.
- A Chog with a power plays at 150 with the power.
- Armour capacity is 65 for everyone (`TUNING.combat.armorCap`).

Code:
- `src/config/superpowers.ts`: every number, plus the text, telegraph and counter of each power.
- `src/nft/power-table.ts`: which token carries which power. It is generated from the verified catalogue by `tools/nft/build-powers.ts`.
- `src/sim/world.ts`: the five powers in the sim.
- `src/sim/training.ts`: the drills.
- `server/room.ts`: what each client is told.

Tests:
- `tests/sp-superpowers.test.ts`: table, eligibility, ranks, each power, cooldowns, determinism.
- `tests/sp-online.test.ts`: server, roster, snapshots, privacy.
- `tests/sp-training.test.ts`: the drills.
- `tests/power.test.ts`: duel bands.
- `tests/game-api.test.ts`: the ticket.
- `tools/sp-training.mjs`: browser check.

Labels follow `docs/RULES.md` section 2.

## Brief

```
BRIEF: CHOG superpowers
PURPOSE      The Chog must matter in play (Chogathon: "the Chog NFT must be essential") without buying health or damage.
GAMEPLAY     A holder trades the operator's ability for the power its Chog really carries: a beam (aim, commit, slow
             yourself) or a utility (cage, glue) or a defence (aura, no shooting). The other side reads the power,
             watches for its telegraph and plays its counter.
NFT RELATION Removal test: without the Chog the player has the operator's ability, not the power, and loses the power's
             drill. The power comes only from the token's own metadata, after a server-side ownership read.
PLAYER FEEL  Each power distinct at a glance (own colour, own sound), never a surprise (every one telegraphs first).
             Straight-duel edge within 0.25 to 0.85 against the operator's own ability (measured, below).
TECH COST    About 1 day. New files: superpowers.ts, power-table.ts, training.ts. No new dependency.
RISK         A power that dominates; X-Ray as a wallhack; desync online. Each has a test below.
SCOPE        CUTS: tier health, armour and damage (LOCKED 9's stat power) and the sidegrade-by-rarity idea. A power
             takes the one ability slot, so nothing is added on top (LOCKED 12: one ability).
QUALITY BAR  Mediocre = a stat buff with a new name. Avoided: every power changes what you do, has a line or shape both
             sides see first, and a written counter.
VERDICT      KEEP. Owner-approved list. Numbers are PROPOSALS until the Core Feel Gate playtest.
```

## Trait to power mapping (EVIDENCE: catalogue `data/chog-genesis/catalogue.json`, `tests/sp-superpowers.test.ts`)

| Trait (exact metadata) | Power | Rarities present (tokens) | Role |
|---|---|---|---|
| Eyes: Purple laser, fire laser, Green laser, cyan laser; Head: Blue Laser | Laser Eyes | C 194, U 68, R 15, E 1 (the Blue Laser head) | offensive |
| Eyes: Gradient visor, Sunset visor, Plasma visor | Visor (hostile tracker) | C 157 | utility (information) |
| none (see below) | X-Ray Eyes | 0 in the collection: DEMO and Training only | offensive |
| Mouth: Bubblegum | Bubble | C 112, U 56 | utility |
| Mouth: Drooling | Drool Web | C 116, U 68 | utility |
| Aura: any of its 22 values | Aura | C 605, U 279, R 60, E 30 | defensive |

Coverage:
- 1,351 of 1,969 tokens carry at least one power.
- 618 carry none, including the ten 1:1s, which keep their signatures.
- No non-1:1 Legendary exists. Legendary rank numbers are reachable only in DEMO and Training.

## Numbers by rank (PROPOSAL; `src/config/superpowers.ts`)

| Power | Common | Uncommon | Rare | Epic | Legendary | Counter |
|---|---|---|---|---|---|---|
| Laser Eyes: beam s / reach m / cooldown s (55 dmg/s, charge 0.35 s) | 0.8 / 9 / 15 | 0.9 / 10 / 14 | 1.0 / 11 / 13 | 1.1 / 12 / 12 | 1.2 / 13 / 11 | Step off the charge line; it turns at 45 deg/s, so strafe across it; cover stops it |
| Visor: tracker radius m (always on, no cooldown) | 16 | 19 | 22 | 25 | 28 | It shows position only: stay outside the radius; you see TRACKED while inside it |
| X-Ray Eyes: beam s / reach m / cooldown s (50 dmg/s, charge 0.7 s, passes walls) | 0.6 / 9 / 16 | 0.65 / 10 / 15 | 0.7 / 11 / 14 | 0.75 / 12 / 13 | 0.8 / 13 / 12 | The violet line crosses you through the wall: move off it during the long charge |
| Bubble: caged s / reach m / cooldown s (cage radius 1.1 m) | 2.0 / 9 / 16 | 2.6 / 10 / 15 | 3.2 / 11 / 14 | 3.8 / 12 / 13 | 4.5 / 13 / 12 | Slow (6 u/s) and glowing: sidestep; caged, you still shoot |
| Drool Web: glued s / drag m / reach m / cooldown s | 1.4 / 2.5 / 8 / 15 | 1.7 / 3 / 9 / 14 | 2.0 / 3.5 / 10 / 13 | 2.3 / 4 / 11 / 12 | 2.7 / 4.5 / 12 / 11 | Strafe the glob; stay away from walls; glued, you still shoot |
| Aura: immune s / cooldown s | 8 / 53 | 10 / 55 | 15 / 60 | 20 / 65 | 30 / 75 | It cannot shoot or throw: stop shooting, reload, hold where it must leave from; the zone still hurts it |

Rules shared by all:
- Rank never changes damage per second, health, armour or weapon damage. Beam damage per second is the same at every rank.
- The upgrade Focus shortens a power's cooldown like any ability.
- Aura's cooldown always leaves 45 s without it.
- Aura can be dropped early by a fresh press, after a real release. Online, a held button reaches the server as a press every other step; that does not drop it (tested).
- Laser and X-Ray: the owner walks at 55% while charging or burning.

## Decisions (owner, logged in `docs/STATE.md`)

1. **No rarity stat inflation** (rule 6). Every tier now plays at base health, armour and damage, the 1:1s included.
   - This replaces LOCKED 9's tier stat power (owner 2026-10-18).
   - Matchmaking worth by tier is now 0 (`TUNING.match.tierStrength`).
   - Grenade capacity by tier (owner 2026-10-14) is unchanged and listed as an open question below.
2. **One slot.** The power replaces the operator's ability, as a 1:1 signature does.
3. **Several power traits.** A holder picks one on the Class panel.
   - The pick is a preference on the device.
   - The site keeps it in the signed ticket only if the token's own traits carry it. Anything else plays the token's first power, in order Laser, X-Ray, Bubble, Drool, Aura.
4. **Who has one.**
   - Online: only a ticket whose tier is not free, holding a verified token id. With `NFT_COMBAT=0` the tier is free, so no power.
   - Solo: the same class the hub shows, or a labelled DEMO token's own traits.
   - DEMO Training can try any power at any rank, labelled, and records nothing.
5. **Visor and X-Ray are different powers** (owner, IDENTITY pass: "Do NOT map Visor Eyes to X-Ray").
   - Visor tells you where; X-Ray hits through the wall.
   - Visor is passive information: hostiles inside its radius are dots on the holder's tracker (HUD, beside the health bar), through walls. Position only, never health, weapon, power or facing. It deals no damage and reveals nothing else. Online the server sends the dots (snapshot `vt`) only to the Visor holder, and tells the tracked player TRACKED (`tk`).
   - X-Ray is an attack: a laser through walls, with no tracking and no reveal.
6. **X-Ray is not vision.**
   - It reveals no one.
   - Online, its owner's hit report on an unseen target is blurred like a spotted report.
   - Solo, no hit mark is drawn outside your light.
   - The target is sent only the stretch of line near it (from 5 u before it, never nearer the owner than halfway), so it learns the direction, not the spot.
7. **Beams are not hitscan bullets.**
   - LOCKED 6 forbids hitscan for bullets. The owner approved a beam ("an actual combat beam").
   - It is telegraphed by a charge line both sides see, turns at a capped rate, burns in 0.1 s pulses, and stops on walls and cover (Laser).
8. **Readability.**
   - The match intro names each opponent's power.
   - A coloured diamond by a visible player's health bar shows it: red Laser, violet X-Ray, cyan Visor, pink Bubble, green Drool, gold Aura.
   - Each power has its own sound (`src/audio/audio.ts`).

## Measurements (EVIDENCE: this container, perfect-aim scripted duels `tests/helpers/duel.ts`, 20 seeds x 2 slot orders)

Share won by the superpower against the same operator with its own ability (mean of 3 u and 6 u; abilities fire under 5 u). The opponent plays Aura's written counter (holds fire and reloads while it is untouchable).

| Power | Benja (Ping) C | Benja L | Tabsu (Shell) C | Tabsu L |
|---|---|---|---|---|
| Laser Eyes | 0.44 | 0.44 | 0.36 | 0.40 |
| X-Ray Eyes | 0.48 | 0.48 | 0.40 | 0.42 |
| Bubble | 0.50 | 0.50 | 0.38 | 0.38 |
| Drool Web | 0.50 | 0.50 | 0.38 | 0.38 |
| Aura | 0.49 | 0.50 | 0.50 | 0.50 |

What this shows:
- No power dominates a straight duel. The test band is 0.25 to 0.85 (`tests/power.test.ts`).
- A point-blank perfect-aim duel at 3 u is over in about 0.8 s (measured), so a 0.35 s charge, a slow glob or a cage barely shows there. Tabsu's 1 s Shell decides it. At 6 u no ability fires under the helper's rule, so 0.50 is a mirror.
- The powers' worth is what a straight duel cannot show: range, angles, team fights, revives, the zone, chasing. People must judge that.
- With the scripted opponent firing into an Aura (no counter), Common Aura measured 0.97 to 1.00 at 3 u: the opponent was caught reloading. That is why the written counter matters, and why the helper now plays it.
- Legendary Aura (30 s) outlasts the helper's 20 s duel: every one is a draw, counted as even.

## Training (`src/sim/training.ts`)

One drill per power in a small room, 45 to 60 s, with scripted dummies. Verified holders only (or a labelled DEMO token, which records nothing). The YOUR CHOG card, shown once a session after a verified wallet signs in, names the token, its real traits, its ability and the trait it comes from, with TRAINING going straight into the drill. The cooldown is shortened (3 s, or Aura's seconds + 4) so a drill gives enough tries. The screen says so. Everything else is the rank's real number. Nothing is recorded (no practice, report or settle call: `tools/sp-training.mjs`).

| Drill | Power | What it trains | Score |
|---|---|---|---|
| Five coming | Laser | Five targets (40 health) walk at you one by one; your gun is empty | Destroyed before they reach you |
| Hunter | Visor | Five targets hide in dark rooms; the tracker shows where (60 s) | Found and taken down |
| Through the wall | X-Ray | Dummies walking behind a wall, found by their steps | Damage through walls |
| Cage runners | Bubble | Leading runners across lanes | Cages per bubble |
| Pin them | Drool | Choosing the target near a wall | Glued against a wall |
| Hold the line | Aura | Raising it just before a volley (1 s warning) | Volleys taken clean |

## Open (UNKNOWN or owner decision)

- **Approved powers #5 and #6** ("the previously approved power #5 and #6"): not found in any doc, commit or this session's transcript. Not invented. The system is data-driven: adding a power is one entry in `superpowers.ts`, one trait family in `build-powers.ts`, and a sim case.
- **X-Ray has no trait.** There is no literal X-Ray trait in the catalogue, and the owner ruled the visor out. Candidates for the owner to name (EVIDENCE, catalogue): Head "3rd Eye" (4 tokens, Epic), Eyes "Modern VR" (26: 24 Uncommon, 2 Rare), Eyes "Classic VR" (25: 24 Uncommon, 1 Rare), Body "Boner" (2, Epic). Until then X-Ray maps to no token and lives in DEMO and Training only. Mapping one is a line in `tools/nft/build-powers.ts` and a regenerate.
- **Squad / Breach drill** (three holders) is not built: it needs three verified holders together online.
- **Grenade capacity by tier** (3 to 13) is a rarity combat resource. Rule 6 names health and damage only, so it is kept. The owner should confirm.
- **Aura durations** follow the owner's example (Uncommon 10 s, Legendary 30 s), with Common 8 s, Rare 15 s and Epic 20 s chosen. Every number needs the Core Feel Gate playtest.
- **The 618 tokens without a power trait** play their operator's ability at 200 health (owner, IDENTITY pass).
- Human feel of every power, readability on real phones, audio by ear: UNKNOWN until people play.
