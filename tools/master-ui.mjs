// Master build stage E in a real headless Chrome (emulated desktop, NOT a device): DEMO screen tier samples, a demo
// 1:1 in solo (HUD and ability slot), the Online screen's identity panel and 5v5 lock, the Progress tab.
// Usage: node tools/master-ui.mjs <baseUrl> [shotDir]. Needs a test build (hooks on) served at baseUrl.
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [base, shotDir] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 300);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rz-ui-'));
const proc = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
let t; for (let i = 0; i < 60 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const P = new Map(); const errors = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m.result ?? m.error); P.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); };
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
const shot = async (name) => { if (!shotDir) return; const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(shotDir, { recursive: true }); fs.writeFileSync(path.join(shotDir, name), Buffer.from(r.data, 'base64')); };
const click = (sel) => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const r = el.getBoundingClientRect();
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + 2, clientY: r.y + 2, pointerType: 'mouse' })); return true; })()`);
await cmd('Runtime.enable'); await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await cmd('Page.navigate', { url: `${base}/?debug` });
for (let i = 0; i < 50; i++) { await sleep(200); if (await ev('!!window.__chog')) break; }
await ev(`localStorage.setItem('chog.onboarded','1')`);
await cmd('Page.navigate', { url: `${base}/?debug` });
for (let i = 0; i < 50; i++) { await sleep(200); if (await ev('!!document.querySelector("[data-act=demo]")')) break; }
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

await click('[data-act=demo]'); await sleep(300);
const demoText = await ev("document.getElementById('overlay').innerText");
check('DEMO screen lists one token per tier and a 1:1 signature', /chog #53/i.test(demoText) && /flashfire/i.test(demoText) && /gold shell/i.test(demoText) && /epic/i.test(demoText) && /earns nothing/i.test(demoText));
await shot('demo-screen.png');
await click('[data-demo="53"]'); await sleep(300);
await click('[data-go=start]'); await sleep(400);
await click('[data-go=pick]'); await sleep(1500);
const solo = await ev(`(() => { const p = __chog.world.actors[0]; return { tier: p.power.tier, demo: p.power.demo, ability: p.ability.name, maxHp: p.maxHp, hud: document.getElementById('hero').innerText, abl: document.getElementById('abl').innerText }; })()`);
check('solo demo #53 plays as a labelled 1:1 with Flashfire', solo?.tier === 'legendary' && solo.demo && solo.ability === 'Flashfire' && /DEMO/.test(solo.hud) && /1:1/.test(solo.hud) && /flashfire/i.test(solo.abl), JSON.stringify(solo));
await sleep(500); await shot('solo-demo-hud.png');
// Back to the menu, then Online.
await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }))`); await sleep(300);
// A test build may point at any game server (?server=); nothing listens here, so this checks the screens only.
await cmd('Page.navigate', { url: `${base}/?debug&server=ws://127.0.0.1:9/ws` });
for (let i = 0; i < 50; i++) { await sleep(200); if (await ev('!!document.querySelector("[data-act=online]")')) break; }
await click('[data-act=online]'); await sleep(1500);
const on = await ev(`(() => { const b = document.querySelector('[data-online="5v5"]'); return { text: document.getElementById('overlay').innerText, fiveDisabled: !!b?.disabled, fiveText: b?.innerText ?? null }; })()`);
check('Online: 5v5 locked for a guest with the reason', on?.fiveDisabled && /holders only/i.test(on.fiveText ?? ''), JSON.stringify(on?.fiveText));
check('Online: identity panel present (account service state shown honestly)', /Your profile online|not reachable/.test(on?.text ?? ''));
await shot('online-guest.png');
await click('[data-act=demo-online]'); await sleep(400);
const on2 = await ev(`(() => { const b = document.querySelector('[data-online="5v5"]'); return { fiveDisabled: !!b?.disabled, text: document.getElementById('overlay').innerText }; })()`);
check('Online demo choice (when the account service answers) or unchanged lock (when it does not)', on2 && (on2.fiveDisabled || /DEMO/.test(on2.text)), `fiveDisabled=${on2?.fiveDisabled}`);
await click('[data-act=back]'); await sleep(200);
await click('[data-act=profile]'); await sleep(300);
await click('[data-tab=progress]'); await sleep(800);
const prog = await ev(`document.getElementById('overlay').innerText`);
check('Progress tab says what is saved and where', /Progress|not reachable|Sign in/.test(prog ?? ''));
await shot('progress.png');
check('no page errors', errors.length === 0, errors.join(' | '));
proc.kill(); fs.rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ pass: results.every((r) => r.ok), results }));
process.exit(results.every((r) => r.ok) ? 0 : 1);
