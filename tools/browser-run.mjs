// Scripted browser run over Chrome DevTools Protocol (Node 22 global WebSocket, no deps).
// Usage: npm run dev, then: node tools/browser-run.mjs http://localhost:5173/ <outdir>
// Needs google-chrome on PATH. Uses the dev-only window.__chog hook. Screenshots land in <outdir>/p1-*.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [url, outDir] = process.argv.slice(2);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=9334', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tgt;
for (let i = 0; i < 50 && !tgt; i++) { await sleep(200); try { tgt = (await (await fetch('http://127.0.0.1:9334/json')).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m); pend.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) errors.push(`${m.params.type}: ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) errors.push(`log ${m.params.entry.level}: ${m.params.entry.text} ${m.params.entry.url ?? ''}`);
};
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const shot = async (name) => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${outDir}/p1-${name}.png`, Buffer.from(r.data, 'base64')); console.log('shot', name); };
const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result?.value; };
const key = async (type, code) => cmd('Input.dispatchKeyEvent', { type, code, key: code.replace('Key', '').toLowerCase(), windowsVirtualKeyCode: code.replace('Key', '').charCodeAt(0) });
const mouse = (type, x, y, button = 'none') => cmd('Input.dispatchMouseEvent', { type, x, y, button, clickCount: button === 'none' ? 0 : 1 });
const log = (...a) => console.log(...a);

await cmd('Runtime.enable'); await cmd('Log.enable'); await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await cmd('Page.navigate', { url }); await sleep(3500);
await shot('title');

// Start and explore with keys + mouse.
await mouse('mouseMoved', 900, 360); await mouse('mousePressed', 640, 360, 'left'); await mouse('mouseReleased', 640, 360, 'left');
await sleep(400);
log('phase after click:', await ev('__chog.phase'));
await mouse('mouseMoved', 640, 600);
await key('keyDown', 'KeyS'); await sleep(900); await key('keyUp', 'KeyS');
await mouse('mouseMoved', 1000, 500);
await key('keyDown', 'KeyD'); await sleep(500); await key('keyUp', 'KeyD');
await sleep(300);
log('player after explore:', await ev('(()=>{const p=__chog.world.actors[0];return [p.x.toFixed(2),p.y.toFixed(2)]})()'));
await shot('explore-dark');

// Hidden enemy: player west of the x=9 wall facing east, bot Hall just behind it, inside range and cone.
const hidden = await ev(`(async()=>{const w=__chog.world;const p=w.actors[0];const b=w.actors.find(a=>a.name==='Hall');
  p.x=7.5;p.y=9.5;p.vx=p.vy=0;b.x=11.5;b.y=9.5;b.vx=b.vy=0;
  await new Promise(r=>setTimeout(r,250)); b.x=11.5;b.y=9.5;
  const d=Math.hypot(b.x-p.x,b.y-p.y); return {dist:d.toFixed(2), facingDeg:(p.facing*180/Math.PI).toFixed(1), visibleBots: __chog.renderer.visibleBots()}})()`);
await mouse('mouseMoved', 1100, 360);
await sleep(150);
const hidden2 = await ev(`(()=>{const w=__chog.world;const p=w.actors[0];const b=w.actors.find(a=>a.name==='Hall');b.x=11.5;b.y=9.5;return {px:p.x,py:p.y,bx:b.x,by:b.y,facingDeg:(p.facing*180/Math.PI).toFixed(1),visibleBots:__chog.renderer.visibleBots()}})()`);
log('hidden enemy check:', JSON.stringify(hidden), JSON.stringify(hidden2));
await shot('hidden-enemy');

// Same bot moved into the door gap line of sight: now it must render.
const shown = await ev(`(async()=>{const w=__chog.world;const p=w.actors[0];const b=w.actors.find(a=>a.name==='Hall');
  p.x=7.5;p.y=11.5;p.vx=p.vy=0;b.x=12.5;b.y=11.5;b.vx=b.vy=0; await new Promise(r=>setTimeout(r,120)); b.x=12.5;b.y=11.5; await new Promise(r=>setTimeout(r,60));
  return {visibleBots: __chog.renderer.visibleBots()}})()`);
