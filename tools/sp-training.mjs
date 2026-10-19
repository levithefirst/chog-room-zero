// CHOG superpowers in real headless Chrome against the local full stack (tools/local-api.ts, game server): the DEMO
// Training picker, a drill from start to its results card, nothing sent to the site during or after it, and the hub's
// power box for a DEMO Chog. Emulated desktop and phone (NOT devices). Usage: node tools/sp-training.mjs http://localhost:8790 [shotDir]
import { browser, sleep, LAYOUT_PROBE } from './cdp.mjs';
const [base, shotDir] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, ok ? 240 : 1200)}` : ''}`); };
const open = [];

try {
  for (const view of [{ label: 'desk', w: 1440, h: 900 }, { label: 'phone', w: 844, h: 390, mobile: true, touch: true }]) {
    const b = await browser(`sp-${view.label}`, { base, shotDir, ...view });
    open.push(b);
    await b.go('/?debug'); await b.ev(`localStorage.setItem('chog.onboarded','1')`);
    await b.go('/?debug'); await b.hub();
    // Count every call to the site from here on: Training must send none of practice, report or settle.
    await b.ev(`(() => { window.__calls = []; const f = window.fetch; window.fetch = (u, o) => { window.__calls.push(String(u)); return f(u, o); }; })()`);

    // ---- DEMO Training picker ----
    await b.click('[data-act="demo"]');
    await b.until(`__chog.view() === 'demo'`, 5000);
    const pick = await b.ev(`({ buttons: [...document.querySelectorAll('[data-train]')].map((x) => x.dataset.train), ranks: [...document.querySelectorAll('#trainrank option')].map((o) => o.value) })`);
    await b.shot('01-demo-training');
    check(`${view.label}: DEMO screen offers a drill for each of the six powers at every rank`, pick.buttons.join() === 'laser,xray,visor,bubble,drool,aura' && pick.ranks.length === 5, JSON.stringify(pick));
    check(`${view.label}: DEMO screen layout (no page scroll, no off-screen buttons)`, (await b.ev(LAYOUT_PROBE) ?? []).length === 0, JSON.stringify(await b.ev(LAYOUT_PROBE)));
    await b.ev(`document.getElementById('trainrank').value = 'rare'`);
    await b.click('[data-train="aura"]');
    await b.until(`__chog.phase === 'play' && !!__chog.training()`, 20000);
    const start = await b.ev(`({ kind: __chog.world.actors[0].ability.kind, rank: __chog.world.actors[0].ability.rank, sec: __chog.world.actors[0].ability.seconds, cd: __chog.world.actors[0].ability.cooldown, hero: document.getElementById('hero').innerText, dummies: __chog.world.actors.length - 1 })`);
    check(`${view.label}: the drill plays the picked power at the picked rank, labelled DEMO, with its dummies`, start.kind === 'aura' && start.rank === 'rare' && start.sec === 15 && start.dummies === 2 && /DEMO/.test(start.hero) && /Training/.test(start.hero), JSON.stringify(start));
    // Raise the aura just before a volley, like a player would.
    await b.until(`/VOLLEY IN/i.test(document.getElementById('status').innerText)`, 15000);
    const st = await b.ev(`document.getElementById('status').innerText`);
    check(`${view.label}: the HUD counts the drill down and warns of the volley`, /Training · Hold the line · \d+ s/i.test(st) && /VOLLEY IN/i.test(st), st);
    // One press only: a second, fresh press drops the aura early (the rule), so the phone taps and the desk keys.
    if (view.touch) await b.click('#ability');
    else await b.ev(`(() => { const o = { key: ' ', code: 'Space', bubbles: true }; window.dispatchEvent(new KeyboardEvent('keydown', o)); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', o)), 120); })()`);
    await b.until(`__chog.world.actors[0].auraLeft > 0`, 3000);
    await b.shot('02-aura-drill');
    check(`${view.label}: the aura goes up from the ability control`, await b.ev(`__chog.world.actors[0].auraLeft > 0`));
    await b.until(`__chog.phase === 'results'`, 70000);
    const res = await b.ev(`({ title: document.getElementById('training-title')?.innerText, score: document.getElementById('training-score')?.innerText, note: document.querySelector('#overlay')?.innerText })`);
    await b.shot('03-results');
    check(`${view.label}: the drill ends on its own results card with its numbers`, /^hold the line$/i.test(res.title ?? '') && /Volleys taken clean: \d+ of \d+/i.test(res.score ?? '') && /earns nothing/i.test(res.note ?? ''), JSON.stringify(res));
    const calls = await b.ev(`window.__calls.filter((u) => /practice|report|settle/.test(u))`);
    check(`${view.label}: Training sent nothing to the site (no practice, report or settle call)`, Array.isArray(calls) && calls.length === 0, JSON.stringify(calls));
    // Again restarts the same drill; Back returns to the hub and clears it.
    for (let i = 0; i < 20 && (await b.ev(`__chog.phase`)) === 'results'; i++) { await b.click('#training-again'); await sleep(400); }
    await b.until(`__chog.phase === 'play' && !!__chog.training() && __chog.training().t < 5`, 15000);
    check(`${view.label}: Again restarts the same drill`, await b.ev(`__chog.world.actors[0].ability.kind === 'aura'`));
    await b.ev(`__chog.go('pause')`); await sleep(300);
    await b.ev(`__chog.go('quit')`); await b.hub();
    check(`${view.label}: leaving the drill clears it (the next game is the normal one)`, await b.ev(`__chog.training() === null`));
    // ---- Laser drill: aim at the standing dummy with the real mouse or thumb, fire the beam, see it land ----
    if (!view.touch) {
      await b.click('[data-act="demo"]');
      await b.until(`__chog.view() === 'demo'`, 5000);
      await b.click('[data-train="laser"]');
      await b.until(`__chog.phase === 'play' && __chog.training()?.drill.id === 'laser'`, 20000);
      // "Five coming": the first target walks in from the far side; wait until it is inside the beam's reach.
      await b.until(`(() => { const p = __chog.world.actors[0], d = __chog.world.actors[1]; return d.alive && Math.hypot(d.x - p.x, d.y - p.y) < 8; })()`, 20000);
      // The camera leads toward the cursor and the target walks, so keep the cursor on it.
      const aim = () => b.ev(`(() => { const d = __chog.world.actors[1]; const s = __chog.renderer.toScreen(d.x, d.y); const c = document.querySelector('canvas').getBoundingClientRect(); return { x: c.x + s.x, y: c.y + s.y }; })()`)
        .then((at) => b.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y }));
      for (let i = 0; i < 4; i++) { await aim(); await sleep(200); }
      await b.ev(`(() => { const o = { key: ' ', code: 'Space', bubbles: true }; window.dispatchEvent(new KeyboardEvent('keydown', o)); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', o)), 120); })()`);
      for (let i = 0; i < 6; i++) { await aim(); await sleep(100); }
      await b.until(`__chog.world.actors[0].beamLeft > 0`, 3000);
      await b.shot('04-laser-beam');
      for (let i = 0; i < 10 && !(await b.ev(`__chog.training().damage > 0`)); i++) { await aim(); await sleep(100); }
      const lz = await b.ev(`({ dmg: __chog.training().damage, status: document.getElementById('status').innerText })`);
      check(`${view.label}: Laser drill: the beam aimed with the mouse burns a dummy`, lz.dmg > 0 && /Destroyed/i.test(lz.status), JSON.stringify(lz));
      await b.ev(`__chog.go('pause')`); await sleep(300); await b.ev(`__chog.go('quit')`); await b.hub();
    }
    check(`${view.label}: no script errors`, b.errors.length === 0, b.errors.join(' | '));
  }
} finally {
  for (const b of open) await b.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
