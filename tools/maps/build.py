# H34 location builder: draws the west half of each new location with rectangles, mirrors it about the middle
# (x -> w - 1 - x, so neither online side has a better half), checks it, and writes src/config/layouts.ts.
# Usage: python3 tools/maps/build.py [--show name]
#
# Tiles: '#' wall, '.' floor, 'c' crate, 'b' barrier (half cover), 'd' doorway, 'r' rail (see and shoot across, no
# walking), 'u' deck (raised floor: shots from it clear half cover), 's' stairs (slow floor; the only way onto a deck),
# 'P' the solo spawn. Checks: closed edge, mirrored, every walkable tile reachable, and every deck tile touches only
# deck, stairs, rails or walls (so a deck is only ever reached by its stairs).
import sys
from collections import deque

WALK = set('.dPus')


class Grid:
    def __init__(self, w, h):
        self.w, self.h, self.half = w, h, w // 2
        self.g = [['.'] * self.half for _ in range(h)]
        self.rect(0, 0, self.half - 1, 0, '#')
        self.rect(0, h - 1, self.half - 1, h - 1, '#')
        self.rect(0, 0, 0, h - 1, '#')

    def rect(self, x0, y0, x1, y1, ch):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if 0 <= x < self.half and 0 <= y < self.h:
                    self.g[y][x] = ch

    def hwall(self, y, x0, x1, doors=(), ch='#'):
        self.rect(x0, y, x1, y, ch)
        for d in doors:
            self.g[y][d] = 'd'

    def vwall(self, x, y0, y1, doors=(), ch='#'):
        self.rect(x, y0, x, y1, ch)
        for d in doors:
            self.g[d][x] = 'd'

    def pts(self, ch, ps):
        for x, y in ps:
            self.g[y][x] = ch

    def rows(self, spawn):
        rows = [''.join(r) + ''.join(reversed(r)) for r in self.g]
        x, y = spawn
        r = list(rows[y])
        assert r[x] == '.', f'spawn on {r[x]!r}'
        r[x] = 'P'
        rows[y] = ''.join(r)
        return rows


def check(name, rows):
    h, w = len(rows), len(rows[0])
    assert all(len(r) == w for r in rows), name
    at = lambda x, y: rows[y][x] if 0 <= x < w and 0 <= y < h else '#'
    for x in range(w):
        assert at(x, 0) == '#' and at(x, h - 1) == '#', f'{name}: open edge at x {x}'
    for y in range(h):
        assert at(0, y) == '#' and at(w - 1, y) == '#', f'{name}: open edge at y {y}'
        for x in range(w):
            a, b = at(x, y), at(w - 1 - x, y)
            assert a == b or {a, b} == {'P', '.'}, f'{name}: not mirrored at {x},{y}'
    bad = []
    for y in range(h):
        for x in range(w):
            if at(x, y) != 'u':
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if at(x + dx, y + dy) not in 'usr#':
                    bad.append((x, y, at(x + dx, y + dy)))
    assert not bad, f'{name}: deck tiles reachable without stairs: {bad[:6]}'
    sx, sy = next((r.index('P'), y) for y, r in enumerate(rows) if 'P' in r)
    seen = {(sx, sy)}
    q = deque([(sx, sy)])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if n not in seen and at(*n) in WALK:
                seen.add(n)
                q.append(n)
    floor = sum(1 for r in rows for c in r if c in WALK)
    lost = [(x, y) for y, r in enumerate(rows) for x, c in enumerate(r) if c in WALK and (x, y) not in seen]
    assert not lost, f'{name}: {len(lost)} floor tiles unreachable, e.g. {lost[:6]}'
    return floor