log('visible enemy check:', JSON.stringify(shown));

// Combat: fire at it.
await mouse('mouseMoved', 1000, 360);
await mouse('mousePressed', 1000, 360, 'left');
await sleep(260);
await shot('combat-tracers');
await sleep(600);
await mouse('mouseReleased', 1000, 360, 'left');
await ev(`(()=>{__chog.world.actors[0].hp=1e9})()`);
log('after combat:', await ev(`(()=>{const w=__chog.world;const p=w.actors[0];return {shots:p.shots,hits:p.hits,kills:p.kills,hp:p.hp,phase:__chog.phase}})()`));

// FPS with many projectiles (headless software rendering; not representative of phones).
const fps0 = await ev(`new Promise(r=>setTimeout(()=>r(__chog.fps),1200))`);
const fps1 = await ev(`new Promise(r=>{let n=0,peak=0;const w=__chog.world;const t=setInterval(()=>{const p=w.actors[0];for(let i=0;i<40;i++){const a=Math.random()*Math.PI*2;w.bullets.push({x:p.x,y:p.y,dx:Math.cos(a),dy:Math.sin(a),ox:p.x,oy:p.y,life:0.9,owner:0,alive:true})}peak=Math.max(peak,w.bullets.length);if(++n>=22){clearInterval(t);r(__chog.fps+' fps, peak bullets '+peak)}},50)})`);
log('fps idle:', fps0?.toFixed(1), '| stress:', fps1);

// Death recap: put a bot facing the player at close range and let it shoot.
await ev('__chog.begin()'); await sleep(200);
await ev(`(()=>{const w=__chog.world;w.bullets.length=0;const p=w.actors[0];p.hp=30;
  for(const a of w.actors) if(a.team==='bot'){a.x=a.name==='Pump'?26.5:2.5; a.y=a.name==='Pump'?13.5:20.5; a.vx=a.vy=0;}
  const b=w.actors.find(a=>a.name==='Pump');p.x=20.5;p.y=11.5;p.vx=p.vy=0;b.facing=Math.PI;b.alive=true;b.hp=100;})()`);
await mouse('mouseMoved', 640, 100);
let phase = '';
for (let i = 0; i < 60 && phase !== 'recap'; i++) { await sleep(100); phase = await ev('__chog.phase'); }
await shot('death-recap');
log('phase:', phase);
await sleep(1500);
await shot('summary-death');

// Win: restart, then (forced) remove all bots to show the clear screen.
await key('keyDown', 'KeyR'); await key('keyUp', 'KeyR'); await sleep(400);
log('phase after R:', await ev('__chog.phase'));
await ev(`(()=>{for(const a of __chog.world.actors) if(a.team==='bot') a.alive=false;})()`);
await sleep(400);
log('phase after clear:', await ev('__chog.phase'));
await shot('win-summary');

// Phone landscape with touch.
await cmd('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true });
await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cmd('Page.reload'); await sleep(3500);
await shot('phone-title');
const tp = (x, y, id) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 });
await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(420, 200, 1)] });
await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await sleep(500);
log('phone phase:', await ev('__chog.phase'), 'mode body.touch:', await ev(`document.body.classList.contains('touch')`));
await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(150, 300, 1)] });
await cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(150, 250, 1)] });
await sleep(100);
await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(150, 250, 1), tp(680, 260, 2)] });
await cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(150, 245, 1), tp(730, 300, 2)] });
await sleep(700);
log('phone after sticks:', await ev(`(()=>{const p=__chog.world.actors[0];return {x:p.x.toFixed(2),y:p.y.toFixed(2),shots:p.shots,facingDeg:(p.facing*180/Math.PI).toFixed(0)}})()`));
await shot('phone-touch');
await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

console.log('CONSOLE ERRORS:', errors.length ? JSON.stringify(errors, null, 1) : 'none');
ws.close(); chrome.kill();
process.exit(0);
