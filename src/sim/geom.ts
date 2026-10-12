// Pure geometry used by collision, bullets, and sight. No allocation in the hot loops where avoidable.

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

// Segment p0->p1 against a box (Liang-Barsky). Returns the entry t in [0,1], or -1 if no hit.
// A start inside the box returns 0.
let ct0 = 0;
let ct1 = 1;
function clip(p: number, q: number): boolean {
  if (p === 0) return q >= 0;
  const r = q / p;
  if (p < 0) {
    if (r > ct1) return false;
    if (r > ct0) ct0 = r;
  } else {
    if (r < ct0) return false;
    if (r < ct1) ct1 = r;
  }
  return true;
}

export function segmentBoxT(x0: number, y0: number, x1: number, y1: number, b: Box): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  ct0 = 0;
  ct1 = 1;
  if (!clip(-dx, x0 - b.x0) || !clip(dx, b.x1 - x0) || !clip(-dy, y0 - b.y0) || !clip(dy, b.y1 - y0)) return -1;
  return ct0;
}

/** Segment p0->p1 against a circle. Returns the first t in [0,1], or -1. */
export function segmentCircleT(
  x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, r: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  if (a === 0) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/** Ray from (ox,oy) along unit (dx,dy) against a segment. Returns the distance, or Infinity. */
export function raySegment(ox: number, oy: number, dx: number, dy: number, s: Segment): number {
  const sx = s.bx - s.ax;
  const sy = s.by - s.ay;
  const den = dx * sy - dy * sx;
  if (den === 0) return Infinity;
  const ax = s.ax - ox;
  const ay = s.ay - oy;
  const t = (ax * sy - ay * sx) / den;
  const u = (ax * dy - ay * dx) / den;
  return t >= 0 && u >= 0 && u <= 1 ? t : Infinity;
}

/** Push a circle out of boxes. Mutates pos and kills velocity into the wall, so it slides. */
export function resolveCircle(
  pos: { x: number; y: number; vx: number; vy: number },
  r: number,
  boxes: readonly Box[],
): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
      const cy = Math.max(b.y0, Math.min(pos.y, b.y1));
      let nx = pos.x - cx;
      let ny = pos.y - cy;
      const d2 = nx * nx + ny * ny;
      if (d2 >= r * r) continue;
      let d = Math.sqrt(d2);
      if (d === 0) {
        // Centre inside the box: push out along the shallowest axis.
        const left = pos.x - b.x0, right = b.x1 - pos.x, up = pos.y - b.y0, down = b.y1 - pos.y;
        const m = Math.min(left, right, up, down);
        nx = m === left ? -1 : m === right ? 1 : 0;
        ny = m === up ? -1 : m === down ? 1 : 0;
        d = 0;
        pos.x += nx * (m + r);
        pos.y += ny * (m + r);
      } else {
        nx /= d;
        ny /= d;
        pos.x += nx * (r - d);
        pos.y += ny * (r - d);
      }
      const vn = pos.vx * nx + pos.vy * ny;
      if (vn < 0) {
        pos.vx -= vn * nx;
        pos.vy -= vn * ny;
      }
    }
  }
}

export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function pointInPolygon(x: number, y: number, poly: readonly number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Corner assist: a mover pressing head-on into a box face close to one of its ends gets a sideways direction
 * toward the nearer end, so it slides around the corner instead of stopping dead. Returns a unit tangent
 * ({0,0} when no assist applies). Pure; the caller moves and re-resolves.
 */
export function cornerAssistDir(
  x: number, y: number, r: number, mx: number, my: number, boxes: readonly Box[], reach: number,
): { x: number; y: number } {
  const ml = Math.hypot(mx, my);
  if (ml < 0.5) return { x: 0, y: 0 };
  const ux = mx / ml, uy = my / ml;
  for (const b of boxes) {
    const cx = Math.max(b.x0, Math.min(x, b.x1));
    const cy = Math.max(b.y0, Math.min(y, b.y1));
    const dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (d === 0 || d > r + 0.02) continue;
    const nx = dx / d, ny = dy / d;
    // Face contact only (axis normal) and pushing into it head-on (within ~40 deg).
    if (Math.abs(nx) > 0.01 && Math.abs(ny) > 0.01) continue;
    if (-(ux * nx + uy * ny) < 0.766) continue;
    if (ny !== 0) {
      const toLeft = x - (b.x0 - r), toRight = b.x1 + r - x;
      const bias = ux; // prefer the side the stick leans toward
      const left = toLeft - (bias < -0.05 ? reach : 0), right = toRight - (bias > 0.05 ? reach : 0);
      if (Math.min(toLeft, toRight) > reach && !(bias < -0.05 && toLeft <= reach * 2) && !(bias > 0.05 && toRight <= reach * 2)) continue;
      // Dead centre on a small box with no stick lean: no preferred side, so it stays a solid stop.
      if (Math.abs(bias) <= 0.05 && Math.abs(toLeft - toRight) < 0.25) continue;
      return { x: left <= right ? -1 : 1, y: 0 };
    } else {
      const toUp = y - (b.y0 - r), toDown = b.y1 + r - y;
      const bias = uy;
      const up = toUp - (bias < -0.05 ? reach : 0), down = toDown - (bias > 0.05 ? reach : 0);
      if (Math.min(toUp, toDown) > reach && !(bias < -0.05 && toUp <= reach * 2) && !(bias > 0.05 && toDown <= reach * 2)) continue;
      if (Math.abs(bias) <= 0.05 && Math.abs(toUp - toDown) < 0.25) continue;
      return { x: 0, y: up <= down ? -1 : 1 };
    }
  }
  return { x: 0, y: 0 };
}
