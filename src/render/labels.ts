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

/**
 * Debug-overlay label stacking: each label (anchored bottom-centre at its point) moves up a row while its box
 * (w x h, world u) would overlap an earlier label. Returns the adjusted y per input, input order kept.
 */
export function stackLabels(pts: readonly { x: number; y: number }[], w: number, h: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    let y = pts[i].y;
    for (let moved = true, guard = 0; moved && guard < pts.length; guard++) {
      moved = false;
      for (let j = 0; j < i; j++) {
        if (Math.abs(pts[j].x - pts[i].x) < w && Math.abs(out[j] - y) < h) { y = out[j] - h; moved = true; }
      }
    }
    out.push(y);
  }
  return out;
}
