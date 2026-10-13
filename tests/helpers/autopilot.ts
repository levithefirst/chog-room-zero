// Scripted autopilot player for RC-1 "victory reachable by normal play". It plays through the real sim against
// the real bots with player-level information only for SHOOTING: it fires only at a bot inside its own view
// cone and range with wall line of sight, with human aim error. For NAVIGATION it heads to the nearest live bot
// (a stand-in for a player who explores and listens). Fire discipline: stops to shoot, reloads when empty,
// uses its ability when hurt (Mend/Patch), or on contact (others).
import { createWorld, stepWorld, type World } from '../../src/sim/world';
import { canSee } from '../../src/sim/vision';
import { createAutopilot } from '../../src/debug/autopilot';
import type { BotSpawn } from '../../src/config/map';
import type { Sidegrade } from '../../src/sim/operators';

export interface AutoResult { unseenDmg: number; seenDmg: number; won: boolean; seconds: number; kills: number; shots: number; hits: number; hpLeft: number }

export function autopilot(hero: string, seed: number, opts: { maxSeconds?: number; sidegrade?: Sidegrade; aimErrDeg?: number; bots?: BotSpawn[]; zone?: boolean } = {}): AutoResult {
  const w: World = createWorld({ hero, seed, sidegrade: opts.sidegrade, bots: opts.bots, zone: opts.zone ?? true }); // RC-8: the shipping game has the zone
  const p = w.actors[0];
  const ap = createAutopilot(seed, opts.aimErrDeg ?? 3);
  let seenDmg = 0, unseenDmg = 0;
  const max = (opts.maxSeconds ?? 300) * 60;
  for (let i = 0; i < max && w.outcome === 'playing'; i++) {
    stepWorld(w, ap.next(w));
    for (const h of w.hits) if (h.target === 0) {
      const b = w.actors[h.by];
      if (canSee(w.level, p.x, p.y, p.facing, p.view, b.x, b.y)) seenDmg += h.hpDamage + h.armorDamage; else unseenDmg += h.hpDamage + h.armorDamage;
    }
  }
  return { seenDmg: Math.round(seenDmg), unseenDmg: Math.round(unseenDmg), won: w.outcome === 'won', seconds: Math.round(w.tick / 60), kills: p.kills, shots: p.shots, hits: p.hits, hpLeft: Math.round(p.hp) };
}
