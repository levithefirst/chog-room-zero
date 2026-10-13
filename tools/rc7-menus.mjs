// RC-7 menus, profile, medals, settings and after-action report (headless swiftshader Chrome; emulated viewports and
// touch; NOT physical devices). Each viewport runs in a fresh tab through real clicks or taps (touch points written in
// stage coordinates and turned like the CSS turns the stage): boot screen -> How to play (diagram) -> menu ->
// player card (callsign validation + save, favourite, medals tab) -> settings (volume, stick size, quality, tips,
// reset confirm) -> Play -> operator select -> a forced clear -> results with medals earned -> Menu -> medals
// persisted after a reload. Screenshots of every screen go to shotDir for the visual review against the reference.
// Usage: node tools/rc7-menus.mjs <baseUrl> <outJson> [shotDir]   (ONLY=desktop,phone-portrait to pick)
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [base, outFile, shotDir] = process.argv.slice(2);
const port = 9500 + Math.floor(Math.random() * 90);
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let t;
for (let i = 0; i < 50 && !t; i++) { await sleep(200); try { t = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === 'page'); } catch {} }
let ws; let id = 0; const P = new Map(); let errors = []; let failed = [];
async function attach(target) {
  ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && P.has(m.id)) { P.get(m.id)(m.result ?? m.error); P.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    // /api/auth/* is absent on a plain static server (local preview): a 404 there is expected, anything else is not.
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400 && !m.params.response.url.includes('/api/auth/')) failed.push(`${m.params.response.status} ${m.params.response.url}`); };
}
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; P.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; };
async function freshTab() {
  const nt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  ws?.close(); await attach(nt); await cmd('Runtime.enable'); await cmd('Network.enable'); errors = []; failed = [];
}
const view = (w, h, touch) => Promise.all([cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: touch ? 2 : 1, mobile: touch, screenOrientation: { type: h > w ? 'portraitPrimary' : 'landscapePrimary', angle: h > w ? 0 : 90 } }),
  cmd('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 0 })]);
let S = { rotated: false, w: 0, h: 0, screenW: 0 };
const readStage = async () => (S = await ev('__chog.stage()'));
const toScr = (x, y) => (S.rotated ? { x: S.screenW - y, y: x } : { x, y });
// Element centre and whether it is fully inside the stage, in stage coordinates.
const box = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'nearest',inline:'nearest'});const b=e.getBoundingClientRect();if(!b.width)return null;const S=__chog.stage();
  const r=S.rotated?{x:b.top,y:S.screenW-b.right,r:b.bottom,b:S.screenW-b.left}:{x:b.left,y:b.top,r:b.right,b:b.bottom};
  return {cx:(r.x+r.r)/2,cy:(r.y+r.b)/2,inside:r.x>=-1&&r.y>=-1&&r.r<=S.w+1&&r.b<=S.h+1}})()`);
let T = false;
async function press(sel) {
  const b = await box(sel); if (!b) return false;
  if (T) { const p = toScr(b.cx, b.cy); await cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 90 }] }); await cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  else { await cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.cx, y: b.cy }); await cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.cx, y: b.cy, button: 'left', clickCount: 1 }); await cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.cx, y: b.cy, button: 'left', clickCount: 1 }); }
  await sleep(250); return true;
}
const phase = () => ev('__chog.phase');
async function waitPhase(want, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await phase()) === want) return true; await sleep(25); } return false; }
const shot = async (name) => { if (!shotDir) return; const s = await cmd('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${shotDir}/rc7-${name}.png`, Buffer.from(s.data, 'base64')); };
// Nothing on screen may overflow the stage sideways, and no text may be clipped by the card.
const overflow = () => ev(`(()=>{const S=__chog.stage();const o=document.getElementById('overlay');const bad=[];for(const e of o.querySelectorAll('button,h1,h2,h3,table,svg')){const b=e.getBoundingClientRect();if(!b.width)continue;
  const r=S.rotated?{x:b.top,r:b.bottom}:{x:b.left,r:b.right};if(r.x<-2||r.r>S.w+2)bad.push((e.dataset.act||e.dataset.go||e.tagName)+':'+Math.round(r.x)+'..'+Math.round(r.r))}return bad.slice(0,5)})()`);

