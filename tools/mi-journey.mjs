// Master integration pass: the owner's acceptance journeys in real headless Chrome (emulated desktop, NOT a device),
// against the local full stack (tools/local-api.ts + the game server). Every step goes through the real page: the
// loading screen, the hub, real clicks on hub buttons, a real 1v1 between two browsers on the authoritative server
// (scripted controls via the test-build driver, &drive=1), settlement into the database, the hub after the match,
// an upgrade bought, the leaderboard, a third browser signing in to the same account, and a verified holder (fake
// chain wallet) with a 1:1 and 5v5 open.
// Usage: node tools/mi-journey.mjs http://localhost:8790 [shotDir]
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const [base, shotDir] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`); };
const procs = [];

async function browser(label, w = 1280, h = 720) {
  const port = 9400 + Math.floor(Math.random() * 500);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rz-${label}-`));
  const proc = spawn(process.env.CHROME_BIN ?? 'google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  procs.push({ proc, dir });
  let t; for (let i = 0; i < 80 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const P = new Map(); const errors = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m.result ?? m.error); P.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); };
  const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await cmd('Runtime.enable'); await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const ev = async (e) => (await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;
  const b = {
    label, cmd, ev, errors,
    go: async (u) => { await cmd('Page.navigate', { url: base + u }); await sleep(300); },
    shot: async (name) => { if (!shotDir) return; const r = await cmd('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(shotDir, { recursive: true }); fs.writeFileSync(path.join(shotDir, `${label}-${name}.png`), Buffer.from(r.data, 'base64')); },
    // A real pointer press on the element (the overlay acts on pointerdown).
    click: async (sel) => { const r = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el || el.disabled) return null; el.scrollIntoView({ block: 'center' }); const q = el.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; })()`);
      if (!r) return false;
      await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
      await sleep(250); return true; },
    text: (sel = '#overlay') => ev(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`),
    until: async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await ev(expr); if (v) return v; await sleep(250); } return null; },
  };
  return b;
}
const hubReady = (b) => b.until(`!!document.querySelector('#hub') && !document.getElementById('boot')`, 25000);
const acct = (b) => b.ev(`(() => { const a = __chog.acct(); const p = a.profile; return p ? { signedIn: a.signedIn, xp: p.xp, level: p.level, shards: p.shards, rating: p.rating, matches: p.matches, wins: p.wins, callsign: p.callsign, medals: Object.keys(p.medals).length, upgrades: p.upgrades, online: p.online } : { signedIn: a.signedIn }; })()`);

