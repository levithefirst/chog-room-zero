// Final pre-submission QA (owner 2026-10-21): the match itself at phone and desktop sizes, in real headless Chrome
// (emulated touch and viewports; NOT physical devices). Per view: start a solo run from the hub, then check the HUD
// fits (every control on screen, none covering another, each takes its own tap, text >= 12 px), the left thumb moves
// the operator, the right thumb aims and fires (no auto-fire: nothing fires without the thumb), Reload reloads, the
// Ability control fires the ability, MAP opens and closes the tactical map, and pause opens and resumes.
// Desktop views use the keyboard and mouse instead (WASD, click, R, Space, M, Esc).
// Usage: node tools/qa-final-mobile.mjs http://localhost:8790 <shotDir>   (VIEWS=p320,d1920 to pick)
import { browser, sleep } from './cdp.mjs';
const [base, shotDir] = process.argv.slice(2);
const ALL = [
  { name: 'p320', w: 320, h: 568, mobile: true, touch: true }, { name: 'p375', w: 375, h: 667, mobile: true, touch: true },
  { name: 'p390', w: 390, h: 844, mobile: true, touch: true }, { name: 'l844', w: 844, h: 390, mobile: true, touch: true },
  { name: 'd1920', w: 1920, h: 1080 }, { name: 'uw3440', w: 3440, h: 1440 },
];
const pick = process.env.VIEWS?.split(',');
const VIEWS = pick ? ALL.filter((v) => pick.includes(v.name)) : ALL;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, 500)}` : ''}`); return !!ok; };

// Controls the player uses in a match, by view. Touch adds Reload; desktop shows the same HUD minus touch-only parts.
const CONTROLS = ['mapbtn', 'pause', 'ability', 'nade', 'reload'];
const HUD_PROBE = `(() => {
  const vis = (e) => { if (!e) return false; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0 && r.width > 0 && r.height > 0; };
  const ids = ${JSON.stringify(CONTROLS)}.filter((i) => vis(document.getElementById(i)));
  const box = (i) => document.getElementById(i).getBoundingClientRect();
  const off = ids.filter((i) => { const r = box(i); return r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1; });
  const over = []; for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) { const p = box(ids[a]), q = box(ids[b]); if (p.left < q.right - 1 && q.left < p.right - 1 && p.top < q.bottom - 1 && q.top < p.bottom - 1) over.push(ids[a] + '/' + ids[b]); }
  const covered = ids.filter((i) => { const r = box(i); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !document.getElementById(i).contains(t); });
  const small = []; for (const e of document.querySelectorAll('#hud *')) { if (!vis(e) || e.closest('svg')) continue; if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12) small.push((e.id || e.className || e.tagName) + ' ' + getComputedStyle(e).fontSize); }
  const panels = ['vitals', 'foes', 'weapon'].filter((i) => !vis(document.getElementById(i)));
  return { ids, off, over, covered, small: small.slice(0, 6), missingPanels: panels };
})()`;

