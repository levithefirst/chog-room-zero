// Room Zero: one handcrafted floor of a service basement. 1 tile = 1 u. 68 x 42 (owner 2026-10-17: "venues need to be
// much bigger, while remaining tactically dense"; the CF venue was 44 x 26, a third of the floor).
// '#' wall (blocks movement, bullets, sight). 'c' crate and 'b' barrier: half cover (block movement;
// block bullets unless the shooter leans over them, see RULE in docs/design/benchmark.md; never block sight).
// 'd' doorway (floor with a frame). '.' floor. 'P' player spawn (solo).
// 'h' health, 'a' armour, 'm' ammo, 'g' grenade: fixed pickup spawns (test maps and the RC-8 lab map). Room Zero itself
// places its pickups by zone (PICKUP_ZONES below, src/sim/pickups.ts).
// Layout, mirrored about the middle (x -> 67 - x) so neither online side has a better map: a spawn hall at each end
// (x 1-7), offices in the north corners and storage in the south corners, two side rooms per half, a north
// gallery and a south loading dock spanning the middle, a 2-wide corridor along each of them, a north-south flank
// corridor on each side of the central atrium (the contested middle: pillars, crate lines, the longest sightline,
// 28 u). Routes: the gallery (north), the corridors (fast and narrow), the side rooms and flank corridors, the
// atrium (short and exposed) and the dock (south, long, zigzag cover). Wall pillars cap every other straight sight
// lane at 28 u or less (tests/venue.test.ts); 1,950 floor tiles, all reachable.
export const ROOM_ZERO = [
  '####################################################################',
  '#.....#.....##........c..#................#..c........##.....#.....#',
  '#.....#.....#..c.......#......c......c......#.......c..#.....#.....#',
  '#..P..d..c..d.....#.............####.............#.....d..c..d.....#',
  '#.....#..c..d........c......#...####...#......c........d..c..#.....#',
  '#.....#.....#.....#.............####.............#.....#.....#.....#',
  '#.cc........#..........#..c..............c..#..........#........cc.#',
  '#...........##.....c.....#.....c....c.....#.....c.....##...........#',
  '#...........####..##########.##########.##########..####...........#',
  '##..######d#####..##########.##########.##########..#####d######..##',
  '##..#####......c.........#....c......c....#.........c......#####..##',
  '##..#####.......#.......c........##........c.......#.......#####..##',
  '##..#########d######..####..###..##..###..####..######d#########..##',
  '#.......#..........#..#......c........c......#..#..........#.......#',
  '#.......#..........#..#.......c......c.......#..#..........#.......#',
  '#.......d..cc......#.....#.c....b..b....c.#.....#......cc..d.......#',
  '#.......d.....#....d.......#............#.......d....#.....d.......#',
  '#..#.c..#.......c..#..#.........####.........#..#..c.......#..c.#..#',
  '#....c..#.......c#.#..#......#..####..#......#..#.#c.......#..c....#',
  '#.......#..........#..#......................#..#..........#.......#',
  '#..b....############c...c......c....c......c...c############....b..#',
  '#.#b....############....c......c....c......c....############....b#.#',
  '#.....#.#..........#..#......................#..#..........#.#.....#',
  '#....c..#.......c#.#.c#......#..####..#......#c.#.#c.......#..c....#',
  '#....c..#.......c..#..#.........####.........#..#..c.......#..c....#',
  '#.......d.....#....d..#....#............#....#..d....#.....d.......#',
  '#.......d..cc......#.....#.c....b..b....c.#.....#......cc..d.......#',
  '#.......#..........#..........c......c..........#..........#.......#',
  '#.......#..........#..#......c........c......#..#..........#.......#',
  '#####..######d######..####..###..##..###..####..######d######..#####',
  '#####..##.......#.......c........##........c.......#.......##..#####',
  '#####..##......c.........#....c......c....#.........c......##..#####',
  '#####..##d#####..#######..######....######..#######..#####d##..#####',
  '#...........###..#######..######....######..#######..###...........#',
  '#...........##....#.........#..........#.........#....##...........#',
  '#.cc........#.....#.......c.#..........#.c.......#.....#........cc.#',
  '#.....#.....#.....#.c.......#....cc....#.......c.#.....#.....#.....#',
  '#.....#..c..d.....#....#....................#....#.....d..c..#.....#',
  '#.....d..c..d..cc......#......cc....cc......#......cc..d..c..d.....#',
  '#.....#.....#........c.#....................#.c........#.....#.....#',
  '#.....#.....##.........#......c......c......#.........##.....#.....#',
  '####################################################################',
];

