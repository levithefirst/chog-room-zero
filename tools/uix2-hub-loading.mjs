// Owner 2026-10-20 hub + loading pass, in real headless Chrome (emulated viewports, NOT real devices).
// Loading: the API is held for a moment so the screen can be seen at its real "Checking sign-in" step (the bar is never
// moved by this tool), then released: the hub must follow. Checks the world backdrop, the deploy card, the bar against
// its percentage, no overlap between the title, the card and the bar, nothing off screen, text >= 12 px.
// Hub: no leaderboard or squad panel; one menu (Upgrades, Medals, Leaderboard, Career, Game Docs, Squad); Leaderboard
// and Squad open their screens, browser Back and the screen's back button return; PLAY, location and mode still work.
// Reduced motion: no running animation on the loading screen.
// Usage: node tools/uix2-hub-loading.mjs http://localhost:8790 <shotDir>   (VIEWS=p320,d1920 to pick)
import { browser, sleep, LAYOUT_PROBE } from './cdp.mjs';
const [base, shotDir] = process.argv.slice(2);
const ALL = [
  { name: 'p320', w: 320, h: 568, mobile: true, touch: true }, { name: 'p360', w: 360, h: 640, mobile: true, touch: true },
  { name: 'p375', w: 375, h: 667, mobile: true, touch: true }, { name: 'p390', w: 390, h: 844, mobile: true, touch: true }, { name: 'p412', w: 412, h: 915, mobile: true, touch: true },
  { name: 'l844', w: 844, h: 390, mobile: true, touch: true }, { name: 'tab1180', w: 1180, h: 820, mobile: true, touch: true },
  { name: 'd1280', w: 1280, h: 720 }, { name: 'd1920', w: 1920, h: 1080 }, { name: 'd2560', w: 2560, h: 1440 }, { name: 'uw3440', w: 3440, h: 1440 },
];
const pick = process.env.VIEWS?.split(',');
const VIEWS = pick ? ALL.filter((v) => pick.includes(v.name)) : ALL;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, 500)}` : ''}`); return !!ok; };

// Text smaller than 12 px, boxes off the viewport, and overlaps between the named blocks, on the loading screen.
const BOOT_PROBE = `(() => {
  const boot = document.getElementById('boot'); if (!boot) return null;
  const vis = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
  const small = [], off = [];
  for (const e of boot.querySelectorAll('*')) {
    if (!vis(e) || e.closest('svg')) continue;
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (own && parseFloat(getComputedStyle(e).fontSize) < 12) small.push((e.id || e.className || e.tagName) + ' ' + getComputedStyle(e).fontSize);
    const r = e.getBoundingClientRect();
    if (own && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)) off.push(e.id || e.className || e.tagName);
  }
  const box = (sel) => { const e = boot.querySelector(sel); return e && vis(e) ? e.getBoundingClientRect() : null; };
  const hit = (a, b) => a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const main = box('.boot-main'), card = box('.boot-card'), foot = box('.boot-foot'), facts = box('.boot-facts');
  const overlaps = [['title', main, 'card', card], ['title', main, 'bar', foot], ['card', card, 'bar', foot], ['facts', facts, 'title', main], ['facts', facts, 'card', card]].filter(([, a, , b]) => hit(a, b)).map(([x, , y]) => x + '/' + y);
  const fill = document.getElementById('bootfill'), bar = fill?.parentElement;
  return {
    world: !!document.querySelector('#bootworld svg .mp-lit') || !!document.querySelector('#bootworld svg'),
    names: document.querySelectorAll('#bootworld .mp-names text').length,
    card: card ? document.querySelector('.boot-card').innerText.replace(/\\s+/g, ' ').trim() : '',
    step: document.getElementById('bootstep')?.textContent, pct: document.getElementById('bootpct')?.innerText,
    fillShare: bar ? Math.round(fill.offsetWidth / bar.offsetWidth * 100) : -1,
    title: boot.querySelector('.boot-title')?.innerText.replace(/\\s+/g, ' '), small: small.slice(0, 6), off: off.slice(0, 6), overlaps,
    anims: document.getAnimations().filter((a) => a.playState === 'running' && boot.contains(a.effect?.target)).length,
  };
})()`;

