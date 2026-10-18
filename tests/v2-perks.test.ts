// V2 perks (owner V2 §8): one slot, match only, any hero; hostiles carry one; a kill drops it in the bag; an empty slot
// takes it on touch; a held one is swapped only by standing still on the bag; nothing changes health, armour, damage
// or speed; online the server decides it all and tells only the teams that know.
import { describe, expect, it } from 'vitest';
import { createWorld, hears, player, stepWorld, wallFactorOf, IDLE_INPUT, type Actor, type World } from '../src/sim/world';
import { PERKS, PERK_IDS, spawnPerk } from '../src/config/perks';
import { TUNING } from '../src/config/tuning';
import { Lobby } from '../server/room';
import type { ServerMsg } from '../src/net/protocol';

const STEP = TUNING.simStepSeconds;
const OPEN = ['##############################', ...Array.from({ length: 12 }, () => '#........................#...#'), '##############################'];
const idle = (a: Actor) => ({ ...IDLE_INPUT, aim: a.facing });
function solo(): World {
  return createWorld({ map: OPEN, hero: 'benja', allies: [{ name: 'Toad', hero: 'toad' }], bots: [{ name: 'H', hero: 'benja', patrol: [[27, 6]], flanker: false }], zone: false, perks: true });
}
function bagAt(w: World, x: number, y: number, perk: Actor['perk']) {
  w.loot.push({ id: w.lootSeq++, x, y, mags: 0, health: 0, armor: 0, grenades: 0, perk, left: 30, from: 99, team: 'bot', known: ['player', 'bot'] });
}

describe('who carries a perk', () => {
  it('default game: every hostile carries one (fixed by seed and id, not drawn from the match random stream); you and your teammates none', () => {
    const w = createWorld({ seed: 7, hero: 'benja', allies: [{ name: 'Toad', hero: 'toad' }] });
    for (const a of w.actors) {
      if (a.team === 'bot') expect(a.perk).toBe(spawnPerk(7, a.id));
      else expect(a.perk).toBeNull();
    }
    const counts = new Map<string, number>();
    for (let s = 1; s <= 200; s++) for (let id = 2; id < 7; id++) counts.set(spawnPerk(s, id), (counts.get(spawnPerk(s, id)) ?? 0) + 1);
    // Every perk turns up, none dominates (1000 draws, 4 perks: each 150 to 350).
    expect([...counts.keys()].sort()).toEqual([...PERK_IDS].sort());
    for (const n of counts.values()) { expect(n).toBeGreaterThan(150); expect(n).toBeLessThan(350); }
  });
  it('a perk never touches health, armour, damage or speed', () => {
    for (const k of PERK_IDS) for (const word of ['health', 'armour', 'damage', 'speed']) {
      if (k === 'medic' && word === 'health') continue; // Field Kit says how much health the revived get up with
      expect(PERKS[k].text.toLowerCase()).not.toContain(word);
    }
    const a = createWorld({ seed: 3, perks: false }), b = createWorld({ seed: 3, perks: true });
    for (let i = 0; i < a.actors.length; i++) {
      for (const f of ['maxHp', 'maxArmor', 'hp', 'armor'] as const) expect(b.actors[i][f]).toBe(a.actors[i][f]);
      expect(b.actors[i].power).toEqual(a.actors[i].power);
    }
  });
});