/**
 * Pickup zones (owner 2026-10-17: "substantially more ... throughout the venue"): 26 pickups, each in its own zone,
 * placed and moved by src/sim/pickups.ts. West and east zones of a kind pair up in list order and draw from tiles the
 * same walk from their own side's spawns; a 'mid' zone keeps only tiles about as far from both (the contested ones).
 * Health between the spawns and the middle (and either side of the atrium), armour in the corner storage and side rooms and the middle of the gallery
 * and dock, grenades in the flank corridors, the dock and the middle of both corridors, ammo along the corridors and
 * in the atrium and dock. Tile rectangles, inclusive.
 */
export const PICKUP_ZONES: { kind: 'health' | 'armor' | 'ammo' | 'grenade'; x0: number; y0: number; x1: number; y1: number; name: string; side: 'west' | 'east' | 'mid' }[] = [
  { kind: 'health', x0: 1, y0: 1, x1: 11, y1: 8, name: 'north-west offices', side: 'west' },
  { kind: 'health', x0: 56, y0: 1, x1: 66, y1: 8, name: 'north-east offices', side: 'east' },
  { kind: 'health', x0: 13, y0: 1, x1: 24, y1: 7, name: 'gallery west', side: 'west' },
  { kind: 'health', x0: 43, y0: 1, x1: 54, y1: 7, name: 'gallery east', side: 'east' },
  { kind: 'health', x0: 9, y0: 22, x1: 18, y1: 28, name: 'west side room south', side: 'west' },
  { kind: 'health', x0: 49, y0: 22, x1: 58, y1: 28, name: 'east side room south', side: 'east' },
  { kind: 'health', x0: 23, y0: 13, x1: 31, y1: 28, name: 'atrium west', side: 'west' },
  { kind: 'health', x0: 36, y0: 13, x1: 44, y1: 28, name: 'atrium east', side: 'east' },
  { kind: 'armor', x0: 1, y0: 33, x1: 11, y1: 40, name: 'south-west storage', side: 'west' },
  { kind: 'armor', x0: 56, y0: 33, x1: 66, y1: 40, name: 'south-east storage', side: 'east' },
  { kind: 'armor', x0: 9, y0: 13, x1: 18, y1: 19, name: 'west side room north', side: 'west' },
  { kind: 'armor', x0: 49, y0: 13, x1: 58, y1: 19, name: 'east side room north', side: 'east' },
  { kind: 'armor', x0: 26, y0: 1, x1: 41, y1: 7, name: 'gallery middle', side: 'mid' },
  { kind: 'armor', x0: 24, y0: 34, x1: 43, y1: 40, name: 'dock middle', side: 'mid' },
  { kind: 'grenade', x0: 20, y0: 10, x1: 21, y1: 31, name: 'west flank corridor', side: 'west' },
  { kind: 'grenade', x0: 46, y0: 10, x1: 47, y1: 31, name: 'east flank corridor', side: 'east' },
  { kind: 'grenade', x0: 13, y0: 34, x1: 23, y1: 40, name: 'dock west', side: 'west' },
  { kind: 'grenade', x0: 44, y0: 34, x1: 54, y1: 40, name: 'dock east', side: 'east' },
  { kind: 'grenade', x0: 26, y0: 10, x1: 41, y1: 11, name: 'north corridor middle', side: 'mid' },
  { kind: 'grenade', x0: 26, y0: 30, x1: 41, y1: 31, name: 'south corridor middle', side: 'mid' },
  { kind: 'ammo', x0: 9, y0: 10, x1: 19, y1: 11, name: 'north corridor west', side: 'west' },
  { kind: 'ammo', x0: 48, y0: 10, x1: 58, y1: 11, name: 'north corridor east', side: 'east' },
  { kind: 'ammo', x0: 9, y0: 30, x1: 19, y1: 31, name: 'south corridor west', side: 'west' },
  { kind: 'ammo', x0: 48, y0: 30, x1: 58, y1: 31, name: 'south corridor east', side: 'east' },
  { kind: 'ammo', x0: 28, y0: 19, x1: 39, y1: 22, name: 'atrium centre', side: 'mid' },
  { kind: 'ammo', x0: 13, y0: 34, x1: 54, y1: 40, name: 'dock', side: 'mid' },
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
  { x0: 1, y0: 1, x1: 11, y1: 8, mat: 'tile' },
  { x0: 56, y0: 1, x1: 66, y1: 8, mat: 'tile' },
  { x0: 13, y0: 1, x1: 54, y1: 7, mat: 'tile' },
  { x0: 9, y0: 13, x1: 18, y1: 28, mat: 'metal' },
  { x0: 49, y0: 13, x1: 58, y1: 28, mat: 'metal' },
  { x0: 23, y0: 13, x1: 44, y1: 28, mat: 'metal' },
  { x0: 1, y0: 33, x1: 11, y1: 40, mat: 'metal' },
  { x0: 56, y0: 33, x1: 66, y1: 40, mat: 'metal' },
  { x0: 13, y0: 34, x1: 54, y1: 40, mat: 'dock' },
]

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

