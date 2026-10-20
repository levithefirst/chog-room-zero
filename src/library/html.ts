// Tiny HTML helpers for the prerendered library pages (build time).
import fs from 'node:fs';
import path from 'node:path';

export const esc = (s: string | number) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const n = (v: number, d = 1) => (Number.isInteger(v) ? String(v) : v.toFixed(d).replace(/\.0+$/, ''));

export function table(head: string[], rows: (string | number)[][], caption?: string, cls = ''): string {
  return `<div class="tbl-wrap" tabindex="0" role="region" aria-label="${esc(caption ?? head.join(', '))}"><table class="${cls}">${caption ? `<caption>${esc(caption)}</caption>` : ''}<thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export const facts = (pairs: [string, string | number][]) => `<dl class="facts">${pairs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
export const note = (html: string, kind: 'tip' | 'rule' | 'warn' = 'tip') => `<aside class="callout ${kind}"><b>${kind === 'tip' ? 'Tip' : kind === 'rule' ? 'Rule' : 'Watch out'}</b><div>${html}</div></aside>`;
export const ul = (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
export const ol = (items: string[]) => `<ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
export const link = (slug: string, text: string, hash = '') => `<a href="${href(slug)}${hash ? `#${hash}` : ''}">${text}</a>`;
export const href = (slug: string) => `/library/${slug ? `${slug}/` : ''}`;

export interface ShotInfo { w: number; h: number; alt: string }
let manifest: Record<string, ShotInfo> | null = null;
export const SHOT_DIR = path.resolve(process.cwd(), 'library/public/library/shots');
export function shots(): Record<string, ShotInfo> {
  if (!manifest) {
    try { manifest = JSON.parse(fs.readFileSync(path.join(SHOT_DIR, 'manifest.json'), 'utf8')); } catch { manifest = {}; }
  }
  return manifest!;
}
/** A real screenshot from the running game (tools/library-shots.mjs), lazy, with its size; nothing if it was not captured. */
export function shot(name: string, caption: string, eager = false): string {
  const s = shots()[name];
  if (!s) return '';
  return `<figure class="shot"><img src="/library/shots/${name}.webp" width="${s.w}" height="${s.h}" alt="${esc(s.alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async"><figcaption>${caption} <span class="src">Screenshot of the game (headless Chrome, local build).</span></figcaption></figure>`;
}
export const hasShot = (name: string) => !!shots()[name];
export const figure = (svg: string, caption: string, cls = 'diagram') => `<figure class="${cls}">${svg}<figcaption>${caption}</figcaption></figure>`;
