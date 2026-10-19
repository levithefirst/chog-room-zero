// Room Zero locations (owner 2026-10-18 IDENTITY + MAPS pass: "Keep the current map. Add at minimum Office and
// Supermarket", open to everyone, picked before the match). A location is data: its tiles, pickup zones, the solo hostile
// squad, the danger zone's possible last centres, the online spawns and the floor materials. Adding one is one entry
// here: matchmaking keys queues by mode and map id, nothing else changes. Every layout is mirrored about its middle
// (x -> w - 1 - x) so neither online side has a better half, and checked in tests/id-maps.test.ts (every floor tile
// reachable, spawns, pickups, centres open). Office and Supermarket were drawn from rectangles (west half, mirrored):
// tools/maps/build.py.
import { BOT_SPAWNS, PICKUP_ZONES, ROOM_ZERO, TACTICAL_POINTS, VERSUS_SPAWNS, ZONES, ZONE_CENTRES, type BotSpawn, type Material } from './map';

export type MapId = 'room-zero' | 'office' | 'supermarket';
export const MAP_IDS: readonly MapId[] = ['room-zero', 'office', 'supermarket'];
export const isMapId = (v: unknown): v is MapId => typeof v === 'string' && (MAP_IDS as readonly string[]).includes(v);

type Kind = 'health' | 'armor' | 'ammo' | 'grenade';
type Zone = { kind: Kind; x0: number; y0: number; x1: number; y1: number; name: string; side: 'west' | 'east' | 'mid' };
type Spot = { x: number; y: number };

export interface MapDef {
  id: MapId;
  name: string;
  /** One line for the map picker: what kind of fight it is. */
  blurb: string;
  rows: readonly string[];
  pickupZones: readonly Zone[];
  botSpawns: readonly BotSpawn[];
  /** Hand-placed tactical points for the hostile squad, or null to derive them from the floor. */
  tacticalPoints: readonly Spot[] | null;
  zoneCentres: readonly Spot[];
  versusSpawns: Record<'alpha' | 'bravo', readonly Spot[]>;
  materials: readonly { x0: number; y0: number; x1: number; y1: number; mat: Material }[];
}

