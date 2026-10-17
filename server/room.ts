// Authoritative online play (RC-8): lobby, matchmaking, rooms. Transport-free: the host (server/index.ts) passes in
// connections, raw messages and a 60 Hz tick, so every rule here is unit-tested with fake sockets
// (tests/rc8-online.test.ts) and exercised end to end by real browsers (tools/rc8-online.mjs).
// The server owns the match: it steps the same deterministic sim as solo play (src/sim/world.ts) with each player's
// latest controls. Clients never send positions, hits, damage or results, only controls.
import { randomBytes } from 'node:crypto';
import { createWorld, down, IDLE_INPUT, matchSeconds, revealed, standing, stepWorld, type Actor, type ActorInput, type Team, type World } from '../src/sim/world';
import { canSee, muzzleFlashSeen } from '../src/sim/vision';
import { hears } from '../src/sim/world';
import { hearReport, locatesSource, noise3 } from '../src/sim/intel';
import { heroIdOf } from '../src/config/heroes';
import { VERSUS_SPAWNS } from '../src/config/map';
import { TUNING } from '../src/config/tuning';
import { validateNickname } from '../src/ui/profile';
import { MODE_SIZE, PROTOCOL, parseClientMsg, toActorInput, type ClientMsg, type Mode, type NetActor, type NetBullet, type NetGrenade, type NetHit, type NetProfile, type NetSound, type PlayerResult, type ServerMsg } from '../src/net/protocol';
import { BASE_POWER, powerFor, signatureFor, type Power, type Tier } from '../src/config/power';
import { RATING } from '../src/config/progression';
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
  /** The squad this player is in (stays together between matches), or null. */
  party: Party | null;
  /** The pickup layout revision last sent (pickups move when they come back; -1: send it with the next snapshot). */
  pickRev: number;
  /** Spotted reports this player was last sent, per hostile actor id: where (already off the true spot) and until
   * which tick it stands before a fresh one. */
  spot: Map<number, { x: number; y: number; until: number }>;
}

/** A squad: up to 5 players who queue together and always play on the same team. The leader queues for everyone. */
interface Party { code: string; members: Player[] }

/** A queue entry: one player, or a whole squad. Groups are never split across teams. */
interface Group { players: Player[]; at: number }

interface Room {
  id: string;
  mode: Mode;
  world: World;
  members: Player[];
  inputs: ActorInput[];
  /** SB: the newest input seq each member has sent, and how many steps it has been applied so far (the client's own
   * movement prediction replays exactly what the server has not applied yet). */
  acks: number[];
  ackSteps: number[];
  fireLatch: boolean[];
  startTick: number;
  steps: number;
  lastShot: number[];
  /** Members who left (or never came back): out of the match, no longer sent anything, free to queue again. */
  left: boolean[];
  /** Left while still standing (a quit forfeits the match's rewards; leaving after being knocked out does not). */
  quit: boolean[];
  over: boolean;
  demo: boolean;
  /** Started from a private room code: settled for history, never rewarded or rated. */
  private: boolean;
}

