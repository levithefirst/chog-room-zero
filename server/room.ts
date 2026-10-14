// Authoritative online play (RC-8): lobby, matchmaking, rooms. Transport-free: the host (server/index.ts) passes in
// connections, raw messages and a 60 Hz tick, so every rule here is unit-tested with fake sockets
// (tests/rc8-online.test.ts) and exercised end to end by real browsers (tools/rc8-online.mjs).
// The server owns the match: it steps the same deterministic sim as solo play (src/sim/world.ts) with each player's
// latest controls. Clients never send positions, hits, damage or results, only controls.
import { randomBytes } from 'node:crypto';
import { createWorld, down, IDLE_INPUT, matchSeconds, revealed, standing, stepWorld, type Actor, type ActorInput, type Team, type World } from '../src/sim/world';
import { canSee, muzzleFlashSeen } from '../src/sim/vision';
import { hears } from '../src/sim/world';
import { HEROES } from '../src/config/heroes';
import { VERSUS_SPAWNS } from '../src/config/map';
import { TUNING } from '../src/config/tuning';
import { validateNickname } from '../src/ui/profile';
import { MODE_SIZE, PROTOCOL, parseClientMsg, toActorInput, type ClientMsg, type Mode, type NetActor, type NetBullet, type NetHit, type NetProfile, type NetSound, type PlayerResult, type ServerMsg } from '../src/net/protocol';
import { BASE_POWER, powerFor, signatureFor, type Power, type Tier } from '../src/config/power';
import type { GameTicket, MatchRecord } from '../api/_lib/game';

export interface Conn {
  send(msg: ServerMsg): void;
  close(code: number, reason: string): void;
}

export interface LobbyOptions {
  now(): number;
  /** Seconds a player may wait in a queue before it gives up (client offers solo vs bots). */
  queueTimeoutSec: number;
  /** Seconds a disconnected player's operator waits for them to come back before it is out. */
  reconnectGraceSec: number;
  /** A connection that sends nothing for this long is closed (clients send input or ping several times a second). */
  idleTimeoutSec: number;
  /** Hard cap on a match: then the team with more health standing wins (the zone normally ends it well before). */
  matchLimitSec: number;
  /** Countdown before the first step, so every client has the roster and the map. */
  countdownSec: number;
  /** Send a snapshot every N sim steps (3 = 20 Hz at the 60 Hz sim). */
  snapEvery: number;
  /** Rate limit: messages per second refilled into the bucket, and its size. */
  ratePerSec: number;
  rateBurst: number;
  friendlyFire: boolean;
  seed(): number;
  /** Asks the site whether a game ticket is genuine (server/index.ts: POST /api/game/ticket-check). Null = no tickets. */
  checkTicket: ((ticket: string) => Promise<GameTicket | null>) | null;
  /** Finished match records kept for settlement, in seconds. */
  resultsKeepSec: number;
}

export const DEFAULT_OPTIONS: Omit<LobbyOptions, 'now' | 'seed'> = {
  queueTimeoutSec: 90, reconnectGraceSec: 20, idleTimeoutSec: 10, matchLimitSec: 240, countdownSec: 3, snapEvery: 3,
  ratePerSec: 90, rateBurst: 60, friendlyFire: false, checkTicket: null, resultsKeepSec: 2 * 3600,
};

interface Player {
  id: number;
  conn: Conn | null;
  token: string;
  name: string;
  hero: string;
  state: 'new' | 'idle' | 'queued' | 'playing';
  queueKey: string | null;
  queuedAt: number;
  room: Room | null;
  actorId: number;
  lastMsgAt: number;
  goneAt: number;
  bucket: number;
  bucketAt: number;
  dropped: number;
  /** The checked ticket, or null (guest: free power, no account, no 5v5). */
  ticket: GameTicket | null;
}

interface Room {
  id: string;
  mode: Mode;
  world: World;
  members: Player[];
  inputs: ActorInput[];
  fireLatch: boolean[];
  startTick: number;
  steps: number;
  lastShot: number[];
  /** Members who left (or never came back): out of the match, no longer sent anything, free to queue again. */
  left: boolean[];
  over: boolean;
  demo: boolean;
}

