// P1FT headless checks (swiftshader Chrome, emulated viewports; NOT device validation).
// Usage: node tools/p1ft-e2e.mjs <baseUrl> <outJson>
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [base, outFile] = process.argv.slice(2);
const port = 9400 + Math.floor(Math.random() * 50);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let t;
for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
let ws; let id = 0; const P = new Map(); const errors = [];
async function attach(target) {
  ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m.result ?? m.error); P.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ')); };
}
await attach(t);
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
// A new tab. Touch emulation, once on, keeps (pointer: coarse) true for the life of a tab whatever CDP resets
// (RC-3, measured): the game then boots in touch mode. Sections that need a desktop pointer start here.
async function freshTab() {
  const nt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  ws.close(); await attach(nt); await cmd('Runtime.enable');
}
const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; };
await cmd('Runtime.enable');
const results = []; const check = (name, pass, data) => { results.push({ name, pass: !!pass, data }); console.log((pass ? 'PASS ' : 'FAIL ') + name, JSON.stringify(data)); };
const view = (w, h, mobile) => Promise.all([cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile }), cmd('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 })]);
const open = async (q = '&nooverlay', clear = true) => { await cmd('Page.navigate', { url: `${base}/?debug${q}` }); await sleep(3000); if (clear) { await ev('localStorage.clear()'); await cmd('Page.navigate', { url: `${base}/?debug${q}` }); await sleep(3000); } };
const play = async () => { await ev(`__chog.go('start')`); await sleep(300); await ev(`__chog.go('pick')`); await sleep(2000); };
const key = async (k, code) => { await cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: k.charCodeAt(0) }); await cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); };

// 1. UI-001: key 3 on hero select.
await view(1280, 720, false); await open();
await ev(`__chog.go('start')`); await sleep(400);
await key('3', 'Digit3'); await sleep(200);
const sel = await ev(`(document.querySelector('.hero.sel')||{}).dataset?.hero`);
await key('1', 'Digit1'); await sleep(200);
const sel1 = await ev(`(document.querySelector('.hero.sel')||{}).dataset?.hero`);
check('UI-001 key 3 selects Brick, key 1 selects Kettle', sel === 'brick' && sel1 === 'kettle', { after3: sel, after1: sel1 });

// 2. AI-001 scripted slab repro: Brick drops a slab across the concourse between a bot and its investigate target.
await key('3', 'Digit3'); await ev(`__chog.go('pick')`); await sleep(2200);
if ((await ev(`__chog.world.actors[0].hero.id`)) !== 'brick') { await ev(`__chog.setHero && __chog.setHero('brick')`); await ev(`__chog.go('pause')`); await ev(`__chog.go('restart')`); await sleep(2200); }
const slab = await ev(`(async()=>{const w=__chog.world,p=w.actors[0];p.hp=1e9;p.x=16.5;p.y=8.5;p.facing=0;
  for(const b of w.actors.slice(2)){b.x=b.y=-40}
  return {hero:p.hero.id}})()`);
await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1100, y: 360 });
await key(' ', 'Space'); await sleep(400);
const s2 = await ev(`(async()=>{const w=__chog.world,p=w.actors[0];const bar=w.barriers[0];if(!bar)return {err:'no slab',hero:p.hero.id};
  p.x=3.5;p.y=2.5; const b=w.actors[1];const br=w.brains.get(1);b.x=14.5;b.y=8.5;b.vx=b.vy=0;
  br.state='investigate';br.lastKnown={x:21.5,y:8.5};br.goal=null;br.path=[];br.timer=0;
  const box=bar.box;let minD=1e9,reached=false,t0=performance.now(),samples=0,crossedThrough=false;
  while(performance.now()-t0<9000){await new Promise(r=>setTimeout(r,50));samples++;
    const cx=Math.max(box.x0,Math.min(b.x,box.x1)),cy=Math.max(box.y0,Math.min(b.y,box.y1));minD=Math.min(minD,Math.hypot(b.x-cx,b.y-cy));
    if(Math.hypot(b.x-21.5,b.y-8.5)<1.2){reached=true;break}
    if(!w.barriers.length)break;}
  return {box,minDist:+minD.toFixed(3),reached,slabStillUp:w.barriers.length>0,ms:Math.round(performance.now()-t0),bot:[+b.x.toFixed(2),+b.y.toFixed(2)],state:br.state}})()`);
