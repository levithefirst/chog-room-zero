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
  crate: { kind: 'crate', blocksSight: false, blocksMovement: true, stopsBullets: true, lean: TUNING.combat.coverLean, piercedByMarksman: true },
  slab: { kind: 'slab', blocksSight: false, blocksMovement: true, stopsBullets: true, lean: TUNING.combat.coverLean, piercedByMarksman: true },
};
/** Does a bullet stop on this cover? `shooterDist` = distance from the bullet's origin to the box. */
export function coverStops(kind: CoverKind, pierce: boolean, shooterDist: number): boolean {
  const r = COVER_RULES[kind];
  if (!r.stopsBullets) return false;
  if (pierce && r.piercedByMarksman) return false;
  return !(r.lean > 0 && shooterDist <= r.lean);
}
