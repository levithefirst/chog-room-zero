// Full-screen tactical map in real headless Chrome against the local full stack (owner 2026-10-20):
// - the HUD MAP button on every requested viewport (phones upright are the turned landscape stage), never overlapping
//   another HUD control, reachable by mouse, touch and the M key;
// - the map opens over a running match (the sim keeps going), shows each of the five locations, you and your squad,
//   no hostile at spawn, and closes back to the exact same match: same world object, same canvas, no reload;
// - nothing pressed while it is open moves, aims or fires the operator; wheel, drag and pinch zoom and pan it;
// - online 1v1 and 3v3: opening and closing never reconnects (same socket, same room) and shows only the server's view.
// Emulated (NOT devices). Usage: node tools/tm-map.mjs http://localhost:8790 [shotDir]   (ONLINE=0 skips online; ONLY=views|desk|phone|online runs one part)
import { browser, sleep } from './cdp.mjs';
const [base, shotDir] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, ok ? 260 : 1400)}` : ''}`); return !!ok; };
const open = [];
// ONLY=views|desk|phone|online runs one part.
const ONLY = process.env.ONLY;
const MAPS = ['room-zero', 'office', 'supermarket', 'metro', 'construction'];
const HUD = ['vitals', 'mapbtn', 'foes', 'sys', 'weapon', 'ability', 'nade', 'reload'];

// HUD controls that are shown, as viewport rects; overlaps between any two (2 px slack).
const HUD_PROBE = `(() => { const ids = ${JSON.stringify(HUD)}; const r = ids.map((i) => [i, document.getElementById(i)]).filter(([, e]) => e && e.offsetParent !== null && getComputedStyle(e).display !== 'none')
  .map(([i, e]) => [i, e.getBoundingClientRect()]).filter(([, b]) => b.width > 0);
  const out = []; for (let a = 0; a < r.length; a++) for (let b = a + 1; b < r.length; b++) { const [ia, A] = r[a], [ib, B] = r[b];
    if (A.left < B.right - 2 && B.left < A.right - 2 && A.top < B.bottom - 2 && B.top < A.bottom - 2) out.push(ia + 'x' + ib); }
  const off = r.filter(([, b]) => b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1).map(([i]) => 'off ' + i);
  const m = document.getElementById('mapbtn').getBoundingClientRect();
  return { problems: [...out, ...off], map: { w: Math.round(m.width), h: Math.round(m.height) } }; })()`;
// The map's own controls: all on screen, none overlapping, buttons big enough to hit.
const MAP_PROBE = `(() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); const parts = { head: q('#tmap .tm-title'), close: q('#tm-close'), legend: q('#tmap .tm-legend'), ctl: q('#tmap .tm-ctl') };
  const out = []; const ks = Object.keys(parts);
  for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++) { const A = parts[ks[a]], B = parts[ks[b]]; if (A.left < B.right - 1 && B.left < A.right - 1 && A.top < B.bottom - 1 && B.top < A.bottom - 1) out.push(ks[a] + 'x' + ks[b]); }
  for (const k of ks) { const b = parts[k]; if (b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1) out.push('off ' + k); }
  for (const s of ['#tm-close', '#tm-in', '#tm-out', '#tm-fit']) { const b = q(s); if (Math.min(b.width, b.height) < 40) out.push('small ' + s); }
  const se = document.scrollingElement; if (se.scrollWidth > innerWidth + 1 || se.scrollHeight > innerHeight + 1) out.push('page scrolls');
  const c = document.getElementById('tmapc'); return { problems: out, canvas: [c.width, c.height], css: [Math.round(c.getBoundingClientRect().width), Math.round(c.getBoundingClientRect().height)] }; })()`;