const STEP = TUNING.simStepSeconds;
const PARTY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export class Lobby {
  readonly opts: LobbyOptions;
  private players = new Map<number, Player>();
  private byToken = new Map<string, Player>();
  private queues = new Map<string, Group[]>();
  private parties = new Map<string, Party>();
  readonly rooms = new Map<string, Room>();
  private nextId = 1;
  /** Ticket ids already used, with their expiry (unix seconds): a ticket opens one connection only. */
  private usedTickets = new Map<string, number>();
  /** Finished matches for settlement (GET /results/:id), dropped after resultsKeepSec. */
  private results = new Map<string, { at: number; record: MatchRecord }>();
  private lastSweep = 0;
  private lastRetry = 0;

  constructor(opts: Partial<LobbyOptions> & Pick<LobbyOptions, 'now'>) {
    this.opts = { ...DEFAULT_OPTIONS, seed: () => randomBytes(4).readUInt32LE(0), ...opts };
  }

  /** A new socket. Returns its player id for later calls. */
  connect(conn: Conn): number {
    const id = this.nextId++;
    const now = this.opts.now();
    this.players.set(id, {
      id, conn, token: randomBytes(16).toString('hex'), name: '', hero: 'benja', state: 'new', queueKey: null, queuedAt: 0,
      room: null, actorId: -1, lastMsgAt: now, goneAt: 0, bucket: this.opts.rateBurst, bucketAt: now, dropped: 0, ticket: null, party: null, pickRev: -1, spot: new Map(),
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
    // SB: the matchmaking band widens with waiting, so queues are retried once a second.
    if (now - this.lastRetry >= 1) {
      this.lastRetry = now;
      for (const key of [...this.queues.keys()]) {
        const [mode, rest] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
        const code = rest.replace('|demo', '');
        this.tryMatch(key, mode as Mode, code || null);
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
    return { players: this.players.size, queued: [...this.queues.values()].reduce((a, q) => a + q.reduce((n, g) => n + g.players.length, 0), 0), rooms: this.rooms.size, parties: this.parties.size };
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
          // A resumed client rebuilds its world from the seed: send where the pickups are now.
          old.pickRev = -1;
          this.sendMatch(old.room, old);
          return;
        }
        const nick = validateNickname(m.name);
        p.name = nick.ok ? nick.value : `Guest-${p.token.slice(0, 4).toUpperCase()}`;
        p.hero = heroIdOf(m.hero) ?? 'benja';
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
        const party = p.party;
        if (party && party.members[0] !== p) { this.err(p, 'party-leader', 'Your squad leader starts the match.'); return; }
        const group = party ? party.members : [p];
        const half = MODE_SIZE[m.mode] / 2;
        if (group.length > half) { this.err(p, 'party-too-big', `A squad of ${group.length} does not fit ${m.mode} (${half} a side).`); return; }
        if (group.some((x) => x.state === 'playing' || !x.conn)) { this.err(p, 'party-busy', 'Wait until every squad member is back in the lobby.'); return; }
        // 5v5 is for verified Chog holders (or a labelled demo token, in demo-only rooms). Enforced here, not in the browser.
        if (m.mode === '5v5' && group.some((x) => !x.ticket?.holder && !x.ticket?.demo)) {
          this.err(p, 'holders-only', group.length > 1 ? 'Everyone in the squad needs a verified Chog for 5v5.' : '5v5 is for verified Chog holders. Sign in with the wallet that holds your Chog, or play 1v1 and 3v3.');
          return;
        }
        // Demo tokens only ever meet other demo tokens, so demo power never touches a real match.
        const demo = group.some((x) => x.ticket?.demo);
        if (demo && !group.every((x) => x.ticket?.demo)) { this.err(p, 'party-mixed-demo', 'Demo and real players cannot queue as one squad.'); return; }
        for (const x of group) if (x.state === 'queued') this.unqueue(x);
        const key = `${m.mode}:${m.code ?? ''}${demo ? '|demo' : ''}`;
        const q = this.queues.get(key) ?? [];
        q.push({ players: [...group], at: this.opts.now() });
        this.queues.set(key, q);
        for (const x of group) { x.state = 'queued'; x.queueKey = key; x.queuedAt = this.opts.now(); }
        this.tryMatch(key, m.mode, m.code ?? null);
        return;
      }
      case 'party':
        this.partyMsg(p, m);
        return;
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
        r.inputs[p.actorId] = { ...inp, reload: inp.reload || prev.reload, ability: inp.ability || prev.ability, grenade: !!inp.grenade || !!prev.grenade,
          throwDist: inp.grenade ? inp.throwDist : prev.throwDist, throwAim: inp.grenade ? inp.throwAim : prev.throwAim };
        if (inp.firing) r.fireLatch[p.actorId] = true;
        if (m.seq > r.acks[p.actorId]) { r.acks[p.actorId] = m.seq; r.ackSteps[p.actorId] = 0; }
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

  /** SB matchmaking strength: rating (new accounts no higher than the start) plus the power offset of its tier. */
  static strength(p: { ticket: GameTicket | null }): number {
    const t = p.ticket;
    const rated = t?.rating ?? RATING.start;
    const r = (t?.played ?? 0) < TUNING.match.newMatches ? Math.min(rated, RATING.start) : rated;
    // Power counts at what it is measured to be worth in a duel (TUNING.match.tierStrength), not the rating offset.
    return r + (TUNING.match.tierStrength[t?.tier ?? 'free'] ?? 0);
  }

  /** Power a player's ticket entitles them to. No ticket: base power. */
  static powerOf(t: GameTicket | null): Power {
    if (!t) return BASE_POWER;
    return powerFor(t.tier, t.up, t.mid && t.tier === 'legendary' ? signatureFor(t.mid) : null, t.demo, t.mid);
  }

  /**
   * Fills two equal teams from the queue, oldest first, never splitting a squad. Solo players fill the gaps, so a
   * squad of three meets three solo players in 3v3. Starts the room when both teams are full.
   */
  private tryMatch(key: string, mode: Mode, code: string | null): void {
    const q = this.queues.get(key);
    if (!q) return;
    const half = MODE_SIZE[mode] / 2;
    // Small search (queues hold at most a few groups per key): each group goes to alpha, bravo or waits, oldest first,
    // so the earliest players are matched whenever any split of the queue fills both teams exactly.
    const pool = q.slice(0, 12);
    const pick: (0 | 1 | 2)[] = [];
    // SB fairness: a split counts only if everyone in it is within the band (widened by the oldest group's wait) and the
    // teams' average strengths are close. Private codes skip it (friends play who they invite).
    const M = TUNING.match, now = this.opts.now();
    const band = code ? Infinity : M.band + M.widenPerSec * Math.max(0, now - Math.min(...pool.map((g) => g.at)));
    const str = pool.map((g) => g.players.reduce((a, p) => a + Lobby.strength(p), 0) / g.players.length);
    const fair = (): boolean => {
      if (band === Infinity) return true;
      const inRoom = pool.map((_, i) => i).filter((i) => pick[i] !== 2 && pick[i] !== undefined);
      const all = inRoom.map((i) => str[i]);
      if (Math.max(...all) - Math.min(...all) > band) return false;
      const mean = (side: 0 | 1) => { const g = inRoom.filter((i) => pick[i] === side); return g.reduce((a, i) => a + str[i] * pool[i].players.length, 0) / Math.max(1, g.reduce((a, i) => a + pool[i].players.length, 0)); };
      // Team modes: also balance the sides (in 1v1 the band already is the gap between the two).
      return half === 1 || Math.abs(mean(0) - mean(1)) <= band * M.teamGapShare;
    };
    // The fairness check can reject leaves, so the search is capped: a busy tick never stalls (it retries next second).
    let budget = 20000;
    const fill = (i: number, na: number, nb: number): boolean => {
      if (--budget < 0) return false;
      if (na === half && nb === half) {
        for (let k = i; k < pool.length; k++) pick[k] = 2;
        return fair();
      }
      if (i === pool.length) return false;
      const n = pool[i].players.length;
      for (const side of [0, 1, 2] as const) {
        if (side === 0 && na + n > half) continue;
        if (side === 1 && nb + n > half) continue;
        pick[i] = side;
        if (fill(i + 1, na + (side === 0 ? n : 0), nb + (side === 1 ? n : 0))) return true;
      }
      return false;
    };
    const ok = fill(0, 0, 0);
    const alpha = ok ? pool.filter((_, i) => pick[i] === 0) : [];
    const bravo = ok ? pool.filter((_, i) => pick[i] === 1) : [];
    const na = alpha.reduce((a, g) => a + g.players.length, 0), nb = bravo.reduce((a, g) => a + g.players.length, 0);
    if (na === half && nb === half) {
      const used = new Set([...alpha, ...bravo]);
      const rest = q.filter((g) => !used.has(g));
      if (rest.length) this.queues.set(key, rest); else this.queues.delete(key);
      this.startRoom(mode, alpha.flatMap((g) => g.players), bravo.flatMap((g) => g.players), !!code);
      if (rest.length) this.tryMatch(key, mode, code);
      return;
    }
    const have = q.reduce((a, g) => a + g.players.length, 0);
    for (const g of q) for (const o of g.players) o.conn?.send({ t: 'queued', mode, have, need: MODE_SIZE[mode], code });
  }

  private startRoom(mode: Mode, alphaTeam: Player[], bravoTeam: Player[], priv = false): void {
    const id = randomBytes(8).toString('hex');
    // Squads stay on one side; spawns west (alpha) and east (bravo).
    const members = [...alphaTeam, ...bravoTeam];
    const used = { alpha: 0, bravo: 0 };
    const versus = members.map((p, i) => {
      const team: 'alpha' | 'bravo' = i < alphaTeam.length ? 'alpha' : 'bravo';
      const s = VERSUS_SPAWNS[team][used[team]++];
      return { name: p.name, hero: p.hero, team, x: s.x, y: s.y, facing: team === 'alpha' ? 0 : Math.PI, power: Lobby.powerOf(p.ticket) };
    });
    const world = createWorld({ seed: this.opts.seed(), versus, zone: true, friendlyFire: this.opts.friendlyFire });
    const room: Room = {
      id, mode, world, members, inputs: members.map(() => ({ ...IDLE_INPUT })), acks: members.map(() => 0), ackSteps: members.map(() => 0), fireLatch: members.map(() => false),
      startTick: Math.round(this.opts.countdownSec / STEP), steps: 0, lastShot: members.map(() => -1e9), left: members.map(() => false), quit: members.map(() => false), over: false,
      demo: members.some((p) => p.ticket?.demo), private: priv,
    };
    members.forEach((p, i) => {
      p.state = 'playing';
      p.queueKey = null;
      p.room = room;
      p.actorId = i;
      p.pickRev = -1;
      p.spot = new Map();
      room.inputs[i].aim = versus[i].facing;
    });
    this.rooms.set(id, room);
    for (const p of members) this.sendMatch(room, p);
    for (const pa of new Set(members.map((p) => p.party).filter((x): x is Party => !!x))) this.sendParty(pa);
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
        room.inputs[i] = { ...room.inputs[i], reload: false, ability: false, grenade: false };
        room.ackSteps[i]++;
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

  /**
   * What one player is allowed to know (owner 2026-10-17: the server never sends exact hostile positions the player
   * did not earn). Exact: your own team, the dead, and hostiles YOU see, whose muzzle flash YOU saw in the last 0.7 s,
   * or YOUR Ping shows. A hostile only a teammate sees (or a teammate's Ping or seen flash shows) is a SPOTTED report:
   * a spot within spottedRadius of where it was, refreshed every spottedRefresh s, never the live body. Heard hostile
   * sounds arrive as the hearing estimate the game draws (src/sim/intel.ts hearReport), not their exact spot. Bullets,
   * grenades and hits follow the same line.
   */
  snapshot(room: Room, p: Player): Extract<ServerMsg, { t: 'snap' }> {
    const w = room.world;
    const me = w.actors[p.actorId];
    const mates = w.actors.filter((a) => a.team === me.team && a.alive && a !== me);
    const flashTicks = TUNING.perception.flashSeconds / STEP;
    const iSee = (x: number, y: number) => me.alive && canSee(w.level, me.x, me.y, me.facing, me.view, x, y);
    const mineRevealed = me.alive ? revealed(w, me) : [];
    const flashed = (e: Actor, m: Actor) => w.tick - room.lastShot[e.id] <= flashTicks && muzzleFlashSeen(w.level, m.x, m.y, e.x, e.y);
    const exact = (e: Actor) => e.team === me.team || !e.alive || iSee(e.x, e.y) || (me.alive && flashed(e, me)) || mineRevealed.includes(e);
    const spottedByMate = (e: Actor) => mates.some((m) => canSee(w.level, m.x, m.y, m.facing, m.view, e.x, e.y) || flashed(e, m) || revealed(w, m).includes(e));
    const shown = new Set(w.actors.filter(exact).map((a) => a.id));
    const visible = (e: Actor) => shown.has(e.id);
    // Spotted reports: a fresh one when the last has run out, else the same (stale) spot.
    const S = TUNING.intel, refresh = Math.round(TUNING.sound.spottedRefresh / STEP);
    const sp: { id: number; x: number; y: number }[] = [];
    for (const e of w.actors) {
      if (shown.has(e.id) || !spottedByMate(e)) { p.spot.delete(e.id); continue; }
      let r = p.spot.get(e.id);
      if (!r || w.tick >= r.until) {
        const a = noise3(w.tick, e.id, p.actorId * 7 + 1) * Math.PI, d = (0.5 + 0.5 * Math.abs(noise3(w.tick, e.id, p.actorId * 7 + 2))) * S.spottedRadius;
        const q = (v: number) => Math.round(v * 4) / 4;
        r = { x: q(e.x + Math.cos(a) * d), y: q(e.y + Math.sin(a) * d), until: w.tick + refresh };
        p.spot.set(e.id, r);
      }
      sp.push({ id: e.id, x: r.x, y: r.y });
    }
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    const actors: NetActor[] = w.actors.filter(visible).map((a) => ({
      id: a.id, name: a.name, hero: a.hero.id, team: a.team, x: r3(a.x), y: r3(a.y), vx: r3(a.vx), vy: r3(a.vy), facing: r3(a.facing),
      hp: r3(a.hp), maxHp: a.maxHp, armor: r3(a.armor), maxArmor: a.maxArmor, alive: a.alive, ammo: a.ammo, reserve: a.reserve,
      reloadLeft: r3(a.reloadLeft), abilityCd: r3(a.abilityCd), revealLeft: r3(a.revealLeft), muzzle: r3(a.muzzle), hitFlash: r3(a.hitFlash),
      deadFor: r3(a.deadFor), lastSpread: r3(a.lastSpread), stepAcc: r3(a.stepAcc), kills: a.kills, connected: !!room.members[a.id].conn,
      shieldLeft: r3(a.shieldLeft), frenzyLeft: r3(a.frenzyLeft), slowLeft: r3(a.slowLeft), burstLeft: r3(a.burstLeft),
      downed: a.downed, reviveProgress: r3(a.reviveProgress), nades: a.grenades, maxNades: a.maxGrenades, focus: r3(a.focus),
      ...(a.slowLeft > 0 ? { slowMul: r3(a.slowMul) } : {}),
    }));
    // Grenades: your team's always; a hostile one when you can see it or it is close to you (you hear it land and see
    // the ring), so you can read the danger you are in.
    const grenades: NetGrenade[] = w.grenades.filter((g) => g.team === me.team || iSee(g.x, g.y) || Math.hypot(me.x - g.x, me.y - g.y) <= TUNING.grenade.radius + 1.5)
      .map((g) => ({ id: g.id, x: r3(g.x), y: r3(g.y), vx: r3(g.vx), vy: r3(g.vy), fuse: r3(g.fuse), owner: g.owner }));
    // Bullets: your team's, and a hostile one you can see in flight or that passes close to you.
    const bullets: NetBullet[] = w.bullets.filter((b) => w.actors[b.owner].team === me.team || iSee(b.x, b.y) || Math.hypot(me.x - b.x, me.y - b.y) <= 2.5)
      .map((b) => ({ x: r3(b.x), y: r3(b.y), dx: r3(b.dx), dy: r3(b.dy), ox: r3(b.ox), oy: r3(b.oy), owner: b.owner, weapon: b.weapon.id }));
    // Sounds you hear. A hostile's sound that says where its maker is, from a maker you are not shown exactly, is sent
    // as what hearing it tells you (a spot off by a share of the distance, or through a wall a bearing and a distance
    // band), flagged so the client does not blur it twice.
    const sounds: NetSound[] = w.sounds.filter((s) => s.sourceId === me.id || hears(w.level, me.x, me.y, s)).map((s) => {
      const base = { type: s.type, radius: s.radius, source: s.sourceId, team: s.team, weapon: s.weapon, blocked: s.blocked, sig: s.sig };
      if (s.team === me.team || s.sourceId === me.id || visible(w.actors[s.sourceId]) || !locatesSource(s.type)) return { ...base, x: r3(s.x), y: r3(s.y) };
      const est = hearReport(w, me, s);
      return est ? { ...base, x: r3(est.x), y: r3(est.y), est: est.state === 'directional' ? 'wall' as const : 'clear' as const } : { ...base, x: r3(s.x), y: r3(s.y) };
    });
    // Hits: on you or by you in full; a hostile's hit on a teammate, or any knock-out (the feed), without where it came
    // from unless you are shown the shooter.
    const hits: NetHit[] = w.hits.filter((h) => h.target === me.id || h.by === me.id || w.actors[h.target].team === me.team || h.killed || h.downed).map((h) => {
      const open = h.target === me.id || h.by === me.id || visible(w.actors[h.by]);
      return { target: h.target, by: h.by, x: r3(h.x), y: r3(h.y), fromX: r3(open ? h.fromX : h.x), fromY: r3(open ? h.fromY : h.y), killed: h.killed, downed: h.downed, grenade: h.grenade };
    });
    // Where every pickup is, whenever the layout changed since this player's last snapshot (and once at the start).
    const pk = p.pickRev !== w.pickupRev ? w.pickups.flatMap((k) => [k.x, k.y]) : undefined;
    p.pickRev = w.pickupRev;
    return {
      t: 'snap', tick: w.tick, actors, bullets, grenades, pickups: w.pickups.map((k) => k.active), ...(pk ? { pk } : {}), ...(sp.length ? { sp } : {}), sounds, hits,
      barriers: w.barriers.map((b) => ({ ...b.box, left: r3(b.left) })), ack: room.acks[p.actorId], as: room.ackSteps[p.actorId],
    };
  }

  private eliminate(room: Room, p: Player, cause: 'left'): void {
    const i = room.members.indexOf(p);
    room.left[i] = true;
    const a = room.world.actors[i];
    room.quit[i] = standing(a);
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
      id: room.id, mode: room.mode, demo: room.demo, private: room.private, winner: w.winner, reason, seconds: Math.round(matchSeconds(w)), endedAt: Math.floor(Date.now() / 1000),
      players: w.actors.map((a) => {
        const t = room.members[a.id].ticket;
        return { acc: t?.acc ?? null, team: a.team, tier: a.power.tier, tok: t?.holder ? t.tok : null, mid: t?.holder ? t.mid : null, own: t?.holder ? t.own : null, kills: a.kills, damage: Math.round(a.damageDealt), left: room.left[a.id], quit: room.quit[a.id], name: a.name, hero: a.hero.id, survived: a.alive };
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
    // Squads stay together: everyone back in the lobby sees the squad ready for the next match.
    for (const pa of new Set(room.members.map((p) => p.party).filter((x): x is Party => !!x))) this.sendParty(pa);
  }

  /** Takes p's whole queue entry (a squad leaves the queue together) out of its queue. */
  private unqueue(p: Player): void {
    if (!p.queueKey) return;
    const key = p.queueKey;
    const q = this.queues.get(key);
    if (q) {
      const g = q.find((x) => x.players.includes(p));
      if (g) {
        q.splice(q.indexOf(g), 1);
        for (const o of g.players) { o.queueKey = null; if (o.state === 'queued') o.state = 'idle'; }
        for (const o of g.players) if (o !== p) o.conn?.send({ t: 'queueTimeout' });
      }
      if (!q.length) this.queues.delete(key);
      else {
        const [mode, rest] = key.split(':');
        const code = rest.replace('|demo', '');
        const have = q.reduce((a, x) => a + x.players.length, 0);
        for (const x of q) for (const o of x.players) o.conn?.send({ t: 'queued', mode: mode as Mode, have, need: MODE_SIZE[mode as Mode], code: code || null });
      }
    }
    p.queueKey = null;
  }

  // ---- squads ----
  private partyMsg(p: Player, m: Extract<ClientMsg, { t: 'party' }>): void {
    if (m.op === 'leave') { if (p.state === 'queued') this.unqueue(p); this.leaveParty(p); p.conn?.send({ t: 'party', code: null, members: [] }); return; }
    if (p.state === 'playing' || p.state === 'queued') { this.err(p, 'party-busy', 'Leave the queue or finish the match first.'); return; }
    if (m.op === 'create') {
      this.leaveParty(p);
      let code = '';
      do code = Array.from(randomBytes(5), (b) => PARTY_ALPHABET[b % PARTY_ALPHABET.length]).join(''); while (this.parties.has(code));
      const party: Party = { code, members: [p] };
      this.parties.set(code, party);
      p.party = party;
      this.sendParty(party);
      return;
    }
    const party = this.parties.get((m as { code: string }).code);
    if (!party) { this.err(p, 'party-unknown', 'No squad with that code. Check it with your friend.'); return; }
    if (party.members.includes(p)) { this.sendParty(party); return; }
    if (party.members.length >= 5) { this.err(p, 'party-full', 'That squad is full (5).'); return; }
    if (party.members.some((x) => x.state === 'queued' || x.state === 'playing')) { this.err(p, 'party-busy', 'That squad is in a queue or a match. Try again when it is back.'); return; }
    this.leaveParty(p);
    party.members.push(p);
    p.party = party;
    this.sendParty(party);
  }

  private leaveParty(p: Player): void {
    const party = p.party;
    if (!party) return;
    p.party = null;
    party.members = party.members.filter((x) => x !== p);
    // A squad member leaving a queue takes the squad out of it (the leader re-queues).
    for (const x of party.members) if (x.state === 'queued') this.unqueue(x);
    if (!party.members.length) this.parties.delete(party.code);
    else this.sendParty(party);
  }

  private sendParty(party: Party): void {
    for (const me of party.members) {
      me.conn?.send({
        t: 'party', code: party.code,
        members: party.members.map((x, i) => ({
          name: x.name, hero: x.hero, tier: (x.ticket?.tier ?? 'free') as Tier, holder: !!x.ticket?.holder, demo: !!x.ticket?.demo,
          you: x === me, leader: i === 0, ready: !!x.conn && x.state === 'idle',
        })),
      });
    }
  }

  private forget(p: Player): void {
    this.leaveParty(p);
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

