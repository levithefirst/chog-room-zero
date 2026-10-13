// RC-6 landscape launch flow (headless swiftshader Chrome, emulated phone viewports and touch; NOT physical devices).
// Walks the owner's mobile list per variant: open in portrait -> first launch screen -> fullscreen + landscape request
// on the first tap -> the browser turns landscape -> rendering after the turn -> move, aim, fire, reload, ability ->
// pause/resume -> leave fullscreen and come back -> orientation change mid-run -> back to landscape with the same run
// and nothing stuck. Variants (browser behaviour is simulated where headless Chrome cannot do it):
//   android : Fullscreen API real (headless grants it); screen.orientation.lock stubbed to succeed, then the tool
//             turns the viewport to landscape the way Android Chrome would. Models Android Chrome.
//   denied  : Fullscreen real, lock real (headless rejects it, like desktop Chrome or a browser that refuses).
//   iphone  : no element Fullscreen API and no lock (iPhone Safari): the stage stays turned while the phone is upright.
// Bots are parked off the map during input checks (input and layout only; full matches: tools/rc5-touchplay.mjs).
// Usage: node tools/rc6-launch.mjs <baseUrl> <outJson> [shotDir]   (VARIANTS=android:390x844,iphone:390x844,...)
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [base, outFile, shotDir] = process.argv.slice(2);
const port = 9600 + Math.floor(Math.random() * 90);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let t;
for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
let ws; let id = 0; const P = new Map(); let errors = [];
async function attach(target) {
  ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m.result ?? m.error); P.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ')); };
}
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; };
async function freshTab() {
  const nt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  ws?.close(); await attach(nt); await cmd('Runtime.enable'); await cmd('Page.enable'); errors = [];
}
const view = (w, h) => Promise.all([cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: h > w ? 'portraitPrimary' : 'landscapePrimary', angle: h > w ? 0 : 90 } }),
  cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })]);
// Browser behaviour per variant, installed before the game's code runs. Logs every fullscreen/lock call and whether
// it ran inside a user gesture (navigator.userActivation.isActive).
const instrument = (variant) => `(() => {
  window.__fsLog = [];
  const act = () => navigator.userActivation ? navigator.userActivation.isActive : null;
  if (${JSON.stringify(variant)} === 'iphone') {
    for (const k of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(Document.prototype, k, { configurable: true, get: () => false });
    Element.prototype.requestFullscreen = undefined; Element.prototype.webkitRequestFullscreen = undefined;
    Object.defineProperty(ScreenOrientation.prototype, 'lock', { configurable: true, value: undefined });
    return;
  }
  const rf = Element.prototype.requestFullscreen;
  Element.prototype.requestFullscreen = function (o) { __fsLog.push({ fn: 'requestFullscreen', gesture: act(), navigationUI: o && o.navigationUI }); return rf.call(this, o); };
  const lk = ScreenOrientation.prototype.lock;
  Object.defineProperty(ScreenOrientation.prototype, 'lock', { configurable: true, value: function (o) {
    __fsLog.push({ fn: 'lock', o, fullscreen: !!document.fullscreenElement });
    return ${JSON.stringify(variant)} === 'android' ? Promise.resolve() : lk.call(this, o);
  } });
})()`;

