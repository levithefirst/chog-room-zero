// Room Zero locations. Owner 2026-10-18 (IDENTITY + MAPS): "Keep the current map. Add at minimum Office and
// Supermarket", open to everyone, picked before the match. Owner 2026-10-19 (H34): exactly five locations (Room Zero,
// Office, Supermarket, Metro Station, Construction Site), each "a substantially different tactical experience" in its
// collision and topology, not its furniture: "I just played the office and supermarket, no difference????".
// A location is data: its tiles, pickup zones, the solo hostile squad, the danger zone's possible last centres, the
// online spawns and the floor materials. Adding one is one entry here: matchmaking keys queues by mode and map id.
// Every layout is mirrored about its middle (x -> w - 1 - x) so neither online side has a better half, and checked in
// tests/id-maps.test.ts and tests/h34-maps.test.ts. The four new layouts are drawn by tools/maps/build.py (rectangles,
// west half, mirrored, checked) into src/config/layouts.ts. Design and measurements: docs/design/maps.md.
import { BOT_SPAWNS, PICKUP_ZONES, ROOM_ZERO, TACTICAL_POINTS, VERSUS_SPAWNS, ZONES, ZONE_CENTRES, type BotSpawn, type Material } from './map';
import { CONSTRUCTION, METRO, OFFICE, SUPERMARKET } from './layouts';

export type MapId = 'room-zero' | 'office' | 'supermarket' | 'metro' | 'construction';
export const MAP_IDS: readonly MapId[] = ['room-zero', 'office', 'supermarket', 'metro', 'construction'];
export const isMapId = (v: unknown): v is MapId => typeof v === 'string' && (MAP_IDS as readonly string[]).includes(v);

type Kind = 'health' | 'armor' | 'ammo' | 'grenade';
type Zone = { kind: Kind; x0: number; y0: number; x1: number; y1: number; name: string; side: 'west' | 'east' | 'mid' };
type Spot = { x: number; y: number };

export interface MapDef {
  id: MapId;
  name: string;
  /** One line for the map picker: what kind of fight it is. */
  blurb: string;
  /** The tactical identity in a few words (owner H34 "MAP DESIGN SIGNATURES"), shown on the compact map cards. */
  tag: string;
  rows: readonly string[];
  pickupZones: readonly Zone[];
  botSpawns: readonly BotSpawn[];
  /** Hand-placed tactical points for the hostile squad, or null to derive them from the floor. */
  tacticalPoints: readonly Spot[] | null;
  zoneCentres: readonly Spot[];
  versusSpawns: Record<'alpha' | 'bravo', readonly Spot[]>;
  materials: readonly { x0: number; y0: number; x1: number; y1: number; mat: Material }[];
  /** H34 lit areas as boxes in u (src/sim/vision.ts canSee): bodies in them are seen from TUNING.vision.litRange. */
  lights: readonly { x0: number; y0: number; x1: number; y1: number }[];
}

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
const versus = (w: number, ps: [number, number][]) => ({ alpha: ps.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })), bravo: ps.map(([x, y]) => ({ x: w - 1 - x + 0.5, y: y + 0.5 })) });
const mats = (w: number, west: [number, number, number, number, Material][], mid: [number, number, number, number, Material][] = []) => [
  ...west.flatMap(([x0, y0, x1, y1, mat]) => [{ x0, y0, x1, y1, mat }, { x0: w - 1 - x1, y0, x1: w - 1 - x0, y1, mat }]),
  ...mid.map(([x0, y0, x1, y1, mat]) => ({ x0, y0, x1, y1, mat })),
];
const sp = (ps: [number, number][]) => ps.map(([x, y]) => ({ x, y }));
/** Lit areas: west tile rectangles (inclusive) mirrored to the east, then middle ones; as boxes in u. */
const lights = (w: number, west: [number, number, number, number][], mid: [number, number, number, number][] = []) => [
  ...west.flatMap(([x0, y0, x1, y1]) => [{ x0, y0, x1: x1 + 1, y1: y1 + 1 }, { x0: w - 1 - x1, y0, x1: w - x0, y1: y1 + 1 }]),
  ...mid.map(([x0, y0, x1, y1]) => ({ x0, y0, x1: x1 + 1, y1: y1 + 1 })),
];

