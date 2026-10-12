// RC-2 headless checks against a deployed preview (or any build served with ?debug):
//  A. Door-stall sweep: the tests/rc-snag.test.ts sweep, run inside the page on the *bundled* sim (__chog.lab), 4 heroes x every door.
//  B. Blocked-shot flash in the live game: real mouse fire into a crate -> cover outline flash (fx.coverFlashes), spark, and a
//     'blocked' sound cue (__chog.stats.blockedCues). Screenshot saved next to the JSON.
//  C. Wick vs Brick: (1) on the bundled sim, Brick player vs one Wick bot over 12 seeds, with no damage from beyond Brick's sight range;
//     (2) in the live game as Brick (autopilot), every hit taken comes from within sight range and the shooter is revealed (fx.threats > 0).
// Usage: node tools/rc2-preview-checks.mjs <baseUrl> <outJson>
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [base, outFile] = process.argv.slice(2);
const port = 9650 + Math.floor(Math.random() * 50);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let t;
for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const P = new Map(); const errors = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m.result ?? m.error); P.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description); return r.result?.value; };
const mouse = (type, x, y, extra = {}) => cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
const click = async (sel) => { const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const b=e.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()`);
  await mouse('mouseMoved', r[0], r[1]); await mouse('mousePressed', r[0], r[1], { buttons: 1, clickCount: 1 }); await mouse('mouseReleased', r[0], r[1], { clickCount: 1 }); };
const waitPhase = async (want, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (want.includes(await ev('__chog.phase'))) return true; await sleep(200); } return false; };
await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const out = { base };
await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(3000);
await ev(`localStorage.setItem('chog.onboarded','1')`);

// A. door sweep on the bundled sim
out.doorSweep = await ev(`(()=>{const {createWorld,stepWorld,IDLE_INPUT,ROOM_ZERO,HEROES}=__chog.lab;const doors=[];
ROOM_ZERO.forEach((r,y)=>[...r].forEach((c,x)=>{if(c!=='d')return;doors.push({x,y,vertical:ROOM_ZERO[y-1][x]!=='#'&&ROOM_ZERO[y+1][x]!=='#'})}));
const res={doors:doors.length,heroes:{}};
for(const h of HEROES){let maxStall=0,trials=0,over=[];
for(const d of doors)for(const dir of [1,-1])for(const off of [-0.4,-0.25,-0.1,0,0.1,0.25,0.4])for(const lean of [null,0,0.2,-0.2]){
const w=createWorld({hero:h.id,bots:[],seed:1});const p=w.actors[0];const cx=d.x+.5,cy=d.y+.5;
if(d.vertical){p.x=cx+off;p.y=cy-2*dir}else{p.x=cx-2*dir;p.y=cy+off}
let mx=d.vertical?0:dir,my=d.vertical?dir:0;if(lean!==null){const a=Math.atan2(cy-p.y,cx-p.x)+lean;mx=Math.cos(a);my=Math.sin(a)}
const n=Math.hypot(mx,my);let stall=0,lx=p.x,ly=p.y,worst=0,passed=false;
for(let i=0;i<240;i++){stepWorld(w,{...IDLE_INPUT,moveX:mx/n,moveY:my/n,aim:Math.atan2(my,mx)});
if(((d.vertical?p.y:p.x)-(d.vertical?cy:cx))*dir>1){passed=true;break}
if(Math.hypot(p.x-lx,p.y-ly)<0.002)stall+=1/60;else stall=0;worst=Math.max(worst,stall);lx=p.x;ly=p.y}
trials++;if(worst>0.3||!passed)over.push({door:d.x+','+d.y,dir,off,lean,stall:+worst.toFixed(2),passed});maxStall=Math.max(maxStall,worst)}
res.heroes[h.id]={trials,maxStall:+maxStall.toFixed(3),failures:over.slice(0,8),failureCount:over.length}}
res.pass=Object.values(res.heroes).every(h=>h.failureCount===0);return res})()`);
console.log('A door sweep', JSON.stringify(out.doorSweep));

// C1. Wick vs Brick on the bundled sim
out.wickBrickSim = await ev(`(()=>{const {createWorld,stepWorld,IDLE_INPUT}=__chog.lab;const rows=[];
for(let seed=1;seed<=12;seed++){const w=createWorld({hero:'brick',bots:['wick'],seed});const p=w.actors[0],b=w.actors[1];
// Brick holds a spot in the open; Wick starts 11 u away (beyond Brick's 7.5 sight, inside Wick's own range) and is free to move.
p.x=13.5;p.y=8.5;b.x=p.x+11;b.y=p.y;const R=p.view.range;let beyond=0,hits=0,lastTick=-1,revealedOnHit=0;
for(let i=0;i<60*30&&p.alive;i++){stepWorld(w,{...IDLE_INPUT,aim:Math.PI});
if(p.lastHitTick===w.tick&&p.lastHitTick!==lastTick){lastTick=p.lastHitTick;hits++;const d=Math.hypot(p.lastHitFrom.x-p.x,p.lastHitFrom.y-p.y);if(d>R+0.35)beyond++;
if(w.hits.some(h=>h.target===0&&h.by===b.id))revealedOnHit++}}
rows.push({seed,hits,beyond,revealedOnHit,playerAlive:p.alive})}
return {range:createWorld({hero:'brick',bots:[],seed:1}).actors[0].view.range,rows,pass:rows.every(r=>r.beyond===0)}})()`);
console.log('C1 wick-brick sim', JSON.stringify(out.wickBrickSim));

// B. blocked-shot flash, live game, real mouse fire
await cmd('Page.navigate', { url: `${base}/?debug&nooverlay&hero=kettle` }); await sleep(3000);
await click('[data-go="start"]'); await sleep(400); await click('[data-go="pick"]'); await waitPhase(['play'], 10000); await sleep(1200);
const setup = await ev(`(()=>{const w=__chog.world,p=w.actors[0];const box=w.level.coverBoxes[0];
// Positioning only: stand 2 u west of the first crate, bots parked far away so nothing interferes (none removed).
const cy=(box.y0+box.y1)/2;p.x=box.x0-2;p.y=cy;for(const b of w.actors.slice(1)){b.x=1.5;b.y=1.5}
const s=__chog.renderer.toScreen(box.x0+0.3,cy);return {box,screen:s,before:__chog.stats.blockedCues}})()`);
await mouse('mouseMoved', setup.screen.x, setup.screen.y);
await sleep(300);
await mouse('mousePressed', setup.screen.x, setup.screen.y, { buttons: 1, clickCount: 1 });
let seen = { flash: false, spark: false };
for (let i = 0; i < 30; i++) { await sleep(50); const s = await ev(`({f:__chog.fx.coverFlashes.length,sp:__chog.fx.sparks.filter(s=>s.age<1).length,imp:__chog.fx.impacts.filter(i=>i.blocked).length})`);
  if (s.f > 0) seen.flash = true; if (s.sp > 0 || s.imp > 0) seen.spark = true;
  if (seen.flash && i > 4 && !seen.shot) { seen.shot = true; const shot = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(outFile.replace(/\.json$/, '-blocked.png'), Buffer.from(shot.data, 'base64')); } }
await mouse('mouseReleased', setup.screen.x, setup.screen.y, { clickCount: 1 });
const after = await ev(`({cues:__chog.stats.blockedCues,shots:__chog.world.actors[0].shots})`);
out.blockedFlash = { ...seen, blockedCues: after.cues - setup.before, playerShots: after.shots, pass: seen.flash && seen.spark && after.cues - setup.before > 0 };
console.log('B blocked flash', JSON.stringify(out.blockedFlash));

// C2. live: Brick player under autopilot; audit every hit taken.
await cmd('Page.navigate', { url: `${base}/?debug&nooverlay&autoplay=77&hero=brick` }); await sleep(3000);
await click('[data-go="start"]'); await sleep(400); await click('[data-go="pick"]'); await waitPhase(['play'], 10000);
await ev(`window.__audit={hits:[],last:-1};window.__auditTimer=setInterval(()=>{const w=__chog.world;if(!w)return;const p=w.actors[0];if(p.lastHitTick!==__audit.last&&p.lastHitFrom){__audit.last=p.lastHitTick;
let sh=null,bd=1e9;for(const b of w.actors.slice(1)){const d=Math.hypot(b.x-p.lastHitFrom.x,b.y-p.lastHitFrom.y);if(d<bd){bd=d;sh=b}}
__audit.hits.push({tick:p.lastHitTick,dist:+Math.hypot(p.lastHitFrom.x-p.x,p.lastHitFrom.y-p.y).toFixed(2),range:p.view.range,shooter:sh.hero.id,shooterId:sh.id,revealed:(__chog.fx.threats[sh.id]||0)>0})}},20)`);
await waitPhase(['results', 'recap'], 300000);
out.wickBrickLive = await ev(`(()=>{clearInterval(__auditTimer);const h=__audit.hits;return {hits:h.length,wickHits:h.filter(x=>x.shooter==='wick').length,
beyond:h.filter(x=>x.dist>x.range+0.35),notRevealed:h.filter(x=>!x.revealed),maxDist:Math.max(0,...h.map(x=>x.dist)),range:h[0]?.range,outcome:__chog.world.outcome}})()`);
out.wickBrickLive.pass = out.wickBrickLive.beyond.length === 0 && out.wickBrickLive.notRevealed.length === 0;
console.log('C2 wick-brick live', JSON.stringify(out.wickBrickLive));
out.consoleErrors = errors;
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
chrome.kill(); process.exit(0);
