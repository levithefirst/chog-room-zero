// The operator as seen from above (RC-8): an original CHOG-inspired chibi, drawn from the brand guide's character
// notes (purple spiky body, cream face, pink cheeks and hands, big eyes) and NOT copied from any CHOG artwork.
// Pure data in unit space: 1 = the sim body radius (TUNING.movement.radius), facing +x. The PixiJS renderer and the
// menu SVG portraits both draw these parts, so what you pick in the menu is what you see in the match, and the drawn
// silhouette is the hitbox (tests/rc8-operators.test.ts measures it).
import type { BrandToken } from '../config/brand';

export interface Dot { x: number; y: number; r: number }
export interface Oval { x: number; y: number; rx: number; ry: number }
export interface Gear { poly?: number[]; dot?: Dot; fill: BrandToken; stroke?: BrandToken }

export interface ChogParts {
  /** Spiky body outline, flat [x0, y0, x1, y1, ...]. Valleys and tips straddle radius 1 (the hitbox). */
  body: number[];
  face: Oval;
  eyes: Dot[];
  cheeks: Dot[];
  hands: Dot[];
  /** Per-operator silhouette cue, so Kettle, Mop, Brick and Wick read apart at a glance (not by colour alone). */
  gear: Gear[];
}

interface Spikes { n: number; front: number; back: number; valley: number }

// Spikes per operator: count, tip length at the front and the back (hedgehog spikes sweep back), valley depth.
const SPIKES: Record<string, Spikes> = {
  kettle: { n: 9, front: 1.04, back: 1.16, valley: 0.86 },
  mop: { n: 13, front: 1.06, back: 1.2, valley: 0.84 }, // many thin strands: the fast one
  brick: { n: 7, front: 1.02, back: 1.1, valley: 0.9 }, // short, blunt: the heavy one
  wick: { n: 10, front: 1.04, back: 1.14, valley: 0.86 },
};

function spikyBody(s: Spikes): number[] {
  const pts: number[] = [];
  const steps = s.n * 2;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    // 0 at the front (+x), 1 at the back: tips grow toward the back.
    const back = (1 - Math.cos(a)) / 2;
    const r = i % 2 === 0 ? s.front + (s.back - s.front) * back : s.valley;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

function gearFor(id: string): Gear[] {
  switch (id) {
    // Kettle (rifle, Patch): a round lid on the crown with a knob; the medic.
    case 'kettle': return [
      { dot: { x: -0.36, y: 0, r: 0.32 }, fill: 'purpleDeep', stroke: 'purpleBright' },
      { dot: { x: -0.36, y: 0, r: 0.11 }, fill: 'health' },
    ];
    // Mop (SMG, Slip): a pink sweatband across the brow; the runner.
    case 'mop': return [{ poly: [0.02, -0.78, 0.2, -0.74, 0.2, 0.74, 0.02, 0.78], fill: 'pink' }];
    // Brick (shotgun, Slab): a square helmet plate on the crown; the holder.
    case 'brick': return [{ poly: [-0.78, -0.46, -0.12, -0.46, -0.12, 0.46, -0.78, 0.46], fill: 'purpleDeep', stroke: 'border' }];
    // Wick (marksman, Ping): one tall wick spike with a lit tip, and a scope ring over one eye; the lane holder.
    case 'wick': return [
      { poly: [-0.5, -0.12, -1.12, 0, -0.5, 0.12], fill: 'purpleDeep' },
      { dot: { x: -1.08, y: 0, r: 0.09 }, fill: 'ammo' },
      { dot: { x: 0.6, y: -0.2, r: 0.19 }, fill: 'bgDeep', stroke: 'cream' },
    ];
    default: return [];
  }
}

export function chogParts(heroId: string): ChogParts {
  return {
    body: spikyBody(SPIKES[heroId] ?? SPIKES.kettle),
    // Cream face at the front: from above you see mostly the purple spiky crown, the face only toward the facing
    // direction (RC-8 review: a bigger face read as the old white disc).
    face: { x: 0.5, y: 0, rx: 0.34, ry: 0.5 },
    eyes: [{ x: 0.6, y: -0.2, r: 0.12 }, { x: 0.6, y: 0.2, r: 0.12 }],
    cheeks: [{ x: 0.5, y: -0.44, r: 0.09 }, { x: 0.5, y: 0.44, r: 0.09 }],
    // Pink hands forward, the gun hand on the right of the facing direction.
    hands: [{ x: 0.62, y: 0.62, r: 0.2 }, { x: 0.7, y: -0.5, r: 0.17 }],
    gear: gearFor(heroId),
  };
}

/** Min, max and mean radius of the body outline (unit space): the hitbox check. */
export function bodyRadii(p: ChogParts): { min: number; max: number; mean: number } {
  const r: number[] = [];
  for (let i = 0; i < p.body.length; i += 2) r.push(Math.hypot(p.body[i], p.body[i + 1]));
  return { min: Math.min(...r), max: Math.max(...r), mean: r.reduce((a, b) => a + b, 0) / r.length };
}

/** Rotate and scale unit-space points into world space (facing angle, radius in u). */
export function place(pts: readonly number[], x: number, y: number, facing: number, scale: number, out: number[] = []): number[] {
  const c = Math.cos(facing) * scale, s = Math.sin(facing) * scale;
  out.length = pts.length;
  for (let i = 0; i < pts.length; i += 2) {
    out[i] = x + pts[i] * c - pts[i + 1] * s;
    out[i + 1] = y + pts[i] * s + pts[i + 1] * c;
  }
  return out;
}