# ---------------------------------------------------------------------------------------------------------------------
# OFFICE (64 x 44): one floor of an office building around a solid central core. Fire stairs at each end (the
# spawns); along the north facade a row of private offices off a long corridor; in the middle band the carpeted
# open-plan floor (desk clusters, mid range) and small meeting rooms; at the centre the core itself (lifts, risers,
# toilets) that every fight wraps around, with the glass-walled boardroom on its north face (you see and shoot in,
# you walk in only by its doors) and reception and the lift lobby on its south face (the exposed middle); along the
# south a service corridor behind the server room, the print room and the kitchen: the flank.
def office():
    G = Grid(64, 44)
    # Fire stair and lobby (spawn) x 1-6, y 15-28; its wall x 7 opens onto every lane.
    G.rect(1, 1, 6, 14, '#'); G.rect(1, 29, 6, 42, '#')
    G.vwall(7, 1, 42, doors=(9, 10, 16, 17, 22, 26, 27, 34, 35))
    G.rect(1, 15, 6, 15, '#'); G.rect(1, 28, 6, 28, '#')
    G.pts('#', [(2, 17), (2, 26)])
    G.pts('c', [(5, 18), (5, 25)])
    # Executive offices: the north facade, rooms 5 wide, doors onto the north corridor (rows 9-10).
    G.hwall(8, 8, 31, doors=(10, 16, 22, 28))
    for x in (13, 19, 25):
        G.vwall(x, 1, 7)
    G.pts('c', [(9, 3), (11, 2), (15, 5), (17, 3), (21, 2), (23, 5), (27, 3), (29, 6)])
    G.pts('b', [(10, 5), (16, 2), (22, 5), (28, 2)])
    G.vwall(31, 1, 7)  # the corner office walls meet the boardroom
    # North corridor rows 9-10, x 8-31. Door frames and a fire door break it so it is never one lane end to end.
    G.pts('#', [(19, 9)])
    # Open-plan floor x 8-21, rows 11-21 (carpet): desk clusters (barriers = screens, crates = pedestals).
    G.hwall(11, 8, 21, doors=(9, 10, 14, 15, 18, 19))
    G.g[11][8] = '.'; G.g[11][9] = '.'
    for y0 in (13, 17):
        for x0 in (9, 14):
            G.rect(x0, y0, x0 + 2, y0, 'b'); G.rect(x0, y0 + 1, x0 + 2, y0 + 1, 'b')
    G.pts('c', [(19, 13), (19, 18), (12, 20)])
    # Meeting rooms x 8-21, rows 23-30: three small rooms, one door each (defensive pockets).
    G.hwall(22, 8, 21, doors=(11, 17))
    G.hwall(31, 8, 21)
    G.vwall(13, 23, 30, doors=(27,)); G.vwall(18, 23, 30, doors=(25,)); G.vwall(21, 23, 30, doors=(28,))
    G.pts('c', [(10, 26), (11, 26), (15, 26), (16, 26), (19, 28), (19, 24)])
    G.rect(8, 22, 8, 31, '.')
    G.rect(9, 23, 12, 23, '.')
    # Ring corridor around the core: x 22-23 (west of the core), with the open plan's east edge.
    G.vwall(22, 11, 21, doors=(14, 19))
    G.vwall(22, 22, 31, doors=(24, 29))
    # Boardroom (north face of the core) x 25-38 rows 9-14: glass (rails) on its south and west sides, doors at
    # the west and east ends; a long table in the middle.
    G.vwall(24, 9, 15, doors=(12,))
    G.hwall(15, 24, 31, ch='r')
    G.rect(28, 11, 31, 12, 'c')
    G.hwall(8, 24, 31, doors=(28,))
    # The core x 26-37 rows 17-26: lift shafts and risers (walls), a toilet block with one door on each side.
    G.rect(26, 17, 31, 26, '#')
    G.rect(27, 19, 30, 22, '.'); G.vwall(26, 20, 21, doors=(20,))
    G.pts('c', [(29, 21)])
    G.rect(24, 16, 25, 16, '.')
    # Reception and the lift lobby (south face of the core) x 24-39 rows 27-33: the exposed middle.
    G.pts('c', [(28, 29), (29, 29), (30, 29)])
    G.pts('b', [(25, 31), (28, 33)])
    G.hwall(34, 8, 31, doors=(12, 20, 27))
    # South service corridor rows 32-33 x 8-23 behind the meeting rooms, then the support rooms rows 35-42.
    G.rect(8, 32, 23, 33, '.')
    G.pts('#', [(12, 32), (19, 33)])  # fire-door frames: the corridor is never one sightline end to end
    G.vwall(16, 35, 42, doors=(38,))
    for x0 in (9, 12):
        for y0 in (36, 39):
            G.rect(x0, y0, x0 + 1, y0 + 1, '#')  # server racks
    G.vwall(24, 35, 42, doors=(40,))
    G.pts('c', [(18, 37), (21, 37), (18, 40), (21, 40)])  # print room / copiers
    G.pts('b', [(27, 37), (28, 37), (27, 40), (28, 40)])  # kitchen tables
    G.pts('c', [(30, 36)])
    return G.rows((3, 21))


