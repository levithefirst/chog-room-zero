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
  /** Per-character silhouette cue, so the seven roster characters read apart at a glance (not by colour alone). */
  gear: Gear[];
}

interface Spikes { n: number; front: number; back: number; valley: number }

// Spikes per character: count, tip length at the front and the back (hedgehog spikes sweep back), valley depth.
const SPIKES: Record<string, Spikes> = {
  benja: { n: 9, front: 1.04, back: 1.16, valley: 0.86 },
  toad: { n: 7, front: 1.02, back: 1.1, valley: 0.9 }, // short, blunt: the tank
  ray: { n: 10, front: 1.04, back: 1.14, valley: 0.86 },
  tabsu: { n: 13, front: 1.06, back: 1.2, valley: 0.84 }, // many thin strands: the fast one
  tonashiro: { n: 8, front: 1.03, back: 1.12, valley: 0.88 },
  yot: { n: 11, front: 1.05, back: 1.15, valley: 0.86 },
  bill: { n: 12, front: 1.06, back: 1.2, valley: 0.84 }, // long swept spikes: the diver
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
    // Benja (assault, rifle, Ping): a small dish on the crown with a lit receiver.
    case 'benja': return [
      { poly: [-0.2, -0.36, -0.46, -0.3, -0.56, 0, -0.46, 0.3, -0.2, 0.36, -0.32, 0], fill: 'purpleDeep', stroke: 'purpleBright' },
      { dot: { x: -0.36, y: 0, r: 0.09 }, fill: 'ally' },
    ];
    // Toad (tank, LMG, Slip): a wide square helmet plate with shoulder pads; the frontline.
    case 'toad': return [
      { poly: [-0.82, -0.56, -0.08, -0.56, -0.08, 0.56, -0.82, 0.56], fill: 'purpleDeep', stroke: 'border' },
      { dot: { x: -0.2, y: -0.78, r: 0.16 }, fill: 'border' },
      { dot: { x: -0.2, y: 0.78, r: 0.16 }, fill: 'border' },
    ];
    // Ray (sniper, marksman, Snare): one tall spike with a lit tip, and a scope ring over one eye.
    case 'ray': return [
      { poly: [-0.5, -0.12, -1.12, 0, -0.5, 0.12], fill: 'purpleDeep' },
      { dot: { x: -1.08, y: 0, r: 0.09 }, fill: 'ammo' },
      { dot: { x: 0.6, y: -0.2, r: 0.19 }, fill: 'bgDeep', stroke: 'cream' },
    ];
    // Tabsu (flanker, SMG, Shell): a pink sweatband across the brow.
    case 'tabsu': return [{ poly: [0.02, -0.78, 0.2, -0.74, 0.2, 0.74, 0.02, 0.78], fill: 'pink' }];
    // Tonashiro (bruiser, shotgun, Patch): a round lid on the crown with a green knob.
    case 'tonashiro': return [
      { dot: { x: -0.36, y: 0, r: 0.34 }, fill: 'purpleDeep', stroke: 'purpleBright' },
      { dot: { x: -0.36, y: 0, r: 0.12 }, fill: 'health' },
    ];
    // Yot (assault, carbine, Slab): a dark visor bar across both eyes.
    case 'yot': return [{ poly: [0.48, -0.42, 0.74, -0.38, 0.74, 0.38, 0.48, 0.42], fill: 'bgDeep', stroke: 'armor' }];
    // Bill (flanker, sawn-off, Rush): two red horns swept back.
    case 'bill': return [
      { poly: [-0.3, -0.34, -0.98, -0.6, -0.5, -0.18], fill: 'damage' },
      { poly: [-0.3, 0.34, -0.98, 0.6, -0.5, 0.18], fill: 'damage' },
    ];
    default: return [];
  }
}

export function chogParts(heroId: string): ChogParts {
  return {
    body: spikyBody(SPIKES[heroId] ?? SPIKES.benja),
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
