// Final QA: every major screen on desktop, tablet and phones (390 and 430 tall, landscape and held upright), in fresh
// headless Chrome profiles against the local full stack. Screenshots + a layout probe per screen (page scroll,
// horizontal overflow, buttons off the stage, controls under 24 px). Emulated devices, NOT real ones.
// Usage: node tools/qa-screens.mjs http://localhost:8790 [shotDir]
import { browser, sleep, LAYOUT_PROBE } from './cdp.mjs';
const [base, shotDir] = process.argv.slice(2);
const DEVICES = [
  { name: 'desktop', w: 1280, h: 720 },
  { name: 'tablet', w: 1024, h: 768, mobile: true, touch: true },
  { name: 'phone390', w: 844, h: 390, mobile: true, touch: true },
  { name: 'phone430', w: 932, h: 430, mobile: true, touch: true },
  { name: 'phone390-upright', w: 390, h: 844, mobile: true, touch: true },
];
const problems = [];
for (const d of DEVICES) {
  const b = await browser(d.name, { base, shotDir, ...d });
  const probe = async (screen) => { await sleep(500); await b.shot(screen); const p = await b.ev(LAYOUT_PROBE); for (const x of p ?? []) problems.push(`${d.name} ${screen}: ${x}`); console.log(`${d.name} ${screen}: ${p?.length ? p.join(' | ') : 'ok'}`); };
  await b.go('/?debug');
  await b.ev(`localStorage.setItem('chog.onboarded','1')`);
  await b.go('/?debug');
  await b.until(`!!document.getElementById('boottip')?.innerText`, 5000); await b.shot('00-loading');
  await b.hub(); await probe('01-hub-guest');
  await b.click('#signin-cta'); await probe('02-auth-sheet');
  await b.click('[data-act=back]');
  await b.go(`/__test/login?provider=google&sub=qa-${d.name}&label=qa@test&to=/%3Fdebug`);
  await b.hub(); await b.until(`!!__chog.acct().profile`, 10000); await probe('03-hub-signed-in');
  for (const [act, name] of [['upgrades', '04-upgrades'], ['ranks', '05-leaderboard'], ['career', '06-career'], ['medals', '07-medals'], ['settings', '08-settings'], ['howto', '09-help'], ['demo', '10-demo']]) {
    await b.click(`.hub-nav [data-act=${act}], #hub [data-act=${act}]`) || await b.ev(`document.querySelector('[data-act=${act}]')?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
    await probe(name);
    const back = await b.ev(`!!document.querySelector('[data-act=back], [data-act=howto-close], [data-act=demo-close]')`);
    if (back) { await b.click('[data-act=back]') || await b.click('[data-act=howto-close]') || await b.click('[data-act=demo-close]'); }
    await b.hub();
  }
  await b.click('[data-go=start]'); await probe('11-operator-select');
  await b.click('[data-go=quit]'); await b.hub();
  await b.click('[data-mode=solo]'); await b.click('#playbtn');
  await b.until(`__chog.phase === 'play'`, 15000); await sleep(1500); await b.shot('12-game-hud');
  const hud = await b.ev(`(() => { const out = []; for (const id of ['vitals','foes','weapon','ability','sys']) { const el = document.getElementById(id); if (!el || el.offsetParent === null) continue; const r = el.getBoundingClientRect(); const st = document.getElementById('stage').getBoundingClientRect(); if (r.left < st.left - 1 || r.right > st.right + 1 || r.top < st.top - 1 || r.bottom > st.bottom + 1) out.push('hud off-screen ' + id); } return out; })()`);
  for (const x of hud ?? []) problems.push(`${d.name} game: ${x}`);
  console.log(`${d.name} 12-game-hud: ${hud?.length ? hud.join(' | ') : 'ok'}`);
  await b.ev(`(() => { const w = __chog.world; for (const a of w.actors) if (a.team === 'player') { a.hp = 0; a.alive = false; } w.outcome = 'dead'; w.playerKill = { cause: 'zone', killerId: -1, weapon: 'x', fromX: 0, fromY: 0, toX: 0, toY: 0, tick: 0 }; })()`);
  await b.until(`__chog.phase === 'results'`, 15000); await sleep(1500); await probe('13-results-practice');
  if (b.errors.length) problems.push(`${d.name}: page errors ${b.errors.slice(0, 3).join(' / ')}`);
  await b.close();
}
console.log(`\n${problems.length ? `${problems.length} problems:\n${problems.join('\n')}` : 'no layout problems'}`);
process.exit(problems.length ? 1 : 0);