# ---------------------------------------------------------------------------------------------------------------------
# SUPERMARKET (72 x 44): one hall. Entrances in the two front corners (the spawns), the checkout bank across the front,
# the action alley (front cross aisle) behind it, then the gondola aisles running NORTH-SOUTH, across the line between
# the two sides: every step toward the other side crosses an aisle mouth with a long view down it. Produce (west) and
# the deli (east) along the side walls, the refrigerated cases along the back wall with the back cross aisle in front
# of them, and behind the back wall the stockroom and receiving dock, reached by swing doors: the hidden loop.
def supermarket():
    G = Grid(72, 44)
    # Stockroom (back of house) rows 1-6: pallet racks (walls) and pallets, the receiving dock in the middle.
    G.hwall(7, 1, 35, doors=(9, 21))
    for x0 in (4, 12, 24):
        G.rect(x0, 2, x0 + 4, 2, '#')
    G.pts('c', [(6, 5), (15, 4), (27, 5), (31, 2), (32, 2), (33, 4)])
    G.pts('b', [(18, 3), (18, 4)])
    G.vwall(23, 1, 6, doors=(4,))
    # Refrigerated cases along the back wall (row 8, a wall of glass doors) and the back cross aisle rows 9-10.
    G.hwall(8, 12, 35)
    G.g[8][21] = 'd'
    # Produce (west side department) x 1-10 rows 9-33: bins in short rows, open floor, mid range.
    for y0 in (11, 15, 19, 23, 27):
        G.rect(3, y0, 4, y0 + 1, 'c'); G.rect(7, y0, 8, y0 + 1, 'c')
    G.vwall(11, 9, 33, doors=(10, 20, 31))
    G.rect(11, 12, 11, 18, '.'); G.rect(11, 22, 11, 29, '.')
    G.pts('b', [(11, 15), (11, 25)])
    # The aisles: gondolas (walls, 1 wide) x 13, 17, 21, 25, 29, 33 from row 11 to 29, a mid cross aisle at rows
    # 19-20; the power aisle x 34-37 (centre) runs the whole depth. End caps (crates) at the aisle mouths.
    for x in (14, 18, 22, 26, 30):
        G.vwall(x, 12, 18); G.vwall(x, 21, 28)
    G.vwall(33, 12, 28)
    G.pts('c', [(16, 11), (24, 29), (20, 11), (28, 29), (32, 11), (16, 29)])
    G.pts('b', [(19, 19), (27, 20)])
    # Action alley (front cross aisle) rows 30-32, then the checkout bank rows 33-37: counters (barriers) N-S with
    # the till (crate) at their head, 2-wide lanes between; customer service in the middle front.
    for x in (13, 17, 21, 25, 29):
        G.rect(x, 34, x, 36, 'b'); G.pts('c', [(x, 33)])
    G.rect(33, 35, 35, 38, '#'); G.rect(34, 35, 35, 35, 'b'); G.rect(34, 36, 35, 37, '.'); G.g[37][33] = 'd'
    # Columns in the long front and back aisles: the store's longest lanes, but not one shot end to end.
    G.pts('#', [(24, 31), (27, 10)])
    # Front: entrance vestibule x 1-9 rows 35-42 (spawn), its glass doors (doorways) onto the store; the front wall.
    G.hwall(34, 1, 10, doors=(4, 5))
    G.vwall(10, 34, 42, doors=(37, 38, 40))
    G.pts('c', [(2, 36), (8, 41)])
    G.pts('#', [(5, 38)])
    G.rect(11, 39, 35, 39, '#')
    G.g[39][20] = 'd'
    G.pts('c', [(14, 41), (22, 41), (28, 40)])  # bagging and trolleys
    G.rect(32, 40, 35, 42, '#')  # trolley bay: the front strip is two pockets, not a lane between the entrances
    return G.rows((4, 40))


