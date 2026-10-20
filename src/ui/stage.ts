// Landscape stage (owner 2026-10-13: Chog is a landscape game on phones, like Bullet Echo or eFootball).
// Every DOM layer (canvas, HUD, menus) lives in #stage. On a touch device whose browser is portrait, the stage is
// laid out landscape (width = screen height) and turned 90 deg clockwise to fill the screen, so the game is never
// drawn in portrait and nothing waits for the phone to turn: hold it sideways and it plays. When the browser itself
// turns to landscape (auto-rotate, or the fullscreen lock below), the stage is simply unrotated. Desktop windows
// are never rotated (a narrow desktop window keeps the RC-5 portrait camera).
//
// The first tap on a touch device also asks for fullscreen plus a landscape orientation lock: this needs a user
// gesture (touchend/click, not touchstart) and fullscreen first. Android Chrome supports both; iPhone Safari has no
// element fullscreen and no lock, so it keeps the rotated stage. It is tried once per page load; after the player
// leaves fullscreen it is only re-entered from the Full screen button (never forced again).
import { applyDevice, currentDevice } from './device';

export interface StageLayout {
  /** Stage turned 90 deg clockwise inside a portrait browser. */
  rotated: boolean;
  /** Stage size in CSS px (landscape whenever rotated). */
  w: number;
  h: number;
  /** Browser viewport width when laid out (the rotation pivot). */
  screenW: number;
}

/** Pure: how the stage fills a `screenW` x `screenH` viewport. Touch + portrait -> rotated landscape. */
export function stageLayout(screenW: number, screenH: number, touch: boolean): StageLayout {
  const rotated = touch && screenH > screenW;
  return rotated ? { rotated, w: screenH, h: screenW, screenW } : { rotated, w: screenW, h: screenH, screenW };
}

/** Pure: a viewport point (clientX/clientY) -> stage point. Inverse of translate(screenW, 0) rotate(90deg). */
export function toStage(L: StageLayout, x: number, y: number): { x: number; y: number } {
  return L.rotated ? { x: y, y: L.screenW - x } : { x, y };
}

/** Pure: a stage point -> viewport point (for tests and tools). */
export function toScreen(L: StageLayout, x: number, y: number): { x: number; y: number } {
  return L.rotated ? { x: L.screenW - y, y: x } : { x, y };
}

/** Pure: a viewport rect (getBoundingClientRect) -> stage rect. */
export function rectToStage(L: StageLayout, r: { left: number; top: number; width: number; height: number }): { x: number; y: number; w: number; h: number } {
  if (!L.rotated) return { x: r.left, y: r.top, w: r.width, h: r.height };
  return { x: r.top, y: L.screenW - (r.left + r.width), w: r.height, h: r.width };
}

/**
 * UIX: the interface scale for a stage. The menus and HUD are drawn for a 1280x720 stage; a bigger desktop window
 * scales them up (1920x1080 -> 1.5, 2560x1440 -> 2) so text and controls keep their size relative to the game, the way
 * a console game's HUD scales with the output resolution. Phones and tablets keep 1 (their layouts are sized for
 * the glass and the thumbs). The HUD then takes the player's HUD scale setting on top (85-130%).
 */
export function uiScale(w: number, h: number, form: 'phone' | 'tablet' | 'desktop'): number {
  if (form !== 'desktop') return 1;
  const s = Math.min(w / 1280, h / 720);
  return Math.round(Math.max(1, Math.min(2, s)) * 20) / 20;
}
let hudPct = 100;
/** The HUD scale setting (percent). Call layoutStage after changing it. */
export function setHudScale(pct: number): void { hudPct = pct; }
/** The scales in force: menus and HUD (the HUD includes the setting). */
export let scales = { ui: 1, hud: 1 };

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
let current: StageLayout | null = null;

/** The layout in force now (input and HUD measuring map through it). Unrotated viewport until first laid out. */
export function stage(): StageLayout {
  return current ?? stageLayout(window.innerWidth, window.innerHeight, false);
}

