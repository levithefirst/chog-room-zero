// Every tunable number lives here (weapons in weapons.ts, heroes in heroes.ts). Each comment says what the
// value should feel like. All values are PROPOSALS to tune by hand. 1 u is about 1 metre; time in seconds.

export const TUNING = {
  // 1/60 s fixed step: steady, frame-rate independent, deterministic.
  simStepSeconds: 1 / 60,
  maxStepsPerFrame: 5,
  seed: 1337,

  movement: {
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
    // Aim error starts at 9 deg and settles over 1.2 s. Misses first, then tightens.
    aimErrorDeg: 9,
    aimSettleSeconds: 1.2,
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
  },

  render: {
    viewWidthUnits: 22,
    minViewHeightUnits: 11,
    cameraSmoothing: 0.12,
    lookahead: 2,
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
    fogUnexplored: 0x050607,
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
