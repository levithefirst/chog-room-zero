// V2 kill feed: who got whom, your lines marked, newest first, four at most, six seconds each.
import { describe, expect, it } from 'vitest';
import { createWorld, player } from '../src/sim/world';
import { feedAdd, feedLine, type FeedLine } from '../src/ui/feed';

describe('kill feed', () => {
  const w = createWorld({ seed: 1, hero: 'benja', allies: [{ name: 'Toad', hero: 'toad' }] });
  const me = player(w), mate = w.actors[1], foe = w.actors[2];
  it('names you as You, colours by side, marks downs and grenades', () => {
    const a = feedLine(me, me, foe, true, false, 1);
    expect(a.html).toBe(`<b class="f">You</b> ▸ <b class="h">${foe.name}</b>`);
    expect(a.mine).toBe(true);
    const b = feedLine(me, foe, mate, false, true, 2);
    expect(b.html).toBe(`<b class="h">${foe.name}</b> ✸ <b class="f">Toad</b> · down`);
    expect(b.mine).toBe(false);
    expect(feedLine(me, undefined, me, true, false, 3).html).toContain('Zone');
  });
  it('newest first, four at most, lines older than 6 s drop off', () => {
    let f: FeedLine[] = [];
    for (let i = 0; i < 6; i++) f = feedAdd(f, feedLine(me, me, foe, true, false, i));
    expect(f).toHaveLength(4);
    expect(f.map((x) => x.t)).toEqual([5, 4, 3, 2]);
    f = feedAdd(f, feedLine(me, me, foe, true, false, 10));
    expect(f.map((x) => x.t)).toEqual([10, 5]);
  });
  it('escapes names', () => {
    const odd = { ...foe, name: '<img>' };
    expect(feedLine(me, me, odd, true, false, 0).html).not.toContain('<img>');
  });
});
