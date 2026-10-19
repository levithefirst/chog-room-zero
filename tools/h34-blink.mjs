// H34 blink regression in real headless Chrome against the local full stack: every non-gameplay screen sits still for a
// while and must never be rebuilt (a rebuild replays the screen's entry animation: the blink the owner saw), also with
// an online session whose ping time jitters like a real link (pong replies delayed 30-170 ms in the page).
// Emulated desktop, tablet and phone (NOT devices).
// Usage: node tools/h34-blink.mjs http://localhost:8790 [seconds per screen, default 12]
import { browser, sleep } from './cdp.mjs';
const [base, secsArg] = process.argv.slice(2);
const SECS = Number(secsArg ?? 12);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, 600)}` : ''}`); };
const open = [];

// Counts, from the moment __watch() runs: #overlay children replaced, and entry animations started on its screens.
const WATCH = `
  window.__rebuilds = 0; window.__anims = [];
  new MutationObserver((ms) => { if (window.__watching) for (const m of ms) if (m.target.id === 'overlay' && m.removedNodes.length) window.__rebuilds++; })
    .observe(document, { subtree: true, childList: true });
  document.addEventListener('animationstart', (e) => { if (window.__watching && e.target.closest?.('#overlay')) window.__anims.push(e.animationName + ' ' + (e.target.id || e.target.className)); }, true);
  window.__watch = () => { window.__rebuilds = 0; window.__anims = []; window.__watching = true; };
  window.__seen = () => { window.__watching = false; return { rebuilds: window.__rebuilds, anims: window.__anims.slice(0, 6) }; };
  // A real link to the game server: each pong arrives 30-170 ms late, so the measured ping time keeps moving.
  const d = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
  Object.defineProperty(WebSocket.prototype, 'onmessage', { configurable: true, get() { return d.get.call(this); },
    set(fn) { d.set.call(this, fn && ((e) => { if (String(e.data).includes('"pong"')) setTimeout(() => fn.call(this, e), 30 + Math.random() * 140); else fn.call(this, e); })); } });
`;

async function sit(b, label, what) {
  await sleep(1200);
  await b.ev(`__watch()`);
  await sleep(SECS * 1000);
  const r = await b.ev(`__seen()`);
  check(`${label}: ${what} stays put for ${SECS} s (no rebuild, no entry animation replayed)`, r && r.rebuilds === 0 && r.anims.length === 0, JSON.stringify(r));
}

try {
  for (const view of [
    { label: 'desk', w: 1440, h: 900 },
    { label: 'tablet', w: 1180, h: 820, mobile: true, touch: true },
    { label: 'phone', w: 844, h: 390, mobile: true, touch: true },
  ]) {
    const b = await browser(`blink-${view.label}`, { base, ...view });
    open.push(b);
    await b.cmd('Page.addScriptToEvaluateOnNewDocument', { source: WATCH });
    await b.go('/?debug'); await b.ev(`localStorage.setItem('chog.onboarded','1')`);
    await b.go('/?debug'); await b.hub();
    await sit(b, view.label, 'hub');
    for (const [act, view2] of [['maps', 'maps'], ['ranks', 'ranks'], ['docs', 'docs'], ['career', 'career'], ['medals', 'medals'], ['settings', 'settings']]) {
      const sel = act === 'maps' ? '.map-pick' : `[data-act="${act}"]`;
      // The Location sheet is the phone's picker; on wider screens the row on the hub is the picker (sat on above).
      if (act === 'maps' && !(await b.ev(`(() => { const p = document.querySelector('.map-pick'); return !!p && getComputedStyle(p).display !== 'none'; })()`))) continue;
      await b.ev(`document.querySelector(${JSON.stringify(sel)})?.click()`);
      if (!(await b.until(`__chog.view() === ${JSON.stringify(view2)}`, 5000))) { check(`${view.label}: ${act} opens`, false); continue; }
      await sit(b, view.label, act === 'maps' ? 'Location sheet' : act);
      await b.ev(`document.querySelector('[data-act="back"]')?.click()`);
      await b.until(`__chog.view() === 'main'`, 5000);
    }
    // A redraw with nothing changed (the fullscreen event redraws the title) keeps the same nodes.
    await b.ev(`window.__hubEl = document.getElementById('hub'); document.dispatchEvent(new Event('fullscreenchange'))`);
    await sleep(300);
    check(`${view.label}: an unchanged redraw keeps the hub's DOM`, await b.ev(`document.getElementById('hub') === window.__hubEl && !!window.__hubEl`));
    // Online: a squad keeps a session open (ping every 2 s, jittered); the hub must not redraw for it.
    await b.ev(`document.querySelector('[data-mode="3v3"]')?.click()`);
    await sleep(300);
    await b.ev(`document.querySelector('[data-act="squad-create"]')?.click()`);
    const code = await b.until(`document.getElementById('squadcodeshown')?.innerText`, 15000);
    check(`${view.label}: a squad session is open`, !!code, code);
    await sleep(3000);
    await sit(b, view.label, 'hub with an online session (jittered ping)');
    check(`${view.label}: no page errors`, b.errors.length === 0, b.errors.join(' | '));
  }
} catch (e) { check('run', false, e?.stack ?? e); }
finally { for (const b of open) await b.close(); }
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
