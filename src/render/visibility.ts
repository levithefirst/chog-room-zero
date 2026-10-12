// Pure rules for how (and whether) a hostile is drawn this frame. No Pixi here, so it is unit-testable.
import type { ViewShape } from '../sim/vision';
import { canSee } from '../sim/vision';
import { sightClear, type Level } from '../sim/level';
import { TUNING } from '../config/tuning';

export type EnemyDraw = 'body' | 'flash' | 'ping' | null;

export interface Viewer { x: number; y: number; facing: number }
export interface Target { id: number; x: number; y: number; alive: boolean }

/**
 * body  = in the player's light (or the killer during the death recap): drawn normally.
 * flash = its muzzle flash was seen (wall line of sight, any range) outside the cone: drawn at its real
 *         position for a moment. Walls still hide it (no wallhack). Bots get the same signal (bots.ts).
 * ping  = revealed by a sonar ping: outline only.
 */
export function enemyDrawMode(
  l: Level, viewer: Viewer, view: ViewShape, a: Target,
  o: { recapKiller: boolean; threatLeft: number; pinged: boolean },
): EnemyDraw {
  if (canSee(l, viewer.x, viewer.y, viewer.facing, view, a.x, a.y) || o.recapKiller) return 'body';
  if (a.alive && o.threatLeft > 0 && sightClear(l, viewer.x, viewer.y, a.x, a.y)) return 'flash';
  if (a.alive && o.pinged) return 'ping';
  return null;
}

/** Seconds a shooter stays drawn after its muzzle flash is seen (single source: TUNING.perception.flashSeconds). */
export const THREAT_HIT_SECONDS = TUNING.perception.flashSeconds;

/**
 * Keep a presentation marker (heard-sound ring, killer marker) inside playable space.
 * Clamp to the level interior; if the point still lands in a non-walkable tile, use the fallback (the true source).
 */
export function clampMarker(l: Level, x: number, y: number, fx: number, fy: number, walk: (tile: number) => boolean): { x: number; y: number } {
  const cx = Math.min(l.w - 0.5, Math.max(0.5, x));
  const cy = Math.min(l.h - 0.5, Math.max(0.5, y));
  if (walk(l.tiles[Math.floor(cy) * l.w + Math.floor(cx)])) return { x: cx, y: cy };
  return { x: Math.min(l.w - 0.5, Math.max(0.5, fx)), y: Math.min(l.h - 0.5, Math.max(0.5, fy)) };
}