check('AI-001 headless: bot routes around a live slab to a target behind it, never overlapping it', s2 && !s2.err && s2.minDist >= 0.33 && s2.reached && s2.slabStillUp, { setup: slab, ...s2 });

// 3. HUD-002: a pickup under the vitals panel: its label must not overlap any HUD panel.
await view(844, 390, true); await open(); await play();
const lab = await ev(`(async()=>{const w=__chog.world,p=w.actors[0];p.hp=1e9;for(const b of w.actors.slice(1)){b.x=b.y=-40}
  const r=__chog.renderer; const vit=document.getElementById('vitals').getBoundingClientRect();
  // Park the player (held each frame, ignoring collision) so a pickup sits inside the vitals panel at (100, 60).
  let res=null;
  for(const pk of w.pickups){
    // Explore the pickup's tile first (labels only show on explored tiles), then park.
    for(let i=0;i<20;i++){p.x=pk.x+0.9;p.y=pk.y;await new Promise(q=>setTimeout(q,40));}
    let px=pk.x, py=pk.y;
    for(let i=0;i<50;i++){const s=r.toScreen(pk.x,pk.y);px+=(s.x-100)/45;py+=(s.y-60)/45;p.x=px;p.y=py;p.vx=p.vy=0;await new Promise(q=>setTimeout(q,40));}
    for(let i=0;i<20;i++){p.x=px;p.y=py;await new Promise(q=>setTimeout(q,40));}
    const s=r.toScreen(pk.x,pk.y);
    if(s.x>vit.left+20&&s.x<vit.right-20&&s.y>vit.top+10&&s.y<vit.bottom-30){res={pk,s};break}
  }
  if(!res) return {precondition:false};
  const texts=[];const walk=c=>{if(c.text!==undefined&&/HEALTH|ARMOUR|AMMO/.test(c.text)&&c.visible)texts.push(c);for(const k of c.children||[])walk(k)};walk(r.app.stage);
  const ids=['vitals','foes','sys','weapon','ability','reload'];const rects=ids.map(i=>document.getElementById(i)).filter(e=>e&&e.offsetParent!==null).map(e=>e.getBoundingClientRect());
  const over=[];for(const t of texts){const b=t.getBounds();for(const h of rects){if(b.x<h.right&&b.x+b.width>h.left&&b.y<h.bottom&&b.y+b.height>h.top)over.push({text:t.text,b:[Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)],hud:[h.left,h.top,h.width,h.height]})}}
  return {precondition:true,pickup:res.pk.kind,pickupScreen:[Math.round(res.s.x),Math.round(res.s.y)],vitals:[vit.left,vit.top,vit.width,vit.height],visibleLabels:texts.length,overlaps:over}})()`);
check('HUD-002: no visible pickup label overlaps a HUD panel (pickup parked inside the vitals panel)', lab && lab.precondition && lab.overlaps.length === 0, lab);
await cmd('Page.captureScreenshot', { format: 'png' }).then((s) => fs.writeFileSync(outFile.replace(/\.json$/, '-hud002.png'), Buffer.from(s.data, 'base64')));

// 4. Tutorial pill: visible on the first run, gone after ~6 s; ring hint once, persisted across reload.
// Setup (RC-2, ADE rc1-code-check.md section 5): step 3 left 844x390 touch emulation on, so input.ts ran in touch mode and
// rewrote the aim to 0 (east) every tick, overriding p.facing=PI and putting the bot in the cone (seen, so no ring).
// Reset to a desktop pointer and aim west with a real mouse move, so the player faces away from the bot.
// RC-3: view(..., false) alone left (pointer: coarse) true, so the game still booted in touch mode and pinned the aim
// east (the bot then sat near the cone edge: pass or fail by timing). A fresh tab really is desktop; the precondition
// below proves it (desktop input mode, player facing west when the ring setup starts). Assertion unchanged.
await freshTab(); await view(1280, 720, false); await open(); await play();
const faceWest = () => cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 360 });
await faceWest();
const pill1 = await ev(`getComputedStyle(document.getElementById('hint')).opacity`);
await sleep(7500);
const pill2 = await ev(`getComputedStyle(document.getElementById('hint')).opacity`);
const ringPre = await ev(`({coarse:matchMedia('(pointer: coarse)').matches,touchMode:document.body.classList.contains('touch'),facing:+__chog.world.actors[0].facing.toFixed(2)})`);
const ringSet = await ev(`(async()=>{const w=__chog.world,p=w.actors[0];p.hp=1e9;p.x=8.5;p.y=2.5;p.facing=Math.PI;
  for(const o of w.actors.slice(2)){o.x=o.y=-40} const b=w.actors[1];b.x=11.5;b.y=4.5; const br=w.brains.get(1); br.state='investigate'; br.lastKnown={x:11.5,y:1.5};br.goal=null;br.timer=0;
  const t0=w.tick; for(let i=0;i<300&&w.tick-t0<600&&localStorage.getItem('chog.hint.rings')!=='1';i++)await new Promise(r=>setTimeout(r,100));
  return {persisted:localStorage.getItem('chog.hint.rings'),hint:document.getElementById('hint').textContent.slice(0,40),opacity:getComputedStyle(document.getElementById('hint')).opacity}})()`);
