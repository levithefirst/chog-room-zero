// Full-screen tactical map (owner 2026-10-20 "FULL-SCREEN TACTICAL MAP"). Not a second map: every line is drawn from
// the Level the sim plays on (world.level, parsed from MAPS[id].rows), its floor materials and lit areas, and the area
// names the location already carries (its pickup zones). Change a map's rows and this map changes with it.
//
// Information rule (LAW 1, V2 information integrity): the map knows exactly what the HUD knows, never more.
// - You and your own side: always (the server sends your team's bodies; solo they are your AI squad).
// - Hostiles: only the player's contact intel (src/sim/intel.ts), the same beliefs the game view draws. VISIBLE is the
//   live body; anything weaker (heard, last known, spotted by a teammate) is a fading area, never the body.
// - The Visor holder's tracker dots (visorDots below, the HUD tracker uses the same function).
// - Shared state everyone has: the danger zone and which supply points are stocked.
// It never reads a hostile's position from world.actors unless intel says it is VISIBLE now. Online the client only
// holds what the server chose to send anyway (server/room.ts snapshot), so even a modified client gains nothing here.
import type { Level } from '../sim/level';
import type { Intel } from '../sim/intel';
import { matchSeconds, visorTracks, type Actor, type World } from '../sim/world';
import type { MapDef } from '../config/maps';
import { ZONES, type Material } from '../config/map';
import { zoneAt } from '../sim/zone';

export type MarkerKind = 'you' | 'mate' | 'enemy' | 'hostile' | 'trace' | 'visor';
export interface Marker {
  kind: MarkerKind;
  x: number;
  y: number;
  /** Facing (rad), for live bodies. */
  facing?: number;
  /** Uncertainty radius in u (traces). */
  r?: number;
  /** 0..1 how sure (traces fade with it). */
  conf?: number;
  /** Downed teammates and you. */
  downed?: boolean;
  name?: string;
  /** Actor id (tests, de-duplication). */
  id: number;
}

/**
 * The Visor holder's dots: solo from the sim, online the server's list (`vt`) plus the hostiles you are shown. One
 * function for the HUD tracker and the tactical map, so the two can never disagree.
 */
export function visorDots(w: World, p: Actor, netTracks: readonly { id: number; x: number; y: number }[] | null): { id: number; x: number; y: number }[] {
  if (p.ability.kind !== 'visor' || !p.alive) return [];
  const r = p.ability.radius ?? 16;
  if (netTracks) return [...netTracks, ...w.actors.filter((a) => a.team !== p.team && a.alive && a.x > -50 && Math.hypot(a.x - p.x, a.y - p.y) <= r)];
  return visorTracks(w, p);
}

/** Everything the player is entitled to see on the map, in draw order (traces under bodies, you on top). */
export function mapMarkers(w: World, p: Actor, intel: Intel, dots: readonly { id: number; x: number; y: number }[]): Marker[] {
  const out: Marker[] = [];
  const live = new Set<number>();
  for (const c of intel.contacts.values()) {
    const a = w.actors[c.id];
    if (!a || a.team === p.team) continue;
    if (c.state === 'visible' && a.alive && a.x > -50) {
      live.add(a.id);
      continue;
    }
    if (c.state === 'lost' || c.conf <= 0.05) continue;
    out.push({ kind: 'trace', x: c.x, y: c.y, r: Math.max(c.r, 0.6), conf: c.conf, id: c.id });
  }
  for (const d of dots) if (!live.has(d.id)) out.push({ kind: 'visor', x: d.x, y: d.y, id: d.id });
  for (const id of live) {
    const a = w.actors[id];
    out.push({ kind: a.team === 'bot' ? 'hostile' : 'enemy', x: a.x, y: a.y, facing: a.facing, name: a.name, id });
  }
  for (const a of w.actors) {
    if (a === p || a.team !== p.team || !a.alive || a.x < -50) continue;
    out.push({ kind: 'mate', x: a.x, y: a.y, facing: a.facing, downed: a.downed, name: a.name, id: a.id });
  }
  if (p.alive) out.push({ kind: 'you', x: p.x, y: p.y, facing: p.facing, downed: p.downed, name: p.name, id: p.id });
  return out;
}