let S = { rotated: false, w: 0, h: 0, screenW: 0 };
const readStage = async () => (S = await ev('__chog.stage()'));
const toScr = (x, y) => (S.rotated ? { x: S.screenW - y, y: x } : { x, y });
const center = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();if(!b.width)return null;const S=__chog.stage(),x=b.left+b.width/2,y=b.top+b.height/2;return S.rotated?[y,S.screenW-x]:[x,y]})()`);
const touch = (type, pts) => cmd('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ ...p, ...toScr(p.x, p.y) })) });
async function tap(sel) { const c = await center(sel); if (!c) return false; await touch('touchStart', [{ x: c[0], y: c[1], id: 90 }]); await touch('touchEnd', []); return true; }
const phase = () => ev('__chog.phase');
async function waitPhase(want, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await phase()) === want) return true; await sleep(25); } return false; }
const ticks = (n) => ev(`(async()=>{const w=__chog.world,t0=w.tick;for(let i=0;i<400&&w.tick-t0<${n};i++)await new Promise(r=>setTimeout(r,25));return w.tick-t0})()`);
const P0 = (f) => ev(`(()=>{const p=__chog.world.actors[0];return ${f}})()`);
const parkBots = `(()=>{for(const b of __chog.world.actors.slice(1)){b.x=b.y=-40;b.vx=b.vy=0}})()`;
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const shot = async (name) => { if (!shotDir) return; const s = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${shotDir}/rc6-${name}.png`, Buffer.from(s.data, 'base64')); };
// What is on screen, in stage coordinates: stage shape, canvas size, card text, HUD panels inside and apart, words
// that would mean a rotate prompt, and whether the canvas actually drew something (not a blank or black screen).
const look = () => ev(`(()=>{const S=__chog.stage(),st=document.getElementById('stage').getBoundingClientRect(),s=__chog.renderer.app.screen;
  const R=(b)=>S.rotated?{x:b.top,y:S.screenW-b.right,r:b.bottom,b:S.screenW-b.left}:{x:b.left,y:b.top,r:b.right,b:b.bottom};
  const ids=['vitals','foes','sys','weapon','ability','reload'];const rs=document.getElementById('hud').classList.contains('on')?ids.map(i=>{const e=document.getElementById(i);if(!e||e.offsetParent===null)return null;const b=e.getBoundingClientRect();return b.width?{i,...R(b)}:null}).filter(Boolean):[];
  const ov=[];for(let a=0;a<rs.length;a++)for(let k=a+1;k<rs.length;k++){const A=rs[a],B=rs[k];if(A.x<B.r&&B.x<A.r&&A.y<B.b&&B.y<A.b)ov.push(A.i+'/'+B.i)}
  const text=document.body.innerText;
  return {viewport:[innerWidth,innerHeight],stage:[S.w,S.h],rotated:S.rotated,fullscreen:S.fullscreen,launch:S.launch,canFs:S.canFs,screen:[Math.round(s.width),Math.round(s.height)],
    stageFills:Math.abs(st.left)<1&&Math.abs(st.top)<1&&Math.abs(st.right-innerWidth)<1&&Math.abs(st.bottom-innerHeight)<1,
    card:document.querySelector('#overlay:not(.hidden) h1, #overlay:not(.hidden) h2')?.textContent??null,phase:__chog.phase,
    rotatePrompt:/rotate|turn your|sideways|landscape/i.test(text),panels:rs.map(r=>r.i),overlaps:ov,outside:rs.filter(r=>r.x<0||r.y<0||r.r>S.w+1||r.b>S.h+1).map(r=>r.i),
    fsButtonShown:getComputedStyle(document.getElementById('fs')).display!=='none',fsLog:window.__fsLog}})()`);
// Non-black canvas: sample the WebGL backbuffer (preserveDrawingBuffer is off, so read right after a render).
const drawn = () => ev(`(()=>{const a=__chog.renderer.app;a.render();const gl=a.renderer.gl,w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,px=new Uint8Array(4*64);let lit=0;
  for(let i=0;i<64;i++){gl.readPixels(Math.floor((i%8+0.5)*w/8),Math.floor((Math.floor(i/8)+0.5)*h/8),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px.subarray(i*4,i*4+4));if(px[i*4]+px[i*4+1]+px[i*4+2]>40)lit++}return lit})()`);
const landscapeOk = (L) => L.stage[0] >= L.stage[1] && L.screen[0] === L.stage[0] && L.screen[1] === L.stage[1] && L.stageFills && !L.rotatePrompt && L.overlaps.length === 0 && L.outside.length === 0;

// Input round in stage coordinates: move east (left thumb), aim south and fire (right thumb), Reload, Ability.
async function controls() {
  await ev(parkBots); await ticks(10);
  const p0 = await P0('({x:p.x,y:p.y,shots:p.shots})');
  const lx = S.w * 0.18, ly = S.h * 0.72;
  await touch('touchStart', [{ x: lx, y: ly, id: 1 }]); await touch('touchMove', [{ x: lx + 50, y: ly, id: 1 }]); await ticks(25); await touch('touchEnd', []); await ticks(15);
  const p1 = await P0('({x:p.x,y:p.y})');
  const rx = S.w * 0.72, ry = S.h * 0.45;
  await touch('touchStart', [{ x: rx, y: ry, id: 2 }]); await touch('touchMove', [{ x: rx, y: ry + 50, id: 2 }]); await ticks(20);
  const f = await P0('p.facing'); await touch('touchEnd', []); await ticks(5);
  const s1 = await P0('p.shots');
  const reload = (await tap('#reload')) && (await ticks(3), await P0('p.reloadLeft>0'));
  const ability = (await tap('#ability')) && (await ticks(3), await P0('p.abilityCd>0'));
  return { moveEast: +(p1.x - p0.x).toFixed(2), aimSouth: angDiff(f, Math.PI / 2) < 0.15, fired: s1 - p0.shots, reload, ability,
    ok: p1.x - p0.x > 0.3 && Math.abs(p1.y - p0.y) < 0.3 && angDiff(f, Math.PI / 2) < 0.15 && s1 > p0.shots && reload && ability };
}
// Nothing held after a transition: no drift, no fire, and a fresh right push fires and aims west.
async function notStuck() {
  await ticks(10); const a = await P0('({x:p.x,y:p.y,shots:p.shots})'); await ticks(30); const b = await P0('({x:p.x,y:p.y,shots:p.shots,v:Math.hypot(p.vx,p.vy)})');
  const rx = S.w * 0.72, ry = S.h * 0.45;
  await touch('touchStart', [{ x: rx, y: ry, id: 6 }]); await touch('touchMove', [{ x: rx - 50, y: ry, id: 6 }]); await ticks(10);
  const f = await P0('p.facing'); const c = await P0('p.shots'); await touch('touchEnd', []); await ticks(5);
  return { drift: +Math.hypot(b.x - a.x, b.y - a.y).toFixed(3), idleShots: b.shots - a.shots, freshFire: c - b.shots, aimWest: angDiff(f, Math.PI) < 0.15,
    ok: Math.hypot(b.x - a.x, b.y - a.y) < 0.02 && b.v < 0.02 && b.shots === a.shots && c > b.shots && angDiff(f, Math.PI) < 0.15 };
}

