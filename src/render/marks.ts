// Sound marks (CF-C/D): which sounds of yours draw a noise ring, and which mark a heard sound gets. Plain data, no
// Pixi, so the rules are unit-tested (tests/cf-lab.test.ts).
import type { SoundType } from '../sim/world';
import type { MarkKind } from './render';

// CF-C: the sounds of your own that draw a noise ring (what an enemy could hear from you, out to where they hear it).
export const OWN_NOISE = new Set<SoundType>(['step', 'quietStep', 'reload', 'dash', 'barrier', 'mend', 'windup', 'shield', 'frenzy', 'throw']);
/** CF-D: which mark a heard sound gets. */
export function markKind(t: SoundType): MarkKind {
  if (t === 'step' || t === 'quietStep') return 'step';
  if (t === 'shot') return 'shot';
  if (t === 'reload') return 'reload';
  if (t === 'impact' || t === 'hit') return 'impact';
  if (t === 'throw' || t === 'bounce' || t === 'boom') return 'grenade';
  if (t === 'death' || t === 'downed') return 'death';
  if (t === 'pickup' || t === 'revive') return 'other';
  return 'ability';
}