const STEP = TUNING.simStepSeconds;

export class Lobby {
  readonly opts: LobbyOptions;
  private players = new Map<number, Player>();
  private byToken = new Map<string, Player>();
  private queues = new Map<string, Player[]>();
  readonly rooms = new Map<string, Room>();
  private nextId = 1;
  /** Ticket ids already used, with their expiry (unix seconds): a ticket opens one connection only. */
  private usedTickets = new Map<string, number>();
  /** Finished matches for settlement (GET /results/:id), dropped after resultsKeepSec. */
  private results = new Map<string, { at: number; record: MatchRecord }>();
  private lastSweep = 0;

  constructor(opts: Partial<LobbyOptions> & Pick<LobbyOptions, 'now'>) {
    this.opts = { ...DEFAULT_OPTIONS, seed: () => randomBytes(4).readUInt32LE(0), ...opts };
  }

  /** A new socket. Returns its player id for later calls. */
  connect(conn: Conn): number {
    const id = this.nextId++;
    const now = this.opts.now();
    this.players.set(id, {
      id, conn, token: randomBytes(16).toString('hex'), name: '', hero: 'kettle', state: 'new', queueKey: null, queuedAt: 0,
      room: null, actorId: -1, lastMsgAt: now, goneAt: 0, bucket: this.opts.rateBurst, bucketAt: now, dropped: 0, ticket: null,
    });
    return id;
  }

  message(id: number, raw: string): void {
    const p = this.players.get(id);
    if (!p || !p.conn) return;
    const now = this.opts.now();
    p.lastMsgAt = now;
    // Token bucket: a flood is dropped, a sustained flood closes the socket.
    p.bucket = Math.min(this.opts.rateBurst, p.bucket + (now - p.bucketAt) * this.opts.ratePerSec);
    p.bucketAt = now;
    if (p.bucket < 1) {
      if (++p.dropped > this.opts.ratePerSec * 3) this.kick(p, 'rate', 'Too many messages.');
      return;
    }
    p.bucket -= 1;
    const m = parseClientMsg(raw);
    if (!m) { this.err(p, 'bad-message', 'Message not understood.'); return; }
    if (p.state === 'new' && m.t !== 'hello') { this.err(p, 'hello-first', 'Say hello first.'); return; }
    this.handle(p, m);
  }

  disconnect(id: number): void {
    const p = this.players.get(id);
    if (!p) return;
    p.conn = null;
    p.goneAt = this.opts.now();
    if (p.state === 'queued') this.unqueue(p);
    // In a match the operator stays (idle) for the grace period; tick() removes it if nobody resumes.
    if (p.state !== 'playing') this.forget(p);
  }

  /** One 60 Hz tick: queues, idle sockets, every room one sim step. */
  tick(): void {
    const now = this.opts.now();
    for (const p of this.players.values()) {
      if (p.conn && now - p.lastMsgAt > this.opts.idleTimeoutSec) this.kick(p, 'idle', 'No messages for too long.');
      if (p.state === 'queued' && now - p.queuedAt > this.opts.queueTimeoutSec) {
        this.unqueue(p);
        p.state = 'idle';
        p.conn?.send({ t: 'queueTimeout' });
      }
    }
    for (const room of [...this.rooms.values()]) this.stepRoom(room, now);
    if (now - this.lastSweep > 60) {
      this.lastSweep = now;
      for (const [k, v] of this.results) if (now - v.at > this.opts.resultsKeepSec) this.results.delete(k);
      const unix = Date.now() / 1000;
      for (const [k, exp] of this.usedTickets) if (exp < unix) this.usedTickets.delete(k);
    }
  }

  /** A finished match's record for the site's settlement, or null (unknown or expired). */
  result(id: string): MatchRecord | null {
    return this.results.get(id)?.record ?? null;
  }

  stats() {
    return { players: this.players.size, queued: [...this.queues.values()].reduce((a, q) => a + q.length, 0), rooms: this.rooms.size };
  }

