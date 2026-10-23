// Library QA: every route at every viewport (headless Chrome emulation, NOT real devices).
import { browser, sleep } from './cdp.mjs';
import fs from 'node:fs';
const base = process.argv[2] ?? 'http://localhost:8996';
const ROUTES = ['', 'start-here', 'how-to-play', 'game-modes', 'controls', 'combat', 'movement-sound', 'weapons', 'chog-traits', 'maps', 'maps/room-zero', 'maps/office', 'maps/supermarket', 'maps/metro', 'maps/construction', 'multiplayer', 'progression', 'rewards', 'medals', 'faq'];
const VIEWS = [[320, 568], [390, 844], [412, 915], [844, 390], [915, 412], [1366, 768], [1920, 1080], [2560, 1440], [3440, 1440]];
const shotDir = process.env.SHOT_DIR ?? '/tmp/library-qa'; fs.mkdirSync(shotDir, { recursive: true });
const res = {};
const PROBE = `(async () => {
  const vw = innerWidth, out = [];
  if (document.documentElement.scrollWidth > vw + 1) out.push('page h-scroll ' + document.documentElement.scrollWidth);
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    if (el.closest('.tbl-wrap, .diagram, .controls, .mg-view, .side, .search-dlg, .sr, .skip, .card-img')) continue;
    if (r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') { out.push('clip ' + el.tagName + '.' + el.className + ' ' + Math.round(r.right)); if (out.length > 6) break; }
  }
  let small = 0;
  for (const el of document.querySelectorAll('main p, main li, main td, main th, main dt, main dd, main a, main span, main small, main figcaption, main label, main button, header a, header button')) {
    if (!el.getClientRects().length || el.closest('svg, .sr')) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < 12 && el.textContent.trim()) small++;
  }
  if (small) out.push('text<12px x' + small);
  const body = parseFloat(getComputedStyle(document.querySelector('main p') ?? document.body).fontSize);
  for (const img of document.querySelectorAll('img')) img.loading = 'eager';
  await new Promise((r) => setTimeout(r, 600));
  const imgs = [...document.querySelectorAll('img')];
  for (const img of imgs) { if (!img.complete || img.naturalWidth === 0) out.push('broken img ' + img.src); if (!img.alt) out.push('no alt ' + img.src); }
  return { out, body, imgs: imgs.length };
})()`;
for (const [w, h] of VIEWS) {
  const touch = w < 1000, key = `${w}x${h}`;
  const b = await browser(`q${w}`, { base, w, h, mobile: touch, touch });
  const cons = []; await b.cmd('Log.enable');
  b.on((m) => { if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') cons.push(m.params.args.map((a) => a.value ?? a.description).join(' ')); if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') cons.push(m.params.entry.text + ' ' + (m.params.entry.url ?? '')); });
  const r = (res[key] = { problems: [], body: null, imgs: 0, checks: {} });
  for (const route of process.env.QUICK ? [] : ROUTES) {
    await b.go(`/library/${route ? route + '/' : ''}`); await b.until(`document.readyState === 'complete'`, 8000); await sleep(150);
    const p = await b.ev(PROBE);
    if (!p) { r.problems.push(`${route || 'home'}: probe failed`); continue; }
    r.body = p.body; r.imgs += p.imgs;
    for (const x of p.out) r.problems.push(`${route || 'home'}: ${x}`);
    if (['', 'maps/metro', 'medals'].includes(route) && [320, 844, 1366, 3440].includes(w)) {
      await b.ev('scrollTo(0,0)'); const s = await b.cmd('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`${shotDir}/${key}-${route.replace('/', '_') || 'home'}.png`, Buffer.from(s.data, 'base64'));
    }
  }
  // Keyboard: first Tab lands on the skip link, Enter moves focus to main.
  await b.go('/library/combat/'); await sleep(300);
  await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await b.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  r.checks.skipLink = await b.ev(`document.activeElement?.className === 'skip'`);
  // Search: "/" opens it (desktop) or the button (touch); "revive" -> combat#revive first.
  if (touch) await b.click('[data-open-search]'); else { await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.ev(`document.body.focus()`); await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: '/', code: 'Slash', windowsVirtualKeyCode: 191, text: '/' }); await b.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: '/', code: 'Slash', windowsVirtualKeyCode: 191 }); }
  await sleep(300);
  r.checks.searchOpens = await b.ev(`!document.querySelector('[data-search]').hidden && document.activeElement?.id === 'search-q'`);
  await b.cmd('Input.insertText', { text: 'revive' }); await sleep(700);
  r.checks.searchRevive = await b.ev(`document.querySelector('#search-res a')?.getAttribute('href')`);
  if (!touch) {
    await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(200);
    await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 }); await sleep(300);
    r.checks.ctrlK = await b.ev(`!document.querySelector('[data-search]').hidden`);
  }
  // Theme toggle persists across reload.
  await b.go('/library/faq/'); await sleep(300);
  await b.ev(`document.querySelector('[data-theme-toggle]').click()`);
  await b.go('/library/faq/'); await sleep(300);
  r.checks.themePersists = await b.ev(`document.documentElement.dataset.theme === 'light'`);
  if (w === 390 || w === 1366) { const s = await b.cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${shotDir}/${key}-faq-light.png`, Buffer.from(s.data, 'base64')); }
  await b.ev(`document.querySelector('[data-theme-toggle]').click()`);
  // Drawer on narrow screens.
  if (w < 961) { await b.click('.menu-btn'); await sleep(350); r.checks.drawer = await b.ev(`document.body.classList.contains('nav-open') && document.querySelector('#nav').getBoundingClientRect().left >= 0`); if (w === 390) { const s = await b.cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${shotDir}/${key}-drawer.png`, Buffer.from(s.data, 'base64')); } }
  // Map guide: zoom (wheel or pinch), pan (drag), fit, layer toggle.
  await b.go('/library/maps/metro/'); await sleep(400); await b.ev(`document.documentElement.style.scrollBehavior = 'auto'`);
  const vb = () => b.ev(`document.querySelector('.mg-view svg').getAttribute('viewBox')`);
  const box = await b.ev(`(() => { const e = document.querySelector('.mg-view'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`); await sleep(200);
  const v0 = await vb();
  if (touch) {
    await b.cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x - 20, y: box.y, id: 1 }, { x: box.x + 20, y: box.y, id: 2 }] });
    for (let i = 1; i <= 6; i++) { await b.cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x - 20 - i * 12, y: box.y, id: 1 }, { x: box.x + 20 + i * 12, y: box.y, id: 2 }] }); await sleep(30); }
    await b.cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else await b.cmd('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: -400 });
  await sleep(200); const v1 = await vb();
  r.checks.zoom = v1 !== v0 && +v1.split(' ')[2] < +v0.split(' ')[2];
  if (touch) {
    await b.cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y, id: 1 }] });
    for (let i = 1; i <= 5; i++) { await b.cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + i * 15, y: box.y + i * 5, id: 1 }] }); await sleep(30); }
    await b.cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await b.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 5; i++) await b.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x + i * 15, y: box.y + i * 5, button: 'left', buttons: 1 });
    await b.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x + 75, y: box.y + 25, button: 'left', clickCount: 1 });
  }
  await sleep(200); const v2 = await vb();
  r.checks.pan = v2 !== v1;
  await b.click('[data-mg=fit]'); r.checks.fit = (await vb()) === v0;
  await b.ev(`document.querySelector('.mg-view').focus()`); await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: '+', code: 'Equal', windowsVirtualKeyCode: 187, text: '+' }); await sleep(100);
  r.checks.keyZoom = (await vb()) !== v0;
  await b.click('[data-layer-toggle=labels]'); r.checks.layerToggle = await b.ev(`document.querySelector('.mg-view [data-layer=labels]').classList.contains('off')`);
  // Medal filter.
  await b.go('/library/medals/'); await sleep(300); await b.ev(`document.documentElement.style.scrollBehavior = 'auto'`);
  await b.click('[data-rarity=epic]'); r.checks.medalEpic = await b.ev(`[...document.querySelectorAll('.medal-grid li')].filter(l => !l.hidden).length`);
  r.console = [...new Set(cons)].slice(0, 8); r.exceptions = b.errors.slice(0, 5);
  await b.close();
  console.log(key, 'problems', r.problems.length, JSON.stringify(r.checks), 'console', r.console.length, 'exc', r.exceptions.length, r.problems.slice(0, 4).join(' | '));
}
if (!process.env.QUICK) fs.writeFileSync(process.env.OUT ?? '/tmp/library-qa.json', JSON.stringify(res, null, 1));
process.exit(0);
