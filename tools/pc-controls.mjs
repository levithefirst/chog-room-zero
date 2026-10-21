// PC keyboard + mouse controls, end to end in real headless Chrome (emulated, NOT real devices): every combat control
// is shown on the HUD with its key and actually works in a solo match. WASD moves, the mouse aims, left click fires,
// R and the Reload key on the HUD reload, G (hold, release) and right click and the grenade button throw, Space uses the
// ability. Touch (844x390) keeps its own round buttons, without key labels, and its Reload and grenade buttons still work.
// Usage: node tools/pc-controls.mjs http://localhost:8790 <shotDir>   (VIEWS=d1280,t844 to pick)
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
      // Ability: Space.
      a = await b.ev(ME);
      await tap('Space', ' ');
      const ab = await b.until(`__chog.world.actors[0].abilityCd > 0`, 8000);
      check(`${v.name}: Space uses the ability`, a.abilityCd === 0 && ab, JSON.stringify({ before: a.abilityCd }));
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
} catch (e) { check('run', false, e?.stack ?? e); }
finally { for (const b of open) await b.close(); }
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
