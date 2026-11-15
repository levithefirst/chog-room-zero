# Impossible locations (owner 2026-11-15 HARD MODE + 5 IMPOSSIBLE LOCATIONS): five layouts that push one pillar each
# (vision, sound, range, footing, height) to an extreme. Same tiles, rules and checks as tools/maps/build.py (west
# half drawn, mirrored about the middle, closed, every floor tile reachable, decks only by stairs), written to
# src/config/layouts-impossible.ts. Usage: python3 tools/maps/impossible.py [--show name] [--write]
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from build import Grid, check, WALK  # noqa: E402


def measure(rows):
    """The library's numbers (src/library/mapdata.ts stats): longest wall-free row or column run, mean 4-way open line."""
    h, w = len(rows), len(rows[0])
    longest = 0
    for y in range(h):
        run = 0
        for x in range(w):
            run = 0 if rows[y][x] == '#' else run + 1
            longest = max(longest, run)
    for x in range(w):
        run = 0
        for y in range(h):
            run = 0 if rows[y][x] == '#' else run + 1
            longest = max(longest, run)
    s = n = 0
    for y in range(h):
        for x in range(w):
            if rows[y][x] not in WALK:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                d, cx, cy = 0, x + dx, y + dy
                while 0 <= cx < w and 0 <= cy < h and rows[cy][cx] != '#':
                    d += 1; cx += dx; cy += dy
                s += d; n += 1
    cnt = lambda ch: sum(r.count(ch) for r in rows)
    floor = sum(1 for r in rows for c in r if c in WALK)
    return dict(size=f'{w}x{h}', floor=floor, longest=longest, mean=round(s / n, 2), doors=cnt('d'),
                cover=cnt('c') + cnt('b'), decks=cnt('u'), stairs=cnt('s'), rails=cnt('r'))