/** A named area of the location, from its pickup zones (west/east twins share one name). */
export interface Landmark { label: string; x: number; y: number }
export function landmarks(def: MapDef): Landmark[] {
  const seen = new Map<string, Landmark[]>();
  for (const z of def.pickupZones) {
    const label = z.name.replace(/ (west|east)$/, '').replace(/ middle$/, '');
    const at = { label, x: (z.x0 + z.x1 + 1) / 2, y: (z.y0 + z.y1 + 1) / 2 };
    const list = seen.get(label) ?? [];
    // One label per area: a second zone of the same name within 10 u is the same room.
    if (!list.some((l) => Math.hypot(l.x - at.x, l.y - at.y) < 10)) list.push(at);
    seen.set(label, list);
  }
  return [...seen.values()].flat();
}

// ---- view: fit, zoom, pan (pure; stage px) ----
export interface MapView { k: number; ox: number; oy: number; fitK: number }
export const MAX_ZOOM = 6;

/** Whole location centred in the box (x, y, bw, bh), aspect kept. */
export function fitView(lw: number, lh: number, x: number, y: number, bw: number, bh: number): MapView {
  const k = Math.min(bw / lw, bh / lh);
  return { k, fitK: k, ox: x + (bw - lw * k) / 2, oy: y + (bh - lh * k) / 2 };
}
/** Zoom by `f` about the stage point (cx, cy), within fit..fit x MAX_ZOOM. The point under the finger stays put. */
export function zoomAt(v: MapView, f: number, cx: number, cy: number): MapView {
  const k = Math.max(v.fitK, Math.min(v.fitK * MAX_ZOOM, v.k * f));
  const s = k / v.k;
  return { ...v, k, ox: cx - (cx - v.ox) * s, oy: cy - (cy - v.oy) * s };
}
export function panBy(v: MapView, dx: number, dy: number): MapView {
  return { ...v, ox: v.ox + dx, oy: v.oy + dy };
}
/** Keep at least `keep` px of the map inside the box (vw x vh), so it can never be lost off screen. */
export function clampView(v: MapView, lw: number, lh: number, vw: number, vh: number, keep = 80): MapView {
  const mw = lw * v.k, mh = lh * v.k;
  return { ...v, ox: Math.min(vw - keep, Math.max(keep - mw, v.ox)), oy: Math.min(vh - keep, Math.max(keep - mh, v.oy)) };
}
export const toMap = (v: MapView, x: number, y: number) => ({ x: v.ox + x * v.k, y: v.oy + y * v.k });

// ---- drawing ----
const FLOOR: Record<Material, string> = {
  concrete: '#191326', tile: '#1d1730', metal: '#1a1b2c', dock: '#201a1c', carpet: '#22142e', tunnel: '#120e1a', ballast: '#1b1714',
};
const C = {
  bg: '#0b0716', wall: '#c9c1e0', wallFill: '#2b2240', cover: '#6b5a8f', barrier: '#8a6f3a', door: '#ff6b9d', rail: '#d9c95a',
  deck: 'rgba(139, 92, 246, 0.30)', deckEdge: 'rgba(181, 140, 255, 0.85)', stairs: '#b9a6e8', light: 'rgba(255, 236, 170, 0.06)',
  label: 'rgba(255, 248, 231, 0.62)', you: '#22c55e', mate: '#3b82f6', enemy: '#ef4444', hostile: '#f59e0b', visor: '#4fd6e8',
  zone: 'rgba(239, 68, 68, 0.9)', next: 'rgba(255, 248, 231, 0.75)', pickup: { health: '#22c55e', armor: '#3b82f6', ammo: '#f59e0b', grenade: '#ff6b9d' } as Record<string, string>,
};

export interface DrawInput {
  w: World;
  /** The location (null: a Training drill room, which has no named areas). */
  def: MapDef | null;
  markers: readonly Marker[];
  view: MapView;
  /** Canvas size in stage px and device pixel ratio. */
  vw: number;
  vh: number;
  dpr: number;
  /** Visor radius around you, if you hold one. */
  visorR?: number;
}