const STATE = `(() => { const t = __chog.tmap(); const m = t.markers; const c = (k) => m.filter((x) => x.kind === k).length;
  const l = __chog.world.level, st = document.getElementById('tmap'), W = st.offsetWidth, H = st.offsetHeight, v = t.view;
  // The drawn map in stage px: inside the stage, and filling most of it one way (fit, aspect kept).
  const drawn = v ? { x0: v.ox, y0: v.oy, x1: v.ox + l.w * v.k, y1: v.oy + l.h * v.k } : null;
  const fits = !!drawn && drawn.x0 >= -1 && drawn.y0 >= -1 && drawn.x1 <= W + 1 && drawn.y1 <= H + 1 && Math.max((drawn.x1 - drawn.x0) / W, (drawn.y1 - drawn.y0) / H) > 0.6;
  return { open: t.open, phase: __chog.phase, fits, drawn: drawn && [Math.round(drawn.x0), Math.round(drawn.y0), Math.round(drawn.x1), Math.round(drawn.y1)], stage: [W, H], you: c('you'), mate: c('mate'), hostile: c('hostile'), enemy: c('enemy'), trace: c('trace'), visor: c('visor'), k: t.view?.k, ox: t.view?.ox, oy: t.view?.oy, tick: __chog.world.tick,
    hidden: document.getElementById('tmap').hidden }; })()`;

async function solo(b, id) {
  await b.ev(`localStorage.setItem('chog.map', ${JSON.stringify(id)})`);
  await b.go('/?debug'); await b.hub();
  await b.click('[data-mode="solo"]'); await b.click('#playbtn');
  await b.until(`__chog.phase === 'play' && __chog.world.mapId === ${JSON.stringify(id)}`, 25000);
  await sleep(900);
}
async function quit(b) { await b.ev(`__chog.go('pause')`); await sleep(250); await b.ev(`__chog.go('quit')`); await b.hub(); }
const key = (b, code, type) => b.cmd('Input.dispatchKeyEvent', { type, code, key: code === 'KeyM' ? 'm' : code === 'KeyW' ? 'w' : code === 'Escape' ? 'Escape' : '', windowsVirtualKeyCode: code === 'KeyM' ? 77 : code === 'KeyW' ? 87 : code === 'Escape' ? 27 : 0 });

