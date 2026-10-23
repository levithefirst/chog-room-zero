// Owner 2026-10-17: the progression loop in real headless Chrome against the local full stack (tools/local-api.ts):
// play a solo run -> results list every reward line -> the account is paid once (server) -> Upgrades -> buy -> the
// next run. A guest sees what the run would have paid and is told to sign in. Emulated desktop and phone, NOT devices.
// Usage: node tools/qa-rewards.mjs http://localhost:8790 [shotDir]
import { browser, sleep } from './cdp.mjs';
const [base, shotDir] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, ok ? 300 : 1500)}` : ''}`); };
const open = [];
const B = async (label, o = {}) => { const b = await browser(label, { base, shotDir, ...o }); open.push(b); return b; };
const prof = (b) => b.ev(`(() => { const p = __chog.acct().profile; return p ? { xp: p.xp, shards: p.shards, runs: p.practice.overall.runs, up: p.upgrades } : null; })()`);
// The autopilot plays a whole run (seconds of real time, like a player): wait for the results screen.
const playRun = async (b) => { await b.click('[data-mode="solo"]'); await b.click('#playbtn'); await b.until(`__chog.phase === 'play'`, 20000); return b.until(`__chog.phase === 'results' && !!document.getElementById('rewards')`, 300000); };

try {
  for (const view of [{ label: 'desk', w: 1440, h: 900 }, { label: 'phone', w: 844, h: 390, mobile: true, touch: true }]) {
    const S = await B(`signed-${view.label}`, view);
    await S.go('/?debug'); await S.ev(`localStorage.setItem('chog.onboarded','1')`);
    await S.go(`/?debug&autoplay=4&google_sub=rewards-${view.label}-${Date.now().toString(36)}`); await S.hub(); // a fresh account every run
    await S.click('#signin-cta'); await S.click('[data-act=signin-google]'); await S.hub(); await S.until(`!!__chog.acct().profile`, 15000);
    const p0 = await prof(S);
    const done = await playRun(S);
    await S.until(`/Earned/.test(document.getElementById('rewards')?.innerText ?? '') || /no reward/i.test(document.getElementById('rewards')?.innerText ?? '')`, 20000);
    await sleep(800); await S.shot('01-practice-results');
    const r = await S.ev(`(() => { const el = document.getElementById('rewards'); return { text: el.innerText, shards: document.getElementById('rw-shards')?.innerText ?? null, xp: document.getElementById('rw-xp')?.innerText ?? null, use: document.getElementById('rw-use')?.innerText ?? '', up: !!document.getElementById('toupgrades'), run: __chog.world.actors[0].kills }; })()`);
    const p1 = await prof(S);
    check(`${view.label}: practice results list what the run paid (Match played, a total, what the shards buy) and offer Upgrades`, done && /Match played/.test(r.text) && /Earned/.test(r.text) && /shards/.test(r.use) && r.up, JSON.stringify(r));
    const paid = Number(r.shards?.replace('+', '')), xp = Number(r.xp?.replace(/[^0-9]/g, ''));
    check(`${view.label}: a new account was paid exactly the lines shown (server ledger), once`, p0.shards === 0 && p1.shards - p0.shards === paid && p1.xp - p0.xp === xp && paid > 0 && p1.runs === p0.runs + 1, JSON.stringify({ p0, p1, paid, xp }));
    // Owner 2026-10-21 (t30u) practice table: each line shown is 10 a run, 10 a kill (up to 5), 30 a clear; the total is their
    // sum and is what the ledger paid (checked above).
    const L = await S.ev(`[...document.querySelectorAll('#rewards .rw-lines li:not(.head):not(.total)')].map((li) => ({ label: li.querySelector('span')?.innerText ?? '', shards: Number((li.querySelector('b')?.innerText || '0').replace('+', '')) }))`);
    const line = (re) => L.find((l) => re.test(l.label));
    const kills = line(/kill/i), win = line(/victory/i);
    const k = kills ? Number(/(\d+)/.exec(kills.label)[1]) : 0;
    check(`${view.label}: the lines are the new practice table (Match played +10, +10 a kill, Victory +30) and add up to the total`,
      line(/match played/i)?.shards === 10 && (!kills || kills.shards === 10 * Math.min(5, k)) && (!win || win.shards === 30) && L.reduce((a, l) => a + l.shards, 0) === paid && k === Math.min(5, r.run),
      JSON.stringify({ lines: L, paid, runKills: r.run }));
    // Replaying the same run report pays nothing more (the run id and its ticket are spent).
    const replay = await S.ev(`fetch('/api/game/practice', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: 'forged-' + Date.now().toString(36), hero: 'benja', won: true, seconds: 60, kills: 5, bullets: 10, hits: 5, damageDealt: 900, damageTaken: 10, hpLeft: 50, pickups: 0, abilities: 0 }) }).then((x) => x.json())`);
    check(`${view.label}: a forged run without a start ticket is stored and pays nothing`, replay.ok && replay.reward?.none === 'unverified' && replay.reward?.shards === 0, JSON.stringify(replay.reward));
    // Not enough for a rank yet: the cheapest one is shown as not affordable, then Again plays the next run (paid too).
    let runs = 1;
    while ((await prof(S)).shards < 15 && runs < 8) {
      const prev = await prof(S);
      await S.click('[data-go="restart"]'); await S.until(`__chog.phase === 'play'`, 20000);
      await S.until(`__chog.phase === 'results' && /Earned|no reward/i.test(document.getElementById('rewards')?.innerText ?? '')`, 300000);
      await S.until(`__chog.acct().profile.practice.overall.runs === ${prev.runs + 1}`, 15000); await sleep(1500);
      runs++;
      const now = await prof(S);
      check(`${view.label}: run ${runs} (Again) is paid too`, now.shards > prev.shards && now.runs > prev.runs, JSON.stringify({ prev, now }));
    }
    // Results -> Upgrades -> buy the cheapest rank -> shards go down by its cost.
    await S.click('#toupgrades');
    const inUp = await S.until(`__chog.view() === 'upgrades'`, 8000);
    await sleep(400); await S.shot('02-upgrades');
    const before = (await prof(S)).shards;
    await S.click('[data-upgrade="vitality"]'); await sleep(1500);
    const after = await prof(S);
    check(`${view.label}: Upgrades from the results; buying Vitality 1 spends 15 shards (owner 2026-10-23 price)`, inUp && after.up.vitality === 1 && before - after.shards === 15, JSON.stringify({ inUp, before, after }));
    await S.close(); open.splice(open.indexOf(S), 1);
  }
  // Guest: the same breakdown as a preview, and "sign in to keep".
  const G = await B('guest', { w: 390, h: 844, mobile: true, touch: true });
  await G.go('/?debug'); await G.ev(`localStorage.setItem('chog.onboarded','1')`); await G.go('/?debug&autoplay=5'); await G.hub();
  await playRun(G); await sleep(800); await G.shot('03-guest-results');
  const g = await G.ev(`({ text: document.getElementById('rewards').innerText, keep: document.getElementById('rw-keep')?.innerText ?? '' })`);
  check('guest: the run shows what it would have paid and says to sign in to keep it', /Would earn/.test(g.text) && /Sign in/.test(g.keep), JSON.stringify(g));
} catch (e) {
  check('rewards journey ran to the end', false, e?.stack ?? e);
} finally {
  for (const b of open) await b.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
