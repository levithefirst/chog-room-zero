// The library's pages in reading order (prev/next follow it), plus the search index built from them. Build time only.
import type { Page } from './types';
import { CORE } from './pages-core';
import { chogTraits } from './pages-chog';
import { mapsIndex, MAP_PAGES } from './pages-maps';
import { PLAY_PAGES } from './pages-play';
import type { Entry } from './search';

const [home, startHere, howToPlay, combat, movementSound, weapons] = CORE;
const [gameModes, multiplayer, progression, rewards, medals, controls, faq] = PLAY_PAGES;

export const PAGES: Page[] = [home, startHere, howToPlay, gameModes, controls, combat, movementSound, weapons, chogTraits, mapsIndex, ...MAP_PAGES, multiplayer, progression, rewards, medals, faq];

export const pageBySlug = (slug: string) => PAGES.find((p) => p.slug === slug);

export const strip = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#176;/g, '°').replace(/&sup2;/g, '²').replace(/&middot;|&#183;/g, '·').replace(/&minus;/g, '-').replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ').trim();

export function buildIndex(pages: readonly Page[] = PAGES): Entry[] {
  const out: Entry[] = [];
  for (const p of pages) {
    p.sections.forEach((s, i) => {
      out.push({ p: p.slug, s: s.id, pt: p.title, t: s.title, x: strip(s.html).slice(0, 1200), k: [...(s.keywords ?? []), ...(i === 0 ? p.keywords ?? [] : [])].join(' | ') });
    });
  }
  return out;
}
