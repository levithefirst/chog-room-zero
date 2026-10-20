// UIX: a location drawn from its real tile rows (src/config/maps.ts): walls, cover, doors, rails/decks/stairs, and the
// solo start. It shows the layout only (the same layout the map picker names), never where a hostile is.
// One SVG string, merged horizontal runs per tile kind, built once per location and cached.
import { MAPS, type MapId } from '../config/maps';

const FILL: Record<string, string> = { '#': 'var(--mp-wall)', c: 'var(--mp-cover)', b: 'var(--mp-cover)', d: 'var(--mp-door)', r: 'var(--mp-rail)', u: 'var(--mp-deck)', s: 'var(--mp-deck)' };
const cache = new Map<MapId, string>();

/** SVG markup for a location: viewBox in tiles, so it scales to any box (preserveAspectRatio keeps its shape). */
export function mapPreviewSvg(id: MapId): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const rows = MAPS[id].rows;
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  // The outer solid border of every layout is dropped: the preview frames the playable space.
  let x0 = w, x1 = 0, y0 = h, y1 = 0;
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '#') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(w - 1, x1 + 1); y1 = Math.min(h - 1, y1 + 1);
  const parts: string[] = [];
  let spawn: { x: number; y: number } | null = null;
  for (let y = y0; y <= y1; y++) {
    const r = rows[y];
    let x = x0;
    while (x <= x1) {
      const ch = r[x] ?? '#';
      if (ch === 'P') spawn = { x, y };
      const f = FILL[ch];
      let e = x + 1;
      while (f && e <= x1 && (r[e] ?? '#') === ch) e++;
      if (f) parts.push(`<rect x="${x - x0}" y="${y - y0}" width="${e - x}" height="1" fill="${f}"/>`);
      x = f ? e : x + 1;
    }
  }
  const vw = x1 - x0 + 1, vh = y1 - y0 + 1;
  const sp = spawn ? `<g class="mp-you"><circle cx="${spawn.x - x0 + 0.5}" cy="${spawn.y - y0 + 0.5}" r="1.6" fill="none" stroke="var(--mp-you)" stroke-width="0.35"/><circle cx="${spawn.x - x0 + 0.5}" cy="${spawn.y - y0 + 0.5}" r="0.6" fill="var(--mp-you)"/></g>` : '';
  const svg = `<svg class="mapprev" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${MAPS[id].name} layout"><rect width="${vw}" height="${vh}" fill="var(--mp-floor)"/>${parts.join('')}${sp}</svg>`;
  cache.set(id, svg);
  return svg;
}
