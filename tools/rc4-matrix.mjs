// RC-4 cross-device matrix (headless swiftshader Chrome with emulated viewports and touch; NOT physical devices).
// Every viewport gets a fresh tab (touch emulation leaks (pointer: coarse) for a tab's life), then plays through
// the real UI with the input that viewport would use: How to play -> Enter -> Deploy, layout checks, move, aim,
// fire, reload, ability, pause/resume (no shot), restart. Desktop also resizes the window and loses focus; touch
// viewports rotate three times mid-run with a finger held down. Bots are parked off the map during input checks
// so the player cannot die mid-check (input and layout only; gameplay and victory are covered by rc-autoplay).
// RC-6: touch devices always play on a landscape stage. A portrait touch viewport gets the landscape stage turned
// 90 deg (src/ui/stage.ts), so every touch here is written in stage coordinates and turned into viewport
// coordinates the same way the CSS transform does; layout is measured in stage coordinates too.
// Usage: node tools/rc4-matrix.mjs <baseUrl> <outJson> [shotDir] [ONLY=name,name]
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [base, outFile, shotDir] = process.argv.slice(2);
const port = 9800 + Math.floor(Math.random() * 90);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let t;
for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
let ws; let id = 0; const P = new Map(); let errors = []; let failed = [];
async function attach(target) {
  ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m.result ?? m.error); P.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Network.loadingFailed' && !m.params.canceled) failed.push(m.params.errorText);
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) failed.push(`${m.params.response.status} ${m.params.response.url}`); };
}
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; };
async function freshTab() {
  const nt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  ws?.close(); await attach(nt); await cmd('Runtime.enable'); await cmd('Network.enable'); errors = []; failed = [];
}
const view = (w, h, touch) => Promise.all([cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: touch ? 2 : 1, mobile: touch, screenOrientation: { type: h > w ? 'portraitPrimary' : 'landscapePrimary', angle: h > w ? 0 : 90 } }),
  cmd('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 0 })]);
const phase = () => ev('__chog.phase');
async function waitPhase(want, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await phase()) === want) return true; await sleep(25); } return false; }
const ticks = (n) => ev(`(async()=>{const w=__chog.world,t0=w.tick;for(let i=0;i<400&&w.tick-t0<${n};i++)await new Promise(r=>setTimeout(r,25));return w.tick-t0})()`);
const P0 = (f) => ev(`(()=>{const p=__chog.world.actors[0];return ${f}})()`);
// Stage geometry (RC-6): { rotated, w, h, screenW }. Refreshed after every viewport change.
let S = { rotated: false, w: 0, h: 0, screenW: 0 };
const readStage = async () => (S = await ev('__chog.stage()'));
const toScr = (x, y) => (S.rotated ? { x: S.screenW - y, y: x } : { x, y });
// Element centre in stage coordinates.
const center = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e||e.offsetParent===null&&getComputedStyle(e).position!=='fixed'&&getComputedStyle(e).position!=='absolute')return null;const b=e.getBoundingClientRect();if(!b.width)return null;const S=__chog.stage(),x=b.left+b.width/2,y=b.top+b.height/2;return S.rotated?[y,S.screenW-x]:[x,y]})()`);
// Touch points are given in stage coordinates.
const touch = (type, pts) => cmd('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ ...p, ...toScr(p.x, p.y) })) });
const mouse = (type, x, y) => cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...(type === 'mousePressed' ? { buttons: 1 } : {}) });
const keyDown = (code, key, vk) => cmd('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: vk });
const keyUp = (code, key, vk) => cmd('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
async function press(sel, isTouch) { const c = await center(sel); if (!c) return false;
  if (isTouch) { await touch('touchStart', [{ x: c[0], y: c[1], id: 90 }]); await touch('touchEnd', []); }
  else { await mouse('mouseMoved', c[0], c[1]); await mouse('mousePressed', c[0], c[1]); await mouse('mouseReleased', c[0], c[1]); }
  return true; }
const parkBots = `(()=>{for(const b of __chog.world.actors.slice(1)){b.x=b.y=-40;b.vx=b.vy=0}})()`;
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
// Layout: canvas fills the stage, and the stage fills the viewport; HUD panels visible, inside, not overlapping;
// player on screen and not under any HUD panel. All in stage coordinates (RC-6); touch stages must be landscape.
const layout = () => ev(`(()=>{const S=__chog.stage(),W=S.w,H=S.h,st=document.getElementById('stage').getBoundingClientRect(),s=__chog.renderer.app.screen;
  const R=(b)=>S.rotated?{x:b.top,y:S.screenW-b.right,r:b.bottom,b:S.screenW-b.left}:{x:b.left,y:b.top,r:b.right,b:b.bottom};
  const cb=R(document.querySelector('canvas').getBoundingClientRect()),c={width:cb.r-cb.x,height:cb.b-cb.y};
  const ids=['vitals','foes','sys','weapon','ability','reload'];const rs=ids.map(i=>{const e=document.getElementById(i);if(!e||e.offsetParent===null)return null;const b=e.getBoundingClientRect();return b.width?{i,...R(b)}:null}).filter(Boolean);
  const ov=[];for(let a=0;a<rs.length;a++)for(let k=a+1;k<rs.length;k++){const A=rs[a],B=rs[k];if(A.x<B.r&&B.x<A.r&&A.y<B.b&&B.y<A.b)ov.push(A.i+'/'+B.i)}
  const p=__chog.world.actors[0],ps=__chog.renderer.toScreen(p.x,p.y);const pr={x:ps.x-18,y:ps.y-24,r:ps.x+18,b:ps.y+18};
  const under=rs.filter(R=>R.x<pr.r&&pr.x<R.r&&R.y<pr.b&&pr.y<R.b).map(R=>R.i);
  return {W,H,rotated:S.rotated,viewport:[innerWidth,innerHeight],stageFillsViewport:Math.abs(st.left)<1&&Math.abs(st.top)<1&&Math.abs(st.right-innerWidth)<1&&Math.abs(st.bottom-innerHeight)<1,
    landscapeStage:W>=H,canvas:[Math.round(c.width),Math.round(c.height)],screen:[s.width,s.height],panels:rs.map(r=>r.i),overlaps:ov,outside:rs.filter(r=>r.x<0||r.y<0||r.r>W+1||r.b>H+1).map(r=>r.i),
    player:[Math.round(ps.x),Math.round(ps.y)],playerOnScreen:ps.x>0&&ps.y>0&&ps.x<W&&ps.y<H,playerUnderHud:under,prompt:!!document.getElementById('rotate'),touchMode:document.body.classList.contains('touch'),hud:document.getElementById('hud').classList.contains('on')}})()`);
// Canvas/screen within 1 px: at DPR 1.5 Pixi reports e.g. 667.33 for a 667 px viewport (device-pixel rounding).
const near = (a, b) => Math.abs(a - b) < 1;
const layoutOk = (L) => near(L.canvas[0], L.W) && near(L.canvas[1], L.H) && near(L.screen[0], L.W) && near(L.screen[1], L.H) && L.stageFillsViewport && (!L.touchMode || L.landscapeStage) && L.overlaps.length === 0 && L.outside.length === 0 && L.playerOnScreen && L.playerUnderHud.length === 0 && !L.prompt && L.hud && L.panels.length >= 5;
const shot = async (name) => { if (!shotDir) return; const s = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${shotDir}/rc4-${name}.png`, Buffer.from(s.data, 'base64')); };

