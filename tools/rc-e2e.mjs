// RC-1 acceptance checks (headless swiftshader Chrome, emulated viewports; NOT device validation).
// Usage: node tools/rc-e2e.mjs <baseUrl> <outJson>
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [base, outFile] = process.argv.slice(2);
const port = 9400 + Math.floor(Math.random() * 50);
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
const open = async (q = '&nooverlay', clear = true) => { await cmd('Page.navigate', { url: `${base}/?debug${q}` }); await sleep(3000); if (clear) { await ev('localStorage.clear()'); await cmd('Page.navigate', { url: `${base}/?debug${q}` }); await sleep(3000); } };
const VK = { Enter: 13, ' ': 32 };
const key = async (k, code) => { const vk = VK[k] ?? k.charCodeAt(0); await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k === 'Enter' ? '\r' : k }); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
const click = async (sel) => { const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()`); if (!r) return false;
  await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0], y: r[1], button: 'left', clickCount: 1 }); await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0], y: r[1], button: 'left', clickCount: 1 }); return true; };
const tap = async (sel) => { const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()`); if (!r) return false;
  await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r[0], y: r[1] }] }); await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); return true; };
const phase = () => ev('__chog.phase');
const killPlayer = `(()=>{const w=__chog.world,p=w.actors[0];p.hp=1;p.armor=0;const b=w.actors.find(a=>a.team==='bot'&&a.alive);for(let k=0;k<12;k++)w.bullets.push({x:p.x+0.6,y:p.y,ox:p.x+0.6,oy:p.y,dx:-1,dy:0,life:1,owner:b.id,weapon:b.weapon,alive:true});return true})()`;
const parkBots = `(()=>{for(const b of __chog.world.actors.slice(1)){b.x=b.y=-40}})()`;
async function waitPhase(want, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await phase()) === want) return true; await sleep(25); } return false; }

// 1. Onboarding: first launch shows How to play; dismissed it stays dismissed after reload; re-openable from the title.
await view(1280, 720, false); await open();
const ob1 = await ev(`document.querySelector('#overlay h2')?.textContent`);
await click('[data-act="howto-close"]'); await sleep(300);
const ob2 = !!(await ev(`document.querySelector('[data-go="start"]')`));
await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(3000);
const ob3 = await ev(`document.querySelector('#overlay h2')?.textContent ?? 'title'`);
await click('[data-act="howto"]'); await sleep(300);
const ob4 = await ev(`document.querySelector('#overlay h2')?.textContent`);
const obRows = await ev(`[...document.querySelectorAll('table.howto td:first-child')].map(e=>e.textContent)`);
check('Onboarding: first launch only, dismissible, re-openable from title, covers move/aim/shoot/creep/ability/rings', ob1 === 'Clear Room Zero' && ob2 && ob3 === 'title' && ob4 === 'Clear Room Zero' && ['Move', 'Aim / shoot', 'Creep (quiet)', 'Ability', 'Gold rings'].every((x) => obRows.includes(x)), { first: ob1, dismissed: ob2, afterReload: ob3, reopened: ob4, rows: obRows });
await click('[data-act="howto-close"]'); await sleep(200);

// 1b. RC-2: clicking Resume never fires; fire works after release + a fresh press.
{
  await ev(`__chog.go('start')`); await ev(`__chog.go('pick')`); await waitPhase('play'); await sleep(400); await ev(parkBots);
  const rows = [];
  for (const hold of [80, 500]) {
    await ev(`__chog.go('pause')`); await sleep(350);
    const r = await ev(`(()=>{const b=document.querySelector('[data-go="resume"]').getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()`);
    const s0 = await ev('__chog.world.actors[0].shots');
    await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r[0], y: r[1] });
    await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0], y: r[1], button: 'left', buttons: 1, clickCount: 1 });
    await sleep(hold);
    const during = (await ev('__chog.world.actors[0].shots')) - s0;
    await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0], y: r[1], button: 'left', clickCount: 1 });
    await sleep(500);
    const afterResume = (await ev('__chog.world.actors[0].shots')) - s0;
    await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: 900, y: 360, button: 'left', buttons: 1, clickCount: 1 }); await sleep(250);
    await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 900, y: 360, button: 'left', clickCount: 1 }); await sleep(200);
    const afterPress = (await ev('__chog.world.actors[0].shots')) - s0 - afterResume;
    rows.push({ hold, phase: await phase(), during, afterResume, afterPress });
  }
  check('RC-2 Resume click (80 ms and 500 ms holds) fires 0 shots; a fresh press after release fires', rows.every((x) => x.phase === 'play' && x.during === 0 && x.afterResume === 0 && x.afterPress > 0), rows);
  await ev(`__chog.go('pause')`); await ev(`__chog.go('quit')`); await sleep(300);
}

