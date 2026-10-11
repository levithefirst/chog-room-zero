// All tunable numbers live here. Each comment says what the value should feel like.
// Movement numbers are PROPOSALS from docs/design/feel-and-controls.md, to tune by hand on device.
// Units: 1 u is about 1 metre. Speeds in u/s, accelerations in u/s^2.

export const TUNING = {
  // Simulation step in seconds. 1/60 s: steady, frame-rate independent updates that never feel jittery.
  simStepSeconds: 1 / 60,
  // Max sim steps per rendered frame. 5: after a hitch the game catches up briefly instead of spiralling.
  maxStepsPerFrame: 5,

  movement: {
    // Top run speed. 4.2 u/s: brisk tactical jog, crosses a ~12 u room in about 3 s.
    maxSpeed: 4.2,
    // Acceleration toward the held direction. 52.5 u/s^2: full speed in ~80 ms, snappy not floaty.
    acceleration: 52.5,
    // Braking when no key is held. 70 u/s^2: stops from full speed in ~60 ms, plants the feet.
    deceleration: 70,
    // Accel multiplier when the new direction opposes current velocity. 1.5: reversals feel
    // deliberate and weighty but not sluggish (~110 ms full reverse instead of ~160 ms).
    reverseAccelMultiplier: 1.5,
    // Below this speed with no input, velocity snaps to exactly 0. 0.01 u/s: no visible creep.
    stopEpsilon: 0.01,
  },

  render: {
    // Background colour. Near-black blue: a dark room where light and silhouettes read clearly.
    backgroundColor: 0x0b0d10,
    // Placeholder marker colour. Muted cyan: visible on the dark floor without glaring.
    markerColor: 0x3fb8af,
    // Placeholder marker radius in px. 16: about thumb-width on a phone.
    markerRadius: 16,
    // Pixels per world unit. 48: a 4.2 u/s run covers ~200 px/s, readable on a phone screen.
    pixelsPerUnit: 48,
  },
} as const;
