// Grenades (owner 2026-10-14, docs/design/roster-grenades.md): a real sim projectile for every player, capacity by
// verified tier only (3 / 5 / 7 / 9 / 11 / 13), never from upgrades, decided by the server online.
import { describe, expect, it } from 'vitest';
import { createWorld, mitigate, player, stepWorld, IDLE_INPUT, type ActorInput, type World } from '../src/sim/world';
import { GRENADES, MAX_UPGRADES, TIERS, powerFor, powerForToken } from '../src/config/power';
import { TUNING } from '../src/config/tuning';
import { parseClientMsg, toActorInput } from '../src/net/protocol';
import { Lobby } from '../server/room';
import type { ServerMsg } from '../src/net/protocol';
import type { GameTicket } from '../api/_lib/game';

const G = TUNING.grenade;
const OPEN = ['####################', '#..................#', '#..................#', '#..................#', '#..................#', '#..................#', '####################'];
const solo = (map = OPEN, hero = 'benja'): World => createWorld({ map, hero, bots: [], zone: false });
const throwAt = (aim: number, dist?: number): ActorInput => ({ ...IDLE_INPUT, aim, grenade: true, throwDist: dist });
const steps = (w: World, n: number, inp: ActorInput = IDLE_INPUT) => { for (let i = 0; i < n; i++) stepWorld(w, inp); };
/** A versus world (two humans) so the blast rules can be checked on a chosen target. */
function pair(ff = false): World {
  return createWorld({ map: OPEN, zone: false, friendlyFire: ff, versus: [
    { name: 'A', hero: 'benja', team: 'alpha', x: 3.5, y: 3.5, facing: 0 },
    { name: 'B', hero: 'benja', team: 'bravo', x: 9.5, y: 3.5, facing: Math.PI },
    { name: 'C', hero: 'benja', team: 'alpha', x: 9.5, y: 1.5, facing: 0 },
  ] });
}

describe('capacity', () => {
  it('free 3, Common 5, Uncommon 7, Rare 9, Epic 11, Legendary and the 1:1s 13', () => {
    expect(TIERS.map((t) => GRENADES[t])).toEqual([3, 5, 7, 9, 11, 13]);
    for (const t of TIERS) expect(createWorld({ bots: [], power: powerFor(t) }).actors[0].grenades).toBe(GRENADES[t]);
    expect(createWorld({ bots: [], power: powerForToken(53, null, false) }).actors[0].maxGrenades).toBe(13);
  });
  it('upgrades never raise it: a fully upgraded free player still carries 3, a maxed Rare still 9', () => {
    expect(powerFor('free', MAX_UPGRADES).grenades).toBe(3);
    expect(powerFor('rare', MAX_UPGRADES).grenades).toBe(9);
    expect(createWorld({ bots: [], power: powerFor('free', MAX_UPGRADES) }).actors[0].grenades).toBe(3);
  });
  it('AI teammates carry the free 3; hostile bots carry TUNING.grenade.botCount', () => {
    const w = createWorld({ seed: 1, allies: [{ name: 'Toad', hero: 'toad' }, { name: 'Ray', hero: 'ray' }] });
    expect(w.actors.filter((a) => a.team === 'player').map((a) => a.grenades)).toEqual([3, 3, 3]);
    expect(w.actors.filter((a) => a.team === 'bot').every((a) => a.grenades === G.botCount)).toBe(true);
  });
  it('a new match restores the full count', () => {
    const w = solo();
    stepWorld(w, throwAt(0));
    expect(player(w).grenades).toBe(2);
    expect(solo().actors[0].grenades).toBe(3);
  });
});

