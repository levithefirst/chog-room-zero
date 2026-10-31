// Prerenders one library page into the HTML shell (build time). The shell's <head> (CSS and the small client script)
// comes from Vite's processed library/index.html; this fills the body.
import type { Page } from './types';
import { PAGES, pageBySlug } from './pages';
import { esc, href } from './html';

const GROUPS: { id: Page['group']; label: string }[] = [
  { id: 'Start', label: 'Start' }, { id: 'Play', label: 'Play' }, { id: 'Know', label: 'Know the game' }, { id: 'Maps', label: 'Maps' }, { id: 'Account', label: 'Progress' }, { id: 'Help', label: 'Help' },
];

function nav(cur: Page): string {
  return GROUPS.map((g) => {
    const ps = PAGES.filter((p) => p.group === g.id);
    return `<div class="nav-g"><p class="nav-h">${g.label}</p><ul>${ps.map((p) => `<li><a href="${href(p.slug)}"${p.slug === cur.slug ? ' aria-current="page"' : ''}>${esc(p.slug === '' ? 'Library home' : p.title)}</a></li>`).join('')}</ul></div>`;
  }).join('');
}

function crumbs(p: Page): string {
  if (p.slug === '') return '';
  const parts = [`<li><a href="${href('')}">Library</a></li>`];
  if (p.slug.startsWith('maps/')) parts.push(`<li><a href="${href('maps')}">Maps</a></li>`);
  parts.push(`<li><span aria-current="page">${esc(p.title)}</span></li>`);
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${parts.join('')}</ol></nav>`;
}

function prevNext(p: Page): string {
  const i = PAGES.indexOf(p), prev = PAGES[i - 1], next = PAGES[i + 1];
  const a = (q: Page | undefined, dir: string) => (q ? `<a class="pn ${dir}" href="${href(q.slug)}" rel="${dir}"><small>${dir === 'prev' ? 'Previous' : 'Next'}</small><b>${esc(q.slug === '' ? 'Library home' : q.title)}</b></a>` : '<span></span>');
  return `<nav class="prevnext" aria-label="Previous and next page">${a(prev, 'prev')}${a(next, 'next')}</nav>`;
}

function related(p: Page): string {
  const rs = p.related.map(pageBySlug).filter((x): x is Page => !!x);
  if (!rs.length) return '';
  return `<aside class="related" aria-labelledby="rel-h"><h2 id="rel-h">Related</h2><ul>${rs.map((r) => `<li><a href="${href(r.slug)}"><b>${esc(r.title)}</b><span>${esc(r.summary)}</span></a></li>`).join('')}</ul></aside>`;
}

export function renderBody(p: Page): string {
  const toc = p.sections.length > 2 && p.slug !== '' ? `<nav class="toc" aria-labelledby="toc-h"><p id="toc-h">On this page</p><ol>${p.sections.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('')}</ol></nav>` : '';
  const head = p.slug === '' ? (p.lead ?? '') : `<header class="page-h">${crumbs(p)}<p class="kicker">${esc(GROUPS.find((g) => g.id === p.group)!.label)}</p><h1>${esc(p.title)}</h1><p class="lede">${esc(p.summary)}</p></header>${p.lead ?? ''}`;
  const body = p.sections.map((s) => `<section id="${s.id}" class="sec" aria-labelledby="${s.id}-h"><h2 id="${s.id}-h"><a class="anchor" href="#${s.id}" aria-label="Link to ${esc(s.title)}">#</a>${esc(s.title)}</h2>${s.html}</section>`).join('');
  return `<a class="skip" href="#main">Skip to content</a>
<header class="top" role="banner"><button class="menu-btn" type="button" aria-controls="nav" aria-expanded="false" aria-label="Open the navigation">&#9776;</button>
<a class="brand" href="${href('')}"><span class="b1">CHOG: ROOM ZERO</span><span class="b2">GAME LIBRARY</span></a>
<button class="search-btn" type="button" data-open-search aria-label="Search the library (press / or Ctrl K)"><span aria-hidden="true">&#9906;</span><span class="sl">Search</span><kbd>/</kbd></button>
<button class="theme-btn" type="button" data-theme-toggle aria-label="Switch to the light theme" aria-pressed="false"><span aria-hidden="true">&#9680;</span></button>
<a class="play-btn" href="/">Play</a></header>
<div class="layout"><nav id="nav" class="side" aria-label="Library"><div class="side-in">${nav(p)}</div></nav><div class="scrim" data-close-nav hidden></div>
<main id="main" tabindex="-1"><article class="page${p.slug === '' ? ' home' : ''}">${head}${toc}${body}${related(p)}${prevNext(p)}</article>
<footer class="foot"><p>Chog: Room Zero game library. Every number is read from the game's code at build time. Screenshots are from the game running in headless Chrome.</p><p><a href="/">Play the game</a> &middot; <a href="${href('faq')}">FAQ</a></p></footer></main></div>
<div class="search-dlg" data-search hidden role="dialog" aria-modal="true" aria-labelledby="search-h"><div class="search-box"><h2 id="search-h" class="sr">Search the library</h2><div class="search-row"><label class="sr" for="search-q">Search</label><input id="search-q" type="search" placeholder="Search: armour, revive, Metro, 5v5..." autocomplete="off" aria-controls="search-res" aria-describedby="search-help"><button type="button" data-close-search aria-label="Close search">Esc</button></div><p id="search-help" class="small">Arrow keys move through results, Enter opens one.</p><ol id="search-res" class="search-res" role="listbox" aria-label="Results"></ol></div></div>`;
}

export function pageTitle(p: Page): string {
  return p.slug === '' ? 'Chog: Room Zero | The Official Game Library' : `${p.title} | Chog: Room Zero Game Library`;
}