const OFFICE = [
  '################################################################',
  '#......#......#......#......#......#......#......#......#......#',
  '#......#......#..c...#......#.c..c.#......#...c..#......#......#',
  '#......#..c...#......#......#......#......#......#...c..#......#',
  '#.c....#......#......#..c...#......#...c..#......#......#....c.#',
  '#......#....c.#....c.#......#......#......#.c....#.c....#......#',
  '#......#......#......#......#......#......#......#......#......#',
  '#......####d######d######d#####dd#####d######d######d####......#',
  '#......d................................................d......#',
  '#......d................................................d......#',
  '#..cc..#...............#................#...............#..cc..#',
  '#......#..c...c...c....#.#............#.#....c...c...c..#......#',
  '#......#.bbb.bbb.bbb...#................#...bbb.bbb.bbb.#......#',
  '#......#.............c.d....ccc..ccc....d.c.............#......#',
  '#......d...............d....ccc..ccc....d...............d......#',
  '#......#.bbb.bbb.bbb...#................#...bbb.bbb.bbb.#......#',
  '#......#..c...c...c....#.#............#.#....c...c...c..#......#',
  '#....b.#...............#................#...............#.b....#',
  '#......#####d######d######dd########dd######d######d#####......#',
  '#......d..c....#...............##...............#....c..d......#',
  '#..P...d............c......#........#......c............d......#',
  '#......#####d######d######dd########dd######d######d#####......#',
  '#....b.#...............#................#...............#.b....#',
  '#......#..c...c...c....#.#..#......#..#.#....c...c...c..#......#',
  '#......#.bbb.bbb.bbb...#.#..#......#..#.#...bbb.bbb.bbb.#......#',
  '#......d...............d.......##.......d...............d......#',
  '#......#.............c.d.......##.......d.c.............#......#',
  '#......#.bbb.bbb.bbb...#.#..#......#..#.#...bbb.bbb.bbb.#......#',
  '#......#..c...c...c....#.#..#......#..#.#....c...c...c..#......#',
  '#..cc..#...............#................#...............#..cc..#',
  '#......#####d######d######d##########d######d######d#####......#',
  '#......d........c..............................c........d......#',
  '#......d.....................c....c.....................d......#',
  '#......####d######d######d#####dd#####d######d######d####......#',
  '#......#...........#........................#...........#......#',
  '#.c....#..cc.......#..c.....c......c.....c..#.......cc..#....c.#',
  '#......#...........#..........b..b..........#...........#......#',
  '#......#......cc...#.....c............c.....#...cc......#......#',
  '#......#...........#........................#...........#......#',
  '################################################################',
];
const SUPERMARKET = [
  '################################################################',
  '#......##################..............##################......#',
  '#......#................#..............#................#......#',
  '#....c.#..bbb..bbb..bbb.#.c..c....c..c.#.bbb..bbb..bbb..#.c....#',
  '#......#................d..............d................#......#',
  '#......d................#..c........c..#................d......#',
  '#......#................#..............#................#......#',
  '#......#................####d######d####................#......#',
  '#..c...#................................................#...c..#',
  '#......#......#..#..#..#................#..#..#..#......#......#',
  '#......#.b.b..#c.#..#..#................#..#..#.c#..b.b.#......#',
  '#......#.b.b..#..#..#..#...cc......cc...#..#..#..#..b.b.#......#',
  '#......d.b.b..#..#..#..#................#..#..#..#..b.b.d......#',
  '#......d................................................d......#',
  '#......#......#..#..#..#......c..c......#..#..#..#......#......#',
  '#......#.b.b..#..#..#..#................#..#..#..#..b.b.#......#',
  '#......#.b.b..#..#c.#..#..c..........c..#..#.c#..#..b.b.#......#',
  '#......#.b.b..#..#..#..#................#..#..#..#..b.b.#......#',
  '#......#......#..#..#..#................#..#..#..#......#......#',
  '#......d....................b..##..b....................d......#',
  '#..P...d....................b..##..b....................d......#',
  '#......#......#..#..#..#................#..#..#..#......#......#',
  '#......#......#..#..#c.#................#.c#..#..#......#......#',
  '#......#.b.b..#..#..#..#...c........c...#..#..#..#..b.b.#......#',
  '#......#.b.b..#..#..#..#................#..#..#..#..b.b.#......#',
  '#......#.b.b..#..#..#..#......c..c......#..#..#..#..b.b.#......#',
  '#......d................................................d......#',
  '#......d......#..#..#..#................#..#..#..#......d......#',
  '#......#.b.b..#..#.c#..#..c.c......c.c..#..#c.#..#..b.b.#......#',
  '#......#.b.b..#c.#..#..#................#..#..#.c#..b.b.#......#',
  '#......#.b.b..#..#..#..#................#..#..#..#..b.b.#......#',
  '#..c...#......#..#..#..#................#..#..#..#......#...c..#',
  '#......#................###d########d###................#......#',
  '#......###d#####d#####d##..............##d#####d#####d###......#',
  '#......d................#.cc........cc.#................d......#',
  '#......#..bbbb..bbbb....#..............#....bbbb..bbbb..#......#',
  '#....c.#.............c..d....cc..cc....d..c.............#.c....#',
  '#......#....c......c....#.c..........c.#....c......c....#......#',
  '#......#................#..............#................#......#',
  '################################################################',
];

