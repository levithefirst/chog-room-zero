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

/**
 * Where to draw the view centre on one axis. If the whole map fits on this axis (a tall portrait tablet sees ~29-33 u
 * of a 26 u map), centre the map, so no screen space is spent on void past the edge. Otherwise follow the camera
 * unclamped, as before: in landscape the player stays centred and never slides under the corner HUD panels.
 */
export function frameAxis(cam: number, viewExtent: number, mapExtent: number): number {
  return viewExtent >= mapExtent ? mapExtent / 2 : cam;
}
