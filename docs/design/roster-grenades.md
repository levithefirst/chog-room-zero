# Free roster and grenades (owner 2026-10-14, "FREE ROSTER + GRENADE SYSTEM + FINAL COMBAT UX PASS")

Status: the owner's instruction (LOCKED on arrival). Every number below is a PROPOSAL for the Core Feel Gate; the
duel matrix in `tests/gr-roster.test.ts` is the measured check that no free character is dominant.

## Briefs

```
BRIEF: Free roster (7 characters, 5 departments)
PURPOSE      Free players pick a combat identity, not a stat line. Four heroes were too few to feel like a roster.
GAMEPLAY     Pick reach vs. speed vs. staying power, then an ability that covers one weakness, never all of them.
NFT RELATION Not NFT related. Holders pick from the same roster; their Chog adds tier power on top (removal test
             unchanged: removing ownership removes the tier power and grenade capacity, the roster stays).
PLAYER FEEL  Seven silhouettes that read apart at a glance; each wins some fights and loses others (no character
             above 62% average win rate in the duel matrix).
TECH COST    ~1 day: data (heroes, 3 weapons), burst fire in the sim, art gear per character, roster screen,
             legacy id mapping for stored records, test updates. No dependency.
RISK         Balance drift from new weapons; old accounts' records keyed by old hero ids.
SCOPE        Replaces the four heroes (Kettle, Mop, Brick, Wick). CUT: hero lore blurbs and ability paragraphs on
             the select screen, and in-run text tips beyond the first control hint.
QUALITY BAR  Mediocre = renamed old heroes with the same kit. Avoided by scrambled abilities, three new weapons,
             distinct body stats, and a measured duel matrix.
VERDICT      KEEP (owner instruction).
```

```
BRIEF: Grenades for every player
PURPOSE      Cover and corners made fights static; a lobbed explosive flushes a held angle.
GAMEPLAY     Spend a scarce grenade to flush cover now, or keep it for the last fight. Defenders see the landing
             ring and choose: move out of it (into the open) or stay and eat it behind a wall.
NFT RELATION Capacity by verified tier (3 / 5 / 7 / 9 / 11 / 13). Upgrades never raise it. Server-enforced.
PLAYER FEEL  Throw is instant, the ring tells you exactly where and when; 1.4 s from throw to boom.
TECH COST    ~1 day: sim entity, protocol fields, server latch, render, audio, HUD button, bot use and dodge.
RISK         Spam (capped by count and a 1 s throw cooldown); unreadable damage (ring of the true radius).
SCOPE        Owner instruction. CUT: hostile bots get 1 grenade, not 3, so solo difficulty does not jump; no
             grenade refills during a match (no pickup changes).
QUALITY BAR  Mediocre = a damage circle with no warning. Avoided: visible arc, bounce, fuse ring of the true
             radius, walls block the blast, cover halves it.
VERDICT      KEEP (owner instruction). Director note: 13 grenades on a 1:1 is a large edge in a 90 s room; the
             1 s throw cooldown and the readable ring are the counterweight. The playtest decides.
```

## Roster

Abilities are deliberately not matched to who the character is. Each one covers a weakness of the character's
weapon partly, never fully. Free ability numbers are below the 1:1 signatures of the same kind (Snare < Howl,
Shell < Gold Shell, Rush < Red Rush), so the 1:1s stay the top tier.

| Character | Department | Weapon | Ability | Strength | Weakness | Counterplay |
|---|---|---|---|---|---|---|
| BENJA | Assault | Auto rifle | Ping (reveal hostiles within 14 m, 2.5 s) | Finds the fight first, steady at every range | No heal, no escape; everyone in range hears the Ping | Move when you hear it; outrange him with Ray; flank |
| YOT | Assault | Burst carbine (3-round burst) | Slab (waist-high cover, 12 s) | Accurate bursts at mid-long range from cover he builds | Burst delay: a miss costs a full cycle; weak point blank | Rush him close; walk around the Slab; grenade behind it |
| TOAD | Tank | Drum LMG (60 rounds) | Slip (quick dash) | Most health and armour; holds a lane with a long drum | Slowest; 3.2 s reload; wide spread at range | Bait the reload; fight from range; flank the slow turn |
| RAY | Sniper | Marksman rifle | Snare (slow hostiles within 4 m she sees, 2 s) | Longest sight; 55 damage a shot down long lanes | 0.75 s between shots, narrow cone, fragile | Come from the side; bait the Snare, then engage |
| TABSU | Flanker | SMG | Shell (untouchable 1 s, cannot shoot) | Fast, wide cone; survives the step into a sightline | No armour, falls off past 8 m, Shell stops her own fire | Stop firing at the shell, then punish; keep range |
| BILL | Flanker | Sawn-off (2 shells) | Rush (+20% damage, 3 s) | Wins any fight inside 4 m; Rush makes the dive lethal | 2 shells then a reload; useless past 6 m | Keep range; make him reload; Snare or Slab him |
| TONASHIRO | Bruiser | Pump shotgun | Patch (+35 health) | Wins direct fights in rooms; Patch resets a brawl | Short sight, no mobility, long Patch cooldown | Range and line-of-sight breaks; grenade him out |