/** West-half pickup zones and their mirrored east twins (paired in list order, as src/sim/pickups.ts expects), then the contested middle ones. */
function zones(w: number, pairs: [Kind, number, number, number, number, string][], mid: [Kind, number, number, number, number, string][]): Zone[] {
  const out: Zone[] = [];
  for (const [kind, x0, y0, x1, y1, name] of pairs) {
    out.push({ kind, x0, y0, x1, y1, name: `${name} west`, side: 'west' });
    out.push({ kind, x0: w - 1 - x1, y0, x1: w - 1 - x0, y1, name: `${name} east`, side: 'east' });
  }
  for (const [kind, x0, y0, x1, y1, name] of mid) out.push({ kind, x0, y0, x1, y1, name, side: 'mid' });
  return out;
}
/** Tile spots on the west half, and both halves (tile centres). */
const both = (w: number, ps: [number, number][]): Spot[] => ps.flatMap(([x, y]) => [{ x: x + 0.5, y: y + 0.5 }, { x: w - 1 - x + 0.5, y: y + 0.5 }]);
const versus = (w: number, ps: [number, number][]) => ({ alpha: ps.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })), bravo: ps.map(([x, y]) => ({ x: w - 1 - x + 0.5, y: y + 0.5 })) });
const mats = (w: number, west: [number, number, number, number, Material][], mid: [number, number, number, number, Material][] = []) => [
  ...west.flatMap(([x0, y0, x1, y1, mat]) => [{ x0, y0, x1, y1, mat }, { x0: w - 1 - x1, y0, x1: w - 1 - x0, y1, mat }]),
  ...mid.map(([x0, y0, x1, y1, mat]) => ({ x0, y0, x1, y1, mat })),
];
const SPAWN_PTS: [number, number][] = [[3, 20], [2, 15], [2, 25], [5, 14], [5, 26]];

