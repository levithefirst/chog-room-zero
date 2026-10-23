// CF "Enter with CHOG" journeys in real headless Chrome (emulated, NOT real devices) against the local full stack
// (tools/local-api.ts: the real /api/auth/wallet and /api/game handlers, PGlite, a faked Monad RPC). The wallet is an
// injected EIP-6963 provider that signs the server's SIWE challenge with a real key (EIP-191). Checks every state the
// owner listed: wallet pick, connecting, wrong network (refused and accepted switch), checking, CHOG verified, no CHOG,
// rejected signature, success into the hub with the Chog as your identity. CHOG ownership is eligibility (read before
// signing, signs nobody in); the signature is authentication (the only thing that starts a session).
// Usage: node tools/cf-chog.mjs http://localhost:8790 [shotDir]
import { browser, sleep } from './cdp.mjs';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
const [base, shotDir] = process.argv.slice(2);
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${String(detail).slice(0, 600)}` : ''}`); };
const fresh = async (b) => { await b.go('/?debug'); await b.ev(`localStorage.setItem('chog.onboarded','1')`); await b.go('/?debug'); await b.hub(); await sleep(400); };

// The holder key is tools/local-api.ts TEST_KEY (holds Blaze, a 1:1). Any other key holds nothing on the fake chain.
const HOLDER_KEY = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const EMPTY_KEY = '1'.repeat(63) + '2';
const keyBytes = (k) => Uint8Array.from(k.match(/../g).map((h) => parseInt(h, 16)));
const addrOf = (k) => '0x' + Buffer.from(keccak_256(secp256k1.getPublicKey(keyBytes(k), false).subarray(1)).subarray(12)).toString('hex');
function personalSign(key, msgHex) {
  const msg = Buffer.from(msgHex.slice(2), 'hex');
  const digest = keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${msg.length}`), msg]));
  const rec = secp256k1.sign(digest, keyBytes(key), { prehash: false, format: 'recovered' });
  return '0x' + Buffer.from(rec.subarray(1, 65)).toString('hex') + (27 + rec[0]).toString(16);
}

/** A test wallet: `chain` it starts on, whether it agrees to switch, whether it refuses to sign. */
async function wallet(b, { key = HOLDER_KEY, chain = '0x8f', switchOk = true, reject = false } = {}) {
  await b.cmd('Runtime.addBinding', { name: 'rzSignReq' });
  b.on(async (m) => {
    if (m.method !== 'Runtime.bindingCalled' || m.params.name !== 'rzSignReq') return;
    const sig = reject ? 'REJECT' : personalSign(key, JSON.parse(m.params.payload).msg);
    await b.ev(`window.__rzSigned(${JSON.stringify(sig)})`);
  });
  await b.cmd('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    let chain = '${chain}';
    const provider = { request: async ({ method, params }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return ['${addrOf(key)}'];
      if (method === 'eth_chainId') return chain;
      if (method === 'wallet_switchEthereumChain') { if (${switchOk}) { chain = params[0].chainId; return null; } throw Object.assign(new Error('User rejected'), { code: 4001 }); }
      if (method === 'personal_sign') return await new Promise((res, rej) => { window.__rzSigned = (s) => s === 'REJECT' ? rej(Object.assign(new Error('User rejected'), { code: 4001 })) : res(s); rzSignReq(JSON.stringify({ msg: params[0] })); });
      throw new Error('unsupported ' + method);
    } };
    const detail = Object.freeze({ info: { uuid: 'test', name: 'MetaMask', icon: '', rdns: 'io.metamask' }, provider });
    window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail })));
  })();` });
}
const state = (b) => b.ev(`(() => { const e = document.getElementById('chogstate'); return e ? { s: e.dataset.state, code: e.dataset.code ?? null, text: e.innerText } : null; })()`);
const until = async (b, want, ms = 15000) => { const t0 = Date.now(); let st = null; while (Date.now() - t0 < ms) { st = await state(b); if (st && want.includes(st.s)) return st; if (!st && want.includes('closed')) return { s: 'closed' }; await sleep(150); } return st; };

