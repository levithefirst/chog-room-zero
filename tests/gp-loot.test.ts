// GP kill loot (owner 2026-10-17): an eliminated actor drops what it carried; the killer or anyone else can take it;
// nothing is created or duplicated; the sim (the server online) decides it all. src/sim/world.ts Loot, stepLoot.
import { describe, expect, it } from 'vitest';
import { ammoCeiling, createWorld, down, lootTake, player, stepWorld, IDLE_INPUT, type Actor, type Loot, type World } from '../src/sim/world';
import { TUNING } from '../src/config/tuning';
import { Lobby } from '../server/room';
import type { ServerMsg } from '../src/net/protocol';
import { PROTOCOL } from '../src/net/protocol';

const L = TUNING.loot;
const STEP = TUNING.simStepSeconds;
const OPEN = ['##############################', ...Array.from({ length: 12 }, () => '#........................#...#'), '##############################'];
const kill = (w: World, t: Actor, by = 0) => down(w, t, { cause: 'shot', killerId: by, weapon: 'test', fromX: 0, fromY: 0, toX: t.x, toY: t.y, tick: w.tick });
/** Solo world, the player at (x, y), two hostiles to kill (one stays shut in the pocket so the match is on). */
function scene(px = 5, py = 6.5) {
  const w = createWorld({ map: OPEN, hero: 'benja', bots: [{ name: 'V', hero: 'tonashiro', patrol: [[12, 6]], flanker: false }, { name: 'Q', hero: 'benja', patrol: [[27, 6]], flanker: false }], zone: false });
  const p = player(w);
  p.x = px; p.y = py;
  return { w, p, v: w.actors[1] };
}
const idle = (w: World, n: number) => { for (let i = 0; i < n; i++) stepWorld(w, IDLE_INPUT, undefined, () => IDLE_INPUT); };

describe('a kill drops what the fallen carried', () => {
  it('the bag holds its rounds (as its own magazines), grenades, armour left and the dressing; the body keeps nothing', () => {
    const { w, v } = scene();
    v.ammo = 3; v.reserve = 12; v.grenades = 2; v.armor = 17.6;
    kill(w, v);
    expect(w.loot).toHaveLength(1);
    const l = w.loot[0];
    expect(l.mags).toBeCloseTo(15 / v.weapon.magazine, 9);
    expect(l.grenades).toBe(2);
    expect(l.armor).toBe(17);
    expect(l.health).toBe(L.dressing);
    expect([l.x, l.y]).toEqual([v.x, v.y]);
    expect(l.known.sort()).toEqual(['bot', 'player']);
    expect([v.ammo, v.reserve, v.grenades, v.armor]).toEqual([0, 0, 0, 0]);
  });
  it('the killer walks over it and takes what it needs, converted to its own gun; the rest stays for someone else', () => {
    const { w, p, v } = scene();
    v.ammo = v.weapon.magazine; v.reserve = v.weapon.magazine * 3; v.grenades = 2; v.armor = 0;
    kill(w, v);
    const l = w.loot[0];
    const mags = l.mags;
    p.reserve = 0; p.grenades = p.maxGrenades - 1; p.hp = p.maxHp - 5;
    p.x = l.x; p.y = l.y;
    idle(w, 1);
    // Ammo: whole rounds of the taker's gun, never more than its ceiling or the bag's share.
    const took = p.reserve;
    expect(took).toBe(Math.min(Math.floor(mags * p.weapon.magazine), ammoCeiling(p)));
    expect(p.grenades).toBe(p.maxGrenades);
    expect(p.hp).toBe(p.maxHp);
    const left = w.loot.find((x) => x.id === l.id);
    // One grenade and 10 health remain (the player could only use one and 5).
    expect(left?.grenades).toBe(1);
    expect(left?.health).toBe(L.dressing - 5);
    expect(left!.mags).toBeCloseTo(Math.max(0, mags - took / p.weapon.magazine), 9);
  });
  it('nothing is ever created: over a whole default match, everything taken from bags <= everything dropped', () => {
    for (const seed of [1, 2, 3, 4]) {
      const w = createWorld({ seed, hero: 'benja', zone: true, allies: [{ name: 'A', hero: 'toad' }, { name: 'B', hero: 'ray' }] });
      let dropped = 0, taken = 0;
      const ids = new Set<number>();
      const before = new Map<number, Loot>();
      for (let i = 0; i < 90 * 60 && w.outcome === 'playing'; i++) {
        stepWorld(w, { ...IDLE_INPUT });
        for (const l of w.loot) if (!ids.has(l.id)) { ids.add(l.id); dropped += l.mags + l.health + l.armor + l.grenades; before.set(l.id, { ...l }); }
        for (const [id, b] of before) {
          const now = w.loot.find((x) => x.id === id);
          const cur = now ? now.mags + now.health + now.armor + now.grenades : (b.left <= 1 / 60 ? b.mags + b.health + b.armor + b.grenades : 0);
          taken += b.mags + b.health + b.armor + b.grenades - cur;
          if (now) before.set(id, { ...now }); else before.delete(id);
        }
      }
      expect(taken).toBeLessThanOrEqual(dropped + 1e-6);
    }
  }, 60000); // four whole matches: about 3 s alone, longer when the browser suites share the cores
});

