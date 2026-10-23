// Orientation of the browser viewport. The game itself is landscape (owner 2026-10-13): a touch device held upright
// gets the landscape stage turned 90 deg (src/ui/stage.ts). A flip mid-run still pauses the run (main.ts) and
// releases held input, because every thumb position on the glass moves with it.
export const ORIENTATION_QUERY = '(orientation: portrait)';
/** 'portrait' or 'landscape', for detecting a flip (a square viewport counts as landscape). */
export function orientationOf(w: number, h: number): 'portrait' | 'landscape' {
  return h > w ? 'portrait' : 'landscape';
}
