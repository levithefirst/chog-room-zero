// SB AI teammate call-outs (src/sim/bots.ts callOut / hearCalls): teammates say what THEY perceive, briefly, and the
// squad acts on it without anyone learning what nobody perceived. LAW 5: teammates operate under uncertainty.
import { describe, expect, it } from 'vitest';
import { TUNING } from '../src/config/tuning';
import { HEROES, squadFor } from '../src/config/heroes';
import { createWorld, hears, stepWorld, wallFactorOf, IDLE_INPUT, type CommsEvent, type World } from '../src/sim/world';
import { canSee } from '../src/sim/vision';
import { createAutopilot } from '../src/debug/autopilot';
import { createIntel, senseFor } from '../src/sim/intel';
import { angleDiff } from '../src/sim/geom';
import { commsLine } from '../src/ui/comms';

const OPEN = ['########################', ...Array.from({ length: 10 }, () => '#......................#'), '########################'];
const STEP = TUNING.simStepSeconds;

function squad(): World {
  const w = createWorld({ map: OPEN, seed: 9, log: true, allies: [{ name: 'Toad', hero: 'toad' }, { name: 'Ray', hero: 'ray' }], bots: [{ name: 'H', hero: 'benja', patrol: [[20, 2]], flanker: false }] });
  const p = w.actors[0];
  p.x = 6.5; p.y = 5.5; p.facing = 0; p.hp = p.maxHp = 1e9;
  for (const a of w.actors) if (a.team === 'player') a.hp = a.maxHp = 1e9;
  return w;
}
const hostile = (w: World) => w.actors.find((a) => a.team === 'bot')!;

describe('call-outs say what the caller perceives', () => {
  it('a teammate that sees a hostile the player does not calls it once, at the spot it saw', () => {
    const w = squad();
    const toad = w.actors[1], h = hostile(w);
    toad.x = 12.5; toad.y = 8.5; h.x = 18.5; h.y = 8.5;
    const calls: CommsEvent[] = [];
    // The player faces away (west); the hostile is frozen; Toad looks east at it.
    for (let i = 0; i < 90; i++) {
      stepWorld(w, { ...IDLE_INPUT, aim: Math.PI }, STEP, (a) => a.team === 'bot' ? { ...IDLE_INPUT, aim: Math.PI } : null);
      if (i === 0) { toad.facing = 0; }
      calls.push(...w.comms);
    }
    const c = calls.find((e) => e.target === h.id && (e.kind === 'contact' || e.kind === 'behind'))!;
    expect(c).toBeDefined();
    expect(c.r).toBe(0);
    expect(calls.filter((e) => e.target === h.id && (e.kind === 'contact' || e.kind === 'behind')).length).toBe(1);
  });
  it('a hostile well off where the player faces is "Behind us!"', () => {
    const w = squad();
    const toad = w.actors[1], h = hostile(w);
    toad.x = 10.5; toad.y = 5.5; h.x = 18.5; h.y = 5.5; // east of the player, who faces west
    w.actors[0].facing = Math.PI;
    let kind = '';
    for (let i = 0; i < 90 && !kind; i++) {
      stepWorld(w, { ...IDLE_INPUT, aim: Math.PI }, STEP, (a) => a.team === 'bot' ? { ...IDLE_INPUT, aim: Math.PI } : null);
      if (i === 0) toad.facing = 0;
      for (const e of w.comms) if (e.target === h.id) kind = e.kind;
    }
    expect(kind).toBe('behind');
  });
  it('the words: what, and which way from you', () => {
    const e = (kind: CommsEvent['kind'], x = 10, y = 0, heading?: number): CommsEvent => ({ from: 1, kind, target: 2, x, y, r: 0, tick: 0, heading });
    expect(commsLine(e('contact'), 0, 0)).toBe('Contact, east.');
    expect(commsLine(e('steps', 0, -10), 0, 0)).toBe('Footsteps, north.');
    expect(commsLine(e('lost', 0, 0, Math.PI), 0, 0)).toBe('Lost him. Heading west.');
    expect(commsLine(e('behind'), 0, 0)).toBe('Behind us!');
    for (const k of ['contact', 'behind', 'lost', 'steps', 'shots', 'reloading', 'hurt'] as const) expect(commsLine(e(k), 0, 0).length).toBeLessThan(26);
  });
});