await open('&nooverlay', false); await play(); await faceWest(); await sleep(7500);
const ring2 = await ev(`(async()=>{const w=__chog.world,p=w.actors[0];p.hp=1e9;p.x=8.5;p.y=2.5;p.facing=Math.PI;for(const o of w.actors.slice(2)){o.x=o.y=-40} const b=w.actors[1];b.x=11.5;b.y=4.5;const br=w.brains.get(1); br.state='investigate'; br.lastKnown={x:11.5,y:1.5};br.goal=null;br.timer=0;
  const t1=w.tick; for(let i=0;i<300&&w.tick-t1<240;i++)await new Promise(r=>setTimeout(r,100));return {text:document.getElementById('hint').textContent.slice(0,40),opacity:getComputedStyle(document.getElementById('hint')).opacity}})()`);
check('Tutorial pill shows on the first run, fades by ~6 s; second run no tutorial', +pill1 > 0.9 && +pill2 < 0.1, { atStart: pill1, after7_5s: pill2 });
check('Ring hint setup precondition: desktop pointer, PC input mode, player facing west (away from the bot)', !ringPre.coarse && !ringPre.touchMode && Math.abs(Math.abs(ringPre.facing) - Math.PI) < 0.3, ringPre);
check('Ring hint shows once on the first heard ring, persisted; not shown again after reload', ringSet.persisted === '1' && /Gold rings/.test(ringSet.hint) && !(+ring2.opacity > 0.5 && /Gold rings/.test(ring2.text)), { first: ringSet, afterReload: ring2 });

// 5. HUD layout at 844x390 and 667x375 (with the tutorial pill visible): no panel overlaps, all inside the viewport.
for (const [W, H] of [[844, 390], [667, 375]]) {
  await view(W, H, true); await open(); await play();
  const lay = await ev(`(()=>{const ids=['vitals','foes','sys','weapon','ability','reload','hint'];const r=ids.map(i=>[i,document.getElementById(i)]).filter(([i,e])=>e&&e.offsetParent!==null&&(i!=='hint'||+getComputedStyle(e).opacity>0.5)).map(([i,e])=>[i,e.getBoundingClientRect()]);
    const ov=[];for(let a=0;a<r.length;a++)for(let b=a+1;b<r.length;b++){const A=r[a][1],B=r[b][1];if(A.left<B.right&&A.right>B.left&&A.top<B.bottom&&A.bottom>B.top)ov.push(r[a][0]+'/'+r[b][0])}
    const out=r.filter(([i,e])=>e.left<0||e.top<0||e.right>innerWidth||e.bottom>innerHeight).map(([i])=>i);return {panels:r.map(([i])=>i),overlaps:ov,outside:out}})()`);
  check(`HUD ${W}x${H}: no overlapping panels (incl. tutorial pill), all inside the viewport`, lay.overlaps.length === 0 && lay.outside.length === 0, lay);
  await cmd('Page.captureScreenshot', { format: 'png' }).then((s) => fs.writeFileSync(outFile.replace(/\.json$/, `-hud-${W}.png`), Buffer.from(s.data, 'base64')));
}