  // ---- messages ----
  private handle(p: Player, m: ClientMsg): void {
    switch (m.t) {
      case 'hello': {
        // Resume: a known token whose operator is still in a live match takes it back.
        const old = m.token ? this.byToken.get(m.token) : undefined;
        if (old && old !== p && old.state === 'playing' && old.room && !old.room.over && !old.conn) {
          old.conn = p.conn;
          old.lastMsgAt = p.lastMsgAt;
          this.players.delete(p.id);
          this.players.set(p.id, old);
          this.players.delete(old.id);
          old.id = p.id;
          old.conn!.send({ t: 'welcome', v: PROTOCOL, token: old.token, name: old.name, resumed: true });
          this.sendMatch(old.room, old);
          return;
        }
        const nick = validateNickname(m.name);
        p.name = nick.ok ? nick.value : `Guest-${p.token.slice(0, 4).toUpperCase()}`;
        p.hero = HEROES.some((h) => h.id === m.hero) ? m.hero : 'kettle';
        if (p.state === 'new') { p.state = 'idle'; this.byToken.set(p.token, p); }
        if (!m.ticket || p.state !== 'idle') { this.welcome(p, null); return; }
        if (!this.opts.checkTicket) { this.welcome(p, 'This server does not check tickets: playing as a free profile.'); return; }
        // Fail closed: a ticket that cannot be checked in time, or was used before, plays as a free profile.
        const conn = p.conn;
        const timeout = new Promise<null>((r) => setTimeout(() => r(null), 5000));
        void Promise.race([this.opts.checkTicket(m.ticket).catch(() => null), timeout]).then((t) => {
          if (p.conn !== conn) return;
          let note: string | null = null;
          if (!t) note = 'Your ticket could not be checked: playing as a free profile.';
          else if (this.usedTickets.has(t.tid)) note = 'That ticket was already used: playing as a free profile.';
          else if (t.acc && [...this.players.values()].some((o) => o !== p && o.ticket?.acc === t.acc && (o.conn || o.state === 'playing'))) note = 'This account is already playing on another connection: playing as a free profile.';
          else {
            this.usedTickets.set(t.tid, t.exp);
            p.ticket = t;
            // A signed-in account plays under its own callsign (the site put it in the signed ticket).
            const n = t.acc && t.name ? validateNickname(t.name) : null;
            if (n?.ok) p.name = n.value;
          }
          this.welcome(p, note);
        });
        return;
      }
      case 'queue': {
        if (p.state === 'playing') { this.err(p, 'in-match', 'Already in a match.'); return; }
        // 5v5 is for verified Chog holders (or a labelled demo token, in demo-only rooms). Enforced here, not in the browser.
        if (m.mode === '5v5' && !p.ticket?.holder && !p.ticket?.demo) { this.err(p, 'holders-only', '5v5 is for verified Chog holders. Sign in with the wallet that holds your Chog, or play 1v1 and 3v3.'); return; }
        if (p.state === 'queued') this.unqueue(p);
        // Demo tokens only ever meet other demo tokens, so demo power never touches a real match.
        const key = `${m.mode}:${m.code ?? ''}${p.ticket?.demo ? '|demo' : ''}`;
        const q = this.queues.get(key) ?? [];
        q.push(p);
        this.queues.set(key, q);
        p.state = 'queued';
        p.queueKey = key;
        p.queuedAt = this.opts.now();
        const need = MODE_SIZE[m.mode];
        if (q.length >= need) this.startRoom(m.mode, q.splice(0, need));
        else for (const o of q) o.conn?.send({ t: 'queued', mode: m.mode, have: q.length, need, code: m.code ?? null });
        return;
      }
      case 'leave':
        if (p.state === 'queued') { this.unqueue(p); p.state = 'idle'; }
        else if (p.state === 'playing' && p.room) this.eliminate(p.room, p, 'left');
      if (p.state === 'playing') { p.state = 'idle'; p.room = null; p.actorId = -1; }
        return;
      case 'input': {
        const r = p.room;
        if (p.state !== 'playing' || !r || r.over) return;
        const inp = toActorInput(m);
        const prev = r.inputs[p.actorId];
        // Edge-triggered actions survive until a step uses them; a tap of fire fires once.
        r.inputs[p.actorId] = { ...inp, reload: inp.reload || prev.reload, ability: inp.ability || prev.ability };
        if (inp.firing) r.fireLatch[p.actorId] = true;
        return;
      }
      case 'ping':
        p.conn!.send({ t: 'pong', at: m.at, tick: p.room ? p.room.world.tick : 0 });
        return;
    }
  }

