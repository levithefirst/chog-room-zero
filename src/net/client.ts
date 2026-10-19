// Online client (RC-8). Talks to the authoritative server (server/room.ts) and turns its snapshots into a local
// "view world" the normal renderer and HUD can draw. The browser decides nothing about hits, damage, pickups or
// the result: it sends controls and shows what the server says. You are always actor 0 in the view world.
import { isPerk } from '../config/perks';
import { powerFor, signatureFor } from '../config/power';
import { applyFocus, createWorld, wrapAngle, type Actor, type ActorInput, type HitEvent, type SoundEvent, type SoundType, type World } from '../sim/world';
import { WEAPONS } from '../config/weapons';
import { TUNING } from '../config/tuning';
import { LAB } from '../config/lab';
import { ORB } from '../config/superpowers';
import { isMapId, type MapId } from '../config/maps';
import { Predictor } from './predict';
import type { Box } from '../sim/geom';
import { PROTOCOL, type Mode, type NetActor, type NetBeam, type NetProfile, type PartyMember, type PlayerResult, type ServerMsg } from './protocol';
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

export interface OverInfo { winner: Team | null; reason: string; results: PlayerResult[]; you: number; team: Team; mode: Mode; matchId: string | null; settle: boolean }

export class OnlineSession {
  state: NetState = 'offline';
  message = '';
  queue: { mode: Mode; have: number; need: number; code: string | null } | null = null;
  /** V2 telemetry: seconds from queueing to the match starting (the last match's). */
  queueS: number | null = null;
  private queuedAt: number | null = null;
  match: Extract<ServerMsg, { t: 'match' }> | null = null;
  over: OverInfo | null = null;
  world: World | null = null;
  /** Your own drawn facing and when it was drawn (CF-A turn cap on the cosmetic own facing). */
  private ownFacing: number | null = null;
  private ownAt = 0;
  /** SB: your own movement, predicted from your inputs and corrected by each snapshot (src/net/predict.ts). */
  readonly predictor = new Predictor();
  private lastFrameAt = 0;
  /** Slabs (barriers) from the last snapshot, added to the view level so the prediction walks around them. */
  private barrierBoxes: Box[] = [];
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
  /** What the server made of this connection's ticket (null before welcome). */
  profile: NetProfile | null = null;
  /** Gets a fresh game ticket before each hello (null: play as a free profile). Set by the game. */
  ticketSource: (() => Promise<string | null>) | null = null;
  /** Snapshots received this session (debug and hosted checks). */
  snapCount = 0;
  /** Your squad (code and members, you included), or null when you are not in one. */
  party: { code: string; members: PartyMember[] } | null = null;
  private pendingParty: object | null = null;
  /** Squad: create one, join one by code, or leave. Connects first when needed. */
  partyOp(op: 'create' | 'leave' | 'join', code?: string): void {
    this.pendingParty = { t: 'party', op, ...(op === 'join' ? { code } : {}) };
    // A new squad action replaces the last one's result (a bad code must not stay on screen after a good join).
    this.message = '';
    if (this.state === 'idle' || this.state === 'over' || this.state === 'queued') { this.send(this.pendingParty); this.pendingParty = null; }
    else if (this.state !== 'match' && this.state !== 'reconnecting') this.connect();
  }
  /** Am I in a squad but not its leader (then the leader starts every match)? */
  get follower(): boolean { return !!this.party && this.party.members.length > 1 && !this.party.members.find((m) => m.you)?.leader; }

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
      // A ticket is single use and lives 10 minutes, so each connection asks for a new one (resumes need none).
      const ticket = this.state === 'reconnecting' || !this.ticketSource ? Promise.resolve(null) : this.ticketSource().catch(() => null);
      void ticket.then((tk) => {
        if (this.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, name: this.name(), hero: this.hero(), ...(this.token ? { token: this.token } : {}), ...(tk ? { ticket: tk } : {}) }));
      });
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

  joinQueue(mode: Mode, code?: string, map: MapId = 'room-zero'): void {
    this.over = null;
    this.queuedAt = performance.now();
    this.queueS = null;
    this.queue = { mode, have: 0, need: 0, code: code ?? null };
    this.pendingQueue = { mode, code, map };
    // After a match the server already has this player back in its lobby: queue straight away.
    if (this.state === 'idle' || this.state === 'over') { this.state = 'idle'; this.sendQueue(); }
    else this.connect();
  }
  private pendingQueue: { mode: Mode; code?: string; map: MapId } | null = null;
  private sendQueue(): void {
    if (!this.pendingQueue) return;
    this.send({ t: 'queue', mode: this.pendingQueue.mode, map: this.pendingQueue.map, ...(this.pendingQueue.code ? { code: this.pendingQueue.code } : {}) });
    this.pendingQueue = null;
  }

  leave(): void {
    this.pendingQueue = null;
    this.send({ t: 'leave' });
    if (this.state === 'queued') this.state = 'idle';
    // Out of a match (the server frees this player at once): back in the lobby with nothing of the match left, so the
    // game does not walk back into it and the next joinQueue queues straight away.
    else if (this.state === 'match') { this.state = 'idle'; this.dropMatch(); }
    // Dropped and trying to come back: stop trying, and forget the token so the next connection is a fresh player
    // instead of a resume (the server counts the operator as gone after its grace period).
    else if (this.state === 'reconnecting') {
      this.close();
      this.message = '';
      this.dropMatch();
      this.token = null;
      try { this.store?.removeItem('chog-room-zero:net-token'); } catch { /* storage blocked */ }
    }
    // Cancel while still reaching the server (or waiting for a sleeping one to wake): stop trying, back to idle.
    else if (this.state === 'connecting' || this.state === 'error') { this.close(); this.message = ''; }
    this.queue = null;
  }

  /** Forget the current match (left, cancelled): no view world, no roster, no prediction. */
  private dropMatch(): void {
    this.match = null;
    this.world = null;
    this.over = null;
    this.snaps = [];
    this.pendingEvents = [];
    this.spotted = [];
    this.predictor.reset();
    this.startsAt = 0;
  }

  /** Seconds until the match starts (the server's countdown), 0 once it has. */
  startsIn(now = performance.now()): number { return this.match ? Math.max(0, (this.startsAt - now) / 1000) : 0; }
  private startsAt = 0;

  /** Controls, throttled to 30 Hz; taps (fire, reload, ability) are sent at once so none is lost. */
  sendInput(inp: ActorInput, now: number): void {
    if (this.state !== 'match') return;
    const urgent = inp.reload || inp.ability || !!inp.grenade || (inp.firing && !this.lastFire);
    this.lastFire = inp.firing;
    if (!urgent && now - this.lastSent < 1000 / INPUT_HZ) return;
    this.lastSent = now;
    this.predictor.sent(this.seq + 1, inp);
    this.send({ t: 'input', seq: ++this.seq, mx: inp.moveX, my: inp.moveY, aim: inp.aim, fire: inp.firing, quiet: inp.quiet, reload: inp.reload, ability: inp.ability,
      ...(inp.grenade ? { nade: true, nd: Math.round((inp.throwDist ?? TUNING.grenade.touchThrow) * 100) / 100, ...(inp.throwAim !== undefined ? { na: Math.round(inp.throwAim * 1000) / 1000 } : {}) } : {}) });
  }
  private lastFire = false;

  /**
   * Let go of every control NOW (SB lifecycle): the page is being hidden (a call, an app switch, a locked screen) and
   * its render loop is about to stop, so the throttled per-frame send would never deliver the release. Without this
   * the server keeps your last input and a held W keeps walking you into the open.
   */
  release(aim: number): void {
    if (this.state !== 'match') return;
    const idle: ActorInput = { moveX: 0, moveY: 0, quiet: false, aim, firing: false, reload: false, ability: false, grenade: false };
    this.lastSent = 0;
    this.lastFire = false;
    this.predictor.sent(this.seq + 1, idle);
    this.send({ t: 'input', seq: ++this.seq, mx: 0, my: 0, aim, fire: false, quiet: false, reload: false, ability: false });
  }

  ping(now: number): void { this.send({ t: 'ping', at: now }); }

  private onMsg(m: ServerMsg): void {
    if (m.t !== 'snap' && m.t !== 'pong') this.note(m.t === 'error' ? `error ${m.code}` : m.t === 'queued' ? `queued ${m.have}/${m.need}` : m.t);
    switch (m.t) {
      case 'welcome':
        this.token = m.token;
        // A resumed welcome carries the profile too (a reloaded tab has none yet); an older server sends none then.
        if (m.profile || !m.resumed) this.profile = m.profile ?? null;
        // The server starts the ack over on a resume: inputs from before the drop are never replayed.
        if (m.resumed) this.predictor.reset();
        try { this.store?.setItem('chog-room-zero:net-token', m.token); } catch { /* storage blocked */ }
        this.wakeUntil = 0;
        if (this.state === 'reconnecting' && !m.resumed) { this.state = 'error'; this.message = 'The match ended while you were away.'; return; }
        if (this.state !== 'reconnecting') this.state = 'idle';
        this.message = '';
        if (this.pendingParty) { this.send(this.pendingParty); this.pendingParty = null; }
        this.sendQueue();
        return;
      case 'party':
        this.party = m.code ? { code: m.code, members: m.members } : null;
        return;
      case 'queued':
        this.state = 'queued';
        this.queue = { mode: m.mode, have: m.have, need: m.need, code: m.code };
        return;
      case 'queueTimeout':
        this.state = 'idle';
        this.queue = null;
        this.message = this.party && this.party.members.length > 1 ? 'Your squad left the queue.' : 'Nobody else is looking for this match right now. Try again, or play solo against bots.';
        return;
      case 'match':
        this.state = 'match';
        if (this.queuedAt !== null) { this.queueS = Math.round((performance.now() - this.queuedAt) / 1000); this.queuedAt = null; }
        this.message = '';
        this.queue = null;
        if (!this.match || this.match.room !== m.room) this.buildWorld(m);
        this.match = m;
        this.startsAt = performance.now() + m.startsIn * 1000;
        return;
      case 'snap':
        this.onSnap(m);
        return;
      case 'over':
        // Back in the lobby on the server (a squad stays together; the leader can queue again).
        this.state = 'over';
        if (this.match) this.over = { winner: m.winner, reason: m.reason, results: m.results, you: this.match.you, team: this.match.team, mode: this.match.mode, matchId: m.matchId ?? null, settle: !!m.settle };
        return;
      case 'pong':
        this.rtt = performance.now() - m.at;
        return;
      case 'error':
        this.message = m.message;
        if (m.code === 'rate' || m.code === 'idle') this.state = 'error';
        if (m.code === 'holders-only' || m.code === 'token-in-use' || m.code.startsWith('party-')) { if (this.state === 'queued' || this.state === 'connecting') this.state = 'idle'; this.queue = null; }
        // Voided before the start (a side left in the countdown): back to the lobby, the message says why.
        if (m.code === 'match-cancelled' && (this.state === 'match' || this.state === 'reconnecting')) { this.state = 'idle'; this.dropMatch(); }
        return;
    }
  }

  /** Hostile beams crossing you whose owner you are not shown (from the newest snapshot; view actor ids). */
  beams: NetBeam[] = [];
  /** Visor: hostiles on your tracker you are not shown, and whether a hostile Visor has you on its tracker. */
  tracks: { id: number; x: number; y: number }[] = [];
  tracked = false;
  /** Teammates' sightings from the newest snapshot (view actor ids). */
  spotted: { id: number; x: number; y: number }[] = [];

  private buildWorld(m: Extract<ServerMsg, { t: 'match' }>): void {
    // You first, then your team, then the other team.
    const order = [...m.roster].sort((a, b) => (a.id === m.you ? -1 : b.id === m.you ? 1 : (a.team === m.team ? 0 : 1) - (b.team === m.team ? 0 : 1) || a.id - b.id));
    this.toView = new Map(order.map((r, i) => [r.id, i]));
    this.fromView = order.map((r) => r.id);
    this.world = createWorld({
      seed: m.seed, zone: false, friendlyFire: m.friendlyFire, mapId: isMapId(m.map) ? m.map : 'room-zero',
      versus: order.map((r) => ({ name: r.name, hero: r.hero, team: r.team as 'alpha' | 'bravo', x: -100, y: -100, facing: 0, power: powerFor(r.tier ?? 'free', null, r.metadataId && r.tier === 'legendary' ? signatureFor(r.metadataId) : null, !!r.demo, r.metadataId, r.sp ?? null) })),
    });
    // The server's ability slot (hero ability or 1:1 signature, with upgrades) so the HUD and telegraphs match it.
    order.forEach((r, i) => { const act = this.world!.actors[i]; if (r.ability) act.ability = { ...act.ability, ...r.ability, ...(r.metadataId && r.tier === 'legendary' ? signatureFor(r.metadataId) : {}), cooldown: r.ability.cooldown }; });
    this.world.zone = m.zone.length ? { plan: m.zone as Circle[], cfg: TUNING.zone } : null;
    this.snaps = [];
    this.spotted = [];
    this.predictor.reset();
    this.barrierBoxes = [];
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
      sounds: m.sounds.map((s) => ({ type: s.type as SoundType, x: s.x, y: s.y, radius: s.radius, sourceId: v(s.source), team: s.team, tick: m.tick, weapon: s.weapon, blocked: s.blocked, sig: s.sig, ...(s.est ? { est: s.est } : {}) })),
      hits: m.hits.map((h) => ({ target: v(h.target), by: v(h.by), x: h.x, y: h.y, fromX: h.fromX, fromY: h.fromY, hpDamage: 0, armorDamage: 0, killed: h.killed, downed: h.downed, grenade: h.grenade })),
    });
    // A hostile beam you are not shown, crossing you: only its stretch of line near you (drawn as a warning).
    this.beams = (m.bm ?? []).map((b) => ({ ...b, o: v(b.o) }));
    // Visor: hostiles on your tracker that you are not shown (their spot only).
    this.tracks = (m.vt ?? []).map((t) => ({ id: v(t.id), x: t.x, y: t.y }));
    this.tracked = !!m.actors.find((a) => a.id === this.fromView[0])?.tk;
    m.pickups.forEach((on, i) => { if (w.pickups[i]) w.pickups[i].active = on; });
    // Hostiles only a teammate sees: spots the server placed near them (fed to the contact intel, never drawn as bodies).
    this.spotted = (m.sp ?? []).map((s) => ({ id: v(s.id), x: s.x, y: s.y }));
    // The server's word on where each pickup is (they move when they come back).
    if (m.pk) w.pickups.forEach((k, i) => { if (m.pk!.length > i * 2 + 1) { k.x = m.pk![i * 2]; k.y = m.pk![i * 2 + 1]; } });
    // GP loot bags the server says your team knows of: drawn from what kinds they hold, never decided here.
    w.loot = (m.lt ?? []).map((l) => ({ id: l.id, x: l.x, y: l.y, left: l.left, health: l.k & 1 ? 1 : 0, armor: l.k & 2 ? 1 : 0, mags: l.k & 4 ? 1 : 0, grenades: l.k & 8 ? 1 : 0, perk: isPerk(l.p) ? l.p : null, from: -1, team: 'bot' as const, known: [] }));
    w.barriers = m.barriers.map((b) => ({ box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, left: b.left, owner: -1 }));
    // The view level's solid boxes carry the slabs too, so your predicted walk stops at one like the server's does.
    const solid = w.level.solidBoxes;
    for (const b of this.barrierBoxes) { const i = solid.indexOf(b); if (i >= 0) solid.splice(i, 1); }
    this.barrierBoxes = w.barriers.map((b) => b.box);
    solid.push(...this.barrierBoxes);
    // SB prediction: the server's word on where you are, with the inputs it has not applied yet replayed on top.
    const mine = m.actors.find((a) => a.id === this.fromView[0]);
    if (m.ack === undefined || !mine) return;
    if (!mine.alive) { this.predictor.reset(); return; }
    const me = w.actors[0];
    this.predictor.reconcile(w.level, { x: mine.x, y: mine.y, vx: mine.vx, vy: mine.vy, hero: me.hero, slowLeft: mine.slowLeft ?? 0, slowMul: mine.slowMul ?? 1,
      dashLeft: 0, dashX: 0, dashY: 0, downed: !!mine.downed,
      // Superpowers on you: a charging or burning beam slows you, a cage holds you, goo drags and glues you.
      chargeLeft: mine.cl ?? 0, beamLeft: mine.bl ?? 0, trapLeft: mine.tl ?? 0, trapX: mine.tx ?? 0, trapY: mine.ty ?? 0, trapR: mine.tr ?? 0,
      pinLeft: mine.pl ?? 0, pinX: mine.px ?? 0, pinY: mine.py ?? 0 }, m.ack, m.as ?? 0);
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
        const s = newest.byId.get(id);
        if (s) copy(act, s);
        // You (SB): predicted from your own inputs by the server's movement rule, so the operator answers the stick at once.
        // Before the first acknowledged snapshot (or with an older server) the newest server state, nudged forward.
        // Held still until the server's countdown ends (it applies no step before then).
        this.predictor.advance(w.level, now < this.startsAt ? 0 : Math.min(0.1, (now - (this.lastFrameAt || now)) / 1000));
        const d = s?.alive ? this.predictor.drawn() : null;
        if (d) { act.x = d.x; act.y = d.y; act.vx = d.vx; act.vy = d.vy; }
        else if (s) { const dt = Math.min(0.1, (now - newest.at) / 1000); if (s.alive) { act.x += s.vx * dt; act.y += s.vy * dt; } }
        // Drawn at once toward your aim, at the same turn cap the server applies (CF-A), so the lamp you see is the
        // lamp the server will have.
        if (aim !== null && act.alive) {
          const prev = this.ownFacing ?? act.facing, cap = TUNING.movement.turnRateDegPerSec * Math.PI / 180 * Math.min(0.1, (now - this.ownAt) / 1000);
          const d = Math.atan2(Math.sin(aim - prev), Math.cos(aim - prev));
          act.facing = LAB.turn ? wrapAngle(prev + Math.max(-cap, Math.min(cap, d))) : aim;
          this.ownFacing = act.facing;
          act.aimLag = Math.abs(Math.atan2(Math.sin(aim - act.facing), Math.cos(aim - act.facing)));
        }
        this.ownAt = now;
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
    this.lastFrameAt = now;
    // Bullets: the newest server bullets, carried forward along their path to now.
    const ahead = Math.min(0.15, (serverNow - newest.tick) * STEP);
    w.bullets = newest.msg.bullets.map((x) => {
      const weapon = WEAPONS[x.weapon] ?? WEAPONS.rifle;
      return { x: x.x + x.dx * weapon.bulletSpeed * ahead, y: x.y + x.dy * weapon.bulletSpeed * ahead, dx: x.dx, dy: x.dy, ox: x.ox, oy: x.oy, life: 1, owner: this.toView.get(x.owner) ?? 1, weapon, alive: true };
    });
    // Superpower globs: the newest server state, carried forward along their path to now.
    w.orbs = (newest.msg.ob ?? []).map((o) => {
      const owner = this.toView.get(o.owner) ?? 1, sp = ORB.speed[o.k];
      return { id: o.id, kind: o.k, x: o.x + o.dx * sp * ahead, y: o.y + o.dy * sp * ahead, dx: o.dx, dy: o.dy, ox: o.x, oy: o.y, left: 1, owner, team: w.actors[owner]?.team ?? 'bravo', alive: true };
    });
    // Grenades: the newest server state, rolled forward along their velocity to now (drawn with the fuse ring).
    w.grenades = (newest.msg.grenades ?? []).map((g) => {
      const owner = this.toView.get(g.owner) ?? 1;
      return { id: g.id, x: g.x + g.vx * ahead, y: g.y + g.vy * ahead, vx: g.vx, vy: g.vy, fuse: Math.max(0, g.fuse - ahead), owner, team: w.actors[owner]?.team ?? 'bravo', alive: true };
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
  act.shieldLeft = s.shieldLeft ?? 0; act.frenzyLeft = s.frenzyLeft ?? 0; act.slowLeft = s.slowLeft ?? 0; act.burstLeft = s.burstLeft ?? 0;
  act.downed = !!s.downed; act.reviveProgress = s.reviveProgress ?? 0;
  if (s.nades !== undefined) act.grenades = s.nades;
  if (s.maxNades !== undefined) act.maxGrenades = s.maxNades;
  act.focus = s.focus ?? 0;
  act.perk = isPerk(s.perk) ? s.perk : null;
  act.bagStill = s.bag ?? 0;
  // Sent only when someone on your side marked it: in a two-side match that is the other side from it.
  act.markLeft = s.mk ? TUNING.perks.markerSeconds : 0;
  act.markTeam = s.mk ? (act.team === 'alpha' ? 'bravo' : 'alpha') : null;
  act.chargeLeft = s.cl ?? 0; act.beamLeft = s.bl ?? 0; if (s.ba !== undefined) act.beamAng = s.ba;
  act.trapLeft = s.tl ?? 0; act.trapX = s.tx ?? act.x; act.trapY = s.ty ?? act.y; act.trapR = s.tr ?? 0;
  act.pinLeft = s.pl ?? 0; act.pinX = s.px ?? act.x; act.pinY = s.py ?? act.y;
  act.auraLeft = s.al ?? 0;
  applyFocus(act);
}
