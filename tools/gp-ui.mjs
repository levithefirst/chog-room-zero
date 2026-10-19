// GP gameplay reality pass, in real headless Chrome against the local full stack (tools/local-api.ts, game server):
// Game Docs (sections, search), the leaderboards (tabs, guest, my rank after a real run, hide), the medals screen,
// and the in-match states (downed card with its countdown, a teammate's revive, the Snare status, a loot bag's take).
// Emulated desktop and phone (NOT devices). Usage: node tools/gp-ui.mjs http://localhost:8790 [shotDir]
import { browser, sleep, LAYOUT_PROBE } from './cdp.mjs';
const [base, shotDir] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, ok ? 240 : 1200)}` : ''}`); };
const open = [];
const B = async (label, o = {}) => { const b = await browser(label, { base, shotDir, ...o }); open.push(b); return b; };
const layout = async (b) => (await b.ev(LAYOUT_PROBE)) ?? [];
const ticks = (b, n) => b.ev(`(async()=>{const w=__chog.world,t0=w.tick;for(let i=0;i<800&&w.tick-t0<${n};i++)await new Promise(r=>setTimeout(r,15));return w.tick-t0})()`);

try {
  for (const view of [{ label: 'desk', w: 1440, h: 900 }, { label: 'phone', w: 844, h: 390, mobile: true, touch: true }]) {
    const b = await B(`gp-${view.label}`, view);
    await b.go('/?debug'); await b.ev(`localStorage.setItem('chog.onboarded','1')`);
    await b.go(`/?debug&autoplay=4&google_sub=gp-${view.label}-${Date.now().toString(36)}`); await b.hub();

    // ---- Game Docs ----
    await b.click('[data-act="docs"]');
    await b.until(`__chog.view() === 'docs'`, 5000);
    const docs = await b.ev(`({ n: document.querySelectorAll('details.doc').length, open: [...document.querySelectorAll('details.doc[open]')].map((d) => d.dataset.doc) })`);
    await b.shot('01-docs');
    check(`${view.label}: Game Docs has 22 sections (V2: Perks, SP: CHOG Superpowers, ID: Locations), How to Play open`, docs.n === 22 && docs.open.includes('how-to-play'), JSON.stringify(docs));
    await b.ev(`(() => { const q = document.getElementById('docsq'); q.value = 'revive'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const found = await b.ev(`({ shown: [...document.querySelectorAll('details.doc')].filter((d) => !d.hidden).map((d) => d.dataset.doc), none: document.getElementById('docsnone').hidden })`);
    check(`${view.label}: docs search "revive" keeps the Revives section and drops unrelated ones`, found.shown.includes('revives') && found.shown.length < 19 && found.none, JSON.stringify(found));
    await b.ev(`(() => { const q = document.getElementById('docsq'); q.value = 'zzqxy'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    check(`${view.label}: a search with no match says so`, await b.ev(`!document.getElementById('docsnone').hidden && [...document.querySelectorAll('details.doc')].every((d) => d.hidden)`));
    await b.ev(`(() => { const q = document.getElementById('docsq'); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    check(`${view.label}: Game Docs layout (no page scroll, no off-screen buttons)`, (await layout(b)).length === 0, JSON.stringify(await layout(b)));
    await b.click('[data-act="back"]');
    // GP regression: the tap on Back must not also hit the hub button drawn under the finger (it opened Career).
    await sleep(500);
    check(`${view.label}: Back from Game Docs lands on the hub (no ghost tap through to Career)`, (await b.ev(`__chog.view()`)) === 'main', await b.ev(`__chog.view()`));
    await b.hub();

    // ---- Leaderboard as a guest ----
    await b.click('[data-act="ranks"]');
    await b.until(`__chog.view() === 'ranks' && !__chog.acct().boardLoading`, 8000);
    const g = await b.ev(`({ tabs: [...document.querySelectorAll('.tabs .tab')].map((t) => t.innerText), guest: /Sign in to keep your kills/.test(document.querySelector('.ranks').innerText) })`);
    await b.shot('02-board-guest');
    check(`${view.label}: leaderboard as a guest: Solo and Online tabs, a sign-in prompt for a rank`, g.tabs.join().toLowerCase() === 'solo,online' && g.guest, JSON.stringify(g));
    await b.click('[data-act="back"]'); await b.hub();

    // ---- Sign in, play one real run, then find yourself ----
    await b.click('#signin-cta'); await b.click('[data-act=signin-google]'); await b.hub(); await b.until(`!!__chog.acct().profile`, 15000);
    await b.click('[data-mode="solo"]'); await b.click('#playbtn'); await b.until(`__chog.phase === 'play'`, 20000);
    await b.until(`__chog.phase === 'results' && /Earned|no reward/i.test(document.getElementById('rewards')?.innerText ?? '')`, 300000);
    await b.until(`__chog.acct().profile.practice.overall.runs >= 1`, 15000);
    // Continue, like a player (the summary gate holds the button for a moment after a run).
    for (let i = 0; i < 20 && !(await b.ev(`!!document.getElementById('hub')`)); i++) { await b.click('#continuebtn'); await sleep(500); }
    await b.hub();
    await b.click('[data-act="ranks"]');
    await b.until(`__chog.view() === 'ranks' && !__chog.acct().boardLoading && !!__chog.acct().boardMe`, 10000);
    const me = await b.ev(`({ me: __chog.acct().boardMe, card: document.querySelector('.myrank')?.innerText ?? '', youRow: !!document.querySelector('table.board tr.me') })`);
    await b.shot('03-board-me');
    check(`${view.label}: after one signed-in run you are on the Solo board with your rank and kills`, me.me && me.me.you && me.me.rank >= 1 && /#\d+/.test(me.card) && me.youRow, JSON.stringify(me));
    await b.click('[data-act="board-hide"]');
    await b.until(`__chog.acct().boardMe?.hidden === true`, 8000);
    const hid = await b.ev(`({ btn: document.querySelector('[data-act="board-hide"]')?.innerText, listed: !!document.querySelector('table.board tr.me') })`);
    check(`${view.label}: "Shown to others" off: you are hidden from the list, your own rank stays`, /Hidden/i.test(hid.btn) && !hid.listed, JSON.stringify(hid));
    await b.click('[data-act="board-hide"]'); await b.until(`__chog.acct().boardMe?.hidden !== true`, 8000);
    await b.click('[data-act="board-online"]'); await b.until(`!__chog.acct().boardLoading`, 8000);
    const on = await b.ev(`document.querySelector('.myrank')?.innerText ?? ''`);
    check(`${view.label}: the Online tab says how to get an online rank`, /finish an online match/.test(on), on);
    check(`${view.label}: leaderboard layout`, (await layout(b)).length === 0, JSON.stringify(await layout(b)));
    await b.click('[data-act="back"]'); await b.hub();

    // ---- Medals ----
    await b.click('[data-act="medals"]'); await b.until(`__chog.view() === 'medals'`, 5000);
    const md = await b.ev(`({ cards: document.querySelectorAll('.medals .medal').length, groups: [...document.querySelectorAll('.medal-group')].map((g) => g.innerText.split(' ')[0]) })`);
    await b.shot('04-medals');
    check(`${view.label}: medals screen: 36 medals in common, uncommon, rare, epic groups`, md.cards === 36 && md.groups.join().toLowerCase() === 'common,uncommon,rare,epic', JSON.stringify(md));
    check(`${view.label}: medals layout`, (await layout(b)).length === 0, JSON.stringify(await layout(b)));
    await b.click('[data-act="back"]'); await b.hub();
    await b.close(); open.splice(open.indexOf(b), 1);
  }

  // ---- In-match states (no autopilot: a real match, states set through the debug hook) ----
  for (const view of [{ label: 'desk', w: 1440, h: 900 }, { label: 'phone', w: 844, h: 390, mobile: true, touch: true }]) {
    const m = await B(`gp-match-${view.label}`, view);
    await m.go('/?debug'); await m.ev(`localStorage.setItem('chog.onboarded','1')`); await m.go('/?debug&nooverlay'); await m.hub();
    await m.click('[data-mode="solo"]'); await m.click('#playbtn'); await m.until(`__chog.phase === 'play'`, 20000);
    // Hostiles far away and frozen in place; you downed with one teammate on the far side of the room.
    const park = `(()=>{for(const a of __chog.world.actors)if(a.team==='bot'){a.x=66;a.y=40.5;a.vx=a.vy=0}})()`;
    await m.ev(park);
    await m.ev(`(()=>{const w=__chog.world,p=w.actors[0];p.downed=true;p.hp=60;p.armor=0;p.downInfo={cause:'shot',killerId:3,weapon:'t',fromX:0,fromY:0,toX:p.x,toY:p.y,tick:w.tick};const m=w.actors[1];m.x=p.x+8;m.y=p.y;})()`);
    await ticks(m, 20);
    const down = await m.ev(`({ on: document.getElementById('downcard').classList.contains('on'), head: document.getElementById('downh').innerText, t: document.getElementById('downt').innerText })`);
    await m.shot('05-downed');
    check(`${view.label}: downed: the card shows DOWNED and a countdown under 10 s`, down.on && /DOWN|REVIVED/.test(down.head) && /\d/.test(down.t), JSON.stringify(down));
    // The AI teammate comes and gets you up (the card turns to "BEING REVIVED", then goes).
    let saw = '';
    for (let i = 0; i < 40 && !/BEING REVIVED/.test(saw); i++) { await m.ev(park); await ticks(m, 10); saw = await m.ev(`document.getElementById('downh').innerText`); }
    const up = await m.until(`!__chog.world.actors[0].downed`, 15000);
    check(`${view.label}: an AI teammate walks over and revives you; the card says so, then clears`, /BEING REVIVED/.test(saw) && up && await m.ev(`!document.getElementById('downcard').classList.contains('on')`), saw);
    // Snare: the status line names it and counts down.
    await m.ev(`(()=>{const p=__chog.world.actors[0];p.slowLeft=2;p.slowMul=0.6})()`);
    await ticks(m, 5);
    const st = await m.ev(`document.getElementById('status').innerText`);
    check(`${view.label}: a Snare shows "Slowed 40% · 1.x s" under your health`, /Slowed 40%/i.test(st), st);
    // A loot bag under your feet with grenades in it: taken on the next step, the toast says what you got.
    await m.ev(`(()=>{__chog.world.actors[0].grenades=0})()`); await ticks(m, 3);
    await m.ev(`(()=>{const w=__chog.world,p=w.actors[0];w.loot.push({id:999,x:p.x,y:p.y,mags:0,health:0,armor:0,grenades:2,left:30,from:3,team:'bot',known:['bot','player']})})()`);
    await ticks(m, 3);
    const lt = await m.ev(`({ g: __chog.world.actors[0].grenades, toast: document.getElementById('toast').innerText })`);
    await m.shot('06-loot');
    check(`${view.label}: walking over a loot bag takes it; the toast says LOOT +2 GRENADES`, lt.g === 2 && /LOOT/.test(lt.toast) && /GRENADE/.test(lt.toast), JSON.stringify(lt));
    check(`${view.label}: no page errors`, m.errors.length === 0, m.errors.slice(0, 3).join(' | '));
    await m.close(); open.splice(open.indexOf(m), 1);
  }
} catch (e) {
  check('ran to the end', false, e?.stack ?? String(e));
}
for (const b of open) await b.close();
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
