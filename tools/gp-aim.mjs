// GP stationary 360 fire probe: real CDP mouse and touch input, standing still, aim and fire at 9 angles; reads the
// bullets the sim spawned (headless swiftshader Chrome, emulated devices; NOT device validation).
// Usage: CHROME_BIN=... node tools/gp-aim.mjs <baseUrl>
import { browser, sleep } from './cdp.mjs';
const base = process.argv[2] ?? 'http://localhost:8790';
const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315, 359];
const results = []; const check = (name, pass, data) => { results.push({ name, pass: !!pass }); console.log((pass ? 'PASS ' : 'FAIL ') + name, JSON.stringify(data)); };
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) * 180 / Math.PI;
for (const mode of ['pc', 'touch']) {
  const touch = mode === 'touch';
  const b = await browser('gp-aim-' + mode, { base, w: touch ? 844 : 1280, h: touch ? 390 : 720, mobile: touch, touch });
  await b.go('/?debug&nooverlay'); await sleep(2000);
  await b.ev(`localStorage.setItem('chog.onboarded','1');localStorage.setItem('chog.ringhint','1')`);
  await b.go('/?debug&nooverlay'); 
  await b.hub(); await sleep(400);
  await b.click('[data-mode=solo]'); await b.click('#playbtn');
  await b.until(`__chog.phase === 'play'`, 15000);
  const park = `(()=>{for(const a of __chog.world.actors.slice(1)){a.x=a.y=-40;a.vx=a.vy=0}})()`;
  const ticks = (n) => b.ev(`(async()=>{const w=__chog.world,t0=w.tick;for(let i=0;i<600&&w.tick-t0<${n};i++)await new Promise(r=>setTimeout(r,20));return w.tick-t0})()`);
  await b.ev(park); await ticks(30);
  // Every new bullet's direction, sampled each sim tick (a bullet that hits a wall at once still counts).
  const sample = (n) => b.ev(`(async()=>{const w=__chog.world,t0=w.tick,seen=new Set(),out=[];for(let i=0;i<800&&w.tick-t0<${n};i++){for(const q of w.bullets)if(q.owner===0&&!seen.has(q)){seen.add(q);out.push([w.tick-t0,Math.atan2(q.dy,q.dx)])}await new Promise(r=>setTimeout(r,4))}return out})()`);
  // Touch: a free spot on the right half (no HUD button under it) for the aim thumb.
  const free = touch ? await b.ev(`(()=>{for(let y=120;y<300;y+=10)for(let x=470;x<620;x+=10){const e=document.elementFromPoint(x,y);if(e&&e.tagName==='CANVAS'){let ok=true;for(let a=0;a<6.3;a+=0.4){const f=document.elementFromPoint(x+Math.cos(a)*60,y+Math.sin(a)*60);if(!f||f.tagName!=='CANVAS')ok=false}if(ok)return {x,y}}}return null})()`) : null;
  if (touch && !free) check('touch: a free aim spot exists', false, {});
  const rows = [];
  for (const deg of ANGLES) {
    await b.ev(park);
    const a = deg * Math.PI / 180;
    // Fresh magazine so no reload hides a shot.
    await b.ev(`(()=>{const p=__chog.world.actors[0];p.ammo=p.weapon.magazine;p.reloadLeft=0;p.vx=p.vy=0;__chog.world.bullets.length=0})()`);
    const ps = await b.ev(`(()=>{const p=__chog.world.actors[0];return __chog.renderer.toScreen(p.x,p.y)})()`);
    const s0 = await b.ev(`__chog.world.actors[0].shots`);
    if (!touch) {
      const x = ps.x + Math.cos(a) * 160, y = ps.y + Math.sin(a) * 160;
      await b.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await ticks(20);
      await b.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      var dirs = await sample(30);
      await b.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    } else {
      const sx = free.x, sy = free.y;
      await b.cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 7 }] });
      await b.cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + Math.cos(a) * 50, y: sy + Math.sin(a) * 50, id: 7 }] });
      var dirs = await sample(30);
      await b.cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await ticks(15);
    const p = await b.ev(`(()=>{const p=__chog.world.actors[0];return {shots:p.shots,facing:p.facing,speed:Math.hypot(p.vx,p.vy)}})()`);
    const shots = p.shots - s0;
    // The body turns at the LOCKED human cap (720 deg/s, a 180 in 0.25 s): shots in the first 15 ticks may still be
    // turning. Every shot after that must go where the aim points (within the weapon's spread).
    const settled = dirs.filter(([t]) => t >= 15).map(([, d]) => d);
    const err = settled.length ? Math.max(...settled.map((d) => angDiff(d, a))) : null;
    const first = dirs.length ? angDiff(dirs[0][1], a) : null;
    rows.push({ deg, shots, bullets: dirs.length, settledErrDeg: err === null ? null : +err.toFixed(1), firstShotErrDeg: first === null ? null : +first.toFixed(1) });
  }
  // Pellet spread fans up to the weapon's spread; 25 deg covers the widest (shotgun) fan.
  check(`${mode}: standing still, fires at all 9 angles along the aim`, rows.every((r) => r.shots > 0 && r.settledErrDeg !== null && r.settledErrDeg < 25), rows);
  if (b.errors.length) check(`${mode}: no page errors`, false, b.errors.slice(0, 3));
  await b.close();
}
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
