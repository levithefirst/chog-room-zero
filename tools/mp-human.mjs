// Two people try a 1v1: two separate Chrome processes (own profiles, like two phones), each with its own saved
// location, press 1V1 then PLAY through the real hub. Reports what each one sees and what the server holds.
// Emulated, local stack (NOT real devices or networks).
// Usage: node tools/mp-human.mjs http://localhost:8790 http://127.0.0.1:8791 [mapA] [mapB] [seconds, default 25]
// RESTART="<shell command that starts the game server>" restarts it while both wait in the queue: the server process is
// found by its listening port and stopped by its own PID, then started again; both clients must rejoin and meet.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { browser, sleep } from './cdp.mjs';
/** The process listening on a TCP port, from /proc (its socket inode, then whose fd points at it). */
function listenerPid(port) {
  const hex = port.toString(16).toUpperCase().padStart(4, '0');
  const inodes = new Set();
  for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
    try { for (const l of fs.readFileSync(f, 'utf8').split('\n').slice(1)) { const c = l.trim().split(/\s+/); if (c[1]?.endsWith(`:${hex}`) && c[3] === '0A') inodes.add(c[9]); } } catch { /* none */ }
  }
  for (const d of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
    try { for (const fd of fs.readdirSync(`/proc/${d}/fd`)) { const m = /^socket:\[(\d+)\]$/.exec(fs.readlinkSync(`/proc/${d}/fd/${fd}`)); if (m && inodes.has(m[1])) return Number(d); } } catch { /* gone or not ours */ }
  }
  return 0;
}
const [base, serverHttp, mapA = 'room-zero', mapB = 'room-zero', secsArg] = process.argv.slice(2);
const SECS = Number(secsArg ?? 25);
const open = [];
const stats = async () => { try { return await (await fetch(`${serverHttp}/stats`)).json(); } catch { return null; } };
try {
  const people = [];
  for (const [label, map] of [['A', mapA], ['B', mapB]]) {
    const b = await browser(`human-${label}`, { base, w: 1280, h: 720 });
    open.push(b);
    await b.go('/?debug');
    await b.until(`location.origin === ${JSON.stringify(new URL(base).origin)} && document.readyState !== 'loading'`, 30000);
    await b.ev(`localStorage.setItem('chog.onboarded','1'); localStorage.setItem('chog.map', ${JSON.stringify(map)})`);
    await b.go('/?debug');
    if (!(await b.hub())) throw new Error(`${label}: hub did not load`);
    people.push({ label, map, b });
  }
  // Both press 1V1, then PLAY, a second apart (like two friends counting down).
  for (const p of people) { await p.b.click('[data-mode="1v1"]'); await p.b.click('#playbtn'); await sleep(1000); }
  if (process.env.RESTART) {
    const port = new URL(serverHttp).port;
    const pid = listenerPid(Number(port));
    if (!pid) throw new Error('game server pid not found');
    process.kill(pid, 'SIGTERM');
    await sleep(2500);
    spawn('bash', ['-c', process.env.RESTART], { stdio: 'ignore', detached: true }).unref();
    console.log(`restarted the game server (was pid ${pid})`);
  }
  const t0 = Date.now();
  let matched = null;
  while (Date.now() - t0 < SECS * 1000) {
    const phases = await Promise.all(people.map((p) => p.b.ev(`__chog.phase`)));
    if (phases.every((ph) => ph === 'play')) { matched = (Date.now() - t0) / 1000; break; }
    await sleep(500);
  }
  const seen = await Promise.all(people.map(async (p) => ({
    who: p.label, map: p.map, phase: await p.b.ev(`__chog.phase`),
    play: (await p.b.ev(`document.getElementById('playbtn')?.innerText ?? ''`))?.replace(/\s+/g, ' ').trim(),
    msg: (await p.b.ev(`document.querySelector('#hub .net-msg, #hub .msg, .play-sub')?.innerText ?? ''`))?.trim(),
  })));
  console.log(JSON.stringify({ mapA, mapB, matchedAfterS: matched, server: await stats(), clients: seen }, null, 1));
  process.exitCode = matched === null ? 1 : 0;
} catch (e) { console.log('run failed:', e?.stack ?? e); process.exitCode = 2; }
finally { for (const b of open) await b.close(); }
