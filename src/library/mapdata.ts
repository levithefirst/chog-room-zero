// Map guide geometry: everything is read from the level the game plays on (MAPS[id].rows through the sim's own
// parseLevel), the location's named areas (its pickup zones, the same names the in-game tactical map prints), spawns,
// lit areas, floor materials and danger-zone centres. Build time only. Numbers are measured on the tile grid.
import { parseLevel, WALL, COVER, BARRIER, DOOR, RAIL, DECK, STAIRS, FLOOR, walkable, type Level } from '../sim/level';
import { MAPS, type MapId, type MapDef } from '../config/maps';
import { TUNING } from '../config/tuning';

export interface Area { label: string; x: number; y: number; kinds: string[] }

/** Named areas: the same rule as the tactical map (src/ui/tactical.ts landmarks): one label per name within 10 m. */
export function areas(def: MapDef): Area[] {
  const seen = new Map<string, Area[]>();
  for (const z of def.pickupZones) {
    const label = z.name.replace(/ (west|east)$/, '').replace(/ middle$/, '');
    const at = { label, x: (z.x0 + z.x1 + 1) / 2, y: (z.y0 + z.y1 + 1) / 2, kinds: [z.kind] as string[] };
    const list = seen.get(label) ?? [];
    const near = list.find((l) => Math.hypot(l.x - at.x, l.y - at.y) < 10);
    if (near) { if (!near.kinds.includes(z.kind)) near.kinds.push(z.kind); } else list.push(at);
    seen.set(label, list);
  }
  return [...seen.values()].flat();
}

export interface MapStats {
  w: number; h: number; floor: number; walls: number; crates: number; barriers: number; doors: number;
  rails: number; decks: number; stairs: number; litShare: number; longestLane: number; meanOpen: number;
  carpet: number; tunnel: number; pickupZones: number; hostiles: number; zoneCentres: number;
}

const lvlCache = new Map<MapId, Level>();
export function level(id: MapId): Level {
  let l = lvlCache.get(id);
  if (!l) { l = parseLevel(MAPS[id].rows); lvlCache.set(id, l); }
  return l;
}

/** Sight is stopped only by walls (crates, barriers and rails never block sight: src/sim/level.ts sightClear). */
const blocksSight = (t: number) => t === WALL;

export function stats(id: MapId): MapStats {
  const def = MAPS[id], l = level(id), T = l.tiles;
  const count = (k: number) => T.reduce((n, t) => n + (t === k ? 1 : 0), 0);
  const floor = T.reduce((n, t) => n + (walkable(t) ? 1 : 0), 0);
  // Longest straight lane: the longest row or column run with no wall, measured between walls (m).
  let longest = 0;
  for (let y = 0; y < l.h; y++) { let run = 0; for (let x = 0; x < l.w; x++) { run = blocksSight(T[y * l.w + x]) ? 0 : run + 1; longest = Math.max(longest, run); } }
  for (let x = 0; x < l.w; x++) { let run = 0; for (let y = 0; y < l.h; y++) { run = blocksSight(T[y * l.w + x]) ? 0 : run + 1; longest = Math.max(longest, run); } }
  // Mean open sight: from each walkable tile, the four straight lines to the first wall, averaged.
  let sum = 0, n = 0;
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
    if (!walkable(T[y * l.w + x])) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let d = 0, cx = x + dx, cy = y + dy;
      while (cx >= 0 && cy >= 0 && cx < l.w && cy < l.h && !blocksSight(T[cy * l.w + cx])) { d++; cx += dx; cy += dy; }
      sum += d; n++;
    }
  }
  const inBox = (x: number, y: number, b: { x0: number; y0: number; x1: number; y1: number }) => x + 0.5 >= b.x0 && x + 0.5 <= b.x1 && y + 0.5 >= b.y0 && y + 0.5 <= b.y1;
  let lit = 0, carpet = 0, tunnel = 0;
  for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
    if (!walkable(T[y * l.w + x])) continue;
    if (def.lights.some((b) => inBox(x, y, b))) lit++;
    let m: string | null = null;
    for (const z of def.materials) if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) m = z.mat;
    if (m === 'carpet') carpet++; if (m === 'tunnel') tunnel++;
  }
  return {
    w: l.w, h: l.h, floor, walls: count(WALL), crates: count(COVER), barriers: count(BARRIER), doors: count(DOOR),
    rails: count(RAIL), decks: count(DECK), stairs: count(STAIRS), litShare: floor ? lit / floor : 0,
    longestLane: longest, meanOpen: n ? sum / n : 0, carpet, tunnel, pickupZones: def.pickupZones.length,
    hostiles: def.botSpawns.length, zoneCentres: def.zoneCentres.length,
  };
}

