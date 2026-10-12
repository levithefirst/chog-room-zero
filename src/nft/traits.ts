// NFT DEMO trait mapping (RC-1). DEMO ONLY: no wallet is connected and no ownership is checked; a token number
// you type maps deterministically to traits (Option B in docs/design/nft.md). Real Chog metadata is not read.
import { markingFor, operatorFor, SIDEGRADES, type Sidegrade } from '../sim/operators';

export const DEMO_COPY = 'DEMO: no wallet is connected and no ownership is checked. Traits come only from the token number.';

export interface TraitInfo { id: string; name: string; effect: string; counterplay: string }

/** Tactical effect + counterplay per sidegrade. Sidegrades only: health, armour, damage and speed never change. */
export const TRAIT_INFO: Record<string, TraitInfo> = {
  lamp: { id: 'lamp', name: 'Lamp', effect: 'Sight 22% longer, cone 28% narrower. Spots enemies down halls first.', counterplay: 'Come from the side: its flanks are dark. Close fights in rooms favour you.' },
  wide: { id: 'wide', name: 'Wide', effect: 'Cone 40% wider, sight 17% shorter. Owns rooms and corners.', counterplay: 'Stay at range down a corridor: it sees little far ahead.' },
  steady: { id: 'steady', name: 'Steady', effect: 'Tighter spread, reload 30% faster; 30% smaller magazine, 12% slower fire.', counterplay: 'Push when it reloads: short magazines run dry often.' },
  spray: { id: 'spray', name: 'Spray', effect: 'Magazine 40% larger, slightly faster fire; looser spread, reload 40% slower.', counterplay: 'Fight at range where spread hurts; punish the long reload.' },
};

const MARKING_NAMES: Record<number, string> = { 0x8fa3a8: 'Slate', 0xa79c7a: 'Brass', 0x9a8fb0: 'Lilac', 0x7f9a7a: 'Moss', 0xb08f84: 'Clay' };

export interface DemoTraits { tokenId: string; sidegrade: Sidegrade; info: TraitInfo; marking: number; markingName: string }

export function isTokenId(s: string): boolean { return /^\d{1,10}$/.test(s); }

/** Deterministic: the same token number always gives the same traits (FNV-1a for the sidegrade, a hash for the marking). */
export function traitsFor(tokenId: string): DemoTraits {
  const sidegrade = operatorFor(tokenId);
  const marking = markingFor(tokenId);
  return { tokenId, sidegrade, info: TRAIT_INFO[sidegrade.id], marking, markingName: MARKING_NAMES[marking] ?? 'Plain' };
}

/** Sample token numbers shown on the DEMO screen: one per sidegrade, found deterministically. */
export function sampleTokens(): string[] {
  const out: string[] = [];
  for (const s of SIDEGRADES) for (let i = 1; i < 500; i++) if (operatorFor(String(i)).id === s.id) { out.push(String(i)); break; }
  return out;
}