// 2. NFT DEMO at every entry point.
const titleBadge = await ev(`!!document.querySelector('[data-act="demo"] .demo')`);
await click('[data-act="demo"]'); await sleep(300);
const demoScreen = await ev(`({copy:document.querySelector('.democopy')?.textContent, rows:document.querySelectorAll('table.traits tr').length, picks:[...document.querySelectorAll('[data-demo]')].map(e=>e.dataset.demo)})`);
const pick = demoScreen.picks.find((x) => x);
await click(`[data-demo="${pick}"]`); await sleep(300);
const titleChip = await ev(`document.getElementById('idchip')?.innerHTML`);
await ev(`__chog.go('start')`); await sleep(300);
const selChip = await ev(`document.getElementById('selchip')?.innerHTML`);
await ev(`__chog.go('pick')`); await sleep(2200);
const hudChip = await ev(`document.getElementById('hero').innerHTML`);
await ev(parkBots); await ev(killPlayer); await waitPhase('results');
const resDemo = await ev(`document.querySelectorAll('#overlay .demo').length`);
check('NFT DEMO badge on title button, DEMO screen (copy + trait table), title chip, hero select, HUD chip, results; non-holders play as guest',
  titleBadge && /DEMO/.test(demoScreen.copy) && /no wallet/.test(demoScreen.copy) && /no ownership/.test(demoScreen.copy) && demoScreen.rows === 5 && demoScreen.picks.includes('') && /DEMO/.test(titleChip) && /DEMO/.test(selChip) && /DEMO/.test(hudChip) && resDemo >= 1,
  { titleBadge, demoScreen, titleChip, selChip, hudChip, resDemo });

// 3. Death screen: 5 deaths x each input. Inputs in the window are ignored; a fresh press after it works.
await sleep(900); await click('[data-go="quit"]'); await sleep(300);
await ev(`(()=>{localStorage.removeItem('chog.demoToken')})()`);
const deathRows = [];
const INPUTS = [
  ['Again (click)', () => click('[data-go="restart"]'), 'loading'],
  ['Change Chog (click)', () => click('[data-go="quit"]'), 'select'],
  ['Enter', () => key('Enter', 'Enter'), 'loading'],
  ['Space', () => key(' ', 'Space'), 'loading'],
  ['Key 1', () => key('1', 'Digit1'), 'results'],
];
for (let d = 0; d < 5; d++) {
  for (const [name, fire, after] of INPUTS) {
    const ph = await phase();
    if (ph !== 'play') { await ev(`__chog.go('quit')`); await ev(`__chog.go('start')`); await ev(`__chog.go('pick')`); await waitPhase('play'); await sleep(300); }
    await ev(parkBots);
    // Hold the mouse through the death (a press that started before the summary never counts).
    await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 600, button: 'left', clickCount: 1 });
    await ev(killPlayer);
    const died = await waitPhase('results'); const t0 = Date.now();
    await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 600, button: 'left', clickCount: 1 });
    const inWindow = [];
    // Page-time since the summary opened, so slow frames never shift the probe into the wrong side of 750 ms.
    for (const at of [60, 300, 500]) { while (Date.now() - t0 < at) await sleep(10); await fire(); inWindow.push({ ms: Math.round(await ev('performance.now()-__chog.resultsAt()')), ph: await phase() }); }
    while ((await ev('performance.now()-__chog.resultsAt()')) < 800) await sleep(10);
    await fire(); await sleep(250);
    const afterPh = await phase();
    const ok = died && inWindow.every((x) => x.ms >= 750 || x.ph === 'results') && (after === 'loading' ? ['loading', 'play'].includes(afterPh) : afterPh === after);
    deathRows.push({ death: d + 1, input: name, died, inWindow, after: afterPh, ok });
    if (afterPh === 'results') { await click('[data-go="restart"]'); }
    await waitPhase('play', 4000);
  }
}
check('Death screen: 5 deaths x {Again, Change Chog, Enter, Space, key 1}: ignored in the 0.75 s window (page-timed), acts after 0.75 s + fresh press (key 1 never acts)', deathRows.every((r) => r.ok), { failures: deathRows.filter((r) => !r.ok), n: deathRows.length });

