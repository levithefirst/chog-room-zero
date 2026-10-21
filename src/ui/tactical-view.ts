// The tactical map overlay (index.html #tmap): opens from the HUD MAP button or M, closes from RETURN, Esc or M.
// Pure drawing and the information rules are in src/ui/tactical.ts; this file is the DOM: sizing, the per-frame
// paint, and zoom/pan by wheel, drag and pinch. Opening never touches the world, the renderer or the connection: it
// shows a layer and paints a canvas, closing hides it.
import { MAPS } from '../config/maps';
import type { Actor, World } from '../sim/world';
import type { Intel } from '../sim/intel';
import { stage, toStage } from './stage';
import { clampView, drawTactical, fitView, mapHostiles, mapMarkers, panBy, visorDots, zoomAt, type MapView, type Marker } from './tactical';

export interface TacticalDeps {
  world: () => World;
  intel: () => Intel;
  /** The Visor list the server sent this client online, or null solo. */
  netTracks: () => readonly { id: number; x: number; y: number }[] | null;
  /** Online: the server's map-only list of every living hostile you are not shown (snapshot `mh`), or null solo. */
  netHostiles: () => readonly { id: number; x: number; y: number }[] | null;
  /** What the header says under the location name (mode, side). */
  subtitle: () => string;
  onOpen: () => void;
  onClose: () => void;
}

export interface TacticalMap {
  readonly open: boolean;
  show(): void;
  close(): void;
  toggle(): void;
  draw(p: Actor): void;
  /** Tests and tools: the markers last drawn and the view. */
  last(): { markers: Marker[]; view: MapView | null };
}

export function createTacticalMap(d: TacticalDeps): TacticalMap {
  const el = document.getElementById('tmap') as HTMLElement;
  const cv = document.getElementById('tmapc') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  let open = false, view: MapView | null = null, size = { w: 0, h: 0, dpr: 1 }, markers: Marker[] = [];
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; k: number } | null = null;

  const box = () => {
    // The map area: below the header, inside the safe-area padding (CSS vars --sl/--st/--sr/--sb).
    // Layout sizes (offset*), not screen rects: on a phone held upright the stage is turned and a rect's height on
    // screen is the element's width.
    // H38: the chrome may carry a CSS zoom (UI scale on large screens); offset* are in its own unzoomed px, so scale
    // them back to stage px (zoom 1 everywhere else, so nothing changes there).
    const zf = (e: HTMLElement) => parseFloat(e.style.zoom) || 1;
    const head = el.querySelector('.tm-head') as HTMLElement;
    const legend = el.querySelector('.tm-legend') as HTMLElement;
    const ctl = el.querySelector('.tm-ctl') as HTMLElement;
    const top = (head.offsetTop + head.offsetHeight) * zf(head) + 6;
    const left = legend.offsetLeft * zf(legend);
    const right = size.w - (ctl.offsetLeft + ctl.offsetWidth) * zf(ctl);
    // Short screens: stop above the legend so it never covers the map (taller screens have room beside it).
    const bottom = document.body.classList.contains('compact') ? legend.offsetTop * zf(legend) - 4 : size.h - 6;
    return { x: left, y: top, w: size.w - left - right, h: bottom - top };
  };
  const refit = () => {
    const L = stage();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (L.w !== size.w || L.h !== size.h || dpr !== size.dpr) {
      size = { w: L.w, h: L.h, dpr };
      cv.width = Math.round(L.w * dpr); cv.height = Math.round(L.h * dpr);
      cv.style.width = `${L.w}px`; cv.style.height = `${L.h}px`;
      view = null;
    }
    if (!view) { const l = d.world().level, b = box(); view = fitView(l.w, l.h, b.x, b.y, Math.max(50, b.w), Math.max(50, b.h)); }
  };
  const clamp = (v: MapView) => { const l = d.world().level; return clampView(v, l.w, l.h, size.w, size.h); };
  const at = (e: PointerEvent | WheelEvent) => toStage(stage(), e.clientX, e.clientY);

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!view) return;
    const p = at(e);
    view = clamp(zoomAt(view, Math.exp(-e.deltaY * 0.0015), p.x, p.y));
  }, { passive: false });
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    cv.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, at(e));
    if (pointers.size === 2 && view) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.k }; }
  });
  cv.addEventListener('pointermove', (e) => {
    const was = pointers.get(e.pointerId);
    if (!was || !view) return;
    const now = at(e);
    pointers.set(e.pointerId, now);
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const f = (pinch.k * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)) / view.k;
      view = clamp(zoomAt(panBy(view, (now.x - was.x) / 2, (now.y - was.y) / 2), f, mid.x, mid.y));
    } else if (pointers.size === 1) {
      view = clamp(panBy(view, now.x - was.x, now.y - was.y));
    }
  });
  const lift = (e: PointerEvent) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
  cv.addEventListener('pointerup', lift);
  cv.addEventListener('pointercancel', lift);
  // Buttons act on pointerdown (the HUD convention), never letting the press reach the game.
  const btn = (sel: string, fn: () => void) => {
    const b = el.querySelector(sel) as HTMLElement;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
    b.addEventListener('click', (e) => { if (e.detail === 0) fn(); }); // keyboard (Enter/Space on a focused button)
  };
  const zoomBy = (f: number) => { if (view) view = clamp(zoomAt(view, f, size.w / 2, (box().y + size.h) / 2)); };
  btn('#tm-close', () => api.close());
  btn('#tm-in', () => zoomBy(1.5));
  btn('#tm-out', () => zoomBy(1 / 1.5));
  btn('#tm-fit', () => { view = null; refit(); });
  window.addEventListener('resize', () => { if (open) { size = { w: 0, h: 0, dpr: 0 }; refit(); } });

  const api: TacticalMap = {
    get open() { return open; },
    show() {
      if (open) return;
      open = true;
      d.onOpen();
      const w = d.world();
      (el.querySelector('#tm-name') as HTMLElement).textContent = w.mapId ? MAPS[w.mapId].name : 'Training room';
      (el.querySelector('#tm-sub') as HTMLElement).textContent = d.subtitle();
      el.hidden = false;
      document.getElementById('mapbtn')?.setAttribute('aria-expanded', 'true');
      view = null;
      refit();
    },
    close() {
      if (!open) return;
      open = false;
      el.hidden = true;
      markers = []; // nothing of the map (hostile bodies included) outlives closing it
      pointers.clear(); pinch = null;
      document.getElementById('mapbtn')?.setAttribute('aria-expanded', 'false');
      d.onClose();
    },
    toggle() { if (open) api.close(); else api.show(); },
    draw(p) {
      if (!open) return;
      refit();
      const w = d.world();
      const dots = visorDots(w, p, d.netTracks());
      markers = mapMarkers(w, p, d.intel(), dots, mapHostiles(w, p, d.netHostiles()));
      drawTactical(g, { w, def: w.mapId ? MAPS[w.mapId] : null, markers, view: view!, vw: size.w, vh: size.h, dpr: size.dpr, visorR: p.ability.kind === 'visor' ? p.ability.radius : undefined });
    },
    last: () => ({ markers, view }),
  };
  return api;
}