export const MAPS: Record<MapId, MapDef> = {
  'room-zero': {
    id: 'room-zero', name: 'Room Zero', blurb: 'Service basement: offices, side rooms, an exposed atrium and a long loading dock.',
    rows: ROOM_ZERO, pickupZones: PICKUP_ZONES, botSpawns: BOT_SPAWNS, tacticalPoints: TACTICAL_POINTS, zoneCentres: ZONE_CENTRES,
    versusSpawns: VERSUS_SPAWNS, materials: ZONES,
  },
  // Office: a lobby at each end, executive offices along the north wall, cubicle farms (low partitions you can shoot
  // over, desks), a boardroom and a server room (racks block sight) in the middle, three east-west corridors broken by
  // pillars, and the break room and storage along the south. Close quarters with short lanes; the corridors are the
  // fast and exposed way across.
  office: {
    id: 'office', name: 'Office', blurb: 'Open-plan floor: cubicle farms, a boardroom, a server room and three corridors.',
    rows: OFFICE,
    pickupZones: zones(64, [
      ['health', 8, 1, 20, 6, 'executive offices'], ['health', 8, 34, 18, 38, 'break room'], ['health', 8, 10, 22, 17, 'north farm'], ['health', 8, 22, 22, 29, 'south farm'],
      ['armor', 8, 22, 22, 29, 'south farm'], ['armor', 20, 34, 30, 38, 'storage'], ['armor', 8, 8, 22, 9, 'north corridor'],
      ['ammo', 8, 8, 30, 9, 'north corridor'], ['ammo', 8, 31, 30, 32, 'south corridor'], ['ammo', 21, 1, 30, 6, 'corner offices'], ['ammo', 8, 19, 22, 20, 'main corridor'],
      ['grenade', 24, 22, 31, 29, 'server room'], ['grenade', 24, 10, 31, 17, 'boardroom'], ['grenade', 8, 31, 20, 32, 'south corridor'],
    ], [
      ['ammo', 26, 11, 37, 16, 'boardroom table'], ['health', 26, 23, 37, 28, 'server room middle'], ['armor', 24, 19, 39, 20, 'main corridor middle'], ['grenade', 25, 34, 38, 38, 'kitchen'],
    ]),
    botSpawns: [
      { name: 'Corner', hero: 'ray', patrol: [[52, 3], [59, 3], [45, 8], [38, 4]], flanker: false },
      { name: 'Board', hero: 'tonashiro', patrol: [[36, 12], [44, 14], [30, 12], [36, 16]], flanker: false },
      { name: 'Rack', hero: 'tabsu', patrol: [[34, 24], [42, 25], [30, 25], [38, 31]], flanker: true },
      { name: 'Clerk', hero: 'benja', patrol: [[45, 20], [55, 19], [37, 20], [50, 31]], flanker: false },
      { name: 'Copier', hero: 'tabsu', patrol: [[50, 36], [40, 36], [55, 31], [30, 35]], flanker: true },
    ],
    tacticalPoints: null,
    zoneCentres: [{ x: 32, y: 11.5 }, { x: 32, y: 5 }, { x: 32, y: 9.5 }, ...both(64, [[12, 10], [20, 10], [28, 10]])],
    versusSpawns: versus(64, SPAWN_PTS),
    materials: mats(64, [[1, 1, 6, 38, 'tile'], [8, 1, 31, 6, 'tile'], [8, 10, 22, 17, 'tile'], [8, 22, 22, 29, 'tile'], [8, 34, 18, 38, 'tile']],
      [[24, 22, 39, 29, 'metal'], [20, 34, 43, 38, 'dock']]),
  },
  // Supermarket: an entrance hall at each end, checkout lanes (counters you can shoot over), five shelf aisles per half
  // (shelves block sight; a cross aisle and two gaps let you switch lanes), a promo floor of display stands in the
  // middle, the freezer aisle and stockroom along the north, deli counters and back storage along the south. Long
  // narrow lanes down the aisles against short, cluttered fights on the promo floor.
  supermarket: {
    id: 'supermarket', name: 'Supermarket', blurb: 'Shelf aisles, checkout lanes, a cluttered promo floor and the stockroom.',
    rows: SUPERMARKET,
    pickupZones: zones(64, [
      ['health', 8, 2, 23, 6, 'freezer aisle'], ['health', 8, 34, 23, 38, 'deli'], ['health', 8, 8, 13, 18, 'checkouts north'], ['health', 14, 21, 23, 31, 'aisles south'],
      ['armor', 14, 9, 23, 18, 'aisles north'], ['armor', 8, 21, 13, 31, 'checkouts south'],
      ['ammo', 14, 21, 23, 31, 'aisles south'], ['ammo', 8, 19, 24, 20, 'cross aisle'], ['ammo', 8, 13, 24, 13, 'north gap'], ['ammo', 8, 26, 24, 26, 'south gap'],
      ['grenade', 8, 2, 23, 6, 'freezer aisle'], ['grenade', 8, 34, 23, 38, 'deli'], ['grenade', 25, 9, 31, 18, 'promo north'],
    ], [
      ['armor', 25, 1, 38, 6, 'stockroom'], ['armor', 25, 33, 38, 38, 'back storage'], ['health', 26, 13, 37, 26, 'promo floor'], ['grenade', 25, 21, 38, 31, 'promo south'],
    ]),
    botSpawns: [
      { name: 'Stock', hero: 'ray', patrol: [[32, 3], [37, 5], [29, 5], [45, 4]], flanker: false },
      { name: 'Promo', hero: 'tonashiro', patrol: [[33, 15], [38, 22], [29, 13], [36, 26]], flanker: false },
      { name: 'Aisle', hero: 'tabsu', patrol: [[47, 10], [51, 26], [45, 20], [48, 30]], flanker: true },
      { name: 'Till', hero: 'benja', patrol: [[54, 13], [54, 26], [52, 20], [58, 8]], flanker: false },
      { name: 'Deli', hero: 'tabsu', patrol: [[50, 36], [43, 36], [55, 31], [32, 37]], flanker: true },
    ],
    tacticalPoints: null,
    zoneCentres: [{ x: 32, y: 3.5 }, { x: 32, y: 11.5 }, { x: 32, y: 16.5 }, { x: 32, y: 23.5 }, { x: 32, y: 28 }, ...both(64, [[10, 20], [26, 13], [25, 19], [29, 16], [26, 25]])],
    versusSpawns: versus(64, SPAWN_PTS),
    materials: mats(64, [[1, 1, 6, 38, 'concrete'], [8, 1, 23, 6, 'metal'], [8, 7, 24, 32, 'tile'], [8, 33, 23, 38, 'tile']],
      [[25, 1, 38, 6, 'metal'], [25, 7, 38, 32, 'tile'], [25, 33, 38, 38, 'dock']]),
  },
};
