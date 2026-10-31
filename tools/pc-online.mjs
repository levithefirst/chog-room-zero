// Keyboard + mouse online (owner 2026-10-21): real matches on the local stack's game server, every client a separate
// headless Chrome (emulated desktops, NOT real devices). 1v1 and 3v3 as guests, 5v5 as verified test-wallet holders
// (tools/local-api.ts, faked Monad). In each match client 0 plays only with keys and the mouse, and every effect is read
// back from what the SERVER sent (its snapshots): D moves, holding left click fires, R reloads, G (hold, release) and
// right click throw grenades, Space uses the ability, M opens the map.
// Usage: node tools/pc-online.mjs http://localhost:8790   (MODES=1v1,3v3,5v5)
import { browser, sleep } from './cdp.mjs';
const [base] = process.argv.slice(2);
const MODES = (process.env.MODES ?? '1v1,3v3,5v5').split(',');
const SIZE = { '1v1': 2, '3v3': 6, '5v5': 10 };
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, 500)}` : ''}`); return !!ok; };
const ME = `(() => { const p = __chog.world.actors[0]; return { x: p.x, y: p.y, ammo: p.ammo, reloadLeft: p.reloadLeft, grenades: p.grenades, abilityCd: p.abilityCd, alive: p.alive && !p.downed, snaps: __chog.net().snapCount }; })()`;

for (const mode of MODES) {
  const N = SIZE[mode], holders = mode === '5v5';
  const cs = [];
  try {
    for (let i = 0; i < N; i++) cs.push(await browser(`on-${mode}-${i}`, { base, w: 960, h: 540 }));
    await Promise.all(cs.map(async (b, i) => {
      await b.go('/?debug'); await b.until(`document.readyState !== 'loading'`, 30000);
      await b.ev(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('chog.onboarded','1'); localStorage.setItem('chog-room-zero:settings:v1', JSON.stringify({ volume: 0, vibration: false, quality: 'low', stick: 'medium', tips: false }))`);
      if (holders) { const a = '0x' + (0xb01 + i).toString(16).padStart(40, '0'); await b.go(`/__test/login?provider=wallet&sub=${a}&label=${a}&to=${encodeURIComponent('/?debug')}`); await sleep(2500); }
      else await b.go('/?debug');
      await b.until(`(!!document.getElementById('hub') || __chog.view?.() === 'yourchog') && !document.getElementById('boot')`, 90000);
      if (holders) { await b.ev(`document.getElementById('yourchog-close')?.click()`); await b.until(`!!document.getElementById('hub') && !!__chog.acct().tokens?.length`, 30000); }
    }));
    for (const b of cs) { await b.click(`[data-mode="${mode}"]`); await b.click('#playbtn'); }
    const inPlay = await Promise.all(cs.map((b) => b.until(`__chog.online() && __chog.phase === 'play'`, 120000)));
    const rooms = await Promise.all(cs.map((b) => b.ev(`__chog.net()?.match?.room ?? null`)));
    if (!check(`${mode}: all ${N} keyboard + mouse clients matched into one room${holders ? ' (verified holders)' : ''}`, inPlay.every(Boolean) && new Set(rooms).size === 1 && rooms[0], JSON.stringify(rooms))) continue;
    const b = cs[0];
    const key = async (code, k, type) => b.cmd('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) });
    const tap = async (code, k, ms = 120) => { await key(code, k, 'keyDown'); await sleep(ms); await key(code, k, 'keyUp'); };
    const mouse = (type, x, y, button = 'none') => b.cmd('Input.dispatchMouseEvent', { type, x, y, button, clickCount: type === 'mouseMoved' ? 0 : 1 });
    // After the countdown, with fresh snapshots: the server's view of this player.
    await b.until(`__chog.net().snapCount > 60 && __chog.net().startsIn() === 0`, 30000); await sleep(1000);
    await mouse('mouseMoved', 700, 270);
    let a = await b.ev(ME);
    await key('KeyD', 'd', 'keyDown'); await sleep(1500); await key('KeyD', 'd', 'keyUp'); await sleep(800);
    let z = await b.ev(ME);
    check(`${mode}: D held moves the player on the server`, Math.hypot(z.x - a.x, z.y - a.y) > 0.5 && z.snaps > a.snaps, JSON.stringify({ from: [a.x, a.y], to: [z.x, z.y] }));
    a = await b.ev(ME);
    await mouse('mousePressed', 700, 270, 'left'); await sleep(900); await mouse('mouseReleased', 700, 270, 'left'); await sleep(500);
    z = await b.ev(ME);
    check(`${mode}: holding left click fires (the server's magazine drops)`, z.ammo < a.ammo || z.reloadLeft > 0, JSON.stringify({ ammo: [a.ammo, z.ammo] }));
    await b.until(`__chog.world.actors[0].reloadLeft <= 0`, 15000);
    await tap('KeyR', 'r');
    const rl = await b.until(`__chog.world.actors[0].reloadLeft > 0`, 5000);
    check(`${mode}: R reloads (the server reports the reload)`, rl);
    a = await b.ev(ME);
    await mouse('mouseMoved', 600, 300);
    await key('KeyG', 'g', 'keyDown'); await sleep(300); await key('KeyG', 'g', 'keyUp');
    const g1 = await b.until(`__chog.world.actors[0].grenades < ${a.grenades}`, 6000);
    check(`${mode}: G (hold, release) throws a grenade (the server's count drops ${a.grenades} -> ${a.grenades - 1})`, a.grenades > 0 && g1, JSON.stringify({ grenades: a.grenades }));
    await sleep(1600); // grenade cooldown
    a = await b.ev(ME);
    await mouse('mousePressed', 600, 300, 'right'); await sleep(80); await mouse('mouseReleased', 600, 300, 'right');
    const g2 = a.grenades > 0 ? await b.until(`__chog.world.actors[0].grenades < ${a.grenades}`, 6000) : null;
    check(`${mode}: right click throws a grenade`, a.grenades === 0 || g2, JSON.stringify({ grenades: a.grenades }));
    a = await b.ev(ME);
    await tap('Space', ' ');
    const ab = await b.until(`__chog.world.actors[0].abilityCd > 0`, 6000);
    check(`${mode}: Space uses the ability (the server starts its cooldown)`, a.abilityCd === 0 && ab, JSON.stringify({ before: a.abilityCd, alive: a.alive }));
    await tap('KeyM', 'm');
    const mo = await b.until(`__chog.tmap().open`, 4000);
    await tap('KeyM', 'm');
    const mc = await b.until(`!__chog.tmap().open`, 4000);
    check(`${mode}: M opens and closes the tactical map online`, mo && mc);
    const errs = cs.flatMap((c) => c.errors);
    check(`${mode}: no page errors on any client`, errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) { check(`${mode}: run`, false, e?.stack ?? e); }
  finally { for (const c of cs) await c.close(); }
}
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