describe('the effects', () => {
  it('Soft Soles: a run step carries 40% less far', () => {
    const plain: number[] = [], soft: number[] = [];
    { const w = solo(); const p = player(w); p.x = 3.5; p.y = 6.5; for (let i = 0; i < 90; i++) { stepWorld(w, (a) => (a === p ? { ...IDLE_INPUT, moveX: 1, aim: 0 } : idle(a))); plain.push(...w.sounds.filter((s) => s.sourceId === 0 && s.type.endsWith('tep')).map((s) => s.radius)); } }
    { const w = solo(); const p = player(w); p.perk = 'soles'; p.x = 3.5; p.y = 6.5; for (let i = 0; i < 90; i++) { stepWorld(w, (a) => (a === p ? { ...IDLE_INPUT, moveX: 1, aim: 0 } : idle(a))); soft.push(...w.sounds.filter((s) => s.sourceId === 0 && s.type.endsWith('tep')).map((s) => s.radius)); } }
    expect(plain.length).toBeGreaterThan(0);
    expect(soft.length).toBe(plain.length);
    expect(Math.max(...soft)).toBeCloseTo(Math.max(...plain) * TUNING.perks.solesStepMul, 5);
  });
  it('Keen Ears: a step behind a wall, heard only by the listener with the perk', () => {
    const w = createWorld({ map: ['###########', '#....#....#', '#....#....#', '###########'], zone: false, bots: [], perks: false });
    // A run step (8 u) 7.3 u away through the wall: beyond the usual 8 x wallFactor, inside its open-floor reach.
    const s = { type: 'step' as const, x: 8.5, y: 1.5, radius: 8, sourceId: 9, team: 'bot' as const, tick: 0 };
    const p = player(w); p.x = 1.2; p.y = 1.5;
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    expect(d).toBeGreaterThan(s.radius * TUNING.sound.wallFactor);
    expect(hears(w.level, p.x, p.y, s, wallFactorOf(p))).toBe(false);
    p.perk = 'ears';
    expect(hears(w.level, p.x, p.y, s, wallFactorOf(p))).toBe(true);
  });
  it('Field Kit: a revive takes half the time and the revived get up with half their health', () => {
    const time = (medic: boolean) => {
      const w = solo(); const p = player(w), m = w.actors[1];
      p.x = 5.5; p.y = 6.5; m.x = 6.3; m.y = 6.5; m.perk = medic ? 'medic' : null;
      w.brains.delete(m.id); m.ai = false; // scripted: stands still and holds fire
      p.downed = true; p.hp = TUNING.revive.downHp; p.armor = 0; p.reviveProgress = 0;
      p.downInfo = { cause: 'shot', killerId: -1, weapon: 't', fromX: 0, fromY: 0, toX: 0, toY: 0, tick: 0 };
      let n = 0;
      while (p.downed && n < 600) { stepWorld(w, (a) => idle(a)); n++; }
      return { s: n * STEP, hp: p.hp, max: p.maxHp };
    };
    const plain = time(false), kit = time(true);
    expect(plain.s).toBeCloseTo(TUNING.revive.seconds, 1);
    expect(kit.s).toBeCloseTo(TUNING.revive.seconds / TUNING.perks.medicReviveMul, 1);
    expect(kit.hp).toBe(Math.round(kit.max * TUNING.perks.medicHpShare));
    expect(plain.hp).toBe(Math.round(plain.max * TUNING.revive.hpShare));
  });
});

