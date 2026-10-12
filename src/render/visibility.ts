// Pure rules for how (and whether) a hostile is drawn this frame. No Pixi here, so it is unit-testable.
import type { ViewShape } from '../sim/vision';
import { canSee } from '../sim/vision';
import { sightClear, type Level } from '../sim/level';

export type EnemyDraw = 'body' | 'flash' | 'ping' | null;

export interface Viewer { x: number; y: number; facing: number }
export interface Target { id: number; x: number; y: number; alive: boolean }

/**
 * body  = in the player's light (or the killer during the death recap): drawn normally.
 * flash = shot at the player (or fired nearby) with a clear line, but outside the cone: drawn at its real
 *         position for a moment so the player can see who is shooting. Walls still hide it (no wallhack).
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

/** Seconds a shooter stays drawn after hitting the player / firing with a clear line within this range. */
export const THREAT_HIT_SECONDS = 0.9;
export const THREAT_SHOT_SECONDS = 0.5;
export const THREAT_SHOT_RANGE = 8;

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
