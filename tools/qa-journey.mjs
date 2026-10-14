// Final QA acceptance journey in real headless Chrome (fresh profiles, emulated desktop/phone, NOT real devices)
// against the local full stack (tools/local-api.ts: the real /api/game and /api/auth/wallet handlers on PGlite, the
// real game server). Google's own page cannot be reached from the container, so the local Google start route signs in
// a test Google identity and returns exactly like the real callback (/?signedin=google). The wallet is a real EIP-6963
// provider injected into the page that signs the server's SIWE challenge with a fixed test key (EIP-191), verified by
// the real /api/auth/wallet/verify; the Monad RPC is faked for that address (it holds Blaze, a 1:1).
// Usage: node tools/qa-journey.mjs http://localhost:8790 [shotDir]
import { browser, sleep } from './cdp.mjs';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
const [base, shotDir] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, ok ? 300 : 1500)}` : ''}`); };
const open = [];
const B = async (label, o = {}) => { const b = await browser(label, { base, shotDir, ...o }); open.push(b); return b; };
const acct = (b) => b.ev(`(() => { const a = __chog.acct(); const p = a.profile; return { signedIn: a.signedIn, ids: a.identities.map((i) => i.provider), ...(p ? { account: p.account, xp: p.xp, level: p.level, shards: p.shards, rating: p.rating, matches: p.matches, wins: p.wins, callsign: p.callsign, medals: Object.keys(p.medals).length, upgrades: p.upgrades, online: p.online, practice: p.practice.overall.runs } : {}) }; })()`);
const fresh = async (b, path = '/?debug') => { await b.go('/?debug'); await b.ev(`localStorage.setItem('chog.onboarded','1')`); await b.go(path); await b.hub(); await sleep(400); };

// The test wallet (same key as tools/local-api.ts TEST_KEY).
const KEY = Uint8Array.from('4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'.match(/../g).map((h) => parseInt(h, 16)));
const ADDR = '0x' + Buffer.from(keccak_256(secp256k1.getPublicKey(KEY, false).subarray(1)).subarray(12)).toString('hex');
function personalSign(msgHex) {
  const msg = Buffer.from(msgHex.slice(2), 'hex');
  const digest = keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${msg.length}`), msg]));
  const rec = secp256k1.sign(digest, KEY, { prehash: false, format: 'recovered' });
  return '0x' + Buffer.from(rec.subarray(1, 65)).toString('hex') + (27 + rec[0]).toString(16);
}
async function withWallet(b, { reject = false } = {}) {
  await b.cmd('Runtime.addBinding', { name: 'rzSignReq' });
  b.on(async (m) => {
    if (m.method !== 'Runtime.bindingCalled' || m.params.name !== 'rzSignReq') return;
    const sig = reject ? 'REJECT' : personalSign(JSON.parse(m.params.payload).msg);
    await b.ev(`window.__rzSigned(${JSON.stringify(sig)})`);
  });
  await b.cmd('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const provider = { request: async ({ method, params }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return ['${ADDR}'];
      if (method === 'eth_chainId') return '0x8f';
      if (method === 'personal_sign') return await new Promise((res, rej) => { window.__rzSigned = (s) => s === 'REJECT' ? rej(Object.assign(new Error('User rejected'), { code: 4001 })) : res(s); rzSignReq(JSON.stringify({ msg: params[0] })); });
      throw new Error('unsupported ' + method);
    } };
    const detail = Object.freeze({ info: { uuid: 'test', name: 'MetaMask', icon: '', rdns: 'io.metamask' }, provider });
    window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail })));
  })();` });
}

