// Scripted autopilot player for RC-1 "victory reachable by normal play". It plays through the real sim against
// the real bots with player-level information only for SHOOTING: it fires only at a bot inside its own view
// cone and range with wall line of sight, with human aim error. For NAVIGATION it heads to the nearest live bot
// (a stand-in for a player who explores and listens). Fire discipline: stops to shoot, reloads when empty,
// uses its ability when hurt (Mend/Patch), or on contact (others).
import { createWorld, stepWorld, IDLE_INPUT, type ActorInput, type World } from '../../src/sim/world';
import { canSee } from '../../src/sim/vision';
import { findPath, shotClear, sightClear } from '../../src/sim/level';
import type { BotSpawn } from '../../src/config/map';
import type { Sidegrade } from '../../src/sim/operators';

export interface AutoResult { unseenDmg: number; seenDmg: number; won: boolean; seconds: number; kills: number; shots: number; hits: number; hpLeft: number }

export function autopilot(hero: string, seed: number, opts: { maxSeconds?: number; sidegrade?: Sidegrade; aimErrDeg?: number; bots?: BotSpawn[] } = {}): AutoResult {
  const w: World = createWorld({ hero, seed, sidegrade: opts.sidegrade, bots: opts.bots });
  const p = w.actors[0];
  let rng = seed * 9301 + 49297;
  const rnd = () => ((rng = (rng * 9301 + 49297) % 233280) / 233280);
  let path: { x: number; y: number }[] = [];
  let repath = 0;
  let aimNoise = 0;
  const errRad = ((opts.aimErrDeg ?? 3) * Math.PI) / 180;
  let seenDmg = 0, unseenDmg = 0;
  const max = (opts.maxSeconds ?? 300) * 60;
  for (let i = 0; i < max && w.outcome === 'playing'; i++) {
    const inp: ActorInput = { ...IDLE_INPUT, aim: p.facing };
    const live = w.actors.filter((a) => a.team === 'bot' && a.alive);
    // Visible target: in my cone and range with LOS (what the screen shows), nearest first.
    const seen = live.filter((b) => canSee(w.level, p.x, p.y, p.facing, p.view, b.x, b.y)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    // Shot at from somewhere I can see along: turn toward it (the damage arc says where).
    const hitBy = p.lastHitFrom && sightClear(w.level, p.x, p.y, p.lastHitFrom.x, p.lastHitFrom.y) ? p.lastHitFrom : null;
    if (i % 18 === 0) aimNoise = (rnd() * 2 - 1) * errRad;
    if (seen) {
      inp.aim = Math.atan2(seen.y - p.y, seen.x - p.x) + aimNoise;
      const d = Math.hypot(seen.x - p.x, seen.y - p.y);
      // Stand still inside effective range and shoot (movement widens spread); otherwise close in, holding fire.
      const want = p.weapon.pellets > 1 ? 3.5 : (p.weapon.falloffStart + p.weapon.falloffEnd) / 2;
      const clear = shotClear(w.level, p.x, p.y, seen.x, seen.y, p.weapon.piercesCover, 1.25);
      // Shot blocked by cover (a slab or crate the target hugs): back off and wait for it to come out.
      if (!clear) { inp.moveX = -(seen.x - p.x) / d; inp.moveY = -(seen.y - p.y) / d; }
      else if (d > want) { inp.moveX = (seen.x - p.x) / d; inp.moveY = (seen.y - p.y) / d; inp.quiet = false; }
      inp.firing = clear && d <= want + 0.5 && p.ammo > 0 && p.reloadLeft <= 0;
      if (p.ammo === 0) inp.reload = true;
      if (p.hero.ability.kind !== 'mend' && p.abilityCd === 0) inp.ability = true;
    } else {
      if (hitBy) inp.aim = Math.atan2(hitBy.y - p.y, hitBy.x - p.x);
      if (p.ammo < p.weapon.magazine && p.reserve > 0) inp.reload = true;
      const near = (o: { x: number; y: number }) => Math.hypot(o.x - p.x, o.y - p.y);
      const nearestBot = live.sort((a, b) => near(a) - near(b))[0];
      // Patch up first: health when below 60%, armour when low and close.
      const heal = p.hp < p.maxHp * 0.6 ? w.pickups.filter((k) => k.active && k.kind === 'health').sort((a, b) => near(a) - near(b))[0] : undefined;
      const arm = !heal && p.maxArmor > 0 && p.armor < p.maxArmor * 0.4 ? w.pickups.filter((k) => k.active && k.kind === 'armor' && near(k) < 12)[0] : undefined;
      const target = heal ?? arm ?? nearestBot;
      // Creep when a hostile is close and unseen: they hear running at 8 m.
      inp.quiet = !!nearestBot && near(nearestBot) < 10;
      if (target && (--repath <= 0 || path.length === 0)) { path = findPath(w.level, p.x, p.y, target.x, target.y); repath = 30; }
      while (path.length && Math.hypot(path[0].x - p.x, path[0].y - p.y) < 0.35) path.shift();
      if (path.length) {
        const n = path[0];
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        inp.moveX = (n.x - p.x) / d; inp.moveY = (n.y - p.y) / d;
        if (!hitBy) inp.aim = Math.atan2(inp.moveY, inp.moveX);
      }
    }
    if (p.hero.ability.kind === 'mend' && p.hp < p.maxHp * 0.55 && p.abilityCd === 0) inp.ability = true;
    stepWorld(w, inp);
    for (const h of w.hits) if (h.target === 0) {
      const b = w.actors[h.by];
      if (canSee(w.level, p.x, p.y, p.facing, p.view, b.x, b.y)) seenDmg += h.hpDamage + h.armorDamage; else unseenDmg += h.hpDamage + h.armorDamage;
    }
  }
  return { seenDmg: Math.round(seenDmg), unseenDmg: Math.round(unseenDmg), won: w.outcome === 'won', seconds: Math.round(w.tick / 60), kills: p.kills, shots: p.shots, hits: p.hits, hpLeft: Math.round(p.hp) };
}
