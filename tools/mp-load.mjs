// Multiplayer load and failure harness (MP P0): N bot players speak the real protocol to a game server, queue, play
// (random moves and fire) and queue again, while churn, duplicate tokens and slow clients are mixed in. It reports
// whether every player either got a match or a clear answer, with latencies, errors and the server's own load numbers
// (GET /stats). Bots, not people: this measures the server, not the browser.
// Usage: node tools/mp-load.mjs ws://127.0.0.1:8791/ws [--n 100] [--mode 1v1|3v3|mix] [--maps all|room-zero]
//   [--secs 60] [--ramp 0] [--churn 0] [--slow 0] [--dup 0] [--sustain 1] [--out file.json]
// churn = chance per bot per second of leave+rejoin, drop+reconnect or switching queue; slow = share of bots that wait
// 3-8 s before hello and answer 300 ms late; dup = share that open a second socket with the same token mid-run.
import fs from 'node:fs';
const PROTOCOL = 2;
const MAPS = ['room-zero', 'office', 'supermarket', 'metro', 'construction'];
const QUEUE_TIMEOUT = 90;
const args = Object.fromEntries(process.argv.slice(3).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const url = process.argv[2];
const N = Number(args.n ?? 100), SECS = Number(args.secs ?? 60), RAMP = Number(args.ramp ?? 0);
const CHURN = Number(args.churn ?? 0), SLOW = Number(args.slow ?? 0), DUP = Number(args.dup ?? 0), SUSTAIN = (args.sustain ?? '1') !== '0';
const MODE = args.mode ?? '1v1', MAPSET = args.maps === 'room-zero' ? ['room-zero'] : MAPS;
const stats = url.replace(/^ws/, 'http').replace(/\/ws$/, '/stats');
const now = () => performance.now() / 1000;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(2); };

const R = { queued: 0, matched: 0, started: 0, over: 0, timeouts: 0, lat: [], startLat: [], errors: {}, drops: 0, reconnects: 0, resumed: 0, resumeFail: 0, dupOpened: 0, churnActs: 0, closesByServer: 0 };
const err = (c) => { R.errors[c] = (R.errors[c] ?? 0) + 1; };

class Bot {
  constructor(i) {
    this.i = i; this.name = `Bot${String(i).padStart(3, '0')}`; this.slow = Math.random() < SLOW;
    this.state = 'off'; this.token = null; this.qAt = 0; this.matchAt = 0; this.gotSnap = false; this.seq = 0; this.timer = null; this.done = false;
    this.mode = MODE === 'mix' ? (i % 2 ? '1v1' : '3v3') : MODE; this.map = pick(MAPSET);
  }
  open(resume = false) {
    const ws = new WebSocket(url);
    this.ws = ws;
    this.welcomed = false;
    ws.onopen = () => setTimeout(() => this.send({ t: 'hello', v: PROTOCOL, name: this.name, hero: 'benja', ...(resume && this.token ? { token: this.token } : {}) }), this.slow && !resume ? 3000 + Math.random() * 5000 : 0);
    ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (this.slow) setTimeout(() => this.on(m), 300); else this.on(m); };
    ws.onclose = () => { if (this.ws !== ws) return; this.stopInputs(); if (!this.done && this.state !== 'dropping') { R.closesByServer++; this.state = 'off'; } };
    ws.onerror = () => {};
  }
  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  // Like the real client: a queue is sent only on a socket that has been welcomed (else it waits for the welcome).
  queue() { if (!this.welcomed) { this.state = 'off'; return; } this.state = 'queued'; this.qAt = now(); this.gotSnap = false; R.queued++; this.send({ t: 'queue', mode: this.mode, map: this.map }); }
  on(m) {
    switch (m.t) {
      case 'welcome':
        this.welcomed = true;
        if (this.state === 'reconnecting') { if (m.resumed) R.resumed++; else { R.resumeFail++; this.state = 'idle'; if (SUSTAIN) this.queue(); } }
        this.token = m.token;
        if (this.state === 'off' || this.state === 'new') this.queue();
        return;
      case 'match':
        if (this.state === 'queued') { R.matched++; R.lat.push(now() - this.qAt); }
        this.state = 'match'; this.matchAt = now(); this.startsIn = m.startsIn; this.startInputs();
        return;
      case 'snap':
        if (!this.gotSnap && this.state === 'match' && now() - this.matchAt >= (this.startsIn ?? 0)) { this.gotSnap = true; R.started++; R.startLat.push(now() - this.matchAt); }
        return;
      case 'over':
        R.over++; this.stopInputs(); this.state = 'idle';
        if (SUSTAIN && !this.done) setTimeout(() => { if (this.state === 'idle' && !this.done) this.queue(); }, 1000 + Math.random() * 2000);
        return;
      case 'queueTimeout':
        if (this.state === 'queued') { R.timeouts++; this.state = 'idle'; if (SUSTAIN && !this.done) setTimeout(() => !this.done && this.queue(), 1000); }
        return;
      case 'error':
        err(m.code);
        if (m.code === 'match-cancelled') { this.stopInputs(); this.state = 'idle'; if (SUSTAIN && !this.done) this.queue(); }
        return;
    }
  }
  startInputs() {
    this.stopInputs();
    let mx = 0, my = 0, aim = Math.random() * 6.28;
    this.timer = setInterval(() => {
      if (Math.random() < 0.1) { mx = Math.round(Math.random() * 2 - 1); my = Math.round(Math.random() * 2 - 1); aim += Math.random() - 0.5; }
      this.send({ t: 'input', seq: ++this.seq, mx, my, aim, fire: Math.random() < 0.4, quiet: false, reload: false, ability: Math.random() < 0.02 });
    }, 66);
  }
  stopInputs() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  ping() { this.send({ t: 'ping', at: Math.round(performance.now()) }); }
  churn() {
    R.churnActs++;
    const r = Math.random();
    if (this.state === 'queued' && r < 0.4) { this.send({ t: 'leave' }); this.state = 'idle'; setTimeout(() => !this.done && this.queue(), 500 + Math.random() * 2000); }
    else if (this.state === 'queued' && r < 0.6) { this.map = pick(MAPSET); if (MODE === 'mix') this.mode = pick(['1v1', '3v3']); this.queue(); }
    else if (r < 0.8) {
      // Drop the socket and come back: mid-match it should resume (grace 20 s), in the queue it starts over.
      R.drops++; const was = this.state; this.state = 'dropping'; this.stopInputs(); this.ws.close();
      setTimeout(() => { if (this.done) return; R.reconnects++; this.state = was === 'match' ? 'reconnecting' : 'off'; this.open(was === 'match'); }, 500 + Math.random() * 3000);
    }
  }
}

