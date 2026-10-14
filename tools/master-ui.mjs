// Master build stage E, updated for the master integration pass hub, in a real headless Chrome (emulated desktop, NOT
// a device): DEMO screen tier samples, a demo 1:1 in practice (HUD and ability slot), the hub's 5v5 lock, the
// Upgrades and Leaderboard screens.
// Usage: node tools/master-ui.mjs <baseUrl> [shotDir]. Needs a test build (hooks on) served at baseUrl.
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [base, shotDir] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 300);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rz-ui-'));
const proc = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore', detached: true });
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
for (let i = 0; i < 60; i++) { await sleep(200); if (await ev('!!document.querySelector("[data-act=demo]") && !document.getElementById("boot")')) break; }
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); };

await click('[data-act=demo]'); await sleep(300);
const demoText = await ev("document.getElementById('overlay').innerText");
check('DEMO screen lists one token per tier and a 1:1 signature', /chog #53/i.test(demoText) && /flashfire/i.test(demoText) && /gold shell/i.test(demoText) && /epic/i.test(demoText) && /earns nothing/i.test(demoText));
await shot('demo-screen.png');
await click('[data-demo="53"]'); await sleep(300);
await click('[data-mode="solo"]'); await sleep(200);
await click('#playbtn'); await sleep(1500);
const solo = await ev(`(() => { const p = __chog.world.actors[0]; return { tier: p.power.tier, demo: p.power.demo, ability: p.ability.name, maxHp: p.maxHp, hud: document.getElementById('hero').innerText, abl: document.getElementById('abl').innerText }; })()`);
check('practice demo #53 plays as a labelled 1:1 (Blaze) with Flashfire', solo?.tier === 'legendary' && solo.demo && solo.ability === 'Flashfire' && /Vs bots/i.test(solo.hud) && /DEMO/.test(solo.hud) && /Blaze/.test(solo.hud) && /flashfire/i.test(solo.abl), JSON.stringify(solo));
await sleep(500); await shot('solo-demo-hud.png');
// Back to the hub (master integration pass: no Online screen, no Player card tabs; everything is on the hub).
await cmd('Page.navigate', { url: `${base}/?debug&server=ws://127.0.0.1:9/ws` });
for (let i = 0; i < 60; i++) { await sleep(200); if (await ev('!!document.getElementById("hub") && !document.getElementById("boot")')) break; }
const hub = await ev(`(() => { const b = document.querySelector('[data-mode="5v5"]'); return { five: b?.innerText ?? '', text: document.getElementById('overlay').innerText }; })()`);
check('Hub: 5v5 marked holders only for a guest', /holders only/i.test(hub?.five ?? ''), JSON.stringify(hub?.five));
check('Hub: class panel (free class) and leaderboard preview present', /\bclass\b/i.test(hub?.text ?? '') && /\bfree\b/i.test(hub?.text ?? '') && /leaderboard/i.test(hub?.text ?? ''));
await click('[data-mode="5v5"]'); await sleep(200);
const lock = await ev(`({ text: document.getElementById('overlay').innerText, play: document.getElementById('playbtn')?.disabled })`);
check('Hub: selecting 5v5 as a guest shows CHOG HOLDERS ONLY and Play is disabled', /chog holders only/i.test(lock?.text ?? '') && lock?.play === true, JSON.stringify({ play: lock?.play }));
await click('[data-mode="solo"]'); await sleep(200);
await shot('hub-guest.png');
await click('[data-act=upgrades]'); await sleep(500);
const up = await ev(`document.getElementById('overlay').innerText`);
check('Upgrades screen (guest) asks to sign in to upgrade', /sign in to upgrade/i.test(up ?? ''));
await click('[data-act=back]'); await sleep(200);
await click('[data-act=ranks]'); await sleep(800);
const ranks = await ev(`document.getElementById('overlay').innerText`);
check('Leaderboard screen opens for a guest with its ranking rule and honest service state', /leaderboard/i.test(ranks ?? '') && /kills · then wins · then fewer matches/i.test(ranks ?? '') && /\b(player|offline|no ranks yet)\b|…/i.test(ranks ?? ''));
await shot('leaderboard.png');
check('no page errors', errors.length === 0, errors.join(' | '));
try { process.kill(-proc.pid, 'SIGKILL'); } catch { proc.kill(); } await new Promise((r) => { proc.once('exit', r); setTimeout(r, 3000); }); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
console.log(JSON.stringify({ pass: results.every((r) => r.ok), results }));
process.exit(results.every((r) => r.ok) ? 0 : 1);