# ---------------------------------------------------------------------------------------------------------------------
# ABYSS (84 x 56): a drowned archive in total darkness. A warren of cells three to five wide, every wall broken by
# doorways, crates in the gaps: no line runs more than a few metres, and every corner is an ambush. Four larger
# vaults (the only places a last circle fits) and a crooked spine down the middle. Floors of silt and ash: footsteps
# carry 60% as far, so you are on top of someone before you hear them. No light anywhere.
def abyss():
    G = Grid(84, 56)
    half = G.half  # 42
    # Cell grid: walls every 5 columns and every 5 rows (cells 4 x 4 inside), doorways in every wall segment.
    for x in range(5, half, 5):
        G.vwall(x, 1, 54)
    for y in range(5, 55, 5):
        G.hwall(y, 1, half - 1)
    # Doorways: one per wall segment (every third gets a second), offset so no two walls in a row line up: a doorway
    # never looks through the next one.
    for x in range(5, half, 5):
        for y0 in range(0, 55, 5):
            off = 1 + ((y0 // 5) * 3 + (x // 5) * 2) % 4
            G.g[min(y0 + off, 54)][x] = 'd'
            if ((x // 5) + (y0 // 5)) % 3 == 0:
                G.g[min(y0 + 5 - off, 54)][x] = 'd' if 5 - off != off else 'd'
    for y in range(5, 55, 5):
        for x0 in range(0, half, 5):
            off = 1 + ((x0 // 5) * 3 + (y // 5) * 2 + 1) % 4
            if x0 + off < half:
                G.g[y][x0 + off] = 'd'
            if ((x0 // 5) + (y // 5)) % 3 == 1 and x0 + 5 - off < half:
                G.g[y][x0 + 5 - off] = 'd'
    # Spawn hall (west, rows 24-31, x 1-4) opened up.
    G.rect(1, 21, 4, 34, '.')
    G.vwall(5, 21, 34, doors=(23, 27, 28, 32))
    # Vaults: four larger rooms where walls are dropped (zone centres sit in the two middle ones).
    G.rect(16, 6, 24, 14, '.')          # north vault
    G.rect(16, 41, 24, 49, '.')         # south vault
    G.rect(36, 21, 41, 34, '.')         # the crypt (middle, joins its mirror)
    G.rect(26, 26, 34, 29, '.')         # the spine into the crypt
    # Ring the vaults with walls again, keeping doorways.
    G.hwall(5, 15, 25, doors=(17, 23)); G.hwall(15, 15, 25, doors=(18, 22))
    G.vwall(15, 5, 15, doors=(8, 12)); G.vwall(25, 5, 15, doors=(9, 13))
    G.hwall(40, 15, 25, doors=(18, 22)); G.hwall(50, 15, 25, doors=(17, 23))
    G.vwall(15, 40, 50, doors=(43, 47)); G.vwall(25, 40, 50, doors=(42, 46))
    G.hwall(20, 35, 41, doors=(37, 40)); G.hwall(35, 35, 41, doors=(37, 40))
    G.vwall(35, 20, 35, doors=(23, 27, 28, 32))
    G.hwall(25, 26, 34, doors=(28, 32)); G.hwall(30, 26, 34, doors=(28, 32))
    G.vwall(25, 25, 30, doors=(27, 28))
    # Shelving and rubble: crates and barriers that block the gaps inside cells (cover, never sight).
    G.pts('c', [(2, 2), (8, 3), (12, 7), (18, 2), (27, 3), (33, 8), (38, 2), (7, 12), (22, 17), (13, 18), (31, 13),
                (39, 12), (2, 17), (9, 22), (19, 23), (29, 18), (12, 33), (21, 32), (31, 36), (39, 38), (3, 38),
                (8, 43), (28, 42), (33, 47), (38, 52), (12, 52), (22, 53), (2, 51), (18, 8), (22, 12), (18, 44),
                (22, 48), (38, 24), (38, 31), (30, 27), (17, 37), (7, 28), (27, 22), (27, 33), (11, 47)])
    G.pts('b', [(3, 7), (11, 12), (24, 22), (14, 27), (34, 17), (3, 46), (24, 33), (13, 41), (34, 41), (8, 17),
                (29, 7), (29, 48), (20, 10), (20, 45), (39, 27), (39, 28)])
    return G.rows((2, 27))


# ---------------------------------------------------------------------------------------------------------------------
# ECHO LABYRINTH (80 x 52): a cistern of long stone galleries stacked over each other. Four east-west corridors, two
# wide, run the length of the map and are joined only by single doorways (the chokepoints). Over each corridor runs a
# gallery (deck) behind a rail, climbed by short stair runs at the ends and the middle: you look and shoot down into
# the corridor, they hear you coming the whole way. Everything echoes: a run on any floor here carries 190% as far.
def echo():
    G = Grid(80, 52)
    half = G.half  # 40
    G.rect(1, 1, half - 1, 50, '#')
    # Four bands, each a two-wide corridor beside a rail and a two-wide gallery (deck) over it. Top two bands:
    # corridor, rail, gallery (top to bottom); bottom two: gallery, rail, corridor. Rows: (corridor y, rail y, deck y).
    bands = [(3, 5, 6), (13, 15, 16), (37, 36, 34), (47, 46, 44)]
    for cy, ry, dy in bands:
        G.rect(3, cy, half - 1, cy + 1, '.')
        G.rect(9, ry, half - 1, ry, 'r')
        G.rect(9, dy, half - 1, dy + 1, 'u')
        G.rect(7, ry, 8, ry, 's'); G.rect(7, dy, 8, dy + 1, 's')   # west stair tower up to the gallery
        G.rect(26, ry, 27, ry, 's')                                 # mid stair: a gap in the rail
        G.g[ry][38] = 's'; G.g[ry][11] = 's'                        # and singles by the middle and the west end
        G.rect(22, ry, 23, ry, 's'); G.rect(29, ry, 30, ry, 's')    # more gaps: the gallery is never far
    # The middle hall (the main echo lane), rows 22-29, with pillars.
    G.rect(7, 22, half - 1, 29, '.')
    G.pts('#', [(13, 22), (13, 29), (19, 25), (19, 26), (25, 22), (25, 29), (31, 25), (31, 26), (37, 22), (37, 29)])
    # Spawn hall x 1-5 rows 20-31; its wall (x 6) opens on the middle hall by two doorways.
    G.rect(1, 20, 5, 31, '.')
    G.vwall(6, 20, 31, doors=(23, 28))
    G.rect(6, 22, 6, 22, '#'); G.rect(6, 29, 6, 29, '#')
    # Stubs from the spawn hall up to band 2 and down to band 3 (x 2-3), and from band 2 to band 1, band 3 to band 4.
    G.rect(2, 15, 3, 19, '.'); G.g[19][2] = 'd'; G.g[19][3] = 'd'
    G.rect(2, 32, 3, 36, '.'); G.g[32][2] = 'd'; G.g[32][3] = 'd'
    G.rect(1, 5, 1, 12, '.'); G.g[5][1] = 'd'; G.g[12][1] = 'd'
    G.rect(1, 39, 1, 46, '.'); G.g[39][1] = 'd'; G.g[46][1] = 'd'
    G.rect(1, 3, 2, 4, '.'); G.rect(1, 13, 2, 14, '.'); G.rect(1, 37, 2, 38, '.'); G.rect(1, 47, 2, 48, '.')
    # Shafts: one-wide doglegs through the rock between bands (the chokepoints), walled where they pass a gallery.
    def shaft(x, y0, y1, decks):
        G.rect(x, y0, x, y1, '.')
        G.g[y0][x] = 'd'; G.g[y1][x] = 'd'
        for dy in decks:
            G.g[dy][x - 1] = '#'; G.g[dy][x + 1] = '#'
    shaft(14, 5, 12, (6, 7)); shaft(32, 5, 12, (6, 7))            # band 1 -> band 2
    shaft(20, 15, 21, (16, 17)); shaft(35, 15, 21, (16, 17))      # band 2 -> middle hall
    shaft(20, 30, 36, (34, 35)); shaft(35, 30, 36, (34, 35))      # middle hall -> band 3
    shaft(14, 39, 46, (44, 45)); shaft(32, 39, 46, (44, 45))      # band 3 -> band 4
    # Rubble: crates and barriers in the corridors and the hall (never on a gallery).
    G.pts('c', [(11, 3), (23, 4), (36, 3), (9, 13), (29, 14), (11, 37), (23, 38), (36, 37), (9, 48), (29, 47),
                (10, 24), (16, 27), (22, 23), (28, 28), (34, 24), (17, 4), (17, 47)])
    G.pts('b', [(29, 3), (29, 48), (17, 13), (17, 38), (36, 14), (36, 37), (9, 27), (22, 28), (28, 23), (34, 27),
                (4, 21), (4, 30)])
    return G.rows((3, 25))


# ---------------------------------------------------------------------------------------------------------------------
# KILLING FIELD (112 x 60): a floodlit freight yard. Open ground end to end (the longest straight lines in the game),
# a few container stacks and sandbag rings, and watchtowers (decks) everywhere: every tower sees over every sandbag.
# Long earth berms (walls) cut the yard into three wide lanes so the average line is still about 20 m, not 40.
def field():
    G = Grid(112, 60)
    half = G.half  # 56
    # Berms: long walls with wide gaps, rows 15 and 44 (west half), broken.
    for x0, x1 in ((8, 18), (24, 34), (40, 50)):
        G.hwall(15, x0, x1); G.hwall(44, x0, x1)
    for x0, x1 in ((14, 22), (30, 42)):
        G.hwall(29, x0, x1, doors=())
    # Container stacks: short wall blocks (sight blockers) scattered in the lanes.
    for x, y in ((12, 6), (28, 9), (44, 5), (20, 21), (36, 23), (50, 20), (12, 36), (28, 37), (46, 36),
                 (20, 50), (36, 52), (16, 57)):
        G.rect(x, y, x + 3, y + 1, '#')
    # Spawn bunker x 1-5, rows 25-34: walls with doorways (a doorway is still floor: the field's few doors).
    G.vwall(6, 24, 35, doors=(26, 29, 30, 33))
    G.hwall(24, 1, 6, doors=(3,)); G.hwall(35, 1, 6, doors=(3,))
    # Watchtowers: 3 x 3 decks ringed by rails, one stair (2 long) on one side.
    def tower(x, y, side):
        G.rect(x - 1, y - 1, x + 3, y + 3, 'r')
        G.rect(x, y, x + 2, y + 2, 'u')
        if side == 's':
            G.rect(x + 1, y + 3, x + 1, y + 4, 's')
        elif side == 'n':
            G.rect(x + 1, y - 2, x + 1, y - 1, 's')
        elif side == 'e':
            G.rect(x + 3, y + 1, x + 4, y + 1, 's')
        else:
            G.rect(x - 2, y + 1, x - 1, y + 1, 's')
    for x, y, s in ((9, 9, 's'), (24, 3, 's'), (40, 10, 'e'), (16, 24, 'n'), (32, 16, 's'), (46, 26, 'w'),
                    (24, 31, 's'), (9, 48, 'n'), (24, 52, 'n'), (40, 47, 'e'), (32, 40, 'n'), (51, 4, 's'), (51, 52, 'n')):
        tower(x, y, s)
    # Sandbag rings and the odd crate: the only half cover in the open.
    for x, y in ((18, 12), (34, 6), (48, 14), (12, 20), (28, 26), (42, 31), (18, 40), (34, 46), (48, 42), (12, 55),
                 (54, 29), (54, 30), (38, 19), (38, 39)):
        G.pts('b', [(x, y), (x + 1, y)])
    G.pts('c', [(22, 18), (30, 33), (44, 23), (14, 44), (26, 47), (52, 37), (6, 12), (6, 47), (36, 2), (36, 57),
                (20, 33), (44, 55)])
    return G.rows((3, 29))


# ---------------------------------------------------------------------------------------------------------------------
# FLOODED (76 x 48): a pumping station under a foot of water. Every floor is wet: a footstep carries 160% as far,
# a creep is a walk anywhere else. Narrow walkways between the pump bays and settling tanks (deep water you see and
# shoot across but cannot wade: rails), a flooded hall in the middle, and one low gantry (the only high ground).
def flooded():
    G = Grid(80, 50)
    half = G.half  # 40
    G.rect(1, 1, half - 1, 48, '#')
    # Spawn chamber x 1-6 rows 19-30.
    G.rect(1, 19, 6, 30, '.')
    # Walkways: east-west two wide (rows 3, 13, 35, 45), the flooded hall across the middle (rows 21-28); north-south
    # two wide at x 9, 19, 29 and the four-wide centre channel (x 38-39 and its twin).
    for y, hgt in ((3, 2), (13, 2), (21, 8), (35, 2), (45, 2)):
        G.rect(7, y, half - 1, y + hgt - 1, '.')
    for x, wd in ((9, 2), (19, 2), (29, 2), (38, 2)):
        G.rect(x, 3, x + wd - 1, 46, '.')
    # Settling tanks between the walkways: deep water at the edge (rails: see and shoot across, never wade), pump
    # housings inside (walls), so a line across a tank is a short one.
    for x0, x1 in ((11, 18), (21, 28), (31, 37)):
        for y0, y1 in ((5, 12), (15, 20), (29, 34), (37, 44)):
            G.rect(x0, y0, x1, y1, 'r')
            G.rect(x0 + 2, y0 + 2, x1 - 2, y1 - 2, '#')
    # Spawn chamber wall (x 7-8) with sluice doors onto the hall, and stubs to the north and south walkways.
    G.rect(7, 19, 8, 30, '#')
    for y in (21, 24, 25, 28):
        G.g[y][7] = 'd'; G.g[y][8] = '.'
    G.rect(3, 3, 6, 4, '.'); G.rect(3, 5, 4, 18, '.'); G.g[18][3] = 'd'; G.g[18][4] = 'd'
    G.rect(3, 45, 6, 46, '.'); G.rect(3, 31, 4, 44, '.'); G.g[31][3] = 'd'; G.g[31][4] = 'd'
    # The pump-room gantry: a low deck in the flooded hall (rails round it), two short stairs: the only high ground.
    G.rect(22, 22, 28, 27, 'r')
    G.rect(23, 23, 27, 26, 'u')
    G.g[24][22] = 's'; G.g[25][22] = 's'
    # Pump housings across the walkways, staggered lane by lane: every walkway is a dogleg, never a firing lane.
    for y in (3, 13, 35, 45):
        for x in (12, 24, 34):
            G.g[y][x] = '#'
        for x in (16, 27, 37):
            G.g[y + 1][x] = '#'
    for x in (9, 19, 29):
        for y in (7, 17, 32, 42):
            G.g[y][x] = '#'
        for y in (10, 38):
            G.g[y][x + 1] = '#'
    G.pts('#', [(12, 21), (12, 28), (18, 24), (18, 25), (33, 22), (33, 27), (37, 24), (37, 25)])
    # Sluice frames (doorways) along the walkways and machinery (crates, barriers) in them.
    for x, y in ((14, 3), (25, 4), (14, 46), (25, 45), (9, 8), (19, 9), (29, 8), (9, 41), (19, 40), (29, 41),
                 (14, 13), (34, 14), (14, 36), (34, 35), (10, 18), (20, 32), (30, 17), (39, 10), (39, 39)):
        G.g[y][x] = 'd'
    G.pts('c', [(10, 16), (20, 26), (30, 31), (10, 33), (20, 17), (13, 23), (33, 26), (17, 4), (33, 3), (17, 45),
                (33, 46), (12, 14), (24, 13), (12, 35), (24, 36), (38, 18), (39, 31), (16, 27)])
    G.pts('b', [(19, 37), (29, 12), (15, 21), (15, 28), (35, 21), (35, 28),
                (36, 13), (36, 36), (30, 23), (30, 26)])
    return G.rows((3, 24))


# ---------------------------------------------------------------------------------------------------------------------
# VERTIGO (72 x 52): a tower frame opened up. Most of the floor is scaffold (deck): two long decks along each facade
# with a ground lane between them, and the crown over the middle. Every way up is a five-step stair run, slower than
# anywhere else (45% speed). On the ground only the yard, the lanes under the scaffolds and the core floor: you are
# seen and shot from above wherever you walk. Drawn as the top half, mirrored north-south as well as east-west.
def vertigo():
    G = Grid(72, 52)
    G.rect(9, 1, 35, 25, '#')
    G.rect(11, 1, 35, 4, 'u'); G.hwall(5, 11, 35, ch='r')        # D1: the facade deck
    G.rect(11, 6, 35, 9, '.')                                      # G1: the lane under it
    G.hwall(10, 11, 35, ch='r')
    G.rect(11, 11, 35, 14, 'u'); G.hwall(15, 11, 35, ch='r')       # D2: the second deck
    G.rect(11, 16, 35, 25, '.')                                    # the core floor
    G.hwall(20, 23, 35, ch='r'); G.vwall(23, 20, 25, ch='r')       # the crown's rail
    G.rect(24, 21, 35, 25, 'u')                                    # the crown
    # The yard wall (x 9-10): a doorway into the lane and two into the core.
    G.rect(9, 7, 10, 8, '.'); G.g[7][9] = 'd'; G.g[8][9] = 'd'
    G.rect(9, 23, 10, 25, '.'); G.g[23][9] = 'd'; G.g[24][9] = 'd'; G.g[25][9] = 'd'
    # Five-step stair runs.
    G.rect(6, 2, 10, 3, 's')       # yard -> D1
    G.rect(16, 5, 17, 9, 's')      # lane -> D1
    G.rect(28, 6, 29, 10, 's')     # lane -> D2
    G.rect(19, 15, 20, 19, 's')    # core -> D2
    G.rect(29, 16, 30, 20, 's')    # core -> crown
    # Columns on the decks (the only cover up there) and on the crown.
    G.pts('#', [(21, 2), (31, 3), (15, 12), (25, 13), (33, 12), (30, 23)])
    # Ground cover: crates and barriers in the lane, the core and the yard.
    G.pts('c', [(13, 7), (22, 8), (33, 7), (13, 18), (25, 17), (34, 18), (15, 22), (19, 24), (5, 8), (3, 15), (7, 20)])
    G.pts('b', [(20, 6), (26, 9), (12, 21), (17, 25), (2, 6), (6, 12), (2, 23)])
    G.rect(2, 9, 4, 12, '#'); G.rect(3, 10, 3, 11, '.'); G.g[12][3] = 'd'   # site hut
    for y in range(26, 51):
        G.g[y] = list(G.g[51 - y])
    return G.rows((4, 25))


MAPS = (('ABYSS', abyss), ('ECHO', echo), ('FIELD', field), ('FLOODED', flooded), ('VERTIGO', vertigo))

if __name__ == '__main__':
    show = sys.argv[sys.argv.index('--show') + 1].upper() if '--show' in sys.argv else None
    out = ['// Generated by tools/maps/impossible.py (Impossible locations). Do not edit by hand: change the builder and run it again.', '']
    ok = True
    for name, f in MAPS:
        rows = f()
        if show == name:
            print('   ' + ''.join(str(x % 10) for x in range(len(rows[0]))), file=sys.stderr)
            for y, r in enumerate(rows):
                print(f'{y:2d} {r}', file=sys.stderr)
        try:
            check(name, rows)
        except AssertionError as e:
            print(f'{name}: CHECK FAILED: {e}', file=sys.stderr); ok = False; continue
        print(name, measure(rows), file=sys.stderr)
        out.append(f'export const {name} = [')
        out += [f"  '{r}'," for r in rows]
        out.append('];')
        out.append('')
    if '--write' in sys.argv and ok:
        open('src/config/layouts-impossible.ts', 'w').write('\n'.join(out))
