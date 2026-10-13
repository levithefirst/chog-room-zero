// Room Zero game server (RC-8): one Node process, WebSockets on /ws, a plain-text health check on /.
// Runs the authoritative lobby (server/room.ts) at the sim's fixed 60 Hz step. No database, no paid service: it runs
// on any host that keeps a Node process alive (docs/MULTIPLAYER.md). Build: npm run build:server. Run: npm run server.
// Env: PORT (default 8787), ALLOWED_ORIGINS (comma list; empty = any origin, for local tests), FRIENDLY_FIRE=1.
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, type WebSocket } from 'ws';
import { Lobby } from './room';
import { MAX_MESSAGE_BYTES, type ServerMsg } from '../src/net/protocol';
import { TUNING } from '../src/config/tuning';

const env = process.env;
const port = Number(env.PORT ?? 8787);
const origins = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const lobby = new Lobby({ now: () => performance.now() / 1000, friendlyFire: env.FRIENDLY_FIRE === '1' });

const http = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
  res.end(req.url === '/stats' ? JSON.stringify(lobby.stats()) : 'room-zero game server ok');
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
setInterval(() => {
  const now = performance.now() / 1000;
  acc = Math.min(acc + (now - last), step * 5);
  last = now;
  while (acc >= step) { lobby.tick(); acc -= step; }
}, 4);

http.listen(port, () => console.log(`room-zero game server on :${port} (ws path /ws)${origins.length ? `, origins ${origins.join(' ')}` : ', any origin'}`));