// 6. Simultaneous touches at 844x390: move (left) + aim/fire (right) + tap ability, then release all.
await view(844, 390, true); await open(); await play();
const ab = await ev(`(()=>{const r=document.getElementById('ability').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
const st0 = await ev(`(()=>{const p=__chog.world.actors[0];p.hp=1e9;for(const b of __chog.world.actors.slice(1)){b.x=b.y=-40}return {x:p.x,y:p.y,f:p.facing,cd:p.abilityCd,shots:p.shots}})()`);
const T = (type, pts) => cmd('Input.dispatchTouchEvent', { type, touchPoints: pts });
await T('touchStart', [{ x: 150, y: 280, id: 1 }]); await sleep(60);
await T('touchMove', [{ x: 150, y: 330, id: 1 }]); await sleep(60);
await T('touchStart', [{ x: 150, y: 330, id: 1 }, { x: 650, y: 200, id: 2 }]); await sleep(60);
await T('touchMove', [{ x: 150, y: 330, id: 1 }, { x: 590, y: 140, id: 2 }]); await sleep(300);
await T('touchStart', [{ x: 150, y: 330, id: 1 }, { x: 590, y: 140, id: 2 }, { x: ab[0], y: ab[1], id: 3 }]); await sleep(120);
// Lift only the ability finger: CDP releases a point by omitting it from a touchMove (touchEnd must carry no points).
await T('touchMove', [{ x: 150, y: 330, id: 1 }, { x: 590, y: 140, id: 2 }]); await sleep(900);
const st1 = await ev(`(()=>{const p=__chog.world.actors[0];return {x:p.x,y:p.y,f:p.facing,cd:p.abilityCd,shots:p.shots}})()`);
await T('touchEnd', []); await sleep(600);
const st2 = await ev(`(()=>{const p=__chog.world.actors[0];return {x:p.x,y:p.y,vx:p.vx,vy:p.vy,shots:p.shots}})()`);
await sleep(500);
const st3 = await ev(`(()=>{const p=__chog.world.actors[0];return {x:p.x,y:p.y,shots:p.shots}})()`);
const moved = Math.hypot(st1.x - st0.x, st1.y - st0.y);
check('3 simultaneous touches: moves, aims, fires and uses the ability; nothing sticks after release', moved > 0.5 && st1.cd > 0 && st1.shots > st0.shots && Math.hypot(st3.x - st2.x, st3.y - st2.y) < 0.05 && st3.shots === st2.shots, { moved: +moved.toFixed(2), facing: [st0.f, st1.f], abilityCd: st1.cd, shots: [st0.shots, st1.shots, st2.shots, st3.shots], driftAfterRelease: +Math.hypot(st3.x - st2.x, st3.y - st2.y).toFixed(3) });

// 7. Rotation: landscape -> portrait shows the rotate prompt and pauses; back to landscape, resume works.
const rot0 = await ev(`__chog.phase`);
await view(390, 844, true); await sleep(800);
const rot1 = await ev(`({phase:__chog.phase,rotate:getComputedStyle(document.getElementById('rotate')).display})`);
await view(844, 390, true); await sleep(800);
const rot2 = await ev(`({phase:__chog.phase,rotate:getComputedStyle(document.getElementById('rotate')).display,canvas:(()=>{const c=document.querySelector('canvas');return [c.clientWidth,c.clientHeight]})()})`);
await ev(`__chog.go('resume')`); await sleep(400);
const rot3 = await ev(`__chog.phase`);
check('Rotation: portrait shows the rotate prompt (game paused); landscape again resizes the canvas and resumes', rot1.rotate !== 'none' && rot1.phase !== 'play' && rot2.rotate === 'none' && rot2.canvas[0] === 844 && rot3 === 'play', { before: rot0, portrait: rot1, landscape: rot2, afterResume: rot3 });

// 8. Background/resume: hidden tab pauses with no sim steps; resume does not burst-step.
const bg = await ev(`(async()=>{const w=__chog.world,p=w.actors[0];p.hp=1e9;
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
  const t0=w.tick;await new Promise(r=>setTimeout(r,2000));const t1=w.tick;const ph=__chog.phase;
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));
  __chog.go('resume');const t2=w.tick;await new Promise(r=>setTimeout(r,100));const t3=w.tick;
  return {phaseHidden:ph,ticksWhileHidden:t1-t0,ticksIn100msAfterResume:t3-t2}})()`);
check('Background: hidden pauses (0 sim steps), resume steps normally (no burst: <= 12 steps in 100 ms)', bg.phaseHidden === 'pause' && bg.ticksWhileHidden === 0 && bg.ticksIn100msAfterResume <= 12, bg);

check('Console errors: none', errors.length === 0, errors.slice(0, 5));
fs.writeFileSync(outFile, JSON.stringify({ base, results, errors }, null, 1));
chrome.kill(); process.exit(0);
