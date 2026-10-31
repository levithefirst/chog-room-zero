// THE cover rules: the single in-code source. docs/design/cover.md mirrors this table; tests/p1f-combat.test.ts
// checks that bulletBlockT (level.ts) obeys it. Sight (vision, muzzle flash) ignores cover entirely: crates and
// slabs are waist-high, you see over them; only walls block sight.
import { TUNING } from '../config/tuning';

export type CoverKind = 'wall' | 'crate' | 'slab';
export interface CoverRule {
  kind: CoverKind;
  blocksSight: boolean;
  blocksMovement: boolean;
  /** Stops a normal bullet when the shooter is farther than `lean` u from it. */
  stopsBullets: boolean;
  /** Shooter within this many u of the box fires over it (leaning). 0 = never. */
  lean: number;
  /** Marksman-class (piercesCover) bullets pass through. */
  piercedByMarksman: boolean;
}
export const COVER_RULES: Record<CoverKind, CoverRule> = {
  wall: { kind: 'wall', blocksSight: true, blocksMovement: true, stopsBullets: true, lean: 0, piercedByMarksman: false },
  // RC-8 (owner, 2026-10-13): solid boxes stop sniper shots. Until P1F-RC-7 the marksman passed through crates and
  // slabs; that rule is reversed here, so no bullet goes through any box. The only way over cover is the lean rule.
  crate: { kind: 'crate', blocksSight: false, blocksMovement: true, stopsBullets: true, lean: TUNING.combat.coverLean, piercedByMarksman: false },
  slab: { kind: 'slab', blocksSight: false, blocksMovement: true, stopsBullets: true, lean: TUNING.combat.coverLean, piercedByMarksman: false },
};
/** Does a bullet stop on this cover? `shooterDist` = distance from the bullet's origin to the box. */
export function coverStops(kind: CoverKind, pierce: boolean, shooterDist: number): boolean {
  const r = COVER_RULES[kind];
  if (!r.stopsBullets) return false;
  if (pierce && r.piercedByMarksman) return false;
  return !(r.lean > 0 && shooterDist <= r.lean);
}

/** The cover box an impact point is on (within `tol` u of it), for the client's brief "blocked" outline flash. */
export function coverBoxAt<B extends { x0: number; y0: number; x1: number; y1: number }>(boxes: readonly B[], x: number, y: number, tol = 0.06): B | null {
  for (const b of boxes) if (x >= b.x0 - tol && x <= b.x1 + tol && y >= b.y0 - tol && y <= b.y1 + tol) return b;
  return null;
}
