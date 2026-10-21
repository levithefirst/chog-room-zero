// Final QA: failure states in real headless Chrome against the local full stack. The game must never strand the
// player on a blank or loading screen. Needs the local stack (tools/local-api.ts) for /__test/slow, and a static
// server with NO API at noApiBase (e.g. `npx vite preview --port 8795`). Emulated, NOT real devices or networks.
// Usage: node tools/qa-errors.mjs http://localhost:8790 http://localhost:8795 [shotDir]
import { browser, sleep } from './cdp.mjs';
const [base, noApiBase, shotDir] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, 240)}` : ''}`); };
const open = [];
try {
  // 1. The account API hangs: loading still hands over to the hub within ~8 s, and later loads recover once it answers.
  await fetch(`${base}/__test/slow?ms=20000`);
  const a = await browser('slow-api', { base, shotDir }); open.push(a);
  await a.go('/?debug'); await a.ev(`localStorage.setItem('chog.onboarded','1')`);
  // Let that first page finish booting before timing the next load: navigating away 300 ms in, while it was still
  // starting the renderer (1-3 s of one main-thread task on software GL), held the new page's start for up to 4 s and
  // was counted as loading time (production dde3f5a failed the same way, 2026-10-21).
  await a.until(`!document.getElementById('boot')`, 20000);
  const t0 = Date.now();
  await a.go('/?debug');
  const hub = await a.hub();
  const took = Date.now() - t0;
  await a.shot('01-hub-api-hanging');
  check('API hanging: loading hands over to a usable hub (no endless loading)', hub && took < 12000, `${took} ms`);
  await fetch(`${base}/__test/slow?ms=0`);
  await sleep(12000); // let the hung requests time out
  await a.ev(`document.querySelector('[data-act=ranks]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  const recovered = await a.until(`__chog.acct().config?.db === true`, 15000);
  check('API back: the next screen that needs the account loads it (nothing stuck "loading" forever)', recovered);
  // 2. No API at all (static hosting): boots to the hub, sign-in sheet says it is unavailable, PLAY vs bots works.
  const n = await browser('no-api', { base: noApiBase, shotDir }); open.push(n);
  await n.go('/?debug'); await n.ev(`localStorage.setItem('chog.onboarded','1')`); await n.go('/?debug');
  check('no API: the hub still opens', await n.hub());
  await n.click('#signin-cta');
  const st = await n.ev(`({ g: document.querySelector('[data-act=signin-google]')?.disabled, w: document.querySelector('[data-act=signin-wallet]')?.disabled, text: document.getElementById('authsheet')?.innerText ?? '' })`);
  await n.shot('02-signin-no-api');
  check('no API: the sign-in sheet still shows both options, disabled, with a reason', st.g === true && st.w === true && /unavailable/i.test(st.text), JSON.stringify(st));
  await n.click('[data-act=back]');
  await n.click('[data-mode=solo]'); await n.click('#playbtn');
  check('no API: vs bots still plays', await n.until(`__chog.phase === 'play'`, 15000));
  // 3. Game server down: an online mode shows a clear status and never locks the hub.
  const g = await browser('no-server', { base, shotDir }); open.push(g);
  await g.go('/?debug'); await g.ev(`localStorage.setItem('chog.onboarded','1')`);
  await g.go('/?debug&server=' + encodeURIComponent('ws://127.0.0.1:9/ws')); await g.hub();
  await g.click('[data-mode="1v1"]'); await g.click('#playbtn');
  // CF: the PLAY button carries its label in .pl (the mode line sits under it).
  const busy = await g.until(`(document.querySelector('#playbtn .pl') ?? document.getElementById('playbtn'))?.innerText.trim().toUpperCase() === 'CANCEL'`, 5000);
  await g.click('#playbtn');
  const idle = await g.until(`(document.querySelector('#playbtn .pl') ?? document.getElementById('playbtn'))?.innerText.trim().toUpperCase() === 'PLAY'`, 5000);
  await g.shot('03-server-down');
  check('game server down: Play shows Cancel while connecting, and Cancel always returns to Play', busy && idle);
  // 4. Browser Back from a sub-screen returns to the hub instead of leaving the game.
  const k = await browser('back', { base, shotDir }); open.push(k);
  await k.go('/?debug'); await k.ev(`localStorage.setItem('chog.onboarded','1')`); await k.go('/?debug'); await k.hub();
  await k.click('[data-act=upgrades]');
  const inUp = await k.ev(`__chog.view()`);
  await k.ev(`history.back()`); await sleep(800);
  check('browser Back from Upgrades returns to the hub (page not left)', inUp === 'upgrades' && (await k.ev(`__chog.view()`)) === 'main' && (await k.ev(`location.pathname`)) === '/');
  for (const x of open) if (x.errors.length) check(`no page errors (${x.label})`, false, x.errors.slice(0, 3).join(' / '));
} catch (e) {
  check('ran to the end', false, e?.stack ?? e);
} finally {
  await fetch(`${base}/__test/slow?ms=0`).catch(() => undefined);
  for (const x of open) await x.close().catch(() => undefined);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