const bots = Array.from({ length: N }, (_, i) => new Bot(i));
const samples = [];
const t0 = now();
bots.forEach((b, i) => setTimeout(() => { b.state = 'new'; b.open(); }, (RAMP * 1000 * i) / Math.max(1, N)));
const pinger = setInterval(() => bots.forEach((b) => b.ping()), 2000);
const churner = CHURN > 0 ? setInterval(() => bots.forEach((b) => { if (!b.done && Math.random() < CHURN) b.churn(); }), 1000) : null;
const dupT = DUP > 0 ? setTimeout(() => bots.filter(() => Math.random() < DUP).forEach((b) => {
  if (!b.token) return;
  R.dupOpened++;
  const ws = new WebSocket(url);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, name: b.name, hero: 'benja', token: b.token }));
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.t === 'welcome' && m.resumed) err('dup-took-over'); if (m.t === 'welcome') ws.send(JSON.stringify({ t: 'queue', mode: b.mode, map: b.map })); };
  setTimeout(() => ws.close(), 8000);
}), SECS * 400) : null;
const sampler = setInterval(async () => { try { const s = await (await fetch(stats)).json(); samples.push({ t: +(now() - t0).toFixed(1), ...s }); } catch { samples.push({ t: +(now() - t0).toFixed(1), down: true }); } }, 1000);

await new Promise((r) => setTimeout(r, SECS * 1000));
// Anyone still queued now: waiting is fine while their wait is under the server's timeout; longer is a silent hang.
const end = now();
const waiting = bots.filter((b) => b.state === 'queued').map((b) => +(end - b.qAt).toFixed(1));
const hung = waiting.filter((w) => w > QUEUE_TIMEOUT + 5).length;
const noSnap = bots.filter((b) => b.state === 'match' && !b.gotSnap && end - b.matchAt > (b.startsIn ?? 3) + 5).length;
bots.forEach((b) => { b.done = true; b.stopInputs(); try { b.ws?.close(); } catch { /* closed */ } });
clearInterval(pinger); clearInterval(sampler); if (churner) clearInterval(churner); if (dupT) clearTimeout(dupT);
const live = samples.filter((s) => !s.down);
const max = (k) => Math.max(0, ...live.map((s) => (k.includes('.') ? s.load?.[k.split('.')[1]] : s[k]) ?? 0));
const out = {
  config: { n: N, mode: MODE, maps: MAPSET.length, secs: SECS, ramp: RAMP, churn: CHURN, slow: SLOW, dup: DUP, sustain: SUSTAIN },
  queueJoins: R.queued, matched: R.matched, started: R.started, over: R.over, timeouts: R.timeouts,
  matchLatencyS: { p50: pct(R.lat, 50), p95: pct(R.lat, 95), p99: pct(R.lat, 99), max: pct(R.lat, 100) },
  startLatencyS: { p50: pct(R.startLat, 50), p95: pct(R.startLat, 95) },
  waitingAtEnd: waiting.length, waitingLongestS: waiting.length ? Math.max(...waiting) : 0, silentHangs: hung, matchedNoSnapshot: noSnap,
  churn: { acts: R.churnActs, drops: R.drops, reconnects: R.reconnects, resumed: R.resumed, resumeFailed: R.resumeFail, dupOpened: R.dupOpened, serverClosed: R.closesByServer },
  errors: R.errors,
  server: { maxSockets: max('sockets'), maxRooms: max('rooms'), maxQueued: max('queued'), maxCpuPct: max('load.cpuPct'), maxRssMb: max('load.rssMb'),
    maxStepMs: max('load.stepMs'), worstStepMs: max('load.worstStepMs'), lostSimS: live.length ? +((live.at(-1).load?.lostSimS ?? 0) - (live[0].load?.lostSimS ?? 0)).toFixed(2) : 0, downSamples: samples.length - live.length },
};
console.log(JSON.stringify(out, null, 1));
if (args.out) fs.writeFileSync(args.out, JSON.stringify({ ...out, samples }, null, 1));
process.exit(0);
