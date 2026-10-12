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

// Bots are named for where they work. Each uses a hero archetype from heroes.ts.
export const BOT_SPAWNS: BotSpawn[] = [
  { name: 'Stair', hero: 'wick', patrol: [[37, 2], [40, 5], [33, 5]], flanker: false },
  { name: 'Pump', hero: 'brick', patrol: [[39, 9], [41, 12], [33, 8]], flanker: false },
  { name: 'Cellar', hero: 'mop', patrol: [[5, 15], [8, 20], [2, 18]], flanker: true },
  { name: 'Boiler', hero: 'kettle', patrol: [[37, 16], [40, 20], [34, 19]], flanker: false },
  { name: 'Hatch', hero: 'mop', patrol: [[15, 20], [17, 16], [13, 15]], flanker: true },
];
