// RC-5/RC-6 touch play (headless Chrome, emulated touch; NOT a physical phone). RC-6: the game is landscape; a
// portrait size (e.g. 390x844) opens on the landscape stage turned 90 deg (the phone held sideways with rotation
// lock on), so every touch is written in stage coordinates and turned into viewport coordinates like the CSS does. A full match played ONLY through
// real touch events on the real UI: taps for menus, the left thumb stick for movement, the right thumb stick for
// aim + fire, the Reload and Ability buttons. Decisions come from the scripted autopilot via the debug-only
// __chog.suggest() (what it would do now; nothing is applied directly), sampled ~12 times a second, so this is
// SCRIPTED play through the touch pipeline, not a human. Runs until death or victory, checks the results screen,
// then taps Again and checks a new run starts. No bot deletion, no damage changes.
// Usage: node tools/rc5-touchplay.mjs <baseUrl> <out.json> [WxH=390x844] [hero=kettle] [maxSimSeconds=150] [shotDir]
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [base, outFile, size = '390x844', hero = 'kettle', maxSim = '150', shotDir] = process.argv.slice(2);
const [VW, VH] = size.split('x').map(Number);
const port = 9900 + Math.floor(Math.random() * 90);
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
await cmd('Runtime.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: true });
await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const touches = new Map(); // id -> {x,y} in stage coordinates
let S = { rotated: false, screenW: VW, w: VW, h: VH };
const scr = (p) => (S.rotated ? { x: S.screenW - p.y, y: p.x } : { x: p.x, y: p.y });
const pts = () => [...touches.entries()].map(([i, p]) => ({ id: i, ...scr(p) }));
const send = (type) => cmd('Input.dispatchTouchEvent', { type, touchPoints: pts() });
async function down(i, x, y) { touches.set(i, { x, y }); await send('touchStart'); }
async function move(i, x, y) { touches.set(i, { x, y }); await send('touchMove'); }
// Lift one finger: CDP releases a point that is missing from the next touchMove; touchEnd must carry no points and ends all.
async function up(i) { if (!touches.has(i)) return; touches.delete(i); await cmd('Input.dispatchTouchEvent', touches.size ? { type: 'touchMove', touchPoints: pts() } : { type: 'touchEnd', touchPoints: [] }); }
// Element centre in stage coordinates.
const center = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();if(!b.width)return null;const S=__chog.stage(),x=b.left+b.width/2,y=b.top+b.height/2;return S.rotated?[y,S.screenW-x]:[x,y]})()`);
async function tap(sel, tid = 30) { const c = await center(sel); if (!c) return false; await down(tid, c[0], c[1]); await up(tid); return true; }
const phase = () => ev('__chog.phase');
async function waitPhase(want, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (want.includes(await phase())) return true; await sleep(50); } return false; }
const shot = async (name) => { if (!shotDir) return; const s = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${shotDir}/rc5-${size}-${name}.png`, Buffer.from(s.data, 'base64')); };

