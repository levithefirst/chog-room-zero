# Draws the west half of a map with rectangles, mirrors it about the middle, checks reachability, prints the rows.
import sys
W, H = 64, 40
HALF = W // 2
def blank():
    g = [['.'] * HALF for _ in range(H)]
    for x in range(HALF): g[0][x] = g[H-1][x] = '#'
    for y in range(H): g[y][0] = '#'
    return g
def rect(g, x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= x < HALF: g[y][x] = ch
def hwall(g, y, x0, x1, doors=()):
    rect(g, x0, y, x1, y, '#')
    for d in doors: g[y][d] = 'd'
def vwall(g, x, y0, y1, doors=()):
    rect(g, x, y0, x, y1, '#')
    for d in doors: g[d][x] = 'd'
def pts(g, ch, ps):
    for x, y in ps: g[y][x] = ch
def mirror(g, spawn):
    rows = [''.join(r) + ''.join(reversed(r)) for r in g]
    x, y = spawn
    r = list(rows[y]); r[x] = 'P'; rows[y] = ''.join(r)
    return rows
def check(rows):
    from collections import deque
    sx = sy = None
    for y, r in enumerate(rows):
        if 'P' in r: sx, sy = r.index('P'), y
    walk = lambda c: c in '.dP'
    seen = {(sx, sy)}; q = deque([(sx, sy)])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
            n = (x+dx, y+dy)
            if 0 <= n[0] < W and 0 <= n[1] < H and n not in seen and walk(rows[n[1]][n[0]]):
                seen.add(n); q.append(n)
    floor = sum(1 for r in rows for c in r if walk(c))
    return floor, len(seen)

def office():
    g = blank()
    # Lobby (spawn hall) x 1-6, its wall x 7 with doors onto each corridor and the farms.
    vwall(g, 7, 1, 38, doors=(8, 9, 14, 19, 20, 25, 31, 32))
    pts(g, 'c', [(3, 10), (4, 10), (3, 29), (4, 29), (2, 4), (2, 35)])
    pts(g, 'b', [(5, 17), (5, 22)])
    # Executive offices along the north wall: rooms 6 wide, doors onto the north corridor.
    hwall(g, 7, 8, 31, doors=(11, 18, 25, 31))
    for x in (14, 21, 28): vwall(g, x, 1, 6)
    pts(g, 'c', [(10, 3), (17, 2), (24, 4), (30, 2), (12, 5), (19, 5)])
    # North corridor rows 8-9. Cubicle farm rows 10-17: low partitions (barriers) and desks (crates).
    for y in (12, 15):
        for x0 in (9, 13, 17): rect(g, x0, y, x0 + 2, y, 'b')
    pts(g, 'c', [(10, 11), (14, 11), (18, 11), (10, 16), (14, 16), (18, 16), (21, 13)])
    # Boardroom (the middle, 16 wide once mirrored): walls x 23, a long table with a gap in the middle.
    vwall(g, 23, 10, 17, doors=(13, 14))
    rect(g, 28, 13, 30, 14, 'c')
    pts(g, '#', [(25, 11), (25, 16)])
    hwall(g, 18, 8, 31, doors=(12, 19, 26, 27))
    # Main corridor rows 19-20, broken by pillars so no lane runs the whole floor.
    pts(g, '#', [(15, 19), (27, 20), (31, 19)])
    pts(g, 'c', [(20, 20), (10, 19)])
    hwall(g, 21, 8, 31, doors=(12, 19, 26, 27))
    # South farm rows 22-29 and the server room (pillars = racks) in the middle.
    for y in (24, 27):
        for x0 in (9, 13, 17): rect(g, x0, y, x0 + 2, y, 'b')
    pts(g, 'c', [(10, 23), (14, 23), (18, 23), (10, 28), (14, 28), (18, 28), (21, 26)])
    vwall(g, 23, 22, 29, doors=(25, 26))
    for x, y in ((25, 23), (28, 23), (25, 27), (28, 27), (31, 25)): rect(g, x, y, x, y + 1, '#')
    hwall(g, 30, 8, 31, doors=(12, 19, 26))
    # South corridor rows 31-32, then the break room (tables) and the storage with the kitchen in the middle.
    pts(g, 'c', [(16, 31), (29, 32)])
    hwall(g, 33, 8, 31, doors=(11, 18, 25, 31))
    vwall(g, 19, 34, 38)
    pts(g, 'c', [(10, 35), (11, 35), (14, 37), (15, 37), (22, 35), (25, 37), (28, 35)])
    pts(g, 'b', [(30, 36)])
    return mirror(g, (3, 20))

def supermarket():
    g = blank()
    # Entrance hall (spawn) x 1-6; the front wall x 7 opens wide at the checkouts.
    vwall(g, 7, 1, 38, doors=(5, 12, 13, 19, 20, 26, 27, 34))
    pts(g, 'c', [(3, 8), (3, 31), (5, 3), (5, 36)])
    # Checkout lanes x 8-11: counters (barriers) in short runs.
    for y0 in (10, 15, 23, 28):
        rect(g, 9, y0, 9, y0 + 2, 'b'); rect(g, 11, y0, 11, y0 + 2, 'b')
    # Freezer aisle along the north wall: cases as barriers, with the stockroom in the middle.
    hwall(g, 1, 8, 23)
    rect(g, 8, 1, 23, 1, '#')
    for x0 in (10, 15, 20): rect(g, x0, 3, x0 + 2, 3, 'b')
    vwall(g, 24, 1, 6, doors=(4,))
    hwall(g, 7, 24, 31, doors=(28,))
    pts(g, 'c', [(26, 3), (29, 3), (27, 5)])
    # The aisles: shelves (walls) running north-south, a cross aisle at rows 19-20 and gaps at rows 13 and 26.
    for x in (14, 17, 20, 23):
        for y0, y1 in ((9, 12), (14, 18), (21, 25), (27, 31)):
            vwall(g, x, y0, y1)
    pts(g, 'c', [(15, 10), (18, 16), (21, 22), (15, 29), (19, 28)])
    # Promo floor in the middle (x 25-38 once mirrored): display stands and a pillar pair.
    pts(g, 'c', [(27, 11), (28, 11), (26, 16), (30, 14), (27, 23), (30, 25), (26, 28), (28, 28)])
    rect(g, 31, 19, 31, 20, '#')
    pts(g, 'b', [(28, 19), (28, 20)])
    # Deli and bakery counters along the south: counters as barriers, back storage in the middle.
    hwall(g, 33, 8, 23, doors=(10, 16, 22))
    for x0 in (10, 16): rect(g, x0, 35, x0 + 3, 35, 'b')
    pts(g, 'c', [(12, 37), (19, 37), (21, 36)])
    vwall(g, 24, 33, 38, doors=(36,))
    hwall(g, 32, 24, 31, doors=(27,))
    pts(g, 'c', [(26, 34), (27, 34), (29, 36), (30, 36), (26, 37)])
    return mirror(g, (3, 20))

for name, f in (('OFFICE', office), ('SUPERMARKET', supermarket)):
    rows = f()
    floor, seen = check(rows)
    print(f'// {name}: {floor} floor tiles, {seen} reachable', file=sys.stderr)
    print(f'export const {name} = [')
    for r in rows: print(f"  '{r}',")
    print('];')
