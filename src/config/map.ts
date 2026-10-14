// Room Zero: one handcrafted floor of a service basement. 1 tile = 1 u. 44 x 26.
// '#' wall (blocks movement, bullets, sight). 'c' crate and 'b' barrier: half cover (block movement;
// block bullets unless the shooter leans over them, see RULE in docs/design/benchmark.md; never block sight).
// 'd' doorway (floor with a frame). '.' floor. 'P' player spawn. 'B' bot spawn (order = BOT_SPAWNS).
// 'h' health, 'a' armour, 'm' ammo pickup spawns.
// Intent: north offices, a central concourse with a long east-west sightline (rows 8 and 12), three
// southern rooms with doors as chokepoints, and a loading dock along the south wall as the flank route.
export const ROOM_ZERO = [
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
export const BOT_SPAWNS: BotSpawn[] = [
  { name: 'Stair', hero: 'ray', patrol: [[37, 2], [40, 5], [33, 5]], flanker: false },
  { name: 'Pump', hero: 'tonashiro', patrol: [[39, 9], [41, 12], [33, 8]], flanker: false },
  { name: 'Cellar', hero: 'tabsu', patrol: [[5, 15], [8, 20], [2, 18]], flanker: true },
  { name: 'Boiler', hero: 'benja', patrol: [[37, 16], [40, 20], [34, 19]], flanker: false },
  { name: 'Hatch', hero: 'tabsu', patrol: [[15, 20], [17, 16], [13, 15]], flanker: true },
];

// Danger zone (RC-8): where the last circle may settle, one is drawn per match. Each is open floor with 1.5 u clear
// all round (checked by src/sim/zone.ts openSpot and tests/rc8-zone.test.ts): north rooms, the concourse, the south
// rooms. Online, only the ones about equally far from both team spawns are used.
export const ZONE_CENTRES: { x: number; y: number }[] = [
  [7, 3], [13, 3], [19, 3], [39, 3], [7, 10], [12, 10], [29, 10], [31, 10], [15, 19], [24, 19], [35, 18], [36, 21],
].map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }));

// Online spawns (RC-8): team alpha on the west side, bravo mirrored on the east, five each, in join order. 1v1 uses
// the first of each. Checked walkable and mirrored in tests/rc8-online.test.ts.
export const VERSUS_SPAWNS: Record<'alpha' | 'bravo', { x: number; y: number }[]> = {
  alpha: [[2, 8], [2, 12], [4, 15], [3, 20], [5, 23]].map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })),
  bravo: [[41, 8], [41, 12], [39, 16], [41, 20], [38, 23]].map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })),
};
