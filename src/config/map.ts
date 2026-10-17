// Room Zero: one handcrafted floor of a service basement. 1 tile = 1 u. 44 x 26.
// '#' wall (blocks movement, bullets, sight). 'c' crate and 'b' barrier: half cover (block movement;
// block bullets unless the shooter leans over them, see RULE in docs/design/benchmark.md; never block sight).
// 'd' doorway (floor with a frame). '.' floor. 'P' player spawn. 'B' bot spawn (order = BOT_SPAWNS).
// 'h' health, 'a' armour, 'm' ammo, 'g' grenade: fixed pickup spawns (test maps and the RC-8 lab map). Room Zero itself
// places its pickups by zone (PICKUP_ZONES below, src/sim/pickups.ts).
// Intent: north offices, a central concourse (before CF a long east-west sightline on rows 8 and 12), three
// southern rooms with doors as chokepoints, and a loading dock along the south wall as the flank route.
// CF-F (owner 2026-10-16, docs/ROOM_ZERO_CORE_FEEL_AUDIT.md): the RC-8 layout had six straight open runs of 42 u (the
// full width, through aligned doors) and crates that never block sight, so cover never hid anyone. 32 one-tile pillars
// ('#': block movement, bullets and sight) break every lane to 15 u or less (the widest room), turn crate pairs into
// half-and-full cover, and give doors something to listen around. Fully connected, every zone centre open, both team
// spawn sets reachable (tests/cf-map.test.ts). LOS between floor tiles within 20 u: 22% before, 14% after.
export const ROOM_ZERO = [
  '############################################',
  '#.........#..........#.........#...........#',
  '#..P......#..........#.........#.....B.....#',
  '#.........d...#......d...c#c...d...#.......#',
  '#.cc......#....bb....#.........#...bb......#',
  '#.........#..........#.........#...........#',
  '####d######..........#####d#####...........#',
  '#.........######d#####.........######d######',
  '#............#......#...........#..........#',
  '#...#.....#....c#.......c#.........#c..B...#',
  '#..bb.....d....#....#####.........#...#....#',
  '#.........#....cc.......#c.........c#......#',
  '#.............#.............#....#.........#',
  '####d#####d#########.......########d########',
  '#..........#.......#..cc...#...............#',
  '#..........#...cc..d...#...d...c#c.#.......#',
  '#..........#.......#.......#.........B.....#',
  '#..cc......#.......#####d###...............#',
  '#.....#....d.....#...........#.........bb..#',
  '#......bb..#.......#...........#...........#',
  '#..........#...B...#...........#...........#',
  '#..........#.......#......#....d.......#...#',
  '#####.d#####.......#############...........#',
  '#..........#........B.#...........#........#',
  '#....c#.........b#..........c#.............#',
  '############################################',
];

/**
 * Pickup zones (owner 2026-10-17): 15 pickups, each in its own zone, placed and moved by src/sim/pickups.ts.
 * By walking distance the map splits at x = 21 (the doors and pillars make it lopsided by eye), so west and east zones
 * come in pairs mirrored about it (x -> 42 - x) and the pickups in a pair are drawn from tiles the same walk from
 * their own side's spawns; a 'mid' zone keeps only tiles about as far from both sides (the contested ones).
 * Health sits between the spawns and the middle (worth a detour, never in a spawn), armour in the four corner rooms,
 * grenades in the south stores and the middle of the dock (fewest, slowest back), ammo in the halls and dock ends.
 * Tile rectangles, inclusive.
 */
export const PICKUP_ZONES: { kind: 'health' | 'armor' | 'ammo' | 'grenade'; x0: number; y0: number; x1: number; y1: number; name: string; side: 'west' | 'east' | 'mid' }[] = [
  { kind: 'health', x0: 12, y0: 1, x1: 19, y1: 6, name: 'north offices west', side: 'west' },
  { kind: 'health', x0: 23, y0: 1, x1: 30, y1: 7, name: 'north offices east', side: 'east' },
  { kind: 'health', x0: 17, y0: 8, x1: 25, y1: 12, name: 'concourse', side: 'mid' },
  { kind: 'health', x0: 17, y0: 14, x1: 25, y1: 21, name: 'south hall', side: 'mid' },
  { kind: 'armor', x0: 1, y0: 1, x1: 9, y1: 5, name: 'north-west office', side: 'west' },
  { kind: 'armor', x0: 33, y0: 1, x1: 42, y1: 6, name: 'north-east office', side: 'east' },
  { kind: 'armor', x0: 1, y0: 14, x1: 10, y1: 21, name: 'south-west room', side: 'west' },
  { kind: 'armor', x0: 32, y0: 14, x1: 42, y1: 21, name: 'south-east room', side: 'east' },
  { kind: 'grenade', x0: 12, y0: 14, x1: 18, y1: 21, name: 'south-west store', side: 'west' },
  { kind: 'grenade', x0: 24, y0: 14, x1: 31, y1: 21, name: 'south-east store', side: 'east' },
  { kind: 'grenade', x0: 16, y0: 23, x1: 26, y1: 24, name: 'dock middle', side: 'mid' },
  { kind: 'ammo', x0: 1, y0: 7, x1: 12, y1: 12, name: 'west hall', side: 'west' },
  { kind: 'ammo', x0: 30, y0: 7, x1: 42, y1: 12, name: 'east hall', side: 'east' },
  { kind: 'ammo', x0: 1, y0: 23, x1: 15, y1: 24, name: 'dock west', side: 'west' },
  { kind: 'ammo', x0: 27, y0: 23, x1: 42, y1: 24, name: 'dock east', side: 'east' },
];

