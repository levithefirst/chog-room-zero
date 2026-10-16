// Pure rules for how (and whether) a hostile is drawn this frame. No Pixi here, so it is unit-testable.
import type { ViewShape } from '../sim/vision';
import { canSee } from '../sim/vision';
import { sightClear, type Level } from '../sim/level';
import { TUNING } from '../config/tuning';
import { LAB } from '../config/lab';

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

/**
 * A hostile only a teammate sees (CF-E): before CF its live body was drawn for you; now a SPOTTED mark at where the
 * teammate saw it, refreshed twice a second. Your teammate saw something; you did not.
 */
export function teamSighting(): 'body' | 'spotted' {
  return LAB.dark ? 'spotted' : 'body';
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

/**
 * Where the line from the player (ox, oy) to an off-screen target (tx, ty) leaves the rect [x0,x1]x[y0,y1], with the
 * line's angle, for an edge chevron. Null when the target is inside the rect (it is drawn in place).
 */
export function edgeAnchor(ox: number, oy: number, tx: number, ty: number, x0: number, y0: number, x1: number, y1: number): { x: number; y: number; ang: number } | null {
  if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) return null;
  const dx = tx - ox, dy = ty - oy;
  let t = 1;
  if (dx > 0) t = Math.min(t, (x1 - ox) / dx); else if (dx < 0) t = Math.min(t, (x0 - ox) / dx);
  if (dy > 0) t = Math.min(t, (y1 - oy) / dy); else if (dy < 0) t = Math.min(t, (y0 - oy) / dy);
  t = Math.max(0, t);
  return { x: ox + dx * t, y: oy + dy * t, ang: Math.atan2(dy, dx) };
}
