import { px } from './brand';

// Every tunable number lives here (weapons in weapons.ts, heroes in heroes.ts). Each comment says what the
// value should feel like. All values are PROPOSALS to tune by hand. 1 u is about 1 metre; time in seconds.

export const TUNING = {
  // 1/60 s fixed step: steady, frame-rate independent, deterministic.
  simStepSeconds: 1 / 60,
  maxStepsPerFrame: 5,
  seed: 1337,

  movement: {
    // Corner assist (CHOG-MAP-001 snagging): walking head-on (within 40 deg) into a box face that ends within this
    // many u of clearing, slide sideways toward the nearer end at cornerAssistSpeed x run speed. Collision is unchanged.
    cornerAssist: 0.9,
    cornerAssistSpeed: 0.7,
    // Base run speed (heroes scale it). 4.2 u/s: brisk tactical jog. (P0-2, unchanged.)
    maxSpeed: 4.2,
    // H34 stairs (Metro, Construction): 65% speed while on a stair tile, so climbing onto a deck takes about a second
    // longer than the same walk on the flat: long enough to be caught on the stairs, short enough not to be a chore.
    stairsMul: 0.65,
    // Full speed in ~80 ms, stop in ~60 ms, reversals 1.5x: snappy, planted, deliberate. (P0-2, unchanged.)
    acceleration: 52.5,
    deceleration: 70,
    reverseAccelMultiplier: 1.5,
    stopEpsilon: 0.01,
    // Quiet walk: 55% speed, worth it only when sneaking. Half stick push on mobile.
    quietSpeedScale: 0.55,
    quietStickThreshold: 0.6,
    // Touch facing (RC-5): with the aim thumb idle, you face where you walk (so the light cone shows the way and you
    // can look without firing). After you stop aiming, the aim is held this long so you can strafe while watching.
    touchAimHoldSeconds: 0.6,
    // Move-stick push below this share does not turn you (thumb jitter near the centre).
    touchFaceMoveMin: 0.25,
    // Body radius 0.35 u: slips through 1 u doors with room to spare.
    radius: 0.35,
    // Distance per footstep sound: about 2.6 steps/s at a run.
    stepDistance: 1.6,
    // CF-A (LAB.turn): the body (gun and lamp) turns toward the aim at this rate. 720 deg/s: a 180 flick takes 0.25 s,
    // anything under 12 deg lands in one step, so tracking feels direct and only a big turn costs time. PROPOSAL:
    // lab values 450 / 720 / 1080 for the owner's playtest.
    turnRateDegPerSec: 720,
    // CF steady rule: below this speed (u/s) for steadySeconds you are STEADY (tight gun, focused lamp, silent feet).
    steadySpeed: 0.9,
    steadySeconds: 0.2,
  },

  combat: {
    // Armour capacity (owner 2026-10-18 IDENTITY + MAPS pass: 65, was 50): every operator can carry up to 65; it starts
    // with its own armour (0 to 55). Armour pickups overfill past it by TUNING.pickups.overArmor.
    armorCap: 65,
    // Knockback on hit, 1.0 u/s: a readable nudge, not a shove.
    knockback: 1.0,
    // Extra spread at full run, degrees, before CF (LAB.steady off). With CF each weapon has its own moveSpreadDeg.
    moveSpreadDeg: 2.5,
    // CF-B: when you slow down, spread eases to its new value over ~3x this (s): the reticle visibly closes as you
    // settle (0.06 s: 95% in 0.18 s). Speeding up widens it at once.
    settleSeconds: 0.06,
    // CF-A: while the body lags the aim by more than turnFreeDeg, up to turnSpreadDeg is added (full at turnFullDeg):
    // flick-and-fire works, but loose.
    turnFreeDeg: 8,
    turnFullDeg: 40,
    turnSpreadDeg: 4,
    // GP (owner 2026-10-17: "stationary 360 fire"): a new trigger pull waits until the body has turned within this
    // many degrees of the aim. Before, a 180 flick fired its first rounds along the OLD facing (up to 168 deg off, the
    // wrong way) for the 0.25 s the capped turn takes. Now the first round leaves at most ~0.2 s later, toward the aim
    // (still loose: the turn spread above applies between 8 and 40 deg).
    fireMaxLagDeg: 40,
    // A pull made while still turning is kept this long (a tap fires once the body lines up, never lost).
    fireQueueSeconds: 0.3,
    // Armour soaks this share of each hit (before armour-pen) until the armour pool is empty.
    armorSoak: 0.6,
    // Lean rule: a shooter within this distance of a half-cover box shoots over it (box ignored).
    coverLean: 1.25,
  },

  pickups: {
    // Owner 2026-10-17 (FS): "substantially more Health, Armour, Grenade, Ammo ... throughout the venue". 26 pickups
    // (src/config/map.ts PICKUP_ZONES: 8 health, 6 armour, 6 grenades, 6 ammo) on a floor 2.9x the CF map's. More in
    // total and within reach of more places, a little less per tile of floor than before (a tactical resource
    // space, not a vending machine). Map-wide: health 8 x 40 / 30 s = 10.7 hp/s (FP 6.4 on 676 tiles; per tile 0.0055,
    // was 0.0095), armour 6 x 35 / 35 s = 6.0/s (was 4.7), grenades 6 / 50 s = 7.2 throws a minute for the whole room
    // (was 4.5). tests/pickup-layout.test.ts holds both sides of that.
    // GP (owner 2026-10-17: "increase resource availability ... ammo relatively frequent, health and armour moderate,
    // grenades slower"): 30 pickups (4 more ammo, in the corner rooms) and faster comebacks; kills now also drop what
    // the fallen carried (TUNING.loot). Map-wide: health 8 x 40 / 25 s = 12.8 hp/s (was 10.7), armour 6 x 35 / 30 s =
    // 7.0/s (was 6.0), ammo 10 x 2 mags / 14 s = 1.4 mags/s (was 0.6), grenades unchanged.
    // Owner 2026-10-18 (IDENTITY + MAPS pass): every pickup is back 4 s after it is taken (was health 25, armour 30,
    // ammo 14, grenade 50), on another tile of its zone and never next to anyone standing (nearActor), and there are
    // more of them (Room Zero 38 zones, was 30). The server alone decides when one is there.
    // Health +40.
    health: { amount: 40, respawn: 4 },
    // Armour +35.
    armor: { amount: 35, respawn: 4 },
    // Ammo: one magazine's worth x2 into reserve (never over the carry ceiling).
    ammo: { mags: 2, respawn: 4 },
    // Grenade +1, never above the carrier's capacity (3 free, more by verified tier).
    grenade: { amount: 1, respawn: 4 },
    // Placement (src/sim/pickups.ts): at least this far from every spawn on the map, from every other pickup, and
    // from anyone standing when it comes back. Each comeback moves it to another tile of its zone.
    spawnClear: 5,
    minSeparation: 5,
    nearActor: 3,
    // Even for both online sides: per kind, the average walk from the west spawns and from the east spawns to its
    // pickups (and to the nearest one) may differ by at most this many tiles; the layout tries this many seeded orders.
    balanceTolerance: 3,
    // A comeback never lands where it leaves its kind more uneven than this (it waits a second instead).
    balanceHard: 4.5,
    layoutTries: 48,
    // Collect on touch, no button, no second step: 0.7 u from the centre = the body (0.35 u) meeting the pickup
    // crate (0.3 u half-width) with 0.05 u to spare. RC-8 draws the body at its true 0.35 u (it was drawn 1.45x), so
    // the pickup is taken on the same step the drawn body touches the drawn pickup (tests/rc8-pickups.test.ts).
    radius: 0.7,
    // Master integration pass (owner 2026-10-14: a pickup at full health must not be irrelevant). Health over the
    // maximum is kept as overheal up to +25% of max health; armour can go 25 over its cap. Above those hard caps the
    // pickup is left for someone else. GP (owner 2026-10-17, "health ticks down when I'm not fighting"): the extra no
    // longer drains (it was 2 hp and 1 armour a second, with no hit to explain it); damage takes it first.
    overhealShare: 0.25,
    overArmor: 25,
    // A health or armour pickup is taken only if it would add at least this much (no pickup wasted for a sliver).
    minGain: 5,
  },

  revive: {
    // GP (owner 2026-10-17: "0 HP -> DOWNED -> 10-second revive window -> REVIVED or ELIMINATED"). With a teammate still
    // standing (solo: you and your AI teammates; online 3v3 and 5v5), 0 health downs you instead of ending you. The
    // downed pool (60) bleeds out over 10 s; hits on a downed player take it faster (finishing). At 0 they are
    // eliminated from this match (never signed out) and the one who downed them gets the kill. 1v1 and a team's last
    // standing member are eliminated at once (nobody can rescue them).
    downHp: 60,
    bleedSeconds: 10,
    // A standing teammate within 1.4 m who is not firing revives them in 3 s, back up at 30% health and no armour.
    // While someone is reviving, the bleed-out waits (the window is to REACH them). Any hit on the downed player or the
    // rescuer, the rescuer firing or stepping away, stops it and the progress starts again.
    range: 1.4,
    seconds: 3,
    hpShare: 0.3,
    // Downed players crawl at 25% speed and cannot shoot, reload, use the ability or take pickups.
    crawl: 0.25,
    // AI teammates go to revive when nothing they can see is within dangerSeen u and they were not hit in the last
    // calmSeconds, only the nearest one goes (the other covers), and only if they can get there with marginSeconds
    // of the window to spare.
    dangerSeen: 9,
    calmSeconds: 1.2,
    marginSeconds: 0.5,
    reachRange: 22,
  },

  loot: {
    // GP kill loot (src/sim/world.ts Loot): a bag of what the eliminated actor carried, at its feet, for 30 s. Taken on
    // touch like a pickup; each part only up to the taker's own ceiling, and the rest stays for someone else.
    on: true,
    seconds: 30,
    // The field dressing every operator carries (a kill always drops something worth a detour): +15 health.
    dressing: 15,
  },

  perks: {
    // V2 (src/config/perks.ts). Who carries one at the start: solo hostiles; online every player (seeded).
    // Soft Soles: footstep radius x0.6 (a run carries ~4.8 m instead of 8).
    solesStepMul: 0.6,
    // Keen Ears: the wall factor for what this actor hears (1 = walls do not shorten it; everyone else 0.8).
    earsWallFactor: 1,
    // Field Kit: revive progress runs this many times faster (3 s -> 1.5 s); revived at this share of health.
    medicReviveMul: 2,
    medicHpShare: 0.5,
    // Marker: a hit shows the target to the shooter's team this long (like a Ping on that one hostile).
    markerSeconds: 2,
    // Swapping a perk you hold for the one in a bag: stand on it this long (slower than this counts as standing).
    swapSeconds: 1,
    swapStillSpeed: 0.5,
  },

  abilities: {
    // Slip: 0.18 s at 13 u/s, about 2.3 u. Quiet.
    dashSeconds: 0.18,
    dashSpeed: 13,
    // Ping: 14 u radius, shows hostiles for 2.5 s; the ping itself carries 12 u.
    sonarRadius: 14,
    sonarSeconds: 2.5,
    sonarSound: 12,
    // Slab: 1.8 x 0.45 u, 1.1 u ahead, lasts 12 s.
    barrierLength: 1.8,
    barrierDepth: 0.45,
    barrierSeconds: 12,
    // Patch: +35 health.
    mendAmount: 35,
  },

  vision: {
    // Near circle: nothing right next to you is ever invisible.
    nearRadius: 1.6,
    // H34 lit areas (each location's lights, src/config/maps.ts): someone standing in one is seen this far off, inside
    // your cone and with a clear line. 22 u = the auto rifle's reach (32 u/s x 0.7 s): a lit aisle is a real firing
    // lane, a dark tunnel stays a lamp-length knife fight. Room Zero has none (the dark baseline).
    litRange: 22,
    // Ray step through the cone in degrees.
    rayStepDeg: 1.5,
    // Soft edge: a second, wider cone at lower brightness.
    softEdgeDeg: 10,
    // CF-E gait lamp: steady narrows the cone by focusCone and reaches focusRange further; a run widens it by the
    // same share and shortens it by runRange. Eases between them at focusRate per second (~0.25 s).
    focusCone: 0.15,
    focusRange: 0.2,
    runRange: 0.15,
    focusRate: 4,
  },

  sound: {
    // Hearing radii in u.
    quietStep: 3,
    runStep: 8,
    shot: 22,
    impact: 10,
    death: 12,
    reload: 4,
    pickup: 5,
    ability: 6,
    // H34 footstep surfaces (src/sim/level.ts stepSurface): carpet muffles a run to 5.6 u, so the Office rewards
    // creeping room to room; a deck or a stair rings out to 10.4 u, so the high ground is never taken quietly; a Metro
    // service tunnel echoes to 10.4 u, so its ambushes are heard coming both ways.
    surface: { carpet: 0.7, deck: 1.3, tunnel: 1.3 },
    // A wall in between shrinks the radius to this share: muffled, not silenced. CF-D: 0.6 -> 0.8 (tests/cf-lab.test.ts
    // D: contacts heard or spotted before they are seen 40% -> 70%; at 0.6 the CF map's pillars left it at 47%). The same
    // rule for bots, so they hear you through a wall sooner too.
    wallFactor: 0.8,
    markerLife: 1.4,
    // CF-D: a heard sound with no line of sight (through a wall) gives a DIRECTION only: a tick on a ring around you.
    dirTickLife: 1.1,
    // CF-C: your own noise ring expands to its true radius over this long, then is gone.
    ownNoiseSeconds: 0.32,
    // CF-D: after a hostile leaves every view, its outline stays at the last seen spot this long (LAST KNOWN).
    ghostSeconds: 1.6,
    // CF-E: a teammate's sighting is a SPOTTED mark refreshed this often (s), fading over spottedLife.
    spottedRefresh: 0.5,
    spottedLife: 1.2,
  },

  // SB matchmaking (server/room.ts tryMatch): like meets like, and the bar drops the longer anyone waits, so a quiet
  // queue still starts a match within seconds. Strength = rating + its tier's power offset (progression.ts RATING), so
  // a holder's starting power is matched, not hidden. Private room codes ignore it (friends play who they invite).
  match: {
    // Everyone in a room within this many rating points of each other at first...
    band: 150,
    // ...plus this many per second the oldest group has waited (after 20 s: 550, anyone in a small queue).
    widenPerSec: 20,
    // The two teams' average strength within this share of the band.
    teamGapShare: 0.5,
    // Accounts with fewer saved online matches than this count as new (rated no higher than the start rating), so a
    // first match is never against someone's main account.
    newMatches: 5,
    // What a Chog tier is worth when matching, in rating points. Owner 2026-10-18 (CHOG SUPERPOWER SYSTEM) removed tier
    // health, armour and damage, so every tier is worth 0: a superpower replaces the hero ability (a sidegrade,
    // measured in tests/sp-superpowers.test.ts), it adds no stats. Before: Common 115 ... 1:1 600 (measured duels).
    tierStrength: { free: 0, common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 } as Record<string, number>,
    // MP (P0, a real 1v1 never met: two friends had different saved locations): your location is tried first; after
    // this long (s) you also meet players who picked another one, on the location of whoever waited longest. Should feel
    // like "my pick if anyone is on it, a game either way". Infinity = strict per-location queues.
    anyMapAfterSec: 10,
    // A queued player is only matched if their socket said something this recently (pings every 2 s): a phone that
    // went into a tunnel is never seated in a room it cannot play.
    liveWithinSec: 6,
  },

  // SB online own-movement prediction (src/net/predict.ts).
  net: {
    // A server correction is blended out over this long (s): short enough that you end where the server says, long
    // enough that a 10 cm disagreement never reads as a twitch.
    correctSeconds: 0.1,
    // A disagreement bigger than this (u) is a real event (a dash, a knockback, a resume): snap instead of sliding.
    snapDistance: 2.5,
  },

  // SB contact intel (src/sim/intel.ts): what you believe about each hostile, how sure, how precisely, and how fast it
  // goes stale. LAW 3: information decays. The numbers are PROPOSALS for the owner's playtest; the lab measures them.
  intel: {
    // How fast an out-of-sight hostile's "could be anywhere in here" circle grows (u/s). A walk is 3.4 u/s, a creep
    // 2.3: 2 u/s means the circle is honest for someone moving carefully and a little generous for a runner, so a
    // last-known mark after 3 s says "about 6 m around here", not "here".
    spreadSpeed: 2,
    // Seconds until a belief has faded to nothing, by how it was learned. A sighting is worth remembering longest; a
    // footstep through a wall is a hint that is stale in a few seconds.
    lastKnownSeconds: 6,
    spottedSeconds: 4,
    heardSeconds: 4,
    directionSeconds: 3,
    // Below this share of its reported confidence it is only SUSPECTED (a faint circle: something was around here),
    // then LOST. 0.4: a direction tick shows for 1.8 of its 3 s, a sighting's outline for 3.6 of its 6 s.
    suspectBelow: 0.4,
    // A LOST contact stays drawn this long as it fades out, so a mark never just blinks away.
    lostSeconds: 0.6,
    // Heard with a clear line: the guess is off by up to this share of the distance (a shot 8 u away lands within
    // ~0.8 u). Per sound: a shot is loud and sharp, a creep step muffled and vague.
    hearShare: 0.1,
    hearMul: { shot: 0.6, step: 1, quietStep: 1.6, reload: 1.2, other: 1.3 } as Record<string, number>,
    // Heard through a wall: a direction within this many degrees and a distance within +/- this share. You know which
    // way, roughly how far, never the spot.
    dirErrDeg: 16,
    dirDistShare: 0.3,
    // A teammate's sighting: where they saw it, within this much (a call-out is a place, not a pixel).
    spottedRadius: 0.9,
    // Footprints kept per contact so a walker's path reads (older ones fade first).
    trail: 4,
    trailSeconds: 2.2,
    // A fresh update pulses for this long (the sound "lands" on the mark).
    freshSeconds: 0.45,
    // Confidence each source gives (sight is certain; a quiet step through a wall is a maybe).
    conf: { sight: 1, teammate: 0.85, shot: 0.9, reload: 0.75, step: 0.7, quietStep: 0.5, impact: 0.55, ability: 0.8, grenade: 0.7, other: 0.6 } as Record<string, number>,
    dirConfMul: 0.7,
  },

  // SB AI teammate call-outs (src/sim/bots.ts comms): short reports of what THEY perceive, never what they cannot.
  // Spam is the failure mode: one voice at a time, and each kind of call rests a while per teammate.
  comms: {
    // Seconds between any two call-outs from the squad (one voice at a time). Measured (16 default matches,
    // tests/sb-comms.test.ts): gap 1.4 with 7 s rests made 13.5 calls a minute, a stream; 2.2 s and longer rests on
    // the noisy kinds bring it under 10 while still calling a third of what the player then sees. The 15 zoned
    // pickups (owner 2026-10-17) move the squad and the bots around more: 2.2 s made 10.5 a minute, 2.5 s makes 8.5.
    // FS (68 x 42 venue, an active hostile squad that walks audibly): 2.5 s made 10.5 a minute again; 2.8 s brings it back.
    // GP: AI teammates now also say when they come to revive you and when they go for a bag you cannot see (both once),
    // and downed teammates who are revived fight on and talk: 2.8 s made 10.7 a minute, 3.0 s 10.4; 3.1 s.
    gap: 3.1,
    // Seconds before the same teammate makes the same kind of call again.
    rest: { contact: 4, behind: 4, lost: 8, steps: 10, shots: 10, reloading: 12, hurt: 10, reviving: 6, supply: 15 } as Record<string, number>,
    // A heard call (footsteps, shots) is skipped when the player stands this close to the caller: they heard it too.
    nearPlayer: 5,
    // "Behind us": a contact more than this many degrees off where you face.
    behindDeg: 115,
    // A new sighting of the same hostile only counts as a fresh contact after this long out of the caller's sight.
    recontactSeconds: 4,
    // "Lost him": called this long after the caller stops seeing a hostile it was tracking.
    lostAfter: 0.5,
    // A teammate who hears a call turns to cover that way for this long (unless it has something of its own).
    watchSeconds: 3.5,
    // How sure a heard call is to whoever receives it (they did not hear it themselves), and its spread (u): the
    // caller's own error plus the distance between them.
    conf: 0.55,
    baseRadius: 1.5,
    // Above a teammate's head, this long.
    chipSeconds: 1.8,
  },

  // Grenades (owner 2026-10-14, docs/design/roster-grenades.md). Every player carries them; capacity is by tier
  // (src/config/power.ts GRENADES). PROPOSAL numbers for the Core Feel Gate.
  grenade: {
    // Throw distance in u: PC throws to the cursor within min..max, touch throws along the aim at touchThrow.
    minThrow: 2,
    maxThrow: 9,
    touchThrow: 6.5,
    // Rolling friction (u/s^2). The launch speed is set so it comes to rest at the chosen distance (6.5 u: ~1 s).
    friction: 14,
    // Share of speed kept when it bounces off a wall. Crates and slabs do not stop it: it is lobbed over them.
    bounce: 0.45,
    // Throw to boom: long enough to see the ring land and step out of it.
    fuseSeconds: 1.4,
    // Blast: 70 at the centre falling to 20 at the 3.2 u edge; 30% ignores armour. Kills a free Bill from full only
    // with the centre plus a follow-up shot.
    radius: 3.2,
    damage: 70,
    edgeDamage: 20,
    armorPen: 0.3,
    // A crate or slab between the blast and you halves it; a wall blocks it.
    coverMul: 0.5,
    // Seconds between two throws: 13 grenades cannot be dumped in one go.
    throwCooldown: 1,
    // Hostile bots carry this many (solo difficulty); everyone else carries their tier's capacity.
    botCount: 1,
    // Sound radii (u): a quiet throw, a clink you hear nearby, a boom that carries like a shot and more.
    throwSound: 4,
    bounceSound: 7,
    boomSound: 22,
    // Bots throw at a believed spot this far away, at most once per botCooldown seconds.
    botMin: 4,
    botMax: 9,
    botCooldown: 5,
  },
  bots: {
    // Seconds of sight before committing. 0.45 s: you can slip past an edge.
    reactionTime: 0.45,
    // Aim error starts at 12 deg and settles over 2 s. Misses first, then tightens (RC-1 difficulty, below).
    aimErrorDeg: 12,
    // A bot stuck >1 s re-plans around the blocked tile this many times per goal before giving up (CHOG-AI-001).
    stuckRepaths: 4,
    aimSettleSeconds: 2,
    fireToleranceDeg: 6,
    // 300 deg/s turn: you can see it swing toward you.
    turnRateDegPerSec: 300,
    searchSeconds: 3.5,
    investigateLookSeconds: 2,
    // Below this health share a bot breaks line of sight, repositions, or goes for health.
    retreatHpShare: 0.5,
    coverSeconds: 1.6,
    // Go for a health pickup within this distance when hurt.
    healthSeekRange: 14,
    // ...but only after this long without being hit (owner 2026-10-17: more health on the map must not erase the
    // damage you deal; a bot no longer breaks off mid-fight to reset). Solo 1v5 autopilot wins in 160 seeds,
    // Ray / Tabsu / Toad: old 9-pickup map 6 / 3 / 10; 15 zoned pickups without this rule 3 / 6 / 12; 2 s 5 / 13 / 4;
    // 4 s 7 / 11 / 11. 3, 4 and 6 s each left one 16-seed information or call-out statistic just past its bar
    // (tests/sb-lab, sb-comms); 2 s passes them all. PROPOSAL: the owner's playtest decides.
    healCalmSeconds: 2,
    // Before CF bots crept on patrol (3 u steps, almost never heard). CF-D: they walk their rounds at patrolSpeed
    // (steps heard ~6 u), pause patrolPause..+patrolPauseJitter s at each point, stop to listen listenSeconds when
    // they hear something, then creep (quiet) toward it.
    patrolQuiet: true,
    patrolSpeed: 0.8,
    patrolPause: 1.2,
    // Owner 2026-10-17: the hostile squad must act like a team of opponents, not wait for the zone. Between fights
    // each bot picks a job and re-decides when it is done or after decideSeconds (src/sim/bots.ts squadTask):
    // hunt (go where a squadmate SAW you, at most huntResponders bots, within reportSeconds of the sighting),
    // resupply (a pickup it needs within resupplyRange), search (the tactical point its squad checked longest ago),
    // hold (watch a control point for holdSeconds), regroup (back toward the squad when far from everyone), patrol
    // (its beat). Weights pick between search, hold, regroup and patrol; the nearest-first tie-break is seeded.
    squad: {
      reportSeconds: 10,
      radioDelay: 2,
      huntResponders: 1,
      maxHunters: 1,
      decideSeconds: 14,
      holdSeconds: 5,
      visitRadius: 4,
      regroupDistance: 26,
      resupplyRange: 30,
      needHpShare: 0.7,
      needArmorShare: 0.5,
      weights: { search: 4, hold: 0.75, regroup: 1, patrol: 1 },
      // Searching leans toward your spawn side for the first pushSeconds (a bonus of up to pushBonus, as if the point
      // were that many seconds staler), and a bot surprised while walking a job reacts walkingReaction s later.
      pushBonus: 15,
      pushSeconds: 45,
      walkingReaction: 0.15,
      // A job further than this (u) is jogged to (louder, faster); a near one is walked.
      jogDistance: 12,
    },
    // GP AI teammates and resources (src/sim/bots.ts allySupply): utility = need - walk/distancePerPoint, taken when
    // over minScore. Need: health below healthBelow of max (x healthWeight), armour below armorBelow, reserve below two
    // magazines, grenades below capacity (lowest weight). A bag adds lootBonus (several things at once). Calm only (no
    // hostile in sight, not hit for calmSeconds); never within dangerRadius of the last threat it knows of; never
    // further than leash u from you (leashCritical when the need is critical); and a teammate who needs health or
    // armour more and is within yieldExtra u as close gets it first. Re-judged every thinkSeconds. PROPOSAL.
    // V2 AI teammates guard a hurt you: one of them stands between you and the threat it knows of.
    guard: {
      // You are hurt below this share of your health (and standing).
      hpBelow: 0.4,
      // It knows of a threat: its own belief (heard, seen, told) above this confidence, within this range of you.
      suspicion: 0.3,
      threatRange: 16,
      // Where it stands: this far from you toward the threat.
      distance: 1.8,
    },
    supply: {
      calmSeconds: 2,
      thinkSeconds: 0.5,
      minScore: 0.18,
      distancePerPoint: 30,
      healthBelow: 0.85,
      healthWeight: 1.6,
      armorBelow: 0.6,
      armorWeight: 0.9,
      ammoWeight: 1.2,
      grenadeWeight: 0.45,
      lootBonus: 0.1,
      // V2: an empty perk slot values any perk in a bag this much (about a quarter-empty magazine's worth).
      perkValue: 0.35,
      critical: 0.8,
      range: 18,
      leash: 9.5,
      leashCritical: 20,
      dangerRadius: 7,
      yieldExtra: 6,
    },
    patrolPauseJitter: 1.6,
    listenSeconds: 0.55,
    // ...and creeps only the last creepWithin u to a noise it is checking (walks the rest, audibly).
    creepWithin: 4,
    // RC-1 difficulty (evidence: tests/rc-victory.test.ts, docs/design/bots.md). Bots carry the same weapons and
    // health as the heroes, so 1v5 at parity was ~unwinnable (scripted player won 9/80 runs, ADE never reached
    // victory). Bots now deal 60% damage, aim 12 deg settling over 2 s, and react in 0.40-0.65 s.
    damageMul: 0.6,
  },

  // Perception rules shared by the player and the bots (docs/design/bots.md). One source of truth.
  perception: {
    // A muzzle flash with clear wall line of sight reveals the shooter for this long, at any range, both sides.
    flashSeconds: 0.7,
    // Reaction delay before a bot fires at what it sees: seeded per acquisition, uniform in [min, max].
    reactionMin: 0.4,
    reactionMax: 0.65,
    // Being shot gives a direction only: a guess along the incoming ray, this many degrees off at most,
    // at 60%..140% of the true distance.
    shotDirErrorDeg: 20,
    shotRangeMin: 0.6,
    shotRangeMax: 1.4,
    // Heard positions: error grows with distance (share of the distance).
    hearErrorShare: 0.15,
    // Suspicion: set by a signal (seen 1, flash 0.9, shot 0.8, heard 0.6), then decays to 0 over this many seconds.
    memorySeconds: 6,
    // At most this many bots may shoot at the player at once. The rest flank or hold.
    attackTokens: 2,
    // Minimum seconds between path requests per bot, unless the goal moved more than repathDistance.
    repathSeconds: 0.35,
    repathDistance: 1.5,
  },

  // Shrinking danger zone (RC-8, src/sim/zone.ts). 97 s to the last circle: 45 s of open play, then three stages,
  // each shown for a few seconds before it closes. 45 s, not 30: with 30 s the scripted Mop won 0 of 40 solo runs
  // (bots leave patrol for the zone during the hunt); 45 s kept every hero near its no-zone rate (docs/design/zone.md). Damage outside escalates so lingering gets worse, never
  // instant: 4/s gives ~25 s to get back in at full health, the final 20/s about 5 s.
  zone: {
    // The big venue (68 x 42, owner 2026-10-17): 50 s of open play, then a first circle of 20 u (it holds the atrium
    // and both flank corridors), 9 u, 3.5 u. From the far corner of a spawn hall to the first circle is ~30 u, about
    // 7 s running: the warning (8 s) is enough if you move when it shows. The whole room still ends in ~105 s.
    // Owner 2026-10-18 (IDENTITY + MAPS pass): every interval of the schedule exactly 20% longer (was safe 50; warn
    // 8 / 6 / 5; shrink 15 / 10 / 8). Radii and damage unchanged. The whole room now ends in ~126 s.
    safeSeconds: 60,
    stages: [
      { warn: 9.6, shrink: 18, radius: 20, dps: 4 },
      { warn: 7.2, shrink: 12, radius: 9, dps: 8 },
      { warn: 6, shrink: 9.6, radius: 3.5, dps: 14 },
    ],
    finalDps: 20,
    // The last circle's centre keeps this much open floor around it (no crate or wall to camp in it).
    clearance: 1.5,
    // Bots (and the test autopilot) head in once they are within this many u of the closing circle's edge.
    moveInMargin: 1,
  },

  render: {
    // H34: how much of the lit look a lit area keeps when it is out of your lamp (0 dark, 1 fully lit). 0.55 reads as
    // "lit room over there" without looking like your own light.
    litGlow: 0.55,
    // Bodies are drawn at this many times the sim radius. RC-8: 1, the drawn operator IS the hitbox (was 1.45, which
    // the owner read as an oversized circle that bullets missed). ~27 px across at 844x390, ~46 px at 1440x900.
    actorScale: 1,
    // Canvas resolution cap (device pixel ratio). Fill cost scales with pixels.
    maxResolution: 1.5,
    viewWidthUnits: 22,
    minViewHeightUnits: 11,
    // Portrait canvas (RC-5; since RC-6 only a tall, narrow desktop window: phones and tablets always get the
    // landscape stage): ~15 u across, so a 390 px window draws the player ~27 px wide and sees ~32 u top to bottom.
    // Never wider than 22 u, never closer than portraitMaxPpu (a 600-800 px wide window keeps landscape scale).
    portraitViewWidthUnits: 15,
    portraitMaxPpu: 30,
    // Portrait lookahead toward the aim: with 7.5 u to each side, 3 u of lead shows ~10.5 u ahead of the player.
    portraitLookahead: 3,
    // Camera (CHOG-DES-001, src/render/camera.ts): position follows player + lead over cameraSmoothing s; the lead
    // eases toward facing x lookahead over leadSmoothing s. Lookahead 2 -> 1.5 u (~52 px at 844x390, was ~70-90):
    // still shows more of where you aim, without the off-centre feel ADE noted.
    cameraSmoothing: 0.12,
    leadSmoothing: 0.5,
    lookahead: 1.5,
    // Map bake resolution in px per u. 32: sharp on phones, 1.3 MB texture.
    bakePpu: 32,
    // Out-of-light map (render/bake.ts): ambient RGB plus this share of the lit structure. Before CF 0.5 over
    // (14, 20, 26): the whole layout read in the dark. CF-E: 0.2 over (7, 10, 13): walls and doors still outline, floor
    // detail needs your light.
    dimStructure: 0.2,
    dimAmbient: [7, 10, 13],
    // CF feedback: 0.09 s (was 0.06, under 4 frames) so a hit body flash survives a dropped frame.
    hitFlash: 0.09,
    muzzleFlash: 0.05,
    shakePx: 3,
    shakeSeconds: 0.12,
    deathFreeze: 1.2,
    lowHpShare: 0.35,
    // Damage-direction arc stays 1 s.
    damageArcSeconds: 1,
    deathAnimSeconds: 0.4,
    // Particle cap for impact sparks.
    maxSparks: 60,
  },

  palette: {
    // RC-8: in-world colours come from the PROVISIONAL CHOG tokens (src/config/brand.ts), never typed in here.
    // Out-of-sight: the map stays readable but cooler and darker.
    // Unexplored: dark cool fog over the slate ambient; outlines stay faintly visible (never pitch black).
    fogUnexplored: 0x0f161c,
    // Ally ring (you, and teammates online).
    teamRing: px('ally'),
    // Player-side fills (overhead bar) and the hostile faction (outline, markers, bars).
    team: px('health'),
    teamDark: px('bgDeep'),
    hostile: px('enemy'),
    hostileDark: px('bgDeep'),
    // Reticle, own tracers, heard-sound rings and reload arcs: cream reads on every floor value.
    signal: px('cream'),
    hostileTracer: px('dangerGlow'),
    heal: px('health'),
    armor: px('armor'),
    ammo: px('ammo'),
    // Grenade pickup: pink with a round shell icon (no other pickup uses pink or a circle).
    grenade: px('pink'),
    // Soft glow under a pickup you would take (brand guide: pickup glows soft purple).
    pickup: px('pickup'),
    zone: px('dangerZone'),
    zoneGlow: px('dangerGlow'),
  },
} as const;