# ---------------------------------------------------------------------------------------------------------------------
# METRO (80 x 40): a station. Street stairs at each end (the spawns) into the ticket hall; the fare-gate line (four
# one-wide gates) into the paid concourse; stairs down (slow) to the island platform; a stalled train on the north
# track whose carriages open onto the platform (close quarters, clear them car by car); the south track you cannot
# cross except by two staff crossings (stairs, slow, in the open); beyond it the service walkway, the station rooms
# and the service tunnel (echoes) that runs from each spawn to the middle: the ambush route.
def metro():
    G = Grid(80, 40)
    # Concourse rows 1-8. Ticket hall x 1-16 (spawn at the street stairs x 1-3), ticket machines on the north wall.
    G.pts('s', [(1, 3), (2, 3), (1, 4), (2, 4), (1, 5), (2, 5)])
    G.pts('c', [(6, 1), (8, 1), (10, 1), (12, 1)])
    G.rect(9, 6, 12, 8, '#'); G.rect(10, 6, 11, 7, '.'); G.g[6][9] = 'd'  # ticket office
    # Fare gates x 17: a wall of barriers with four one-wide gates.
    G.vwall(17, 1, 8, ch='b')
    for y in (2, 4, 6, 8):
        G.g[y][17] = '.'
    # Paid concourse x 18-39: pillars, the station control room in the middle north, stair wells down.
    for x, y in ((22, 3), (29, 3), (36, 6)):
        G.rect(x, y, x + 1, y + 1, '#')
    G.rect(34, 1, 39, 3, '#'); G.rect(36, 1, 39, 2, '.'); G.g[3][37] = 'd'
    G.pts('c', [(25, 6), (32, 2)])
    # Concourse floor wall row 9 with the stair wells (rows 9-13) cutting through to the platform.
    G.hwall(9, 1, 39)
    for x0, x1 in ((20, 22), (30, 32)):
        G.rect(x0, 9, x1, 13, 's'); G.rect(x0 - 1, 9, x0 - 1, 13, '#'); G.rect(x1 + 1, 9, x1 + 1, 13, '#')
    # North track rows 10-13 x 9-39 (rails over ballast) with the stalled train on it: carriages x 9-18 and
    # x 24-29 and x 34-39 (walls, a 2-wide aisle rows 11-12), doors onto the platform (row 13).
    G.rect(9, 10, 39, 13, 'r')
    for x0, x1, doors in ((9, 18, (11, 16)), (24, 28, (26,)), (34, 39, (36,))):
        G.rect(x0, 10, x1, 13, '#'); G.rect(x0 + 1, 11, x1 - 1, 12, '.')
        for d in doors:
            G.g[13][d] = 'd'
    for x0, x1 in ((20, 22), (30, 32)):
        G.rect(x0, 9, x1, 13, 's')
    G.g[11][39] = '.'; G.g[12][39] = '.'  # the middle carriage runs through the centre line
    # Island platform rows 14-22 x 9-39: pillars in two rows, benches, the platform shelter.
    G.rect(1, 10, 8, 30, '#')
    for x in (13, 19, 25, 31, 37):
        G.pts('#', [(x, 16), (x, 20)])
    G.pts('b', [(16, 18), (28, 18)])
    G.rect(22, 18, 23, 18, 'c')
    # Platform shelter: an advertising panel (wall) behind, glass ends (rails), open to the track side.
    G.rect(33, 17, 36, 17, '#'); G.pts('r', [(33, 18), (36, 18)]); G.pts('b', [(34, 18)])
    # South track rows 23-26 (rails over ballast) with two staff crossings (stairs) at x 10-11 and x 38-39.
    G.rect(9, 23, 39, 26, 'r')
    G.rect(10, 23, 11, 26, 's'); G.rect(38, 23, 39, 26, 's')
    # Service walkway rows 27-28 along the tunnel wall, the station rooms rows 30-34 off it, and the service tunnel
    # rows 36-37 behind them, from the spawn to the middle.
    G.hwall(29, 9, 39, doors=(13, 22, 30, 37))
    G.vwall(18, 30, 34, doors=()); G.vwall(26, 30, 34); G.vwall(34, 30, 34)
    G.hwall(35, 9, 39, doors=(15, 23, 36))
    G.pts('c', [(11, 31), (21, 32), (29, 31), (31, 33), (38, 32)])
    G.pts('b', [(15, 32), (23, 31)])
    G.pts('#', [(16, 27)])
    G.rect(26, 27, 26, 28, '#')  # signal cabinet: the walkway is two runs, not one lane between the spawns
    # West service shaft: from the ticket hall down to the tunnel (x 2-4), opening onto the walkway and the tunnel.
    G.rect(1, 31, 8, 38, '#')
    G.rect(2, 9, 4, 37, '.'); G.g[9][3] = 'd'
    G.rect(5, 36, 8, 37, '.')
    # The tunnel (rows 36-38) doglegs round refuges, so it is close quarters all the way, never a firing lane.
    G.rect(9, 36, 39, 38, '.')
    for x, y0 in ((14, 36), (20, 37), (27, 36), (33, 37)):
        G.rect(x, y0, x + 1, y0 + 1, '#')
    G.rect(5, 27, 8, 28, '.')
    G.pts('c', [(3, 20)])
    G.pts('c', [(24, 38), (38, 36)])
    return G.rows((5, 4))


