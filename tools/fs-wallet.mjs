// FS wallet chooser and Enter with CHOG robustness in real headless Chrome (emulated, NOT real devices or real wallet
// extensions) against the local full stack (tools/local-api.ts: the real auth and game handlers, PGlite, a faked Monad
// RPC). Fake EIP-1193 wallets announce themselves over EIP-6963 and sign with real keys. Each journey is a state the
// owner listed (2026-10-17): several wallets with logos, none (install / open-in-app, look again without a reload), a
// request already open, a locked wallet that never answers (Cancel, and its late answer signs nobody in), a wallet that
// does not know Monad (added, then switched), the account switched in the wallet mid-flow, a double tap, Continue with
// Wallet never showing raw wallet text, keyboard use and the phone's Back during a match.
// Usage: node tools/fs-wallet.mjs http://localhost:8790 [shotDir]
import { browser, sleep } from './cdp.mjs';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
const [base, shotDir] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, 600)}` : ''}`); };
const fresh = async (b, q = '') => { await b.go('/?debug'); await b.ev(`localStorage.setItem('chog.onboarded','1')`); await b.go(`/?debug${q}`); await b.hub(); await sleep(400); };

const HOLDER_KEY = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const EMPTY_KEY = '1'.repeat(63) + '2';
const keyBytes = (k) => Uint8Array.from(k.match(/../g).map((h) => parseInt(h, 16)));
const addrOf = (k) => '0x' + Buffer.from(keccak_256(secp256k1.getPublicKey(keyBytes(k), false).subarray(1)).subarray(12)).toString('hex');
const KEYS = { [addrOf(HOLDER_KEY)]: HOLDER_KEY, [addrOf(EMPTY_KEY)]: EMPTY_KEY };
function personalSign(key, msgHex) {
  const msg = Buffer.from(msgHex.slice(2), 'hex');
  const digest = keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${msg.length}`), msg]));
  const rec = secp256k1.sign(digest, keyBytes(key), { prehash: false, format: 'recovered' });
  return '0x' + Buffer.from(rec.subarray(1, 65)).toString('hex') + (27 + rec[0]).toString(16);
}

/**
 * Fake wallets in the page. Each `w` is { rdns, name, icon, key, chain, knows (Monad added), connect: 'ok'|'pending'|'hang' }.
 * window.__rzw[rdns] holds a wallet's live settings (tests change them); window.__rzEmit(rdns, event, value) fires
 * an EIP-1193 event; window.__rzCalls lists every request. A wallet with `late` announces only when __rzLate() runs.
 */
async function wallets(b, list) {
  await b.cmd('Runtime.addBinding', { name: 'rzSignReq' });
  b.on(async (m) => {
    if (m.method !== 'Runtime.bindingCalled' || m.params.name !== 'rzSignReq') return;
    const p = JSON.parse(m.params.payload);
    await b.ev(`window.__rzSigned(${JSON.stringify(personalSign(KEYS[p.addr.toLowerCase()], p.msg))})`);
  });
  const cfg = list.map((w) => ({ chain: '0x8f', knows: true, connect: 'ok', icon: '', late: false, ...w, account: addrOf(w.key ?? HOLDER_KEY) }));
  await b.cmd('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    window.__rzw = ${JSON.stringify(Object.fromEntries(cfg.map((c) => [c.rdns, c])))};
    window.__rzCalls = [];
    const listeners = {};
    window.__rzEmit = (rdns, ev, v) => { for (const f of (listeners[rdns + ev] ?? [])) f(v); };
    const err = (code, message) => Object.assign(new Error(message), { code });
    const make = (rdns) => ({
      on: (ev, f) => { (listeners[rdns + ev] ??= []).push(f); },
      removeListener: (ev, f) => { listeners[rdns + ev] = (listeners[rdns + ev] ?? []).filter((x) => x !== f); },
      request: async ({ method, params }) => {
        const w = window.__rzw[rdns];
        window.__rzCalls.push(rdns + ':' + method);
        if (method === 'eth_requestAccounts') {
          if (w.connect === 'pending') throw err(-32002, "Request of type 'wallet_requestPermissions' already pending for origin http://localhost. Please wait.");
          if (w.connect === 'hang') return await new Promise((res) => { window.__rzRelease = () => res([w.account]); });
          return [w.account];
        }
        if (method === 'eth_accounts') return [w.account];
        if (method === 'eth_chainId') return w.chain;
        if (method === 'wallet_switchEthereumChain') {
          await new Promise((r) => setTimeout(r, 300));
          if (!w.knows) throw Object.assign(err(-32603, 'Internal error'), { data: { originalError: { code: 4902, message: 'Unrecognized chain ID' } } });
          w.chain = params[0].chainId; return null;
        }
        if (method === 'wallet_addEthereumChain') { window.__rzAdded = params[0]; w.knows = true; return null; }
        if (method === 'personal_sign') return await new Promise((res) => { window.__rzSigned = res; rzSignReq(JSON.stringify({ msg: params[0], addr: params[1] })); });
        throw err(-32601, 'unsupported ' + method);
      },
    });
    const providers = Object.fromEntries(Object.keys(window.__rzw).map((r) => [r, make(r)]));
    const announce = (r) => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: { uuid: 'u-' + r, name: window.__rzw[r].name, icon: window.__rzw[r].icon, rdns: r }, provider: providers[r] }) }));
    let lateOn = false;
    window.__rzLate = () => { lateOn = true; };
    window.addEventListener('eip6963:requestProvider', () => { for (const r of Object.keys(providers)) if (!window.__rzw[r].late || lateOn) announce(r); });
  })();` });
}
const state = (b) => b.ev(`(() => { const e = document.getElementById('chogstate'); return e ? { s: e.dataset.state, code: e.dataset.code ?? null, text: e.innerText } : null; })()`);
const until = async (b, want, ms = 15000) => { const t0 = Date.now(); let st = null; while (Date.now() - t0 < ms) { st = await state(b); if (st && want.includes(st.s)) return st; await sleep(120); } return st; };
const signedIn = (b) => b.ev(`__chog.acct().signedIn`);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const open = [];
const B = async (label, o = {}) => { const b = await browser(label, { base, shotDir, w: 1440, h: 900, ...o }); open.push(b); return b; };
const done = async (b) => { const errs = b.errors.length; await b.close(); open.splice(open.indexOf(b), 1); return errs; };
try {
  // 1. Several wallets: each listed with its mark (our MetaMask logo; the other's own icon), Detected; then signs in.
  {
    const b = await B('chooser');
    await wallets(b, [{ rdns: 'io.metamask', name: 'MetaMask' }, { rdns: 'com.example.wallet', name: 'Example Wallet', icon: PNG }]);
    await fresh(b);
    await b.click('#chog-cta');
    await until(b, ['pick']);
    const list = await b.ev(`[...document.querySelectorAll('[data-chogwallet]')].map((e) => ({ id: e.dataset.chogwallet, name: e.querySelector('.wname').innerText, svg: !!e.querySelector('.wmark svg'), img: e.querySelector('.wmark img')?.getAttribute('src')?.slice(0, 22) ?? null, det: /Detected/i.test(e.innerText) }))`);
    await b.shot('01-chooser');
    check('several wallets: each one listed by name with its logo and "Detected", known wallets first', list.length === 2 && list[0].id === 'io.metamask' && list[0].svg && list[1].img === 'data:image/png;base64,' && list.every((x) => x.det), JSON.stringify(list));
    await b.click('[data-chogwallet="com.example.wallet"]');
    await b.until(`__chog.view() === 'main' && (__chog.acct().tokens || []).length > 0`, 20000);
    check('the second (unknown) wallet works end to end: signed in, Chog verified', await signedIn(b));
    check('no page errors', (await done(b)) === 0);
  }
  // 2. No wallet: install links and Look again; a wallet that arrives afterwards is found without a reload.
  {
    const b = await B('nowallet');
    await wallets(b, [{ rdns: 'io.metamask', name: 'MetaMask', late: true }]);
    await fresh(b);
    await b.click('#chog-cta');
    const st = await until(b, ['nowallet']);
    const links = await b.ev(`[...document.querySelectorAll('[data-offer]')].map((a) => a.dataset.offer + ' ' + a.getAttribute('href'))`);
    await b.shot('02-nowallet');
    check('no wallet (computer): says so, offers MetaMask, Phantom, Rabby and Trust Wallet install pages and Look again', st?.s === 'nowallet' && links.length === 4 && /metamask\.io\/download/.test(links[0]) && !!(await b.ev(`!!document.querySelector('[data-act=wallet-rescan]')`)), JSON.stringify({ st, links }));
    const loads = await b.ev(`performance.getEntriesByType('navigation').length`);
    await b.ev(`__rzLate()`);
    await b.click('[data-act=wallet-rescan]');
    const pick = await until(b, ['pick']);
    check('Look again finds a wallet installed meanwhile, with no page reload', pick?.s === 'pick' && (await b.ev(`!!document.querySelector('[data-chogwallet="io.metamask"]')`)) && (await b.ev(`performance.getEntriesByType('navigation').length`)) === loads);
    check('no page errors', (await done(b)) === 0);
  }
  // 3. Phone with no wallet: links open this page (with its query) inside the wallet apps.
  {
    const b = await B('phone-nowallet', { w: 390, h: 844, mobile: true, touch: true });
    await b.cmd('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
    await fresh(b, '&squad=AB12C');
    await b.click('#chog-cta');
    await until(b, ['nowallet']);
    const links = await b.ev(`[...document.querySelectorAll('[data-offer]')].map((a) => a.getAttribute('href'))`);
    await b.shot('03-phone-nowallet');
    check('no wallet (phone): Open in MetaMask / Phantom / Trust Wallet, each carrying this page and its query', links.length === 3 && /^https:\/\/metamask\.app\.link\/dapp\/localhost:\d+\/\?debug&squad=AB12C$/.test(links[0]) && links[1].startsWith('https://phantom.com/ul/browse/http') && links[2].startsWith('https://link.trustwallet.com/open_url?coin_id=60&url=http'), JSON.stringify(links));
    check('no page errors', (await done(b)) === 0);
  }
  // 4. A request already open in the wallet: plain words, and Try again works once it is cleared.
  {
    const b = await B('pending');
    await wallets(b, [{ rdns: 'io.metamask', name: 'MetaMask', connect: 'pending' }]);
    await fresh(b);
    await b.click('#chog-cta'); await until(b, ['pick']); await b.click('[data-chogwallet]');
    const er = await until(b, ['error']);
    await b.shot('04-pending');
    check('a request already open in the wallet says so plainly (no raw wallet text)', er?.code === 'pending' && /request is open in your wallet/i.test(er.text) && !/wallet_requestPermissions|origin|pending for/i.test(er.text), JSON.stringify(er));
    await b.ev(`__rzw['io.metamask'].connect = 'ok'`);
    await b.click('[data-act=chog-retry]');
    await b.until(`__chog.acct().signedIn`, 20000);
    check('Try again, once the wallet is free, signs in without a reload', await signedIn(b));
    check('no page errors', (await done(b)) === 0);
  }
  // 5. Locked wallet that never answers: Cancel works; its late answer signs nobody in; another try works.
  {
    const b = await B('locked');
    await wallets(b, [{ rdns: 'io.metamask', name: 'MetaMask', connect: 'hang' }]);
    await fresh(b);
    await b.click('#chog-cta'); await until(b, ['pick']); await b.click('[data-chogwallet]');
    const c = await until(b, ['connecting']);
    check('a locked wallet: "Connecting", told to unlock it, with Cancel', c?.s === 'connecting' && /Unlock/i.test(c.text) && (await b.ev(`!!document.querySelector('[data-act=chog-cancel]')`)), JSON.stringify(c));
    await b.click('[data-act=chog-cancel]');
    const back = await until(b, ['pick']);
    await b.ev(`__rzRelease()`); // the wallet answers late, after Cancel
    await sleep(2500);
    check('Cancel returns to the list, and the wallet answering late signs nobody in', back?.s === 'pick' && !(await signedIn(b)) && (await state(b))?.s === 'pick');
    await b.ev(`__rzw['io.metamask'].connect = 'ok'`);
    await b.click('[data-chogwallet]');
    await b.until(`__chog.acct().signedIn`, 20000);
    check('a new try after the cancel signs in', await signedIn(b));
    check('no page errors', (await done(b)) === 0);
  }
  // 6. A wallet that does not know Monad: Switch adds it (official parameters), switches, carries on. A double tap
  //    asks the wallet only once.
  {
    const b = await B('addchain');
    await wallets(b, [{ rdns: 'io.metamask', name: 'MetaMask', chain: '0x1', knows: false }]);
    await fresh(b);
    await b.click('#chog-cta'); await until(b, ['pick']); await b.click('[data-chogwallet]');
    await until(b, ['network']);
    await b.ev(`(() => { const el = document.querySelector('[data-act=chog-switch]'); for (let i = 0; i < 2; i++) el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); })()`);
    await b.until(`__chog.acct().signedIn`, 20000);
    const calls = await b.ev(`__rzCalls.filter((c) => c.endsWith('wallet_addEthereumChain') || c.endsWith('personal_sign'))`);
    const added = await b.ev(`window.__rzAdded`);
    check('Monad unknown to the wallet: added with chain 0x8f, MON, rpc.monad.xyz, then signed in', (await signedIn(b)) && added?.chainId === '0x8f' && added?.nativeCurrency?.symbol === 'MON' && added?.rpcUrls?.[0] === 'https://rpc.monad.xyz', JSON.stringify(added));
    check('a double tap on Switch asks the wallet once (one add, one signature)', calls.filter((c) => c.endsWith('wallet_addEthereumChain')).length === 1 && calls.filter((c) => c.endsWith('personal_sign')).length === 1, JSON.stringify(calls));
    check('no page errors', (await done(b)) === 0);
  }
  // 7. The account changed in the wallet mid-flow: a wallet with no Chog, then the player switches to the holder account.
  {
    const b = await B('switchacct');
    await wallets(b, [{ rdns: 'io.metamask', name: 'MetaMask', key: EMPTY_KEY }]);
    await fresh(b);
    await b.click('#chog-cta'); await until(b, ['pick']); await b.click('[data-chogwallet]');
    const none = await until(b, ['none']);
    check('a wallet with no Chog: its address, "no Chog Genesis on Monad", and three ways on', none?.s === 'none' && /holds no Chog Genesis on Monad/.test(none.text) && (await b.ev(`['chog-account','chog-other','chog-free'].every((a) => !!document.querySelector('[data-act=' + a + ']'))`)), JSON.stringify(none));
    await b.shot('07-none');
    await b.ev(`(() => { __rzw['io.metamask'].account = '${addrOf(HOLDER_KEY)}'; __rzEmit('io.metamask', 'accountsChanged', ['${addrOf(HOLDER_KEY)}']); })()`);
    await b.until(`__chog.acct().signedIn && (__chog.acct().tokens || []).length > 0`, 20000);
    check('switching the account in the wallet carries on with the new account to a verified Chog (no restart needed)', await signedIn(b));
    check('no page errors', (await done(b)) === 0);
  }
  // 8. Continue with Wallet: never the wallet's raw text; a busy sheet cannot start a second request.
  {
    const b = await B('continue');
    await wallets(b, [{ rdns: 'io.metamask', name: 'MetaMask', connect: 'pending' }]);
    await fresh(b);
    await b.click('#signin-cta'); await b.click('[data-act=signin-wallet]');
    await b.until(`/request is open/i.test(document.getElementById('authmsg')?.innerText ?? '')`, 8000);
    const msg = await b.text('#authmsg');
    check('Continue with Wallet maps a wallet error to plain words (no RPC text)', /request is open in your wallet/i.test(msg) && !/wallet_requestPermissions|origin/i.test(msg), msg);
    check('no page errors', (await done(b)) === 0);
  }
  // 9. Keyboard: Enter on a focused hub button presses that button (not "play"); Esc closes the sheet.
  {
    const b = await B('keys');
    await fresh(b);
    const focused = await b.ev(`(() => { const el = document.querySelector('[data-act=settings]'); el?.focus(); return document.activeElement === el; })()`);
    check('the hub Settings button takes keyboard focus', focused);
    await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Enter', key: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 });
    await b.cmd('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Enter', key: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(600);
    const v = await b.ev(`({ view: __chog.view(), phase: __chog.phase })`);
    check('Enter on a focused button presses it (Settings opens), and does not start a match', v.view === 'settings' && v.phase === 'title', JSON.stringify(v));
    await b.cmd('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
    await b.cmd('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(600);
    check('Esc closes a hub sheet (back to the hub)', (await b.ev(`__chog.view()`)) === 'main');
    check('no page errors', (await done(b)) === 0);
  }
  // 10. The phone's Back in a match pauses it instead of leaving the site.
  {
    const b = await B('back', { w: 844, h: 390, mobile: true, touch: true });
    await fresh(b);
    await b.click('[data-mode="solo"]'); await b.click('#playbtn');
    await b.until(`__chog.phase === 'play'`, 20000);
    await sleep(800);
    await b.ev(`history.back()`);
    await sleep(1200);
    const v = await b.ev(`({ phase: __chog.phase, href: location.href })`);
    check('Back during a match pauses it (still on the site)', v.phase === 'pause' && v.href.startsWith(base), JSON.stringify(v));
    check('no page errors', (await done(b)) === 0);
  }
} catch (e) {
  check('journeys ran without throwing', false, e?.stack ?? String(e));
} finally {
  for (const b of open) await b.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