describe('who takes it, and when not', () => {
  it('two takers at once: the nearer takes first, the other gets only what is left; never the same item twice', () => {
    const w = createWorld({ map: OPEN, hero: 'benja', zone: false, versus: [
      { name: 'A', hero: 'benja', team: 'alpha', x: 10, y: 6.5, facing: 0 }, { name: 'B', hero: 'benja', team: 'alpha', x: 10.3, y: 6.5, facing: 0 },
      { name: 'V', hero: 'benja', team: 'bravo', x: 10.2, y: 6.5, facing: 0 }, { name: 'K', hero: 'benja', team: 'bravo', x: 25, y: 2, facing: 0 }] });
    const [a, b, v] = w.actors;
    v.grenades = 1; v.ammo = 0; v.reserve = 0; v.armor = 0;
    kill(w, v, 0);
    for (const x of [a, b]) { x.grenades = 0; x.hp = x.maxHp; x.reserve = ammoCeiling(x); }
    idle(w, 3);
    // Only one grenade existed: exactly one of them has it (the nearer, B at 0.1 u).
    expect(a.grenades + b.grenades).toBe(1);
    expect(b.grenades).toBe(1);
  });
  it('a downed actor cannot take loot; nor can anyone once it has expired', () => {
    const w = createWorld({ map: OPEN, hero: 'benja', zone: false, allies: [{ name: 'M', hero: 'toad' }],
      bots: [{ name: 'V', hero: 'benja', patrol: [[12, 6]], flanker: false }, { name: 'Q', hero: 'benja', patrol: [[27, 6]], flanker: false }] });
    const p = player(w), m = w.actors[1], v = w.actors[2];
    v.grenades = 2;
    kill(w, v);
    const l = w.loot[0];
    // A teammate stands far off (so you stay downed); it is told to stay put.
    m.x = 22; m.y = 11.5;
    const hold = (a: Actor) => (a.id === m.id ? { ...IDLE_INPUT } : null);
    p.x = l.x; p.y = l.y; p.grenades = 0; p.downed = true; p.hp = 50;
    p.downInfo = { cause: 'shot', killerId: 3, weapon: 'test', fromX: 0, fromY: 0, toX: p.x, toY: p.y, tick: w.tick };
    for (let i = 0; i < 30; i++) stepWorld(w, IDLE_INPUT, undefined, hold);
    expect(p.alive && p.downed).toBe(true);
    expect(p.grenades).toBe(0);
    p.downed = false; p.hp = p.maxHp; p.downInfo = null;
    p.x = 20; p.y = 2;
    for (let i = 0; i < Math.ceil(L.seconds / STEP) + 2; i++) stepWorld(w, IDLE_INPUT, undefined, hold);
    expect(w.loot).toHaveLength(0);
    p.x = l.x; p.y = l.y;
    for (let i = 0; i < 2; i++) stepWorld(w, IDLE_INPUT, undefined, hold);
    expect(p.alive).toBe(true);
    expect(p.grenades).toBe(0);
  });
  it('not through a wall: a bag on the far side of a wall is never taken by someone pressed against it', () => {
    const WALL = ['##############################', '#.............#..............#', '#.............#..............#', '#.............#..............#', '##############################'];
    const w = createWorld({ map: WALL, hero: 'benja', zone: false, bots: [{ name: 'V', hero: 'benja', patrol: [[15, 2]], flanker: false }, { name: 'Q', hero: 'benja', patrol: [[25, 2]], flanker: false }] });
    const p = player(w), v = w.actors[1];
    v.x = 15.36; v.y = 2.5; v.grenades = 2;
    kill(w, v);
    p.x = 13.5; p.y = 2.5; p.grenades = 0;
    for (let i = 0; i < 120; i++) stepWorld(w, { ...IDLE_INPUT, moveX: 1 }, undefined, () => IDLE_INPUT);
    expect(p.x).toBeLessThan(14);
    expect(p.grenades).toBe(0);
    expect(w.loot).toHaveLength(1);
  });
  it('lootTake never offers more than the bag or the taker can hold', () => {
    const { w, p, v } = scene();
    v.ammo = 1; v.reserve = 0; v.grenades = 0; v.armor = 3;
    kill(w, v);
    const l = w.loot[0];
    p.reserve = ammoCeiling(p); p.armor = p.maxArmor; p.hp = p.maxHp;
    expect(lootTake(p, l)).toBeNull();
    p.hp = 1;
    expect(lootTake(p, l)!.health).toBe(L.dressing);
  });
});