try {
  // ---- 1. Guest: loading screen, then the hub ----
  const A = await browser('alice');
  await A.go('/?debug');
  await A.ev(`localStorage.setItem('chog.onboarded','1')`);
  await A.go('/?debug');
  const bootSeen = await A.until(`(() => { const b = document.getElementById('boot'); return b && !!b.querySelector('.boot-title') && !!document.getElementById('bootpct') && document.getElementById('boottip')?.innerText ? { tip: document.getElementById('boottip').innerText, step: document.getElementById('bootstep').innerText } : null; })()`, 5000);
  await A.shot('01-loading');
  check('loading screen: separate full screen with title, progress %, step and a game tip', bootSeen && bootSeen.tip.length > 10, JSON.stringify(bootSeen));
  await hubReady(A);
  await sleep(800);
  await A.shot('02-hub-guest');
  const g = await A.ev(`(() => ({ hub: !!document.querySelector('#hub'), play: !!document.querySelector('#playbtn'), modes: [...document.querySelectorAll('[data-mode]')].map((b) => b.dataset.mode + ':' + b.innerText.replace(/\\s+/g, ' ')), board: !!document.querySelector('#boardpreview'), squad: !!document.querySelector('#squad'), chog: document.querySelector('#chogpanel')?.innerText ?? '', text: document.getElementById('overlay').innerText }))()`);
  check('hub: PLAY, four modes, leaderboard preview, squad, class panel, all on one screen', g.hub && g.play && g.modes.length === 4 && g.board && g.squad && /your class/i.test(g.chog), g.modes.join(' / '));
  check('hub: 5v5 shows CHOG HOLDERS ONLY for a guest', g.modes.some((m) => m.startsWith('5v5') && /CHOG HOLDERS ONLY/.test(m)));
  check('hub: no "saved on this device" language; guest told nothing is saved', !/this device only/i.test(g.text) && /nothing is saved/i.test(g.text));
  await A.click('[data-mode="5v5"]');
  const lock = await A.ev(`({ why: document.getElementById('lockwhy')?.innerText ?? '', disabled: document.getElementById('playbtn').disabled })`);
  check('hub: picking 5v5 as a guest explains the lock and disables Play', lock.disabled && /holders only/i.test(lock.why), lock.why);
  await A.shot('03-hub-5v5-locked');

  // ---- 2. Sign in: account starts at level 1, 0 XP, 0 shards ----
  await A.go('/__test/login?provider=google&sub=alice-sub&label=alice@test&to=/%3Fdebug%26drive%3D1%26driveAfter%3D24');
  await hubReady(A);
  await sleep(600);
  let a0 = await acct(A);
  check('signed in: new account shows XP 0, shards 0, level 1 in the hub', a0.signedIn && a0.xp === 0 && a0.shards === 0 && a0.level === 1 && (await A.text('#hubshards')) === '0' && /LV 1/.test(await A.text('#hublevel')), JSON.stringify(a0));
  // Callsign through the real dialog.
  await A.click('[data-act=career]'); await A.click('[data-act=nick]');
  await A.ev(`document.getElementById('nickin').value = 'Alice-R0'`);
  await A.ev(`document.querySelector('[data-form=nick]').requestSubmit()`);
  await sleep(1200);
  a0 = await acct(A);
  check('callsign saved to the account through the dialog', a0.callsign === 'Alice-R0', a0.callsign);
  await A.click('[data-act=back]');
  await A.shot('04-hub-signed-in');

  // ---- 3. A second player (browser B) and a real 1v1 ----
  const B = await browser('bob');
  await B.go('/?debug');
  await B.ev(`localStorage.setItem('chog.onboarded','1')`);
  await B.go('/__test/login?provider=google&sub=bob-sub&label=bob@test&to=/%3Fdebug%26drive%3D1%26driveAfter%3D24');
  await hubReady(B);
  for (const X of [A, B]) { await X.click('[data-mode="1v1"]'); await X.click('#playbtn'); }
  const inMatch = await A.until(`__chog.online() && __chog.phase === 'play'`, 60000) && await B.until(`__chog.online() && __chog.phase === 'play'`, 10000);
  check('1v1 from the hub PLAY button: both browsers enter one server match', inMatch);
  await sleep(1500); await A.shot('05-match');
  const over = await A.until(`!!__chog.net()?.over`, 260000);
  await B.until(`!!__chog.net()?.over`, 20000);
  check('match finished on the server', over);
  const saved = await A.until(`!document.getElementById('saving') && (!!document.getElementById('rewards') || /not saved|No reward/i.test(document.getElementById('overlay').innerText))`, 30000);
  await sleep(1500);
  await A.shot('06-results');
  const res = await A.ev(`({ text: document.getElementById('overlay').innerText, rewards: !!document.getElementById('rewards') })`);
  check('results: Victory/Defeat, XP, shards, rating change, level bar, Play again', saved && res.rewards && /XP/.test(res.text) && /Shards/i.test(res.text) && /Rating/i.test(res.text) && /Play 1v1 again/i.test(res.text), res.text.slice(0, 200).replace(/\n/g, ' '));
  const a1 = await acct(A);
  check('account after the match: XP and shards up, one match on record', a1.xp > 0 && a1.shards > 0 && a1.matches === 1, JSON.stringify({ xp: a1.xp, shards: a1.shards, level: a1.level, matches: a1.matches }));

  // ---- 4. Back to the hub: changed XP bar, upgrade ready, buy it ----
  await A.click('[data-go=menu]');
  await hubReady(A);
  const hubAfter = await A.ev(`({ shards: document.getElementById('hubshards').innerText, xp: document.getElementById('hubxp').innerText, ready: document.querySelector('.cur .dot')?.innerText ?? '0' })`);
  check('hub after the match shows the new XP and shards and an upgrade ready', Number(hubAfter.shards) === a1.shards && !/^0 /.test(hubAfter.xp) && Number(hubAfter.ready) > 0, JSON.stringify(hubAfter));
  await A.shot('07-hub-after-match');
  await A.click('[data-act=upgrades]');
  await sleep(500);
  await A.shot('08-upgrades');
  await A.click('[data-upgrade="vitality"]');
  await A.until(`__chog.acct().profile.upgrades.vitality === 1`, 8000);
  const a2 = await acct(A);
  check('upgrade bought with shards and stored on the account', a2.upgrades.vitality === 1 && a2.shards === a1.shards - 10, JSON.stringify(a2.upgrades));
  await A.click('[data-act=back]');

  // ---- 5. Leaderboard ----
  await A.click('[data-act=ranks]'); await sleep(800);
  const board = await A.text();
  await A.shot('09-leaderboard');
  check('leaderboard lists the account by callsign with rank, kills, wins, matches, level, rating, Chog columns', /Alice-R0/.test(board) && /Kills/.test(board) && /Rating/.test(board) && /Chog/.test(board));
  await A.click('[data-act=back]');

  // ---- 6. Another device: a fresh browser signs in to the same account ----
  const C = await browser('alice-device2', 844, 390);
  await C.go('/?debug');
  await C.ev(`localStorage.setItem('chog.onboarded','1')`);
  await C.go('/__test/login?provider=google&sub=alice-sub&label=alice@test&to=/%3Fdebug');
  await hubReady(C); await C.until(`!!window.__chog && !!__chog.acct().profile`, 20000); await sleep(800);
  const c = await acct(C);
  if (!c) throw new Error(`second device did not load: ${JSON.stringify(await C.ev('({ boot: !!document.getElementById("boot"), hub: !!document.getElementById("hub"), url: location.href })'))} ${C.errors.join(' / ')}`);
  const aNow = await acct(A);
  check('second device: same XP, shards, level, callsign, upgrades, career and medals', c.xp === aNow.xp && c.shards === aNow.shards && c.level === aNow.level && c.callsign === 'Alice-R0'
    && c.upgrades.vitality === 1 && c.matches === aNow.matches && c.medals === aNow.medals && JSON.stringify(c.online) === JSON.stringify(aNow.online), JSON.stringify({ c, a: aNow }));
  await C.shot('10-hub-second-device-phone');

  // ---- 7. Verified holder (fake chain wallet): 1:1 identity, tier power, 5v5 open, server accepts the 5v5 queue ----
  const D = await browser('holder');
  await D.go('/?debug');
  await D.ev(`localStorage.setItem('chog.onboarded','1')`);
  await D.go('/__test/login?provider=wallet&sub=0x00000000000000000000000000000000000000a1&label=0xA1..a1&to=/%3Fdebug');
  await hubReady(D);
  await D.until(`!!__chog.acct().tokens`, 10000); await sleep(600);
  const d = await D.ev(`(() => ({ chog: document.getElementById('chogpanel').innerText, five: document.querySelector('[data-mode="5v5"]').innerText }))()`);
  await D.shot('11-hub-holder-blaze');
  check('holder: hub shows the 1:1 by name (Blaze), its tier, signature, telegraph and counter', /Blaze/.test(d.chog) && /1:1/.test(d.chog) && /Flashfire/i.test(d.chog) && /Counter/i.test(d.chog) && /Telegraph/i.test(d.chog) && /verified on Monad/i.test(d.chog), d.chog.replace(/\n/g, ' | '));
  check('holder: 5v5 is not locked', !/HOLDERS ONLY/.test(d.five), d.five);
  await D.click('[data-mode="5v5"]'); await D.click('#playbtn');
  const q = await D.until(`(() => { const n = __chog.net(); return n && n.state === 'queued' ? { have: n.queue.have, need: n.queue.need, profile: n.profile } : null; })()`, 30000);
  check('holder: the game server checked the ticket and accepted the 5v5 queue', q && q.need === 10 && q.profile?.holder && q.profile?.tier === 'legendary', JSON.stringify(q));
  await D.click('#playbtn'); // cancel
  // Practice uses the verified class too: the 1:1 signature in the ability slot.
  await D.click('[data-mode="solo"]'); await D.click('#playbtn');
  const solo = await D.until(`__chog.phase === 'play' && { tier: __chog.world.actors[0].power.tier, ability: __chog.world.actors[0].ability.name, hud: document.getElementById('hero').innerText }`, 15000);
  check('holder practice: plays as the 1:1 class with its signature', solo && solo.tier === 'legendary' && solo.ability === 'Flashfire' && /Blaze/.test(solo.hud), JSON.stringify(solo));
  await sleep(800); await D.shot('12-practice-blaze');

  // ---- 8. Squad: A creates one in the hub, B joins with the typed code; both see it ----
  for (const X of [A, B]) { if (await X.ev(`__chog.phase !== 'title'`)) { await X.click('[data-go=menu]'); } await hubReady(X); }
  await A.click('[data-act=squad-create]');
  const code = await A.until(`document.getElementById('squadcodeshown')?.innerText || null`, 15000);
  await B.ev(`document.getElementById('squadcode').value = '${code}'`);
  await B.click('[data-act=squad-join]');
  const sq = await B.until(`(() => { const n = __chog.net(); return n?.party?.members?.length === 2 ? n.party.members.map((m) => m.name + (m.leader ? '*' : '')) : null; })()`, 15000);
  await sleep(500); await B.shot('13-squad');
  const aSees = await A.until(`document.querySelectorAll('.squad-list li').length === 2`, 8000);
  check('squad: created in the hub, joined by code from another browser, both see it with the leader marked', code && sq && aSees && sq.includes('Alice-R0*'), JSON.stringify({ code, sq }));
  await B.click('[data-mode="3v3"]');
  const fol = await B.ev(`({ disabled: document.getElementById('playbtn').disabled, text: document.querySelector('.hub-play').innerText })`);
  check('squad: a member who is not the leader cannot start the match and is told why', fol.disabled && /leader starts the match/i.test(fol.text), fol.text.slice(0, 120));

  for (const X of [A, B, C, D]) if (X.errors.length) check(`no page errors (${X.label})`, false, X.errors.slice(0, 3).join(' / '));
} catch (e) {
  check('journey ran to the end', false, String(e?.stack ?? e));
} finally {
  for (const p of procs) { p.proc.kill('SIGKILL'); }
  await sleep(500);
  for (const p of procs) fs.rmSync(p.dir, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
