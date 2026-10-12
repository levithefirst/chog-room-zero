// Before/after screenshot set for the P1 fairness & readability sprint.
// Usage: node tools/p1f-shots.mjs <base url> <prefix e.g. p1f-after> [outDir]
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [base, prefix, dir = '/workspace/shots'] = process.argv.slice(2);
const port = 9600 + Math.floor(Math.random() * 50);
const chrome = spawn('google-chrome', ['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader',`--remote-debugging-port=${port}`,'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let t;
for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 300)); if (m.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(m.params.type)) errs.push(m.params.args.map((a) => a.value).join(' ')); };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value ?? r.exceptionDetails?.exception?.description; };
const shot = async (n) => { await sleep(700); const s = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${dir}/${prefix}-${n}.png`, Buffer.from(s.data, 'base64')); console.log('shot', n); };
await cmd('Runtime.enable');
const start = async (w, h, mobile, q = '&nooverlay') => {
  await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
  await cmd('Page.navigate', { url: `${base}/?debug${q}` }); await sleep(3500);
  await ev(`localStorage.clear()`);
  await cmd('Page.navigate', { url: `${base}/?debug${q}` }); await sleep(3500);
  await ev(`__chog.go('start')`); await sleep(200); await ev(`__chog.go('pick')`); await sleep(1800);
};
const hold = (js) => ev(`(()=>{window.__h&&cancelAnimationFrame(window.__h);const f=()=>{const W=__chog.world;${js};window.__h=requestAnimationFrame(f)};f()})()`);
const freezeBots = `for(const b of W.actors.slice(1)){b.vx=b.vy=0}`;
// Desktop
await start(1280, 720, false);
await shot('gameplay');
// Out-of-cone readability: walk the player to the concourse centre and aim into a wall, so most of the screen is remembered/unlit.
await ev(`(()=>{const W=__chog.world;const p=W.actors[0];p.hp=1e9;const L=W.level;for(let y=0;y<L.h;y++)for(let x=0;x<L.w;x++){const i=y*L.w+x;if(L.tiles[i]!==1)__chog.renderer&&0}})()`);
await ev(`(()=>{const W=__chog.world,p=W.actors[0];p.x=22.5;p.y=13.5;for(const b of W.actors.slice(1))b.x=b.y=-40})()`);
// explore: sweep aim around for a second via mouse
for (const [x, y] of [[1270, 360], [640, 710], [10, 360], [640, 10], [1270, 360]]) { await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(500); }
await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1270, y: 700 }); await shot('out-of-cone');
// Enemy in view at 4 u.
await hold(`const p=W.actors[0];p.hp=1e9;const b=W.actors[1];b.alive=true;b.hp=b.maxHp;b.x=p.x+Math.cos(p.facing)*4;b.y=p.y+Math.sin(p.facing)*4;${freezeBots}`);
await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1270, y: 360 }); await shot('enemy-in-view');
await ev(`cancelAnimationFrame(window.__h)`);
// Debug overlay (after only shows bot perception).
await start(1280, 720, false, '&overlay');
await ev(`(()=>{const w=__chog.world,p=w.actors[0];p.hp=1e9;for(const b of w.actors.slice(1,3)){b.x=p.x+2.5;b.y=p.y+0.3+b.id*0.05}})()`); await sleep(1500); await shot('debug-overlay');
// Slab navigation: Brick deploys a slab across a bot's path.
await start(1280, 720, false);
await ev(`__chog.setHero && __chog.setHero('brick')`); await ev(`__chog.go('pause')`); await ev(`__chog.go('restart')`); await sleep(1800);
const slab = await ev(`(()=>{const W=__chog.world,p=W.actors[0];p.hp=1e9;p.x=22.5;p.y=13.5;p.facing=0;for(const b of W.actors.slice(2))b.x=b.y=-40;const b=W.actors[1];b.x=26.5;b.y=10.5;return 'ok'})()`);
await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1270, y: 360 }); await sleep(300);
await cmd('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ' }); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ' });
await ev(`(()=>{const W=__chog.world,b=W.actors[1],br=W.brains.get(1);br.state='investigate';br.lastKnown={x:26.5,y:17.5};br.goal=null;br.path=[]})()`);
await sleep(2500); await shot('slab-navigation');
// Spawn room overview (crate placement vs the south door): player on spawn, aim down at the door.
await start(1280, 720, false);
await ev(`(()=>{const w=__chog.world,p=w.actors[0];p.hp=1e9;p.x=3.5;p.y=2.5})()`);
await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 700 }); await sleep(1500); await shot('spawn-crates');
// Blocked shot: fire at the spawn crate from 2 u (beyond the 1.25 u lean) -> knock + spark + outline flash.
await hold(`const p=W.actors[0];p.hp=1e9;p.x=3.0;p.y=2.0;${freezeBots}`);
await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 700 }); await sleep(300);
await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 700, button: 'left', clickCount: 1 }); await sleep(450);
await shot('blocked-shot');
await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 700, button: 'left', clickCount: 1 });
await ev(`cancelAnimationFrame(window.__h)`);
// Phone 844x390 + toast
await start(844, 390, true);
await shot('phone-tutorial-toast');
await ev(`(()=>{const W=__chog.world,p=W.actors[0];p.hp=1e9})()`);
await hold(`const p=W.actors[0];const b=W.actors[1];b.alive=true;b.x=p.x+Math.cos(p.facing)*3.5;b.y=p.y+Math.sin(p.facing)*3.5;${freezeBots}`);
await sleep(15000); await shot('phone-layout');
await ev(`cancelAnimationFrame(window.__h)`);
// 667x375
await start(667, 375, true); await sleep(1000); await shot('phone-667');
console.log('console errors:', errs.length ? errs : 'none');
fs.writeFileSync(`${dir}/${prefix}-errors.json`, JSON.stringify(errs));
ws.close(); chrome.kill(); process.exit(0);