/** Paint the whole map. Static geometry is vector (crisp at any zoom; a few hundred merged boxes). */
export function drawTactical(g: CanvasRenderingContext2D, d: DrawInput): void {
  const { w, view: v, dpr } = d;
  const l = w.level, k = v.k;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = C.bg;
  g.fillRect(0, 0, d.vw, d.vh);
  g.save();
  g.translate(v.ox, v.oy);
  g.scale(k, k);
  // Floor by surface (the location's own materials), then lit areas.
  g.fillStyle = FLOOR.concrete;
  g.fillRect(0, 0, l.w, l.h);
  for (const m of l.materials ?? ZONES) { g.fillStyle = FLOOR[m.mat]; g.fillRect(m.x0, m.y0, m.x1 - m.x0 + 1, m.y1 - m.y0 + 1); }
  g.fillStyle = C.light;
  for (const b of l.lights ?? []) g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  drawTiles(g, l, k);
  g.restore();
  // Area names (screen-sized text, hidden when they would not fit).
  const fs = Math.max(12, Math.min(14, k * 0.9)); // H38: 12 px floor (was 9)
  if (k >= 7) {
    g.font = `600 ${fs}px Barlow Condensed, system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = C.label; g.strokeStyle = 'rgba(11, 7, 22, 0.85)'; g.lineWidth = 3; g.lineJoin = 'round';
    for (const m of d.def ? landmarks(d.def) : []) { const s = toMap(v, m.x, m.y), t = m.label.toUpperCase(); g.strokeText(t, s.x, s.y); g.fillText(t, s.x, s.y); }
  }
  // Supply points (stocked ones), the danger zone (now and next).
  for (const p of w.pickups) {
    if (!p.active) continue;
    const s = toMap(v, p.x, p.y);
    g.fillStyle = C.pickup[p.kind] ?? '#fff';
    g.globalAlpha = 0.7;
    g.fillRect(s.x - 2.5, s.y - 2.5, 5, 5);
    g.globalAlpha = 1;
  }
  if (w.zone) {
    const z = zoneAt(w.zone, matchSeconds(w));
    const ring = (c: { x: number; y: number; r: number }, col: string, dash: number[]) => {
      const s = toMap(v, c.x, c.y);
      g.strokeStyle = col; g.lineWidth = 2; g.setLineDash(dash);
      g.beginPath(); g.arc(s.x, s.y, c.r * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    };
    ring(z.circle, C.zone, []);
    if (z.next) ring(z.next, C.next, [6, 5]);
  }
  for (const m of d.markers) drawMarker(g, m, v, d.visorR);
}

function drawTiles(g: CanvasRenderingContext2D, l: Level, k: number) {
  const W = l.w;
  const t = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= l.h ? 1 : l.tiles[y * W + x]);
  // Decks (raised floor) and stairs (step stripes) first, then walls over them.
  for (let y = 0; y < l.h; y++) for (let x = 0; x < W; x++) {
    const v = t(x, y);
    if (v === 6) {
      g.fillStyle = C.deck; g.fillRect(x, y, 1, 1);
      g.strokeStyle = C.deckEdge; g.lineWidth = 1.6 / k;
      if (t(x - 1, y) !== 6 && t(x - 1, y) !== 7) line(g, x, y, x, y + 1);
      if (t(x + 1, y) !== 6 && t(x + 1, y) !== 7) line(g, x + 1, y, x + 1, y + 1);
      if (t(x, y - 1) !== 6 && t(x, y - 1) !== 7) line(g, x, y, x + 1, y);
      if (t(x, y + 1) !== 6 && t(x, y + 1) !== 7) line(g, x, y + 1, x + 1, y + 1);
    } else if (v === 7) {
      g.strokeStyle = C.stairs; g.lineWidth = 1.2 / k;
      const vert = t(x, y - 1) === 7 || t(x, y + 1) === 7;
      for (let i = 1; i < 4; i++) { if (vert) line(g, x + 0.15, y + i / 4, x + 0.85, y + i / 4); else line(g, x + i / 4, y + 0.15, x + i / 4, y + 0.85); }
    } else if (v === 4) {
      g.fillStyle = C.door; g.globalAlpha = 0.55; g.fillRect(x + 0.2, y + 0.2, 0.6, 0.6); g.globalAlpha = 1;
    }
  }
  g.fillStyle = C.wallFill;
  for (const b of l.wallBoxes) g.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  g.strokeStyle = C.wall; g.lineWidth = 1.5 / k;
  g.beginPath();
  for (const s of l.segments) { g.moveTo(s.ax, s.ay); g.lineTo(s.bx, s.by); }
  g.stroke();
  for (const b of l.coverBoxes) {
    const tile = t(Math.floor(b.x0), Math.floor(b.y0));
    g.fillStyle = tile === 3 ? C.barrier : C.cover;
    g.fillRect(b.x0 + 0.08, b.y0 + 0.08, b.x1 - b.x0 - 0.16, b.y1 - b.y0 - 0.16);
  }
  // Rails (track edges, railings): dashed, sight and bullets pass.
  g.strokeStyle = C.rail; g.lineWidth = 2 / k; g.setLineDash([0.4, 0.25]);
  for (const b of l.railBoxes) { const my = (b.y0 + b.y1) / 2, mx = (b.x0 + b.x1) / 2; if (b.x1 - b.x0 >= b.y1 - b.y0) line(g, b.x0, my, b.x1, my); else line(g, mx, b.y0, mx, b.y1); }
  g.setLineDash([]);
}
const line = (g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) => { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); };

function drawMarker(g: CanvasRenderingContext2D, m: Marker, v: MapView, visorR?: number) {
  const s = toMap(v, m.x, m.y);
  const size = Math.max(5, Math.min(11, v.k * 0.55));
  if (m.kind === 'trace') {
    g.globalAlpha = 0.25 + 0.5 * (m.conf ?? 0.5);
    g.strokeStyle = C.enemy; g.lineWidth = 1.5; g.setLineDash([3, 3]);
    g.beginPath(); g.arc(s.x, s.y, Math.max(size, (m.r ?? 1) * v.k), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    g.font = `700 ${size * 1.4}px system-ui, sans-serif`; g.fillStyle = C.enemy; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', s.x, s.y);
    g.globalAlpha = 1;
    return;
  }
  if (m.kind === 'visor') {
    g.fillStyle = C.visor; g.strokeStyle = '#0b0716'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(s.x, s.y - size); g.lineTo(s.x + size, s.y); g.lineTo(s.x, s.y + size); g.lineTo(s.x - size, s.y); g.closePath(); g.fill(); g.stroke();
    return;
  }
  const col = m.kind === 'you' ? C.you : m.kind === 'mate' ? C.mate : m.kind === 'enemy' ? C.enemy : C.hostile;
  if (m.kind === 'you' && visorR) {
    g.strokeStyle = 'rgba(79, 214, 232, 0.55)'; g.lineWidth = 1.5; g.setLineDash([5, 4]);
    g.beginPath(); g.arc(s.x, s.y, visorR * v.k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  }
  const r = m.kind === 'you' ? size * 1.25 : size;
  // Facing: a wedge out of the body, so you read where it is looking.
  if (m.facing !== undefined) {
    g.fillStyle = col; g.globalAlpha = 0.35;
    g.beginPath(); g.moveTo(s.x, s.y); g.arc(s.x, s.y, r * 3, m.facing - 0.45, m.facing + 0.45); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }
  g.fillStyle = m.downed ? '#2a1f3d' : col; g.strokeStyle = m.kind === 'you' ? '#fff8e7' : '#0b0716'; g.lineWidth = m.kind === 'you' ? 2.5 : 1.5;
  g.beginPath(); g.arc(s.x, s.y, r, 0, Math.PI * 2); g.fill(); g.stroke();
  if (m.downed) { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(s.x, s.y, r - 1, 0, Math.PI * 2); g.stroke(); }
  if (m.facing !== undefined) {
    g.strokeStyle = m.kind === 'you' ? '#0b0716' : '#fff8e7'; g.lineWidth = 2;
    line(g, s.x, s.y, s.x + Math.cos(m.facing) * r * 0.9, s.y + Math.sin(m.facing) * r * 0.9);
  }
  if (m.kind === 'you') {
    g.font = '800 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.strokeStyle = '#0b0716'; g.lineWidth = 3; g.strokeText('YOU', s.x, s.y - r - 3);
    g.fillStyle = C.you; g.fillText('YOU', s.x, s.y - r - 3);
  }
}
