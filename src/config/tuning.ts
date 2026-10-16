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
    // Armour soaks this share of each hit (before armour-pen) until the armour pool is empty.
    armorSoak: 0.6,
    // Lean rule: a shooter within this distance of a half-cover box shoots over it (box ignored).
    coverLean: 1.25,
  },

  pickups: {
    // Health +40, back after 20 s: worth a detour, not a camping spot.
    health: { amount: 40, respawn: 20 },
    // Armour +35, back after 25 s.
    armor: { amount: 35, respawn: 25 },
    // Ammo: one magazine's worth x2 into reserve, back after 15 s.
    ammo: { mags: 2, respawn: 15 },
    // Collect on touch, no button, no second step: 0.7 u from the centre = the body (0.35 u) meeting the pickup
    // crate (0.3 u half-width) with 0.05 u to spare. RC-8 draws the body at its true 0.35 u (it was drawn 1.45x), so
    // the pickup is taken on the same step the drawn body touches the drawn pickup (tests/rc8-pickups.test.ts).
    radius: 0.7,
    // Master integration pass (owner 2026-10-14: a pickup at full health must not be irrelevant). Health over the
    // maximum is kept as overheal up to +25% of max health and drains at 2 per second back to the maximum; armour can
    // go 25 over its cap and drains at 1 per second. Above those hard caps the pickup is left for someone else.
    overhealShare: 0.25,
    overhealDecay: 2,
    overArmor: 25,
    overArmorDecay: 1,
    // A health or armour pickup is taken only if it would add at least this much (no pickup wasted for a sliver).
    minGain: 5,
  },

  revive: {
    // Team modes (3v3, 5v5): a player dropped to 0 with a teammate still standing is DOWNED, not out. The downed pool
    // (60) bleeds out over 15 s, faster under fire; at 0 they are eliminated and the one who downed them gets the kill.
    // 1v1 and the last standing member of a team are eliminated at once (nobody can rescue them).
    downHp: 60,
    bleedSeconds: 15,
    // A standing teammate within 1.4 m who is not firing revives them in 3 s, back up at 30% health and no armour.
    // Any hit on the downed player or the rescuer resets the progress.
    range: 1.4,
    seconds: 3,
    hpShare: 0.3,
    // Downed players crawl at 25% speed and cannot shoot, reload, use the ability or take pickups.
    crawl: 0.25,
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
    // the noisy kinds bring it under 10 while still calling a third of what the player then sees.
    gap: 2.2,
    // Seconds before the same teammate makes the same kind of call again.
    rest: { contact: 4, behind: 4, lost: 8, steps: 10, shots: 10, reloading: 12, hurt: 10 } as Record<string, number>,
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
    // Before CF bots crept on patrol (3 u steps, almost never heard). CF-D: they walk their rounds at patrolSpeed
    // (steps heard ~6 u), pause patrolPause..+patrolPauseJitter s at each point, stop to listen listenSeconds when
    // they hear something, then creep (quiet) toward it.
    patrolQuiet: true,
    patrolSpeed: 0.8,
    patrolPause: 1.2,
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
    safeSeconds: 45,
    stages: [
      { warn: 8, shrink: 15, radius: 14, dps: 4 },
      { warn: 6, shrink: 10, radius: 7, dps: 8 },
      { warn: 5, shrink: 8, radius: 3.5, dps: 14 },
    ],
    finalDps: 20,
    // The last circle's centre keeps this much open floor around it (no crate or wall to camp in it).
    clearance: 1.5,
    // Bots (and the test autopilot) head in once they are within this many u of the closing circle's edge.
    moveInMargin: 1,
  },

  render: {
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
    // Soft glow under a pickup you would take (brand guide: pickup glows soft purple).
    pickup: px('pickup'),
    zone: px('dangerZone'),
    zoneGlow: px('dangerGlow'),
  },
} as const;
