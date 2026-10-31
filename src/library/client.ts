// The library's only script: theme, navigation drawer, search, map guide and medal filter. Pages are prerendered,
// so everything here is progressive: the content reads fine without it. Imports nothing from the game.
import './library.css';
import { search, snippet, type Entry } from './search';

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Theme (dark default, persisted) ----
function theme() {
  const btn = $<HTMLButtonElement>('[data-theme-toggle]');
  const sync = () => {
    const light = document.documentElement.dataset.theme === 'light';
    btn?.setAttribute('aria-pressed', String(light));
    btn?.setAttribute('aria-label', light ? 'Switch to the dark theme' : 'Switch to the light theme');
    $('meta[name="theme-color"]')?.setAttribute('content', light ? '#FBF8FF' : '#0E091C');
  };
  btn?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('chog-lib-theme', next); } catch { /* private mode */ }
    sync();
  });
  sync();
}

// ---- Drawer ----
function drawer() {
  const btn = $<HTMLButtonElement>('.menu-btn'), nav = $('#nav'), scrim = $('[data-close-nav]');
  if (!btn || !nav || !scrim) return;
  const set = (open: boolean) => {
    document.body.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close the navigation' : 'Open the navigation');
    scrim.hidden = !open;
    if (open) ($('a[aria-current]', nav) ?? $('a', nav))?.focus(); else btn.focus();
  };
  btn.addEventListener('click', () => set(!document.body.classList.contains('nav-open')));
  scrim.addEventListener('click', () => set(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) set(false); });
}

// ---- Search ----
function searchUi() {
  const dlg = $('[data-search]'), input = $<HTMLInputElement>('#search-q'), list = $('#search-res');
  if (!dlg || !input || !list) return;
  let index: Entry[] | null = null, loading: Promise<void> | null = null, sel = 0, opener: HTMLElement | null = null;
  const load = () => (loading ??= fetch('/library/search-index.json').then((r) => r.json()).then((j: Entry[]) => { index = j; }).catch(() => { index = []; }));
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const render = () => {
    const q = input.value.trim();
    if (!q) { list.innerHTML = '<li class="none">Try: armour, revive, Metro, 5v5, CHOG trait, footsteps, reload, how do I win</li>'; return; }
    if (!index) { list.innerHTML = '<li class="none">Loading...</li>'; void load().then(render); return; }
    const hits = search(index, q, 10);
    sel = 0;
    list.innerHTML = hits.length ? hits.map((h, i) => `<li role="presentation"><a role="option" id="sr-${i}" href="/library/${h.e.p ? `${h.e.p}/` : ''}#${h.e.s}" aria-selected="${i === 0}"><span class="rp">${esc(h.e.pt)}</span><span class="rt">${esc(h.e.t)}</span><span class="rx">${esc(snippet(h.e, q))}</span></a></li>`).join('')
      : `<li class="none">Nothing found for "${esc(q)}". Try another word, or browse the <a href="/library/faq/">FAQ</a>.</li>`;
    input.setAttribute('aria-activedescendant', hits.length ? 'sr-0' : '');
  };
  const move = (d: number) => {
    const opts = $$<HTMLAnchorElement>('a[role=option]', list);
    if (!opts.length) return;
    sel = (sel + d + opts.length) % opts.length;
    opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === sel)));
    opts[sel].scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', opts[sel].id);
  };
  const open = () => {
    opener = document.activeElement as HTMLElement;
    dlg.hidden = false; document.body.style.overflow = 'hidden';
    void load(); render(); input.focus(); input.select();
  };
  const close = () => { dlg.hidden = true; document.body.style.overflow = ''; opener?.focus(); };
  $$('[data-open-search]').forEach((b) => b.addEventListener('click', open));
  $('[data-close-search]')?.addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { const a = $$<HTMLAnchorElement>('a[role=option]', list)[sel]; if (a) { e.preventDefault(); close(); location.href = a.href; } }
  });
  list.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) close(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') { // keep focus inside the dialog
      const f = $$<HTMLElement>('input, button, a[href]', dlg);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const typing = t.closest('input, textarea, select, [contenteditable]');
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (dlg.hidden) open(); else close(); }
    else if (e.key === '/' && !typing && dlg.hidden) { e.preventDefault(); open(); }
  });
}

