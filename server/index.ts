// Room Zero game server (RC-8): one Node process, WebSockets on /ws, a plain-text health check on /.
// Runs the authoritative lobby (server/room.ts) at the sim's fixed 60 Hz step. No database, no paid service: it runs
// on any host that keeps a Node process alive (docs/MULTIPLAYER.md). Build: npm run build:server. Run: npm run server.
// Env: PORT (default 8787), ALLOWED_ORIGINS (comma list; empty = any origin, for local tests), FRIENDLY_FIRE=1,
// TICKET_CHECK_URL (the site's /api/game/ticket-check; default the production site; "off" = no tickets, everyone free).
// No secret lives here: tickets are checked by asking the site over HTTPS, and the site pulls results from GET /results/:id.
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, type WebSocket } from 'ws';
import { Lobby } from './room';
import { MAX_MESSAGE_BYTES, type ServerMsg } from '../src/net/protocol';
import { TUNING } from '../src/config/tuning';
import type { GameTicket } from '../api/_lib/game';

const env = process.env;
const port = Number(env.PORT ?? 8787);
const origins = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const ticketUrl = env.TICKET_CHECK_URL ?? 'https://chogroomzero.xyz/api/game/ticket-check';
const checkTicket = ticketUrl === 'off' ? null : async (ticket: string): Promise<GameTicket | null> => {
  const r = await fetch(ticketUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket }), signal: AbortSignal.timeout(4000) });
  if (!r.ok) return null;
  const j = (await r.json()) as { ok?: boolean; ticket?: GameTicket };
  return j.ok && j.ticket ? j.ticket : null;
};
const lobby = new Lobby({ now: () => performance.now() / 1000, friendlyFire: env.FRIENDLY_FIRE === '1', checkTicket });

const http = createServer((req, res) => {
  const m = /^\/results\/([0-9a-f]{8,32})$/.exec(req.url ?? '');
  if (m) {
    const r = lobby.result(m[1]);
    res.writeHead(r ? 200 : 404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(r ?? { error: 'unknown_match' }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
  // /stats names the commit this server runs (Render sets RENDER_GIT_COMMIT), so a deploy can be matched to the client.
  res.end(req.url === '/stats' ? JSON.stringify({ ...lobby.stats(), sockets: wss.clients.size, load: loadNow(), commit: env.RENDER_GIT_COMMIT ?? null }) : 'room-zero game server ok');
});

const wss = new WebSocketServer({
  server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES,
  verifyClient: ({ origin }: { origin: string }) => !origins.length || origins.includes(origin),
});

wss.on('connection', (ws: WebSocket) => {
  const id = lobby.connect({
    send: (m: ServerMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); },
    close: (code, reason) => ws.close(code, reason),
  });
  ws.on('message', (data, isBinary) => {
    if (isBinary) { ws.close(1003, 'text only'); return; }
    lobby.message(id, data.toString());
  });
  ws.on('close', () => lobby.disconnect(id));
  ws.on('error', () => lobby.disconnect(id));
});

// Fixed step: catch up at most 5 steps per wake so a stall never fast-forwards a match.
const step = TUNING.simStepSeconds;
let last = performance.now() / 1000, acc = 0;
// MP capacity: per 5 s window, how long one 60 Hz step takes (mean and worst) and the sim time dropped because the
// process could not keep up (lostSimS: since start, 0 is healthy). /stats shows the last full window with CPU and memory.
let win = { steps: 0, ms: 0, worst: 0, at: performance.now(), cpu: process.cpuUsage() };
let lostS = 0;
let shown = { stepMs: 0, worstStepMs: 0, lostSimS: 0, cpuPct: 0, rssMb: 0, heapMb: 0 };
const loadNow = () => shown;
setInterval(() => {
  const now = performance.now() / 1000;
  const due = acc + (now - last);
  if (due > step * 5) lostS += due - step * 5;
  acc = Math.min(due, step * 5);
  last = now;
  while (acc >= step) {
    const t0 = performance.now();
    lobby.tick();
    const ms = performance.now() - t0;
    win.steps++; win.ms += ms; if (ms > win.worst) win.worst = ms;
    acc -= step;
  }
  const el = performance.now() - win.at;
  if (el >= 5000) {
    const c = process.cpuUsage(win.cpu), m = process.memoryUsage();
    shown = { stepMs: +(win.ms / Math.max(1, win.steps)).toFixed(3), worstStepMs: +win.worst.toFixed(2), lostSimS: +lostS.toFixed(2),
      cpuPct: +(((c.user + c.system) / 1000 / el) * 100).toFixed(1), rssMb: Math.round(m.rss / 1048576), heapMb: Math.round(m.heapUsed / 1048576) };
    win = { steps: 0, ms: 0, worst: 0, at: performance.now(), cpu: process.cpuUsage() };
  }
}, 4);

http.listen(port, () => console.log(`room-zero game server on :${port} (ws path /ws)${origins.length ? `, origins ${origins.join(' ')}` : ', any origin'}`));
