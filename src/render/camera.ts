// Camera with aim lead (CHOG-DES-001). Two cascaded first-order filters, so it never overshoots:
//   lead  -> eases toward facing x lookahead over leadSmoothing (slow: aim flicks and touch-aim noise don't whip
//            the view; the lead vector crosses through the player on a 180 deg flick instead of swinging round)
//   pos   -> eases toward player + lead over cameraSmoothing (tight: the player never drifts off screen)
// A new camera starts on the player with zero lead, so spawn is centred and the lead ramps in.
export interface Camera { x: number; y: number; lx: number; ly: number }
export interface CameraTuning { lookahead: number; leadSmoothing: number; cameraSmoothing: number }

export function createCamera(px: number, py: number): Camera {
  return { x: px, y: py, lx: 0, ly: 0 };
}

export function stepCamera(c: Camera, px: number, py: number, facing: number, dt: number, T: CameraTuning): void {
  const kl = 1 - Math.exp(-dt / T.leadSmoothing);
  c.lx += (Math.cos(facing) * T.lookahead - c.lx) * kl;
  c.ly += (Math.sin(facing) * T.lookahead - c.ly) * kl;
  const k = 1 - Math.exp(-dt / T.cameraSmoothing);
  c.x += (px + c.lx - c.x) * k;
  c.y += (py + c.ly - c.y) * k;
}

/** Pixels per world unit: landscape fits 22 u across (min 11 u tall); portrait frames ~15 u across (RC-5). */
export function viewScale(sw: number, sh: number, T: { viewWidthUnits: number; minViewHeightUnits: number; portraitViewWidthUnits: number; portraitMaxPpu: number }): number {
  if (sh <= sw) return Math.min(sw / T.viewWidthUnits, sh / T.minViewHeightUnits);
  return Math.max(sw / T.viewWidthUnits, Math.min(sw / T.portraitViewWidthUnits, T.portraitMaxPpu));
}

/**
 * Portrait framing on one axis (RC-5). Show map rather than void past its edge (or centre the map when it fits), but
 * never move the view so far that the player slides under a HUD band: `bandLo`/`bandHi` are the HUD depths (u) at the
 * low (top/left) and high (bottom/right) screen edges, `margin` the player's drawn radius plus its bar.
 * Landscape keeps the plain follow camera (player centred, clear of the corner panels).
 */
export function frameAxis(cam: number, player: number, viewExtent: number, mapExtent: number, bandLo: number, bandHi: number, margin: number): number {
  const half = viewExtent / 2;
  const want = viewExtent >= mapExtent ? mapExtent / 2 : Math.min(mapExtent - half, Math.max(half, cam));
  const lo = player - half + bandHi + margin; // the player stays above / left of the far band
  const hi = player + half - bandLo - margin; // ... and below / right of the near band
  if (lo > hi) return cam;
  return Math.min(hi, Math.max(lo, want));
}
