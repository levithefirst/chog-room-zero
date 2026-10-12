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
    // Body radius 0.35 u: slips through 1 u doors with room to spare.
    radius: 0.35,
    // Distance per footstep sound: about 2.6 steps/s at a run.
    stepDistance: 1.6,
  },

  combat: {
    // Knockback on hit, 1.0 u/s: a readable nudge, not a shove.
    knockback: 1.0,
    // Extra spread at full run, degrees. Rewards stopping to shoot.
    moveSpreadDeg: 2.5,
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
    // Grab radius 0.7 u: walk over it, no button.
    radius: 0.7,
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
    // A wall in between shrinks the radius to this share: muffled, not silenced.
    wallFactor: 0.6,
    markerLife: 1.4,
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
    patrolQuiet: true,
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

  render: {
    // Bodies are drawn this many times the sim radius (~36 px at 844x390). Collision is unchanged.
    actorScale: 1.45,
    // Canvas resolution cap (device pixel ratio). Fill cost scales with pixels.
    maxResolution: 1.5,
    viewWidthUnits: 22,
    minViewHeightUnits: 11,
    // Camera (CHOG-DES-001, src/render/camera.ts): position follows player + lead over cameraSmoothing s; the lead
    // eases toward facing x lookahead over leadSmoothing s. Lookahead 2 -> 1.5 u (~52 px at 844x390, was ~70-90):
    // still shows more of where you aim, without the off-centre feel ADE noted.
    cameraSmoothing: 0.12,
    leadSmoothing: 0.5,
    lookahead: 1.5,
    // Map bake resolution in px per u. 32: sharp on phones, 1.3 MB texture.
    bakePpu: 32,
    hitFlash: 0.06,
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
    // Out-of-sight: the map stays readable but cooler and darker.
    // Unexplored: dark cool fog over the slate ambient; outlines stay faintly visible (never pitch black).
    fogUnexplored: 0x0f161c,
    teamRing: 0x38e0c2,
    // Team colour (player) and hostile faction.
    team: 0xe6dfcc,
    teamDark: 0x2a2620,
    hostile: 0xc8502b,
    hostileDark: 0x3a1610,
    signal: 0xf2d98a,
    hostileTracer: 0xff9a6b,
    heal: 0x9fd18b,
    armor: 0x8fb0c8,
    ammo: 0xd9c27a,
  },
} as const;