describe('throwing', () => {
  it('a throw spends one, spawns a real grenade, and a second throw waits for the 1 s cooldown', () => {
    const w = solo(), p = player(w);
    p.x = 3.5; p.y = 3.5;
    stepWorld(w, throwAt(0));
    expect(p.grenades).toBe(2);
    expect(w.grenades).toHaveLength(1);
    stepWorld(w, throwAt(0));
    expect(p.grenades).toBe(2);
    steps(w, Math.ceil(G.throwCooldown * 60));
    stepWorld(w, throwAt(0));
    expect(p.grenades).toBe(1);
  });
  it('at zero nothing happens', () => {
    const w = solo(), p = player(w);
    p.grenades = 0;
    stepWorld(w, throwAt(0));
    expect(w.grenades).toHaveLength(0);
    expect(p.grenades).toBe(0);
  });
  it('downed, it cannot throw; inside Shell it cannot throw', () => {
    const w = createWorld({ map: OPEN, bots: [], zone: false, allies: [{ name: 'Toad', hero: 'toad' }] }), p = player(w);
    p.downed = true;
    p.downInfo = { cause: 'shot', killerId: -1, weapon: 'test', fromX: 0, fromY: 0, toX: 0, toY: 0, tick: 0 };
    stepWorld(w, throwAt(0));
    expect(w.grenades.filter((g) => g.owner === 0)).toHaveLength(0);
    p.downed = false;
    p.shieldLeft = 1;
    stepWorld(w, throwAt(0));
    expect(w.grenades.filter((g) => g.owner === 0)).toHaveLength(0);
    expect(p.grenades).toBe(3);
  });
  it('it rolls to rest at the chosen distance (clamped to 2..9 u) and explodes 1.4 s after the throw', () => {
    for (const [want, got] of [[5, 5], [8, 8], [30, G.maxThrow], [0.5, G.minThrow]] as const) {
      const w = solo(), p = player(w);
      p.x = 2.5; p.y = 3.5;
      stepWorld(w, throwAt(0, want));
      const g = w.grenades[0];
      steps(w, Math.round((G.fuseSeconds - 0.1) * 60));
      expect(Math.abs(g.x - (2.5 + got)), `throw ${want}`).toBeLessThan(0.6);
      expect(w.grenades).toHaveLength(1);
      steps(w, 8);
      expect(w.grenades).toHaveLength(0);
    }
  });
  it('a wall bounces it back (it never passes through); a crate does not stop it (lobbed over waist-high cover)', () => {
    const WALL = ['##########', '#........#', '#...#....#', '#........#', '##########'];
    const w = solo(WALL), p = player(w);
    p.x = 1.5; p.y = 2.5;
    stepWorld(w, throwAt(0, 8));
    const g = w.grenades[0];
    let bounced = false;
    for (let i = 0; i < 80 && g.alive; i++) { stepWorld(w, IDLE_INPUT); if (w.sounds.some((s) => s.type === 'bounce')) bounced = true; expect(g.x).toBeLessThan(4); }
    expect(bounced).toBe(true);
    const CRATE = ['##########', '#........#', '#...c....#', '#........#', '##########'];
    const c = solo(CRATE), q = player(c);
    q.x = 1.5; q.y = 2.5;
    stepWorld(c, throwAt(0, 6));
    const h = c.grenades[0];
    steps(c, 70);
    expect(h.x).toBeGreaterThan(5.5);
  });
});