try {
  // ---- 1. Guest: loading, hub, Sign in opens the sign-in sheet (not Settings), Google returns to the hub signed in ----
  const A = await B('alice');
  await A.go('/?debug'); await A.ev(`localStorage.setItem('chog.onboarded','1')`);
  await A.go('/?debug&google_sub=alice-g');
  const boot = await A.until(`(() => { const b = document.getElementById('boot'); return b && document.getElementById('boottip')?.innerText ? { tip: document.getElementById('boottip').innerText } : null; })()`, 5000);
  check('loading: its own full screen with tip and progress before the hub', boot);
  await A.hub(); await sleep(500); await A.shot('01-hub-guest');
  const guest = await A.ev(`({ chip: document.getElementById('callsign').innerText, sub: document.querySelector('.player-chip small')?.innerText ?? null })`);
  check('guest identity is compact (just the guest name)', /^Guest-/.test(guest.chip) && guest.sub === null, JSON.stringify(guest));
  await A.click('#signin-cta');
  const sheet = await A.ev(`({ view: __chog.view(), text: document.getElementById('authsheet')?.innerText ?? '' })`);
  await A.shot('02-sign-in-sheet');
  check('"Sign in" opens the sign-in sheet with Continue with Google and Continue with Wallet (not Settings)', sheet.view === 'auth' && /Continue with Google/i.test(sheet.text) && /Continue with Wallet/i.test(sheet.text), JSON.stringify(sheet));
  await A.click('[data-act=signin-google]');
  await A.hub(); await A.until(`!!__chog.acct().profile`, 15000);
  let a = await acct(A);
  check('Google: back in the hub, signed in, account loaded at level 1, 0 XP, 0 shards, no guest name', a.signedIn && a.ids.includes('google') && a.xp === 0 && a.shards === 0 && !/^Guest-/.test(await A.text('#callsign')) && (await A.ev(`__chog.view()`)) === 'main' && !(await A.ev(`!!document.getElementById('signin-cta')`)), JSON.stringify(a));
  // Callsign through the dialog.
  await A.click('[data-act=career]'); await A.click('[data-act=nick]');
  await A.ev(`document.getElementById('nickin').value = 'Alice-QA'`); await A.ev(`document.querySelector('[data-form=nick]').requestSubmit()`);
  await sleep(1300); await A.click('[data-act=back]');
  a = await acct(A);
  check('callsign saved on the account', a.callsign === 'Alice-QA');
  // Reload: still signed in, same account.
  await A.go('/?debug'); await A.hub(); await A.until(`!!__chog.acct().profile`, 10000);
  const aReload = await acct(A);
  check('reload after sign-in keeps the account and callsign', aReload.account === a.account && aReload.callsign === 'Alice-QA');
  // Logout and log in again: same account, same data.
  await A.click('[data-act=settings]'); await A.click('[data-act=signout]'); await A.hub(); await sleep(800);
  const out = await acct(A);
  check('sign out: back to guest in the hub', !out.signedIn && /^Guest-/.test(await A.text('#callsign')) && !!(await A.ev(`!!document.getElementById('signin-cta')`)));
  await A.go('/?debug&google_sub=alice-g'); await A.hub();
  await A.click('#signin-cta'); await A.click('[data-act=signin-google]'); await A.hub(); await A.until(`!!__chog.acct().profile`, 15000);
  const back = await acct(A);
  check('sign in again: the same account comes back (no second account)', back.account === a.account && back.callsign === 'Alice-QA');

  // ---- 2. Wallet: guest -> Continue with Wallet (real SIWE) -> holder with Blaze; a rejected signature is handled ----
  const W = await B('wallet');
  await withWallet(W, { reject: true });
  await fresh(W);
  await W.click('#signin-cta'); await W.click('[data-act=signin-wallet]');
  const rej = await W.until(`document.getElementById('authmsg')?.innerText || null`, 8000);
  check('wallet: a rejected signature leaves you signed out with a short reason', /Cancelled/i.test(rej ?? '') && !(await W.ev(`__chog.acct().signedIn`)), rej);
  await W.close(); open.splice(open.indexOf(W), 1);
  const H = await B('holder');
  await withWallet(H);
  await fresh(H);
  await H.click('#signin-cta'); await H.click('[data-act=signin-wallet]');
  await H.until(`__chog.view() === 'main' && !!__chog.acct().profile`, 20000);
  await H.until(`!!__chog.acct().tokens`, 15000); await sleep(800);
  const h = await acct(H);
  const hp = await H.ev(`({ chog: document.getElementById('chogpanel').innerText, five: document.querySelector('[data-mode="5v5"]').innerText })`);
  await H.shot('03-holder-hub');
  check('wallet: guest -> Continue with Wallet -> signed in (real signature check) and back in the hub', h.signedIn && h.ids.includes('wallet'), JSON.stringify(h));
  check('wallet: Chog detected on Monad (fake RPC), class Blaze 1:1 with +75% health, signature and counter', /Blaze/i.test(hp.chog) && /1:1/.test(hp.chog) && /\+75%/.test(hp.chog) && /Flashfire/i.test(hp.chog) && /Counter/i.test(hp.chog), hp.chog.replace(/\n/g, ' | '));
  check('wallet: 5v5 open for the holder', !/Holders only/i.test(hp.five), hp.five);

  // ---- 3. Squad + online 3v3: A leads a squad with B; four solo players fill the room; A and B on one team ----
  const Bb = await B('bob');
  await fresh(Bb, '/?debug&google_sub=bob-g&drive=1&driveAfter=24');
  await Bb.click('#signin-cta'); await Bb.click('[data-act=signin-google]'); await Bb.hub(); await Bb.until(`!!__chog.acct().profile`, 15000);
  await A.go('/?debug&drive=1&driveAfter=24'); await A.hub(); await A.until(`!!__chog.acct().profile`, 10000);
  await A.click('[data-act=squad-create]');
  const code = await A.until(`document.getElementById('squadcodeshown')?.innerText || null`, 30000);
  await Bb.ev(`document.getElementById('squadcode').value = 'ZZZZZ'`); await Bb.click('[data-act=squad-join]');
  const bad = await Bb.until(`__chog.net()?.message || null`, 15000);
  check('squad: an unknown code says so', /No squad with that code/i.test(bad ?? ''), bad);
  await Bb.ev(`document.getElementById('squadcode').value = ${JSON.stringify(code)}`); await Bb.click('[data-act=squad-join]');
  const sq = await Bb.until(`(() => { const p = __chog.net()?.party; return p?.members.length === 2 ? p.members.map((m) => m.name + (m.leader ? '*' : '')) : null; })()`, 15000);
  const netDiag = (b) => b.ev(`(() => { const n = __chog.net(); return n ? { state: n.state, msg: n.message, party: n.party, log: n.log.slice(-8) } : null; })()`);
  check('squad: created in the hub, joined by code, leader marked', sq && sq.includes('Alice-QA*'), sq ? JSON.stringify(sq) : JSON.stringify({ code, leader: await netDiag(A), member: await netDiag(Bb) }));
  check('squad: a good join leaves no stale error on screen', !(await Bb.ev(`__chog.net()?.message`)), await Bb.ev(`__chog.net()?.message`));
  await Bb.click('[data-mode="3v3"]');
  check('squad: the member cannot start the match', await Bb.ev(`document.getElementById('playbtn').disabled`));
  const solos = [];
  for (let i = 0; i < 4; i++) { const s = await B(`solo${i}`); await fresh(s, '/?debug&drive=1&driveAfter=24'); solos.push(s); }
  await A.click('[data-mode="3v3"]'); await A.click('#playbtn');
  for (const s of solos) { await s.click('[data-mode="3v3"]'); await s.click('#playbtn'); }
  const all = [A, Bb, ...solos];
  const inMatch = await Promise.all(all.map((x) => x.until(`__chog.online() && __chog.phase === 'play'`, 90000)));
  const rosters = await Promise.all(all.map((x) => x.ev(`(() => { const m = __chog.net().match; return { room: m.room, team: m.team, me: __chog.world.actors[0].name, size: m.roster.length }; })()`)));
  check('3v3: all six browsers in one server room', inMatch.every(Boolean) && new Set(rosters.map((r) => r.room)).size === 1 && rosters.every((r) => r.size === 6), JSON.stringify(rosters));
  check('3v3: the squad is on one team', rosters[0].team === rosters[1].team, JSON.stringify(rosters.slice(0, 2)));
  await sleep(3000); await A.shot('04-3v3-match');
  const over = await Promise.all(all.map((x) => x.until(`!!__chog.net()?.over`, 300000)));
  check('3v3: the match finished on the server for everyone', over.every(Boolean));
  // The scripted drivers each throw one grenade at a target they see 4-9 u away: the server spends it and the
  // snapshot carries the new count back to that browser.
  const nadesLeft = await Promise.all(all.map((x) => x.ev(`[__chog.world.actors[0].grenades, __chog.world.actors[0].maxGrenades]`)));
  check('3v3 online: grenades go through the real server (a player server-side count dropped below its capacity)', nadesLeft.some(([n, m]) => n < m), JSON.stringify(nadesLeft));
  await A.until(`!!document.getElementById('rewards') || /Not saved/.test(document.getElementById('overlay').innerText)`, 30000); await sleep(1500);
  const resText = await A.text(); await A.shot('05-results');
  check('results: result, XP, shards, rating change, level bar, Continue', /Victory|Defeat|Draw/i.test(resText) && /XP/.test(resText) && /Shards/i.test(resText) && /Rating/i.test(resText) && /Continue/i.test(resText), resText.replace(/\n/g, ' '));
  const a2 = await acct(A);
  check('settlement: account credited once on the server (XP and shards up, 1 match)', a2.xp > 0 && a2.shards > 0 && a2.matches === 1 && a2.online.matches === 1, JSON.stringify({ xp: a2.xp, shards: a2.shards, matches: a2.matches }));
  // A repeated settle request pays nothing more.
  const again = await A.ev(`fetch('/api/game/settle', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ matchId: __chog.net().over.matchId }) }).then((r) => r.json())`);
  const a3 = await acct(A); await A.go('/?debug'); await A.hub(); await A.until(`!!__chog.acct().profile`, 10000); const a4 = await acct(A);
  check('settlement is idempotent: a second settle changes nothing', again.already === true && a4.xp === a2.xp && a4.shards === a2.shards && a3.matches === 1, JSON.stringify(again));
  // Continue -> hub with fresh numbers (on the follower too).
  await Bb.click('#continuebtn'); await Bb.hub();
  const bHub = await Bb.ev(`({ shards: document.getElementById('hubshards').innerText, xp: document.getElementById('hubxp').innerText })`);
  const bAcct = await acct(Bb);
  check('Continue returns to the hub with the updated account (no stale values)', Number(bHub.shards) === bAcct.shards && bAcct.shards > 0 && bAcct.matches === 1 && !/^0 /.test(bHub.xp), JSON.stringify({ bHub, shards: bAcct.shards, xp: bAcct.xp }));
  for (const s of solos) { await s.close(); open.splice(open.indexOf(s), 1); }
  await Bb.close(); open.splice(open.indexOf(Bb), 1);
  // Leaderboard has real rows now.
  await A.click('[data-act=ranks]'); await sleep(600);
  const board = await A.text(); await A.shot('06-leaderboard');
  check('leaderboard populated by the settled match (callsign, kills, wins, matches, level, rating, Chog)', /Alice-QA/.test(board) && /KILLS/i.test(board) && /RATING/i.test(board), board.slice(0, 160).replace(/\n/g, ' '));
  await A.click('[data-act=back]');
  // Upgrades: a double tap buys exactly one rank.
  await A.click('[data-act=upgrades]');
  const before = (await acct(A)).shards;
  await A.ev(`(() => { const b = document.querySelector('[data-upgrade="vitality"]'); for (let i = 0; i < 2; i++) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); })()`);
  await A.until(`__chog.acct().profile.upgrades.vitality >= 1 && !__chog.acct().busy`, 10000); await sleep(600);
  const a5 = await acct(A); await A.shot('07-upgrades-bought');
  check('upgrade: a double tap buys one rank, shards drop by its cost, card highlights', a5.upgrades.vitality === 1 && a5.shards === before - 10, JSON.stringify({ before, after: a5.shards, up: a5.upgrades }));
  await A.go('/?debug'); await A.hub(); await A.until(`!!__chog.acct().profile`, 10000);
  check('upgrade survives a reload', (await acct(A)).upgrades.vitality === 1);

  // ---- 4. Another device (phone, upright): same account, same everything ----
  const C = await B('alice-phone', { w: 390, h: 844, mobile: true, touch: true });
  await fresh(C, '/?debug&google_sub=alice-g');
  await C.click('#signin-cta'); await C.click('[data-act=signin-google]'); await C.hub(); await C.until(`!!__chog.acct().profile`, 15000); await sleep(600);
  const c = await acct(C), aNow = await acct(A);
  await C.shot('08-second-device-phone');
  check('second device: same XP, level, shards, upgrades, rating, callsign, medals, career', c.account === aNow.account && c.xp === aNow.xp && c.shards === aNow.shards && c.level === aNow.level && c.rating === aNow.rating
    && c.callsign === 'Alice-QA' && c.upgrades.vitality === 1 && c.medals === aNow.medals && JSON.stringify(c.online) === JSON.stringify(aNow.online), JSON.stringify({ c, aNow }));

  await C.close(); open.splice(open.indexOf(C), 1);
  // ---- 5. 5v5: holder alone is accepted; a squad with a non-holder is refused by the server for everyone ----
  await H.click('[data-mode="5v5"]'); await H.click('#playbtn');
  const q = await H.until(`(() => { const n = __chog.net(); return n?.state === 'queued' ? { need: n.queue.need, tier: n.profile?.tier, holder: n.profile?.holder } : null; })()`, 30000);
  check('5v5: the server checked the holder ticket and queued the holder', q && q.need === 10 && q.holder && q.tier === 'legendary', JSON.stringify(q));
  await H.click('#playbtn');
  await H.until(`__chog.net()?.state === 'idle'`, 8000);
  await H.click('[data-act=squad-create]');
  const hcode = await H.until(`document.getElementById('squadcodeshown')?.innerText || null`, 15000);
  const F = await B('freebie'); await fresh(F);
  await F.ev(`document.getElementById('squadcode').value = ${JSON.stringify(hcode)}`); await F.click('[data-act=squad-join]');
  await H.until(`__chog.net()?.party?.members.length === 2`, 15000);
  await H.click('[data-mode="5v5"]');
  // The holder's PLAY is enabled (they hold a Chog); the server must refuse the squad because a member does not.
  await H.click('#playbtn');
  const refused = await H.until(`(() => { const n = __chog.net(); return n && n.state !== 'queued' && /verified Chog/i.test(n.message) ? n.message : null; })()`, 15000);
  check('5v5: a squad with a non-holder is refused on the server (every member must hold)', refused, refused);

  for (const x of [H, F, A]) { await x.close(); open.splice(open.indexOf(x), 1); }
  // ---- 6. The default game: you + 2 AI teammates who move and fight ----
  const D = await B('default');
  await fresh(D, '/?debug&autoplay=3');
  await D.click('[data-mode="solo"]'); await D.click('#playbtn');
  await D.until(`__chog.phase === 'play'`, 15000);
  const start = await D.ev(`__chog.world.actors.filter((a) => a.team === 'player').map((a) => ({ n: a.name, ai: a.ai, x: a.x, y: a.y }))`);
  await sleep(25000);
  const later = await D.ev(`__chog.world.actors.filter((a) => a.team === 'player').map((a) => ({ n: a.name, x: a.x, y: a.y, shots: a.shots, dealt: Math.round(a.damageDealt), alive: a.alive }))`);
  await D.shot('09-default-game');
  const moved = later.slice(1).every((m, i) => Math.hypot(m.x - start[i + 1].x, m.y - start[i + 1].y) > 2);
  check('default game: you + 2 AI teammates (not online 3v3), and they move', start.length === 3 && start.filter((x) => x.ai).length === 2 && !(await D.ev(`__chog.online()`)) && moved, JSON.stringify(later));
  const fought = await D.until(`__chog.world.actors.filter((a) => a.team === 'player' && a.ai).some((a) => a.shots > 0)`, 90000);
  check('default game: AI teammates fight (fire at hostiles) in the real browser', fought, JSON.stringify(await D.ev(`__chog.world.actors.filter((a) => a.team === 'player').map((a) => [a.name, a.shots, Math.round(a.damageDealt), a.kills])`)));

  // ---- 7. Free roster and grenades, from a truly fresh browser (nothing stored: the first-run card shows) ----
  const RS = await B('roster');
  await RS.go('/?debug');
  const firstRun = await RS.until(`!document.getElementById('boot') && !!document.querySelector('[data-act=howto-close]')`, 30000);
  await RS.shot('10-first-run');
  const toHub = firstRun && (await RS.click('[data-act=howto-close]')) && (await RS.hub());
  check('fresh browser: loading screen, then How to play, then Got it opens the hub', toHub);
  await RS.click('.op-show');
  const roster = await RS.ev(`[...document.querySelectorAll('.heroes .hero')].map((e) => e.querySelector('b').innerText.trim() + ' ' + e.querySelector('.role').innerText.trim())`);
  await RS.shot('11-roster');
  check('roster: the seven free characters with their departments, no paragraphs', JSON.stringify(roster) === JSON.stringify(['BENJA ASSAULT', 'TOAD TANK', 'RAY SNIPER', 'TABSU FLANKER', 'TONASHIRO BRUISER', 'YOT ASSAULT', 'BILL FLANKER'])
    && !(await RS.ev(`[...document.querySelectorAll('.heroes .hero p')].length`)), JSON.stringify(roster));
  await RS.click('[data-hero="toad"]'); await RS.click('[data-go="quit"]'); await RS.hub();
  check('picking Toad shows Toad (Tank) in the hub', /toad/i.test(await RS.text('.op-name')) && /tank/i.test(await RS.text('.op-name')), await RS.text('.op-name'));
  await RS.click('[data-mode="solo"]'); await RS.click('#playbtn');
  await RS.until(`__chog.phase === 'play'`, 15000);
  const squad = await RS.ev(`__chog.world.actors.filter((a) => a.team === 'player').map((a) => [a.name, a.hero.id, a.hero.dept, a.ai])`);
  check('default game: you play Toad, with two AI teammates who are roster characters from other departments', squad.length === 3 && squad[0][1] === 'toad'
    && squad.slice(1).every((m) => m[3] && m[0] !== 'Rook' && m[0] !== 'Moth') && new Set(squad.map((m) => m[2])).size === 3, JSON.stringify(squad));
  await RS.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 360 });
  const n0 = await RS.ev(`__chog.world.actors[0].grenades`), hud0 = await RS.text('#naden');
  await RS.cmd('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyG', key: 'g' }); await RS.cmd('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyG', key: 'g' });
  const flying = await RS.until(`__chog.world.grenades.length > 0 && __chog.world.actors[0].grenades === ${n0 - 1}`, 4000);
  await RS.shot('12-grenade-thrown');
  const hud1 = await RS.text('#naden');
  const boom = await RS.until(`__chog.world.grenades.length === 0`, 4000);
  check('grenade (PC): G throws a real grenade, the count drops 3 -> 2 on the HUD, and it explodes', n0 === 3 && flying && hud0.trim() === '3' && hud1.trim() === '2' && boom, JSON.stringify({ n0, hud0, hud1, flying: !!flying, boom: !!boom }));
  const TC = await B('touch', { w: 844, h: 390, mobile: true, touch: true });
  await fresh(TC); await TC.click('[data-mode="solo"]'); await TC.click('#playbtn');
  await TC.until(`__chog.phase === 'play'`, 15000); await sleep(800);
  const btn = await TC.ev(`(() => { const r = document.getElementById('nade').getBoundingClientRect(); return { touch: document.body.classList.contains('touch'), w: r.width, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, n: document.getElementById('naden').innerText }; })()`);
  await TC.click('#nade');
  const tapped = await TC.until(`__chog.world.actors[0].grenades === 2 && document.getElementById('naden').innerText.trim() === '2'`, 4000);
  await TC.shot('13-touch-grenade');
  check('grenade (touch): the button is on screen, finger-sized, shows 3, and a tap throws one (HUD shows 2)', btn.touch && btn.inView && btn.w >= 56 && btn.n.trim() === '3' && tapped, JSON.stringify(btn));

  for (const x of open) if (x.errors.length) check(`no page errors (${x.label})`, false, x.errors.slice(0, 3).join(' / '));
} catch (e) {
  check('journey ran to the end', false, e?.stack ?? e);
} finally {
  for (const x of open) await x.close().catch(() => undefined);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