try {
  // ---- every viewport: the button, open, close, layout ----
  const VIEWS = [
    { label: 'p320x568', w: 320, h: 568, mobile: true, touch: true }, { label: 'p375x667', w: 375, h: 667, mobile: true, touch: true },
    { label: 'p390x844', w: 390, h: 844, mobile: true, touch: true }, { label: 'p430x932', w: 430, h: 932, mobile: true, touch: true },
    { label: 'phone-land', w: 844, h: 390, mobile: true, touch: true }, { label: 'tab-port', w: 820, h: 1180, mobile: true, touch: true },
    { label: 'tab-land', w: 1180, h: 820, mobile: true, touch: true }, { label: 'd1280', w: 1280, h: 720 }, { label: 'd1440', w: 1440, h: 900 }, { label: 'd1920', w: 1920, h: 1080 },
  ];
  for (const view of ONLY && ONLY !== 'views' ? [] : VIEWS) {
    const b = await browser(`tm-${view.label}`, { base, shotDir, ...view });
    open.push(b);
    await b.go('/?debug'); await b.ev(`localStorage.setItem('chog.onboarded','1')`);
    await solo(b, view.label === 'd1440' ? 'office' : 'metro');
    // A marker that only survives if the page is never reloaded, and the objects that must survive the map.
    await b.ev(`window.__keep = 1; window.__w = __chog.world; window.__cv = document.querySelector('#app canvas'); window.__hud = document.getElementById('hud');
      window.__mut = 0; new MutationObserver((ms) => { for (const m of ms) if (m.removedNodes.length) window.__mut++; }).observe(document.getElementById('app'), { childList: true, subtree: true });`);
    const hud = await b.ev(HUD_PROBE);
    await b.shot('hud');
    check(`${view.label}: MAP button on the HUD, on screen, overlapping no other control`, hud && hud.problems.length === 0 && hud.map.h >= 36, JSON.stringify(hud));
    const t0 = await b.ev(`__chog.world.tick`);
    await b.click('#mapbtn');
    await b.until(`__chog.tmap().open`, 3000);
    await sleep(500);
    const s = await b.ev(STATE);
    const lay = await b.ev(MAP_PROBE);
    await b.shot('map');
    check(`${view.label}: MAP opens full screen over the running match (sim still stepping)`, s.open && !s.hidden && s.phase === 'play' && s.tick > t0 && lay.canvas[0] > 0, JSON.stringify(s));
    check(`${view.label}: the whole location is drawn on screen, aspect kept, filling most of it`, s.fits, JSON.stringify({ drawn: s.drawn, stage: s.stage }));
    check(`${view.label}: map layout: title, RETURN, legend and zoom all on screen, none overlapping, buttons >= 40 px, no page scroll`, lay.problems.length === 0, JSON.stringify(lay));
    check(`${view.label}: you and your two AI teammates are on the map; no hostile at spawn`, s.you === 1 && s.mate === 2 && s.hostile + s.enemy + s.trace + s.visor === 0, JSON.stringify(s));
    await b.click('#tm-close');
    await sleep(300);
    const back = await b.ev(`({ open: __chog.tmap().open, phase: __chog.phase, keep: window.__keep, sameWorld: __chog.world === window.__w, sameCanvas: document.querySelector('#app canvas') === window.__cv, sameHud: document.getElementById('hud') === window.__hud, mut: window.__mut, hudOn: document.getElementById('hud').classList.contains('on'), marks: __chog.tmap().markers.length })`);
    check(`${view.label}: RETURN closes it back to the same match (same world, canvas and HUD; no reload; nothing of the map kept)`, !back.open && back.phase === 'play' && back.keep === 1 && back.sameWorld && back.sameCanvas && back.sameHud && back.mut === 0 && back.hudOn && back.marks === 0, JSON.stringify(back));
    check(`${view.label}: no page errors`, b.errors.length === 0, b.errors.join(' | '));
    await b.close(); open.splice(open.indexOf(b), 1);
  }

  // ---- desktop: the five locations, input gating, zoom and pan, keys, repeated open/close ----
  if (!ONLY || ONLY === 'desk') {
    const b = await browser('tm-desk', { base, shotDir, w: 1440, h: 900 });
    open.push(b);
    await b.go('/?debug'); await b.ev(`localStorage.setItem('chog.onboarded','1')`);
    for (const id of MAPS) {
      await solo(b, id);
      await key(b, 'KeyM', 'keyDown'); await key(b, 'KeyM', 'keyUp');
      await b.until(`__chog.tmap().open`, 3000);
      await sleep(400);
      const s = await b.ev(STATE);
      // The location drawn is the one in play: its name in the title, the level the sim walks on.
      const title = await b.ev(`document.getElementById('tm-name').textContent`);
      await b.shot(`map-${id}`);
      check(`desk: M opens the ${id} map, titled ${title}, you + 2 teammates, no hidden hostile`, s.open && s.you === 1 && s.mate === 2 && s.hostile + s.enemy + s.trace === 0 && title.length > 3, JSON.stringify({ ...s, title }));
      if (id === 'office') {
        // Hold W and click on the map for 1.2 s: the operator neither walks, turns to the cursor nor fires.
        const p0 = await b.ev(`(() => { const p = __chog.world.actors[0]; return { x: p.x, y: p.y, f: p.facing, shots: p.shots }; })()`);
        await key(b, 'KeyW', 'keyDown');
        for (let i = 0; i < 6; i++) { await b.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: 300 + i * 120, y: 500, button: 'left', clickCount: 1 }); await sleep(100); await b.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 300 + i * 120, y: 500, button: 'left', clickCount: 1 }); await sleep(100); }
        const p1 = await b.ev(`(() => { const p = __chog.world.actors[0]; return { x: p.x, y: p.y, f: p.facing, shots: p.shots }; })()`);
        await key(b, 'KeyW', 'keyUp');
        check('desk: nothing behind the map: W held and six clicks did not move, turn or fire the operator', Math.hypot(p1.x - p0.x, p1.y - p0.y) < 0.05 && Math.abs(p1.f - p0.f) < 0.01 && p1.shots === p0.shots, JSON.stringify({ p0, p1 }));
        // Wheel zooms about the cursor; drag pans; FIT resets.
        const v0 = await b.ev(STATE);
        await b.cmd('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 480, deltaX: 0, deltaY: -600 });
        // Headless frames here run ~10 fps with long spikes: wait for the input to land, never a fixed short sleep.
        await b.until(`__chog.tmap().view.k > ${v0.k * 1.5}`, 3000); await sleep(150);
        const v1 = await b.ev(STATE);
        check('desk: mouse wheel zooms in', v1.k > v0.k * 1.5, JSON.stringify({ k0: v0.k, k1: v1.k }));
        await b.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 500, button: 'left', clickCount: 1 });
        for (let i = 1; i <= 5; i++) { await b.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700 - i * 30, y: 500 - i * 15, buttons: 1 }); await sleep(30); }
        await b.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 550, y: 425, button: 'left', clickCount: 1 });
        await b.until(`__chog.tmap().view.ox < ${v1.ox - 100}`, 3000); await sleep(250);
        const v2 = await b.ev(STATE);
        check('desk: drag pans the zoomed map', Math.abs(v2.ox - v1.ox - -150) < 2 && Math.abs(v2.oy - v1.oy - -75) < 2, JSON.stringify({ dx: v2.ox - v1.ox, dy: v2.oy - v1.oy }));
        await b.shot('map-office-zoomed');
        await b.click('#tm-fit'); await sleep(150);
        const v3 = await b.ev(STATE);
        check('desk: FIT returns to the whole map', Math.abs(v3.k - v0.k) < 1e-6 && Math.abs(v3.ox - v0.ox) < 1e-6, JSON.stringify({ k0: v0.k, k3: v3.k }));
        await b.click('#tm-in'); await sleep(100);
        check('desk: + zooms in', (await b.ev(STATE)).k > v0.k * 1.4);
      }
      await key(b, 'Escape', 'keyDown'); await key(b, 'Escape', 'keyUp');
      await b.until(`!__chog.tmap().open`, 3000); await sleep(150);
      const shut = await b.ev(`({ open: __chog.tmap().open, phase: __chog.phase })`);
      check(`desk: Esc closes the ${id} map and stays in play (not the pause menu)`, !shut.open && shut.phase === 'play', JSON.stringify(shut));
      if (id === 'supermarket') {
        // Open and close 12 times in quick succession while playing: no reload, no remount, no stuck state.
        await b.ev(`window.__keep = 2; window.__w = __chog.world; window.__mut = 0; new MutationObserver((ms) => { for (const m of ms) if (m.removedNodes.length) window.__mut++; }).observe(document.getElementById('app'), { childList: true, subtree: true });`);
        for (let i = 0; i < 12; i++) { await b.click('#mapbtn'); await sleep(90); await b.click(i % 2 ? '#tm-close' : '#mapbtn'); await sleep(90); }
        const r = await b.ev(`({ open: __chog.tmap().open, keep: window.__keep, same: __chog.world === window.__w, mut: window.__mut, phase: __chog.phase, hidden: document.getElementById('tmap').hidden })`);
        check('desk: 12 quick open/close cycles: same match, nothing remounted, closed and in play at the end', !r.open && r.hidden && r.keep === 2 && r.same && r.mut === 0 && r.phase === 'play', JSON.stringify(r));
      }
      await quit(b);
    }
    // Combat: the scripted autopilot fights (Room Zero, Supermarket); the map opens and closes every 1.5 s through the
    // fight. Every live hostile mark must be a living bot at its real spot (seen, not guessed); frame rate holds.
    for (const id of ['room-zero', 'supermarket']) {
      await b.ev(`localStorage.setItem('chog.map', ${JSON.stringify(id)})`);
      await b.go('/?debug&autoplay=5'); await b.hub();
      await b.click('[data-mode="solo"]'); await b.click('#playbtn');
      await b.until(`__chog.phase === 'play' && __chog.world.mapId === ${JSON.stringify(id)}`, 25000);
      let seen = 0, wrong = [], opens = 0; const fpsOpen = [], fpsShut = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 50000 && (await b.ev(`__chog.phase`)) === 'play') {
        await sleep(900); fpsShut.push(await b.ev(`__chog.fps`));
        await b.click('#mapbtn'); opens++; await sleep(600);
        // Only while the map is open: the run can end between the loop check and the click (MAP does nothing outside
        // play), and then last() still holds the markers of the previous open, seconds old (a bot that has since died).
        // Each live mark must be a hostile you know live now (contact VISIBLE, or a Ping/Marker reveal), and each such
        // hostile must be on the map (final QA 2026-10-21: the owner saw no hostile marks).
        const r = await b.ev(`(() => { const t = __chog.tmap(), w = __chog.world, c = __chog.intel().contacts; if (!t.open || __chog.phase !== 'play') return null;
          const live = (id) => { const k = c.get(id); return !!k && (k.state === 'visible' || (k.state === 'partial' && k.source === 'ping')); };
          const marks = t.markers.filter((m) => m.kind === 'hostile');
          const missing = w.actors.filter((a) => a.team === 'bot' && a.alive && live(a.id) && !marks.some((m) => m.id === a.id)).map((a) => a.id);
          return { missing, marks: marks.map((m) => { const a = w.actors[m.id]; return { id: m.id, alive: a.alive, team: a.team, known: live(m.id), d: Math.hypot(a.x - m.x, a.y - m.y) }; }) }; })()`);
        if (!r) break;
        fpsOpen.push(await b.ev(`__chog.fps`));
        seen += r.marks.length;
        wrong.push(...r.marks.filter((x) => !x.alive || x.team !== 'bot' || !x.known || x.d > 0.6), ...r.missing.map((id) => ({ missing: id })));
        await b.click('#tm-close');
      }
      await b.shot(`combat-${id}`);
      const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
      check(`desk combat ${id}: ${opens} opens mid-fight; ${seen} live hostile marks (at least one), each a known living bot at its real spot, none known missing`, opens >= 5 && seen > 0 && wrong.length === 0, JSON.stringify({ seen, wrong: wrong.slice(0, 5) }));
      check(`desk combat ${id}: frame rate with the map open holds (>= 80% of closed)`, avg(fpsOpen) >= 0.8 * avg(fpsShut), JSON.stringify({ open: Math.round(avg(fpsOpen)), shut: Math.round(avg(fpsShut)) }));
      if ((await b.ev(`__chog.phase`)) === 'play') await quit(b); else { await b.go('/?debug'); await b.hub(); }
    }
    // Visor: the DEMO Visor drill puts the tracker radius and dots on the map (the same list as the HUD tracker).
    await b.click('[data-act="demo"]'); await b.until(`__chog.view() === 'demo'`, 5000);
    await b.click('[data-train="visor"]');
    await b.until(`__chog.phase === 'play' && __chog.training()?.drill.id === 'visor'`, 20000);
    await sleep(2500);
    await b.click('#mapbtn'); await b.until(`__chog.tmap().open`, 3000); await sleep(400);
    const vs = await b.ev(STATE);
    await b.shot('map-visor');
    const vt = await b.ev(`document.getElementById('tm-name').textContent`);
    check('desk: Visor drill: the tracked targets are on the map as Visor marks, nothing else of them; titled as the drill room', vs.visor >= 1 && vs.hostile + vs.enemy <= 5 && vt === 'Training room', JSON.stringify({ ...vs, vt }));
    await b.click('#tm-close'); await quit(b);
    check('desk: no page errors', b.errors.length === 0, b.errors.join(' | '));
  }

  // ---- phone: pinch to zoom, one-finger pan, the touch button ----
  if (!ONLY || ONLY === 'phone') {
    const b = await browser('tm-phone', { base, shotDir, w: 844, h: 390, mobile: true, touch: true });
    open.push(b);
    await b.go('/?debug'); await b.ev(`localStorage.setItem('chog.onboarded','1')`);
    await solo(b, 'construction');
    await b.click('#mapbtn'); await b.until(`__chog.tmap().open`, 3000); await sleep(300);
    const v0 = await b.ev(STATE);
    const T = (type, pts) => b.cmd('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
    await T('touchStart', [[380, 200], [460, 200]]);
    for (let i = 1; i <= 6; i++) { await T('touchMove', [[380 - i * 15, 200], [460 + i * 15, 200]]); await sleep(30); }
    await T('touchEnd', []);
    await sleep(150);
    const v1 = await b.ev(STATE);
    check('phone: pinch zooms the map', v1.k > v0.k * 1.6, JSON.stringify({ k0: v0.k, k1: v1.k }));
    await T('touchStart', [[420, 220]]);
    for (let i = 1; i <= 5; i++) { await T('touchMove', [[420 + i * 20, 220]]); await sleep(30); }
    await T('touchEnd', []);
    await sleep(150);
    const v2 = await b.ev(STATE);
    check('phone: one finger pans', Math.abs(v2.ox - v1.ox - 100) < 3, JSON.stringify({ dx: v2.ox - v1.ox }));
    const sticks = await b.ev(`(() => { const p = __chog.world.actors[0]; return { vx: p.vx, vy: p.vy, shots: p.shots }; })()`);
    check('phone: touches on the map never became a move or aim stick', Math.hypot(sticks.vx, sticks.vy) < 0.05 && sticks.shots === 0, JSON.stringify(sticks));
    await b.shot('map-pinched');
    await b.click('#tm-close');
    check('phone: RETURN by touch closes it', !(await b.ev(`__chog.tmap().open`)));
    check('phone: no page errors', b.errors.length === 0, b.errors.join(' | '));
  }

  // ---- online: no reconnect, only the server's view ----
  if (process.env.ONLINE !== '0' && (!ONLY || ONLY === 'online')) {
    for (const [mode, n] of [['1v1', 2], ['3v3', 6]]) {
      const cs = [];
      for (let i = 0; i < n; i++) { const c = await browser(`tm-${mode}-${i}`, { base, shotDir: i === 0 ? shotDir : undefined, w: 1280, h: 720 }); open.push(c); cs.push(c); }
      for (const c of cs) {
        await c.go('/?debug'); await c.ev(`localStorage.setItem('chog.onboarded','1'); localStorage.setItem('chog.map','office')`);
        await c.go('/?debug'); await c.hub();
      }
      for (const c of cs) { await c.click(`[data-mode="${mode}"]`); await sleep(150); await c.click('#playbtn'); }
      const t0 = Date.now(); let inPlay = [];
      while (Date.now() - t0 < 60000) { inPlay = await Promise.all(cs.map((c) => c.ev(`__chog.online() && __chog.phase === 'play'`))); if (inPlay.every(Boolean)) break; await sleep(400); }
      const diag = await Promise.all(cs.map((c) => c.ev(`({ phase: __chog.phase, online: __chog.online(), net: __chog.net()?.state, msg: __chog.net()?.message, view: __chog.view() })`)));
      if (!check(`online ${mode}: all ${n} clients in the match`, inPlay.every(Boolean), JSON.stringify(diag))) { for (const x of cs) { await x.close(); open.splice(open.indexOf(x), 1); } continue; }
      await sleep(1500);
      const c = cs[0];
      await c.ev(`window.__ws = __chog.net().ws; window.__room = __chog.net().match.room; window.__w = __chog.world; window.__keep = 3;`);
      for (let i = 0; i < 6; i++) { await c.click('#mapbtn'); await sleep(350); await c.click('#tm-close'); await sleep(250); }
      await c.click('#mapbtn'); await c.until(`__chog.tmap().open`, 3000); await sleep(600);
      const s = await c.ev(STATE);
      await c.shot(`online-${mode}`);
      const mates = n / 2 - 1;
      check(`online ${mode}: you and ${mates} teammate(s) on the map; enemies only if the server sent them`, s.you === 1 && s.mate === mates && s.enemy <= (await c.ev(`__chog.world.actors.filter((a) => a.team !== __chog.world.actors[0].team && a.x > -50).length`)), JSON.stringify(s));
      await c.click('#tm-close'); await sleep(300);
      const r = await c.ev(`({ sameWs: __chog.net().ws === window.__ws, room: __chog.net().match?.room === window.__room, state: __chog.net().state, same: __chog.world === window.__w, keep: window.__keep, phase: __chog.phase })`);
      check(`online ${mode}: 7 open/close cycles: same socket, same room, same world, no reload, still in the match`, r.sameWs && r.room && r.state === 'match' && r.same && r.keep === 3 && r.phase === 'play', JSON.stringify(r));
      check(`online ${mode}: no page errors`, cs.every((x) => x.errors.length === 0), cs.flatMap((x) => x.errors).join(' | '));
      for (const x of cs) { await x.close(); open.splice(open.indexOf(x), 1); }
    }
  }
} catch (e) {
  check('run completed', false, e?.stack ?? e);
} finally {
  for (const b of open) await b.close();
}
const fails = results.filter((r) => !r.ok).length;
console.log(`\ntm-map: ${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