const open = [];
const B = async (label, o = {}) => { const b = await browser(label, { base, shotDir, ...o }); open.push(b); return b; };
try {
  for (const dev of [{ name: 'desktop', w: 1440, h: 900 }, { name: 'phone', w: 844, h: 390, mobile: true, touch: true }]) {
    // 1. Holder: pick -> connecting -> checking -> signing -> verifying -> loading -> back in the hub as Blaze.
    const H = await B(`holder-${dev.name}`, dev);
    await wallet(H);
    await fresh(H);
    check(`${dev.name}: guest hub shows Enter with CHOG (not "Connect wallet")`, /Enter with CHOG/i.test(await H.text('#chog-cta')) && !/connect wallet/i.test(await H.text('#hub')));
    await H.click('#chog-cta');
    const pick = await until(H, ['pick']);
    await H.shot(`cf-chog-01-pick-${dev.name}`);
    check(`${dev.name}: the sheet says what happens and lists the wallet`, pick?.s === 'pick' && /sign a free message/i.test(pick.text) && !!(await H.ev(`!!document.querySelector('[data-chogwallet]')`)), pick?.text);
    await H.click('[data-chogwallet]');
    const seen = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) { const st = await state(H); if (st) seen.add(st.s); if (await H.ev(`__chog.view() === 'main' && !!__chog.acct().tokens`)) break; await sleep(60); }
    await sleep(500);
    const a = await H.ev(`(() => { const a = __chog.acct(); return { signedIn: a.signedIn, wallet: a.hasWallet, tokens: (a.tokens || []).map((t) => t.oneOfOne || t.metadataId), chip: document.querySelector('.chog-chip')?.innerText ?? '', toast: document.getElementById('toast').innerText }; })()`);
    await H.shot(`cf-chog-02-verified-hub-${dev.name}`);
    check(`${dev.name}: holder signs in through the real signature check and lands in the hub`, a.signedIn && a.wallet, JSON.stringify(a));
    check(`${dev.name}: the hub shows the verified Chog as the player's identity (Blaze, verified mark)`, /Blaze/.test(a.chip) && /✓/.test(a.chip) && /CHOG verified/i.test(a.toast), JSON.stringify(a));
    const trail = (await H.ev(`document.body.dataset.chogTrail ?? ''`)).split(',');
    check(`${dev.name}: the flow showed its steps in order: connect, check the Chog, sign, verify, load`, ['connecting', 'checking', 'signing', 'verifying', 'loading'].every((s, i, a) => trail.indexOf(s) >= 0 && (i === 0 || trail.indexOf(s) > trail.indexOf(a[i - 1]))), trail.join(' > '));
    await H.close(); open.splice(open.indexOf(H), 1);
  }

  // 2. No CHOG: eligibility says none BEFORE any signature; nobody is signed in.
  const N = await B('nochog');
  await wallet(N, { key: EMPTY_KEY });
  await fresh(N);
  await N.click('#chog-cta'); await until(N, ['pick']); await N.click('[data-chogwallet]');
  const none = await until(N, ['none', 'error']);
  await N.shot('cf-chog-03-none');
  check('a wallet without a Chog hears "CHOG not found in this wallet." and is offered Play free', none?.s === 'none' && /CHOG not found in this wallet\./.test(none.text) && !!(await N.ev(`!!document.querySelector('[data-act=chog-free]')`)), JSON.stringify(none));
  check('ownership is only eligibility: the eligibility check signed nobody in', !(await N.ev(`__chog.acct().signedIn`)));
  await N.click('[data-act=chog-free]'); await sleep(300);
  check('Play free goes back to the hub', (await N.ev(`__chog.view()`)) === 'main');
  await N.close(); open.splice(open.indexOf(N), 1);

  // 3. Wrong network, switch refused: "Switch networks to continue." and still signed out.
  const W = await B('wrongnet');
  await wallet(W, { chain: '0x1', switchOk: false });
  await fresh(W);
  await W.click('#chog-cta'); await until(W, ['pick']); await W.click('[data-chogwallet]');
  const net = await until(W, ['network']);
  await W.shot('cf-chog-04-network');
  check('a wallet on another network is asked to switch to Monad', net?.s === 'network' && /Switch networks to continue\./.test(net.text), JSON.stringify(net));
  await W.click('[data-act=chog-switch]');
  const refused = await until(W, ['error']);
  check('refusing the switch says "Switch networks to continue." with Try again', refused?.code === 'network_rejected' && /Switch networks to continue\./.test(refused.text) && !(await W.ev(`__chog.acct().signedIn`)), JSON.stringify(refused));
  await W.close(); open.splice(open.indexOf(W), 1);

  // 4. Wrong network, switch accepted: carries on to a verified Chog.
  const S = await B('switch');
  await wallet(S, { chain: '0x1', switchOk: true });
  await fresh(S);
  await S.click('#chog-cta'); await until(S, ['pick']); await S.click('[data-chogwallet]');
  await until(S, ['network']); await S.click('[data-act=chog-switch]');
  await S.until(`__chog.view() === 'main' && !!__chog.acct().tokens && __chog.acct().tokens.length > 0`, 20000);
  check('accepting the switch carries on to a verified Chog', await S.ev(`__chog.acct().signedIn && __chog.acct().hasWallet`));
  await S.close(); open.splice(open.indexOf(S), 1);

  // 5. Rejected signature: "Signature cancelled." with Try again; nothing signed in.
  const R = await B('reject');
  await wallet(R, { reject: true });
  await fresh(R);
  await R.click('#chog-cta'); await until(R, ['pick']); await R.click('[data-chogwallet]');
  const rej = await until(R, ['error'], 20000);
  await R.shot('cf-chog-05-rejected');
  check('a rejected signature says "Signature cancelled." and leaves you signed out', rej?.code === 'rejected' && /Signature cancelled\./.test(rej.text) && !(await R.ev(`__chog.acct().signedIn`)), JSON.stringify(rej));
  check('no raw error text reaches the player (no RPC, stack or contract words)', !/rpc|stack|revert|0x[0-9a-f]{6}|undefined|error:/i.test(rej?.text ?? ''), rej?.text);
  await R.close(); open.splice(open.indexOf(R), 1);
} catch (e) {
  check('journey ran without throwing', false, e?.stack ?? String(e));
} finally {
  for (const b of open) await b.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
