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

  // Player test: twelve newcomer questions (a stated set; the owner's own twelve were not in the brief). The section
  // that answers each must be in the top three hits.
  const NEWCOMER: [string, string][] = [
    ['How do I start my first match?', 'how-to-play#hub'], ['What are the PC controls?', 'controls#desktop'], ['How do I play on my phone?', 'controls#touch'],
    ['How do I win?', 'how-to-play#win'], ['What does armour do?', 'combat#health'], ['Can a teammate revive me?', 'combat#revive'],
    ["Why can't I see the enemy?", 'faq#see'], ['Can enemies hear my footsteps?', 'movement-sound#footsteps'], ['Which operator should I pick?', 'chog-traits#roster'],
    ['Do I need an NFT to play?', 'faq#nft'], ['How do I play with friends?', 'multiplayer#squads'], ['What do I earn from a match?', 'rewards#table'],
  ];
  for (const [q, want] of NEWCOMER) it(`newcomer: "${q}" -> ${want}`, () => expect(top(q).slice(0, 3)).toContain(want));
});