const VIEWPORTS = [
  { name: 'desktop-1440x900', w: 1440, h: 900, touch: false },
  { name: 'laptop-1280x720', w: 1280, h: 720, touch: false },
  { name: 'tablet-1180x820', w: 1180, h: 820, touch: true },
  { name: 'phone-landscape-844x390', w: 844, h: 390, touch: true },
  { name: 'phone-landscape-667x375', w: 667, h: 375, touch: true },
  { name: 'phone-portrait-390x844', w: 390, h: 844, touch: true },
  { name: 'phone-portrait-375x667', w: 375, h: 667, touch: true },
];
const only = (process.env.ONLY ?? '').split(',').filter(Boolean);
const rows = [];
for (const V of VIEWPORTS.filter((v) => !only.length || only.some((o) => v.name.includes(o)))) {
  const R = { viewport: V.name, input: V.touch ? 'touch (emulated)' : 'mouse', checks: {}, notes: [] };
  const ok = (k, pass, data) => { R.checks[k] = { pass: !!pass, ...(data === undefined ? {} : { data }) }; };
  try {
    await freshTab(); await view(V.w, V.h, V.touch); T = V.touch;
    await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(2000);
    await ev('localStorage.clear()'); await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(3500);
    await readStage();
    // 1. Boot screen gone, How to play with the controls diagram.
    const h0 = await ev(`({boot:!!document.getElementById('boot'),h2:document.querySelector('#overlay h2')?.textContent,svg:!!document.querySelector('#overlay svg.controls'),aria:document.querySelector('#overlay svg.controls')?.getAttribute('aria-label')})`);
    ok('boot screen finished; How to play shows the controls diagram for this input', !h0.boot && h0.h2 === 'Clear Room Zero' && h0.svg && (V.touch ? /thumb/.test(h0.aria) : /WASD/.test(h0.aria)), h0);
    ok('How to play: Got it inside the stage', (await box('[data-act="howto-close"]'))?.inside);
    await shot(`${V.name}-1-howto`);
    await press('[data-act="howto-close"]');
    // 2. Main menu.
    const m = await ev(`({h1:document.querySelector('#overlay h1')?.textContent,h2:!!document.querySelector('#overlay h2'),chip:document.querySelector('.player-chip')?.innerText.replace(/\\s+/g,' '),nav:[...document.querySelectorAll('.navbtn')].map(b=>b.dataset.act)})`);
    const play = await box('[data-go="start"].play');
    ok('menu: title h1, player chip asks for a callsign, nav (card, medals, how to, demo, settings), Play inside the stage', /ROOM ZERO/.test(m.h1) && !m.h2 && /Guest-\w{4}/.test(m.chip) && /callsign/i.test(m.chip)
      && ['profile', 'medals', 'howto', 'demo', 'settings'].every((x) => m.nav.includes(x)) && play?.inside, { ...m, play });
    ok('menu: nothing overflows the stage', (await overflow()).length === 0, await overflow());
    await shot(`${V.name}-2-menu`);
    // 3. Player card + callsign.
    await press('.player-chip');
    ok('player card opens (Player tab, career rows, guest chip)', await ev(`!!document.querySelector('.screen.profile .pcard') && document.querySelector('.tab.on')?.dataset.tab==='player' && /no global leaderboard/.test(document.querySelector('.tabbody').innerText)`));
    await shot(`${V.name}-3-card`);
    await press('[data-act="nick"]');
    const typeNick = async (txt) => { await ev(`(()=>{const i=document.getElementById('nickin');i.focus();i.value='';})()`); await cmd('Input.insertText', { text: txt }); await press('[data-act="nick-save"]'); };
    await typeNick('ab');
    const bad = await ev(`({err:document.getElementById('nickerr')?.textContent,view:__chog.view(),nick:__chog.profile().nickname})`);
    ok('callsign: "ab" is refused with a reason, nothing saved', /At least 3/.test(bad.err) && bad.view === 'nick' && bad.nick === null, bad);
    await shot(`${V.name}-4-callsign-error`);
    await typeNick('Night  Owl');
    const saved = await ev(`({ok:!!document.getElementById('nickok'),nick:__chog.profile().nickname,stored:JSON.parse(localStorage.getItem('chog-room-zero:profile:v1')).nickname})`);
    await sleep(900);
    const back = await ev(`({view:__chog.view(),name:document.querySelector('.pcard-head b')?.textContent})`);
    ok('callsign: "Night  Owl" saved as "Night Owl", shows "Saved", returns to the card', saved.ok && saved.nick === 'Night Owl' && saved.stored === 'Night Owl' && back.view === 'profile' && back.name === 'Night Owl', { saved, back });
    // Favourite operator and tabs.
    await press('[data-tab="operators"]');
    await press('[data-fav="wick"]');
    ok('operators tab: set Wick as favourite (card shows it, saved)', await ev(`__chog.profile().favourite==='wick' && /Favourite: Wick/.test(document.querySelector('.pcard-op').textContent)`));
    await shot(`${V.name}-5-operators`);
    await press('[data-tab="medals"]');
    const md = await ev(`({n:document.querySelectorAll('.medal').length,locked:document.querySelectorAll('.medal:disabled').length,head:document.querySelector('.tabbody h3').innerText})`);
    ok('medals tab: 12 medals, all locked on a fresh device (0/12)', md.n === 12 && md.locked === 12 && /0\/12/.test(md.head), md);
    await shot(`${V.name}-6-medals-locked`);
    await press('[data-tab="loadout"]');
    ok('loadout tab: real weapon and ability numbers, no upgrades', await ev(`/Magazine \\/ reserve/.test(document.querySelector('.tabbody').innerText) && /no upgrades/.test(document.querySelector('.tabbody').innerText)`));
    await press('[data-act="back"]');
    // 4. Settings.
    await press('[data-act="settings"]');
    await sleep(500);
    await shot(`${V.name}-7-settings`);
    const v0 = await ev('__chog.volume()');
    await press('[data-set="volume"][data-val="down"]');
    await press('[data-set="stick"][data-val="large"]');
    await press('[data-set="quality"][data-val="low"]');
    await press('[data-set="tips"]');
    const st = await ev(`({vol:__chog.volume(),stick:__chog.stick(),res:__chog.resolution(),s:__chog.settings(),saved:JSON.parse(localStorage.getItem('chog-room-zero:settings:v1'))})`);
    ok('settings: volume -10%, stick L = 72 px, quality Low = 1x, tips off; applied live and saved', Math.abs(st.vol - (v0 - 0.1)) < 1e-9 && st.stick === 72 && st.res === 1 && st.s.tips === false && st.saved.quality === 'low' && st.saved.stick === 'large', { v0, ...st });
    await press('[data-set="tips"]');
    await press('[data-set="stick"][data-val="medium"]');
    await press('[data-set="quality"][data-val="medium"]');
    const acct = await ev(`({text:document.querySelector('.settings')?.textContent.replace(/\\s+/g,' ').match(/Account.*?Data/)?.[0],build:document.getElementById('buildsha')?.textContent,vib:document.querySelector('[data-set="vibration"]')?.disabled})`);
    ok('settings: account section is honest when there is no auth server here; build id shown', /not available at this address|Sign in with Google|not set up yet/.test(acct.text ?? '') && !!acct.build, acct);
    await press('[data-act="reset"]');
    const conf = await ev(`!!document.querySelector('[data-act="reset-yes"]')`);
    await press('[data-act="reset-no"]');
    ok('settings: Reset progress asks to confirm first; Keep cancels', conf && (await ev(`__chog.profile().nickname==='Night Owl'`)));
    ok('settings: nothing overflows the stage', (await overflow()).length === 0, await overflow());
    await press('[data-act="back"]');
    // 5. Play -> select -> a forced clear -> results.
    await press('[data-go="start"].play');
    const sel = await ev(`({cards:document.querySelectorAll('.hero .portrait').length,career:document.querySelector('.hero .career')?.textContent,fav:!!document.querySelector('.hero[data-hero="wick"] .fav')})`);
    ok('operator select: 4 cards with portraits, career line, favourite star; Deploy inside the stage', sel.cards === 4 && /Not played yet/.test(sel.career) && sel.fav && (await box('[data-go="pick"]'))?.inside, sel);
    await shot(`${V.name}-8-select`);
    await press('[data-go="pick"]');
    ok('Deploy -> play', await waitPhase('play'));
    await sleep(400);
    await shot(`${V.name}-9-play`);
    await ev(`(()=>{const w=__chog.world,p=w.actors[0];p.hp=1e9;for(const b of w.actors.slice(1)){b.hp=1;b.armor=0;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])w.bullets.push({x:b.x-dx*0.3,y:b.y-dy*0.3,ox:b.x-dx*0.3,oy:b.y-dy*0.3,dx,dy,life:1,owner:0,weapon:p.weapon,alive:true})}})()`);
    ok('forced clear reaches results', await waitPhase('results', 6000));
    await sleep(500);
    const res = await ev(`({h2:document.querySelector('#overlay h2')?.textContent,rows:[...document.querySelectorAll('table.stats td:first-child')].map(e=>e.textContent),earned:[...document.querySelectorAll('.earned-m b')].map(e=>e.textContent),pb:document.getElementById('resultpb')?.textContent,medals:Object.keys(__chog.medals())})`);
    ok('results: Room cleared, Rooms cleared 1/1 row, medals earned listed (First Blood, Lights On), personal-not-global note', res.h2 === 'Room cleared' && res.rows.includes('Rooms cleared') && res.earned.includes('First Blood') && res.earned.includes('Lights On')
      && res.medals.includes('first-blood') && /not a global leaderboard/.test(res.pb), res);
    await shot(`${V.name}-10-results`);
    await sleep(800);
    await press('[data-go="menu"]');
    ok('results -> Menu returns to the main menu', (await phase()) === 'title' && (await ev(`!!document.querySelector('.screen.menu')`)));
    // 6. Persistence after a reload.
    await cmd('Page.navigate', { url: `${base}/?debug&nooverlay` }); await sleep(3500); await readStage();
    const per = await ev(`({chip:document.querySelector('.player-chip b')?.textContent,medals:document.querySelector('[data-act="medals"] .num')?.textContent})`);
    ok('after reload: callsign and medals kept', per.chip === 'Night Owl' && /^[2-9]\/12$|^1[0-2]\/12$/.test(per.medals ?? ''), per);
    await press('[data-act="medals"]');
    await press('.medal.got');
    ok('an earned medal pins to the player card', await ev(`__chog.profile().pinned.length===1 && document.querySelectorAll('.pins .pin:not(.empty)').length===1`));
    await shot(`${V.name}-11-medals-earned`);
    // 7. In-match (RC-7, reference pages 6-9): a needed pickup gets a tip after the opening instruction, collecting
    // it names what it gave, and the tip is not repeated. Bots parked off the map; the player is placed by the hook.
    if (V.name.startsWith('desktop') || V.name.includes('844x390')) {
      await press('[data-act="back"]').catch(() => {});
      await ev(`__chog.go('start')`); await sleep(300); await press('[data-go="pick"]'); await waitPhase('play');
      const ticks = (n) => ev(`(async()=>{const w=__chog.world,t0=w.tick;for(let i=0;i<800&&w.tick-t0<${n};i++)await new Promise(r=>setTimeout(r,25));return w.tick-t0})()`);
      const place = await ev(`(()=>{const w=__chog.world,p=w.actors[0],L=w.level,lab=__chog.lab;for(const b of w.actors.slice(1)){b.x=b.y=-40;b.vx=b.vy=0}
        p.armor=0;const pk=w.pickups.find(q=>q.kind==='armor');for(const [dx,dy] of [[-2,0],[-2.5,0.5],[-2.5,-0.5],[2,0],[0,2],[0,-2]]){const x=pk.x+dx,y=pk.y+dy;
        if(lab.walkable(L.tiles[Math.floor(y)*L.w+Math.floor(x)])&&lab.sightClear(L,x,y,pk.x,pk.y)){p.x=x;p.y=y;p.vx=p.vy=0;p.facing=Math.atan2(pk.y-y,pk.x-x);return {ok:true,x,y,pk:[pk.x,pk.y],facing:p.facing}}}return {ok:false}})()`);
      // Look at it: the tip only names a pickup in the lamp. The hold below keeps the mouse on the pickup (desktop) or the
      // facing set (touch, aim thumb idle).
      // Hold the player still next to the pickup until the tip window opens (t >= 7 s).
      await ev(`window.__hold=setInterval(()=>{const w=__chog.world,p=w.actors[0];p.x=${place.x ?? 0};p.y=${place.y ?? 0};p.vx=p.vy=0;p.armor=0;${T ? `p.facing=${place.facing ?? 0};` : `const pk=w.pickups.find(q=>q.kind==='armor'),sp=__chog.renderer.toScreen(pk.x,pk.y);window.dispatchEvent(new PointerEvent('pointermove',{clientX:sp.x,clientY:sp.y,pointerType:'mouse'}));`}for(const b of w.actors.slice(1)){b.x=b.y=-40}},16)`);
      await ticks(Math.max(0, Math.ceil((7.6 - (await ev('__chog.world.tick/60'))) * 60)));
      // The movement pill shows for 6 s and tips keep a 3 s gap after any pill, so the first tip lands ~9 s in.
      const tip = await ev(`(async()=>{const h=document.getElementById('hint');for(let i=0;i<400&&!(/Armour/.test(h.textContent)&&+getComputedStyle(h).opacity>0.5);i++)await new Promise(r=>setTimeout(r,25));
        return {text:h.textContent,op:+getComputedStyle(h).opacity,tips:__chog.tips(),t:+(__chog.world.tick/60).toFixed(1)}})()`);
      await shot(`${V.name}-12-tip`);
      await ev(`clearInterval(window.__hold);(()=>{const w=__chog.world,p=w.actors[0],pk=w.pickups.find(q=>q.kind==='armor');p.x=pk.x;p.y=pk.y;p.vx=p.vy=0})()`);
      await ticks(3);
      const got = await ev(`({toast:document.getElementById('toast').textContent,collects:__chog.fx.collects.length,run:__chog.runFacts(),armor:__chog.world.actors[0].armor})`);
      ok('in-match: next to a needed armour pickup after 7 s the Armour tip shows (once, saved); walking over it toasts "+35 ARMOUR" with a ring', place.ok && /Armour/.test(tip.text) && tip.op > 0.5 && tip.tips.includes('pickup-armor')
        && /\+35 ARMOUR/.test(got.toast) && got.collects > 0 && got.run.pickups === 1 && got.armor > 0, { place, tip, got });
    }
    ok('console errors: none', errors.length === 0, errors.slice(0, 3));
    ok('failed requests: none (auth 404s on a static server excluded)', failed.length === 0, failed.slice(0, 3));
  } catch (e) { R.notes.push('exception: ' + (e?.stack ?? e)); }
  R.pass = Object.values(R.checks).every((c) => c.pass) && !R.notes.length;
  rows.push(R);
  console.log(`${R.pass ? 'PASS' : 'FAIL'} ${V.name}: ${Object.entries(R.checks).filter(([, c]) => !c.pass).map(([k, c]) => `${k} ${JSON.stringify(c.data ?? '')}`.slice(0, 400)).join(' | ') || `all ${Object.keys(R.checks).length} checks`} ${R.notes.join(' ')}`);
}
fs.writeFileSync(outFile, JSON.stringify({ base, label: 'headless Chrome (swiftshader), emulated viewports/touch; NOT physical devices', rows }, null, 1));
console.log(`menus: ${rows.filter((r) => r.pass).length}/${rows.length} viewports pass`);
chrome.kill(); process.exit(0);