const open = [];
try {
  for (const v of VIEWS) {
    const b = await browser(`ux2-${v.name}`, { base, shotDir, ...v });
    open.push(b);
    await b.go('/?debug'); await b.until(`document.readyState !== 'loading'`, 20000);
    await b.ev(`localStorage.setItem('chog.onboarded','1'); localStorage.setItem('chog.map','office')`);
    // Hold every API call: the game waits on sign-in (at most 5 s, its own cap), as on a slow link.
    const held = [];
    b.on((m) => { if (m.method === 'Fetch.requestPaused') held.push(m.params.requestId); });
    await b.cmd('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
    await b.cmd('Page.navigate', { url: `${base}/?debug` });
    const at = await b.until(`document.getElementById('bootstep')?.textContent === 'Checking sign-in' && !!document.querySelector('#bootworld svg') ? 1 : 0`, 15000);
    await sleep(500);
    const p = await b.ev(BOOT_PROBE);
    await b.shot('01-loading');
    check(`${v.name}: loading shows the real step it waits on (Checking sign-in), the bar matches its percentage`, at && p && p.pct === '60%' && Math.abs(p.fillShare - 60) <= 3, JSON.stringify(p && { step: p.step, pct: p.pct, fill: p.fillShare }));
    check(`${v.name}: loading draws the location you picked (Office) and the operator, the wordmark reads CHOG: ROOM ZERO`, p && p.world && /OFFICE/i.test(p.card) && /Operator/i.test(p.card) && /CHOG:\s*ROOM ZERO/i.test(p.title), JSON.stringify(p && { card: p.card, title: p.title, names: p.names }));
    check(`${v.name}: loading layout: no overlap, nothing off screen, no text under 12 px`, p && !p.overlaps.length && !p.off.length && !p.small.length, JSON.stringify(p && { overlaps: p.overlaps, off: p.off, small: p.small }));
    await b.cmd('Fetch.disable');
    for (const id of held) await b.cmd('Fetch.continueRequest', { requestId: id });
    if (!check(`${v.name}: loading ends in the hub once the API answers`, await b.hub())) continue;
    await sleep(900);
    const hub = await b.ev(`({ board: !!document.getElementById('boardpreview'), squad: !!document.getElementById('squad'), nav: [...document.querySelectorAll('.hub-nav .navbtn')].map((x) => x.dataset.act).join(),
      heights: [...new Set([...document.querySelectorAll('.hub-nav .navbtn:not(.demo-link)')].map((x) => Math.round(x.getBoundingClientRect().height)))],
      play: (() => { const r = document.getElementById('playbtn')?.getBoundingClientRect(); return r ? Math.round(r.width * r.height) : 0; })(),
      covered: [...document.querySelectorAll('.hub-nav .navbtn')].filter((e) => { const r = e.getBoundingClientRect(); return !e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }).map((e) => e.dataset.act),
      biggestNav: Math.max(...[...document.querySelectorAll('.hub-nav .navbtn')].map((x) => { const r = x.getBoundingClientRect(); return Math.round(r.width * r.height); })) })`);
    await b.shot('02-hub');
    const lay = (await b.ev(LAYOUT_PROBE)) ?? [];
    check(`${v.name}: hub: no leaderboard or squad panel; one menu of compact buttons of one height, none covered; PLAY is the biggest control`, hub && !hub.board && !hub.squad && hub.nav === 'upgrades,medals,ranks,career,docs,squad,demo' && hub.heights.length === 1 && !hub.covered.length && hub.play > hub.biggestNav * 2, JSON.stringify(hub));
    check(`${v.name}: hub fits (no page scroll, no off-screen buttons)`, lay.length === 0, JSON.stringify(lay));
    for (const [act, sel, name] of [['ranks', '.screen.ranks .tabs', 'Leaderboard'], ['squad', '.screen.squad-screen [data-act="squad-create"]', 'Squad']]) {
      await b.click(`.hub-nav [data-act="${act}"]`);
      const opened = await b.until(`!document.getElementById('hub') && !!document.querySelector(${JSON.stringify(sel)})`, 5000);
      await sleep(400); await b.shot(`03-${act}`);
      const l2 = (await b.ev(LAYOUT_PROBE)) ?? [];
      await b.ev(`history.back()`);
      const back1 = await b.until(`!!document.getElementById('hub')`, 5000);
      await b.click(`.hub-nav [data-act="${act}"]`); await b.until(`!document.getElementById('hub')`, 5000);
      await b.click('[data-act="back"]');
      const back2 = await b.until(`!!document.getElementById('hub')`, 5000);
      check(`${v.name}: ${name} button opens the ${name} screen (fits), browser Back and its back button return to the hub`, opened && !l2.length && back1 && back2, JSON.stringify({ opened, l2, back1, back2 }));
    }
    // Location and mode pickers, then PLAY starts a solo run.
    const sheet = await b.ev(`(() => { const p = document.querySelector('.map-pick'); return !!p && getComputedStyle(p).display !== 'none'; })()`);
    if (sheet) { await b.click('.map-pick'); await b.until(`__chog.view() === 'maps'`, 5000); await b.click('.map-card[data-map="metro"]'); await b.until(`__chog.view() === 'main'`, 5000); }
    else await b.click('.maps5 [data-map="metro"]');
    const mapOk = sheet ? 'sheet' : 'row';
    await b.click('[data-mode="1v1"]'); const m1 = await b.ev(`__chog.mode()`);
    await b.click('[data-mode="solo"]'); const m0 = await b.ev(`__chog.mode()`);
    await b.click('#playbtn');
    const played = await b.until(`__chog.phase === 'play' && __chog.world?.mapId === 'metro'`, 25000);
    check(`${v.name}: location (Metro) and mode pickers work; PLAY starts the solo run on Metro`, m1 === '1v1' && m0 === 'solo' && played, JSON.stringify({ via: mapOk, m1, m0, played }));
    check(`${v.name}: no page errors`, b.errors.length === 0, b.errors.slice(0, 3).join(' | '));
    await b.close(); open.splice(open.indexOf(b), 1);
  }
  // Reduced motion (the system preference): the loading screen holds still.
  const r = await browser('ux2-rm', { base, shotDir, w: 1920, h: 1080 });
  open.push(r);
  await r.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await r.go('/?debug'); await r.until(`document.readyState !== 'loading'`, 20000);
  await r.cmd('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
  await r.cmd('Page.navigate', { url: `${base}/?debug` });
  await r.until(`!!document.querySelector('#bootworld svg')`, 15000); await sleep(600);
  const rm = await r.ev(BOOT_PROBE);
  await r.shot('01-loading-reduced-motion');
  check('reduced motion: no animation runs on the loading screen; the world is still drawn', rm && rm.anims === 0 && rm.world, JSON.stringify(rm && { anims: rm.anims, world: rm.world }));
} catch (e) { check('run', false, e?.stack ?? e); }
finally { for (const b of open) await b.close(); }
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
