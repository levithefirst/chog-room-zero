// Room Zero, the one handcrafted room. 1 tile = 1 u.
// '#' full wall (blocks movement, bullets, sight). 'c' half cover (blocks movement and bullets, not sight).
// '.' floor. 'P' player spawn. 'B' bot spawn (order matches BOT_SPAWNS below).
// Layout intent: three bands of rooms joined by door gaps, two long east-west sightlines (rows 11 and 19),
// a loop around the middle, and a dark pocket in the south-east.
export const ROOM_ZERO = [
  '########################################',
  '#.....#..........#........#............#',
  '#.....#..........#........#.....B......#',
  '#..P..#....cc....#...cc...#............#',
  '#.....#..........#........#....cccc....#',
  '#................#.....................#',
  '#.....#..........#........#............#',
  '###.######.###########.#####.####.######',
  '#........#.........#.........#.........#',
  '#........#....B....#....cc...#.........#',
  '#........#.........#.........#....B....#',
  '#..cc............................cc....#',
  '#........#.........#.........#.........#',
  '#........#..cc.....#.........#.........#',
  '####.#####.........######.####.......###',
  '#......#.............#.........#.......#',
  '#......#.............#.........#.......#',
  '#..B...#....cccc.....#....B....#.......#',
  '#......#.............#.........#.......#',
  '#......................................#',
  '#......#.............#.........#.......#',
  '#......#......c......#.........#..cc...#',
  '#......#.............#.........#.......#',
  '########################################',
];

export interface BotSpawn {
  name: string;
  // Patrol points in tile coordinates. First point is the spawn tile.
  patrol: [number, number][];
  // Flankers take a side route when chasing instead of the straight path.
  flanker: boolean;
}

// Names are plain and specific to where each bot lives.
export const BOT_SPAWNS: BotSpawn[] = [
  { name: 'Stair', patrol: [[32, 2], [36, 5], [29, 5]], flanker: false },
  { name: 'Hall', patrol: [[14, 9], [16, 12], [11, 11]], flanker: true },
  { name: 'Pump', patrol: [[34, 10], [36, 8], [33, 12]], flanker: false },
  { name: 'Cellar', patrol: [[3, 17], [5, 20], [2, 15]], flanker: true },
  { name: 'Boiler', patrol: [[26, 17], [28, 20], [23, 15]], flanker: false },
];
