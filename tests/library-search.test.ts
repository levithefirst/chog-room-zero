// Library search: the owner's queries must land on the section that answers them (top hit), from the same index the
// build writes to dist/library/search-index.json.
import { describe, it, expect } from 'vitest';
import { buildIndex } from '../src/library/pages';
import { search, tokens } from '../src/library/search';

const index = buildIndex();
const top = (q: string) => search(index, q, 5).map((h) => `${h.e.p}#${h.e.s}`);

const CASES: [string, string][] = [
  ['armour', 'combat#health'],
  ['revive', 'combat#revive'],
  ['Metro', 'maps/metro#identity'],
  ['5v5', 'game-modes#5v5'],
  ['CHOG trait', 'chog-traits#chog-traits'],
  ['footsteps', 'movement-sound#footsteps'],
  ['reload', 'weapons#reload'],
  ['how do I win', 'how-to-play#win'],
];

describe('library search', () => {
  for (const [q, want] of CASES) {
    it(`"${q}" -> ${want}`, () => {
      const hits = top(q);
      expect(hits[0], `top hits: ${hits.join(', ')}`).toBe(want);
    });
  }
  it('armor and armour are the same word', () => {
    expect(top('armor')[0]).toBe(top('armour')[0]);
    expect(tokens('Armor')).toEqual(tokens('armour'));
  });
  it('every hit points at a real page section', () => {
    const ids = new Set(index.map((e) => `${e.p}#${e.s}`));
    for (const [q] of CASES) for (const h of top(q)) expect(ids.has(h)).toBe(true);
  });
  it('a query with no match returns nothing', () => {
    expect(search(index, 'zzqxw')).toEqual([]);
  });
});