describe('bags: drop, take, swap', () => {
  it('a kill drops the perk in the bag; an empty slot takes it on touch, with the toast-worthy change', () => {
    const w = solo(); const p = player(w), h = w.actors[2];
    const perk = h.perk!;
    expect(perk).not.toBeNull();
    h.hp = 1; h.armor = 0; h.x = 8.5; h.y = 6.5; p.x = 6.5; p.y = 6.5; p.facing = 0;
    for (let i = 0; i < 120 && h.alive; i++) stepWorld(w, (a) => (a === p ? { ...IDLE_INPUT, firing: true, aim: 0 } : idle(a)));
    expect(h.alive).toBe(false);
    expect(h.perk).toBeNull();
    const bag = w.loot.find((l) => l.from === h.id)!;
    expect(bag.perk).toBe(perk);
    for (let i = 0; i < 120 && !p.perk; i++) stepWorld(w, (a) => (a === p ? { ...IDLE_INPUT, moveX: 1, aim: 0 } : idle(a)));
    expect(p.perk).toBe(perk);
  });
  it('carrying one: walking over a bag never swaps; standing still on it for swapSeconds does, once', () => {
    const w = solo(); const p = player(w);
    w.actors[2].x = 27.5; // the hostile stays in its pocket
    // The AI teammate (empty slot) would go and take the bag first: park it as a scripted, idle actor far away.
    const m = w.actors[1]; w.brains.delete(m.id); m.ai = false; m.x = 20.5; m.y = 11.5;
    p.perk = 'soles'; p.x = 5.5; p.y = 6.5;
    bagAt(w, 8.5, 6.5, 'ears');
    // Walk straight across it: no swap.
    for (let i = 0; i < 80; i++) stepWorld(w, (a) => (a === p ? { ...IDLE_INPUT, moveX: 1, aim: 0 } : idle(a)));
    expect(p.perk).toBe('soles');
    // Come back and stand on it.
    p.x = 8.5; p.vx = p.vy = 0;
    let n = 0;
    while (p.perk === 'soles' && n < 200) { stepWorld(w, (a) => idle(a)); n++; }
    expect(p.perk).toBe('ears');
    expect(n * STEP).toBeGreaterThanOrEqual(TUNING.perks.swapSeconds - STEP);
    expect(w.loot[0].perk).toBe('soles');
    // Standing on: never swaps back.
    for (let i = 0; i < 200; i++) stepWorld(w, (a) => idle(a));
    expect(p.perk).toBe('ears');
  });
  it('an AI teammate with an empty slot goes for a known bag with a perk; it never swaps one it has', () => {
    const w = solo(); const m = w.actors[1], p = player(w);
    w.actors[2].x = 27.5;
    p.x = 3.5; p.y = 3.5; m.x = 4.5; m.y = 6.5;
    bagAt(w, 10.5, 6.5, 'marker');
    for (let i = 0; i < 60 * 8 && !m.perk; i++) stepWorld(w, (a) => (a === p ? idle(a) : idle(a)));
    expect(m.perk).toBe('marker');
    bagAt(w, m.x, m.y, 'medic');
    for (let i = 0; i < 120; i++) stepWorld(w, (a) => idle(a));
    expect(m.perk).toBe('marker');
  });
});

describe('online: the server decides, and tells only who knows', () => {
  class FakeConn { got: ServerMsg[] = []; send(m: ServerMsg) { this.got.push(JSON.parse(JSON.stringify(m)) as ServerMsg); } close() { /* closed */ } }
  function duel() {
    let t = 0;
    const lobby = new Lobby({ now: () => t, seed: () => 5, countdownSec: 0 });
    const ids = [new FakeConn(), new FakeConn()].map((c) => lobby.connect(c));
    ids.forEach((id, i) => { lobby.message(id, JSON.stringify({ t: 'hello', v: 1, name: `P${i}`, hero: 'benja' })); lobby.message(id, JSON.stringify({ t: 'queue', mode: '1v1' })); });
    const room = [...lobby.rooms.values()][0];
    lobby.tick();
    return { lobby, room, w: room.world };
  }
  it('every player starts with a perk; you are told yours, never a hostile\'s', () => {
    const { lobby, room, w } = duel();
    expect(w.actors.every((a) => a.perk !== null)).toBe(true);
    const [a, b] = w.actors;
    b.x = a.x + 2; b.y = a.y; a.facing = 0; // in sight
    const s = lobby.snapshot(room, room.members[0]);
    expect(s.actors.find((x) => x.id === a.id)!.perk).toBe(a.perk);
    const foe = s.actors.find((x) => x.id === b.id);
    expect(foe).toBeDefined();
    expect(foe!.perk).toBeUndefined();
  });
  it('Marker: a hostile you hit is sent to you exactly for 2 s, flagged, even out of sight; then not', () => {
    const { lobby, room, w } = duel();
    const [a, b] = w.actors;
    b.markLeft = TUNING.perks.markerSeconds; b.markTeam = a.team;
    a.facing = Math.atan2(a.y - b.y, a.x - b.x); // looking away
    b.x = a.x + 6; b.y = a.y;
    let s = lobby.snapshot(room, room.members[0]);
    expect(s.actors.find((x) => x.id === b.id)?.mk).toBe(1);
    b.markLeft = 0;
    s = lobby.snapshot(room, room.members[0]);
    expect(s.actors.some((x) => x.id === b.id)).toBe(false);
  });
});
