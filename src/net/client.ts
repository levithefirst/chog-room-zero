// Online client (RC-8). Talks to the authoritative server (server/room.ts) and turns its snapshots into a local
// "view world" the normal renderer and HUD can draw. The browser decides nothing about hits, damage, pickups or
// the result: it sends controls and shows what the server says. You are always actor 0 in the view world.
import { createWorld, type Actor, type ActorInput, type HitEvent, type SoundEvent, type SoundType, type World } from '../sim/world';
import { WEAPONS } from '../config/weapons';
import { TUNING } from '../config/tuning';
import { PROTOCOL, type Mode, type NetActor, type PlayerResult, type ServerMsg } from './protocol';
import type { Circle } from '../sim/zone';
import type { Team } from '../sim/world';

export type NetState = 'offline' | 'connecting' | 'idle' | 'queued' | 'match' | 'over' | 'reconnecting' | 'error';

const STEP = TUNING.simStepSeconds;
// Others are drawn this many sim steps behind the newest snapshot (two snapshots at 20 Hz), so there is always a
// pair to interpolate between.
const INTERP_STEPS = 6;
const INPUT_HZ = 30;

/** Where the game server lives: ?server=wss://... (tests) or the build's VITE_GAME_SERVER_URL. Null = not deployed. */
export function serverUrl(search: string, envUrl: string | undefined): string | null {
  const q = new URLSearchParams(search).get('server');
  const u = q ?? envUrl ?? '';
  return /^wss?:\/\/[^\s]+$/.test(u) ? u : null;
}

interface Snap { tick: number; at: number; byId: Map<number, NetActor>; msg: Extract<ServerMsg, { t: 'snap' }> }

export interface OverInfo { winner: Team | null; reason: string; results: PlayerResult[]; you: number; team: Team; mode: Mode }

export class OnlineSession {
  state: NetState = 'offline';
  message = '';
  queue: { mode: Mode; have: number; need: number; code: string | null } | null = null;
  match: Extract<ServerMsg, { t: 'match' }> | null = null;
  over: OverInfo | null = null;
  world: World | null = null;
  /** Server actor id -> view index (you are 0). */
  private toView = new Map<number, number>();
  private fromView: number[] = [];
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private snaps: Snap[] = [];
  private lastSent = 0;
  private seq = 0;
  private pendingEvents: { sounds: SoundEvent[]; hits: HitEvent[] }[] = [];
  private retryUntil = 0;
  /** Render Free sleeps after 15 idle minutes and takes about a minute to wake; until then a socket is refused. */
  private wakeUntil = 0;
  /** Keep-alive ping on a timer, not the render loop: a slow or backgrounded page must not be kicked as idle (10 s). */
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** Connection events, newest last (debug builds show it; tools/hosted checks read it). */
  readonly log: string[] = [];
  private note(e: string): void {
    this.log.push(`${(performance.now() / 1000).toFixed(1)} ${e}`);
    if (this.log.length > 40) this.log.shift();
  }
  rtt = 0;
  /** Snapshots received this session (debug and hosted checks). */
  snapCount = 0;