// ---- Map guide: pan and zoom the SVG's viewBox ----
function mapGuides() {
  for (const root of $$('[data-map-guide]')) {
    const view = $('.mg-view', root), svg = $<SVGSVGElement>('svg', view ?? root);
    if (!view || !svg) continue;
    const [, , W, H] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    let vb = { x: 0, y: 0, w: W, h: H };
    const apply = () => svg.setAttribute('viewBox', `${vb.x.toFixed(3)} ${vb.y.toFixed(3)} ${vb.w.toFixed(3)} ${vb.h.toFixed(3)}`);
    const clamp = () => {
      vb.w = Math.min(W * 1.2, Math.max(W / 8, vb.w)); vb.h = vb.w * (H / W);
      vb.x = Math.min(W - vb.w * 0.2, Math.max(-vb.w * 0.8, vb.x)); vb.y = Math.min(H - vb.h * 0.2, Math.max(-vb.h * 0.8, vb.y));
    };
    // The SVG keeps its aspect (meet), so map a client point through the rendered box.
    const toMap = (cx: number, cy: number) => {
      const r = view.getBoundingClientRect(), s = Math.min(r.width / vb.w, r.height / vb.h);
      const ox = (r.width - vb.w * s) / 2, oy = (r.height - vb.h * s) / 2;
      return { x: vb.x + (cx - r.left - ox) / s, y: vb.y + (cy - r.top - oy) / s, s };
    };
    const zoom = (f: number, cx?: number, cy?: number) => {
      const r = view.getBoundingClientRect();
      const p = toMap(cx ?? r.left + r.width / 2, cy ?? r.top + r.height / 2);
      const nw = Math.min(W * 1.2, Math.max(W / 8, vb.w / f)), k = nw / vb.w;
      vb = { x: p.x - (p.x - vb.x) * k, y: p.y - (p.y - vb.y) * k, w: nw, h: nw * (H / W) };
      clamp(); apply();
    };
    const orig = svg.getAttribute('viewBox')!;
    const fit = () => { vb = { x: 0, y: 0, w: W, h: H }; svg.setAttribute('viewBox', orig); };
    const pan = (dxPx: number, dyPx: number) => { const s = toMap(0, 0).s; vb.x -= dxPx / s; vb.y -= dyPx / s; clamp(); apply(); };
    $$<HTMLButtonElement>('[data-mg]', root).forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.mg; if (a === 'in') zoom(1.4); else if (a === 'out') zoom(1 / 1.4); else fit();
    }));
    view.addEventListener('wheel', (e) => { e.preventDefault(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    view.addEventListener('pointerdown', (e) => { view.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); view.classList.add('dragging'); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
    view.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId); if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      if (pts.size === 1) pan(cur.x - prev.x, cur.y - prev.y);
      pts.set(e.pointerId, cur);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && d > 0) zoom(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = d;
      }
    });
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); pinch = 0; if (!pts.size) view.classList.remove('dragging'); };
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
    view.addEventListener('dblclick', (e) => zoom(1.6, e.clientX, e.clientY));
    view.addEventListener('keydown', (e) => {
      const step = 40;
      const k: Record<string, () => void> = {
        ArrowLeft: () => pan(step, 0), ArrowRight: () => pan(-step, 0), ArrowUp: () => pan(0, step), ArrowDown: () => pan(0, -step),
        '+': () => zoom(1.4), '=': () => zoom(1.4), '-': () => zoom(1 / 1.4), _: () => zoom(1 / 1.4), '0': fit, f: fit, F: fit,
      };
      const fn = k[e.key]; if (fn) { e.preventDefault(); fn(); }
    });
    $$<HTMLInputElement>('[data-layer-toggle]', root).forEach((c) => c.addEventListener('change', () => {
      $$(`[data-layer="${c.dataset.layerToggle}"]`, svg).forEach((g) => g.classList.toggle('off', !c.checked));
    }));
  }
}

// ---- Medals: text search + rarity filter ----
function medals() {
  const tools = $('[data-medal-tools]');
  if (!tools) return;
  const q = $<HTMLInputElement>('#medal-q', tools)!, count = $('[data-medal-count]', tools)!;
  const items = $$<HTMLLIElement>('.medal-grid li');
  let rarity = 'all';
  const apply = () => {
    const t = q.value.trim().toLowerCase();
    let shown = 0;
    for (const li of items) { const ok = (rarity === 'all' || li.dataset.rarity === rarity) && (!t || li.dataset.text!.includes(t)); li.hidden = !ok; if (ok) shown++; }
    count.textContent = `${shown} of ${items.length} medals`;
  };
  q.addEventListener('input', apply);
  $$<HTMLButtonElement>('[data-rarity]', tools).forEach((b) => b.addEventListener('click', () => {
    rarity = b.dataset.rarity!;
    $$<HTMLButtonElement>('[data-rarity]', tools).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  }));
}

// Smooth in-page jumps unless the reader asked for reduced motion.
if (!reduced()) document.documentElement.style.scrollBehavior = 'smooth';
theme(); drawer(); searchUi(); mapGuides(); medals();
