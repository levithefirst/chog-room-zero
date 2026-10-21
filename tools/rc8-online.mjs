// RC-8 online end to end: independent clients in one authoritative match. Starts the real game server
// (dist-server/index.js, `npm run build:server` first) and, per player, a SEPARATE headless Chrome process with its own
// profile directory, each running the real built game from <baseUrl>. Every client is driven only through real
// keyboard and mouse events (CDP Input.*): a scripted player that walks to the final circle and fires at what its
// own screen shows. Nothing is mocked: matchmaking, movement, shots, damage, the zone and the result all happen on
// the server and reach the clients over WebSockets. 1v1 also reloads one client mid-match to check it resumes.
// Emulated desktop input in headless swiftshader Chrome on one machine (loopback network): NOT phones, NOT the internet.
// Usage: node tools/rc8-online.mjs <baseUrl> <outJson> [shotDir]   (MODES=1v1,3v3,5v5)
// HOLDERS=1 (5v5): every client signs in as its own test wallet holding a Chog (tools/local-api.ts, faked Monad) and
// plays on the local stack's game server, which checks every ticket with the site (5v5 is holders only).
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [base, outFile, shotDir] = process.argv.slice(2);
const MODES = (process.env.MODES ?? '1v1,3v3,5v5').split(',');
const SIZE = { '1v1': 2, '3v3': 6, '5v5': 10 };
const HOLDERS = !!process.env.HOLDERS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serverPort = 8700 + Math.floor(Math.random() * 90);
const server = spawn('node', ['dist-server/index.js'], { env: { ...process.env, PORT: String(serverPort) }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = ''; server.stdout.on('data', (d) => (serverLog += d)); server.stderr.on('data', (d) => (serverLog += d));
for (let i = 0; i < 40; i++) { await sleep(150); try { if ((await fetch(`http://127.0.0.1:${serverPort}/`)).ok) break; } catch {} }
const WS = `ws://127.0.0.1:${serverPort}/ws`;

// Debugging ports: one per browser, never reused in this run. (Random ports collided: two clients then drove the same
// page, which pressed PLAY twice, and the second press is Cancel. That stuck a 3v3 at 4/6; it was the tool, not the game.)
const PORT0 = 9700 + Math.floor(Math.random() * 30) * 10; let portN = 0;
async function launch(n) {
  const port = PORT0 + portN++;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rz-client-'));
  const proc = spawn(process.env.CHROME_BIN ?? 'google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--user-data-dir=${dir}`,
    `--remote-debugging-port=${port}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore', detached: true });
  let t;
  for (let i = 0; i < 60 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const P = new Map(); const errors = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m.result ?? m.error); P.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); };
  const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r?.result?.value; };
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 800, height: 450, deviceScaleFactor: 1, mobile: false });
  await cmd('Emulation.setFocusEmulationEnabled', { enabled: true });
  return { n, proc, dir, cmd, ev, errors, held: new Set(), pressed: false, page: t.webSocketDebuggerUrl };
}

const KEYS = { KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68] };
// In-page scripted player: reads only this client's own view world (what the server sent this client).
const DRIVER = `window.__drive = () => {
  const c = __chog, w = c.world, me = w.actors[0];
  if (!c.online() || c.phase !== 'play' || !me.alive) return { keys: [], fire: false };
  let target = null, best = 1e9;
  for (const f of w.actors) { if (f.team === me.team || !f.alive || f.x < -50) continue;
    const d = Math.hypot(f.x - me.x, f.y - me.y); if (d < best && c.lab.sightClear(w.level, me.x, me.y, f.x, f.y)) { best = d; target = f; } }
  const z = w.zone.plan[w.zone.plan.length - 1];
  if (!window.__path || !window.__path.length || w.tick - (window.__pathAt || 0) > 30) { window.__path = c.lab.findPath(w.level, me.x, me.y, z.x, z.y); window.__pathAt = w.tick; }
  while (window.__path.length && Math.hypot(window.__path[0].x - me.x, window.__path[0].y - me.y) < 0.45) window.__path.shift();
  const keys = []; const n = window.__path[0];
  if (n && !(target && best < 5)) { const dx = n.x - me.x, dy = n.y - me.y;
    if (dx > 0.15) keys.push('KeyD'); if (dx < -0.15) keys.push('KeyA'); if (dy > 0.15) keys.push('KeyS'); if (dy < -0.15) keys.push('KeyW'); }
  const at = target || n || z; const s = c.renderer.toScreen(at.x, at.y);
  return { keys, aim: { x: Math.max(1, Math.min(799, s.x)), y: Math.max(1, Math.min(449, s.y)) }, fire: !!target && best < 10 };
};`;

async function drive(c) {
  const d = await c.ev('window.__drive && window.__drive()');
  if (!d) return;
  const want = new Set(d.keys);
  for (const k of c.held) if (!want.has(k)) { await c.cmd('Input.dispatchKeyEvent', { type: 'keyUp', code: k, key: KEYS[k][0], windowsVirtualKeyCode: KEYS[k][1] }); c.held.delete(k); }
  for (const k of want) if (!c.held.has(k)) { await c.cmd('Input.dispatchKeyEvent', { type: 'keyDown', code: k, key: KEYS[k][0], windowsVirtualKeyCode: KEYS[k][1] }); c.held.add(k); }
  if (d.aim) await c.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: d.aim.x, y: d.aim.y, buttons: c.pressed ? 1 : 0 });
  if (d.fire && !c.pressed && d.aim) { await c.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: d.aim.x, y: d.aim.y, button: 'left', buttons: 1, clickCount: 1 }); c.pressed = true; }
  if (!d.fire && c.pressed) { await c.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: d.aim?.x ?? 400, y: d.aim?.y ?? 225, button: 'left', buttons: 0, clickCount: 1 }); c.pressed = false; }
}
async function click(c, sel) {
  const b = await c.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return r.width?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()`);
  if (!b) return false;
  await c.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
  await c.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await c.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await sleep(200); return true;
}
const shot = async (c, name) => { if (!shotDir) return; const s = await c.cmd('Page.captureScreenshot', { format: 'png' }); if (s?.data) fs.writeFileSync(`${shotDir}/rc8-online-${name}.png`, Buffer.from(s.data, 'base64')); };

const rows = [];
for (const mode of MODES) {
  const N = SIZE[mode];
  const R = { mode, clients: N, checks: {}, data: {} };
  const ok = (k, pass, data) => { R.checks[k] = { pass: !!pass, ...(data === undefined ? {} : { data }) }; };
  const clients = [];
  try {
    for (let i = 0; i < N; i++) clients.push(await launch(i));
    ok(`${N} separate browser processes, each with its own profile and its own page`, new Set(clients.map((c) => c.proc.pid)).size === N && new Set(clients.map((c) => c.dir)).size === N && new Set(clients.map((c) => c.page)).size === N);
    const url = HOLDERS ? `${base}/?debug&nooverlay` : `${base}/?debug&nooverlay&server=${encodeURIComponent(WS)}`;
    await Promise.all(clients.map(async (c) => {
      await c.cmd('Page.navigate', { url }); await sleep(2500);
      if (HOLDERS) { const a = '0x' + (0xb01 + c.n).toString(16).padStart(40, '0'); await c.cmd('Page.navigate', { url: `${base}/__test/login?provider=wallet&sub=${a}&label=${a}&to=${encodeURIComponent('/?debug&nooverlay')}` }); await sleep(2500); }
      await c.ev(`localStorage.clear();sessionStorage.clear();localStorage.setItem('chog.onboarded','1');localStorage.setItem('chog-room-zero:settings:v1',JSON.stringify({volume:0,vibration:false,quality:'low',stick:'medium',tips:false}));localStorage.setItem('chog-room-zero:profile:v1',JSON.stringify({id:'TEST${c.n}0000'.slice(0,8),nickname:'Tester ${c.n + 1}',favourite:null,pinned:[],linked:[]}))`);
      await c.cmd('Page.navigate', { url });
      // Wait for the hub itself (the loading screen loads the account first, then hands over).
      // Up to 60 s: on a loaded machine (other suites, ten swiftshader browsers) the first load can take that long.
      for (let i = 0; i < 240; i++) { await sleep(250); if (await c.ev(`(!!document.getElementById('hub') || __chog.view?.() === 'yourchog') && !document.getElementById('boot')`)) break; }
      if (HOLDERS) {
        await c.ev(`document.getElementById('yourchog-close')?.click()`);
        for (let i = 0; i < 80; i++) { await sleep(250); if (await c.ev(`!!document.getElementById('hub') && !!__chog.acct().tokens?.length`)) break; }
      }
      c.hub = await c.ev(`!!document.getElementById('hub') && !document.getElementById('boot')`);
      await c.ev(DRIVER);
    }));
    ok('every client reached the hub', clients.every((c) => c.hub), clients.map((c) => c.hub));
    if (HOLDERS) {
      const who = await Promise.all(clients.map((c) => c.ev(`({ wallet: __chog.acct().hasWallet, tokens: (__chog.acct().tokens ?? []).map((t) => t.tokenId), choice: __chog.acct().choice?.tokenId ?? null })`)));
      R.data.holders = who;
      ok('5v5: every client is a verified holder of its own token', who.every((w, i) => w?.wallet && w.tokens.includes(1001 + i)), who);
    }
    // Each client: hub -> pick the mode -> PLAY (real clicks; master integration pass hub).
    const clicked = [];
    for (const c of clients) clicked.push((await click(c, `[data-mode="${mode}"]`)) && (await sleep(300), await click(c, '#playbtn')));
    ok('every client pressed its mode and PLAY on its own hub', clicked.every(Boolean), clicked);
    const t0 = Date.now(); let inPlay = [];
    while (Date.now() - t0 < 40000) { inPlay = await Promise.all(clients.map((c) => c.ev(`__chog.online() && __chog.phase === 'play'`))); if (inPlay.every(Boolean)) break; await sleep(300); }
    ok('every client was matched and entered the online match through its own menu', inPlay.every(Boolean), inPlay);
    if (!inPlay.every(Boolean)) R.data.stuck = await Promise.all(clients.map((c) => c.ev(`(()=>{const n=__chog.net();return {phase:__chog.phase,view:__chog.view?.(),net:n?.state,msg:n?.message,queue:n?.queue,log:n?.log?.slice(-20),presses:window.__presses,now:Math.round(performance.now())}})()`)));
    const info = await Promise.all(clients.map((c) => c.ev(`(()=>{const m=__chog.net().match;return {room:m.room,you:m.you,team:m.team,roster:m.roster.length,me:__chog.world.actors[0].name,hp:__chog.world.actors[0].maxHp,ability:__chog.world.actors[0].ability.name,all:__chog.world.actors.map((a)=>a.team+':'+a.maxHp+':'+a.ability.name)}})()`)));
    R.data.match = info;
    ok('one room on the server, every client in it, teams split evenly', new Set(info.map((x) => x.room)).size === 1 && info.filter((x) => x.team === 'alpha').length === N / 2 && info.every((x) => x.roster === N));
    ok('each client is a different player of that room', new Set(info.map((x) => x.you)).size === N);
    const stats = await (await fetch(HOLDERS ? 'http://127.0.0.1:8791/stats' : `http://127.0.0.1:${serverPort}/stats`)).json();
    ok('the server reports the room and every player connected', stats.rooms >= 1 && stats.players >= N, stats);

    // MATCH_ONLY=1: matchmaking repeat runs stop once every client is in the match.
    if (process.env.MATCH_ONLY) throw new Error('MATCH_ONLY: stop after matchmaking');
    // Play: drive every client until the server ends the match (or 200 s).
    let reloaded = null; const tPlay = Date.now(); let shotMid = false; let over = [];
    while (Date.now() - tPlay < 200000) {
      for (const c of clients) await drive(c);
      if (mode === '1v1' && !reloaded && Date.now() - tPlay > 6000) {
        // Resume: the second client reloads its page mid-match and must come back into the same match.
        const c = clients[1]; const before = info[1];
        for (const k of c.held) await c.cmd('Input.dispatchKeyEvent', { type: 'keyUp', code: k, key: KEYS[k][0], windowsVirtualKeyCode: KEYS[k][1] }); c.held.clear(); c.pressed = false;
        await c.cmd('Page.reload'); await sleep(4500); await c.ev(DRIVER);
        let back = null; for (let i = 0; i < 30 && !(back?.online && back.phase === 'play'); i++) { back = await c.ev(`(()=>({online:__chog.online(),phase:__chog.phase,room:__chog.net()?.match?.room,you:__chog.net()?.match?.you}))()`); if (!(back?.online && back.phase === 'play')) await sleep(500); }
        reloaded = back;
        ok('1v1: a client that reloads mid-match resumes the same operator in the same match', back?.online && back.room === before.room && back.you === before.you && back.phase === 'play', back);
      }
      if (mode === '1v1' && reloaded && !R.data.drop && Date.now() - tPlay > 11000) {
        // Network drop: the first client's link goes away for 4 s (no page reload), then comes back. It must end up in
        // the same match as the same player, receiving snapshots again.
        const c = clients[0]; const before = info[0];
        await c.cmd('Network.enable');
        await c.cmd('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await sleep(4000);
        await c.cmd('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        let back = null; const snaps0 = await c.ev(`__chog.net()?.snapCount ?? 0`);
        for (let i = 0; i < 60; i++) { await sleep(250); back = await c.ev(`(()=>({online:__chog.online(),phase:__chog.phase,state:__chog.net()?.state,room:__chog.net()?.match?.room,you:__chog.net()?.match?.you,snaps:__chog.net()?.snapCount,over:!!__chog.net()?.over}))()`); if (back?.over || (back?.state === 'match' && back.snaps > snaps0 + 5)) break; }
        R.data.drop = back;
        ok('1v1: a 4 s network drop (no reload) comes back into the same match as the same player', back && (back.over || (back.room === before.room && back.you === before.you && back.state === 'match' && back.snaps > snaps0 + 5)), back);
      }
      if (!shotMid && Date.now() - tPlay > 15000) { shotMid = true; await shot(clients[0], `${mode}-client1-mid`); if (N > 2) await shot(clients[2], `${mode}-client3-mid`); }
      over = await Promise.all(clients.map((c) => c.ev(`!!__chog.net()?.over`)));
      if (over.every(Boolean)) break;
      await sleep(60);
    }
    R.data.seconds = Math.round((Date.now() - tPlay) / 1000);
    ok('the server ended the match and every client received the result', over.every(Boolean), { over, seconds: R.data.seconds });
    // Each client leaves play on its own next frame after the result arrives. Wait (up to 15 s) and record how long each
    // took and its frame rate: a client that never gets there is a product bug; a slow frame on a loaded host is not.
    const tOver = Date.now(); const reachedAt = clients.map(() => null);
    while (Date.now() - tOver < 15000 && reachedAt.some((x) => x === null)) {
      const ph = await Promise.all(clients.map((c) => c.ev(`__chog.phase`)));
      ph.forEach((p, i) => { if (p === 'results' && reachedAt[i] === null) reachedAt[i] = Date.now() - tOver; });
      await sleep(100);
    }
    R.data.toResultsMs = reachedAt;
    R.data.fps = await Promise.all(clients.map((c) => c.ev(`Math.round(__chog.fps)`)));
    await sleep(500);
    const res = await Promise.all(clients.map((c) => c.ev(`(()=>{const o=__chog.net().over;return {phase:__chog.phase,winner:o&&o.winner,team:o&&o.team,reason:o&&o.reason,title:document.querySelector('#overlay h2')?.textContent,kills:o?o.results.reduce((a,r)=>a+r.kills,0):-1,down:o?o.results.filter(r=>!r.alive).length:-1,causes:o?o.results.map(r=>r.cause):[]}})()`)));
    R.data.results = res;
    ok('every client shows the same server result (same winner), on its results screen', new Set(res.map((r) => r.winner)).size === 1 && res.every((r) => r.phase === 'results'));
    ok('each client titles it from its own side (Victory / Defeat / Draw)', res.every((r) => r.title === (r.winner === null ? 'Draw' : r.winner === r.team ? 'Victory' : 'Defeat')), res.map((r) => r.title));
    ok('kills reported never exceed players down (server bookkeeping is consistent)', res.every((r) => r.kills <= r.down));
    for (const c of clients.slice(0, 2)) await shot(c, `${mode}-client${c.n + 1}-results`);
    const errs = clients.flatMap((c) => c.errors);
    ok('no page errors on any client', errs.length === 0, errs.slice(0, 4));
  } catch (e) { if (!String(e).includes('MATCH_ONLY')) ok('tool ran', false, String(e?.stack ?? e)); }
  for (const c of clients) { try { process.kill(-c.proc.pid, 'SIGKILL'); } catch { try { c.proc.kill(); } catch {} } try { fs.rmSync(c.dir, { recursive: true, force: true }); } catch {} }
  R.pass = Object.values(R.checks).every((c) => c.pass);
  rows.push(R);
  console.log(mode, R.pass ? 'PASS' : 'FAIL', `${R.data.seconds ?? '-'} s`, JSON.stringify(R.data.results?.map((r) => `${r.team}:${r.title}`) ?? []),
    Object.entries(R.checks).filter(([, c]) => !c.pass).map(([k, c]) => `${k}: ${JSON.stringify(c.data)}`).join(' | '));
  await sleep(1000);
}
fs.writeFileSync(outFile, JSON.stringify({ server: serverLog.trim(), rows }, null, 1));
server.kill();
process.exit(rows.every((r) => r.pass) ? 0 : 1);