export const MAPS: Record<MapId, MapDef> = {
  'room-zero': {
    id: 'room-zero', name: 'Room Zero', tag: 'Balanced baseline',
    blurb: 'Service basement: offices, side rooms, an exposed atrium and a long loading dock.',
    rows: ROOM_ZERO, pickupZones: PICKUP_ZONES, botSpawns: BOT_SPAWNS, tacticalPoints: TACTICAL_POINTS, zoneCentres: ZONE_CENTRES,
    versusSpawns: VERSUS_SPAWNS, materials: ZONES,
    // The dark baseline: every sighting is a lamp-length one.
    lights: [],
  },
  // Office: an office floor around a solid central core. Fire stairs at each end (spawns). North lane: a corridor off a
  // row of private offices (one door each: clear them or be cleared). Middle lane: the carpeted open plan (desk
  // screens, mid range; carpet muffles footsteps) and three small meeting rooms. Centre: the core (lifts, risers,
  // toilets) that every fight wraps around, the glass-walled boardroom on its north face (rails: see and shoot in,
  // walk in by its two doors) and reception on its south face, the exposed middle. South lane: the service corridor
  // behind the server room, the print room and the kitchen: the flank. Short sightlines, many doors.
  office: {
    id: 'office', name: 'Office', tag: 'Rooms & corridors',
    blurb: 'An office floor round a solid core: private offices, open plan, a glass boardroom, a service corridor.',
    rows: OFFICE,
    pickupZones: zones(64, [
      ['health', 8, 1, 30, 7, 'private offices'], ['health', 8, 23, 21, 30, 'meeting rooms'],
      ['armor', 8, 35, 15, 42, 'server room'], ['armor', 8, 12, 21, 21, 'open plan'],
      ['ammo', 8, 9, 23, 10, 'north corridor'], ['ammo', 8, 32, 23, 33, 'service corridor'], ['ammo', 17, 35, 23, 42, 'print room'],
      ['grenade', 23, 11, 25, 30, 'ring'], ['grenade', 8, 12, 21, 21, 'open plan'],
      ['health', 22, 11, 25, 21, 'ring north'], ['ammo', 8, 12, 21, 21, 'open plan'], ['armor', 8, 23, 21, 30, 'meeting rooms'], ['grenade', 8, 1, 30, 7, 'private offices'],
    ], [
      ['health', 25, 9, 38, 14, 'boardroom'], ['ammo', 23, 27, 40, 33, 'reception'], ['armor', 25, 35, 38, 42, 'kitchen'], ['grenade', 27, 19, 36, 22, 'core toilets'],
    ]),
    botSpawns: [
      { name: 'Exec', hero: 'ray', patrol: [[52, 3], [46, 5], [55, 9], [40, 9]], flanker: false },
      { name: 'Board', hero: 'tonashiro', patrol: [[36, 10], [30, 13], [37, 13], [33, 10]], flanker: false },
      { name: 'Desk', hero: 'tabsu', patrol: [[50, 19], [46, 15], [52, 20], [42, 16]], flanker: true },
      { name: 'Front', hero: 'benja', patrol: [[38, 30], [44, 32], [32, 28], [40, 27]], flanker: false },
      { name: 'Server', hero: 'tabsu', patrol: [[52, 37], [44, 40], [55, 33], [36, 36]], flanker: true },
    ],
    tacticalPoints: null,
    // The last circle closes on reception or the kitchen (the middle, fair to both sides) or a side's open plan or
    // reception wing (solo): the fight is pulled through the doors, never into one open hall.
    zoneCentres: [{ x: 32, y: 31.5 }, { x: 32, y: 39.5 }, ...sp([[25.5, 28.5], [38.5, 28.5], [18.5, 16], [45.5, 16], [17.5, 20.5], [46.5, 20.5]])],
    versusSpawns: versus(64, [[3, 21], [2, 19], [2, 24], [5, 20], [5, 23]]),
    materials: mats(64, [
      [1, 1, 6, 42, 'concrete'], [8, 1, 30, 7, 'carpet'], [8, 9, 23, 10, 'tile'], [8, 11, 21, 21, 'carpet'], [8, 22, 21, 31, 'carpet'],
      [22, 11, 25, 33, 'tile'], [8, 32, 23, 33, 'tile'], [8, 35, 15, 42, 'metal'], [16, 35, 23, 42, 'tile'],
    ], [[25, 9, 38, 14, 'carpet'], [26, 15, 37, 33, 'tile'], [24, 35, 39, 42, 'tile']]),
    // Lit: the open plan, the glass boardroom and reception. Dark: the corridors, private offices, meeting rooms and
    // the service lane. Crossing the open plan shows you to the far side; the corridors are for creeping.
    lights: lights(64, [[8, 12, 21, 21]], [[25, 9, 38, 14], [23, 27, 40, 33]]),
  },
  // Supermarket: one hall. Entrances in the two front corners (spawns), the checkout bank (a comb of counters you
  // shoot over) and the action alley across the front, then the gondola aisles running NORTH-SOUTH, across the line
  // between the sides: every step toward the enemy crosses an aisle mouth with a long view down it. The power aisle
  // down the middle joins front and back but not the two halves: they meet only at the front, the back cross aisle
  // and the stockroom. Produce (west) and the deli (east) on the side walls; behind the back cases the stockroom and
  // receiving dock (swing doors): the hidden loop. The longest lanes of any location.
  supermarket: {
    id: 'supermarket', name: 'Supermarket', tag: 'Long aisles',
    blurb: 'Aisles that cut across your path, a checkout comb up front, a stockroom loop out back.',
    rows: SUPERMARKET,
    pickupZones: zones(72, [
      ['health', 1, 9, 10, 33, 'produce'], ['health', 1, 1, 22, 6, 'stockroom'],
      ['armor', 1, 1, 22, 6, 'stockroom'], ['armor', 12, 33, 32, 38, 'checkouts'],
      ['ammo', 15, 12, 32, 18, 'aisles north'], ['ammo', 15, 21, 32, 28, 'aisles south'], ['ammo', 12, 29, 32, 32, 'action alley'], ['ammo', 11, 40, 31, 42, 'bagging'],
      ['grenade', 12, 9, 32, 11, 'back aisle'], ['grenade', 1, 9, 10, 33, 'produce'],
      ['health', 12, 33, 32, 38, 'checkouts'], ['armor', 15, 21, 32, 28, 'aisles south'], ['grenade', 15, 12, 32, 18, 'aisles north'], ['ammo', 1, 9, 10, 33, 'produce'],
    ], [
      ['armor', 24, 1, 47, 6, 'receiving dock'], ['health', 34, 12, 37, 28, 'power aisle'], ['grenade', 33, 29, 38, 32, 'front middle'], ['ammo', 33, 9, 38, 11, 'back middle'],
    ]),
    botSpawns: [
      { name: 'Stock', hero: 'ray', patrol: [[60, 4], [50, 3], [66, 5], [45, 5]], flanker: false },
      { name: 'Power', hero: 'tonashiro', patrol: [[36, 20], [35, 14], [36, 26], [36, 11]], flanker: false },
      { name: 'Aisle', hero: 'tabsu', patrol: [[47, 20], [51, 15], [43, 24], [55, 19]], flanker: true },
      { name: 'Till', hero: 'benja', patrol: [[50, 31], [56, 37], [42, 30], [60, 31]], flanker: false },
      { name: 'Deli', hero: 'tabsu', patrol: [[65, 21], [66, 12], [62, 28], [58, 10]], flanker: true },
    ],
    tacticalPoints: null,
    // The last circle: the receiving dock, the power aisle, the action alley or the back aisle (fair), or a side's
    // mid cross aisle or produce (solo). The power aisle ending makes both sides fight down the longest lane.
    zoneCentres: [{ x: 36, y: 20 }, { x: 36, y: 31 }, { x: 36, y: 3.5 }, { x: 36, y: 11.5 }, ...sp([[16.5, 19.5], [55.5, 19.5], [10.5, 13.5], [61.5, 13.5]])],
    versusSpawns: versus(72, [[4, 40], [2, 38], [7, 39], [3, 42], [8, 37]]),
    materials: mats(72, [[1, 1, 22, 6, 'concrete'], [1, 9, 10, 33, 'tile'], [11, 9, 32, 38, 'tile'], [1, 35, 9, 42, 'dock'], [11, 40, 31, 42, 'concrete']],
      [[23, 1, 48, 6, 'dock'], [33, 9, 38, 32, 'tile']]),
    // Lit: the whole sales floor (aisles, alleys, checkouts, produce, deli). Dark: the stockroom and the entrances.
    // A body down an aisle is seen from its far end; the stockroom loop is the only way round unseen.
    lights: lights(72, [[11, 9, 32, 38], [1, 9, 10, 33]], [[33, 9, 38, 38]]),
  },
  // Metro Station: street stairs at each end (spawns) into the ticket hall, the fare-gate line (four one-wide gates),
  // the paid concourse, then stairs down (slow) to the island platform: the longest straight lane in the game, broken
  // only by pillars. A stalled train on the north track opens onto the platform: clear it car by car. The south track
  // cannot be crossed except by two staff crossings (stairs, in the open). Beyond it the service walkway, the station
  // rooms and the service tunnel from each spawn to the middle: doglegs, refuges, and footsteps that echo (1.3x).
  metro: {
    id: 'metro', name: 'Metro Station', tag: 'Chokepoints & tunnels',
    blurb: 'Fare gates, stairs down to a long platform, a stalled train, and service tunnels that echo.',
    rows: METRO,
    pickupZones: zones(80, [
      ['health', 3, 1, 16, 8, 'ticket hall'], ['health', 9, 30, 33, 34, 'station rooms'],
      ['armor', 18, 1, 33, 8, 'concourse'], ['armor', 9, 36, 39, 38, 'tunnel'],
      ['ammo', 9, 14, 33, 22, 'platform'], ['ammo', 9, 27, 25, 28, 'walkway'], ['ammo', 10, 11, 28, 12, 'carriages'],
      ['grenade', 9, 36, 39, 38, 'tunnel'], ['grenade', 9, 30, 33, 34, 'station rooms'],
      ['health', 9, 14, 33, 22, 'platform'], ['armor', 9, 30, 33, 34, 'station rooms'], ['ammo', 18, 1, 33, 8, 'concourse'], ['grenade', 18, 1, 33, 8, 'concourse'],
    ], [
      ['health', 34, 1, 45, 2, 'control room'], ['ammo', 34, 14, 45, 22, 'platform middle'], ['armor', 35, 11, 44, 12, 'middle car'], ['grenade', 35, 30, 44, 34, 'middle rooms'],
    ]),
    botSpawns: [
      { name: 'Gate', hero: 'ray', patrol: [[70, 4], [62, 2], [74, 6], [56, 6]], flanker: false },
      { name: 'Platform', hero: 'tonashiro', patrol: [[50, 18], [60, 15], [44, 21], [66, 19]], flanker: false },
      { name: 'Car', hero: 'tabsu', patrol: [[64, 11], [54, 12], [40, 12], [67, 15]], flanker: true },
      { name: 'Signal', hero: 'benja', patrol: [[52, 32], [60, 31], [44, 32], [48, 27]], flanker: false },
      { name: 'Tunnel', hero: 'tabsu', patrol: [[70, 37], [58, 36], [48, 38], [76, 30]], flanker: true },
    ],
    tacticalPoints: null,
    // The last circle: the middle of the platform (fair; nowhere to hide but pillars) or the concourse (fair), or a
    // side's concourse or platform end (solo).
    zoneCentres: [{ x: 40, y: 18 }, { x: 40, y: 21.5 }, { x: 40, y: 6 }, ...sp([[26.5, 3.5], [53.5, 3.5], [11.5, 17.5], [68.5, 17.5]])],
    versusSpawns: versus(80, [[5, 4], [4, 2], [4, 6], [7, 3], [7, 5]]),
    materials: mats(80, [
      [1, 1, 16, 8, 'tile'], [17, 1, 39, 8, 'tile'], [9, 10, 39, 13, 'ballast'], [10, 11, 17, 12, 'metal'], [25, 11, 27, 12, 'metal'],
      [9, 14, 39, 22, 'concrete'], [9, 23, 39, 26, 'ballast'], [2, 9, 8, 38, 'tunnel'], [9, 27, 39, 28, 'tunnel'], [9, 30, 39, 34, 'concrete'], [9, 36, 39, 38, 'tunnel'],
    ], [[35, 11, 44, 12, 'metal']]),
    // Lit: the concourse and the island platform (strip lights end to end). Dark: the ticket halls, the train, the
    // walkway, the station rooms and the tunnel. The platform is the long fight; everything under it is close.
    lights: lights(80, [[18, 1, 39, 8], [9, 14, 39, 22]]),
  },
  // Construction Site: site gates at each end (spawns) into the laydown yards (stacked materials, a cabin, a skip).
  // The building in the middle: a ground floor of columns and half-built walls with open window frames (rails: shoot
  // through, do not walk through); scaffolding (decks) along the north and south facades, climbed by stair towers at
  // their ends; the first-floor slab in the middle (a deck) reached only by the core stairs. A shot fired from a deck
  // clears every crate and barrier below, so the high ground rules, and has no cover of its own but its columns.
  // Long open strips outside the scaffolds: the fast and exposed way across.
  construction: {
    id: 'construction', name: 'Construction Site', tag: 'High ground',
    blurb: 'Scaffolding and a raised slab over an open site: take the high ground, or stay under cover.',
    rows: CONSTRUCTION,
    pickupZones: zones(68, [
      ['health', 1, 6, 10, 40, 'yard'], ['health', 13, 10, 23, 35, 'ground floor'],
      ['armor', 5, 1, 33, 4, 'north strip'], ['armor', 5, 41, 33, 44, 'south strip'],
      ['ammo', 14, 6, 33, 8, 'north scaffold'], ['ammo', 14, 37, 33, 39, 'south scaffold'], ['ammo', 13, 10, 23, 35, 'ground floor'],
      ['grenade', 1, 6, 10, 40, 'yard'], ['grenade', 5, 1, 33, 4, 'north strip'],
      ['health', 5, 41, 33, 44, 'south strip'], ['armor', 13, 10, 23, 35, 'ground floor'], ['ammo', 5, 41, 33, 44, 'south strip'], ['grenade', 14, 37, 33, 39, 'south scaffold'],
    ], [
      ['armor', 25, 16, 42, 29, 'slab'], ['health', 25, 16, 42, 29, 'slab'], ['ammo', 31, 10, 36, 12, 'core north'], ['grenade', 31, 33, 36, 35, 'core south'],
    ]),
    botSpawns: [
      { name: 'Crane', hero: 'ray', patrol: [[58, 3], [48, 2], [64, 8], [40, 3]], flanker: false },
      { name: 'Slab', hero: 'tonashiro', patrol: [[36, 20], [30, 25], [38, 27], [34, 17]], flanker: false },
      { name: 'Scaffold', hero: 'tabsu', patrol: [[50, 7], [38, 8], [56, 7], [44, 6]], flanker: true },
      { name: 'Column', hero: 'benja', patrol: [[47, 22], [52, 14], [44, 31], [50, 33]], flanker: false },
      { name: 'Yard', hero: 'tabsu', patrol: [[60, 30], [62, 40], [56, 42], [58, 14]], flanker: true },
    ],
    tacticalPoints: null,
    // The last circle: on the slab (fair: whoever holds it holds the end) or the core stairs, or a side's yard or
    // ground floor (solo).
    zoneCentres: [{ x: 34, y: 18 }, { x: 34, y: 27.5 }, { x: 34, y: 13 }, ...sp([[9.5, 15.5], [58.5, 15.5], [15.5, 23.5], [52.5, 23.5]])],
    versusSpawns: versus(68, [[3, 22], [2, 20], [2, 25], [4, 18], [4, 27]]),
    materials: mats(68, [[1, 1, 11, 44, 'dock'], [5, 1, 33, 4, 'dock'], [5, 41, 33, 44, 'dock'], [12, 9, 33, 36, 'concrete']]),
    // Floodlights: the open strips outside the scaffolds and the slab. Dark: the yards, the scaffolds and the ground
    // floor. The fast way across and the high ground are both lit: take them and you are seen.
    lights: lights(68, [[5, 1, 33, 4], [5, 41, 33, 44]], [[25, 16, 42, 29]]),
  },
};
