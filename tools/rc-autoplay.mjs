// SCRIPTED victory run in the real browser game (RC-2). For each hero: open ?debug&autoplay=<seed>&hero=<id>,
// press Enter and Deploy with real clicks, let the autopilot (src/debug/autopilot.ts) play the unmodified match
// against the real bots, and on a loss click "Again" (real click, after the 0.75 s gate) until a genuine win.
// Then reload and check the personal best is saved and shown. No bot deletion, no damage or health changes.
// Usage: node tools/rc-autoplay.mjs <baseUrl> <outJson> [maxAttemptsPerHero=30] [heroes=kettle,mop,brick,wick]
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [base, outFile, maxArg = '30', heroArg = 'kettle,mop,brick,wick'] = process.argv.slice(2);
const port = 9600 + Math.floor(Math.random() * 50);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let t;
for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const P = new Map(); const errors = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m.result ?? m.error); P.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ')); };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const click = async (sel) => { const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()`); if (!r) return false;
  await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r[0], y: r[1] });
  await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0], y: r[1], button: 'left', buttons: 1, clickCount: 1 }); await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0], y: r[1], button: 'left', clickCount: 1 }); return true; };
const phase = () => ev('__chog.phase');
async function waitPhase(want, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const p = await phase(); if (want.includes(p)) return p; await sleep(250); } return null; }
await cmd('Runtime.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
// Fresh device: no records yet.
await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(2500); await ev(`localStorage.clear(); localStorage.setItem('chog.onboarded','1')`);
const out = { base, label: 'SCRIPTED (autopilot), headless Chrome; human wins UNVERIFIED', heroes: [] };
for (const hero of heroArg.split(',')) {
  const seed = 1000 + hero.length * 7;
  await cmd('Page.navigate', { url: `${base}/?debug&nooverlay&autoplay=${seed}&hero=${hero}` }); await sleep(3000);
  await click('[data-go="start"]'); await sleep(400);
  await click('[data-go="pick"]');
  const attempts = [];
  let won = null;
  for (let a = 1; a <= +maxArg; a++) {
    if (!(await waitPhase(['play'], 15000))) { attempts.push({ attempt: a, error: 'never reached play' }); break; }
    const t0 = Date.now();
    const end = await waitPhase(['results'], 400000);
    const s = await ev(`(()=>{const w=__chog.world,p=w.actors[0];return {outcome:w.outcome,hero:p.hero.id,kills:p.kills,shots:p.shots,hits:p.hits,simSeconds:Math.round(w.tick/60),botsAlive:w.actors.filter(b=>b.team==='bot'&&b.alive).length,botsTotal:w.actors.length-1,time:[...document.querySelectorAll('table.stats tr')].find(r=>r.cells[0].textContent==='Time')?.cells[1].textContent}})()`);
    attempts.push({ attempt: a, ...s, wallSeconds: Math.round((Date.now() - t0) / 1000), ended: end });
    console.log(hero, JSON.stringify(attempts.at(-1)));
    if (s.outcome === 'won') { won = s; won.pb = await ev(`document.getElementById('resultpb')?.textContent`); break; }
    await sleep(1000); // past the 0.75 s summary gate, then a fresh real click
    await click('[data-go="restart"]');
  }
  // Persistence: reload the page; the title and storage must show this hero's best.
  await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(3000);
  const persisted = await ev(`(()=>{const r=JSON.parse(localStorage.getItem('chog-room-zero:records:v1')||'null');return {hero:r?.heroes?.[${JSON.stringify(hero)}]??null,title:document.getElementById('titlepb')?.textContent}})()`);
  out.heroes.push({ hero, wins: won ? 1 : 0, attempts: attempts.length, win: won, persisted, attemptLog: attempts });
}
out.consoleErrors = errors;
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
for (const h of out.heroes) console.log(`${h.hero}: ${h.wins ? 'WIN' : 'no win'} after ${h.attempts} attempt(s)${h.win ? `, time ${h.win.time}, kills ${h.win.kills}/${h.win.botsTotal}` : ''}; saved best ${h.persisted.hero?.bestWinSeconds ?? '-'} s`);
console.log('console errors:', errors.length);
chrome.kill(); process.exit(0);
