// CHOG-AI-002 crossfire. RULE: no friendly fire, either team. A bullet passes through actors on the shooter's
// team. So every hostile elimination is a player kill: results "Hostiles down" = player kills = eliminations.
import { describe, expect, it } from 'vitest';
import { createWorld, stepWorld, IDLE_INPUT } from '../src/sim/world';

const MAP = ['##############', '#............#', '#P...........#', '#............#', '##############'];
// Spawns are tile coordinates; the actor stands at the tile centre (+0.5).
// Spawns are tile coordinates; createWorld stands the actor at the tile centre (+0.5).
const spawn = (x: number, y: number, name: string) => ({ name, hero: 'kettle', x: Math.floor(x), y: Math.floor(y), patrol: [[Math.floor(x), Math.floor(y)]] as [number, number][], flanker: false });

function bulletFrom(w: ReturnType<typeof createWorld>, owner: number, x: number, y: number, dx: number, dy: number) {
  const o = w.actors[owner];
  w.bullets.push({ x, y, ox: x, oy: y, dx, dy, life: 1, owner, weapon: o.weapon, alive: true } as never);
}

describe('AI-002 crossfire / kill accounting', () => {
  it('a bot bullet passes through another bot (no bot-on-bot damage)', () => {
    const w = createWorld({ map: MAP, bots: [spawn(4.5, 1.5, 'A'), spawn(7.5, 1.5, 'B')], seed: 1 });
    const B = w.actors[2];
    bulletFrom(w, 1, 5.2, 1.5, 1, 0);
    let botHits = 0;
    for (let i = 0; i < 20; i++) {
      stepWorld(w, IDLE_INPUT);
      botHits += w.hits.filter((h) => h.target === B.id && h.by === 1).length;
    }
    expect(botHits).toBe(0);
    expect(B.alive).toBe(true);
  });
  it('a stray bot bullet can never eliminate a bot, so the hostile count only drops on player kills', () => {
    const w = createWorld({ map: MAP, bots: [spawn(4.5, 1.5, 'A'), spawn(7.5, 1.5, 'B')], seed: 1 });
    w.actors[2].hp = 1;
    w.actors[2].armor = 0;
    for (let k = 0; k < 10; k++) bulletFrom(w, 1, 5.2, 1.5, 1, 0);
    for (let i = 0; i < 20; i++) stepWorld(w, IDLE_INPUT);
    expect(w.actors.filter((a) => a.team === 'bot' && !a.alive).length).toBe(w.actors[0].kills);
  });
  it('the player still hits and kills bots; multiple hits credit exactly one kill', () => {
    const w = createWorld({ map: MAP, bots: [spawn(6.5, 2.5, 'A')], seed: 1 });
    const p = w.actors[0];
    w.actors[1].hp = 30;
    w.actors[1].armor = 0;
    for (let k = 0; k < 4; k++) bulletFrom(w, 0, 2.5 + k * 0.1, 2.5, 1, 0);
    for (let i = 0; i < 30; i++) stepWorld(w, IDLE_INPUT);
    expect(w.actors[1].alive).toBe(false);
    expect(p.kills).toBe(1);
  });
});
