# Room Zero V2 superiority pass (V2)

Owner prompt 2026-10-18 "V2 SUPERIORITY PASS", then "switch to continuous execution". Input: the forensic report
`RZ-vs-BulletEcho-forensic-2026-10-18.pdf` (read in full; it audited production 18ccfdc, the commit this pass started
from). Evidence labels as in the report:

- **VERIFIED**: read in code at file:line, run as a test or a measurement in this container, or seen on the live site.
- **STRONGLY SUPPORTED**: several independent signals, or one direct observation under poor conditions.
- **INFERRED**: deduced from verified facts.
- **UNKNOWN**: no reliable evidence.

Nothing here is human-tested. Every "feels" question is UNKNOWN until the playtests in section 6 run.

## 1. The report's claims, checked against the code (VERIFIED unless marked)

| Report claim | Finding | Action |
|---|---|---|
| Bots shoot from outside your cone (weakness 11) | Solo bots fire only within the target's base sight range (`src/sim/bots.ts` fire gate), so being shot from behind in the dark is legal and was shown only by a 1 s red arc plus a 0.7 s ring. Online: no leak. A shooter is sent the victim only while it sees it; the victim gets the shooter's position once it fires (`server/room.ts` snapshot). | Test `tests/v2-info-boundary`. Distance tag on the damage arc for unseen shooters ("9 m"). Docs say so. |
| Hostile bots deal 60% damage, hidden (weakness 18) | `TUNING.bots.damageMul` 0.6, applied to bots and AI teammates. | Disclosed in Game Docs (Enemy Teams). |
| Logout does not revoke the session (3.22) | The cookie was cleared, but the signed session stayed valid for 30 days. | Revoked server-side (migration 7). |
| Pause keeps focus, Space toggles pause (3.16) | Focus is kept, but Space does not toggle pause. The real bug: Enter on the hidden pause card's "Leave match" left the online match while play went on, and Space pressed while paused fired the ability on resume. | Overlay inert during play; queued keys dropped on resume. |
| Career shows 0 runs, Medals 2 (3.12) | REFUTED: both read the same records (`src/main.ts` curRecords). INFERRED: a sign-in state change between screens. | None. |
| ReadPixels GPU stall (weakness 16) | Once per map load (`src/render/bake.ts`), not per frame. Real-GPU cost UNKNOWN. | Not changed (P2). |
| Roster bars with no numbers (weakness 17) | Confirmed. | Numbers beside the bars. |
| Solo board forgeable, no daily cap (weakness 10) | Confirmed: runs are browser-simulated, plausibility-bounded, rate-limited, and uncapped on the board. | First 25 runs per UTC day count on the board. Replay verification is still open. |
| Stale docs (weakness 19) | MULTIPLAYER.md said there was no prediction; the operators.ts header said "mock". | Fixed. |
| Hostiles never downed in solo (3.8) | Confirmed, by design (GP): the downed state is for your side and online teams. | None. |
| NFT combat power live (weakness 4) | Confirmed at 18ccfdc: up to x1.75 health, +35 armour, x1.12 damage (owner LOCKED 9, 2026-10-14). | Removed by the owner 2026-10-18 (superpowers instead, `docs/design/superpowers.md`). |
| No telemetry, no human data (weakness 3) | On-device counters only; nothing was collected. | Anonymous end-of-match records (section 2.6). |

## 2. What changed (VERIFIED by tests named; feel UNKNOWN)

1. **Information integrity.**
   - `tests/v2-info-boundary`: a sniper beyond your sight is not sent to you before it fires. After it fires you get its exact position and the hit's origin. A shooter facing away is never sent you.
   - Unseen-shooter distance tag on the damage arc. Game Docs disclose the 60% bot damage.
2. **Security and input.**
   - Sessions carry an id; logout records it in `room_zero.revoked_sessions` (migration 7, additive). Every database-backed route refuses a revoked session.
   - Older cookies run to their expiry.
   - The hidden overlay is inert during play.
   - Tests: `tests/v2-session-revoke`, `tests/v2-input-routing`.
3. **Downed and revive experience** (`src/ui/downed.ts`, `tests/v2-downed-card`).
   - The card names the AI teammate coming for you and how far away it is, or your nearest teammate when nobody is.
   - It warns of a hostile you know about within 9 m, from your own intel, never the world.
   - Bleeding out says "BLED OUT · nobody reached you in 10 s".
