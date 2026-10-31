// P0 bug-fix sprint browser checks. Usage: node tools/p0fix-run.mjs <url with ?debug> [shotDir]
// Headless Chrome uses SwiftShader (software GL); fps is not meaningful here.
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const url = process.argv[2]; const dir = process.argv[3] || '/workspace/shots';
const port = 9400 + Math.floor(Math.random() * 50);
const chrome = spawn(process.env.CHROME_BIN ?? 'google-chrome', ['--headless=new','--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader',`--remote-debugging-port=${port}`,'--autoplay-policy=no-user-gesture-required','about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let t;
for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = []; const results = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 300)); if (m.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(m.params.type)) errs.push(m.params.args.map((a) => a.value).join(' ')); };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value ?? r.exceptionDetails?.exception?.description; };
const shot = async (n) => { const s = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${dir}/p0fix-${n}.png`, Buffer.from(s.data, 'base64')); };
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`); };
const mouse = (type, x, y, extra = {}) => cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
await cmd('Runtime.enable');
const start = async (w, h, mobile) => {
  await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
  await cmd('Page.navigate', { url }); await sleep(3500);
  await ev(`__chog.go('start')`); await sleep(200); await ev(`__chog.go('pick')`); await sleep(1800);
};
// Place the player in the first open 7-tile run and aim right with the real mouse.
const openSpot = `(()=>{const W=__chog.world,L=W.level,p=W.actors[0];const F=L.tiles[Math.floor(p.y)*L.w+Math.floor(p.x)];for(let y=2;y<L.h-2;y++)for(let x=2;x<L.w-8;x++){let ok=true;for(let k=-2;k<=6;k++)for(let j=-1;j<=1;j++)if(L.tiles[(y+j)*L.w+x+k]!==F)ok=false;if(ok){p.x=x+.5;p.y=y+.5;return [p.x,p.y]}}})()`;
const pinLoop = (dx, dy) => `(()=>{window.__pin&&cancelAnimationFrame(window.__pin);const tick=()=>{const W=__chog.world;const p=W.actors[0];p.hp=1e9;for(const b of W.actors.slice(2))b.x=b.y=-50;const b=W.actors[1];b.alive=true;b.hp=1e9;b.x=p.x+${dx};b.y=p.y+${dy};b.vx=b.vy=0;window.__pin=requestAnimationFrame(tick)};tick()})()`;

// ---- Desktop 1280x720
await start(1280, 720, false);
await ev(openSpot);
await mouse('mouseMoved', 1250, 360); await sleep(300);
const ps = await ev(`(()=>{const p=__chog.world.actors[0];const s=__chog.renderer.toScreen(p.x,p.y);return [s.x,s.y]})()`);
await mouse('mouseMoved', Math.min(1270, ps[0] + 320), ps[1]); await sleep(300);
await ev(pinLoop(3, 0)); await sleep(1500);
const v1 = await ev(`({vis:__chog.renderer.visibleBots(), facing:+__chog.world.actors[0].facing.toFixed(2)})`);
check('enemy 3 u ahead in cone is drawn', v1.vis >= 1, v1); await shot('enemy-in-cone');
// Flash: bot behind the player shoots; must be drawn (flashBots >= 1) without being in cone.
await ev(pinLoop(-2.2, 0)); await sleep(400);
const before = await ev(`({vis:__chog.renderer.visibleBots(), flash:__chog.renderer.flashBots()})`);
await ev(`(()=>{const W=__chog.world;const p=W.actors[0],b=W.actors[1];b.facing=Math.atan2(p.y-b.y,p.x-b.x);__chog.fx.threats[b.id]=0.9})()`); await sleep(450);
const after = await ev(`({vis:__chog.renderer.visibleBots(), flash:__chog.renderer.flashBots()})`);
check('bot behind player hidden until it shoots, then flash-drawn', before.vis === 0 && before.flash === 0 && after.flash >= 1, { before, after }); await shot('flash-reveal');
await ev(`cancelAnimationFrame(window.__pin)`);

// Blur pause + HP freeze.
await ev(`(()=>{const p=__chog.world.actors[0];p.hp=100;p.armor=0})()`);
await ev(`window.dispatchEvent(new Event('blur'))`); await sleep(100);
const hp0 = await ev(`__chog.world.actors[0].hp`); const tick0 = await ev(`__chog.world.tick`);
await ev(`(()=>{const W=__chog.world,p=W.actors[0];W.bullets.push({x:p.x-2,y:p.y,dx:1,dy:0,ox:p.x-2,oy:p.y,life:1,owner:1,weapon:W.actors[1].weapon,alive:true})})()`);
await sleep(3000);
const bl = { phase: await ev('__chog.phase'), hp0, hp1: await ev(`__chog.world.actors[0].hp`), ticks: (await ev('__chog.world.tick')) - tick0 };
check('window blur pauses; no sim steps and no HP loss while paused', bl.phase === 'pause' && bl.hp1 === bl.hp0 && bl.ticks === 0, bl); await shot('blur-pause');
await ev(`__chog.world.bullets.length=0`);
await ev(`__chog.go('resume')`); const tr = await ev('__chog.world.tick'); await sleep(50); const tr2 = await ev('__chog.world.tick');
check('resume does not burst-catch-up', tr2 - tr <= 8, { stepsIn50ms: tr2 - tr });
// Hidden tab pause.
await ev(`(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))})()`); await sleep(100);
const hp2 = await ev(`__chog.world.actors[0].hp`); await sleep(2000);
const hid = { phase: await ev('__chog.phase'), hpBefore: hp2, hpAfter: await ev(`__chog.world.actors[0].hp`) };
check('hidden tab pauses; HP unchanged', hid.phase === 'pause' && hid.hpBefore === hid.hpAfter, hid);
await ev(`(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});__chog.go('resume')})()`); await sleep(300);