// 4. Touch agrees with keyboard/mouse (844x390 touch).
await view(844, 390, true); await open('&nooverlay', false);
await ev(`__chog.go('start')`); await ev(`__chog.go('pick')`); await waitPhase('play'); await sleep(300);
const touchRows = [];
for (let d = 0; d < 5; d++) {
  if ((await phase()) !== 'play') { await ev(`__chog.go('start')`); await ev(`__chog.go('pick')`); await waitPhase('play'); await sleep(300); }
  await ev(parkBots); await ev(killPlayer); const died = await waitPhase('results'); const t0 = Date.now();
  const target = d % 2 ? '[data-go="quit"]' : '[data-go="restart"]';
  const inWindow = [];
  for (const at of [60, 300, 500]) { while (Date.now() - t0 < at) await sleep(10); await tap(target); inWindow.push({ ms: Math.round(await ev('performance.now()-__chog.resultsAt()')), ph: await phase() }); }
  while ((await ev('performance.now()-__chog.resultsAt()')) < 800) await sleep(10);
  await tap(target); await sleep(250);
  const afterPh = await phase();
  touchRows.push({ death: d + 1, target, died, inWindow, after: afterPh, ok: died && inWindow.every((x) => x.ms >= 750 || x.ph === 'results') && afterPh !== 'results' });
  if (afterPh === 'select') { await ev(`__chog.go('pick')`); }
  await waitPhase('play', 4000);
}
check('Death screen touch: 5 deaths, taps on Again/Change Chog ignored in the window, act after it', touchRows.every((r) => r.ok), { rows: touchRows });

// 5. Victory UI + results stats + personal best persisted across reload (guest).
await view(1280, 720, false); await open();
await ev(`localStorage.setItem('chog.onboarded','1')`);
await ev(`__chog.go('start')`); await ev(`__chog.go('pick')`); await waitPhase('play'); await sleep(500);
await ev(`(()=>{const w=__chog.world,p=w.actors[0];p.hp=1e9;for(const b of w.actors.slice(1)){b.hp=1;b.armor=0;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])w.bullets.push({x:b.x-dx*0.3,y:b.y-dy*0.3,ox:b.x-dx*0.3,oy:b.y-dy*0.3,dx,dy,life:1,owner:0,weapon:p.weapon,alive:true})}})()`);
await waitPhase('results', 5000);
const res = await ev(`({h2:document.querySelector('#overlay h2')?.textContent, rows:[...document.querySelectorAll('table.stats td:first-child')].map(e=>e.textContent), pb:document.getElementById('resultpb')?.textContent})`);
await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(3000);
const titlePb = await ev(`document.getElementById('titlepb')?.textContent`);
const recs = await ev(`JSON.parse(localStorage.getItem('chog-room-zero:records:v1'))`);
check('Victory: Room cleared; results show Chog, time, kills, accuracy, damage dealt/taken; personal best NEW, saved on this device only, persists on the title after reload (guest)',
  res.h2 === 'Room cleared' && ['Chog', 'Time', 'Hostiles down', 'Hits / shots', 'Damage dealt / taken'].every((x) => res.rows.includes(x)) && /NEW/.test(res.pb) && /saved on this device only/.test(res.pb) && /Best clear \d+:\d\d/.test(titlePb) && recs?.overall?.wins === 1,
  { res, titlePb, recs: recs?.overall });