# ---------------------------------------------------------------------------------------------------------------------
# CONSTRUCTION (68 x 46): a building going up in the middle of a site. Site gates at each end (the spawns) into the
# laydown yards (stacked materials, a site cabin, a skip); the building's ground floor (column grid, half-built walls
# with open window frames you can shoot through); scaffolding (decks) along the north and south facades, climbed by
# stair towers at their ends; and the first-floor slab in the middle (a deck) reached only by the core stairs: the
# high ground over everything, and the most exposed place on the site.
def construction():
    G = Grid(68, 46)
    # Yard x 1-11: site gate (spawn) at the middle of the west fence, the cabin, stacked materials.
    G.rect(1, 1, 4, 5, '#'); G.rect(2, 2, 3, 4, '.'); G.g[5][3] = 'd'  # site cabin
    G.rect(1, 40, 4, 44, '#'); G.rect(2, 41, 3, 43, '.'); G.g[40][3] = 'd'  # tool store
    G.pts('c', [(7, 3), (8, 3), (9, 9), (6, 14), (7, 14), (9, 30), (6, 31), (7, 31), (8, 37), (9, 42), (6, 42)])
    G.pts('b', [(3, 11), (4, 11), (3, 34), (4, 34), (10, 18), (10, 27)])
    G.rect(6, 20, 8, 25, '#')  # skip
    # North scaffolding: deck rows 6-8 x 14-33, railing on its north edge (row 5), the facade wall (row 9) with open
    # window frames (rails) and two doorways down... (no: stairs only) ; stair tower at x 12-13 rows 6-8.
    G.hwall(5, 12, 33, ch='r')
    G.rect(14, 6, 33, 8, 'u')
    G.rect(11, 6, 13, 8, 's')
    G.hwall(9, 12, 33, ch='#')
    for x in (16, 17, 22, 23, 28, 29):
        G.g[9][x] = 'r'  # window frames: shoot down into the building from the scaffold
    G.rect(12, 9, 13, 9, '#')
    # South scaffolding: the mirror image across the building, rows 37-39.
    G.hwall(40, 12, 33, ch='r')
    G.rect(14, 37, 33, 39, 'u')
    G.rect(11, 37, 13, 39, 's')
    G.hwall(36, 12, 33, ch='#')
    for x in (16, 17, 22, 23, 28, 29):
        G.g[36][x] = 'r'
    G.rect(12, 36, 13, 36, '#')
    # Building ground floor x 12-33 rows 10-35: the west facade (row x 12) with door openings and window frames, a
    # column grid, half-built partitions, materials.
    G.vwall(12, 10, 35, doors=(14, 15, 22, 23, 30, 31))
    for y in (18, 19, 26, 27):
        G.g[y][12] = 'r'
    for x in (16, 21, 26):
        for y in (13, 18, 27, 32):
            G.pts('#', [(x, y)])
    G.vwall(19, 21, 24, ch='#'); G.vwall(30, 10, 14, doors=(12,)); G.vwall(30, 31, 35, doors=(33,))
    G.pts('c', [(14, 11), (15, 11), (24, 15), (18, 30), (23, 34), (28, 21), (28, 24), (14, 34)])
    G.pts('b', [(23, 22), (23, 23), (17, 25)])
    # First-floor slab (deck) x 25-33 rows 16-29 in the middle, edged with rails, climbed by the core stairs on its
    # north and south sides (x 31-33).
    G.rect(25, 16, 33, 29, 'u')
    G.hwall(15, 25, 33, ch='r'); G.hwall(30, 25, 33, ch='r'); G.vwall(24, 15, 30, ch='r')
    G.rect(31, 13, 33, 15, 's'); G.rect(31, 30, 33, 32, 's')
    G.rect(30, 13, 30, 15, '#'); G.rect(30, 30, 30, 32, '#')
    G.rect(31, 10, 33, 12, '.'); G.rect(31, 33, 33, 35, '.')
    # Columns carry on up through the slab: the only things on it that stop a bullet.
    G.pts('#', [(28, 19), (28, 26), (32, 22), (32, 23)])
    return G.rows((3, 22))


MAPS = (('OFFICE', office), ('SUPERMARKET', supermarket), ('METRO', metro), ('CONSTRUCTION', construction))

if __name__ == '__main__':
    show = sys.argv[sys.argv.index('--show') + 1].upper() if '--show' in sys.argv else None
    out = ['// Generated by tools/maps/build.py (H34). Do not edit by hand: change the builder and run it again.', '']
    for name, f in MAPS:
        rows = f()
        if show == name:
            print('   ' + ''.join(str(x % 10) for x in range(len(rows[0]))), file=sys.stderr)
            for y, r in enumerate(rows):
                print(f'{y:2d} {r}', file=sys.stderr)
        try:
            floor = check(name, rows)
        except AssertionError as e:
            if show: print(f'CHECK FAILED: {e}', file=sys.stderr); continue
            raise
        print(f'{name}: {len(rows[0])} x {len(rows)}, {floor} walkable tiles, all reachable', file=sys.stderr)
        out.append(f'export const {name} = [')
        out += [f"  '{r}'," for r in rows]
        out.append('];')
        out.append('')
    if '--write' in sys.argv:
        open('src/config/layouts.ts', 'w').write('\n'.join(out))