// Summary gate: hold mouse through death and spam clicks after.
await ev(`(()=>{const W=__chog.world;W.actors[0].hp=1;W.actors[0].armor=0})()`);
await mouse('mousePressed', 900, 360);
await ev(`(()=>{const W=__chog.world,p=W.actors[0];for(let i=0;i<4;i++)W.bullets.push({x:p.x-1.5,y:p.y+i*0.01,dx:1,dy:0,ox:p.x-1.5,oy:p.y,life:1,owner:1,weapon:W.actors[1].weapon,alive:true})})()`);
for (let i = 0; i < 200 && (await ev('__chog.phase')) !== 'results'; i++) await sleep(10);
const tRes = await ev('performance.now()');
const atResults = await ev('__chog.phase');
await mouse('mouseReleased', 900, 360);
const btn = await ev(`(()=>{const r=document.querySelector('[data-go=restart]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
let spam = 0, restartedEarly = false;
while ((await ev('performance.now()')) - tRes < 650) {
  await mouse('mousePressed', btn[0], btn[1]); await mouse('mouseReleased', btn[0], btn[1]); spam++;
  await cmd('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyR', key: 'r' }); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyR', key: 'r' });
  if ((await ev('__chog.phase')) !== 'results') restartedEarly = true;
}
await shot('death-summary');
const stillResults = restartedEarly ? 'restarted' : await ev('__chog.phase');
await sleep(300);
await cmd('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyR', key: 'r' }); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyR', key: 'r' }); await sleep(100);
const afterR = await ev('__chog.phase');
await mouse('mousePressed', btn[0], btn[1]); await mouse('mouseReleased', btn[0], btn[1]); await sleep(400);
const afterFresh = await ev('__chog.phase');
check('click spam on Again + R cannot skip summary; fresh click after 0.75 s restarts', atResults === 'results' && stillResults === 'results' && afterR === 'results' && afterFresh !== 'results', { atResults, spamPressesInLock: spam, stillResults, afterR, afterFresh });

// Tap fire latch in the real page: down+up in the same task.
for (let i = 0; i < 60 && (await ev('__chog.phase')) !== 'play'; i++) await sleep(100);
await sleep(500);
await ev(openSpot); await mouse('mouseMoved', 1200, 360); await sleep(300);
const s0 = await ev(`__chog.world.actors[0].shots`);
let taps = 0;
for (let i = 0; i < 20; i++) { await ev(`(()=>{const c=document.querySelector('canvas');const o={button:0,pointerType:'mouse',clientX:1200,clientY:360,bubbles:true};c.dispatchEvent(new PointerEvent('pointerdown',o));window.dispatchEvent(new PointerEvent('pointerup',o))})()`); taps++; await ev(`(()=>{const p=__chog.world.actors[0];p.hp=1e9;p.ammo=p.weapon.magazine;p.reloadLeft=0})()`); await sleep(+(process.env.TAPGAP || 260)); }
const s1 = await ev(`__chog.world.actors[0].shots`);
check('20 synchronous taps fire 20 shots', s1 - s0 === 20, { taps, shots: s1 - s0, phase: await ev('__chog.phase'), fps: +(await ev('__chog.fps')).toFixed(1), gapMs: +(process.env.TAPGAP || 260) });
await shot('desktop-play');

// ---- Phone 844x390 touch
await start(844, 390, true);
await shot('phone-play');
const ph = await ev(`({phase:__chog.phase, touch: document.body.classList.contains('touch')})`);
await ev(openSpot);
await ev(pinLoop(3, 0));
await ev(`(()=>{__chog.world.actors[0].facing=0})()`);
// touch aim right: right stick drag
await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 640, y: 250, id: 2 }] });
await cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 652, y: 250, id: 2 }] }); await sleep(400);
await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(800);
const pv = await ev(`({vis:__chog.renderer.visibleBots()})`);
check('phone: game runs in touch mode, enemy ahead drawn', ph.phase === 'play' && pv.vis >= 1, { ...ph, ...pv });
await shot('phone-enemy');
await ev(`cancelAnimationFrame(window.__pin)`);

check('zero console errors/warnings', errs.length === 0, errs);
fs.writeFileSync(`${dir}/p0fix-results.json`, JSON.stringify({ url, results, errs }, null, 1));
ws.close(); chrome.kill(); process.exit(results.every((r) => r.ok) ? 0 : 1);
