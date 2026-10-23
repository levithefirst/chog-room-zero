// SB death insight (src/sim/insight.ts): one or two plain reasons a death happened, from the player's own fight record.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { HEROES, squadFor } from '../src/config/heroes';
import { createWorld, stepWorld } from '../src/sim/world';
import { createAutopilot } from '../src/debug/autopilot';
import { createIntel, rung, senseFor } from '../src/sim/intel';
import { createFightRecord, deathInsights, gaitOf, offFacing, trimFight, type DeathFacts, type FightRecord, type TakenHit } from '../src/sim/insight';

const hit = (o: Partial<TakenHit> = {}): TakenHit => ({ t: 10, by: 3, fromX: 0, fromY: 0, off: 0, gait: 'still', reloading: false, grenade: false, knew: 'visible', knewFor: 2, ...o });
const facts = (o: Partial<DeathFacts> = {}): DeathFacts => ({ now: 10.5, killer: 3, dist: 5, weapon: { name: 'Auto rifle', falloffEnd: 18, pellets: 1 }, foundBy: 'seen', dir: 'north', ...o });
const rec = (hits: TakenHit[], shots: FightRecord['shots'] = []): FightRecord => ({ hits, shots });
const ids = (r: FightRecord, f = facts()) => deathInsights(r, f).map((i) => i.id);

describe('the reasons', () => {
  it('a blindside from behind, found by your running steps: that is what you hear first', () => {
    const r = rec([hit({ knew: 'unknown', knewFor: 0, off: Math.PI * 0.9, gait: 'run' })]);
    const out = deathInsights(r, facts({ foundBy: 'heard', dir: 'south' }));
    expect(out.map((i) => i.id)).toEqual(['blindside', 'heardyou']);
    expect(out[0].text).toContain('from behind (south)');
    expect(out[1].text).toContain('running steps carry 8 m');
  });
  it('your muzzle flash, their Ping: how a blindside started', () => {
    expect(ids(rec([hit({ knew: 'unknown' })]), facts({ foundBy: 'flash' }))).toEqual(['blindside', 'flashyou']);
    expect(ids(rec([hit({ knew: 'unknown' })]), facts({ foundBy: 'sonar' }))).toEqual(['blindside', 'pinged']);
  });
  it('two shooters inside 3 s: outnumbered', () => {
    expect(ids(rec([hit({ t: 9, by: 4 }), hit({ t: 10, by: 3 })]))).toContain('outnumbered');
  });
  it('most of your last shots on the run', () => {
    const shots = [9, 9.2, 9.4, 9.6].map((t, i) => ({ t, gait: i < 3 ? 'run' as const : 'still' as const }));
    const out = deathInsights(rec([hit()], shots), facts());
    expect(out[0].id).toBe('runshots');
    expect(out[0].text).toContain('3 of 4 shots');
  });
  it('caught reloading; out-ranged with a shotgun; warned but facing away; a grenade', () => {
    expect(ids(rec([hit({ reloading: true })]))).toEqual(['reload']);
    expect(ids(rec([hit()]), facts({ dist: 9, weapon: { name: 'Pump shotgun', falloffEnd: 8, pellets: 8 } }))).toEqual(['range']);
    expect(ids(rec([hit({ knew: 'heard', knewFor: 3, off: Math.PI * 0.8 })]))).toEqual(['warned']);
    expect(ids(rec([hit({ grenade: true })]))).toEqual(['grenade']);
  });
  it('never more than two, never a reason that did not happen, nothing older than 6 s', () => {
    const many = rec([hit({ t: 9, by: 4, reloading: true, knew: 'unknown' }), hit({ t: 10, by: 3, knew: 'unknown' })], [9, 9.1, 9.2].map((t) => ({ t, gait: 'run' as const })));
    expect(deathInsights(many, facts({ foundBy: 'heard' })).length).toBe(2);
    expect(ids(rec([hit()]))).toEqual([]);
    expect(ids(rec([hit({ t: 1, knew: 'unknown' })]), facts({ now: 10 }))).toEqual([]);
  });
  it('gait: still, creep, run by the steady-rule thresholds', () => {
    const h = HEROES[0];
    expect(gaitOf({ vx: 0, vy: 0, stillFor: 1, hero: h })).toBe('still');
    expect(gaitOf({ vx: TUNING.movement.maxSpeed * 0.5, vy: 0, stillFor: 0, hero: h })).toBe('creep');
    expect(gaitOf({ vx: TUNING.movement.maxSpeed, vy: 0, stillFor: 0, hero: h })).toBe('run');
  });
});

describe('in real matches (default game, autopilot): most deaths come with a reason', () => {
  it('records every hit and shot the way the game does, and explains the deaths', () => {
    const counts: Record<string, number> = {};
    let deaths = 0, explained = 0;
    // The default game (you + 2) and solo 1v5, 40 seeds each: the default game is rarely lost by the autopilot.
    for (let run = 0; run < 80; run++) {
      const seed = (run % 40) + 1, hero = HEROES[seed % HEROES.length].id;
      const w = createWorld({ hero, seed, zone: true, allies: run < 40 ? squadFor(hero, seed) : undefined });
      const p = w.actors[0], ap = createAutopilot(seed, 3), intel = createIntel(), fight = createFightRecord();
      for (let i = 0; i < 240 * 60 && w.outcome === 'playing'; i++) {
        stepWorld(w, ap.next(w));
        for (const s of w.sounds) if (s.sourceId === 0 && s.type === 'shot') fight.shots.push({ t: intel.now, gait: gaitOf(p) });
        for (const h of w.hits) if (h.target === 0) {
          const k = intel.contacts.get(h.by);
          fight.hits.push({ t: intel.now, by: h.by, fromX: h.fromX, fromY: h.fromY, off: offFacing(p.facing, p.x, p.y, h.fromX, h.fromY), gait: gaitOf(p), reloading: p.reloadLeft > 0, grenade: !!h.grenade, knew: rung(intel, h.by), knewFor: k && k.state !== 'lost' ? intel.now - k.since : 0 });
        }
        senseFor(w, p, intel, TUNING.simStepSeconds);
        trimFight(fight, intel.now);
      }
      const k = w.playerKill;
      if (w.outcome !== 'dead' || !k || k.cause !== 'shot') continue;
      deaths++;
      const out = deathInsights(fight, { now: intel.now, killer: k.killerId, dist: Math.hypot(k.fromX - p.x, k.fromY - p.y), weapon: { name: p.weapon.name, falloffEnd: p.weapon.falloffEnd, pellets: p.weapon.pellets },
        foundBy: w.brains.get(k.killerId)?.foundBy ?? null, dir: 'north' });
      if (out.length) explained++;
      for (const o of out) counts[o.id] = (counts[o.id] ?? 0) + 1;
    }
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (env.SB_INSIGHT_OUT) (globalThis as { process?: { stdout: { write(s: string): void } } }).process?.stdout.write(`SB_INSIGHT ${JSON.stringify({ deaths, explained, counts })}\n`);
    expect(deaths).toBeGreaterThan(30);
    expect(explained / deaths).toBeGreaterThan(0.5);
  }, 600000);
});
