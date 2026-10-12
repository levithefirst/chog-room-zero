// The portrait "turn sideways" prompt (index.html: @media (orientation: portrait) and (max-width: 599px)).
// Kept in sync with that CSS rule; main.ts pauses play while it is shown, so nobody dies behind the prompt.
// Why 600 px: the camera fits 22 u across the width (render.ts), so a 390 px phone in portrait draws the player as a
// ~7 px dot and puts flank threats off screen while they can still shoot. From ~600 px wide (tablets in portrait,
// 744-1024 px) the scale matches phone landscape (~30-37 px/u), so tablets play in portrait and only phones rotate.
export const PORTRAIT_PLAY_MIN_WIDTH = 600;
export const ROTATE_QUERY = `(orientation: portrait) and (max-width: ${PORTRAIT_PLAY_MIN_WIDTH - 1}px)`;
export function rotatePromptShown(w: number, h: number): boolean {
  return h > w && w < PORTRAIT_PLAY_MIN_WIDTH;
}
/** 'portrait' or 'landscape', for detecting a flip (a square viewport counts as landscape). */
export function orientationOf(w: number, h: number): 'portrait' | 'landscape' {
  return h > w ? 'portrait' : 'landscape';
}
