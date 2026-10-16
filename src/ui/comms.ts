// SB: an AI teammate's call-out in words. Short, plain, said the way a squadmate would: what, and which way from YOU.
// Pure (unit-tested in tests/sb-comms.test.ts); main.ts shows it above the teammate and plays the squelch.
import type { CommsEvent } from '../sim/world';

/** Eight-way direction from (dx, dy), screen north up. */
export function compass(dx: number, dy: number): string {
  const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const i = Math.round(((Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return names[i];
}

/** The line for a call, with the direction measured from the player at (px, py). */
export function commsLine(e: CommsEvent, px: number, py: number): string {
  const dir = compass(e.x - px, e.y - py);
  switch (e.kind) {
    case 'contact': return `Contact, ${dir}.`;
    case 'behind': return 'Behind us!';
    case 'lost': return e.heading !== undefined ? `Lost him. Heading ${compass(Math.cos(e.heading), Math.sin(e.heading))}.` : 'Lost him.';
    case 'steps': return `Footsteps, ${dir}.`;
    case 'shots': return `Shots, ${dir}.`;
    case 'reloading': return 'Reloading!';
    case 'hurt': return "I'm hit, cover me!";
  }
}
