// SCRIPTED autopilot player (RC-1/RC-2). Debug/test tool, never on in normal play: tests/helpers/autopilot.ts drives
// it in the sim, and main.ts drives the real browser game with it under ?debug&autoplay=<seed>. It sends ordinary
// ActorInput (move/aim/fire/reload/ability) into the unchanged game loop: no bot deletion, no damage changes.
// Information: SHOOTING uses only what the player's own cone shows (canSee) with human aim error (+/-3 deg, resampled
// every 18 ticks). NAVIGATION is omniscient (paths to the nearest live bot) as a stand-in for exploring and listening.
import { IDLE_INPUT, type ActorInput, type World } from '../sim/world';
import { canSee } from '../sim/vision';
import { findPath, shotClear, sightClear } from '../sim/level';
import { safeSpot, zoneAt, zoneGoal } from '../sim/zone';
import { TUNING } from '../config/tuning';

export interface Autopilot { next(w: World): ActorInput }

export function createAutopilot(seed: number, aimErrDeg = 3): Autopilot {
  let rng = seed * 9301 + 49297;
  const rnd = () => ((rng = (rng * 9301 + 49297) % 233280) / 233280);
  let path: { x: number; y: number }[] = [];
  let repath = 0;
  let aimNoise = 0;
  let i = -1;
  const errRad = (aimErrDeg * Math.PI) / 180;
  return {
    next(w) {
      i++;
      const p = w.actors[0];
      const inp: ActorInput = { ...IDLE_INPUT, aim: p.facing };
      const live = w.actors.filter((a) => a.team === 'bot' && a.alive);
      // Visible target: in my cone and range with LOS (what the screen shows), nearest first.
      const seen = live.filter((b) => canSee(w.level, p.x, p.y, p.facing, p.view, b.x, b.y)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      // Shot at from somewhere I can see along: turn toward it (the damage arc says where).
      const hitBy = p.lastHitFrom && sightClear(w.level, p.x, p.y, p.lastHitFrom.x, p.lastHitFrom.y) ? p.lastHitFrom : null;
      if (i % 18 === 0) aimNoise = (rnd() * 2 - 1) * errRad;
      // Danger zone (RC-8): like a player reading the countdown and the circle, it walks in before the edge reaches it.
      const zv = w.zone ? zoneAt(w.zone, w.tick * TUNING.simStepSeconds) : null;
      const zg = zv ? zoneGoal(zv) : null;
      const zoneSpot = zg && Math.hypot(p.x - zg.x, p.y - zg.y) > zg.r - TUNING.zone.moveInMargin ? safeSpot(w.level, zg, p.x, p.y, TUNING.zone.moveInMargin + 1.5) : null;
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
        if (zoneSpot) {
          // Fight on the way in: keep shooting what it sees, but the feet go to the zone.
          if (--repath <= 0 || path.length === 0) { path = findPath(w.level, p.x, p.y, zoneSpot.x, zoneSpot.y); repath = 30; }
          while (path.length && Math.hypot(path[0].x - p.x, path[0].y - p.y) < 0.35) path.shift();
          if (path.length) { const n = path[0], dn = Math.hypot(n.x - p.x, n.y - p.y); inp.moveX = (n.x - p.x) / dn; inp.moveY = (n.y - p.y) / dn; }
        }
      } else {
        if (hitBy) inp.aim = Math.atan2(hitBy.y - p.y, hitBy.x - p.x);
        if (p.ammo < p.weapon.magazine && p.reserve > 0) inp.reload = true;
        const near = (o: { x: number; y: number }) => Math.hypot(o.x - p.x, o.y - p.y);
        const nearestBot = live.sort((a, b) => near(a) - near(b))[0];
        // Patch up first: health when below 60%, armour when low and close.
        const heal = p.hp < p.maxHp * 0.6 ? w.pickups.filter((k) => k.active && k.kind === 'health').sort((a, b) => near(a) - near(b))[0] : undefined;
        const arm = !heal && p.maxArmor > 0 && p.armor < p.maxArmor * 0.4 ? w.pickups.filter((k) => k.active && k.kind === 'armor' && near(k) < 12)[0] : undefined;
        const target = zoneSpot ?? heal ?? arm ?? nearestBot;
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
      return inp;
    },
  };
}
