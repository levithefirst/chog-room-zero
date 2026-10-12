// Scripted browser run over Chrome DevTools Protocol (Node 22 global WebSocket, no deps).
// Usage: npm run dev (or preview with ?debug), then: node tools/browser-run.mjs "http://localhost:5173/" <outdir>
// Needs google-chrome on PATH. Uses the dev-only window.__chog hook. Screenshots land in <outdir>/p2-*.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [url, outDir] = process.argv.slice(2);
const only = process.argv[4] ?? 'all';
fs.mkdirSync(outDir, { recursive: true });
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=9335', '--window-size=1280,720', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tgt;
for (let i = 0; i < 50 && !tgt; i++) { await sleep(200); try { tgt = (await (await fetch('http://127.0.0.1:9335/json')).json()).find((t) => t.type === 'page'); } catch {} }
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
const shot = async (name) => { const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${outDir}/p2-${name}.png`, Buffer.from(r.data, 'base64')); console.log('shot', name, 'errs', errors.length); };
const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result?.value; };
const key = async (type, code, k) => cmd('Input.dispatchKeyEvent', { type, code, key: k ?? code.replace('Key', '').toLowerCase(), windowsVirtualKeyCode: code === 'Escape' ? 27 : code === 'Space' ? 32 : code.replace('Key', '').charCodeAt(0) });
const mouse = (type, x, y, button = 'none') => cmd('Input.dispatchMouseEvent', { type, x, y, button, clickCount: button === 'none' ? 0 : 1 });
const center = (sel) => ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
const click = async (sel) => { const [x, y] = await center(sel); await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, 'left'); await mouse('mouseReleased', x, y, 'left'); };
const tap = async (sel) => { const [x, y] = await center(sel); await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 9 }] }); await sleep(40); await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
const waitPhase = async (p, ms = 4000) => { for (let t = 0; t < ms; t += 100) { if ((await ev('__chog.phase')) === p) return true; await sleep(100); } throw new Error('phase never became ' + p + ', is ' + (await ev('__chog.phase'))); };
const log = (...a) => console.log(...a);
// Put the player somewhere, facing somewhere (mouse sets aim on PC), with bots parked out of the way unless placed.
const stage = (js) => ev(`(async()=>{const w=__chog.world;const p=w.actors[0];const bots=w.actors.slice(1);const park=(b,x,y,f=Math.PI)=>{b.x=x;b.y=y;b.vx=b.vy=0;b.facing=f;};${js}})()`);
const PARK = `park(bots[0],41.5,1.5);park(bots[1],42.5,1.5);park(bots[2],41.5,24.5);park(bots[3],42.5,24.5);park(bots[4],40.5,24.5);for(const b of bots){b.abilityCd=999;w.brains.get(b.id).reactT=-99;}`;
// Freeze bots in place each frame (for staged shots) without touching the sim code.
const pin = (on) => ev(`(()=>{clearInterval(window.__pin);if(${on}){const w=__chog.world;const snap=w.actors.slice(1).map(b=>[b.x,b.y,b.facing]);window.__pin=setInterval(()=>{w.actors.slice(1).forEach((b,i)=>{if(!w.__free?.includes(b.id)){b.x=snap[i][0];b.y=snap[i][1];b.vx=b.vy=0;b.facing=snap[i][2];}})},5)}})()`);

await cmd('Runtime.enable'); await cmd('Log.enable'); await cmd('Page.enable');

async function desktop() {
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url }); await sleep(3500);
  await shot('title');
  await click('[data-go="start"]'); await waitPhase('select'); await sleep(400);
  await click('[data-hero="kettle"]'); await sleep(300);
  await shot('hero-select');
  await click('[data-go="pick"]'); await sleep(250);
  await shot('loading');
  await waitPhase('play');
  // Explore a little so remembered areas exist, then frame the concourse.
  await stage(PARK + `p.x=6.5;p.y=8.5;`);
  for (const [x, y, mx, my] of [[6.5, 8.5, 1200, 360], [14.5, 10.5, 1200, 500], [14.5, 4.5, 640, 100], [20.5, 10.5, 1200, 360], [27.5, 10.5, 640, 700]]) {
    await stage(`p.x=${x};p.y=${y};p.vx=p.vy=0;`); await mouse('mouseMoved', mx, my); await sleep(350);
  }
  await stage(`p.x=13.5;p.y=8.5;p.vx=p.vy=0;`); await mouse('mouseMoved', 1150, 360); await sleep(700);
  await shot('gameplay');
  // Vision vs out-of-vision: a bot inside the light, a bot behind a wall (hidden), remembered rooms dim.
  await stage(PARK + `park(bots[1],19.5,8.5);park(bots[0],15.5,5.5,Math.PI/2);p.x=13.5;p.y=8.5;`);
  await pin(true); await mouse('mouseMoved', 1150, 360); await sleep(500);
  log('vision: visible bots =', await ev('__chog.renderer.visibleBots()'), '(want 1: the one at 19.5,8.5; the one behind the north wall stays hidden)');
  await shot('vision');
  await pin(false);

  // Each weapon firing at a pinned target.
  for (const hero of ['kettle', 'brick', 'wick', 'mop']) {
    await ev(`__chog.setHero('${hero}')`); await ev(`__chog.go('pause')`); await ev(`__chog.go('restart')`); await waitPhase('play');
    const tx = hero === 'brick' ? 17.5 : hero === 'wick' ? 24.5 : 20.5;
    await stage(PARK + `park(bots[1],${tx},8.5);bots[1].hp=bots[1].maxHp=1e5;p.x=13.5;p.y=8.5;p.hp=1e5;`);
    // Let the camera settle after the teleport, otherwise the mouse-derived aim angle is off.
    await pin(true); await mouse('mouseMoved', 1150, 360); await sleep(1200); await mouse('mouseMoved', 1150, 362); await sleep(150);
    await mouse('mousePressed', 1150, 362, 'left'); await sleep(hero === 'mop' ? 260 : hero === 'kettle' ? 280 : 90);
    await shot(`weapon-${hero === 'kettle' ? 'rifle' : hero === 'brick' ? 'shotgun' : hero === 'wick' ? 'marksman' : 'smg'}`);
    await sleep(500); await mouse('mouseReleased', 1150, 360, 'left');
    log(hero, await ev(`(()=>{const p=__chog.world.actors[0];return {weapon:p.weapon.name,shots:p.shots,hits:p.hits,ammo:p.ammo,reserve:p.reserve}})()`));
    if (hero === 'wick') {
      // Ability: sonar ping reveals bots through walls.
      await pin(false);
      await stage(`park(bots[1],15.5,5.5);park(bots[0],12.5,14.5);p.x=13.5;p.y=8.5;`); await pin(true); await sleep(150);
      await key('keyDown', 'Space', ' '); await sleep(60); await key('keyUp', 'Space', ' '); await sleep(250);
      await shot('ability-ping');
    }
    if (hero === 'brick') {
      await stage(`p.x=13.5;p.y=10.5;`); await mouse('mouseMoved', 1150, 360); await sleep(200);
      await key('keyDown', 'Space', ' '); await sleep(60); await key('keyUp', 'Space', ' '); await sleep(300);
      await shot('ability-slab');
    }
    await pin(false);
  }

  // Pickups: health / armour / ammo at the concourse's east end.
  await ev(`__chog.setHero('kettle')`); await ev(`__chog.go('pause')`); await ev(`__chog.go('restart')`); await waitPhase('play');
  await stage(PARK + `p.x=31.5;p.y=10.5;`); await mouse('mouseMoved', 1100, 450); await sleep(300);
  await stage(`p.x=23.5;p.y=10.5;`); await mouse('mouseMoved', 1050, 380); await sleep(500);
  await shot('pickups');
  const pk = await stage(`p.hp=40;p.x=27.5;p.y=12.5;await new Promise(r=>setTimeout(r,200));return {hp:p.hp, pickup: w.pickups.find(k=>k.x===27.5&&k.y===12.5).active}`);
  log('pickup health:', JSON.stringify(pk));

  // Damage feedback: a bot shoots the player from off to the side.
  await stage(PARK + `p.x=13.5;p.y=10.5;p.hp=100;p.armor=0;park(bots[1],13.5,15.5,-Math.PI/2);w.brains.get(bots[1].id).state='patrol';`);
  await mouse('mouseMoved', 1150, 380);
  await stage(`park(bots[1],18.5,10.5,Math.PI);`);
  await pin(true);
  for (let i = 0; i < 40; i++) { const hp = await ev('__chog.world.actors[0].hp'); if (hp < 35) break; await sleep(100); }
  await stage(`p.hp=Math.max(p.hp,20);`); await sleep(120);
  await shot('damage-feedback');
  await pin(false);

  // Pause.
  await key('keyDown', 'Escape', 'Escape'); await key('keyUp', 'Escape', 'Escape'); await sleep(450);
  log('pause phase:', await ev('__chog.phase'), 'tick frozen:', await ev(`(async()=>{const a=__chog.world.tick;await new Promise(r=>setTimeout(r,300));return a===__chog.world.tick})()`));
  await shot('pause');
  await click('[data-go="resume"]'); await waitPhase('play');

  // Death recap.
  await stage(`p.hp=8;p.armor=0;park(bots[1],18.5,10.5,Math.PI);w.brains.get(bots[1].id).reactT=-99;`);
  await pin(true);
  await waitPhase('recap', 8000); await sleep(500);
  await shot('death-recap');
  await pin(false);
  await waitPhase('results', 4000); await sleep(400);
  await shot('results-dead');

  // Victory: all but one bot down, the last one in the light.
  await click('[data-go="restart"]'); await waitPhase('play');
  await stage(PARK + `for(const b of bots.slice(0,4)){b.alive=false;b.hp=0;b.deadFor=9;}park(bots[4],18.5,8.5);bots[4].hp=1;bots[4].armor=0;p.x=13.5;p.y=8.5;`);
  await pin(true); await mouse('mouseMoved', 1150, 360); await mouse('mousePressed', 1150, 360, 'left');
  await waitPhase('results', 5000); await mouse('mouseReleased', 1150, 360, 'left'); await sleep(500);
  await pin(false);
  await shot('victory');

  // FPS with many actors and bullets (headless software GL; not representative of a phone GPU).
  await click('[data-go="restart"]'); await waitPhase('play');
  const fps = await ev(`(async()=>{const w=__chog.world;const p=w.actors[0];p.hp=1e9;
    const base=w.actors.slice(1);let n=w.actors.length;
    for(let k=0;k<3;k++)for(const b of base){const c={...b,id:n,x:b.x+(k+1)*0.4,lastHitFrom:null};w.actors.push(c);w.brains.set(n,{...w.brains.get(b.id),path:[],goal:null,lastKnown:null});n++;}
    await new Promise(r=>setTimeout(r,1500));const idle=__chog.fps;
    let peak=0;for(let i=0;i<30;i++){for(let j=0;j<30;j++){const a=Math.random()*6.283;w.bullets.push({x:p.x,y:p.y,dx:Math.cos(a),dy:Math.sin(a),ox:p.x,oy:p.y,life:0.9,owner:0,weapon:p.weapon,alive:true})}peak=Math.max(peak,w.bullets.length);await new Promise(r=>setTimeout(r,50))}
    return {actors:w.actors.length, idleFps:idle.toFixed(1), stressFps:__chog.fps.toFixed(1), peakBullets:peak}})()`);
  log('fps:', JSON.stringify(fps));
}

async function phone() {
  await cmd('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } });
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cmd('Page.navigate', { url }); await sleep(3500);
  await shot('phone-title');
  await tap('[data-go="start"]'); await waitPhase('select'); await sleep(400);
  await shot('phone-hero-select');
  await tap('[data-hero="mop"]'); await sleep(150); await tap('[data-hero="mop"]');
  await waitPhase('play'); await sleep(300);
  await stage(PARK + `p.x=13.5;p.y=10.5;park(bots[1],20.5,10.5);bots[1].hp=1e5;`);
  await pin(true);
  // Left stick: move; right stick: aim and fire (past the ring).
  await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 290, id: 1 }, { x: 600, y: 250, id: 2 }] });
  for (let i = 0; i < 8; i++) { await cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 + i * 4, y: 290 - i, id: 1 }, { x: 600 + i * 9, y: 250, id: 2 }] }); await sleep(40); }
  await sleep(250);
  await shot('phone-gameplay');
  await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await tap('#ability'); await sleep(200);
  await shot('phone-ability');
  log('phone:', JSON.stringify(await ev(`(()=>{const p=__chog.world.actors[0];return {shots:p.shots,abilityCd:p.abilityCd.toFixed(2),touch:document.body.classList.contains('touch')}})()`)));
  await tap('#pause'); await sleep(400);
  await shot('phone-pause');
  await pin(false);
  await ev(`(()=>{const o=console.warn;window.__st=[];console.warn=(...a)=>{window.__st.push(new Error().stack);o(...a)}})()`);
  await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
  await sleep(500);
  await shot('phone-portrait');
  if (process.env.STACK) log('warn stacks:', await ev('JSON.stringify(window.__st)'));
}

try {
  if (only === 'all' || only === 'desktop') await desktop();
  if (only === 'all' || only === 'phone') await phone();
} catch (e) {
  console.log('RUN FAILED:', e.message);
}
log('console errors/warnings:', errors.length ? errors : 'none');
ws.close(); chrome.kill();
process.exit(0);
