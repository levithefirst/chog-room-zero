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

export interface Callout { x: number; y: number; w: number; h: number; t: string }
export interface ShotInfo { w: number; h: number; alt: string; callouts?: Callout[]; staged?: boolean; file?: string }
let manifest: Record<string, ShotInfo> | null = null;
export const SHOT_DIR = path.resolve(process.cwd(), 'library/public/library/shots');
export function shots(): Record<string, ShotInfo> {
  if (!manifest) {
    try { manifest = JSON.parse(fs.readFileSync(path.join(SHOT_DIR, 'manifest.json'), 'utf8')); } catch { manifest = {}; }
  }
  return manifest!;
}
/**
 * A real screenshot from the running game (tools/library-shots.mjs), lazy, with its size; nothing if it was not
 * captured. Callouts (boxes the tool measured from the game's own DOM) are drawn as an SVG over the image, numbered,
 * and listed in the caption so they are readable without the picture.
 */
export function shot(name: string, caption: string, eager = false): string {
  const s = shots()[name];
  if (!s) return '';
  const cs = s.callouts ?? [];
  const svg = cs.length ? `<svg class="callouts" viewBox="0 0 ${s.w} ${s.h}" preserveAspectRatio="none" aria-hidden="true">${cs.map((c, i) => {
    const cx = Math.max(18, Math.min(s.w - 18, c.x)), cy = Math.max(18, Math.min(s.h - 18, c.y));
    return `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="6"/><circle cx="${cx}" cy="${cy}" r="16"/><text x="${cx}" y="${cy + 8}" text-anchor="middle">${i + 1}</text>`;
  }).join('')}</svg>` : '';
  const marks = cs.length ? `<ol class="marks">${cs.map((c) => `<li>${esc(c.t)}</li>`).join('')}</ol>` : '';
  return `<figure class="shot"><div class="frame"><img src="/library/shots/${s.file ?? name}.webp" width="${s.w}" height="${s.h}" alt="${esc(s.alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async">${svg}</div><figcaption>${caption}${marks}<span class="src">Screenshot of the game (headless Chrome, local build)${s.staged ? '; this state was set through the game\'s debug hook' : ''}.</span></figcaption></figure>`;
}
export const hasShot = (name: string) => !!shots()[name];
export const figure = (svg: string, caption: string, cls = 'diagram') => `<figure class="${cls}">${svg}<figcaption>${caption}</figcaption></figure>`;