describe('the blast', () => {
  const blastOn = (w: World, x: number, y: number) => {
    const a = w.actors[0];
    w.grenades.push({ id: 99, x, y, vx: 0, vy: 0, fuse: 0.001, owner: a.id, team: a.team, alive: true });
    stepWorld(w, (b) => ({ ...IDLE_INPUT, aim: b.facing }));
  };
  it('full damage at the centre falling to the edge value at the radius, none beyond; armour soaks per the armour rule', () => {
    for (const [d, raw] of [[0, G.damage], [G.radius / 2, (G.damage + G.edgeDamage) / 2], [G.radius - 0.01, G.edgeDamage]] as const) {
      const w = pair(), t = w.actors[1];
      const hp = t.hp, ar = t.armor;
      blastOn(w, t.x - d, t.y);
      const m = mitigate(ar, raw, G.armorPen);
      expect(hp - t.hp, `at ${d} u`).toBeCloseTo(m.hp, 0);
    }
    const far = pair(), t = far.actors[1], hp = t.hp;
    blastOn(far, t.x - G.radius - 0.2, t.y);
    expect(t.hp).toBe(hp);
  });
  it('a wall between the blast and you blocks it; a crate halves it', () => {
    const map = ['####################', '#..................#', '#.......#..........#', '#.......#..........#', '#.......c..........#', '####################'];
    const mk = () => createWorld({ map, zone: false, versus: [{ name: 'A', hero: 'benja', team: 'alpha', x: 2.5, y: 1.5, facing: 0 }, { name: 'B', hero: 'toad', team: 'bravo', x: 9.6, y: 2.5, facing: Math.PI }] });
    const w = mk(), t = w.actors[1], hp = t.hp;
    blastOn(w, 7.5, 2.5);
    expect(t.hp, 'behind the wall').toBe(hp);
    const open = mk(), u = open.actors[1];
    u.y = 1.5;
    const before = u.hp + u.armor;
    blastOn(open, 7.5, 1.5);
    const full = before - (u.hp + u.armor);
    const c = mk(), v = c.actors[1];
    v.y = 4.5;
    const b2 = v.hp + v.armor;
    blastOn(c, 7.5, 4.5);
    const half = b2 - (v.hp + v.armor);
    expect(full).toBeGreaterThan(0);
    expect(half / full).toBeCloseTo(G.coverMul, 1);
  });
  it('no friendly fire: a teammate in the ring is untouched, the thrower is not (own blast hurts)', () => {
    const w = pair(), me = w.actors[0], mate = w.actors[2];
    mate.x = me.x + 1; mate.y = me.y;
    const mateHp = mate.hp, meHp = me.hp;
    blastOn(w, me.x + 0.5, me.y);
    expect(mate.hp).toBe(mateHp);
    expect(me.hp).toBeLessThan(meHp);
    const ff = pair(true), m2 = ff.actors[2];
    m2.x = ff.actors[0].x + 1; m2.y = ff.actors[0].y;
    const h2 = m2.hp;
    blastOn(ff, ff.actors[0].x + 0.5, ff.actors[0].y);
    expect(m2.hp, 'friendly fire room').toBeLessThan(h2);
  });
  it('kills credit the thrower; a downed player caught in it is finished; Shell takes nothing', () => {
    const w = pair(), me = w.actors[0], t = w.actors[1];
    t.hp = 5; t.armor = 0;
    w.actors[2].alive = false; // no standing teammate of B anywhere: B goes straight out
    blastOn(w, t.x, t.y);
    expect(t.alive).toBe(false);
    expect(t.death?.weapon).toBe('Grenade');
    expect(me.kills).toBe(1);
    const d = createWorld({ map: OPEN, zone: false, versus: [
      { name: 'A', hero: 'benja', team: 'alpha', x: 3.5, y: 3.5, facing: 0 }, { name: 'B', hero: 'benja', team: 'bravo', x: 9.5, y: 3.5, facing: Math.PI },
      { name: 'D', hero: 'benja', team: 'bravo', x: 16.5, y: 3.5, facing: Math.PI }] });
    const db = d.actors[1];
    db.downed = true; db.hp = 30;
    blastOn(d, db.x, db.y);
    expect(db.alive, 'downed and blasted: out').toBe(false);
    const s = pair(), st = s.actors[1], shp = st.hp;
    st.shieldLeft = 1;
    blastOn(s, st.x, st.y);
    expect(st.hp).toBe(shp);
  });
  it('the blast is a hit event marked as a grenade, from the blast (not the thrower), and a loud sound', () => {
    const w = pair(), t = w.actors[1];
    blastOn(w, t.x - 1, t.y);
    const h = w.hits.find((x) => x.target === t.id)!;
    expect(h.grenade).toBe(true);
    expect([h.fromX, h.fromY]).toEqual([t.x - 1, t.y]);
    expect(w.sounds.find((s) => s.type === 'boom')?.radius).toBe(G.boomSound);
  });
});

