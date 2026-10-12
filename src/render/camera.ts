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
