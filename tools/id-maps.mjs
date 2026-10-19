// Locations and the Visor tracker in real headless Chrome against the local full stack: the hub's location picker,
// a solo run on each location (the sim builds that map, the loading card names it), the choice kept across a reload,
// and the Visor tracker on the HUD in its DEMO drill. Emulated desktop and phone (NOT devices).
// Usage: node tools/id-maps.mjs http://localhost:8790 [shotDir]
import { browser, sleep, LAYOUT_PROBE } from './cdp.mjs';
const [base, shotDir] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, ok ? 240 : 1200)}` : ''}`); };
const open = [];
const NAMES = { 'room-zero': 'Room Zero', office: 'Office', supermarket: 'Supermarket', metro: 'Metro Station', construction: 'Construction Site' };
const IDS = Object.keys(NAMES);
// H34: on a phone the five locations live on the Location sheet (one LOCATION button on the hub); elsewhere a row.
async function pickMap(b, id) {
  const sheet = await b.ev(`(() => { const p = document.querySelector('.map-pick'); return !!p && getComputedStyle(p).display !== 'none'; })()`);
  if (sheet) { await b.click('.map-pick'); await b.until(`__chog.view() === 'maps'`, 5000); await b.click(`.map-card[data-map="${id}"]`); await b.until(`__chog.view() === 'main'`, 5000); }
  else await b.click(`.maps5 [data-map="${id}"]`);
  return sheet;
}