/** The RC-8 layout (LAB.pacing off), kept so the lab can measure the old map against the new one. */
export const ROOM_ZERO_RC8 = [
  '############################################',
  '#.........#..........#.........#...........#',
  '#..P......#....h.....#.........#.....B.....#',
  '#.........d..........d...ccc...d...........#',
  '#.cc......#....bb....#.........#...bb......#', // spawn crates 1 tile west of P1F: clears the south-door lane (MAP-001)
  '#.........#..........#.........#...........#',
  '####d######..........#####d#####...........#',
  '#.........######d#####.........######d######',
  '#..a.......................m...............#',
  '#.........#....cc.......cc.........cc..B...#',
  '#..bb.....d.........#####..................#',
  '#.........#....cc.......cc.........cc......#',
  '#..........................h...........a...#',
  '####d#####d#########.......########d########', // door 1 tile west: it opened onto a wall (RC-1 snag sweep)
  '#..........#.......#..cc...#...............#',
  '#....B.....#...cc..d.......d...ccc.........#',
  '#..........#.......#.......#.........B.....#',
  '#..cc......#.......#####d###...............#',
  '#..........d...m.......................bb..#',
  '#......bb..#.......#...........#...........#',
  '#..........#...B...#....h......#...........#',
  '#..........#.......#...........d.....a.....#',
  '#####.d#####.......#############...........#',
  '#..........................................#',
  '#....cc.........bb..........cc..........m..#',
  '############################################',
];

export type Material = 'tile' | 'concrete' | 'metal' | 'dock';

// Floor material zones, painted in order (later wins). Anything not covered is concrete.
export const ZONES: { x0: number; y0: number; x1: number; y1: number; mat: Material }[] = [
  { x0: 1, y0: 1, x1: 10, y1: 6, mat: 'tile' },
  { x0: 22, y0: 1, x1: 31, y1: 7, mat: 'tile' },
  { x0: 32, y0: 1, x1: 43, y1: 7, mat: 'metal' },
  { x0: 1, y0: 14, x1: 11, y1: 22, mat: 'tile' },
  { x0: 12, y0: 14, x1: 19, y1: 22, mat: 'metal' },
  { x0: 20, y0: 14, x1: 27, y1: 17, mat: 'tile' },
  { x0: 32, y0: 14, x1: 43, y1: 22, mat: 'metal' },
  { x0: 1, y0: 23, x1: 43, y1: 25, mat: 'dock' },
];

export interface BotSpawn {
  name: string;
  hero: string;
  // Patrol points in tile coordinates. First point is the spawn tile.
  patrol: [number, number][];
  flanker: boolean;
}

// Bots are named for where they work. Each is a roster character (heroes.ts); its department sets how it fights.
export const BOT_SPAWNS_RC8: BotSpawn[] = [
  { name: 'Stair', hero: 'ray', patrol: [[37, 2], [40, 5], [33, 5]], flanker: false },
  { name: 'Pump', hero: 'tonashiro', patrol: [[39, 9], [41, 12], [33, 8]], flanker: false },
  { name: 'Cellar', hero: 'tabsu', patrol: [[5, 15], [8, 20], [2, 18]], flanker: true },
  { name: 'Boiler', hero: 'benja', patrol: [[37, 16], [40, 20], [34, 19]], flanker: false },
  { name: 'Hatch', hero: 'tabsu', patrol: [[15, 20], [17, 16], [13, 15]], flanker: true },
];

// CF-F pacing: Cellar no longer patrols the room under the spawn (14.7 u walk from P, the first contact in every
// default match at 4-5 s). It works the loading dock (31.6 u), the flank route; the nearest patrol is now Hatch at 25 u,
// about 11 s at a creep: time to move, listen and choose a door before anyone is met.
export const BOT_SPAWNS: BotSpawn[] = BOT_SPAWNS_RC8.map((b) => b.name === 'Cellar' ? { ...b, patrol: [[20, 23], [30, 24], [12, 23]] } : b);

// Danger zone (RC-8): where the last circle may settle. CF moved [13, 3] (a pillar now stands 1 u from it) to [28, 9],
// in the same list slot so every seed keeps its circle, one is drawn per match. Each is open floor with 1.5 u clear
// all round (checked by src/sim/zone.ts openSpot and tests/rc8-zone.test.ts): north rooms, the concourse, the south
// rooms. Online, only the ones about equally far from both team spawns are used.
export const ZONE_CENTRES: { x: number; y: number }[] = [
  [7, 3], [28, 9], [19, 3], [39, 3], [7, 10], [12, 10], [29, 10], [31, 10], [15, 19], [24, 19], [35, 18], [36, 21],
].map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }));

// Online spawns (RC-8): team alpha on the west side, bravo mirrored on the east, five each, in join order. 1v1 uses
// the first of each. Checked walkable and mirrored in tests/rc8-online.test.ts.
export const VERSUS_SPAWNS: Record<'alpha' | 'bravo', { x: number; y: number }[]> = {
  alpha: [[2, 8], [2, 12], [4, 15], [3, 20], [5, 23]].map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })),
  bravo: [[41, 8], [41, 12], [39, 16], [41, 20], [38, 23]].map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })),
};
