// PC keyboard + mouse controls, end to end in real headless Chrome (emulated, NOT real devices): every combat control
// is shown on the HUD with its key and actually works in a solo match. WASD moves, the mouse aims, left click fires,
// R and the Reload key on the HUD reload, G (hold, release) and right click and the grenade button throw, Space uses the
// ability. Touch (844x390) keeps its own round buttons, without key labels, and its Reload and grenade buttons still work.
// Then Settings > Controls: rebinding takes effect on the HUD and in a match, and device switching swaps the controls.
// Usage: node tools/pc-controls.mjs http://localhost:8790 <shotDir>   (VIEWS=d1280,t844,rebind to pick)
import { browser, sleep } from './cdp.mjs';
const [base, shotDir] = process.argv.slice(2);
const ALL = [
  { name: 'd1280', w: 1280, h: 720 }, { name: 'd1440', w: 1440, h: 900 }, { name: 'd1920', w: 1920, h: 1080 },
  { name: 't844', w: 844, h: 390, mobile: true, touch: true },
];
const pick = process.env.VIEWS?.split(',');
const VIEWS = pick ? ALL.filter((v) => pick.includes(v.name)) : ALL;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, 400)}` : ''}`); return !!ok; };

// Each HUD control: shown, on screen, its key label readable (12 px or more), and no two controls overlapping.
const HUD_PROBE = `(() => {
  const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
    const shown = cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.3 && r.width > 0 && r.height > 0;
    return { shown, r: { x: r.x, y: r.y, w: r.width, h: r.height }, text: e.innerText.replace(/\\s+/g, ' ').trim(), px: parseFloat(cs.fontSize),
      on: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; };
  const out = { reload: box('#reload'), reloadKey: box('#reload .keyhint'), nade: box('#nade'), nadeKey: box('#nade .keyhint'), ability: box('#ability'), abilityKey: box('#ability .keyhint'), weapon: box('#weapon'), map: box('#mapbtn .keyhint') };
  const hit = (a, b) => a && b && a.shown && b.shown && a.r.x < b.r.x + b.r.w - 1 && b.r.x < a.r.x + a.r.w - 1 && a.r.y < b.r.y + b.r.h - 1 && b.r.y < a.r.y + a.r.h - 1;
  const ids = ['reload', 'nade', 'ability', 'weapon'];
  out.overlaps = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (hit(out[ids[i]], out[ids[j]])) out.overlaps.push(ids[i] + '/' + ids[j]);
  out.touch = document.body.classList.contains('touch');
  return out;
})()`;
const ME = `(() => { const p = __chog.world.actors[0]; return { x: p.x, y: p.y, facing: p.facing, ammo: p.ammo, mag: p.weapon.magazine, reserve: p.reserve, reloadLeft: p.reloadLeft, grenades: p.grenades, thrown: p.thrown, nadeCd: p.nadeCd, abilityCd: p.abilityCd, shots: p.shots, alive: p.alive, tick: __chog.world.tick, need: document.getElementById('reload').classList.contains('need') }; })()`;