  // ---- rooms ----
  private welcome(p: Player, note: string | null): void {
    const t = p.ticket;
    const profile: NetProfile = { verified: !!t, tier: t?.tier ?? 'free', holder: !!t?.holder, demo: !!t?.demo, account: !!t?.acc, metadataId: t?.mid ?? null, note };
    p.conn?.send({ t: 'welcome', v: PROTOCOL, token: p.token, name: p.name, resumed: false, profile });
  }

  /** Power a player's ticket entitles them to. No ticket: base power. */
  static powerOf(t: GameTicket | null): Power {
    if (!t) return BASE_POWER;
    return powerFor(t.tier, t.up, t.mid && t.tier === 'legendary' ? signatureFor(t.mid) : null, t.demo, t.mid);
  }

  private startRoom(mode: Mode, members: Player[]): void {
    const id = randomBytes(8).toString('hex');
    // Teams alternate in join order (a, b, a, b, ...): equal sizes, spawns west and east.
    const used = { alpha: 0, bravo: 0 };
    const versus = members.map((p, i) => {
      const team: 'alpha' | 'bravo' = i % 2 === 0 ? 'alpha' : 'bravo';
      const s = VERSUS_SPAWNS[team][used[team]++];
      return { name: p.name, hero: p.hero, team, x: s.x, y: s.y, facing: team === 'alpha' ? 0 : Math.PI, power: Lobby.powerOf(p.ticket) };
    });
    const world = createWorld({ seed: this.opts.seed(), versus, zone: true, friendlyFire: this.opts.friendlyFire });
    const room: Room = {
      id, mode, world, members, inputs: members.map(() => ({ ...IDLE_INPUT })), fireLatch: members.map(() => false),
      startTick: Math.round(this.opts.countdownSec / STEP), steps: 0, lastShot: members.map(() => -1e9), left: members.map(() => false), over: false,
      demo: members.some((p) => p.ticket?.demo),
    };
    members.forEach((p, i) => {
      p.state = 'playing';
      p.queueKey = null;
      p.room = room;
      p.actorId = i;
      room.inputs[i].aim = versus[i].facing;
    });
    this.rooms.set(id, room);
    for (const p of members) this.sendMatch(room, p);
  }

  private sendMatch(room: Room, p: Player): void {
    const w = room.world;
    p.conn?.send({
      t: 'match', room: room.id, mode: room.mode, you: p.actorId, team: w.actors[p.actorId].team, seed: w.rng, friendlyFire: w.friendlyFire,
      roster: w.actors.map((a) => {
        const t = room.members[a.id].ticket;
        return {
          id: a.id, name: a.name, hero: a.hero.id, team: a.team, tier: a.power.tier as Tier, holder: !!t?.holder, demo: !!t?.demo, metadataId: t?.mid ?? null,
          ability: { kind: a.ability.kind, name: a.ability.name, cooldown: a.ability.cooldown, text: a.ability.text },
        };
      }),
      startsIn: Math.max(0, (room.startTick - room.steps) * STEP), zone: w.zone?.plan ?? [], demo: room.demo,
    });
  }