Numbers (`src/config/heroes.ts`, `src/config/weapons.ts`; PROPOSAL, tuned by measurement, not feel):

| Character | Health | Armour | Speed | Sight | Weapon numbers |
|---|---|---|---|---|---|
| Benja | 100 | 15 | 1.00 | 9 m, 70 deg | rifle 18 dmg, 0.11 s |
| Toad | 120 | 45 | 0.92 | 8 m, 72 deg | LMG 14 dmg, 0.1 s, 60 drum, 2.6 s reload, 3.5 deg |
| Ray | 85 | 15 | 0.95 | 12 m, 46 deg | marksman 55 dmg, 0.75 s |
| Tabsu | 85 | 0 | 1.10 | 8 m, 85 deg | SMG 12 dmg, 0.07 s |
| Tonashiro | 115 | 40 | 0.95 | 7.5 m, 80 deg | pump 8 x 14, 0.8 s |
| Yot | 95 | 25 | 1.00 | 9 m, 64 deg | carbine 3 x 20 per pull, 0.36 s between bursts |
| Bill | 90 | 10 | 1.08 | 7.5 m, 90 deg | sawn-off 9 x 18, 2 shells, 1.5 s reload |

Measured:

- **Duel matrix** (`tests/gr-roster.test.ts`): sight-gated duels at 3, 6, 9 and 11.5 m. Every character wins some
  matchup and loses some matchup, none averages above 70%, and none beats another at every range.
- **First drafts that failed it**: the sawn-off lost even at 3 m; Toad at 130/50 with a 15-damage LMG won 81%.
- **1v5 floor** (`tests/rc-victory.test.ts`, the scripted player alone against five bots): every character wins at
  least 2 of 40. Measured 4 to 17.

Stored records keep working: old hero ids map to the new roster (`LEGACY_HERO` in `src/config/heroes.ts`:
kettle to benja, mop to tabsu, brick to toad, wick to ray).

AI: the department sets how a bot fights (tests/gr-ai.test.ts):

- **Assault**: closes to mid range while firing.
- **Tank**: holds the angle.
- **Sniper**: backs off when someone is inside 6 m.
- **Flanker**: strafes and flanks.
- **Bruiser**: closes to shotgun range.

## Grenades

- **Simulation** (`src/sim/world.ts`, same fixed step as bullets): a throw spawns a grenade at the thrower. It flies
  toward the aim at a speed that brings it to rest at the chosen distance. PC uses the cursor distance, 2 to 9 m;
  touch uses the aim direction at 6.5 m. Rolling friction slows it, and it bounces off walls at 45%. Crates and
  slabs do not stop it: it is lobbed over waist-high cover.
- **Explosion**: the fuse is 1.4 s from the throw. Damage is 70 at the centre, falling to 20 at the 3.2 m edge, and
  30% of it ignores armour.
- **Walls and cover**: a wall between the blast and a target blocks the damage; half cover (crate or slab) halves it.
- **Who it hurts**: hostiles, and the thrower. Teammates take nothing unless the room has friendly fire on.
- **Damage scaling**: bots' grenades carry the same bot damage scale as their bullets. Tier damage power does not
  apply: the NFT edge is capacity only.
- **Capacity** (`GRENADES` in `src/config/power.ts`): free 3, Common 5, Uncommon 7, Rare 9, Epic 11, Legendary
  and 1:1 13. Hostile bots get 1. Upgrades never change capacity.
- **Server authority**: online, the server builds each player's capacity from the verified ticket. The client
  sends only "throw" and a distance (clamped).
- **Rules**: one throw per second at most. Not while downed, dead or in Shell. At zero nothing happens. A new match
  restores the full count. There are no refills during a match.
- **Telegraph**: the grenade, its shadow and a ring of the true radius that fills as the fuse runs, shown to
  anyone whose team can see it or who is within 4 m. A bounce clink, a loud boom and a short flash. Screen
  shake only when you are inside the radius.
- **HUD**: a round grenade button with its count, beside the ability and reload buttons, on the right thumb.
  On PC it is G (or right click) with the count shown.
- **AI**: throws at a believed position 4 to 9 m away when that spot is behind cover or holds two hostiles.
  Never within its own blast. Bots see a live grenade and move out of its ring.
