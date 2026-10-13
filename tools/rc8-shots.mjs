// RC-8 visual and behaviour checks in headless Chrome (swiftshader; emulated viewports and touch, NOT physical
// devices). For each viewport, on the real built game: menu and operator select in the PROVISIONAL CHOG palette,
// a combat frame with a hostile in view, the drawn operator measured against its 0.35 u hitbox from the canvas
// pixels, pickup collection on first contact, each danger-zone phase (HUD words + countdown), outside the zone
// (red edge, chevron, "Outside zone") and a zone death through recap to results.
// Usage: node tools/rc8-shots.mjs <baseUrl> <outJson> [shotDir]   (ONLY=desktop,phone to pick viewports)
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
const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) errors.push('eval: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)); return r.result?.value; };
async function freshTab() {
  const nt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  ws?.close(); await attach(nt); await cmd('Runtime.enable'); errors = [];
}
const view = (w, h, touch) => Promise.all([cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: touch ? 2 : 1, mobile: touch, screenOrientation: { type: h > w ? 'portraitPrimary' : 'landscapePrimary', angle: h > w ? 0 : 90 } }),
  cmd('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 0 })]);
const shot = async (name) => { if (!shotDir) return; const s = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${shotDir}/rc8-${name}.png`, Buffer.from(s.data, 'base64')); };
const phase = () => ev('__chog.phase');
async function waitPhase(want, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await phase()) === want) return true; await sleep(25); } return false; }
const frames = (n = 3) => ev(`new Promise(r=>{let k=${n};const f=()=>--k<=0?r(1):requestAnimationFrame(f);requestAnimationFrame(f)})`);

const VIEWPORTS = [
  { name: 'desktop-1440x900', w: 1440, h: 900, touch: false },
  { name: 'phone-landscape-844x390', w: 844, h: 390, touch: true },
  { name: 'phone-portrait-390x844', w: 390, h: 844, touch: true },
];
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
const rows = [];
// Stage the scene: player at (px,py) facing east, every hostile parked far away except optionally one at (bx,by).
const stageScene = (px, py, bx, by, extra = '') => ev(`(()=>{let _r;const w=__chog.world;const p=w.actors[0];p.x=${px};p.y=${py};p.vx=p.vy=0;p.facing=0;
  w.actors.slice(1).forEach((a,i)=>{a.x=40.5;a.y=23.5-i*1.2;a.vx=a.vy=0;a.ammo=0;a.reserve=0;});${bx !== null ? `const b=w.actors[1];b.x=${bx};b.y=${by};b.facing=Math.PI;` : ''}${extra}})()`);

for (const V of VIEWPORTS.filter((v) => !only.length || only.some((o) => v.name.includes(o)))) {
  const R = { viewport: V.name, input: V.touch ? 'touch (emulated)' : 'mouse', checks: {}, data: {} };
  const ok = (k, pass, data) => { R.checks[k] = { pass: !!pass, ...(data === undefined ? {} : { data }) }; };
  try {
    await freshTab(); await view(V.w, V.h, V.touch);
    await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(2000);
    await ev(`localStorage.clear();localStorage.setItem('chog-room-zero:settings:v1',JSON.stringify({volume:1,vibration:true,quality:'medium',stick:'medium',tips:false}))`);
    await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(3500);
    // Palette: the CSS tokens resolve to the brand values.
    const css = await ev(`(()=>{const s=getComputedStyle(document.documentElement);return ['--chog-purple','--bg-deep','--enemy','--ally','--danger-zone','--chog-pink'].map(v=>s.getPropertyValue(v).trim())})()`);
    ok('CSS tokens resolve to the PROVISIONAL brand values', JSON.stringify(css.map((c) => c.toUpperCase())) === JSON.stringify(['#6B3FA0', '#0E091C', '#DC2626', '#10B981', '#FF2D2D', '#FF6B9D']), css);
    await ev(`document.querySelector('[data-act="howto-close"]')?.click()`); await sleep(400);
    const bg = await ev(`getComputedStyle(document.body).backgroundColor`);
    ok('page background is --bg-deep #0E091C', bg === 'rgb(14, 9, 28)', bg);
    await shot(`${V.name}-1-menu`);
    await ev(`__chog.go('start')`); await sleep(500);
    await shot(`${V.name}-2-select`);
    await ev(`__chog.go('pick')`); ok('match starts', await waitPhase('play')); await sleep(600);

    // Combat frame + hitbox measurement from the canvas pixels around the player.
    await stageScene(14.5, 8.5, 17.5, 8.5);
    await frames(30); // camera settles on the new spot
    if (!V.touch) { const s = await ev(`__chog.renderer.toScreen(17.5,8.5)`); await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.x, y: s.y }); }
    await stageScene(14.5, 8.5, 17.5, 8.5);
    await frames(3);
    const m = await ev(`(()=>{const r=__chog.renderer,app=r.app,w=__chog.world,p=w.actors[0];const c=r.toScreen(p.x,p.y),c1=r.toScreen(p.x+1,p.y);const ppu=c1.x-c.x;
      app.renderer.render(app.stage);const cv=document.createElement('canvas');cv.width=app.canvas.width;cv.height=app.canvas.height;const g=cv.getContext('2d');g.drawImage(app.canvas,0,0);
      const ex={width:cv.width,height:cv.height,pixels:g.getImageData(0,0,cv.width,cv.height).data};const res=app.canvas.width/app.screen.width;const W=ex.width,px=ex.pixels;
      const cx=c.x*res,cy=c.y*res,R=0.35*ppu*res;let maxR=0,n=0,inside=0;const span=Math.ceil(R*1.6);
      for(let y=Math.floor(cy-span);y<=cy+span;y++)for(let x=Math.floor(cx-span);x<=cx+span;x++){if(x<0||y<0||x>=W||y>=ex.height)continue;const i=(y*W+x)*4;
        const near=(R0,G0,B0)=>(px[i]-R0)**2+(px[i+1]-G0)**2+(px[i+2]-B0)**2<=40*40;if(!(near(0x6B,0x3F,0xA0)||near(0x8B,0x5C,0xF6)||near(0x4A,0x2C,0x7A)))continue;const d=Math.hypot(x-cx,y-cy);n++;if(d>maxR)maxR=d;if(d<=R)inside++;}
      return {ppu:+ppu.toFixed(1),hitboxPx:+(R/res).toFixed(1),bodyPixels:n,maxBodyRadiusPx:+(maxR/res).toFixed(1),ratio:+(maxR/R).toFixed(2),insideShare:+(inside/Math.max(1,n)).toFixed(2)}})()`);
    R.data.hitbox = m;
    // Purple body pixels reach the spike tips (1.04-1.16 x radius) and no further than 1.25 x the hitbox radius.
    ok('drawn operator body matches the 0.35 u hitbox (body pixels within 1.25 x radius, most inside it)', m && m.bodyPixels > 20 && m.ratio <= 1.25 && m.ratio >= 0.9 && m.insideShare >= 0.8, m);
    const vis = await ev(`__chog.renderer.visibleBots()`);
    ok('the staged hostile is drawn (in the cone, no wall)', vis >= 1, vis);
    await shot(`${V.name}-3-combat`);

    // Pickup: player 1.5 u west of the health pack with low health -> purple pulse; then at contact distance it is
    // taken on the next step without any press.
    const pk = await ev(`(()=>{const w=__chog.world;const i=w.pickups.findIndex(q=>q.kind==='health'&&q.active);const q=w.pickups[i];return {i,x:q.x,y:q.y}})()`);
    await stageScene(pk.x - 1.5, pk.y, null, null, `p.hp=40;`); await frames(4);
    await shot(`${V.name}-4-pickup-near`);
    // Record the exact tick the pickup turns inactive (a setter on the pickup), staged in the same evaluation.
    const t0 = await stageScene(pk.x - 0.65, pk.y, null, null, `p.hp=40;const q=w.pickups[${pk.i}];let v=q.active;window.__takenAt=-1;
      Object.defineProperty(q,'active',{configurable:true,get(){return v},set(x){if(!x&&v)window.__takenAt=w.tick;v=x;}});return w.tick;`);
    let taken = -1;
    for (let k = 0; k < 60 && taken < 0; k++) { await sleep(16); const s = await ev(`window.__takenAt`); if (s >= 0) taken = s - t0; }
    const toast = await ev(`document.getElementById('toast').textContent`);
    ok('pickup taken within 2 sim steps of body contact, no button, with a "+40 HEALTH" toast', taken >= 0 && taken <= 2 && /\+40 HEALTH/.test(toast), { stepsAfterContact: taken, toast });
    await frames(2); await shot(`${V.name}-5-pickup-taken`);

    // Danger zone phases through the HUD.
    const zcfg = await ev(`(()=>{const z=__chog.world.zone;return {plan:z.plan,cfg:z.cfg}})()`);
    const st = (k) => zcfg.cfg.safeSeconds + zcfg.cfg.stages.slice(0, k).reduce((a, s) => a + s.warn + s.shrink, 0);
    const setT = (sec) => ev(`__chog.world.tick=${Math.round(sec * 60)}`);
    const hud = () => ev(`({phase:document.getElementById('zphase').textContent,time:document.getElementById('ztime').textContent,hot:document.getElementById('zone').classList.contains('hot'),outside:document.getElementById('foes').classList.contains('outside'),edge:+getComputedStyle(document.getElementById('zoneedge')).opacity})`);
    const f = zcfg.plan[zcfg.plan.length - 1];
    await stageScene(f.x, f.y, null, null, `p.hp=p.maxHp;`);
    await setT(10); await frames(3); const h1 = await hud();
    ok('zone HUD while safe: "Zone in" + countdown, not red', h1.phase === 'Zone in' && /^0:3\d$/.test(h1.time) && !h1.hot, h1);
    await setT(st(0) + 2); await frames(3); const h2 = await hud();
    ok('zone HUD warning: "Closes in" + countdown, red ring icon', h2.phase === 'Closes in' && /^0:0\d$/.test(h2.time) && h2.hot, h2);
    await shot(`${V.name}-6-zone-warning`);
    await setT(st(1) + zcfg.cfg.stages[1].warn + 3); await frames(3); const h3 = await hud();
    ok('zone HUD shrinking: "Closing" + countdown', h3.phase === 'Closing' && /^0:\d\d$/.test(h3.time), h3);
    // Outside: the far corner from the final circle.
    const ox = f.x > 22 ? 2.5 : 41.5, oy = f.y > 13 ? 1.5 : 24.5;
    await stageScene(ox, oy, null, null, `p.hp=p.maxHp;`); await frames(6); const h4 = await hud();
    const hp4 = await ev(`__chog.world.actors[0].hp`);
    ok('outside the zone: "Outside zone", red panel and screen edge, health dropping', h4.phase === 'Outside zone' && h4.outside && h4.edge > 0.3 && hp4 < (await ev(`__chog.world.actors[0].maxHp`)), { ...h4, hp: hp4 });
    await shot(`${V.name}-7-zone-outside`);
    await setT(st(zcfg.cfg.stages.length) + 1); await frames(3); const h5 = await hud();
    ok('final zone: "Final zone" or "Outside zone" with no countdown', /Final zone|Outside zone/.test(h5.phase) && h5.time === '', h5);
    // Zone death -> recap -> results naming the zone.
    await ev(`__chog.world.actors[0].hp=1`);
    ok('zone death goes to the recap', await waitPhase('recap', 5000));
    const recap = await ev(`document.getElementById('overlay').textContent`);
    ok('recap names the danger zone, not a shooter', /danger zone/i.test(recap), recap.slice(0, 120));
    await shot(`${V.name}-8-zone-recap`);
    ok('results after the recap', await waitPhase('results', 8000));
    await sleep(500);
    const res = await ev(`document.getElementById('overlay').textContent`);
    ok('results say the zone got you', /danger zone/i.test(res), res.slice(0, 160));
    await shot(`${V.name}-9-results`);
    ok('no page errors', errors.length === 0, errors.slice(0, 5));
  } catch (e) { ok('tool ran', false, String(e)); }
  R.pass = Object.values(R.checks).every((c) => c.pass);
  rows.push(R);
  console.log(V.name, R.pass ? 'PASS' : 'FAIL', Object.entries(R.checks).filter(([, c]) => !c.pass).map(([k, c]) => `${k}: ${JSON.stringify(c.data)}`).join(' | '));
}
fs.writeFileSync(outFile, JSON.stringify(rows, null, 1));
chrome.kill();
process.exit(rows.every((r) => r.pass) ? 0 : 1);