await cmd('Page.navigate', { url: `${base}/?debug&nooverlay&pilot=11` }); await sleep(2500);
await ev(`localStorage.clear();localStorage.setItem('chog.hero',${JSON.stringify(hero)})`);
await cmd('Page.navigate', { url: `${base}/?debug&nooverlay&pilot=11` }); await sleep(3000);
S = await ev('__chog.stage()');
const out = { base, size, hero, stage: S, label: 'SCRIPTED decisions, real touch events (emulated), headless Chrome; NOT a physical phone', steps: {} };
out.steps.menus = (await tap('[data-act="howto-close"]')) && (await sleep(300), await tap('[data-go="start"]')) && (await sleep(400), await tap('[data-go="pick"]')) && (await waitPhase(['play']));
// Stick bases (stage coordinates, landscape): where thumbs rest on a phone held sideways.
const L0 = { x: S.w * 0.18, y: S.h * 0.72 }, R0 = { x: S.w * 0.72, y: S.h * 0.55 };
const stat = { samples: 0, moveSamples: 0, fireSamples: 0, reloadTaps: 0, abilityTaps: 0, maxVisible: 0, offscreenMarks: 0, shotWithEnemy: false };
let lastReloadTap = 0, lastAbilityTap = 0;
const tSim = () => ev('__chog.world.tick/60');
while ((await phase()) === 'play' && (await tSim()) < +maxSim) {
  const s = await ev(`(()=>{const w=__chog.world,p=w.actors[0],i=__chog.suggest();return {i,abilityCd:p.abilityCd,ammo:p.ammo,reloadLeft:p.reloadLeft,vis:__chog.renderer.visibleBots(),off:__chog.renderer.offscreenMarks()}})()`);
  if (!s) break;
  stat.samples++; stat.maxVisible = Math.max(stat.maxVisible, s.vis); stat.offscreenMarks = Math.max(stat.offscreenMarks, s.off);
  const { i } = s;
  const m = Math.hypot(i.moveX, i.moveY);
  if (m > 0.05) {
    stat.moveSamples++;
    const k = i.quiet ? 0.45 : 1; // a half push creeps
    const x = L0.x + (i.moveX / m) * 56 * k, y = L0.y + (i.moveY / m) * 56 * k;
    if (!touches.has(1)) await down(1, L0.x, L0.y);
    await move(1, x, y);
  } else await up(1);
  if (i.firing) {
    stat.fireSamples++;
    const x = R0.x + Math.cos(i.aim) * 45, y = R0.y + Math.sin(i.aim) * 45;
    if (!touches.has(2)) await down(2, R0.x, R0.y);
    await move(2, x, y);
    if (!stat.shotWithEnemy && s.vis > 0) { stat.shotWithEnemy = true; await shot('fight'); }
  } else await up(2);
  const now = Date.now();
  if (i.reload && s.reloadLeft <= 0 && now - lastReloadTap > 800) { lastReloadTap = now; if (await tap('#reload', 3)) stat.reloadTaps++; }
  if (i.ability && s.abilityCd === 0 && now - lastAbilityTap > 800) { lastAbilityTap = now; if (await tap('#ability', 4)) stat.abilityTaps++; }
  await sleep(60);
}
await up(1); await up(2);
await waitPhase(['results'], 20000);
const res = await ev(`(()=>{const w=__chog.world,p=w.actors[0];return {phase:__chog.phase,outcome:w.outcome,simSeconds:Math.round(w.tick/60),kills:p.kills,shots:p.shots,bullets:p.bullets,hits:p.hits,abilityUsedCd:p.abilityCd,damageTaken:Math.round(p.damageTaken),
  h2:document.querySelector('#overlay h2')?.textContent,rows:[...document.querySelectorAll('table.stats tr')].map(r=>r.innerText.replace(/\\s+/g,' ')),pb:document.getElementById('resultpb')?.textContent}})()`);
await shot('results');
out.steps.play = stat; out.steps.result = res;
await sleep(1000); // past the 0.75 s summary lock
await ev('window.__w0=__chog.world');
out.steps.again = (await tap('[data-go="restart"]')) && (await waitPhase(['play'], 10000)) && (await ev('__chog.world!==window.__w0&&__chog.world.tick<600'));
const recs = await ev(`JSON.parse(localStorage.getItem('chog-room-zero:records:v1')||'null')`);
out.steps.records = recs?.heroes?.[hero] ?? null;
out.consoleErrors = errors;
out.pass = S.w >= S.h && !!out.steps.menus && stat.moveSamples > 0 && stat.fireSamples > 0 && res.shots > 0 && res.phase === 'results' && ['won', 'dead'].includes(res.outcome)
  && /Room cleared|Run over/.test(res.h2 ?? '') && !!out.steps.again && (out.steps.records?.runs ?? 0) >= 1 && errors.length === 0;
fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
console.log(`${out.pass ? 'PASS' : 'FAIL'} ${size} ${hero}: ${res.outcome} at ${res.simSeconds}s, kills ${res.kills}/5, shots ${res.shots}, hits ${res.hits}/${res.bullets}, reload taps ${stat.reloadTaps}, ability taps ${stat.abilityTaps}, max visible ${stat.maxVisible}, offscreen marks ${stat.offscreenMarks}; results "${res.h2}"; Again -> new run ${out.steps.again}; best ${JSON.stringify(out.steps.records)}; console errors ${errors.length}`);
chrome.kill(); process.exit(0);
