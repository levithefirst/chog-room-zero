// Screen-space label placement that keeps labels out from under HUD panels (CHOG-HUD-002).
// Rects come from the DOM (getBoundingClientRect), so safe-area insets are already included.
export interface Rect { x: number; y: number; w: number; h: number }

function hits(x: number, y: number, w: number, h: number, rects: readonly Rect[]): boolean {
  for (const r of rects) if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return true;
  return false;
}

/**
 * Label centred on sx, its top at sy + gap (below the pickup) by default; above (bottom at sy - gap) if below
 * would overlap a HUD rect; hidden if both would (the pickup icon itself always stays visible).
 */
export function placeLabel(sx: number, sy: number, w: number, h: number, gap: number, hud: readonly Rect[]): { y: number; visible: boolean } {
  const x = sx - w / 2;
  const below = sy + gap;
  if (!hits(x, below, w, h, hud)) return { y: below, visible: true };
  const above = sy - gap - h;
  if (!hits(x, above, w, h, hud)) return { y: above, visible: true };
  return { y: below, visible: false };
}
