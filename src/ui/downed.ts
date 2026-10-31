// The downed card (GP, V2): you down, or a teammate down beside you. V2 adds what a downed player needs to decide:
// who is coming and how far, the nearest teammate when nobody is, and a hostile you know is close. Only what the
// player already knows: teammates are always shown to their own side, and the threat comes from the player's own
// contact intel (seen, heard or told), never from the world.
import { TUNING } from '../config/tuning';
import { downLeft, standing, type Actor, type World } from '../sim/world';
import type { Intel } from '../sim/intel';
import type { Brain } from '../sim/bots';

export interface DownedCard { head: string; big: string; why: string; share: number; reviving: boolean }

/** How close a known hostile must be to count as a threat to the revive (m). */
export const THREAT_RANGE = 9;

export function downedCard(w: World, p: Actor, intel: Intel): DownedCard | null {
  const R = TUNING.revive;
  const mate = !p.downed && p.alive ? w.actors.find((m) => m !== p && m.team === p.team && m.alive && m.downed && Math.hypot(m.x - p.x, m.y - p.y) <= R.range + 1.5) : undefined;
  const who = p.alive && p.downed ? p : mate;
  if (!who) return null;
  const reviving = who.reviveProgress > 0;
  const left = downLeft(who);
  const dist = (m: Actor) => Math.round(Math.hypot(m.x - who.x, m.y - who.y));
  const helper = reviving ? w.actors.find((m) => m !== who && m.team === who.team && standing(m) && Math.hypot(m.x - who.x, m.y - who.y) <= R.range) : undefined;
  const head = who === p ? (reviving ? 'BEING REVIVED' : 'DOWNED') : reviving ? `REVIVING ${who.name.toUpperCase()}` : `${who.name.toUpperCase()} IS DOWN`;
  const big = reviving ? `${who.reviveProgress.toFixed(1)} / ${R.seconds} s` : `${left.toFixed(1)} s`;
  let why: string;
  if (who !== p) why = reviving ? 'Hold fire · stay close' : `Stand next to them and hold fire · ${R.seconds} s`;
  else if (reviving) why = `${helper?.name ?? 'A teammate'} is getting you up · stay still`;
  else {
    const mates = w.actors.filter((m) => m !== p && m.team === p.team && standing(m));
    // An AI teammate that has taken the job (its brain says so); else the nearest one, whom you crawl to.
    const coming = mates.find((m) => (w.brains.get(m.id) as Brain | undefined)?.rescuing === p.id);
    const near = mates.reduce<Actor | undefined>((b, m) => (!b || dist(m) < dist(b) ? m : b), undefined);
    why = coming ? `${coming.name} is coming · ${dist(coming)} m` : near ? `Nearest: ${near.name} ${dist(near)} m · crawl to them` : 'Nobody left to revive you';
  }
  // A hostile the player knows of (seen, heard, told) close to the downed one threatens the revive.
  let threat = Infinity;
  for (const c of intel.contacts.values()) {
    if (c.state === 'lost' || c.state === 'directional' || c.state === 'suspected') continue;
    threat = Math.min(threat, Math.hypot(c.x - who.x, c.y - who.y));
  }
  if (threat <= THREAT_RANGE) why += ` · Hostile ${Math.round(threat)} m`;
  return { head, big, why, share: reviving ? who.reviveProgress / R.seconds : left / R.bleedSeconds, reviving };
}