  constructor(readonly url: string, private name: () => string, private hero: () => string, private store: Storage | null) {
    try { this.token = store?.getItem('chog-room-zero:net-token') ?? null; } catch { this.token = null; }
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.state !== 'reconnecting') this.state = 'connecting';
    if (this.state === 'connecting' && this.wakeUntil === 0) {
      // A plain HTTP request is what wakes a sleeping free host; the socket is retried below until it answers.
      this.wakeUntil = performance.now() + 90000;
      try { void fetch(this.url.replace(/^ws/, 'http').replace(/\/ws$/, '/'), { mode: 'no-cors', cache: 'no-store' }).catch(() => undefined); } catch { /* no fetch */ }
    }
    const ws = new WebSocket(this.url);
    this.ws = ws;
    this.note(`connect ${this.state}`);
    ws.onopen = () => {
      this.note('open');
      ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, name: this.name(), hero: this.hero(), ...(this.token ? { token: this.token } : {}) }));
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => { if (this.ws === ws) this.ping(performance.now()); }, 2000);
    };
    ws.onmessage = (e) => { try { this.onMsg(JSON.parse(String(e.data)) as ServerMsg); } catch { /* ignore a bad frame */ } };
    ws.onclose = (e) => {
      this.note(`close ${e.code} ${e.reason || ''}`.trim());
      if (this.ws !== ws) return;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      this.ws = null;
      // Dropped mid-match: try to come back with the same token (the server keeps the operator for 20 s).
      if (this.state === 'match' || this.state === 'reconnecting') {
        if (this.state !== 'reconnecting') this.retryUntil = performance.now() + 20000;
        this.state = 'reconnecting';
        this.message = 'Connection lost. Reconnecting...';
        if (performance.now() < this.retryUntil) setTimeout(() => this.connect(), 1500);
        else { this.state = 'error'; this.message = 'Could not reconnect. The match went on without you.'; }
      } else if (this.state === 'connecting' && performance.now() < this.wakeUntil) {
        this.message = 'Waking the game server (free hosting, up to a minute)...';
        setTimeout(() => { if (this.state === 'connecting') this.connect(); }, 3000);
      } else if (this.state !== 'over' && this.state !== 'offline') {
        this.state = 'error';
        this.wakeUntil = 0;
        this.message = 'Could not reach the game server.';
      }
    };
  }

  close(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    this.state = 'offline';
    this.wakeUntil = 0;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private send(m: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  joinQueue(mode: Mode, code?: string): void {
    this.over = null;
    this.queue = { mode, have: 0, need: 0, code: code ?? null };
    this.pendingQueue = { mode, code };
    if (this.state === 'idle') this.sendQueue();
    else this.connect();
  }
  private pendingQueue: { mode: Mode; code?: string } | null = null;
  private sendQueue(): void {
    if (!this.pendingQueue) return;
    this.send({ t: 'queue', mode: this.pendingQueue.mode, ...(this.pendingQueue.code ? { code: this.pendingQueue.code } : {}) });
    this.pendingQueue = null;
  }

  leave(): void {
    this.pendingQueue = null;
    this.send({ t: 'leave' });
    if (this.state === 'queued') this.state = 'idle';
    this.queue = null;
  }

  /** Controls, throttled to 30 Hz; taps (fire, reload, ability) are sent at once so none is lost. */
  sendInput(inp: ActorInput, now: number): void {
    if (this.state !== 'match') return;
    const urgent = inp.reload || inp.ability || (inp.firing && !this.lastFire);
    this.lastFire = inp.firing;
    if (!urgent && now - this.lastSent < 1000 / INPUT_HZ) return;
    this.lastSent = now;
    this.send({ t: 'input', seq: ++this.seq, mx: inp.moveX, my: inp.moveY, aim: inp.aim, fire: inp.firing, quiet: inp.quiet, reload: inp.reload, ability: inp.ability });
  }
  private lastFire = false;

  ping(now: number): void { this.send({ t: 'ping', at: now }); }

  private onMsg(m: ServerMsg): void {
    if (m.t !== 'snap' && m.t !== 'pong') this.note(m.t === 'error' ? `error ${m.code}` : m.t === 'queued' ? `queued ${m.have}/${m.need}` : m.t);
    switch (m.t) {
      case 'welcome':
        this.token = m.token;
        try { this.store?.setItem('chog-room-zero:net-token', m.token); } catch { /* storage blocked */ }
        this.wakeUntil = 0;
        if (this.state === 'reconnecting' && !m.resumed) { this.state = 'error'; this.message = 'The match ended while you were away.'; return; }
        if (this.state !== 'reconnecting') this.state = 'idle';
        this.message = '';
        this.sendQueue();
        return;
      case 'queued':
        this.state = 'queued';
        this.queue = { mode: m.mode, have: m.have, need: m.need, code: m.code };
        return;
      case 'queueTimeout':
        this.state = 'idle';
        this.queue = null;
        this.message = 'Nobody else is looking for this match right now. Try again, or play solo against bots.';
        return;
      case 'match':
        this.state = 'match';
        this.message = '';
        this.queue = null;
        if (!this.match || this.match.room !== m.room) this.buildWorld(m);
        this.match = m;
        return;
      case 'snap':
        this.onSnap(m);
        return;
      case 'over':
        this.state = 'over';
        if (this.match) this.over = { winner: m.winner, reason: m.reason, results: m.results, you: this.match.you, team: this.match.team, mode: this.match.mode };
        return;
      case 'pong':
        this.rtt = performance.now() - m.at;
        return;
      case 'error':
        this.message = m.message;
        if (m.code === 'rate' || m.code === 'idle') this.state = 'error';
        return;
    }
  }

  private buildWorld(m: Extract<ServerMsg, { t: 'match' }>): void {
    // You first, then your team, then the other team.
    const order = [...m.roster].sort((a, b) => (a.id === m.you ? -1 : b.id === m.you ? 1 : (a.team === m.team ? 0 : 1) - (b.team === m.team ? 0 : 1) || a.id - b.id));
    this.toView = new Map(order.map((r, i) => [r.id, i]));
    this.fromView = order.map((r) => r.id);
    this.world = createWorld({
      seed: m.seed, zone: false, friendlyFire: m.friendlyFire,
      versus: order.map((r) => ({ name: r.name, hero: r.hero, team: r.team as 'alpha' | 'bravo', x: -100, y: -100, facing: 0 })),
    });
    this.world.zone = m.zone.length ? { plan: m.zone as Circle[], cfg: TUNING.zone } : null;
    this.snaps = [];
    this.over = null;
  }

  private onSnap(m: Extract<ServerMsg, { t: 'snap' }>): void {
    const w = this.world;
    if (!w) return;
    this.snapCount++;
    this.snaps.push({ tick: m.tick, at: performance.now(), byId: new Map(m.actors.map((a) => [a.id, a])), msg: m });
    if (this.snaps.length > 12) this.snaps.shift();
    const v = (id: number) => this.toView.get(id) ?? 0;
    this.pendingEvents.push({
      sounds: m.sounds.map((s) => ({ type: s.type as SoundType, x: s.x, y: s.y, radius: s.radius, sourceId: v(s.source), team: s.team, tick: m.tick, weapon: s.weapon, blocked: s.blocked })),
      hits: m.hits.map((h) => ({ target: v(h.target), by: v(h.by), x: h.x, y: h.y, fromX: h.fromX, fromY: h.fromY, hpDamage: 0, armorDamage: 0, killed: h.killed })),
    });
    m.pickups.forEach((on, i) => { if (w.pickups[i]) w.pickups[i].active = on; });
    w.barriers = m.barriers.map((b) => ({ box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, left: b.left, owner: -1 }));
  }

  /** Events from snapshots received since the last call, in order (feed them to the same handlers as solo). */
  takeEvents(): { sounds: SoundEvent[]; hits: HitEvent[] }[] {
    const e = this.pendingEvents;
    this.pendingEvents = [];
    return e;
  }

  /** Server tick the view shows now, and copies the interpolated state into the view world. `aim` is your own
   * current aim, drawn at once (cosmetic only: the server turns you when your input arrives). */
  update(aim: number | null): void {
    const w = this.world;
    if (!w || !this.snaps.length) return;
    const now = performance.now();
    const newest = this.snaps[this.snaps.length - 1];
    const serverNow = newest.tick + (now - newest.at) / 1000 / STEP;
    const renderTick = serverNow - INTERP_STEPS;
    let a = this.snaps[0], b = newest;
    for (let i = 0; i < this.snaps.length - 1; i++) if (this.snaps[i].tick <= renderTick && this.snaps[i + 1].tick >= renderTick) { a = this.snaps[i]; b = this.snaps[i + 1]; break; }
    const u = b.tick > a.tick ? Math.max(0, Math.min(1, (renderTick - a.tick) / (b.tick - a.tick))) : 1;
    w.tick = Math.max(0, Math.floor(serverNow));
    for (let vi = 0; vi < w.actors.length; vi++) {
      const act = w.actors[vi];
      const id = this.fromView[vi];
      if (vi === 0) {
        // You: the newest server state, nudged forward by your server velocity (no waiting on interpolation).
        const s = newest.byId.get(id);
        if (s) { copy(act, s); const dt = Math.min(0.1, (now - newest.at) / 1000); if (s.alive) { act.x += s.vx * dt; act.y += s.vy * dt; } }
        if (aim !== null && act.alive) act.facing = aim;
        continue;
      }
      const sa = a.byId.get(id), sb = b.byId.get(id);
      if (sa && sb) {
        copy(act, sb);
        act.x = sa.x + (sb.x - sa.x) * u;
        act.y = sa.y + (sb.y - sa.y) * u;
        act.facing = sa.facing + Math.atan2(Math.sin(sb.facing - sa.facing), Math.cos(sb.facing - sa.facing)) * u;
      } else if (sb ?? newest.byId.get(id)) copy(act, (sb ?? newest.byId.get(id))!);
      else { act.x = act.y = -100; act.vx = act.vy = 0; } // not visible to your team: drawn nowhere
    }
    // Bullets: the newest server bullets, carried forward along their path to now.
    const ahead = Math.min(0.15, (serverNow - newest.tick) * STEP);
    w.bullets = newest.msg.bullets.map((x) => {
      const weapon = WEAPONS[x.weapon] ?? WEAPONS.rifle;
      return { x: x.x + x.dx * weapon.bulletSpeed * ahead, y: x.y + x.dy * weapon.bulletSpeed * ahead, dx: x.dx, dy: x.dy, ox: x.ox, oy: x.oy, life: 1, owner: this.toView.get(x.owner) ?? 1, weapon, alive: true };
    });
  }

  /** The newest server state of you (for the HUD), or null before the first snapshot. */
  me(): Actor | null { return this.world?.actors[0] ?? null; }
}

function copy(act: Actor, s: NetActor): void {
  act.x = s.x; act.y = s.y; act.vx = s.vx; act.vy = s.vy; act.facing = s.facing;
  act.hp = s.hp; act.maxHp = s.maxHp; act.armor = s.armor; act.maxArmor = s.maxArmor; act.alive = s.alive;
  act.ammo = s.ammo; act.reserve = s.reserve; act.reloadLeft = s.reloadLeft; act.abilityCd = s.abilityCd; act.revealLeft = s.revealLeft;
  act.muzzle = s.muzzle; act.hitFlash = s.hitFlash; act.deadFor = s.deadFor; act.lastSpread = s.lastSpread; act.stepAcc = s.stepAcc; act.kills = s.kills;
}
