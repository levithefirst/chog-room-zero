// V2 kill feed (forensic report: "no kill feed"): one line per knock-out or down, from what the game already tells
// the player (solo: the sim's hits; online: the server sends every knock-out to everyone, placed only as a spot).
import type { Actor } from '../sim/world';
import { esc } from './screens';

export interface FeedLine { html: string; mine: boolean; down: boolean; t: number }

/** "You ▸ Ray" (a kill), "Bill ✸ You · down" (a grenade down). Your side's names in team colour, the other side's in red. */
export function feedLine(me: Actor, by: Actor | undefined, target: Actor, killed: boolean, grenade: boolean, t: number): FeedLine {
  const nm = (x: Actor) => `<b class="${x.team === me.team ? 'f' : 'h'}">${esc(x === me ? 'You' : x.name)}</b>`;
  return { html: `${by ? nm(by) : '<b class="h">Zone</b>'} ${grenade ? '✸' : '▸'} ${nm(target)}${killed ? '' : ' · down'}`, mine: by === me || target === me, down: !killed, t };
}

/** The feed after a new line: newest first, at most four, none older than six seconds. */
export function feedAdd(feed: FeedLine[], line: FeedLine): FeedLine[] {
  return [line, ...feed.filter((f) => line.t - f.t < 6)].slice(0, 4);
}