describe('AI teammates and loot', () => {
  it('an AI teammate low on ammo walks to a bag its team knows about and takes it; one at full kit leaves it', () => {
    const w = createWorld({ map: OPEN, hero: 'benja', zone: false, allies: [{ name: 'M', hero: 'toad' }, { name: 'F', hero: 'benja' }],
      bots: [{ name: 'V', hero: 'tonashiro', patrol: [[12, 6]], flanker: false }, { name: 'Q', hero: 'benja', patrol: [[27, 6]], flanker: false }] });
    const p = player(w), m = w.actors[1], f = w.actors[2], v = w.actors[3];
    p.x = 6; p.y = 6.5; m.x = 6; m.y = 8.5; f.x = 6; f.y = 4.5;
    v.x = 10; v.y = 6.5; v.ammo = v.weapon.magazine; v.reserve = v.weapon.magazine * 3;
    kill(w, v, 0);
    m.reserve = 0; m.ammo = 2;
    f.reserve = ammoCeiling(f); f.hp = f.maxHp;
    const fBefore = { reserve: f.reserve, hp: f.hp };
    for (let i = 0; i < 6 * 60; i++) stepWorld(w, IDLE_INPUT);
    expect(m.reserve).toBeGreaterThan(0);
    expect(f.reserve).toBe(fBefore.reserve);
  });
  it('no wallhack: a bag its team never saw (an unseen zone death far away) is not gone for', () => {
    const w = createWorld({ map: OPEN, hero: 'benja', zone: false, allies: [{ name: 'M', hero: 'toad' }],
      bots: [{ name: 'V', hero: 'benja', patrol: [[27, 3]], flanker: false }, { name: 'Q', hero: 'benja', patrol: [[27, 9]], flanker: false }] });
    const p = player(w), m = w.actors[1], v = w.actors[2];
    p.x = 4; p.y = 6.5; m.x = 4; m.y = 8.5;
    // A bag in the open, out of everyone's light, from a death nobody on your side saw (killerId -1: the zone).
    v.x = 15; v.y = 2.5;
    down(w, v, { cause: 'zone', killerId: -1, weapon: 'Danger zone', fromX: v.x, fromY: v.y, toX: v.x, toY: v.y, tick: w.tick });
    expect(w.loot[0].known).toEqual(['bot']);
    m.reserve = 0;
    for (let i = 0; i < 60; i++) { stepWorld(w, { ...IDLE_INPUT, aim: Math.PI }); expect(w.brains.get(m.id)!.supply?.kind === 'loot').toBe(false); }
  });
});