try {
  for (const view of [{ label: 'desk', w: 1440, h: 900 }, { label: 'phone', w: 844, h: 390, mobile: true, touch: true }]) {
    const b = await browser(`id-${view.label}`, { base, shotDir, ...view });
    open.push(b);
    await b.go('/?debug'); await b.ev(`localStorage.setItem('chog.onboarded','1')`);
    await b.go('/?debug'); await b.hub();
    const pick = await b.ev(`[...document.querySelectorAll('.maps5 [data-map]')].map((x) => ({ id: x.dataset.map, on: x.classList.contains('on'), name: x.querySelector('b').textContent.trim() }))`);
    check(`${view.label}: the hub offers the five locations, Room Zero chosen by default`, pick?.map((p) => p.id).join() === IDS.join() && pick[0].on && pick.map((p) => p.name.toUpperCase()).join() === IDS.map((i) => NAMES[i].toUpperCase()).join(), JSON.stringify(pick));
    // H34: the TODAY tasks are gone from the hub; the leaderboard took their place (tabs, my rank, ranked by kills).
    const hb = await b.ev(`({ today: !!document.getElementById('daily'), board: !!document.querySelector('.hub-right #boardpreview.big'), first: document.querySelector('.hub-right .hub-card')?.id, tabs: [...document.querySelectorAll('#boardpreview .tab')].map((t) => t.innerText.trim().toLowerCase()).join(), mine: !!document.querySelector('#boardpreview .myrank-mini') })`);
    check(`${view.label}: no TODAY panel on the hub; the leaderboard is first in its place, with Solo/Online and My rank`, !hb.today && hb.board && hb.first === 'boardpreview' && hb.tabs === 'solo,online' && hb.mine, JSON.stringify(hb));
    await b.shot('hub');
    check(`${view.label}: hub layout with the picker (no page scroll, no off-screen buttons)`, (await b.ev(LAYOUT_PROBE) ?? []).length === 0, JSON.stringify(await b.ev(LAYOUT_PROBE)));
    for (const id of [...IDS.slice(1), 'room-zero']) {
      const viaSheet = await pickMap(b, id);
      if (viaSheet && id === 'metro') { await b.click('.map-pick'); await b.until(`__chog.view() === 'maps'`, 5000); await b.shot('maps-sheet'); check(`${view.label}: Location sheet: five cards with plans, fits the screen`, (await b.ev(`document.querySelectorAll('.map-card .plan').length`)) === 5 && (await b.ev(LAYOUT_PROBE) ?? []).length === 0, JSON.stringify(await b.ev(LAYOUT_PROBE))); await b.click(`.map-card[data-map="${id}"]`); await b.until(`__chog.view() === 'main'`, 5000); }
      const on = await b.ev(`document.querySelector('[data-map="${id}"]').classList.contains('on') && (document.querySelector('.map-pick b')?.innerText ?? '').toUpperCase() === ${JSON.stringify(NAMES[id].toUpperCase())}`);
      // Record what the loading card names before the world replaces it.
      await b.ev(`(() => { window.__where = []; new MutationObserver(() => { const h = document.getElementById('deploy-map'); if (h && !window.__where.includes(h.innerText)) window.__where.push(h.innerText); }).observe(document.body, { subtree: true, childList: true }); })()`);
      await b.click('[data-mode="solo"]'); await b.click('#playbtn');
      await b.until(`__chog.phase === 'play'`, 25000);
      await sleep(800);
      const w = await b.ev(`({ map: __chog.world.mapId, bots: __chog.world.actors.filter((a) => a.team === 'bot').length, pickups: __chog.world.pickups.length, hp: __chog.world.actors[0].maxHp, armorCap: __chog.world.actors[0].maxArmor, where: window.__where })`);
      await b.shot(`map-${id}`);
      check(`${view.label}: choosing ${NAMES[id]} plays a solo run on it, named on the loading card`, on && w.map === id && w.bots === 5 && w.pickups >= 28 && w.where.includes(NAMES[id]), JSON.stringify(w));
      check(`${view.label}: ${NAMES[id]}: a free player starts at 150 health, armour cap 65`, w.hp === 150 && w.armorCap === 65, JSON.stringify(w));
      await b.ev(`__chog.go('pause')`); await sleep(300);
      await b.ev(`__chog.go('quit')`); await b.hub();
    }
    await pickMap(b, 'supermarket');
    await b.go('/?debug'); await b.hub();
    check(`${view.label}: the chosen location is kept as a preference across a reload`, await b.ev(`document.querySelector('[data-map="supermarket"]').classList.contains('on') && localStorage.getItem('chog.map') === 'supermarket'`));
    await pickMap(b, 'room-zero');

    // ---- Visor tracker (DEMO Hunter drill) ----
    await b.click('[data-act="demo"]');
    await b.until(`__chog.view() === 'demo'`, 5000);
    await b.click('[data-train="visor"]');
    await b.until(`__chog.phase === 'play' && __chog.training()?.drill.id === 'visor'`, 20000);
    await sleep(1200);
    const t = await b.ev(`(() => { const c = document.getElementById('tracker'), r = c.getBoundingClientRect(); return { hidden: c.hidden, w: r.width, h: r.height, inView: r.right <= innerWidth && r.bottom <= innerHeight && r.left >= 0 && r.top >= 0, kind: __chog.world.actors[0].ability.kind, hero: document.getElementById('hero').innerText }; })()`);
    await b.shot('visor-tracker');
    check(`${view.label}: the Visor drill shows the tracker on the HUD, on screen, labelled DEMO`, t && !t.hidden && t.w > 40 && t.h > 20 && t.inView && t.kind === 'visor' && /DEMO/.test(t.hero), JSON.stringify(t));
    await b.ev(`__chog.go('pause')`); await sleep(300);
    await b.ev(`__chog.go('quit')`); await b.hub();
    await b.click('[data-mode="solo"]'); await b.click('#playbtn');
    await b.until(`__chog.phase === 'play'`, 25000); await sleep(500);
    check(`${view.label}: the tracker is gone in a game without the Visor`, await b.ev(`document.getElementById('tracker').hidden && __chog.world.actors[0].ability.kind !== 'visor'`));
    await b.ev(`__chog.go('pause')`); await sleep(300);
    await b.ev(`__chog.go('quit')`); await b.hub();
    check(`${view.label}: no page errors`, b.errors.length === 0, b.errors.join(' | '));
  }
} catch (e) {
  check('run completed', false, e?.stack ?? e);
} finally {
  for (const b of open) await b.close();
}
const fails = results.filter((r) => !r.ok).length;
console.log(`\nid-maps: ${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