4. **Perks** (`src/config/perks.ts`, `tests/v2-perks`). There are four, each one slot, match only, usable by any hero, and none changes health, armour, damage or speed:

   | Perk | Effect |
   |---|---|
   | Soft Soles | Footsteps carry 40% less far |
   | Keen Ears | Walls do not muffle what you hear |
   | Field Kit | Revive in 1.5 s, the revived get up at 50% health |
   | Marker | A hostile you hit is shown to your team for 2 s |

   - **Who starts with one:** solo hostiles, and every online player (seeded).
   - **Getting one:** a kill drops the perk in its bag, and an empty slot takes it on touch.
   - **Swapping:** stand still on the bag for 1 s. Your old perk goes into the bag, and there is no swapping back.
   - **AI teammates:** take a perk into an empty slot, and never swap.
   - **Online:** perks are server-authoritative. Hostile perks are never sent; a bag's perk goes only to teams that know the bag.
5. **Competitive integrity.**
   - The Solo board counts an account's first 25 runs per UTC day (`tests/v2-solo-board`).
   - Ace (epic) now also needs "less damage taken than your full health" (section 3).
6. **Telemetry** (`src/sim/report.ts`, migration 8, `tests/v2-telemetry`).
   - One anonymous record per match: mode, operator, outcome, seconds, how you went out, "no cue" deaths, trigger-to-shot ms, revives, downs, bleed-outs, loot taken and expired, AI teammate actions, zone deaths, perk, RTT, queue wait, device class.
   - No account, name, wallet or IP; a random per-browser id.
   - Off in Settings (Share match stats).
   - `GET /api/game/report-summary` returns aggregates only.

## 3. Measurements (VERIFIED in this container, autopilot, not people)

- **Ace rate, 168 default-game runs (24 seeds x 7 heroes):**

  | | Wins | Ace |
  |---|---|---|
  | Perks off | 116 | 3 (1.8%) |
  | Perks on | 120 | 5 (3.0%) |

  The epic bar is under 1 in 100 (GP, `src/ui/medals.ts`). The earlier 1 of 84 was a lucky sample. The kept Ace runs had taken 92 to 151 damage, hence the new condition. The bar itself is unchanged.
- **Perks shift solo outcomes slightly:** +4 wins in 168. The player gets a perk in 82 of 168 runs. INFERRED: hostile Field Kit does nothing (hostiles are never downed), so the perk pool favours the player's side a little.
- **Unit tests:**

  | When | Tests | Files |
  |---|---|---|
  | Before | 866 | 85 |
  | Now | see the latest handoff | |

  Browser suites: see the latest handoff.

## 4. Owner decisions (not changed without you)

1. **NFT combat power in open modes (P0 in the report). Answered by the owner 2026-10-18 (CHOG SUPERPOWER SYSTEM, rule 6): no rarity health, armour or damage anywhere; a verified Chog plays the superpower its traits carry (`docs/design/superpowers.md`).** The options as they were put: LOCKED 9 (owner 2026-10-14) says power is ON, and the original 2026-10-11 rule was "never flat damage, health". Options, with my recommendation first:

   | Option | What it means | Cost and effect |
   |---|---|---|
   | C | Power only in 5v5 (already holders-only); open modes (solo, 1v1, 3v3) run at base power, holders keep tier perks there as status. | A small change (`power.ts` / `room.ts`), reversible by env flag. "Your wallet does not buy you more health" becomes true where non-holders play. |
   | A | `NFT_COMBAT=0` everywhere today. | Zero code. |
   | B or D | Cosmetic, status, or sidegrades only. | Larger redesign. |

   Consequence of C or A: the hackathon rule "the Chog NFT must be essential" rests on 5v5 access, identity, token history and the 1:1 signatures in 5v5. INFERRED: still essential under the removal test.
2. **Production hosting.** Render Free sleeps and restarts kill matches. A paid always-on host needs your yes (LOCKED 3).
3. **Bot backfill online.** Labelled bots in 1v1/3v3 queues after about 20 s (report rank 2). Not built: your call, since it changes what "online" means.
4. **The playtest programme** (section 6). It needs you to recruit people.

## 5. Not done yet (next passes, in order)

- AI teammate depth beyond resources and revives (protect the weak, regroup calls), map 2 and 3, hero 8 to 10, daily challenges, replay (the deterministic sim makes solo replay verification feasible: INFERRED), lag compensation, mobile proof on real phones.

## 6. Human playtest (UNKNOWN until run)

15 to 30 outside players, at least 150 matches; telemetry is now collected for every match. After each session ask the
owner's 12 questions (V2 prompt section 27). Day-30 gate numbers come from `GET /api/game/report-summary`.

## 7. UNKNOWN

Human feel of everything above; audio by ear; real phones (Pixel 7, iPhone 13, a cheap Android); real-network
latency; hosted 3v3/5v5; a real holder in 5v5; whether players read the distance tag, the downed card, or perks;
whether perks create build variety for people; Bullet Echo's live map count and server authority (from the report).