describe('online (server-authoritative)', () => {
  const conn = () => ({ got: [] as ServerMsg[], send(m: ServerMsg) { this.got.push(m); }, close() { /* closed */ } });
  const lastSnap = (c: ReturnType<typeof conn>) => [...c.got].reverse().find((m) => m.t === 'snap') as Extract<ServerMsg, { t: 'snap' }> | undefined;
  function match(mode: '1v1' | '3v3', priv = false) {
    let t = 0;
    const lobby = new Lobby({ now: () => t, seed: () => 5, countdownSec: 0, idleTimeoutSec: 999, reconnectGraceSec: 20 });
    const n = mode === '1v1' ? 2 : 6;
    const cs = Array.from({ length: n }, () => conn());
    const ids = cs.map((c, i) => { const id = lobby.connect(c); lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: `P${i}`, hero: 'benja' })); return id; });
    ids.forEach((id) => lobby.message(id, JSON.stringify({ t: 'queue', mode, ...(priv ? { code: 'GPLOOT7' } : {}) })));
    const room = [...lobby.rooms.values()][0] as unknown as { world: World; members: { id: number }[] } | undefined;
    const step = (s: number) => { for (let i = 0; i < Math.round(s / STEP); i++) { t += STEP; lobby.tick(); } };
    return { lobby, cs, ids, room, step };
  }
  it('a kill drops a bag the server decides; snapshots show it (what kinds, how long) to the teams that know it, never its contents', () => {
    const { cs, room, step } = match('3v3');
    const w = room!.world;
    step(0.1);
    const v = w.actors[1];
    v.grenades = 2;
    const perk = v.perk;
    expect(perk).not.toBeNull(); // V2: every online player starts with a perk
    kill(w, v, 0);
    step(0.1);
    const mine = lastSnap(cs[0])!.lt!;
    expect(mine).toHaveLength(1);
    expect(mine[0].k & 8).toBe(8);
    expect(mine[0].k & 1).toBe(1);
    // Kinds and the perk's name (the label), never amounts.
    expect(Object.keys(mine[0]).sort()).toEqual(['id', 'k', 'left', 'p', 'x', 'y']);
    expect(mine[0].p).toBe(perk);
    // The dropper's team knows it too (it is their teammate's body).
    const mateOfV = room!.members.findIndex((_, i) => w.actors[i].team === v.team && i !== v.id);
    expect(lastSnap(cs[mateOfV])!.lt).toHaveLength(1);
  });
  it('a client cannot take loot: only touching it in the server world does, once', () => {
    const { lobby, cs, ids, room, step } = match('3v3');
    const w = room!.world;
    step(0.1);
    const me = w.actors[0], v = w.actors.find((a) => a.team !== me.team)!;
    v.grenades = 2; me.grenades = 0;
    kill(w, v, 0);
    // Whatever a client sends, nothing changes until the server moves it there.
    lobby.message(ids[0], JSON.stringify({ t: 'pickup', id: w.loot[0].id }));
    lobby.message(ids[0], JSON.stringify({ t: 'loot', id: w.loot[0].id, grenades: 99 }));
    step(0.2);
    expect(me.grenades).toBe(0);
    me.x = w.loot[0].x; me.y = w.loot[0].y;
    step(0.1);
    expect(me.grenades).toBe(2);
    step(0.5);
    expect(me.grenades).toBe(2);
    // What is left in it (the dressing, its rounds) shows; its grenades do not.
    expect((lastSnap(cs[0])!.lt ?? []).every((l) => (l.k & 8) === 0)).toBe(true);
  });
  it('disconnect: a player who leaves for good drops a bag; a reconnect within the grace finds the bags still there', () => {
    const { lobby, cs, ids, room, step } = match('3v3');
    const w = room!.world;
    step(0.1);
    // P1 drops and never returns (grace 20 s): eliminated, its kit becomes a bag.
    lobby.message(ids[1], JSON.stringify({ t: 'leave' }));
    step(0.2);
    expect(w.loot.some((l) => l.from === 1)).toBe(true);
    // P0 drops and comes back: its snapshot shows the bag its team knows about.
    const token = (cs[0].got.find((m) => m.t === 'welcome') as Extract<ServerMsg, { t: 'welcome' }>).token;
    lobby.disconnect(ids[0]);
    step(1);
    const back = conn();
    const id = lobby.connect(back);
    lobby.message(id, JSON.stringify({ t: 'hello', v: PROTOCOL, name: 'P0', hero: 'benja', token }));
    step(0.2);
    const knows = w.loot.filter((l) => l.known.includes(w.actors[0].team)).length;
    expect((lastSnap(back)!.lt ?? []).length).toBe(knows);
  });
  it('a private room drops and shares loot the same way', () => {
    const { cs, room, step } = match('1v1', true);
    expect(room).toBeDefined();
    const w = room!.world;
    step(0.1);
    kill(w, w.actors[1], 0);
    step(0.1);
    expect(lastSnap(cs[0])!.lt).toHaveLength(1);
  });
});