const VIEWPORTS = [
  { name: 'desktop-1920x1080', w: 1920, h: 1080, touch: false, resize: [[1440, 900], [2560, 1080], [1920, 1080]] },
  { name: 'laptop-1440x900', w: 1440, h: 900, touch: false, resize: [[1280, 720], [1440, 900]] },
  { name: 'laptop-1280x720', w: 1280, h: 720, touch: false, resize: [[1024, 768], [1280, 720]] },
  { name: 'compact-1024x768', w: 1024, h: 768, touch: false, resize: [[800, 1000], [1024, 768]] },
  { name: 'ultrawide-2560x1080', w: 2560, h: 1080, touch: false, resize: [] },
  { name: 'tablet-landscape-1180x820', w: 1180, h: 820, touch: true },
  { name: 'tablet-portrait-820x1180', w: 820, h: 1180, touch: true },
  { name: 'tablet-landscape-1024x768', w: 1024, h: 768, touch: true },
  { name: 'phone-landscape-844x390', w: 844, h: 390, touch: true },
  { name: 'phone-landscape-667x375', w: 667, h: 375, touch: true },
  { name: 'phone-portrait-390x844', w: 390, h: 844, touch: true },
  { name: 'phone-portrait-375x667', w: 375, h: 667, touch: true },
];
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
const rows = [];

