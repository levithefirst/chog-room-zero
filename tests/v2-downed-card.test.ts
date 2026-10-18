// V2 downed experience (owner V2 §6): the card must say "I am down", "X seconds left", "this teammate is coming",
// "they are X m away", "a hostile threatens the revive", from what the player knows only (no spectator cheat).
import { describe, expect, it } from 'vitest';
import { createWorld, player, stepWorld, IDLE_INPUT, type World } from '../src/sim/world';
import { createIntel, type Contact } from '../src/sim/intel';
import { TUNING } from '../src/config/tuning';
import { downedCard, THREAT_RANGE } from '../src/ui/downed';
import type { Brain } from '../src/sim/bots';

const R = TUNING.revive;
const OPEN = ['##############################', ...Array.from({ length: 12 }, () => '#........................#...#'), '##############################'];
function solo(): World {
  return createWorld({ map: OPEN, hero: 'benja', allies: [{ name: 'Toad', hero: 'toad' }, { name: 'Ray', hero: 'ray' }], bots: [{ name: 'H', hero: 'benja', patrol: [[27, 6]], flanker: false }], zone: false });
}
function downPlayer(w: World) {
  const p = player(w);
  p.x = 4.5; p.y = 6.5; p.downed = true; p.hp = R.downHp; p.armor = 0; p.reviveProgress = 0;
  p.downInfo = { cause: 'shot', killerId: -1, weapon: 'test', fromX: p.x, fromY: p.y, toX: p.x, toY: p.y, tick: w.tick };
  const [a, b] = [w.actors[1], w.actors[2]];
  a.x = 10.5; a.y = 6.5; b.x = 20.5; b.y = 6.5;
  return p;
}
const contact = (id: number, x: number, y: number, state: Contact['state']): Contact =>
  ({ id, state, source: 'sight', kind: 'other', x, y, r: 0, conf: 1, conf0: 1, at: 0, age: 0, fresh: 0, facing: 0 }) as Contact;

describe('the downed card tells you what you need to decide', () => {
  it('down, nobody on it yet: the time left and the nearest teammate by name and distance', () => {
    const w = solo(); const p = downPlayer(w);
    for (const id of [1, 2]) (w.brains.get(id) as Brain).rescuing = -1;
    const c = downedCard(w, p, createIntel())!;
    expect(c.head).toBe('DOWNED');
    expect(c.big).toBe(`${R.bleedSeconds.toFixed(1)} s`);
    expect(c.why).toBe('Nearest: Toad 6 m · crawl to them');
  });
  it('an AI teammate that took the job is named as coming, with its distance', () => {
    const w = solo(); const p = downPlayer(w);
    (w.brains.get(2) as Brain).rescuing = p.id;
    expect(downedCard(w, p, createIntel())!.why).toBe('Ray is coming · 16 m');
  });
  it('in a real game the AI rescuer is named on the card before it arrives', () => {
    const w = solo(); const p = downPlayer(w);
    let named = '';
    for (let i = 0; i < 120 && !named; i++) {
      stepWorld(w, (a) => ({ ...IDLE_INPUT, aim: a.facing }));
      const why = downedCard(w, p, createIntel())?.why ?? '';
      if (why.includes('is coming')) named = why;
    }
    expect(named).toMatch(/^(Toad|Ray) is coming · \d+ m$/);
  });
  it('a hostile the player knows of near the revive is called out; one it does not know of is not', () => {
    const w = solo(); const p = downPlayer(w);
    const intel = createIntel();
    const foe = w.actors[3];
    foe.x = p.x + 3; foe.y = p.y; // really there, but unknown to the player
    expect(downedCard(w, p, intel)!.why).not.toContain('Hostile');
    intel.contacts.set(foe.id, contact(foe.id, p.x + 5, p.y, 'heard'));
    expect(downedCard(w, p, intel)!.why).toContain('Hostile 5 m');
    intel.contacts.set(foe.id, contact(foe.id, p.x + THREAT_RANGE + 2, p.y, 'visible'));
    expect(downedCard(w, p, intel)!.why).not.toContain('Hostile');
    intel.contacts.set(foe.id, contact(foe.id, p.x + 2, p.y, 'lost'));
    expect(downedCard(w, p, intel)!.why).not.toContain('Hostile');
  });
  it('nobody standing: says so; standing and nobody down near you: no card', () => {
    const w = solo(); const p = downPlayer(w);
    w.actors[1].alive = false; w.actors[2].alive = false;
    expect(downedCard(w, p, createIntel())!.why).toBe('Nobody left to revive you');
    const w2 = solo();
    expect(downedCard(w2, player(w2), createIntel())).toBeNull();
  });
});

describe('the roster shows numbers, not only bars (report §3.6)', () => {
  it('every card lists health+armour, speed, sight and damage per second', async () => {
    const { selectHtml } = await import('../src/ui/screens');
    const { HEROES } = await import('../src/config/heroes');
    const html = selectHtml({ heroId: 'benja', profile: {}, marking: null, demoChip: '' } as unknown as Parameters<typeof selectHtml>[0]);
    for (const h of HEROES) expect(html).toContain(`<em>${h.maxHp}+${h.maxArmor}</em>`);
    expect(html).toContain(`<em>${(TUNING.movement.maxSpeed).toFixed(1)} m/s</em>`);
    expect(html.match(/<em>[\d.]+ m<\/em>/g)).toHaveLength(HEROES.length);
    expect(html.match(/<em>\d+\/s<\/em>/g)).toHaveLength(HEROES.length);
  });
});
