// Every tunable number lives here. Each comment says what the value should feel like.
// All values are PROPOSALS to tune by hand on device. Units: 1 u is about 1 metre, time in seconds.

export const TUNING = {
  // 1/60 s fixed step: steady, frame-rate independent, deterministic.
  simStepSeconds: 1 / 60,
  // Catch-up cap per frame: after a hitch the game skips ahead briefly instead of spiralling.
  maxStepsPerFrame: 5,
  // Simulation seed. Same seed and inputs give the same match.
  seed: 1337,

  movement: {
    // Run speed. 4.2 u/s: brisk tactical jog; the 40 u room takes about 10 s to cross.
    maxSpeed: 4.2,
    // Full speed in ~80 ms: snappy, not floaty. (P0-2 value, unchanged.)
    acceleration: 52.5,
    // Stop from full speed in ~60 ms: plants the feet. (P0-2 value, unchanged.)
    deceleration: 70,
    // Reversals 1.5x faster than starts: deliberate but not sluggish. (P0-2 value, unchanged.)
    reverseAccelMultiplier: 1.5,
    // Snap to exactly 0 below this speed: no visible creep.
    stopEpsilon: 0.01,
    // Quiet walk speed share. 0.55: clearly slower, worth it only when sneaking.
    quietSpeedScale: 0.55,
    // Stick push below this share walks quietly on mobile. 0.6: a deliberate half push.
    quietStickThreshold: 0.6,
    // Body radius. 0.35 u: slips through 1 u doors with a little room to spare.
    radius: 0.35,
    // Distance travelled per footstep sound. 1.6 u: about 2.6 steps per second at a run.
    stepDistance: 1.6,
  },

  combat: {
    // Health. 100 with 34 damage: three hits kill. Lethal, but one mistake is survivable.
    maxHp: 100,
    damage: 34,
    // Bullet speed. 30 u/s: visibly travels (about 6 frames across the screen), still lethal.
    bulletSpeed: 30,
    // Bullet life. 0.9 s: about 27 u of reach, past the longest sightline.
    bulletLife: 0.9,
    // Speed added away from the shooter on hit. 1.2 u/s: a nudge you can read, not a shove.
    knockback: 1.2,
    // Extra spread while moving at full run, in degrees. Rewards stopping to shoot.
    moveSpreadDeg: 3,
  },

  vision: {
    // Near circle in u. 1.6: nothing right next to you is ever invisible.
    nearRadius: 1.6,
    // Ray step through the cone in degrees. 1.5: smooth light edge at phone scale.
    rayStepDeg: 1.5,
  },

  sound: {
    // Hearing radii in u (how far each sound carries in the open).
    quietStep: 3,
    runStep: 8,
    shot: 22,
    impact: 10,
    death: 12,
    reload: 4,
    // A wall between source and listener shrinks the radius to this share. Muffled, not silenced.
    wallFactor: 0.6,
    // Heard marker life. 1.4 s: long enough to glance at, short enough to stay fresh.
    markerLife: 1.4,
  },

  bots: {
    // Seconds a bot must keep seeing you before it commits. 0.4 s: you can slip past an edge.
    reactionTime: 0.4,
    // Starting aim error in degrees, shrinking while it keeps sight. Misses first, then tightens.
    aimErrorDeg: 9,
    aimSettleSeconds: 1.2,
    // Fire only when aim is within this many degrees of the target.
    fireToleranceDeg: 6,
    // Bot body turn rate. 300 deg/s: you can see it swing toward you.
    turnRateDegPerSec: 300,
    // Bot sight: the same cone and range as the default operator (fairness: no better eyes than yours).
    sightRange: 9,
    sightConeDeg: 70,
    // Seconds searching the last known spot before giving up. Memory expires.
    searchSeconds: 3.5,
    // Seconds looking around at an investigated sound.
    investigateLookSeconds: 2,
    // Health share below which a bot breaks line of sight and repositions.
    retreatHpShare: 0.5,
    // Seconds behind cover before peeking again.
    coverSeconds: 1.6,
    // Patrol walks quietly; engagements run.
    patrolQuiet: true,
  },

  render: {
    // World units visible across the screen width. 22 u: vision range plus room to react.
    viewWidthUnits: 22,
    // Never show fewer than this many units vertically (phones in landscape).
    minViewHeightUnits: 11,
    // Camera smoothing time. 0.12 s: follows without lag you can feel.
    cameraSmoothing: 0.12,
    // Camera lookahead toward aim, in u. 2: see a little more where you point.
    lookahead: 2,
    // Hit flash length. 0.06 s: about 4 frames, readable, never strobing.
    hitFlash: 0.06,
    // Muzzle flash length. 0.05 s: tells you who fired.
    muzzleFlash: 0.05,
    // Damage shake: 3 px for 0.12 s, only when you are hit.
    shakePx: 3,
    shakeSeconds: 0.12,
    // Death recap freeze before the summary. 1.2 s.
    deathFreeze: 1.2,
    // Health share that starts the low-health vignette.
    lowHpShare: 0.4,
  },

  // Colours. Six with a gameplay role each (see docs/design/art-direction.md).
  palette: {
    unknown: 0x07080a,
    wall: 0x111214,
    wallEdge: 0x2b2a27,
    floorLit: 0x3a362f,
    floorRemembered: 0x1b1b1a,
    cover: 0x6b6354,
    player: 0xe8e1d0,
    hostile: 0xc4532c,
    signal: 0xf2d98a,
  },
} as const;