for (const V of VIEWPORTS.filter((v) => !only.length || only.some((o) => v.name.includes(o)))) {
  const R = { viewport: V.name, input: V.touch ? 'touch (emulated)' : 'keyboard+mouse', checks: {}, notes: [] };
  const ok = (k, pass, data) => { R.checks[k] = { pass: !!pass, ...(data === undefined ? {} : { data }) }; };
  try {
    await freshTab(); await view(V.w, V.h, V.touch);
    await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(2500);
    await ev('localStorage.clear()'); await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(3000);
    const pre = await ev(`({h2:document.querySelector('#overlay h2')?.textContent,prompt:!!document.getElementById('rotate'),stage:__chog.stage(),screen:[__chog.renderer.app.screen.width,__chog.renderer.app.screen.height]})`);
    await readStage();
    ok('loads (How to play card)', pre.h2 === 'Clear Room Zero', pre);
    ok('no turn-sideways prompt; touch draws a landscape stage at once (RC-6)', !pre.prompt && (!V.touch || (pre.stage.w >= pre.stage.h && pre.screen[0] >= pre.screen[1] && pre.stage.rotated === V.h > V.w)), pre);
    await shot(`${V.name}-howto`);
    const T = V.touch;
    const [W, H] = [S.w, S.h]; // stage size: a turned portrait phone is W x H landscape
    ok('How to play: Got it', await press('[data-act="howto-close"]', T)); await sleep(300);
    ok('Title: Enter', await press('[data-go="start"]', T)); await sleep(400);
    await shot(`${V.name}-select`);
    ok('Hero select: Deploy', await press('[data-go="pick"]', T));
    ok('reaches play', await waitPhase('play')); await ev(parkBots); await ticks(20);
    let L = await layout(); ok('layout in play: canvas fills viewport, HUD inside, no overlaps, player on screen', layoutOk(L), L);
    await shot(`${V.name}-play`);
    const p0 = await P0('({x:p.x,y:p.y,shots:p.shots})');
    if (!T) {
      await keyDown('KeyD', 'd', 68); await ticks(25); await keyUp('KeyD', 'd', 68); await ticks(15);
      const p1 = await P0('({x:p.x,y:p.y})'); ok('move (D key)', p1.x - p0.x > 0.3, { dx: +(p1.x - p0.x).toFixed(2) });
      const ps = await ev(`(()=>{const p=__chog.world.actors[0];return __chog.renderer.toScreen(p.x,p.y)})()`);
      await mouse('mouseMoved', ps.x, ps.y + 200); await ticks(6);
      ok('aim (mouse below the player faces south)', angDiff(await P0('p.facing'), Math.PI / 2) < 0.15, { facing: +(await P0('p.facing')).toFixed(2) });
      await mouse('mousePressed', ps.x, ps.y + 200); await ticks(20); await mouse('mouseReleased', ps.x, ps.y + 200); await ticks(5);
      const s1 = await P0('p.shots'); ok('fire (left click)', s1 > p0.shots, { shots: s1 - p0.shots });
      await keyDown('KeyR', 'r', 82); await keyUp('KeyR', 'r', 82); await ticks(3);
      ok('reload (R)', await P0('p.reloadLeft>0'));
      await keyDown('Space', ' ', 32); await ticks(2); await keyUp('Space', ' ', 32); await ticks(2);
      ok('ability (Space)', await P0('p.abilityCd>0'), { cd: await P0('+p.abilityCd.toFixed(2)') });
    } else {
      const lx = W * 0.18, ly = H * 0.72;
      await touch('touchStart', [{ x: lx, y: ly, id: 1 }]); await touch('touchMove', [{ x: lx + 50, y: ly, id: 1 }]); await ticks(25); await touch('touchEnd', []); await ticks(15);
      const p1 = await P0('({x:p.x,y:p.y})'); ok('move (left thumb)', p1.x - p0.x > 0.3, { dx: +(p1.x - p0.x).toFixed(2) });
      const rx = W * 0.72, ry = H * 0.45;
      await touch('touchStart', [{ x: rx, y: ry, id: 2 }]); await touch('touchMove', [{ x: rx, y: ry + 50, id: 2 }]); await ticks(20);
      ok('aim (right thumb down faces south)', angDiff(await P0('p.facing'), Math.PI / 2) < 0.15, { facing: +(await P0('p.facing')).toFixed(2) });
      await touch('touchEnd', []); await ticks(5);
      const s1 = await P0('p.shots'); ok('fire (right thumb past the ring)', s1 > p0.shots, { shots: s1 - p0.shots });
      ok('reload (Reload button)', (await press('#reload', true)) && (await ticks(3), await P0('p.reloadLeft>0')));
      ok('ability (Ability button)', (await press('#ability', true)) && (await ticks(3), await P0('p.abilityCd>0')));
    }
    // Pause / resume via the on-screen buttons; the resume press never fires.
    ok('pause (pause button)', (await press('#pause', T)) && (await waitPhase('pause', 2000)));
    const sP = await P0('p.shots');
    ok('resume (Resume button) fires no shot', (await press('[data-go="resume"]', T)) && (await waitPhase('play', 2000)) && (await ticks(20), (await P0('p.shots')) === sP));
    // Restart from the pause card.
    await ev('window.__w0=__chog.world');
    await press('#pause', T); await waitPhase('pause', 2000);
    ok('restart (pause -> Restart -> new run)', (await press('[data-go="restart"]', T)) && (await waitPhase('play', 8000)) && (await ev('__chog.world!==window.__w0')));
    await ev(parkBots); await ticks(10);
    if (!T) {
      const sizes = [];
      for (const [w, h] of V.resize) {
        await view(w, h, false); await sleep(500); await readStage();
        const phResize = await phase(); // an orientation flip pauses the run; a same-orientation resize does not
        if (phResize === 'pause') { await press('[data-go="resume"]', false); await waitPhase('play', 2000); }
        await ticks(5);
        const LL = await layout();
        const ps = await ev(`(()=>{const p=__chog.world.actors[0];return __chog.renderer.toScreen(p.x,p.y)})()`);
        // Aim 200 px west, or east if that would leave the window (the portrait camera can put the player near an edge).
        const west = ps.x > 220;
        await mouse('mouseMoved', west ? ps.x - 200 : ps.x + 200, ps.y); await ticks(6);
        const f = await P0('p.facing') + (west ? 0 : Math.PI);
        sizes.push({ w, h, phaseAfterResize: phResize, layoutOk: layoutOk(LL), aimWestOk: angDiff(f, Math.PI) < 0.15, overlaps: LL.overlaps, outside: LL.outside, under: LL.playerUnderHud, canvas: LL.canvas });
      }
      if (V.resize.length) ok('window resize during play: canvas, HUD and mouse aim follow', sizes.every((s) => s.layoutOk && s.aimWestOk), sizes);
      // Focus loss while holding D: pauses, and nothing stays held after resuming.
      await keyDown('KeyD', 'd', 68); await ticks(5);
      await ev(`window.dispatchEvent(new Event('blur'))`); await sleep(200);
      const phB = await phase();
      await press('[data-go="resume"]', false); await waitPhase('play', 2000); await ticks(30);
      const v = await P0('Math.hypot(p.vx,p.vy)');
      ok('focus loss (blur event) pauses and releases held keys', phB === 'pause' && v < 0.05, { phaseOnBlur: phB, speedAfterResume: +v.toFixed(3) });
      await keyUp('KeyD', 'd', 68);
    } else {
      // Rotation x3 during an active run, a finger held on the move stick each time (no release event is sent).
      const cycles = [];
      let [cw, ch] = [W, H], [vw, vh] = [V.w, V.h];
      for (let c = 0; c < 3; c++) {
        const before = await P0('({tick:__chog.world.tick,hp:p.hp,kills:p.kills,shots:p.shots})');
        await ev('window.__w1=__chog.world');
        const lx = cw * 0.18, ly = ch * 0.72;
        await touch('touchStart', [{ x: lx, y: ly, id: 5 }]); await touch('touchMove', [{ x: lx + 50, y: ly, id: 5 }]); await ticks(5);
        [vw, vh] = [vh, vw]; await view(vw, vh, true); await sleep(700); await readStage(); [cw, ch] = [S.w, S.h];
        const rot = await layout(); const phR = await phase();
        // Play in the new orientation: Resume, move with the left thumb, aim west with the right thumb.
        let rotPlay = null;
        if (phR === 'pause') {
          await press('[data-go="resume"]', true); await waitPhase('play', 2000); await ticks(5);
          const a0 = await P0('({x:p.x,y:p.y})');
          const mx = cw * 0.18, my = ch * 0.72;
          const dy = c % 2 === 0 ? -50 : 50; // north, then south: the spawn room's north wall stops a second push north
          await touch('touchStart', [{ x: mx, y: my, id: 7 }]); await touch('touchMove', [{ x: mx, y: my + dy, id: 7 }]); await ticks(20); await touch('touchEnd', []); await ticks(10);
          const a1 = await P0('({x:p.x,y:p.y})');
          const ax = cw * 0.72, ay = ch * 0.45;
          await touch('touchStart', [{ x: ax, y: ay, id: 8 }]); await touch('touchMove', [{ x: ax - 50, y: ay, id: 8 }]); await ticks(10);
          const fr = await P0('p.facing'); await touch('touchEnd', []); await ticks(5);
          rotPlay = { moved: +Math.hypot(a1.x - a0.x, a1.y - a0.y).toFixed(2), dir: dy < 0 ? 'north' : 'south', rightWay: Math.sign(a1.y - a0.y) === Math.sign(dy), aimWest: angDiff(fr, Math.PI) < 0.15, layoutOk: layoutOk(await layout()) };
          await shot(`${V.name}-rot${c}-play`);
        }
        const hx = cw * 0.18, hy = ch * 0.72;
        await touch('touchStart', [{ x: hx, y: hy, id: 5 }]); // a finger on the glass as the device turns back
        [vw, vh] = [vh, vw]; await view(vw, vh, true); await sleep(700); await readStage(); [cw, ch] = [S.w, S.h];
        const back = await layout(); const phB = await phase();
        const held = { x: Math.min(hx, cw - 2), y: Math.min(hy, ch - 2), id: 5 }; // still on the glass through the turn
        if (phB === 'pause') { const r = await center('[data-go="resume"]'); await touch('touchStart', [held, { x: r[0], y: r[1], id: 91 }]); await touch('touchMove', [held]); /* lift only the Resume finger: CDP touchEnd must carry no points */ await waitPhase('play', 2000); }
        await ticks(15); const pos0 = await P0('({x:p.x,y:p.y})'); await ticks(30);
        const pos1 = await P0('({x:p.x,y:p.y,speed:Math.hypot(p.vx,p.vy)})');
        await touch('touchEnd', []); await ticks(3);
        const rx = cw * 0.72, ry = ch * 0.45;
        await touch('touchStart', [{ x: rx, y: ry, id: 6 }]); await touch('touchMove', [{ x: rx - 50, y: ry, id: 6 }]); await ticks(10);
        const fW = await P0('p.facing'); await touch('touchEnd', []); await ticks(5);
        const same = await ev('__chog.world===window.__w1');
        cycles.push({ cycle: c + 1, rotatedTo: `${rot.viewport.join('x')} (stage ${rot.W}x${rot.H}${rot.rotated ? ' turned' : ''})`, phaseRotated: phR, rotatedLayoutOk: layoutOk(rot), rotPlay,
          backTo: `${back.viewport.join('x')} (stage ${back.W}x${back.H}${back.rotated ? ' turned' : ''})`, phaseBack: phB, backLayoutOk: layoutOk(back), sameRun: same,
          drift: +Math.hypot(pos1.x - pos0.x, pos1.y - pos0.y).toFixed(3), speedAfter: +pos1.speed.toFixed(3), aimWestOk: angDiff(fW, Math.PI) < 0.15, hpKept: before.hp });
      }
      ok('rotation x3 mid-run (finger held): each flip pauses the same run, layout follows, play works in the new orientation (move + aim), back again: no stuck move, touch aim aligned',
        cycles.every((c) => c.sameRun && c.phaseRotated === 'pause' && c.phaseBack === 'pause' && c.rotatedLayoutOk && c.backLayoutOk && c.rotPlay && c.rotPlay.moved > 0.3 && c.rotPlay.rightWay && c.rotPlay.aimWest && c.rotPlay.layoutOk
          && c.drift < 0.02 && c.speedAfter < 0.02 && c.aimWestOk), cycles);
    }
    ok('console errors: none', errors.length === 0, errors.slice(0, 3));
    ok('failed requests: none', failed.length === 0, failed.slice(0, 3));
  } catch (e) { R.notes.push('exception: ' + (e?.stack ?? e)); }
  R.pass = Object.values(R.checks).every((c) => c.pass) && !R.notes.length;
  rows.push(R);
  console.log(`${R.pass ? 'PASS' : 'FAIL'} ${V.name}: ${Object.entries(R.checks).filter(([, c]) => !c.pass).map(([k, c]) => `${k} ${JSON.stringify(c.data ?? '')}`.slice(0, 400)).join(' | ') || 'all checks'} ${R.notes.join(' ')}`);
}
fs.writeFileSync(outFile, JSON.stringify({ base, label: 'headless Chrome (swiftshader), emulated viewports/touch; NOT physical devices', rows }, null, 1));
console.log(`matrix: ${rows.filter((r) => r.pass).length}/${rows.length} viewports pass`);
chrome.kill(); process.exit(0);
