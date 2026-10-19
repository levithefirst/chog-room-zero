// Shared headless-Chrome helper for the QA tools (CDP over the debugging port). Emulated devices, NOT real ones.
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every Chrome this process started, by its own process group (spawned detached). A tool that crashes, exits early or is
// killed takes its browsers with it: nothing is ever killed by name or command line.
const live = new Set();
const killGroup = (proc) => { try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch { /* gone */ } } };
process.on('exit', () => { for (const proc of live) killGroup(proc); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(130));

export async function browser(label, { base, shotDir, w = 1280, h = 720, mobile = false, touch = false } = {}) {
  const port = 9100 + Math.floor(Math.random() * 800);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rz-${label}-`));
  const proc = spawn(process.env.CHROME_BIN ?? 'google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore', detached: true });
  live.add(proc);
  let t; for (let i = 0; i < 80 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
  if (!t) { killGroup(proc); live.delete(proc); fs.rmSync(dir, { recursive: true, force: true }); throw new Error(`${label}: Chrome did not open its debugging port`); }
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const P = new Map(); const errors = []; const handlers = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m.result ?? m.error); P.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    for (const fn of handlers) fn(m); };
  // Every call answers within 30 s (undefined on timeout): a stalled renderer must fail a check, never hang the run.
  const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (P.has(i)) { P.delete(i); r(undefined); } }, 30000); });
  await cmd('Runtime.enable'); await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  if (touch) await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const ev = async (e) => (await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
  const b = {
    label, cmd, ev, errors, on: (fn) => handlers.push(fn),
    // Chrome's renderer and GPU children outlive a killed parent: kill its whole process group (spawned detached).
    close: async () => { killGroup(proc); live.delete(proc); await sleep(300); fs.rmSync(dir, { recursive: true, force: true }); },
    go: async (u) => { await cmd('Page.navigate', { url: base + u }); await sleep(300); },
    shot: async (name) => { if (!shotDir) return; const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(shotDir, { recursive: true }); fs.writeFileSync(path.join(shotDir, `${label}-${name}.png`), Buffer.from(r.data, 'base64')); },
    click: async (sel) => { const r = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el || el.disabled) return null; el.scrollIntoView({ block: 'nearest' }); const q = el.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`);
      if (!r) return false;
      if (touch) { await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y }] }); await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
      else { await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 }); await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 }); }
      await sleep(300); return true; },
    text: (sel = '#overlay') => ev(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`),
    until: async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await ev(expr); if (v) return v; await sleep(250); } return null; },
    hub: () => b.until(`!!document.getElementById('hub') && !document.getElementById('boot')`, 30000),
  };
  return b;
}

/** Layout problems on the current screen: page scroll, horizontal overflow in any scroller, buttons off screen. */
export const LAYOUT_PROBE = `(() => {
  const vw = innerWidth, vh = innerHeight, out = [];
  const se = document.scrollingElement; if (se.scrollWidth > vw + 1 || se.scrollHeight > vh + 1) out.push('page scrolls ' + se.scrollWidth + 'x' + se.scrollHeight);
  for (const el of document.querySelectorAll('#overlay *')) {
    const cs = getComputedStyle(el);
    if (el.offsetParent === null && cs.position !== 'fixed') continue;
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') && el.scrollWidth > el.clientWidth + 2 && !el.matches('input'))
      out.push('h-overflow ' + (el.id || el.className || el.tagName) + ' ' + el.scrollWidth + '>' + el.clientWidth);
  }
  for (const el of document.querySelectorAll('#overlay button, #overlay .btn, #overlay input')) {
    if (el.offsetParent === null) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    // Inside a scroller, a button below the fold is fine; otherwise it must be on screen.
    let p = el.parentElement, scroller = false; while (p) { const c = getComputedStyle(p); if ((c.overflowY === 'auto' || c.overflowY === 'scroll') && p.scrollHeight > p.clientHeight + 1) { scroller = true; break; } p = p.parentElement; }
    const offX = r.left < -1 || r.right > vw + 1, offY = r.top < -1 || r.bottom > vh + 1;
    // A rotated stage swaps the axes: test against the stage rectangle instead of the window.
    const st = document.getElementById('stage').getBoundingClientRect();
    const offStage = r.left < st.left - 1 || r.right > st.right + 1 || r.top < st.top - 1 || r.bottom > st.bottom + 1;
    if (offStage && !scroller) out.push('off-screen ' + (el.id || el.dataset.act || el.dataset.go || el.dataset.mode || el.textContent.trim().slice(0, 20)));
    if (r.width < 24 || r.height < 24) out.push('tiny ' + (el.id || el.textContent.trim().slice(0, 16)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  return out;
})()`;