/**
 * Lay out #stage for the current viewport. Body classes replace viewport media queries, which would describe the
 * browser rather than the (possibly turned) stage: `rot`, `compact` (stage <= 460 px tall), `narrow` (portrait
 * desktop window under 600 px). `--vw`/`--vh` are 1% of the stage.
 */
export function layoutStage(el: HTMLElement): StageLayout {
  const L = stageLayout(window.innerWidth, window.innerHeight, coarse());
  current = L;
  el.style.cssText = L.rotated
    ? `right:auto;bottom:auto;width:${L.w}px;height:${L.h}px;transform:translate(${L.screenW}px,0) rotate(90deg)`
    : '';
  const b = document.body.classList;
  b.toggle('staged', true); // from here stage.ts, not the pre-script CSS rule, positions the stage
  b.toggle('rot', L.rotated);
  b.toggle('compact', L.h <= 460);
  b.toggle('narrow', L.h > L.w && L.w < 600);
  // H34: a small landscape phone (stage under 720 px wide): the top band has no room for full words.
  b.toggle('slim', L.w < 720 && L.h <= 460);
  const dev = currentDevice();
  applyDevice(dev);
  document.body.style.setProperty('--vw', `${L.w / 100}px`);
  document.body.style.setProperty('--vh', `${L.h / 100}px`);
  // CSS zoom lays each layer out as if the stage were w/z by h/z: its percentages and --vw/--vh follow that size.
  const ui = uiScale(L.w, L.h, coarse() ? (dev.form === 'desktop' ? 'tablet' : dev.form) : dev.form);
  const hud = Math.round(ui * hudPct) / 100;
  scales = { ui, hud };
  for (const [id, z] of [['overlay', ui], ['boot', ui], ['hud', hud]] as const) {
    const layer = typeof document.getElementById === 'function' ? document.getElementById(id) : null;
    if (!layer) continue;
    layer.style.setProperty('zoom', z === 1 ? '' : String(z));
    layer.style.setProperty('--vw', `${L.w / z / 100}px`);
    layer.style.setProperty('--vh', `${L.h / z / 100}px`);
  }
  // H38: the tactical map (H37) keeps its canvas in stage px (it measures and draws there); only its chrome (title,
  // RETURN, legend, zoom buttons) takes the UI scale, and tactical-view reads that zoom back when it fits the map box.
  const tmap = typeof document.getElementById === 'function' ? document.getElementById('tmap') : null;
  if (tmap) for (const c of Array.from(tmap.querySelectorAll<HTMLElement>('.tm-head, .tm-legend, .tm-ctl'))) c.style.setProperty('zoom', ui === 1 ? '' : String(ui));
  document.body.style.setProperty('--ui', String(ui));
  return L;
}

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
type Lockable = ScreenOrientation & { lock?: (o: string) => Promise<void> };

export function fullscreenSupported(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/** What the last landscape request did, for the debug hook and tools. */
export type LaunchResult = 'not-tried' | 'unsupported' | 'fullscreen-denied' | 'locked' | 'lock-unsupported' | 'lock-denied';

/**
 * Fullscreen, then lock landscape. Call only from a user gesture (click / pointerup / touchend). Never throws:
 * returns what happened, so a refusal just leaves the rotated stage in charge.
 */
export async function requestLandscape(): Promise<LaunchResult> {
  const el = document.documentElement as FsEl;
  if (!isFullscreen()) {
    if (!fullscreenSupported()) return 'unsupported';
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else el.webkitRequestFullscreen?.();
    } catch {
      return 'fullscreen-denied';
    }
  }
  const o = screen.orientation as Lockable | undefined;
  if (!o?.lock) return 'lock-unsupported';
  try {
    await o.lock('landscape');
    return 'locked';
  } catch {
    return 'lock-denied';
  }
}
