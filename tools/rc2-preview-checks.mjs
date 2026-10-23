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
const chrome = spawn(process.env.CHROME_BIN ?? 'google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
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

const ONLY = process.env.ONLY || 'A,C1,B,C2'; const on = (k) => ONLY.split(',').includes(k);
// A. door sweep on the bundled sim
if (on('A')) out.doorSweep = await ev(`(()=>{const {createWorld,stepWorld,IDLE_INPUT,ROOM_ZERO,HEROES}=__chog.lab;const doors=[];
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
if (on('C1')) out.wickBrickSim = await ev(`(()=>{const {createWorld,stepWorld,IDLE_INPUT}=__chog.lab;const rows=[];
// Same open hall as tests/rc-fairness.test.ts: Brick (7.5 u sight) vs one Wick bot spawned 8-13 u away (inside Wick's own reach).
const HALL=['##############################','#............................#','#............................#','#............................#','#P...........................#','#............................#','#............................#','#............................#','##############################'];
const modes=['still','backpedal','strafe'];
for(let seed=1;seed<=12;seed++){const dist=8+(seed%6),mode=modes[seed%3];
const w=createWorld({map:HALL,hero:'brick',seed,bots:[{name:'W',hero:'wick',patrol:[[Math.floor(1.5+dist),4]],flanker:false}]});
const p=w.actors[0],b=w.actors[1];const R=p.view.range;let beyond=0,hits=0,hitEvents=0,maxDist=0;
for(let i=0;i<60*14&&p.alive;i++){const t=i/60;stepWorld(w,{...IDLE_INPUT,aim:0,moveX:mode==='backpedal'?-0.5:0,moveY:mode==='strafe'?Math.sin(t*2):0});
for(const h of w.hits)if(h.target===0){hits++;const d=Math.hypot(h.fromX-p.x,h.fromY-p.y);maxDist=Math.max(maxDist,d);if(d>R+0.35)beyond++;if(h.by===b.id)hitEvents++}}
rows.push({seed,dist,mode,hits,beyond,maxDist:+maxDist.toFixed(2),hitsAttributedToShooter:hitEvents,playerAlive:p.alive})}
return {range:7.5,rows,totalHits:rows.reduce((a,r)=>a+r.hits,0),pass:rows.every(r=>r.beyond===0&&r.hitsAttributedToShooter===r.hits)}})()`);
console.log('C1 wick-brick sim', JSON.stringify(out.wickBrickSim));

if (on('B')) {
// B. blocked-shot flash, live game, real mouse fire
await cmd('Page.navigate', { url: `${base}/?debug&nooverlay&hero=kettle` }); await sleep(3000);
await click('[data-go="start"]'); await sleep(400); await click('[data-go="pick"]'); await waitPhase(['play'], 10000); await sleep(1200);
const setup = await ev(`(()=>{const w=__chog.world,p=w.actors[0];const box=w.level.coverBoxes[0];
// Positioning only: stand 2 u west of the first crate, bots parked far away so nothing interferes (none removed).
const cy=(box.y0+box.y1)/2;p.x=box.x0-2;p.y=cy;for(const b of w.actors.slice(1)){b.x=1.5;b.y=1.5}
return {box,cy}})()`);
await sleep(800); // let the camera follow the repositioned hero before projecting the crate to the screen
Object.assign(setup, await ev(`({screen:__chog.renderer.toScreen(${setup.box.x0}+0.3,${setup.cy}),before:__chog.stats.blockedCues,ammo:__chog.world.actors[0].ammo,px:__chog.world.actors[0].x})`));
console.log('B setup', JSON.stringify(setup));
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

}
if (on('C2')) {
// C2. live: Brick player under autopilot; audit every hit taken.
await cmd('Page.navigate', { url: `${base}/?debug&nooverlay&autoplay=77&hero=brick` }); await sleep(3000);
await click('[data-go="start"]'); await sleep(400); await click('[data-go="pick"]'); await waitPhase(['play'], 10000);
await ev(`window.__audit={hits:[],last:-1};window.__auditTimer=setInterval(()=>{const w=__chog.world;if(!w)return;const p=w.actors[0];if(__audit.w!==w){__audit.w=w;__audit.last=p.lastHitTick}if(p.lastHitTick!==__audit.last&&p.lastHitFrom){__audit.last=p.lastHitTick;
let sh=null,bd=1e9;for(const b of w.actors.slice(1)){const d=Math.hypot(b.x-p.lastHitFrom.x,b.y-p.lastHitFrom.y);if(d<bd){bd=d;sh=b}}
__audit.hits.push({tick:p.lastHitTick,dist:+Math.hypot(p.lastHitFrom.x-p.x,p.lastHitFrom.y-p.y).toFixed(2),range:p.view.range,shooter:sh.hero.id,shooterId:sh.id,revealed:(__chog.fx.threats[sh.id]||0)>0})}},20)`);
// Keep playing (real "Again" clicks) until Wick itself has landed hits, max 6 matches.
let matches = 0;
for (; matches < 6; matches++) {
  await waitPhase(['results'], 400000);
  if ((await ev(`__audit.hits.filter(x=>x.shooter==='wick').length`)) >= 3) { matches++; break; }
  await sleep(1000); await click('[data-go="restart"]'); await waitPhase(['play'], 15000);
}
out.wickBrickLive = await ev(`(()=>{clearInterval(__auditTimer);const h=__audit.hits;return {hits:h.length,wickHits:h.filter(x=>x.shooter==='wick').length,
beyond:h.filter(x=>x.dist>x.range+0.35),notRevealed:h.filter(x=>!x.revealed),maxDist:Math.max(0,...h.map(x=>x.dist)),wickMaxDist:Math.max(0,...h.filter(x=>x.shooter==='wick').map(x=>x.dist)),range:h[0]?.range}})()`);
out.wickBrickLive.matches = matches;
out.wickBrickLive.pass = out.wickBrickLive.wickHits > 0 && out.wickBrickLive.beyond.length === 0 && out.wickBrickLive.notRevealed.length === 0;
console.log('C2 wick-brick live', JSON.stringify(out.wickBrickLive));
}
out.consoleErrors = errors;
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
chrome.kill(); process.exit(0);
