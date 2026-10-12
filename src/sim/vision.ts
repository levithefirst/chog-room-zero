// Sight: what a viewer can see, computed from wall geometry. Used for the player's light and bot perception.
import { angleDiff, raySegment } from './geom';
import type { Level } from './level';
import { sightClear } from './level';

export interface ViewShape {
  range: number;
  coneRad: number;
  nearRadius: number;
}

/** Exact test: is point (px,py) visible to a viewer at (x,y) facing `facing`? */
export function canSee(l: Level, x: number, y: number, facing: number, v: ViewShape, px: number, py: number): boolean {
  const dx = px - x, dy = py - y;
  const d = Math.hypot(dx, dy);
  const inShape = d <= v.nearRadius || (d <= v.range && Math.abs(angleDiff(facing, Math.atan2(dy, dx))) <= v.coneRad / 2);
  return inShape && sightClear(l, x, y, px, py);
}

function castRay(l: Level, x: number, y: number, a: number, max: number): number {
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = max;
  for (const s of l.segments) {
    const t = raySegment(x, y, dx, dy, s);
    if (t < best) best = t;
  }
  return best;
}

/**
 * Visibility polygon as flat [x0,y0,x1,y1,...]: the cone, clipped by walls, joined with the near circle.
 * Rays go at a fixed step plus just either side of every wall corner inside the cone, so edges are exact.
 */
export function visibilityPolygon(l: Level, x: number, y: number, facing: number, v: ViewShape, stepRad: number, out: number[]): number[] {
  out.length = 0;
  const half = v.coneRad / 2;
  const angles: number[] = [];
  for (let a = -half; a < half; a += stepRad) angles.push(a);
  angles.push(half);
  const eps = 0.0005;
  for (const s of l.segments) {
    for (const [cx, cy] of [[s.ax, s.ay], [s.bx, s.by]]) {
      if (Math.hypot(cx - x, cy - y) > v.range + 1) continue;
      const rel = angleDiff(facing, Math.atan2(cy - y, cx - x));
      if (Math.abs(rel) <= half) angles.push(rel - eps, rel + eps);
    }
  }
  angles.sort((a, b) => a - b);
  // Back arc: the near circle behind the viewer, also clipped by walls.
  const backStep = stepRad * 3;
  for (let a = half; a < Math.PI * 2 - half; a += backStep) {
    const r = castRay(l, x, y, facing + a, v.nearRadius);
    out.push(x + Math.cos(facing + a) * r, y + Math.sin(facing + a) * r);
  }
  for (const rel of angles) {
    if (rel < -half || rel > half) continue;
    const a = facing + rel;
    const r = castRay(l, x, y, a, v.range);
    out.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return out;
}
