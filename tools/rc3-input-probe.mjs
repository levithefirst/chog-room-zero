// RC-3 input probe: does a menu press (Resume, Deploy) ever fire, and does the first real press after it always fire?
// Mouse, keyboard and touch paths, through real CDP input events (headless swiftshader Chrome; NOT device validation).
// Bots are parked off the map so the player cannot die mid-probe: this checks input only, never victory or balance.
// Usage: node tools/rc3-input-probe.mjs <baseUrl> <outJson>
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [base, outFile] = process.argv.slice(2);
const port = 9450 + Math.floor(Math.random() * 50);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let t;
for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const P = new Map(); const errors = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m.result ?? m.error); P.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ')); };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; };
await cmd('Runtime.enable');
const results = []; const check = (name, pass, data) => { results.push({ name, pass: !!pass, data }); console.log((pass ? 'PASS ' : 'FAIL ') + name, JSON.stringify(data)); };
const view = (w, h, mobile) => Promise.all([cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile }), cmd('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 })]);
const open = async () => { await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(2500); await ev(`localStorage.clear();localStorage.setItem('chog.onboarded','1');localStorage.setItem('chog.ringhint','1')`); await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(2500); };
const center = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()`);
const phase = () => ev('__chog.phase');
const shots = () => ev('__chog.world.actors[0].shots');
const parkBots = `(()=>{for(const b of __chog.world.actors.slice(1)){b.x=b.y=-40}})()`;
// Wait N sim ticks (not wall time): a loaded headless box can run few frames.
const ticks = (n) => ev(`(async()=>{const w=__chog.world,t0=w.tick;for(let i=0;i<400&&w.tick-t0<${n};i++)await new Promise(r=>setTimeout(r,25));return w.tick-t0})()`);
async function waitPhase(want, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await phase()) === want) return true; await sleep(25); } return false; }
const mouse = (type, x, y, extra = {}) => cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...(type === 'mousePressed' ? { buttons: 1 } : {}), ...extra });
const touch = (type, pts) => cmd('Input.dispatchTouchEvent', { type, touchPoints: pts });
const key = async (k, code, vk) => { await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
async function toPlay(touchMode) {
  await ev(`__chog.go('start')`); await sleep(250);
  const d = await center('[data-go="pick"]');
  if (touchMode) { await touch('touchStart', [{ x: d[0], y: d[1], id: 1 }]); await touch('touchEnd', []); }
  else { await mouse('mousePressed', d[0], d[1]); await mouse('mouseReleased', d[0], d[1]); }
  await waitPhase('play'); await ev(parkBots); await ticks(10);
}
async function backToTitle() { await ev(`__chog.go('pause')`); await ev(`__chog.go('quit')`); await sleep(250); }

// ---------- PC (1280x720, mouse + keyboard) ----------
await view(1280, 720, false); await open();
{
  await toPlay(false);
  const s0 = await shots();
  await mouse('mousePressed', 900, 360); await ticks(4); await mouse('mouseReleased', 900, 360); await ticks(20);
  check('PC: after a real Deploy click, the first click in the match fires', (await shots()) - s0 > 0, { shots: (await shots()) - s0 });
  const rows = [];
  // M1/M2: click Resume with short and long holds. M3: held fire, Esc while holding, release on the pause card, click Resume.
  // M4: a click, then Esc in the same frame (latched tap), then Esc resume. K1: Esc resume, nothing held.
  for (const v of ['M1', 'M2', 'M3', 'M4', 'K1']) {
    let s = await shots();
    if (v === 'M3') { await mouse('mousePressed', 900, 360); await ticks(3); await key('Escape', 'Escape', 27); await sleep(200); await mouse('mouseReleased', 900, 360); }
    else if (v === 'M4') { await mouse('mousePressed', 900, 360); await mouse('mouseReleased', 900, 360); await key('Escape', 'Escape', 27); await sleep(200); }
    else { await ev(`__chog.go('pause')`); await sleep(300); }
    const pausedOk = (await phase()) === 'pause';
    s = await shots();
    if (v === 'K1' || v === 'M4') { await key('Escape', 'Escape', 27); }
    else { const r = await center('[data-go="resume"]'); await mouse('mouseMoved', r[0], r[1]); await mouse('mousePressed', r[0], r[1]); await sleep(v === 'M2' ? 500 : 80); await mouse('mouseReleased', r[0], r[1]); }
    await waitPhase('play'); await ticks(30);
    const afterResume = (await shots()) - s;
    await mouse('mousePressed', 900, 360); await ticks(4); await mouse('mouseReleased', 900, 360); await ticks(20);
    const fresh = (await shots()) - s - afterResume;
    rows.push({ v, pausedOk, afterResume, fresh });
  }
  check('PC: Resume (click 80/500 ms, held-fire + Esc, latched tap + Esc, Esc) fires 0 shots; the next fresh click fires', rows.every((r) => r.pausedOk && r.afterResume === 0 && r.fresh > 0), rows);
  await backToTitle();
}

// ---------- Touch (844x390 landscape, emulated) ----------
await view(844, 390, true); await open();
{
  const stickL = { x: 150, y: 260 }, stickR = { x: 640, y: 230 };
  const pushRight = async (idn, hold = 6) => { await touch('touchStart', [{ x: stickR.x, y: stickR.y, id: idn }]); await touch('touchMove', [{ x: stickR.x + 45, y: stickR.y, id: idn }]); await ticks(hold); await touch('touchEnd', []); await ticks(10); };
  await toPlay(true);
  let s0 = await shots(); await pushRight(11);
  check('Touch: after a real Deploy tap, the first right-thumb push fires', (await shots()) - s0 > 0, { shots: (await shots()) - s0 });
  await backToTitle();

  // T-deploy-held: the move thumb is already resting on the screen when the match starts. The first aim push must fire.
  await ev(`__chog.go('start')`); await sleep(250);
  const d = await center('[data-go="pick"]');
  await touch('touchStart', [{ x: d[0], y: d[1], id: 1 }]); await touch('touchEnd', []);
  await touch('touchStart', [{ x: stickL.x, y: stickL.y, id: 2 }]);
  await waitPhase('play'); await ev(parkBots); await ticks(10);
  s0 = await shots();
  await touch('touchStart', [{ x: stickL.x, y: stickL.y, id: 2 }, { x: stickR.x, y: stickR.y, id: 3 }]);
  await touch('touchMove', [{ x: stickL.x, y: stickL.y, id: 2 }, { x: stickR.x + 45, y: stickR.y, id: 3 }]);
  await ticks(8);
  const heldDeploy = (await shots()) - s0;
  await touch('touchEnd', []); await ticks(5);
  check('Touch: move thumb already down at match start; the first right-thumb push still fires', heldDeploy > 0, { shots: heldDeploy });

  const rows = [];
  // T1: tap Resume. T2: press Resume, drag 60 px right (past the fire ring if it became a stick), hold, lift.
  // T3: move thumb held on the left while the right thumb taps Resume, then a fresh right push.
  for (const v of ['T1', 'T2', 'T3']) {
    await ev(`__chog.go('pause')`); await sleep(300);
    const r = await center('[data-go="resume"]');
    const s = await shots();
    if (v === 'T1') { await touch('touchStart', [{ x: r[0], y: r[1], id: 21 }]); await touch('touchEnd', []); }
    if (v === 'T2') { await touch('touchStart', [{ x: r[0], y: r[1], id: 22 }]); await touch('touchMove', [{ x: r[0] + 60, y: r[1], id: 22 }]); await ticks(20); await touch('touchEnd', []); }
    if (v === 'T3') { await touch('touchStart', [{ x: stickL.x, y: stickL.y, id: 23 }]); await touch('touchStart', [{ x: stickL.x, y: stickL.y, id: 23 }, { x: r[0], y: r[1], id: 24 }]); await touch('touchEnd', [{ x: stickL.x, y: stickL.y, id: 23 }]); }
    await waitPhase('play'); await ticks(30);
    const afterResume = (await shots()) - s;
    let fresh;
    if (v === 'T3') { // move thumb still down
      await touch('touchStart', [{ x: stickL.x, y: stickL.y, id: 23 }, { x: stickR.x, y: stickR.y, id: 25 }]);
      await touch('touchMove', [{ x: stickL.x, y: stickL.y, id: 23 }, { x: stickR.x + 45, y: stickR.y, id: 25 }]); await ticks(8);
      fresh = (await shots()) - s - afterResume; await touch('touchEnd', []); await ticks(5);
    } else { await pushRight(30 + rows.length); fresh = (await shots()) - s - afterResume; }
    rows.push({ v, afterResume, fresh });
  }
  check('Touch: Resume (tap, press-and-drag, tap while the move thumb is held) fires 0 shots; the next right push fires', rows.every((r) => r.afterResume === 0 && r.fresh > 0), rows);
  await backToTitle();
}

check('Console errors: none', errors.length === 0, errors.slice(0, 5));
fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
chrome.kill(); process.exit(0);
