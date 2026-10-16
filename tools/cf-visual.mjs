// CF visual QA set (owner 2026-10-16): every requested size x every requested screen, in fresh headless Chrome
// profiles against the local full stack. Emulated devices, NOT real ones. The holder signs in through the real
// Enter with CHOG flow (injected test wallet, real SIWE verification, fake Monad RPC). The match is driven by the
// debug autopilot so the frame shows real play; death is forced through the normal recap and results.
// Usage: node tools/cf-visual.mjs http://localhost:8790 <shotDir>
import { browser, sleep } from './cdp.mjs';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
const [base, shotDir] = process.argv.slice(2);
const KEY = Uint8Array.from('4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318'.match(/../g).map((h) => parseInt(h, 16)));
const ADDR = '0x' + Buffer.from(keccak_256(secp256k1.getPublicKey(KEY, false).subarray(1)).subarray(12)).toString('hex');
function personalSign(msgHex) {
  const msg = Buffer.from(msgHex.slice(2), 'hex');
  const digest = keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${msg.length}`), msg]));
  const rec = secp256k1.sign(digest, KEY, { prehash: false, format: 'recovered' });
  return '0x' + Buffer.from(rec.subarray(1, 65)).toString('hex') + (27 + rec[0]).toString(16);
}
async function wallet(b) {
  await b.cmd('Runtime.addBinding', { name: 'rzSignReq' });
  b.on(async (m) => { if (m.method === 'Runtime.bindingCalled' && m.params.name === 'rzSignReq') await b.ev(`window.__rzSigned(${JSON.stringify(personalSign(JSON.parse(m.params.payload).msg))})`); });
  await b.cmd('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const provider = { request: async ({ method, params }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return ['${ADDR}'];
      if (method === 'eth_chainId') return '0x8f';
      if (method === 'personal_sign') return await new Promise((res) => { window.__rzSigned = res; rzSignReq(JSON.stringify({ msg: params[0] })); });
      throw new Error('unsupported ' + method);
    } };
    const detail = Object.freeze({ info: { uuid: 'test', name: 'MetaMask', icon: '', rdns: 'io.metamask' }, provider });
    window.addEventListener('eip6963:requestProvider', () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail })));
  })();` });
}
const SIZES = [
  { name: 'phone-portrait', w: 390, h: 844, mobile: true, touch: true },
  { name: 'phone-landscape', w: 844, h: 390, mobile: true, touch: true },
  { name: 'tablet', w: 1024, h: 768, mobile: true, touch: true },
  { name: '1366x768', w: 1366, h: 768 },
  { name: '1440x900', w: 1440, h: 900 },
  { name: '1600x900', w: 1600, h: 900 },
];
const report = [];
for (const d of SIZES) {
  const b = await browser(d.name, { base, shotDir, ...d });
  await wallet(b);
  await b.go('/?debug&nooverlay'); await b.ev(`localStorage.setItem('chog.onboarded','1')`);
  await b.go('/?debug&nooverlay');
  await b.until(`!!document.getElementById('bootsteps')?.children.length`, 5000); await b.shot('01-loading');
  await b.hub(); await sleep(2200); await b.shot('02-landing');
  await b.click('#chog-cta'); await b.until(`document.getElementById('chogstate')?.dataset.state === 'pick'`, 8000); await sleep(300); await b.shot('03-chog-signin');
  await b.click('[data-chogwallet]');
  await b.until(`__chog.view() === 'main' && !!__chog.acct().tokens?.length`, 20000); await sleep(1500); await b.shot('04-hub-holder');
  await b.click('[data-go=start]'); await sleep(700); await b.shot('05-roster');
  await b.click('[data-go=quit]'); await b.hub(); await sleep(500);
  // A real match, driven by the debug autopilot (debug builds only), a few seconds in.
  await b.go('/?debug&nooverlay&autoplay=4'); await b.hub(); await sleep(400);
  await b.click('[data-mode=solo]'); await b.click('#playbtn');
  await b.until(`__chog.phase === 'play'`, 15000); await sleep(7000); await b.shot('06-match');
  await b.ev(`(() => { const w = __chog.world; const p = w.actors[0]; const k = w.actors.find((a) => a.team === 'bot' && a.alive); for (const a of w.actors) if (a.team === 'player') { a.hp = 0; a.alive = false; } w.outcome = 'dead'; w.playerKill = { cause: 'shot', killerId: k.id, weapon: k.weapon.name, fromX: k.x, fromY: k.y, toX: p.x, toY: p.y, tick: w.tick }; })()`);
  await b.until(`__chog.phase === 'recap'`, 5000); await sleep(300); await b.shot('07-death');
  await b.until(`__chog.phase === 'results'`, 8000); await sleep(900); await b.shot('08-results');
  report.push({ size: d.name, errors: b.errors.slice(0, 3) });
  await b.close();
}
console.log(JSON.stringify(report, null, 1));
