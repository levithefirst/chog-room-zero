// SCRIPTED online player (RC-8 hosted tests). Debug only: active with ?debug&online=<mode>&drive=1. It reads only this
// client's own view world (what the server sent this client) and returns ordinary controls, which go through the same
// OnlineSession.sendInput path as a person's. The server still decides every hit, death and result. Same rules as the
// CDP driver in tools/rc8-online.mjs: walk to the final circle, fire at the nearest hostile it can see within 10 u.
import { IDLE_INPUT, type ActorInput, type World } from '../sim/world';
import { findPath, sightClear } from '../sim/level';

export function createOnlineDriver(): (w: World) => ActorInput {
  let path: { x: number; y: number }[] = [];
  let pathAt = -1e9;
  return (w) => {
    const me = w.actors[0];
    if (!me.alive || !w.zone) return { ...IDLE_INPUT, aim: me.facing };
    let target = null as null | { x: number; y: number }, best = 1e9;
    for (const f of w.actors) {
      if (f.team === me.team || !f.alive || f.x < -50) continue;
      const d = Math.hypot(f.x - me.x, f.y - me.y);
      if (d < best && sightClear(w.level, me.x, me.y, f.x, f.y)) { best = d; target = f; }
    }
    const z = w.zone.plan[w.zone.plan.length - 1];
    if (!path.length || w.tick - pathAt > 30) { path = findPath(w.level, me.x, me.y, z.x, z.y); pathAt = w.tick; }
    while (path.length && Math.hypot(path[0].x - me.x, path[0].y - me.y) < 0.45) path.shift();
    const inp: ActorInput = { ...IDLE_INPUT, aim: me.facing };
    const n = path[0];
    if (n && !(target && best < 5)) {
      const dx = n.x - me.x, dy = n.y - me.y, d = Math.hypot(dx, dy) || 1;
      inp.moveX = dx / d; inp.moveY = dy / d;
    }
    const at = target ?? n ?? z;
    inp.aim = Math.atan2(at.y - me.y, at.x - me.x);
    inp.firing = !!target && best < 10;
    // One grenade a match at a target it sees 4-9 u away (the hosted checks see the server spend it).
    if (target && best >= 4 && best <= 9 && me.grenades >= me.maxGrenades && me.grenades > 0) { inp.grenade = true; inp.throwDist = best; inp.firing = false; }
    return inp;
  };
}
