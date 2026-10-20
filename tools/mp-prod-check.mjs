// One production check of online play (MP P0): two independent clients on the live game server do what two friends do.
// Plain WebSockets (no browser, no install): A picks Office, B picks Room Zero, both 1v1; they must meet on Office
// (A waited longer) within the location wait. Also: same location meets at once, an old client is told to reload, a ping
// before the hello is answered, the server and the site run the expected commit.
// Usage: node tools/mp-prod-check.mjs wss://room-zero-game.onrender.com/ws https://chogroomzero.xyz <commit sha>
const [wsUrl, site, sha] = process.argv.slice(2);
const http = wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name) {
  const c = { got: [], ws: new WebSocket(wsUrl, { headers: { origin: site } }) };
  c.ws.onmessage = (e) => c.got.push(JSON.parse(String(e.data)));
  c.open = new Promise((r, j) => { c.ws.onopen = r; c.ws.onerror = j; });
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.wait = async (t, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = c.got.find((x) => x.t === t); if (m) return m; await sleep(100); } return null; };
  c.hello = async (v = 2) => { await c.open; c.send({ t: 'hello', v, name, hero: 'benja' }); };
  c.ping = setInterval(() => { if (c.ws.readyState === 1) c.send({ t: 'ping', at: Date.now() }); }, 2000);
  c.close = () => { clearInterval(c.ping); try { c.ws.close(); } catch { /* closed */ } };
  return c;
}

try {
  // Wake the free host (it sleeps after 15 idle minutes) and wait for it to finish deploying this commit (up to 6 min).
  let st = null;
  for (let i = 0; i < 120 && st?.commit !== sha; i++) { try { const r = await fetch(`${http}/stats`); if (r.ok) st = await r.json(); } catch { /* waking or deploying */ } if (st?.commit !== sha) await sleep(3000); }
  st ??= {};
  check('game server runs the expected commit', st.commit === sha, `${st.commit}`);
  check('game server reports its load', !!st.load, JSON.stringify(st.load));
  const page = await (await fetch(`${site}/`)).text();
  const js = page.match(/assets\/[^"]+\.js/)?.[0];
  const bundle = js ? await (await fetch(`${site}/${js}`)).text() : '';
  check('site bundle is the same commit', bundle.includes(sha.slice(0, 7)));
  check('site bundle has the location rule', bundle.includes('first, then any location'));

  // An early ping (before hello) is answered, not refused.
  const e = client('Early');
  await e.open; e.send({ t: 'ping', at: 1 });
  const pong = await e.wait('pong', 5000);
  check('a ping before the hello gets a pong, no error', pong && !e.got.some((m) => m.t === 'error'));
  e.close();

  // An old client is told to reload.
  const o = client('Old');
  await o.hello(1);
  const out = await o.wait('error', 8000);
  check('a protocol 1 client is told to reload', out?.code === 'outdated', out?.message);
  o.close();

  // Two friends, different saved locations.
  const a = client('ProdA'), b = client('ProdB');
  await a.hello(); await a.wait('welcome', 10000);
  a.send({ t: 'queue', mode: '1v1', map: 'office' });
  await sleep(1500);
  await b.hello(); await b.wait('welcome', 10000);
  const t0 = Date.now();
  b.send({ t: 'queue', mode: '1v1', map: 'room-zero' });
  const [ma, mb] = await Promise.all([a.wait('match', 30000), b.wait('match', 30000)]);
  check('different locations: both matched', ma && mb, ma && mb ? `after ${((Date.now() - t0) / 1000).toFixed(1)} s` : JSON.stringify([a.got.at(-1), b.got.at(-1)]));
  check('different locations: same room, on the longer waiter\'s pick (Office)', ma && mb && ma.room === mb.room && ma.map === 'office' && mb.map === 'office', `${ma?.map} ${mb?.map}`);
  const snapA = ma ? await a.wait('snap', 10000) : null;
  check('the match starts (snapshots arrive)', !!snapA);
  a.send({ t: 'leave' }); b.send({ t: 'leave' });
  a.close(); b.close();

  // Same location meets at once.
  const c = client('ProdC'), d = client('ProdD');
  await c.hello(); await d.hello(); await c.wait('welcome', 10000); await d.wait('welcome', 10000);
  const t1 = Date.now();
  c.send({ t: 'queue', mode: '1v1', map: 'metro' }); d.send({ t: 'queue', mode: '1v1', map: 'metro' });
  const [mc, md] = await Promise.all([c.wait('match', 15000), d.wait('match', 15000)]);
  check('same location: matched at once on it', mc && md && mc.map === 'metro' && (Date.now() - t1) < 5000, `${mc?.map} after ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  c.send({ t: 'leave' }); d.send({ t: 'leave' });
  c.close(); d.close();
} catch (err) { check('run', false, String(err?.stack ?? err)); }
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