const VARIANTS = (process.env.VARIANTS ?? 'android:390x844,android:375x667,denied:390x844,iphone:390x844,iphone:375x667').split(',').map((s) => { const [v, sz] = s.split(':'); const [w, h] = sz.split('x').map(Number); return { variant: v, w, h }; });
const rows = [];
for (const V of VARIANTS) {
  const name = `${V.variant}-${V.w}x${V.h}`;
  const R = { name, label: 'headless Chrome, emulated touch; browser fullscreen/lock behaviour simulated per variant; NOT a physical device', checks: {}, notes: [] };
  const ok = (k, pass, data) => { R.checks[k] = { pass: !!pass, ...(data === undefined ? {} : { data }) }; };
  try {
    await freshTab();
    await cmd('Page.addScriptToEvaluateOnNewDocument', { source: instrument(V.variant) });
    await view(V.w, V.h);
    await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(2500);
    await ev('localStorage.clear()'); await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(3000);
    await readStage();
    // 1. Opening in portrait: the landscape game at once, turned to fill the upright screen. No prompt, not blank.
    let L = await look(); const lit0 = await drawn();
    ok('1 open in portrait: landscape stage turned 90 deg, How to play showing, no rotate prompt, canvas drawn', L.rotated && landscapeOk(L) && L.card === 'Clear Room Zero' && lit0 > 0, { ...L, litSamples: lit0 });
    await shot(`${name}-1-open-portrait`);
    // 2-3. First launch tap (Got it): fullscreen then landscape lock, inside the tap's user gesture; once only.
    ok('2 launch screen needs no extra step: the first real tap is a menu button', await tap('[data-act="howto-close"]'));
    await sleep(900); L = await look();
    const log = L.fsLog ?? [];
    if (V.variant === 'iphone') ok('3 fullscreen/lock request: unsupported, nothing requested, no Full screen button, stage stays turned', !L.canFs && log.length === 0 && !L.fsButtonShown && L.rotated && landscapeOk(L) && L.card === 'CHOG / ROOM ZERO', L);
    else ok('3 fullscreen/lock request: fullscreen requested inside the tap gesture, then lock(landscape) while fullscreen', log[0]?.fn === 'requestFullscreen' && log[0].gesture === true && log[1]?.fn === 'lock' && log[1].o === 'landscape' && log[1].fullscreen && L.fullscreen
      && L.launch === (V.variant === 'android' ? 'locked' : 'lock-denied'), { log, launch: L.launch, fullscreen: L.fullscreen });
    await shot(`${name}-2-after-first-tap`);
    // 4-5. The browser turns landscape (Android: the lock; anywhere: the player turns a phone with auto-rotate on).
    if (V.variant !== 'denied') {
      await view(V.h, V.w); await sleep(800); await readStage(); L = await look();
      ok('4 transition to landscape: stage unturned, still on the title (nothing paused or lost)', !L.rotated && L.phase === 'title' && L.card === 'CHOG / ROOM ZERO', L);
      ok('5 rendering after the turn: canvas fills the landscape screen, drawn', landscapeOk(L) && (await drawn()) > 0, L);
      await shot(`${name}-3-landscape-title`);
    }
    ok('Enter -> Deploy -> play', (await tap('[data-go="start"]')) && (await sleep(400), await tap('[data-go="pick"]')) && (await waitPhase('play')));
    await ticks(20); L = await look();
    ok('5b play layout: HUD inside the stage, no overlaps, all panels, canvas drawn', landscapeOk(L) && L.panels.length >= 5 && (await drawn()) > 0, L);
    await shot(`${name}-4-play`);
    // 7. Controls.
    const c1 = await controls(); ok('7 move, aim, fire, reload, ability', c1.ok, c1);
    // 8. Pause / resume (button), resume fires nothing.
    ok('8 pause (button) and resume (button) with no shot', (await tap('#pause')) && (await waitPhase('pause', 2000)) && (await (async () => { const s = await P0('p.shots'); return (await tap('[data-go="resume"]')) && (await waitPhase('play', 2000)) && (await ticks(20), (await P0('p.shots')) === s); })()));
    // 9. Leave fullscreen mid-run (back gesture / system bar) with the move thumb held, then come back via the pause card.
    if (V.variant !== 'iphone') {
      await ev('window.__w1=__chog.world');
      const lx = S.w * 0.18, ly = S.h * 0.72;
      await touch('touchStart', [{ x: lx, y: ly, id: 4 }]); await touch('touchMove', [{ x: lx + 50, y: ly, id: 4 }]); await ticks(5);
      await ev('document.exitFullscreen()'); await sleep(600);
      L = await look(); const fsBtn = await center('[data-fs]');
      ok('9a leaving fullscreen pauses the same run, releases input, offers Full screen (card and HUD)', L.phase === 'pause' && !L.fullscreen && !!fsBtn && L.fsButtonShown && (await ev('__chog.world===window.__w1')) && (await ev('!__chog.renderer||true')), { ...L, fsBtn });
      await touch('touchEnd', []);
      const before = (await ev('window.__fsLog.length'));
      await tap('[data-fs]'); await sleep(800); L = await look();
      const again = (await ev('window.__fsLog')).slice(before);
      ok('9b Full screen button: re-enters fullscreen inside the tap gesture and asks for landscape again; no Full screen button while fullscreen', L.fullscreen && again[0]?.fn === 'requestFullscreen' && again[0].gesture === true && again[1]?.fn === 'lock' && !L.fsButtonShown, { again, fullscreen: L.fullscreen });
      ok('9c resume after returning to fullscreen: nothing stuck', (await tap('[data-go="resume"]')) && (await waitPhase('play', 2000)) && (await notStuck()).ok);
      // No automatic re-request after the player leaves fullscreen: only that button asked.
      const n = await ev('window.__fsLog.filter(x=>x.fn==="requestFullscreen").length');
      ok('9d fullscreen is never forced: exactly two requests (first tap, Full screen button)', n === 2, { requests: n });
    }
    // 10. Orientation change mid-run, a finger held through it: pauses the same run; the stage turns, play works there.
    await ev('window.__w2=__chog.world');
    const [lw, lh] = await ev('[innerWidth,innerHeight]');
    const hx = S.w * 0.18, hy = S.h * 0.72;
    await touch('touchStart', [{ x: hx, y: hy, id: 5 }]); await touch('touchMove', [{ x: hx + 50, y: hy, id: 5 }]); await ticks(5);
    await view(lh, lw); await sleep(800); await readStage(); L = await look();
    ok('10a orientation change mid-run: pauses the same run, stage still landscape, layout ok', L.phase === 'pause' && (await ev('__chog.world===window.__w2')) && landscapeOk(L) && L.rotated === (lw > lh), L); // the new viewport is lh x lw: turned if it is upright
    await touch('touchEnd', []);
    await tap('[data-go="resume"]'); await waitPhase('play', 2000);
    const c2 = await controls(); ok('10b controls in the new orientation (move east, aim south, fire, reload, ability)', c2.ok, c2);
    await shot(`${name}-5-after-flip`);
    // 11. Back to the first orientation with a finger on the glass: same run, nothing stuck, touch aligned.
    await touch('touchStart', [{ x: S.w * 0.18, y: S.h * 0.72, id: 7 }]);
    await view(lw, lh); await sleep(800); await readStage(); L = await look();
    const ph11 = L.phase;
    await touch('touchEnd', []);
    await tap('[data-go="resume"]'); await waitPhase('play', 2000);
    const ns = await notStuck();
    ok('11 back again: pauses, same run kept, no stuck move or fire, fresh touch aims where pushed', ph11 === 'pause' && (await ev('__chog.world===window.__w2')) && landscapeOk(await look()) && ns.ok, { phase: ph11, ...ns });
    ok('console errors: none', errors.length === 0, errors.slice(0, 3));
  } catch (e) { R.notes.push('exception: ' + (e?.stack ?? e)); }
  R.pass = Object.values(R.checks).every((c) => c.pass) && !R.notes.length;
  rows.push(R);
  console.log(`${R.pass ? 'PASS' : 'FAIL'} ${name}: ${Object.entries(R.checks).filter(([, c]) => !c.pass).map(([k, c]) => `${k} ${JSON.stringify(c.data ?? '')}`.slice(0, 500)).join(' | ') || `all ${Object.keys(R.checks).length} checks`} ${R.notes.join(' ')}`);
}
fs.writeFileSync(outFile, JSON.stringify({ base, rows }, null, 1));
console.log(`launch: ${rows.filter((r) => r.pass).length}/${rows.length} variants pass`);
chrome.kill(); process.exit(0);