  private stepRoom(room: Room, now: number): void {
    if (room.over) return;
    const w = room.world;
    // Players who left and did not come back within the grace period are out.
    room.members.forEach((p, i) => {
      if (!room.left[i] && !p.conn && now - p.goneAt > this.opts.reconnectGraceSec) this.eliminate(room, p, 'left');
    });
    if (room.over) return;
    room.steps++;
    if (room.steps > room.startTick) {
      stepWorld(w, (a: Actor) => {
        const i = a.id;
        const inp = room.members[i].conn && !room.left[i] ? room.inputs[i] : IDLE_INPUT;
        const out = { ...inp, firing: inp.firing || room.fireLatch[i] };
        room.fireLatch[i] = false;
        room.inputs[i] = { ...room.inputs[i], reload: false, ability: false };
        return out;
      });
      for (const s of w.sounds) if (s.type === 'shot') room.lastShot[s.sourceId] = w.tick;
    }
    if (w.outcome === 'playing' && matchSeconds(w) >= this.opts.matchLimitSec) {
      // Time limit: more health standing wins; equal is a draw.
      const hp = (t: Team) => w.actors.filter((a) => a.team === t && standing(a)).reduce((s, a) => s + a.hp, 0);
      w.outcome = 'won';
      w.winner = hp('alpha') === hp('bravo') ? null : hp('alpha') > hp('bravo') ? 'alpha' : 'bravo';
      this.finish(room, 'time');
      return;
    }
    if (room.steps % this.opts.snapEvery === 0 || w.outcome !== 'playing') room.members.forEach((p, i) => { if (p.conn && !room.left[i]) p.conn.send(this.snapshot(room, p)); });
    if (w.outcome !== 'playing') this.finish(room, 'eliminated');
  }

  /** What one player is allowed to know: own team always; enemies only when a teammate can see them, their muzzle
   * flash was seen in the last 0.7 s, a teammate's Ping shows them, or they are down. Bullets likewise. */
  snapshot(room: Room, p: Player): Extract<ServerMsg, { t: 'snap' }> {
    const w = room.world;
    const me = w.actors[p.actorId];
    const mates = w.actors.filter((a) => a.team === me.team && a.alive);
    const flashTicks = TUNING.perception.flashSeconds / STEP;
    const seenBy = (x: number, y: number) => mates.some((m) => canSee(w.level, m.x, m.y, m.facing, m.view, x, y));
    const visible = (e: Actor) => e.team === me.team || !e.alive || seenBy(e.x, e.y)
      || (w.tick - room.lastShot[e.id] <= flashTicks && mates.some((m) => muzzleFlashSeen(w.level, m.x, m.y, e.x, e.y)))
      || mates.some((m) => revealed(w, m).includes(e));
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    const actors: NetActor[] = w.actors.filter(visible).map((a) => ({
      id: a.id, name: a.name, hero: a.hero.id, team: a.team, x: r3(a.x), y: r3(a.y), vx: r3(a.vx), vy: r3(a.vy), facing: r3(a.facing),
      hp: r3(a.hp), maxHp: a.maxHp, armor: r3(a.armor), maxArmor: a.maxArmor, alive: a.alive, ammo: a.ammo, reserve: a.reserve,
      reloadLeft: r3(a.reloadLeft), abilityCd: r3(a.abilityCd), revealLeft: r3(a.revealLeft), muzzle: r3(a.muzzle), hitFlash: r3(a.hitFlash),
      deadFor: r3(a.deadFor), lastSpread: r3(a.lastSpread), stepAcc: r3(a.stepAcc), kills: a.kills, connected: !!room.members[a.id].conn,
      shieldLeft: r3(a.shieldLeft), frenzyLeft: r3(a.frenzyLeft), slowLeft: r3(a.slowLeft), burstLeft: r3(a.burstLeft),
      downed: a.downed, reviveProgress: r3(a.reviveProgress),
    }));
    const bullets: NetBullet[] = w.bullets.filter((b) => w.actors[b.owner].team === me.team || seenBy(b.x, b.y))
      .map((b) => ({ x: r3(b.x), y: r3(b.y), dx: r3(b.dx), dy: r3(b.dy), ox: r3(b.ox), oy: r3(b.oy), owner: b.owner, weapon: b.weapon.id }));
    const sounds: NetSound[] = w.sounds.filter((s) => s.sourceId === me.id || hears(w.level, me.x, me.y, s))
      .map((s) => ({ type: s.type, x: r3(s.x), y: r3(s.y), radius: s.radius, source: s.sourceId, team: s.team, weapon: s.weapon, blocked: s.blocked, sig: s.sig }));
    const hits: NetHit[] = w.hits.filter((h) => w.actors[h.target].team === me.team || w.actors[h.by].team === me.team)
      .map((h) => ({ target: h.target, by: h.by, x: r3(h.x), y: r3(h.y), fromX: r3(h.fromX), fromY: r3(h.fromY), killed: h.killed, downed: h.downed }));
    return {
      t: 'snap', tick: w.tick, actors, bullets, pickups: w.pickups.map((k) => k.active), sounds, hits,
      barriers: w.barriers.map((b) => ({ ...b.box, left: r3(b.left) })),
    };
  }

