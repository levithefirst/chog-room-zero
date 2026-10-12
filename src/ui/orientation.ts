// Orientation (RC-5): every orientation plays, phones included (portrait-first mobile, owner 2026-10-12). A flip
// mid-run pauses the run (main.ts) and releases held input, then the camera and HUD re-lay out for the new shape.
export const ORIENTATION_QUERY = '(orientation: portrait)';
/** 'portrait' or 'landscape', for detecting a flip (a square viewport counts as landscape). */
export function orientationOf(w: number, h: number): 'portrait' | 'landscape' {
  return h > w ? 'portrait' : 'landscape';
}
