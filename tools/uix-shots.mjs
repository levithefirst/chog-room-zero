// UIX world-class pass: every player-facing surface at desktop, phone portrait and phone landscape (touch emulated),
// plus ultrawide and browser zoom. Screenshots + layout probe + console errors + a rough rAF FPS sample in play.
// Emulated devices (headless Chrome, SwiftShader), NOT real phones; FPS is relative only.
// Usage: node tools/uix-shots.mjs http://localhost:8890 <shotDir> [out.json]   (VIEWS=d1920,p390 to pick)
import fs from 'node:fs';
import { browser, sleep, LAYOUT_PROBE } from './cdp.mjs';
const [base, shotDir, outFile] = process.argv.slice(2);
const ALL = [
  { name: 'd1920', w: 1920, h: 1080 }, { name: 'd2560', w: 2560, h: 1440 }, { name: 'd1280', w: 1280, h: 720 },
  { name: 'p390', w: 390, h: 844, mobile: true, touch: true }, { name: 'p412', w: 412, h: 915, mobile: true, touch: true },
  { name: 'l844', w: 844, h: 390, mobile: true, touch: true }, { name: 'l915', w: 915, h: 412, mobile: true, touch: true },
  { name: 'uw3440', w: 3440, h: 1440 }, { name: 'z125', w: 1536, h: 864, dpr: 1.25 }, { name: 'z150', w: 1280, h: 720, dpr: 1.5 },
];
const pick = process.env.VIEWS?.split(',');
const VIEWS = pick ? ALL.filter((v) => pick.includes(v.name)) : ALL.slice(0, 7);
const result = {};
for (const d of VIEWS) {
  const r = (result[d.name] = { problems: [], errors: [], fps: null, screens: [] });
  const b = await browser(d.name, { base, shotDir, ...d });
  if (d.dpr) await b.cmd('Emulation.setDeviceMetricsOverride', { width: d.w, height: d.h, deviceScaleFactor: d.dpr, mobile: false });
  const probe = async (screen) => { await sleep(450); await b.shot(screen); r.screens.push(screen); const p = await b.ev(LAYOUT_PROBE); for (const x of p ?? []) r.problems.push(`${screen}: ${x}`); };
  const back = async () => { (await b.click('[data-act=back]')) || (await b.click('[data-act=howto-close]')) || (await b.click('[data-act=demo-close]')); await b.hub(); };
  await b.go('/?debug'); await b.ev(`localStorage.setItem('chog.onboarded','1')`);
  await b.go('/?debug');
  await b.until(`!!document.getElementById('boottip')?.innerText`, 5000); await b.shot('00-loading'); r.screens.push('00-loading');
  await b.hub(); await sleep(900); await probe('01-hub');
  for (const [act, name] of [['maps', '02-maps'], ['settings', '03-settings'], ['medals', '04-medals'], ['upgrades', '05-upgrades'], ['howto', '06-help']]) {
    const ok = (await b.click(`#overlay [data-act=${act}]`)) || (await b.ev(`(() => { const e = document.querySelector('[data-act=${act}]'); if (!e) return false; e.click(); return true; })()`));
    if (!ok) { r.problems.push(`${name}: no [data-act=${act}]`); continue; }
    await probe(name); await back();
  }
  if (await b.click('[data-go=start]')) { await probe('07-roster'); await b.click('[data-go=quit]'); await b.hub(); }
  await b.click('[data-mode=solo]');
  // The deploy briefing shows only while the world builds (a few hundred ms): slow the CPU for the shot only.
  await b.cmd('Emulation.setCPUThrottlingRate', { rate: 20 }); await b.ev(`document.getElementById('playbtn').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: ${d.touch ? "'touch'" : "'mouse'"} }))`); await sleep(150);
  await b.shot('08-deploy'); r.screens.push('08-deploy');
  await b.cmd('Emulation.setCPUThrottlingRate', { rate: 1 });
  await b.until(`__chog.phase === 'play'`, 15000); await sleep(1500); await b.shot('09-hud'); r.screens.push('09-hud');
  r.fps = await b.ev(`new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }; requestAnimationFrame(f); })`);
  // Some combat: walk forward and fire for a few seconds (real inputs on desktop; touch views just wait).
  if (!d.touch) { await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 }); await sleep(2500); await b.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 }); }
  else await sleep(2500);
  await b.ev(`(() => { const w = __chog.world; const p = w.actors.find((a) => a.team === 'player' && !a.ai); if (p) { p.hp = Math.min(p.hp, 30); } })()`);
  await sleep(700); await b.shot('10-hud-lowhp'); r.screens.push('10-hud-lowhp');
  await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await b.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  if (!(await b.until(`__chog.phase === 'pause'`, 2000))) await b.click('#pause');
  await b.until(`__chog.phase === 'pause'`, 3000); await probe('11-pause');
  await b.click('[data-go=resume]'); await b.until(`__chog.phase === 'play'`, 3000); await sleep(400);
  await b.ev(`(() => { const w = __chog.world; for (const a of w.actors) if (a.team === 'player' && !a.ai) { a.hp = 0; a.alive = false; } w.outcome = 'dead'; w.playerKill = { cause: 'shot', killerId: w.actors.findIndex((a) => a.team === 'bot'), weapon: 'Rifle', fromX: 0, fromY: 0, toX: 0, toY: 0, tick: w.tick }; })()`);
  await sleep(500); await b.shot('12-death'); r.screens.push('12-death');
  await b.until(`__chog.phase === 'results'`, 15000); await sleep(1200); await probe('13-defeat');
  // Victory: a fresh solo run, then every bot is removed by the debug hook (screen check only, not a real win).
  await b.click('[data-go=restart]'); await b.until(`__chog.phase === 'play'`, 15000); await sleep(800);
  await b.ev(`(() => { const w = __chog.world; for (const a of w.actors) if (a.team === 'bot') { a.hp = 0; a.alive = false; } })()`);
  if (!(await b.until(`__chog.phase === 'results'`, 6000))) await b.ev(`(() => { __chog.world.outcome = 'won'; })()`);
  await b.until(`__chog.phase === 'results'`, 10000); await sleep(1200); await probe('14-victory');
  r.errors = b.errors.slice(0, 10);
  await b.close();
  console.log(d.name, 'fps', r.fps, 'problems', r.problems.length, 'errors', r.errors.length, r.problems.slice(0, 6).join(' | '));
}
if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 1));
