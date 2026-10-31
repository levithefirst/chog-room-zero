// Library search: a small index built at build time from every page section (vite.library.config.ts writes it as
// search-index.json), and a scorer that runs in the browser. No dependencies; tests/library-search.test.ts checks
// that the owner's queries land on the right section.
export interface Entry { p: string; s: string; pt: string; t: string; x: string; k: string }
export interface Hit { e: Entry; score: number }

const STOP = new Set(['how', 'do', 'does', 'i', 'a', 'an', 'the', 'to', 'is', 'can', 'what', 'of', 'and', 'in', 'on', 'my', 'me', 'it', 'are', 'for', 'with', 'be', 'get', 'you', 'your', 'this', 'there', 'about', 'where', 'which', 'does', 'use', 'should', 'work']);
const CANON: Record<string, string> = {
  armor: 'armour', armors: 'armour', armours: 'armour', shield: 'armour', nade: 'grenade', nades: 'grenade', grenades: 'grenade',
  footstep: 'footsteps', steps: 'footsteps', step: 'footsteps', revives: 'revive', revived: 'revive', reviving: 'revive', rescue: 'revive',
  reloading: 'reload', reloads: 'reload', maps: 'map', traits: 'trait', operators: 'operator', characters: 'operator', character: 'operator', heroes: 'operator', hero: 'operator',
  guns: 'weapon', gun: 'weapon', weapons: 'weapon', medals: 'medal', achievements: 'medal', achievement: 'medal', winning: 'win', wins: 'win', won: 'win', victory: 'win',
  colour: 'color', sneak: 'creep', crouch: 'creep', quiet: 'creep', creeping: 'creep', keys: 'controls', bindings: 'controls', control: 'controls', storm: 'zone', circle: 'zone',
  sounds: 'sound', noise: 'sound', supplies: 'pickup', pickups: 'pickup', supply: 'pickup', powers: 'superpower', superpowers: 'superpower', nft: 'chog', nfts: 'chog', friend: 'friends', mates: 'friends',
};
export const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export function tokens(s: string): string[] {
  return norm(s).split(' ').filter((w) => w && !STOP.has(w)).map((w) => CANON[w] ?? w);
}
const phrase = (s: string) => tokens(s).join(' ');

/** Ranked hits for a query (best first). Help-group pages score a little lower so the full explanation wins ties. */
export function search(index: readonly Entry[], q: string, limit = 12): Hit[] {
  const qt = tokens(q);
  if (!qt.length) return [];
  const qp = qt.join(' ');
  const hits: Hit[] = [];
  for (const e of index) {
    const tt = tokens(e.t), kt = tokens(e.k), pt = tokens(e.pt), xt = tokens(e.x);
    let score = 0, matched = 0;
    for (const w of qt) {
      let m = 0;
      if (tt.includes(w)) m += 8;
      if (kt.includes(w)) m += 5;
      if (pt.includes(w)) m += 3;
      const c = xt.filter((x) => x === w).length;
      m += Math.min(3, c);
      if (!m && w.length > 3 && (tt.some((x) => x.startsWith(w)) || kt.some((x) => x.startsWith(w)))) m += 3;
      if (m) matched++;
      score += m;
    }
    // A section that lists the reader's exact question as a keyword answers it.
    const exact = e.k.split(' | ').some((k) => norm(k) === norm(q));
    if (exact) { score += 40; matched = Math.max(matched, qt.length); }
    if (!matched) continue;
    if (qt.length > 1) {
      if (phrase(e.t).includes(qp)) score += 15;
      if (phrase(e.k).includes(qp)) score += 10;
      if (phrase(e.x).includes(qp)) score += 4;
    } else {
      if (phrase(e.t).split(' ').includes(qp)) score += 15;
      if (kt.includes(qp)) score += 10;
    }
    score *= matched / qt.length;
    if (e.p === 'faq' && qt.length === 1) score *= 0.9;
    hits.push({ e, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** A short excerpt of the section text around the first query word. */
export function snippet(e: Entry, q: string, len = 140): string {
  const words = norm(q).split(' ').filter((w) => w.length > 2 && !STOP.has(w));
  const low = e.x.toLowerCase();
  let at = -1;
  for (const w of words) { at = low.indexOf(w); if (at >= 0) break; }
  const start = Math.max(0, at < 0 ? 0 : at - 40);
  return (start > 0 ? '... ' : '') + e.x.slice(start, start + len).trim() + (start + len < e.x.length ? ' ...' : '');
}
