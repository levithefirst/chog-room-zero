// Every library route renders; internal links, anchors and images resolve; images and diagrams have alt text; no
// placeholder text; the browser bundle imports nothing from the game.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PAGES } from '../src/library/pages';
import { renderBody, pageTitle } from '../src/library/render';

const ROUTES = ['', 'start-here', 'how-to-play', 'combat', 'chog-traits', 'maps', 'maps/room-zero', 'maps/office', 'maps/supermarket', 'maps/metro', 'maps/construction',
  'game-modes', 'multiplayer', 'weapons', 'movement-sound', 'progression', 'rewards', 'medals', 'controls', 'faq'];
const rendered = new Map(PAGES.map((p) => [p.slug, renderBody(p)]));
const idsOf = (h: string) => new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const shotDir = 'library/public/library/shots';

describe('library pages', () => {
  it('has every route the brief lists', () => {
    for (const r of ROUTES) expect(rendered.has(r), r).toBe(true);
    expect(PAGES.length).toBe(20); // home + 19 (the maps index and 5 map pages included)
  });
  for (const p of PAGES) {
    it(`/library/${p.slug} renders`, () => {
      const h = rendered.get(p.slug)!;
      expect(h.length).toBeGreaterThan(2000);
      expect(pageTitle(p)).toContain('Chog: Room Zero');
      expect(h.match(/<h1[\s>]/g)?.length, 'one h1').toBe(1);
      if (p.slug) { expect(h).toContain('class="crumbs"'); expect(h).toContain('class="related"'); }
      expect(h).toContain('class="prevnext"');
      expect(p.sections.length).toBeGreaterThan(0);
      const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      expect(ids.length, 'ids are unique').toBe(new Set(ids).size);
    });
  }
  it('internal links and anchors resolve', () => {
    const bad: string[] = [];
    for (const [slug, h] of rendered) {
      for (const [, url] of h.matchAll(/href="([^"]+)"/g)) {
        if (url === '/' || /^https?:/.test(url)) continue;
        if (url.startsWith('#')) { if (!idsOf(h).has(url.slice(1))) bad.push(`${slug}: ${url}`); continue; }
        const m = url.match(/^\/library\/(?:(.*?)\/)?(?:#(.+))?$/);
        if (!m) { bad.push(`${slug}: ${url}`); continue; }
        const target = rendered.get(m[1] ?? '');
        if (target === undefined) bad.push(`${slug}: ${url}`);
        else if (m[2] && !idsOf(target).has(m[2])) bad.push(`${slug}: ${url} (no anchor)`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('images exist, are WebP, lazy below the fold, sized and described', () => {
    let count = 0;
    for (const [slug, h] of rendered) {
      for (const [tag] of h.matchAll(/<img\b[^>]*>/g)) {
        count++;
        const src = tag.match(/src="([^"]+)"/)![1];
        expect(src, slug).toMatch(/^\/library\/shots\/[a-z0-9-]+\.webp$/);
        expect(fs.existsSync(`${shotDir}/${src.replace('/library/shots/', '')}`), src).toBe(true);
        expect(tag, src).toMatch(/alt="[^"]{12,}"/);
        expect(tag, src).toMatch(/width="\d+" height="\d+"/);
        expect(tag, src).toMatch(/loading="(lazy|eager)"/);
      }
    }
    expect(count).toBeGreaterThan(15);
  });
  it('every drawn SVG figure is labelled', () => {
    for (const [slug, h] of rendered) {
      for (const [tag] of h.matchAll(/<svg\b[^>]*>/g)) {
        if (/aria-hidden="true"/.test(tag)) continue;
        expect(/role="img"/.test(tag) && /aria-label(ledby)?="/.test(tag), `${slug}: ${tag.slice(0, 80)}`).toBe(true);
      }
    }
  });
  it('no placeholder text', () => {
    for (const [slug, h] of rendered) expect(h, slug).not.toMatch(/\b(TODO|TBD|FIXME|lorem|ipsum|coming soon|placeholder text)\b/i);
  });
  it('prev/next walk the whole library in order', () => {
    for (let i = 1; i < PAGES.length; i++) expect(rendered.get(PAGES[i].slug)).toContain(`rel="prev"`);
    expect(rendered.get('')).not.toContain('rel="prev"');
    expect(rendered.get(PAGES[PAGES.length - 1].slug)).not.toContain('rel="next"');
  });
  it('the browser bundle imports nothing from the game', () => {
    const client = fs.readFileSync('src/library/client.ts', 'utf8'), search = fs.readFileSync('src/library/search.ts', 'utf8');
    expect([...client.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])).toEqual(['./search']);
    expect(search).not.toMatch(/^import [^t]/m);
  });
  it('the game build config is untouched by the library build', () => {
    const cfg = fs.readFileSync('vite.config.ts', 'utf8');
    expect(cfg).not.toContain('library');
    expect(JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts.build).toBe('tsc --noEmit && vite build && vite build -c vite.library.config.ts');
  });
});

describe('the game links to the library', () => {
  it('Game Docs carries a link to /library/ that opens in a new tab (never leaves a match)', async () => {
    const { docsHtml } = await import('../src/ui/docs');
    const h = docsHtml(false, null, '');
    expect(h).toMatch(/<a id="docslib" href="\/library\/" target="_blank" rel="noopener">/);
  });
});