  private eliminate(room: Room, p: Player, cause: 'left'): void {
    const i = room.members.indexOf(p);
    room.left[i] = true;
    const a = room.world.actors[i];
    if (a.alive) down(room.world, a, { cause, killerId: -1, weapon: 'Left the match', fromX: a.x, fromY: a.y, toX: a.x, toY: a.y, tick: room.world.tick });
    if (p.conn === null) this.forget(p);
    // The outcome is decided on the next step (stepWorld), so a leaver's team loses through the normal rule.
    const teams = new Set(room.world.actors.filter(standing).map((x) => x.team));
    if (teams.size <= 1 && room.world.outcome === 'playing') {
      room.world.outcome = 'won';
      room.world.winner = teams.size === 1 ? [...teams][0] : null;
      this.finish(room, 'eliminated');
    }
  }

  private finish(room: Room, reason: 'eliminated' | 'time'): void {
    if (room.over) return;
    room.over = true;
    const w = room.world;
    const results: PlayerResult[] = w.actors.map((a) => ({
      id: a.id, name: a.name, hero: a.hero.id, team: a.team, kills: a.kills, damageDealt: Math.round(a.damageDealt), damageTaken: Math.round(a.damageTaken),
      hits: a.hits, bullets: a.bullets, alive: a.alive, cause: a.death?.cause ?? null,
    }));
    // Kept for the site's settlement (GET /results/:id). Only accounts from checked tickets appear; demo is flagged.
    const record: MatchRecord = {
      id: room.id, mode: room.mode, demo: room.demo, winner: w.winner, reason, seconds: Math.round(matchSeconds(w)), endedAt: Math.floor(Date.now() / 1000),
      players: w.actors.map((a) => {
        const t = room.members[a.id].ticket;
        return { acc: t?.acc ?? null, team: a.team, tier: a.power.tier, tok: t?.holder ? t.tok : null, mid: t?.holder ? t.mid : null, own: t?.holder ? t.own : null, kills: a.kills, damage: Math.round(a.damageDealt), left: room.left[a.id], name: a.name, hero: a.hero.id, survived: a.alive };
      }),
    };
    this.results.set(room.id, { at: this.opts.now(), record });
    const settle = !room.demo && record.players.some((x) => x.acc);
    room.members.forEach((p, i) => {
      if (room.left[i]) return;
      p.conn?.send({ t: 'over', winner: w.winner, reason, results, matchId: room.id, settle });
      p.state = 'idle';
      p.room = null;
      p.actorId = -1;
      if (!p.conn) this.forget(p);
    });
    this.rooms.delete(room.id);
  }

  private unqueue(p: Player): void {
    if (!p.queueKey) return;
    const q = this.queues.get(p.queueKey);
    if (q) {
      const i = q.indexOf(p);
      if (i >= 0) q.splice(i, 1);
      if (!q.length) this.queues.delete(p.queueKey);
      else {
        const [mode, rest] = p.queueKey.split(':');
        const code = rest.replace('|demo', '');
        for (const o of q) o.conn?.send({ t: 'queued', mode: mode as Mode, have: q.length, need: MODE_SIZE[mode as Mode], code: code || null });
      }
    }
    p.queueKey = null;
  }

  private forget(p: Player): void {
    this.byToken.delete(p.token);
    for (const [k, v] of this.players) if (v === p) this.players.delete(k);
  }

  private err(p: Player, code: string, message: string): void {
    p.conn?.send({ t: 'error', code, message });
  }

  private kick(p: Player, code: string, message: string): void {
    const c = p.conn;
    if (!c) return;
    c.send({ t: 'error', code, message });
    c.close(4000, code);
    const id = [...this.players.entries()].find(([, v]) => v === p)?.[0];
    if (id !== undefined) this.disconnect(id);
  }
}

