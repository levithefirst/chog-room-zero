// A token's real traits from the verified catalogue (src/nft/trait-table.ts), and the one behind its superpower.
import { TRAIT_CATEGORIES, TRAIT_COLUMNS, TRAIT_VALUES } from './trait-table.js';
import { POWER_TRAITS } from './power-table.js';

const D = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';

/** Every trait the token has, in display order, or [] for an id outside the collection. */
export function traitsOf(metadataId: number | null | undefined): { category: string; value: string }[] {
  if (!metadataId || !Number.isInteger(metadataId) || metadataId < 1 || metadataId > 1969) return [];
  const out: { category: string; value: string }[] = [];
  for (const c of TRAIT_CATEGORIES) {
    const s = TRAIT_COLUMNS[c], k = (metadataId - 1) * 2;
    const i = D.indexOf(s[k]) * 64 + D.indexOf(s[k + 1]);
    if (i > 0) out.push({ category: c, value: TRAIT_VALUES[c][i - 1] });
  }
  return out;
}

/** The trait that gives this token the power ("Eyes: Gradient visor"), or null. */
export function powerTraitOf(metadataId: number | null | undefined, power: string): { category: string; value: string } | null {
  const t = traitsOf(metadataId);
  for (const f of POWER_TRAITS) {
    if (f.power !== power) continue;
    const hit = t.find((x) => x.category === f.category && ((f.values as readonly string[])[0] === '*' || (f.values as readonly string[]).includes(x.value)));
    if (hit) return hit;
  }
  return null;
}
