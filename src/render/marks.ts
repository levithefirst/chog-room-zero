// Sound marks (CF-C/D): which sounds of yours draw a noise ring. The heard-mark kinds live with the contact model
// (src/sim/intel.ts markKind); re-exported here so existing imports keep working. Plain data, unit-tested.
import type { SoundType } from '../sim/world';
export { markKind } from '../sim/intel';

// CF-C: the sounds of your own that draw a noise ring (what an enemy could hear from you, out to where they hear it).
export const OWN_NOISE = new Set<SoundType>(['step', 'quietStep', 'reload', 'dash', 'barrier', 'mend', 'windup', 'shield', 'frenzy', 'throw']);