/** Default game (you + 2 AI, zone on), autopilot: every call and every 'callout' belief, audited against the caller. */
function audit(seeds: number, opts: { quiet?: boolean } = {}) {
  const gap0 = TUNING.comms.gap;
  if (opts.quiet) (TUNING.comms as { gap: number }).gap = Infinity;
  let calls = 0, minutes = 0, minGap = Infinity, wins = 0, warnedByCall = 0, sightings = 0, coverTurns = 0, coverChecks = 0;
  const kinds: Record<string, number> = {};
  try {
    for (let seed = 1; seed <= seeds; seed++) {
      const hero = HEROES[seed % HEROES.length].id;
      const w = createWorld({ hero, seed, zone: true, log: true, allies: squadFor(hero, seed) });
      const p = w.actors[0], ap = createAutopilot(seed, 3), intel = createIntel();
      let last = -1e9;
      const calledAt = new Map<number, number>();
      const seenBefore = new Map<number, number>();
      const pending: { at: number; ally: number; x: number; y: number; from: number }[] = [];
      for (let i = 0; i < 240 * 60 && w.outcome === 'playing'; i++) {
        const prevSounds = w.sounds;
        stepWorld(w, ap.next(w));
        senseFor(w, p, intel, STEP);
        const t = i * STEP;
        const log = w.perceptionLog!;
        for (const e of w.comms) {
          calls++; kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
          minGap = Math.min(minGap, t - last); last = t;
          // Backed by the caller's own perception (its perception log: what it saw or heard, at that moment, with the
          // truth recorded beside it): a sighting this step, a heard guess this step, or a sighting in the last 3 s.
          const mine = (src: string, since: number) => log.some((l) => l.bot === e.from && l.source === src && l.tick >= since && l.x === e.x && l.y === e.y);
          if (e.kind === 'contact' || e.kind === 'behind') expect(mine('seen', e.tick), `${e.kind} backed by a sighting`).toBe(true);
          if (e.kind === 'steps' || e.kind === 'shots') {
            expect(mine('heard', e.tick), `${e.kind} backed by a heard guess`).toBe(true);
            // V2: with the caller's own wall factor (Keen Ears is a rule of hearing, not a leak).
            expect(prevSounds.some((s) => s.sourceId === e.target && hears(w.level, log.find((l) => l.bot === e.from && l.tick === e.tick)!.ox, log.find((l) => l.bot === e.from && l.tick === e.tick)!.oy, s, wallFactorOf(w.actors[e.from])))).toBe(true);
          }
          if (e.kind === 'lost') expect(mine('seen', e.tick - 3 * 60), 'lost backed by an earlier sighting').toBe(true);
          if (e.target >= 0) calledAt.set(e.target, t);
          // Only calls about what nobody is watching (heard, lost) make the others cover; a seen contact is the caller's.
          if (e.kind === 'steps' || e.kind === 'shots' || e.kind === 'lost') for (const m of w.actors) if (m.ai && m.team === p.team && m.id !== e.from && m.alive && !m.downed && e.target >= 0) pending.push({ at: t, ally: m.id, x: e.x, y: e.y, from: e.from });
        }
        // A teammate that heard a call and had nothing of its own turns its lamp toward the spot within 0.6 s.
        for (let k = pending.length - 1; k >= 0; k--) {
          const q = pending[k];
          if (t - q.at < 0.6) continue;
          const m = w.actors[q.ally], br = w.brains.get(q.ally)!;
          if (m.alive && !m.downed && br.state === 'patrol' && !br.sawPlayer) { coverChecks++; if (Math.abs(angleDiff(m.facing, Math.atan2(q.y - m.y, q.x - m.x))) < 0.6) coverTurns++; }
          pending.splice(k, 1);
        }
        // Every 'callout' belief is backed by a teammate's call the step before, at that exact spot.
        for (const e of log) {
          if (e.source !== 'callout' || e.tick !== w.tick - 1) continue;
          expect(w.prevComms.some((c) => c.x === e.x && c.y === e.y && c.from !== e.bot)).toBe(true);
        }
        // Keep 4 s of the log for the 'lost' check.
        if (i % 60 === 0) { const keep = log.filter((l) => l.tick > w.tick - 4 * 60); log.length = 0; log.push(...keep); }
        // A new sighting by the player: was it called by a teammate in the 3 s before?
        for (const a of w.actors) {
          if (a.team === p.team || !a.alive || !canSee(w.level, p.x, p.y, p.facing, p.view, a.x, a.y)) continue;
          if (t - (seenBefore.get(a.id) ?? -9) > 3) { sightings++; if ((calledAt.get(a.id) ?? -9) > t - 3) warnedByCall++; }
          seenBefore.set(a.id, t);
        }
      }
      minutes += w.tick * STEP / 60;
      if (w.outcome === 'won') wins++;
    }
  } finally { (TUNING.comms as { gap: number }).gap = gap0; }
  return { calls, perMin: +(calls / minutes).toFixed(1), minGap: +minGap.toFixed(2), kinds, wins, seeds, warnedByCall: +(warnedByCall / Math.max(1, sightings)).toFixed(3), cover: +(coverTurns / Math.max(1, coverChecks)).toFixed(2), coverChecks };
}

describe('the squad talks without spam and without wallhacks (default game, autopilot, 32 seeds)', () => {
  let on: ReturnType<typeof audit>, off: ReturnType<typeof audit>;
  it('audits every call against its caller, and every belief from a call against the call', () => {
    // GP: 32 seeds (was 16). The rate moved by +-0.4 a minute between 16-seed samples of the same build; 32 halves
    // that, so the bars below judge the build, not the sample.
    on = audit(32);
    off = audit(16, { quiet: true });
    (globalThis as { __sbComms?: unknown }).__sbComms = { on, off };
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (env.SB_COMMS_OUT) (globalThis as { process?: { stdout: { write(s: string): void } } }).process?.stdout.write(`SB_COMMS ${JSON.stringify({ on, off })}\n`);
    expect(on.calls).toBeGreaterThan(20);
    expect(off.calls).toBe(0);
  }, 600000);
  it('one voice at a time, and a handful of calls a minute, not a stream', () => {
    expect(on.minGap).toBeGreaterThanOrEqual(TUNING.comms.gap - 1e-9);
    expect(on.perMin).toBeLessThan(10);
  });
  it('teammates act on a heard or lost call: they turn to cover the spot (a seen contact stays the caller\'s)', () => {
    expect(on.coverChecks).toBeGreaterThan(4);
    expect(on.cover).toBeGreaterThan(0.6);
  });
  it('calls warn the player: some sightings were called by a teammate first', () => {
    expect(on.warnedByCall).toBeGreaterThan(off.warnedByCall + 0.1);
  });
});