describe('server authority', () => {
  it('the input message carries only "throw" and a distance; absurd distances fall back, a non-boolean is refused', () => {
    const base = { t: 'input', seq: 1, mx: 0, my: 0, aim: 0, fire: false, quiet: false, reload: false, ability: false };
    expect(toActorInput(parseClientMsg(JSON.stringify({ ...base, nade: true, nd: 7 })) as never)).toMatchObject({ grenade: true, throwDist: 7 });
    expect(toActorInput(parseClientMsg(JSON.stringify({ ...base, nade: true, nd: 1e9 })) as never).throwDist).toBeUndefined();
    expect(parseClientMsg(JSON.stringify({ ...base, nade: 'yes' }))).toBeNull();
    // Extra fields (a count, a capacity) are not part of the message and are dropped.
    const m = parseClientMsg(JSON.stringify({ ...base, nade: true, nd: 5, grenades: 99, maxNades: 99 })) as Record<string, unknown>;
    expect(Object.keys(m).sort()).toEqual(['ability', 'aim', 'fire', 'mx', 'my', 'nade', 'nd', 'quiet', 'reload', 'seq', 't']);
    // CF: a touch drag also sends the throw direction (na), normalised; it is the only other grenade field.
    const d = parseClientMsg(JSON.stringify({ ...base, nade: true, nd: 5, na: 7 })) as never;
    expect(toActorInput(d).throwAim).toBeCloseTo(Math.atan2(Math.sin(7), Math.cos(7)), 9);
    expect(parseClientMsg(JSON.stringify({ ...base, nade: true, na: 'left' }))).toBeNull();
  });
  it('online, capacity comes from the verified ticket; a throw is spent on the server and the snapshot shows it', async () => {
    class FakeConn {
      got: ServerMsg[] = [];
      send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); }
      close() { /* closed */ }
      last<T extends ServerMsg['t']>(t: T) { return [...this.got].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined; }
    }
    const T = (o: Partial<GameTicket>): GameTicket => ({ tid: Math.random().toString(36), acc: null, tier: 'free', up: { vitality: 8, plating: 8, firepower: 3, focus: 4 }, tok: null, mid: null, tokTier: null, own: null, holder: false, demo: false, name: '', exp: 2e9, ...o });
    const tickets: Record<string, GameTicket> = { 'l.t': T({ tier: 'legendary', holder: true, tok: 5, mid: 53, tokTier: 'legendary' }), 'f.t': T({}) };
    let now = 0;
    const lobby = new Lobby({ now: () => now, seed: () => 3, checkTicket: async (s) => tickets[s] ?? null });
    const join = async (name: string, ticket: string) => {
      const c = new FakeConn(), id = lobby.connect(c);
      lobby.message(id, JSON.stringify({ t: 'hello', v: 1, name, hero: 'benja', ticket }));
      await new Promise((r) => setTimeout(r, 0));
      return { c, say: (m: object) => lobby.message(id, JSON.stringify(m)) };
    };
    const a = await join('Holder', 'l.t'), b = await join('Free', 'f.t');
    // A private code: a 1:1 and a fresh free player are far apart in matchmaking strength (tests/sb-match.test.ts).
    a.say({ t: 'queue', mode: '1v1', code: 'NADES' }); b.say({ t: 'queue', mode: '1v1', code: 'NADES' });
    const room = [...lobby.rooms.values()][0];
    const run = (s: number) => { for (let i = 0; i < Math.round(s * 60); i++) { now += 1 / 60; lobby.tick(); } };
    run(5);
    const [ha, hb] = room.world.actors;
    expect([ha.maxGrenades, hb.maxGrenades]).toEqual([13, 3]); // the free ticket has maxed upgrades: still 3
    b.say({ t: 'input', seq: 1, mx: 0, my: 0, aim: Math.PI, fire: false, quiet: false, reload: false, ability: false, nade: true, nd: 4 });
    run(0.2);
    expect(hb.grenades).toBe(2);
    expect(b.c.last('snap')!.actors.find((x) => x.name === 'Free')?.nades).toBe(2);
    expect(b.c.last('snap')!.grenades?.length).toBe(1);
  });
});