// The hostile squad in solo, on the big venue: spawns in the east half and the middle, far from yours (the nearest
// is about 37 u away, some 15 s of careful walking), each with a beat across two or three rooms. Patrol is only
// their resting job: src/sim/bots.ts gives every bot reasons to move on its own (hunt what it knows, search where
// something was, rotate between areas, take pickups it needs, regroup).
export const BOT_SPAWNS: BotSpawn[] = [
  { name: 'Stair', hero: 'ray', patrol: [[59, 4], [63, 7], [50, 4], [54, 10]], flanker: false },
  { name: 'Pump', hero: 'tonashiro', patrol: [[54, 16], [46, 14], [39, 16], [52, 18]], flanker: false },
  { name: 'Cellar', hero: 'tabsu', patrol: [[40, 38], [26, 39], [30, 30], [47, 38]], flanker: true },
  { name: 'Boiler', hero: 'benja', patrol: [[41, 21], [36, 27], [54, 25], [44, 16]], flanker: false },
  { name: 'Hatch', hero: 'tabsu', patrol: [[60, 37], [52, 30], [46, 37], [62, 34]], flanker: true },
];

/**
 * Tactical points for the hostile squad (src/sim/bots.ts): rooms, junctions and control spots it searches, holds and
 * rotates between. Mirrored, plus the middle line. Each is open floor (tests/venue.test.ts).
 */
export const TACTICAL_POINTS: { x: number; y: number }[] = [
  ...[[5, 5], [17, 4], [13, 10], [13, 17], [13, 25], [20, 13], [21, 28], [4, 20], [4, 37], [19, 38], [13, 31], [27, 20], [26, 14], [26, 27]]
    .flatMap(([x, y]) => [{ x: x + 0.5, y: y + 0.5 }, { x: 67 - x + 0.5, y: y + 0.5 }]),
  ...[[33, 6], [33, 38], [30, 11], [30, 30], [34, 21]].map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })),
];

// Danger zone: where the last circle may settle. Open floor with 1.5 u clear all round (src/sim/zone.ts openSpot):
// the middle of the atrium and of the dock (equally far from both online sides, so online uses only these), and
// mirrored pairs in the atrium, the gallery and the dock for solo.
export const ZONE_CENTRES: { x: number; y: number }[] = [
  { x: 34, y: 21 }, { x: 34, y: 38.5 },
  ...[[27, 20], [26, 18], [25, 4], [16, 4], [26, 38], [15, 35]].flatMap(([x, y]) => [{ x: x + 0.5, y: y + 0.5 }, { x: 67 - x + 0.5, y: y + 0.5 }]),
];

// Online spawns: team alpha in the west spawn hall, bravo in the east one (mirrored), five each, in join order. 1v1
// uses the first of each. Checked walkable and mirrored in tests/rc8-online.test.ts and tests/venue.test.ts.
export const VERSUS_SPAWNS: Record<'alpha' | 'bravo', { x: number; y: number }[]> = {
  alpha: [[4, 20], [2, 15], [2, 26], [6, 14], [6, 27]].map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 })),
  bravo: [[4, 20], [2, 15], [2, 26], [6, 14], [6, 27]].map(([x, y]) => ({ x: 67 - x + 0.5, y: y + 0.5 })),
};