const open = [];
try {
  for (const v of VIEWS) {
    const b = await browser(`pc-${v.name}`, { base, shotDir, ...v });
    open.push(b);
    const key = async (code, k, type) => b.cmd('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
    const tap = async (code, k, holdMs = 120) => { await key(code, k, 'keyDown'); await sleep(holdMs); await key(code, k, 'keyUp'); };
    const mouse = (type, x, y, button = 'none') => b.cmd('Input.dispatchMouseEvent', { type, x, y, button, clickCount: type === 'mouseMoved' ? 0 : 1 });
    // Sim time, not wall time: a headless page may run the sim slower than real time.
    const ticks = async (n) => { const t0 = await b.ev(`__chog.world.tick`); await b.until(`__chog.world.tick >= ${t0 + n}`, 30000); };
    await b.go('/?debug'); await b.until(`document.readyState !== 'loading'`, 20000);
    await b.ev(`localStorage.setItem('chog.onboarded','1'); localStorage.setItem('chog.map','room-zero')`);
    await b.go('/?debug'); await b.hub();
    await b.click('[data-mode="solo"]'); await b.click('#playbtn');
    if (!check(`${v.name}: solo match starts`, await b.until(`__chog.phase === 'play' && __chog.world.tick > 30`, 30000))) continue;
    // The pointer must have been used on this page for the HUD to settle in its mode (a mouse move on PC).
    const W = v.w, H = v.h;
    if (!v.touch) await mouse('mouseMoved', W / 2 + 200, H / 2);
    await sleep(500);
    const hud = await b.ev(HUD_PROBE);
    await b.shot('hud');
    if (!v.touch) {
      check(`${v.name}: HUD shows Reload with its key R, the grenade with G, the ability with Space, all on screen, keys >= 12 px, no overlap`,
        hud.reload?.shown && hud.reload.on && /RELOAD/i.test(hud.reload.text) && hud.reloadKey?.shown && hud.reloadKey.text === 'R' && hud.reloadKey.px >= 12
        && hud.nade?.shown && hud.nade.on && hud.nadeKey?.shown && hud.nadeKey.text === 'G' && hud.nadeKey.px >= 12 && hud.nadeKey.on
        && hud.ability?.shown && /SPACE/i.test(hud.abilityKey?.text ?? '') && !hud.overlaps.length && !hud.touch, JSON.stringify(hud));
      // Movement: W held moves the operator.
      let a = await b.ev(ME);
      await key('KeyD', 'd', 'keyDown'); await ticks(40); await key('KeyD', 'd', 'keyUp');
      let z = await b.ev(ME);
      check(`${v.name}: D held moves the operator (WASD)`, Math.hypot(z.x - a.x, z.y - a.y) > 0.5, JSON.stringify({ from: [a.x, a.y], to: [z.x, z.y] }));
      // Aim: the operator turns toward the mouse (point left of it, then right).
      await mouse('mouseMoved', W / 2 - 300, H / 2); await ticks(40);
      const left = await b.ev(ME);
      await mouse('mouseMoved', W / 2 + 300, H / 2); await ticks(40);
      const right = await b.ev(ME);
      const facesLeft = Math.abs(Math.cos(left.facing) + 1) < 0.3, facesRight = Math.abs(Math.cos(right.facing) - 1) < 0.3;
      check(`${v.name}: the operator turns to the mouse (left, then right)`, facesLeft && facesRight, JSON.stringify({ left: left.facing, right: right.facing }));
      // Fire: holding the left button shoots.
      a = await b.ev(ME);
      await mouse('mousePressed', W / 2 + 300, H / 2, 'left'); await ticks(30); await mouse('mouseReleased', W / 2 + 300, H / 2, 'left');
      z = await b.ev(ME);
      check(`${v.name}: holding left click fires`, z.shots > a.shots && (z.ammo < a.ammo || z.reloadLeft > 0), JSON.stringify({ shots: [a.shots, z.shots], ammo: [a.ammo, z.ammo] }));
      // Reload: R reloads a part-empty magazine to full.
      await b.until(`__chog.world.actors[0].reloadLeft <= 0`, 20000);
      a = await b.ev(ME);
      await tap('KeyR', 'r');
      const rl = await b.until(`__chog.world.actors[0].reloadLeft > 0`, 5000);
      const full = await b.until(`__chog.world.actors[0].reloadLeft <= 0 && __chog.world.actors[0].ammo === __chog.world.actors[0].weapon.magazine`, 30000);
      check(`${v.name}: R reloads (magazine ${a.ammo} -> full)`, a.ammo < a.mag && rl && full, JSON.stringify({ before: a.ammo, mag: a.mag, started: !!rl, full: !!full }));
      // The Reload key on the HUD: lit when the magazine is low, a click reloads and fires nothing.
      await mouse('mousePressed', W / 2 + 300, H / 2, 'left');
      await b.until(`__chog.world.actors[0].ammo <= Math.ceil(__chog.world.actors[0].weapon.magazine * 0.25) || __chog.world.actors[0].reloadLeft > 0`, 30000);
      await mouse('mouseReleased', W / 2 + 300, H / 2, 'left');
      await b.until(`__chog.world.actors[0].reloadLeft <= 0`, 20000); await ticks(5);
      a = await b.ev(ME);
      const lit = a.need;
      await b.click('#reload');
      const rl2 = await b.until(`__chog.world.actors[0].reloadLeft > 0`, 5000);
      z = await b.ev(ME);
      check(`${v.name}: the HUD Reload key is lit when low, and a click on it reloads without firing`, lit && rl2 && z.shots === a.shots, JSON.stringify({ lit, ammo: a.ammo, reloading: !!rl2, shots: [a.shots, z.shots] }));
      await b.until(`__chog.world.actors[0].reloadLeft <= 0`, 30000);
      // Grenade: G held then released throws one at the cursor.
      const cool = `__chog.world.actors[0].nadeCd <= 0`;
      a = await b.ev(ME);
      await mouse('mouseMoved', W / 2 + 160, H / 2);
      await key('KeyG', 'g', 'keyDown'); await ticks(10);
      const preview = await b.ev(`!!__chog.world && document.body.classList.contains('touch') === false`);
      await key('KeyG', 'g', 'keyUp');
      const g1 = await b.until(`__chog.world.actors[0].thrown > ${a.thrown}`, 8000);
      z = await b.ev(ME);
      check(`${v.name}: G (hold, release) throws a grenade`, preview && g1 && z.grenades === a.grenades - 1, JSON.stringify({ grenades: [a.grenades, z.grenades], thrown: [a.thrown, z.thrown] }));
      // Right click throws one too.
      await b.until(cool, 20000);
      a = await b.ev(ME);
      await mouse('mousePressed', W / 2 + 160, H / 2, 'right'); await sleep(80); await mouse('mouseReleased', W / 2 + 160, H / 2, 'right');
      const g2 = await b.until(`__chog.world.actors[0].thrown > ${a.thrown}`, 8000);
      check(`${v.name}: right click throws a grenade`, g2, JSON.stringify({ thrown: a.thrown }));
      // The grenade button on the HUD, clicked, throws one along the aim.
      await b.until(cool, 20000);
      a = await b.ev(ME);
      if (a.grenades > 0) {
        await b.click('#nade');
        const g3 = await b.until(`__chog.world.actors[0].thrown > ${a.thrown}`, 8000);
        check(`${v.name}: a click on the HUD grenade button throws one`, g3, JSON.stringify({ thrown: a.thrown, grenades: a.grenades }));
      } else check(`${v.name}: a click on the HUD grenade button throws one`, false, 'no grenades left to test with');
      // Ability: Space. Benja's ability is Ping: it reveals hostiles around him for a moment (the game's ping).
      a = await b.ev(ME);
      await tap('Space', ' ');
      const ab = await b.until(`__chog.world.actors[0].abilityCd > 0`, 8000);
      const ping = await b.ev(`({ name: __chog.world.actors[0].ability.name, reveal: __chog.world.actors[0].revealLeft })`);
      check(`${v.name}: Space uses the ability (Benja: Ping reveals around him)`, a.abilityCd === 0 && ab && ping.name === 'Ping' && ping.reveal > 0, JSON.stringify({ before: a.abilityCd, ping }));
      // Tactical map: M opens it over the running match and M closes it; Esc pauses and resumes.
      await tap('KeyM', 'm');
      const mo = await b.until(`__chog.tmap().open`, 5000);
      await tap('KeyM', 'm');
      const mc = await b.until(`!__chog.tmap().open && __chog.phase === 'play'`, 5000);
      check(`${v.name}: M opens and closes the tactical map`, mo && mc);
      await tap('Escape', 'Escape');
      const pz = await b.until(`__chog.phase === 'pause'`, 5000);
      const keysShown = await b.ev(`[...document.querySelectorAll('#overlay .keys li')].map((li) => li.innerText.replace(/\\s+/g, ' ')).join(' | ')`);
      await tap('Escape', 'Escape');
      const rs = await b.until(`__chog.phase === 'play'`, 5000);
      check(`${v.name}: Esc pauses (the pause card lists the keys) and resumes`, pz && rs && /R Reload/i.test(keysShown) && /G \/ Right click Grenade/i.test(keysShown) && /M Map/i.test(keysShown), keysShown);
    } else {
      check(`${v.name}: touch HUD keeps its round Reload and grenade buttons, without key labels`,
        hud.touch && hud.reload?.shown && hud.reload.on && !hud.reloadKey?.shown && hud.nade?.shown && hud.nade.on && !hud.nadeKey?.shown && !hud.overlaps.length, JSON.stringify(hud));
      // Fire a few rounds with the right thumb, then the Reload button reloads.
      const rx = W * 0.75, ry = H * 0.55;
      await b.cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rx, y: ry, id: 7 }] });
      await b.cmd('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rx + 90, y: ry, id: 7 }] });
      await ticks(25);
      await b.cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await b.until(`__chog.world.actors[0].reloadLeft <= 0`, 20000);
      let a = await b.ev(ME);
      await b.click('#reload');
      const rl = await b.until(`__chog.world.actors[0].reloadLeft > 0`, 5000);
      check(`${v.name}: the touch Reload button reloads`, a.ammo < a.mag && rl, JSON.stringify({ ammo: a.ammo, mag: a.mag, reloading: !!rl }));
      a = await b.ev(ME);
      await b.click('#nade');
      const g = await b.until(`__chog.world.actors[0].thrown > ${a.thrown}`, 8000);
      check(`${v.name}: the touch grenade button throws one`, g, JSON.stringify({ thrown: a.thrown }));
    }
    await b.shot('end');
    check(`${v.name}: no page errors`, b.errors.length === 0, b.errors.slice(0, 3).join(' | '));
    await b.close(); open.splice(open.indexOf(b), 1);
  }
  // Settings > Controls: rebind Reload to T and the grenade to H; the HUD shows the new keys, the new keys work in a
  // match and the old ones do nothing; Reset to defaults brings R and G back. Then device switching mid-match.
  if (!pick || pick.includes('rebind')) {
    const b = await browser('pc-rebind', { base, shotDir, w: 1440, h: 900 });
    open.push(b);
    const key = async (code, k, type) => b.cmd('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
    const tap = async (code, k) => { await key(code, k, 'keyDown'); await sleep(100); await key(code, k, 'keyUp'); };
    await b.go('/?debug'); await b.until(`document.readyState !== 'loading'`, 20000);
    await b.ev(`localStorage.clear(); localStorage.setItem('chog.onboarded','1')`); await b.go('/?debug'); await b.hub();
    await b.click('[data-act="settings"]'); await b.until(`!!document.getElementById('controlsbtn')`, 5000);
    await b.click('#controlsbtn');
    const shown = await b.until(`document.querySelectorAll('#binds tr[data-action]').length === 11 ? [...document.querySelectorAll('#binds tr[data-action]')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim()) : null`, 5000);
    await b.shot('controls');
    check('Controls screen lists every action with its keys (Reload R, Grenade G / Right click, Ability Space / Q, Map M, Pause Esc / P)', shown && shown.some((r) => /^Reload R \+ Add$/i.test(r)) && shown.some((r) => /^Grenade G Right click/i.test(r)) && shown.some((r) => /^Ability Space Q/i.test(r)) && shown.some((r) => /^Tactical map M/i.test(r)) && shown.some((r) => /^Pause Esc P/i.test(r)), JSON.stringify(shown));
    await b.click('[data-bind="reload:0"]');
    const waiting = await b.until(`!!document.querySelector('.bindchip.capturing')`, 3000);
    await tap('KeyT', 't');
    await b.until(`!document.querySelector('.bindchip.capturing')`, 3000);
    await b.click('[data-bind="grenade:0"]'); await tap('KeyH', 'h');
    // Enter is kept for menus: refused, with a note, and the key stays.
    await b.click('[data-bind="ability:0"]'); await tap('Enter', 'Enter');
    const after = await b.ev(`({ reload: document.querySelector('#binds tr[data-action="reload"]').innerText.replace(/\\s+/g, ' ').trim(), nade: document.querySelector('#binds tr[data-action="grenade"]').innerText.replace(/\\s+/g, ' ').trim(), ability: document.querySelector('#binds tr[data-action="ability"]').innerText.replace(/\\s+/g, ' ').trim(), note: document.getElementById('bindnote')?.innerText ?? '', stored: localStorage.getItem('chog.bindings') })`);
    check('rebinding: Reload -> T, Grenade -> H take effect and are kept; Enter is refused with a note', waiting && /^Reload T /i.test(after.reload) && /^Grenade H Right click/i.test(after.nade) && /^Ability Space Q/i.test(after.ability) && /menus/.test(after.note) && /KeyT/.test(after.stored ?? ''), JSON.stringify(after));
    await b.click('[data-act="back"]'); await b.click('[data-act="back"]'); await b.hub();
    await b.click('[data-mode="solo"]'); await b.click('#playbtn');
    await b.until(`__chog.phase === 'play' && __chog.world.tick > 30`, 30000);
    await b.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1000, y: 450, button: 'none' });
    await sleep(400);
    const hud = await b.ev(`({ reload: document.querySelector('#reload .keyhint').innerText, nade: document.querySelector('#nade .keyhint').innerText, hint: document.getElementById('hint').innerText })`);
    check('the HUD and the controls hint show the new keys (T reload, H grenade)', hud.reload === 'T' && hud.nade === 'H' && /T reload/.test(hud.hint) && /H grenade/.test(hud.hint), JSON.stringify(hud));
    await b.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1000, y: 450, button: 'left', clickCount: 1 }); await sleep(600);
    await b.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1000, y: 450, button: 'left', clickCount: 1 });
    await b.until(`__chog.world.actors[0].reloadLeft <= 0`, 20000);
    const am = await b.ev(`__chog.world.actors[0].ammo`);
    await tap('KeyR', 'r'); await sleep(600);
    const oldR = await b.ev(`__chog.world.actors[0].reloadLeft > 0`);
    await tap('KeyT', 't');
    const newT = await b.until(`__chog.world.actors[0].reloadLeft > 0`, 5000);
    const th = await b.ev(`__chog.world.actors[0].thrown`);
    await tap('KeyG', 'g'); await sleep(600);
    const oldG = await b.ev(`__chog.world.actors[0].thrown > ${th}`);
    await tap('KeyH', 'h');
    const newH = await b.until(`__chog.world.actors[0].thrown > ${th}`, 8000);
    check('in the match: T reloads and H throws; R and G do nothing any more', am < 24 && !oldR && newT && !oldG && newH, JSON.stringify({ ammo: am, oldR, newT: !!newT, oldG, newH: !!newH }));
    // Device switching: a touch shows the touch controls and touch prompts; moving the mouse brings the keys back.
    await b.cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await b.cmd('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 600, id: 3 }] });
    await sleep(150);
    await b.cmd('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(500);
    const t1 = await b.ev(`({ touch: document.body.classList.contains('touch'), reloadKey: getComputedStyle(document.querySelector('#reload .keyhint')).display, reloadRound: getComputedStyle(document.getElementById('reload')).borderRadius, nadeKey: getComputedStyle(document.querySelector('#nade .keyhint')).display })`);
    await b.cmd('Emulation.setTouchEmulationEnabled', { enabled: false });
    await b.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 400, button: 'none' });
    await b.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 960, y: 420, button: 'none' });
    await sleep(500);
    const t2 = await b.ev(`({ touch: document.body.classList.contains('touch'), reloadKey: getComputedStyle(document.querySelector('#reload .keyhint')).display, reload: document.querySelector('#reload .keyhint').innerText })`);
    check('switching devices mid-match: a touch swaps to the touch controls (no key labels), the mouse swaps back to the keys', t1.touch && t1.reloadKey === 'none' && t1.reloadRound === '50%' && t1.nadeKey === 'none' && !t2.touch && t2.reloadKey !== 'none' && t2.reload === 'T', JSON.stringify({ t1, t2 }));
    // Reset to defaults from Settings brings R and G back.
    await tap('Escape', 'Escape'); await b.until(`__chog.phase === 'pause'`, 5000);
    await b.ev(`__chog.go('quit')`); await b.hub();
    await b.click('[data-act="settings"]'); await b.click('#controlsbtn'); await b.click('#bindreset');
    const reset = await b.ev(`({ reload: document.querySelector('#binds tr[data-action="reload"]').innerText.replace(/\\s+/g, ' ').trim(), stored: localStorage.getItem('chog.bindings') })`);
    check('Reset to defaults restores R (and clears the saved keys)', /^Reload R /i.test(reset.reload) && reset.stored === null, JSON.stringify(reset));
    check('rebind: no page errors', b.errors.length === 0, b.errors.slice(0, 3).join(' | '));
    await b.close(); open.splice(open.indexOf(b), 1);
  }
} catch (e) { check('run', false, e?.stack ?? e); }
finally { for (const b of open) await b.close(); }
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