// 6. Fairness in the browser: a Wick bot 11 m away in clear line of sight never damages a Brick player (sight 7.5 m).
await ev(`__chog.setHero('brick')`); await ev(`__chog.go('start')`); await ev(`__chog.go('pick')`); await waitPhase('play'); await sleep(400);
const fair = await ev(`(async()=>{const w=__chog.world,p=w.actors[0];const wick=w.actors.find(a=>a.hero.id==='wick');for(const b of w.actors.slice(1))if(b!==wick){b.x=b.y=-40}
  let beyond=0,within=0,hits=0;const R=p.view.range;const t0=performance.now();
  while(performance.now()-t0<6000){p.x=5.5;p.y=8.5;p.vx=p.vy=0;wick.x=Math.max(wick.x,5.5+11);if(wick.x>16.5)wick.x=16.5;wick.y=8.5;
    for(const h of w.hits)if(h.target===0){hits++;const d=Math.hypot(h.fromX-h.x,h.fromY-h.y);if(d>R+0.4)beyond++;else within++}
    await new Promise(r=>setTimeout(r,16));}
  return {R,beyond,within,hits,wickState:w.brains.get(wick.id).state}})()`);
check('Fairness (browser): Wick bot held at 11 m in LOS deals 0 damage to Brick (7.5 m sight)', fair && fair.beyond === 0 && fair.hits === 0, fair);

// 7. Responsive: every screen's primary button and the HUD fit at 844x390 and 667x375.
for (const [W, H] of [[844, 390], [667, 375]]) {
  await view(W, H, true); await open('&nooverlay');
  const fits = {};
  const inView = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'missing';const b=e.getBoundingClientRect();return b.top>=0&&b.left>=0&&b.bottom<=innerHeight+1&&b.right<=innerWidth+1})()`);
  fits.howto = await inView('[data-act="howto-close"]'); await tap('[data-act="howto-close"]'); await sleep(250);
  fits.title = await inView('[data-go="start"]');
  await tap('[data-act="demo"]'); await sleep(250);
  fits.demoBack = await ev(`(()=>{const e=document.querySelector('[data-act="demo-close"]');e.scrollIntoView();const b=e.getBoundingClientRect();return b.bottom<=innerHeight+1})()`);
  await tap('[data-act="demo-close"]'); await sleep(250);
  await ev(`__chog.go('start')`); await sleep(300); fits.deploy = await inView('[data-go="pick"]');
  await ev(`__chog.go('pick')`); await waitPhase('play'); await sleep(500);
  const hud = await ev(`(()=>{const ids=['vitals','foes','sys','weapon','ability','reload'];const rs=ids.map(i=>{const e=document.getElementById(i);if(!e||e.offsetParent===null)return null;const b=e.getBoundingClientRect();return {i,x:b.left,y:b.top,r:b.right,b:b.bottom}}).filter(Boolean);
    const ov=[];for(let a=0;a<rs.length;a++)for(let c=a+1;c<rs.length;c++){const A=rs[a],B=rs[c];if(A.x<B.r&&B.x<A.r&&A.y<B.b&&B.y<A.b)ov.push(A.i+'/'+B.i)}
    return {n:rs.length,ov,out:rs.filter(r=>r.x<0||r.y<0||r.r>innerWidth+1||r.b>innerHeight+1).map(r=>r.i)}})()`);
  await ev(parkBots); await ev(killPlayer); await waitPhase('results'); await sleep(900);
  fits.results = await ev(`(()=>{const e=document.querySelector('[data-go="restart"]');e.scrollIntoView();const b=e.getBoundingClientRect();return b.bottom<=innerHeight+1&&b.top>=0})()`);
  await cmd('Page.captureScreenshot', { format: 'png' }).then((s) => fs.writeFileSync(`/workspace/shots/rc-results-${W}.png`, Buffer.from(s.data, 'base64')));
  check(`Responsive ${W}x${H}: how-to, title, DEMO, select, results buttons reachable; HUD panels inside, no overlaps`, Object.values(fits).every((v) => v === true) && hud.ov.length === 0 && hud.out.length === 0, { fits, hud });
}

check('Console errors: none', errors.length === 0, errors.slice(0, 5));
fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
chrome.kill(); process.exit(0);