/** Runs of one tile kind merged into rectangles (rows, then identical runs downward), for a compact SVG. */
function rects(l: Level, kind: number): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = 0; y < l.h; y++) {
    let x = 0;
    while (x < l.w) {
      if (l.tiles[y * l.w + x] !== kind) { x++; continue; }
      const s = x; while (x < l.w && l.tiles[y * l.w + x] === kind) x++;
      const above = out.find((r) => r.x === s && r.w === x - s && r.y + r.h === y);
      if (above) above.h++; else out.push({ x: s, y, w: x - s, h: 1 });
    }
  }
  return out;
}

const R = (r: { x: number; y: number; w: number; h: number }) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export const LAYERS = [
  { id: 'walls', label: 'Walls' },
  { id: 'cover', label: 'Cover (crates, barriers)' },
  { id: 'doors', label: 'Doorways' },
  { id: 'levels', label: 'Rails, decks, stairs' },
  { id: 'lit', label: 'Lit areas' },
  { id: 'spawns', label: 'Spawns' },
  { id: 'pickups', label: 'Supply areas' },
  { id: 'zone', label: 'Final-circle centres' },
  { id: 'labels', label: 'Area names' },
] as const;

/**
 * The map as SVG in metres (1 tile = 1 m), every layer its own group so the viewer can toggle it. `mini` drops the
 * labels and markers (cards and thumbnails).
 */
export function mapSvg(id: MapId, opts: { mini?: boolean; idPrefix?: string } = {}): string {
  const def = MAPS[id], l = level(id), mini = !!opts.mini;
  const floorRects = [FLOOR, DOOR, DECK, STAIRS].flatMap((k) => rects(l, k));
  const g = (cls: string, body: string) => `<g class="mg-${cls}" data-layer="${cls}">${body}</g>`;
  const parts: string[] = [];
  parts.push(`<rect class="mg-bg" x="0" y="0" width="${l.w}" height="${l.h}"/>`);
  parts.push(`<g class="mg-floor">${floorRects.map(R).join('')}</g>`);
  parts.push(g('lit', def.lights.map((b) => `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}"/>`).join('')));
  parts.push(g('levels', `<g class="mg-deck">${rects(l, DECK).map(R).join('')}</g><g class="mg-stairs">${rects(l, STAIRS).map(R).join('')}</g><g class="mg-rail">${rects(l, RAIL).map(R).join('')}</g>`));
  parts.push(g('cover', `<g class="mg-crate">${rects(l, COVER).map(R).join('')}</g><g class="mg-barrier">${rects(l, BARRIER).map(R).join('')}</g>`));
  parts.push(g('doors', rects(l, DOOR).map(R).join('')));
  parts.push(g('walls', rects(l, WALL).map(R).join('')));
  if (!mini) {
    const pk = def.pickupZones.map((z) => `<rect class="pk-${z.kind}" x="${z.x0}" y="${z.y0}" width="${z.x1 - z.x0 + 1}" height="${z.y1 - z.y0 + 1}"><title>${esc(title(z.name))}: ${z.kind === 'armor' ? 'armour' : z.kind} supply area</title></rect>`).join('');
    parts.push(g('pickups', pk));
    const zc = def.zoneCentres.map((c) => `<circle cx="${c.x}" cy="${c.y}" r="0.7"><title>A possible final-circle centre</title></circle>`).join('');
    parts.push(g('zone', zc));
    const vs = (['alpha', 'bravo'] as const).map((side) => def.versusSpawns[side].map((p) => `<circle class="sp-${side}" cx="${p.x}" cy="${p.y}" r="0.55"><title>Online spawn, ${side === 'alpha' ? 'west' : 'east'} side</title></circle>`).join('')).join('');
    const bots = def.botSpawns.map((b) => { const [x, y] = b.patrol[0]; return `<path class="sp-bot" d="M${x + 0.5} ${y - 0.1}l0.6 1.1h-1.2z"><title>Solo hostile start: ${esc(b.name)}</title></path>`; }).join('');
    const solo = `<circle class="sp-solo" cx="${l.playerSpawn.x}" cy="${l.playerSpawn.y}" r="0.6"><title>Your solo start</title></circle>`;
    parts.push(g('spawns', vs + bots + (MAPS[id].rows.some((r) => r.includes('P')) ? solo : '')));
    const lab = areas(def).map((a) => `<text x="${a.x}" y="${a.y}">${esc(a.label.toUpperCase())}</text>`).join('');
    parts.push(g('labels', lab));
  }
  const p = opts.idPrefix ?? id;
  return `<svg class="mg-svg${mini ? ' mini' : ''}" viewBox="0 0 ${l.w} ${l.h}" width="${l.w * 10}" height="${l.h * 10}" role="img" aria-labelledby="${p}-t" preserveAspectRatio="xMidYMid meet"><title id="${p}-t">${esc(def.name)} map guide: ${l.w} by ${l.h} metres, drawn from the game's level</title>${parts.join('')}</svg>`;
}

export const surfaceShare = TUNING.sound.surface;
