// Library data stays in sync with the game: facts.ts imports the config, and the few copied constants are checked
// against the source files they were copied from (server/room.ts, src/net/client.ts, src/input/input.ts).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SERVER, INPUT, MODES, mitigate, MEDALS, HEROES, MAP_IDS, WEAPONS, TUNING, soloHostiles, MAPS } from '../src/library/facts';
import { mitigate as worldMitigate } from '../src/sim/world';
import { MODE_SIZE } from '../src/net/protocol';
import { AIM_DEADZONE, STICK_RADIUS } from '../src/input/input';
import { PAGES } from '../src/library/pages';
import { renderBody } from '../src/library/render';
import { stats } from '../src/library/mapdata';

const room = fs.readFileSync('server/room.ts', 'utf8');
const client = fs.readFileSync('src/net/client.ts', 'utf8');
const html = (slug: string) => renderBody(PAGES.find((p) => p.slug === slug)!);

describe('library data matches the game', () => {
  it('server lobby defaults', () => {
    for (const k of ['queueTimeoutSec', 'reconnectGraceSec', 'idleTimeoutSec', 'matchLimitSec', 'countdownSec', 'snapEvery'] as const)
      expect(room, k).toMatch(new RegExp(`${k}: ${SERVER[k]}[,\\s]`));
  });
  it('squad code and size', () => {
    expect(room).toContain(`PARTY_ALPHABET = '${SERVER.squadAlphabet}'`);
    expect(room).toContain(`randomBytes(${SERVER.squadCodeLength})`);
    expect(room).toContain(`members.length >= ${SERVER.squadMax}`);
  });
  it('client reconnect window', () => {
    expect(client).toContain(`performance.now() + ${SERVER.clientRetrySec * 1000}`);
  });
  it('touch input constants', () => {
    expect(INPUT.aimDeadzone).toBe(AIM_DEADZONE);
    expect(INPUT.stickRadiusPx).toBe(STICK_RADIUS);
  });
  it('online mode sizes', () => {
    for (const m of MODES.filter((x) => x.online)) expect(m.players.startsWith(String(MODE_SIZE[m.id as keyof typeof MODE_SIZE])), m.id).toBe(true);
  });
  it('armour rule is the one the sim uses', () => {
    for (const armor of [0, 5, 15, 40, 65]) for (const dmg of [10, 14, 18, 55, 70]) for (const pen of [0, 0.2, 0.5])
      expect(mitigate(armor, dmg, pen)).toEqual(worldMitigate(armor, dmg, pen));
  });
  it('counts', () => {
    expect(MEDALS.length).toBe(40);
    expect(HEROES.length).toBe(7);
    expect(MAP_IDS.length).toBe(5);
  });
  it('pages print the config values', () => {
    const combat = html('combat'), weapons = html('weapons'), ms = html('movement-sound');
    expect(combat.includes(String(TUNING.combat.armorCap))).toBe(true);
    expect(combat.includes(`${TUNING.revive.bleedSeconds} s`)).toBe(true);
    for (const w of Object.values(WEAPONS)) { expect(weapons.includes(w.name), w.name).toBe(true); expect(weapons.includes(`reload ${w.reloadSeconds} s`), w.name).toBe(true); }
    expect(ms.includes(`${TUNING.sound.runStep} m`)).toBe(true);
    expect(ms.includes(`${TUNING.movement.maxSpeed} m/s`)).toBe(true);
    expect(html('medals').match(/<li class="medal /g)?.length).toBe(MEDALS.length);
    for (const h of HEROES) expect(html('chog-traits').includes(h.name), h.name).toBe(true);
  });
  it('map pages state the measured geometry and hostile count', () => {
    for (const id of MAP_IDS) {
      const p = html(`maps/${id}`), s = stats(id);
      expect(p.includes(`${s.w} x ${s.h} m`), id).toBe(true);
      expect(p.includes(MAPS[id].name), id).toBe(true);
      expect(soloHostiles(id)).toBe(MAPS[id].botSpawns.length);
    }
  });
  it('NFT content is labelled DEMO and never claims verification by the library', () => {
    const all = PAGES.map(renderBody).join('\n');
    expect(html('chog-traits').includes('DEMO')).toBe(true);
    expect(html('game-modes').includes('DEMO')).toBe(true);
    expect(all).not.toMatch(/verified (by|on) (this|the) library|we verify/i);
  });
});
