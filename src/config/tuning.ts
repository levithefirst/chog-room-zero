// All tunable numbers live here. Each comment says what the value should feel like.
// No gameplay values yet (P0-1 is scaffold only).

export const TUNING = {
  // Simulation step in seconds. 1/60 s: steady, frame-rate independent updates that never feel jittery.
  simStepSeconds: 1 / 60,
  // Max sim steps per rendered frame. 5: after a hitch the game catches up briefly instead of spiralling.
  maxStepsPerFrame: 5,
  // Background colour. Near-black blue: a dark room where light and silhouettes read clearly.
  backgroundColor: 0x0b0d10,
  // Placeholder marker colour. Muted cyan: visible on the dark floor without glaring.
  markerColor: 0x3fb8af,
  // Placeholder marker radius in px. 16: about thumb-width on a phone, proves scale and centering.
  markerRadius: 16,
} as const;