const open = [];
try {
  for (const v of VIEWS) {
    const b = await browser(`fm-${v.name}`, { base, shotDir, ...v });
    open.push(b);
    await b.go('/?debug'); await b.until(`document.readyState !== 'loading'`, 20000);
    await b.ev(`localStorage.setItem('chog.onboarded','1'); localStorage.setItem('chog.map','room-zero')`);
    await b.go('/?debug');
    if (!check(`${v.name}: the hub loads`, await b.hub())) continue;
    await b.click('[data-mode="solo"]'); await b.click('#playbtn');
    if (!check(`${v.name}: PLAY starts a solo run`, await b.until(`__chog.phase === 'play'`, 30000))) continue;
    await sleep(1500);
    const h = await b.ev(HUD_PROBE);
    await b.shot('01-hud');
    check(`${v.name}: HUD: every control on screen, none overlapping or covered, panels shown, text >= 12 px`, h && !h.off.length && !h.over.length && !h.covered.length && !h.small.length && !h.missingPanels.length && h.ids.includes('mapbtn') && h.ids.includes('ability'), JSON.stringify(h));
    const me = () => b.ev(`(() => { const a = __chog.world.actors[0]; return { x: a.x, y: a.y, ammo: a.ammo, reloading: a.reloadLeft > 0, abCd: a.abilityCd, alive: a.alive }; })()`);
    const p0 = await me();
    // No auto-fire: hands off for a second, no own bullet appears and the magazine stays full.
    await sleep(1000);
    const pIdle = await me();
    check(`${v.name}: no auto-fire (hands off: no shots, magazine unchanged)`, pIdle.ammo === p0.ammo, JSON.stringify({ p0, pIdle }));
    if (v.touch) {
      // Stage geometry: touches are written in viewport coordinates of points on the (possibly turned) stage.
      const L = await b.ev(`(() => { const s = document.getElementById('stage').getBoundingClientRect(); return { x: s.x, y: s.y, w: s.width, h: s.height, rot: document.body.classList.contains('rot') }; })()`);
      const at = (fx, fy) => (L.rot ? { x: L.x + L.w * (1 - fy), y: L.y + L.h * fx } : { x: L.x + L.w * fx, y: L.y + L.h * fy });
      const touch = async (type, pts) => b.cmd('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });
      // Left thumb: press, drag right, hold.
      const s0 = at(0.18, 0.62), s1 = at(0.27, 0.62);
      await touch('touchStart', [{ ...s0, id: 1 }]);
      for (let k = 1; k <= 6; k++) { await touch('touchMove', [{ x: s0.x + (s1.x - s0.x) * k / 6, y: s0.y + (s1.y - s0.y) * k / 6, id: 1 }]); await sleep(40); }
      await sleep(1200);
      const p1 = await me();
      await touch('touchEnd', []);
      check(`${v.name}: left thumb moves the operator`, Math.hypot(p1.x - p0.x, p1.y - p0.y) > 0.8, JSON.stringify({ from: [p0.x, p0.y], to: [p1.x, p1.y] }));
      // Right thumb: press outside the deadzone and hold: it aims and fires; lifting stops firing.
      const r0 = at(0.78, 0.55), r1 = at(0.88, 0.45);
      const a0 = (await me()).ammo;
      await touch('touchStart', [{ ...r0, id: 2 }]);
      for (let k = 1; k <= 6; k++) { await touch('touchMove', [{ x: r0.x + (r1.x - r0.x) * k / 6, y: r0.y + (r1.y - r0.y) * k / 6, id: 2 }]); await sleep(40); }
      await sleep(900);
      await touch('touchEnd', []);
      const a1 = (await me()).ammo; await sleep(600); const a2 = (await me()).ammo;
      check(`${v.name}: right thumb outside the deadzone fires; lifting it stops`, a1 < a0 && a2 === a1, JSON.stringify({ a0, a1, a2 }));
      // Reload control.
      const rr = await b.ev(`(() => { const r = document.getElementById('reload').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await touch('touchStart', [{ ...rr, id: 3 }]); await sleep(120); await touch('touchEnd', []);
      const rl = await b.until(`(() => { const a = __chog.world.actors[0]; return a.ammo === a.weapon.magazine || a.reloadLeft > 0 || !!document.getElementById('weapon')?.classList.contains('reloading'); })()`, 6000);
      check(`${v.name}: Reload control reloads`, rl);
      // Ability control.
      const ab = await b.ev(`(() => { const r = document.getElementById('ability').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await touch('touchStart', [{ ...ab, id: 4 }]); await sleep(150); await touch('touchEnd', []);
      const used = await b.until(`!document.getElementById('ability').classList.contains('ready')`, 3000);
      check(`${v.name}: Ability control uses the ability (goes on cooldown)`, used);
      // MAP opens over the running match; RETURN closes it.
      const mb = await b.ev(`(() => { const r = document.getElementById('mapbtn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await touch('touchStart', [{ ...mb, id: 5 }]); await sleep(120); await touch('touchEnd', []);
      const mo = await b.until(`__chog.tmap().open`, 4000); await sleep(500); await b.shot('02-map');
      const cl = await b.ev(`(() => { const r = document.getElementById('tm-close').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await touch('touchStart', [{ ...cl, id: 6 }]); await sleep(120); await touch('touchEnd', []);
      const mc = await b.until(`!__chog.tmap().open && __chog.phase === 'play'`, 4000);
      check(`${v.name}: MAP opens over the match and RETURN goes back to play`, mo && mc);
      // Pause and resume.
      const pb = await b.ev(`(() => { const r = document.getElementById('pause').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await touch('touchStart', [{ ...pb, id: 7 }]); await sleep(120); await touch('touchEnd', []);
      const pz = await b.until(`__chog.phase === 'pause'`, 4000); await sleep(400); await b.shot('03-pause');
      await b.click('[data-go=resume]');
      check(`${v.name}: pause opens; Resume returns to play`, pz && (await b.until(`__chog.phase === 'play'`, 4000)));
    } else {
      const key = async (code, k, vk, ms = 0) => { await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: vk }); if (ms) await sleep(ms); await b.cmd('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk }); };
      await key('KeyD', 'd', 68, 1200);
      const p1 = await me();
      check(`${v.name}: WASD moves the operator`, Math.hypot(p1.x - p0.x, p1.y - p0.y) > 0.8, JSON.stringify({ from: [p0.x, p0.y], to: [p1.x, p1.y] }));
      const a0 = p1.ammo, cx = v.w * 0.7, cy = v.h * 0.4;
      await b.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy });
      await b.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 }); await sleep(700);
      await b.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', buttons: 0, clickCount: 1 });
      const a1 = (await me()).ammo; await sleep(500); const a2 = (await me()).ammo;
      check(`${v.name}: holding the left button fires; releasing stops`, a1 < a0 && a2 === a1, JSON.stringify({ a0, a1, a2 }));
      await key('KeyR', 'r', 82);
      check(`${v.name}: R reloads`, await b.until(`(() => { const a = __chog.world.actors[0]; return a.ammo === a.weapon.magazine || a.reloadLeft > 0 || !!document.getElementById('weapon')?.classList.contains('reloading'); })()`, 6000));
      await key('Space', ' ', 32);
      check(`${v.name}: Space uses the ability`, await b.until(`!document.getElementById('ability').classList.contains('ready')`, 3000));
      await key('KeyM', 'm', 77);
      const mo = await b.until(`__chog.tmap().open`, 4000); await sleep(400); await b.shot('02-map');
      await key('KeyM', 'm', 77);
      check(`${v.name}: M opens and closes the tactical map`, mo && (await b.until(`!__chog.tmap().open && __chog.phase === 'play'`, 4000)));
      await key('Escape', 'Escape', 27);
      const pz = await b.until(`__chog.phase === 'pause'`, 4000); await b.shot('03-pause');
      await b.click('[data-go=resume]');
      check(`${v.name}: Esc pauses; Resume returns to play`, pz && (await b.until(`__chog.phase === 'play'`, 4000)));
    }
    check(`${v.name}: no page errors`, b.errors.length === 0, b.errors.slice(0, 3).join(' | '));
    await b.close(); open.splice(open.indexOf(b), 1);
  }
} catch (e) { check('run', false, e?.stack ?? e); }
finally { for (const b of open) await b.close(); }
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
