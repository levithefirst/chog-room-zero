// Online play protocol (RC-8). JSON over one WebSocket. The browser sends only intent (who it is, which queue, its
// controls); the server runs the match (src/net/room.ts) and decides movement, shots, damage, pickups, the zone and
// the result. Every client message is validated here before the server looks at it.
import type { ActorInput, Team } from '../sim/world';
import type { AbilityKind } from '../config/heroes';
import type { Tier } from '../config/power';
import type { SuperpowerId } from '../config/superpowers';

export const PROTOCOL = 1;
export type Mode = '1v1' | '3v3' | '5v5';
export const MODE_SIZE: Record<Mode, number> = { '1v1': 2, '3v3': 6, '5v5': 10 };
// A hello can carry a signed game ticket (about 500 characters).
export const MAX_MESSAGE_BYTES = 1200;
export const MAX_TICKET = 900;

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; hero: string; token?: string; ticket?: string }
  | { t: 'queue'; mode: Mode; code?: string }
  | { t: 'leave' }
  /** Squads (master integration pass): create one, join one by its code, or leave it. The leader queues the squad. */
  | { t: 'party'; op: 'create' | 'leave' }
  | { t: 'party'; op: 'join'; code: string }
  /** nade: throw a grenade (edge); nd: how far, in u (the server clamps it; capacity is the server's, from the ticket). */
  | { t: 'input'; seq: number; mx: number; my: number; aim: number; fire: boolean; quiet: boolean; reload: boolean; ability: boolean; nade?: boolean; nd?: number; na?: number }
  | { t: 'ping'; at: number };

/** One actor as a client may see it. Enemies the client's team cannot see are left out of the snapshot. */
export interface NetActor {
  id: number; name: string; hero: string; team: Team;
  x: number; y: number; vx: number; vy: number; facing: number;
  hp: number; maxHp: number; armor: number; maxArmor: number; alive: boolean;
  ammo: number; reserve: number; reloadLeft: number; abilityCd: number; revealLeft: number;
  muzzle: number; hitFlash: number; deadFor: number; lastSpread: number; stepAcc: number;
  kills: number; connected: boolean;
  /** Signature effect timers, so every client can draw the telegraphs. */
  shieldLeft: number; frenzyLeft: number; slowLeft: number; burstLeft: number;
  /** Team modes: down but not out, and the rescue progress in seconds. */
  downed?: boolean; reviveProgress?: number;
  /** Grenades left and capacity (the server's count). */
  nades?: number; maxNades?: number;
  /** V2: the perk (your own team's actors only) and your seconds standing on a swappable bag (yourself only). */
  perk?: string; bag?: number;
  /** V2 Marker: this hostile was hit by someone on your team with Marker and is shown to you. */
  mk?: 1;
  /** CF-E gait focus (-1 run .. 1 steady): the client reshapes the lamp from it. */
  focus?: number;
  /** SB: how hard a Snare slows it (with slowLeft), so its own client predicts the slowed walk. */
  slowMul?: number;
}

/** What everyone in a match knows about each player: power is never hidden from the opponent. */
export interface RosterEntry {
  id: number; name: string; hero: string; team: Team;
  tier: Tier; holder: boolean; demo: boolean; metadataId: number | null;
  ability: { kind: AbilityKind; name: string; cooldown: number; text: string };
  /** CHOG superpower in this player's slot (the server's choice from the verified ticket), if any. */
  sp?: SuperpowerId;
}

/** The server's view of this connection after checking its ticket. */
export interface NetProfile { verified: boolean; tier: Tier; holder: boolean; demo: boolean; account: boolean; metadataId: number | null; note: string | null }
/** A live grenade as a client may see it (own team's always; others when the team can see it or it is close). */
export interface NetGrenade { id: number; x: number; y: number; vx: number; vy: number; fuse: number; owner: number }
export interface NetBullet { x: number; y: number; dx: number; dy: number; ox: number; oy: number; owner: number; weapon: string }
/** est: the server sent a hearing estimate, not the source's spot ('clear' line or through a 'wall'). */
export interface NetSound { type: string; x: number; y: number; radius: number; source: number; team: Team; weapon?: string; blocked?: boolean; sig?: number; est?: 'clear' | 'wall' }
export interface NetHit { target: number; by: number; x: number; y: number; fromX: number; fromY: number; killed: boolean; downed?: boolean; grenade?: boolean }

/** One squad member as every member sees it. */
export interface PartyMember { name: string; hero: string; tier: Tier; holder: boolean; demo: boolean; you: boolean; leader: boolean; ready: boolean }
/** Squad codes: 5 characters from a set without lookalikes. */
export const PARTY_CODE = /^[2-9A-HJ-NP-Z]{5}$/;

export interface PlayerResult { id: number; name: string; hero: string; team: Team; kills: number; damageDealt: number; damageTaken: number; hits: number; bullets: number; alive: boolean; cause: string | null }

/** GP: a loot bag your team knows about (the server decides what is in it and who takes it): what kinds are in it
 * (k bits: 1 health, 2 armour, 4 ammo, 8 grenades) and the seconds before it is gone. */
/** A loot bag your team knows of: what kinds it holds (k bits), and its perk (`p`) if any. */
export interface NetLoot { id: number; x: number; y: number; k: number; left: number; p?: string }

export type ServerMsg =
  | { t: 'welcome'; v: number; token: string; name: string; resumed: boolean; profile?: NetProfile }
  | { t: 'queued'; mode: Mode; have: number; need: number; code: string | null }
  | { t: 'queueTimeout' }
  | { t: 'match'; room: string; mode: Mode; you: number; team: Team; seed: number; friendlyFire: boolean; roster: RosterEntry[]; startsIn: number; demo?: boolean; zone: { x: number; y: number; r: number }[] }
  /** ack/as (SB): the newest input seq the server had from you when it took this snapshot, and how many sim steps it has
   * applied it so far (your movement prediction replays the rest). Optional: an older server sends neither. */
  | { t: 'snap'; tick: number; actors: NetActor[]; bullets: NetBullet[]; grenades?: NetGrenade[]; pickups: boolean[]; pk?: number[]; lt?: NetLoot[]; sp?: { id: number; x: number; y: number }[]; sounds: NetSound[]; hits: NetHit[]; barriers: { x0: number; y0: number; x1: number; y1: number; left: number }[]; ack?: number; as?: number }
  | { t: 'over'; winner: Team | null; reason: 'eliminated' | 'time'; results: PlayerResult[]; matchId?: string; settle?: boolean }
  | { t: 'pong'; at: number; tick: number }
  | { t: 'party'; code: string | null; members: PartyMember[] }
  | { t: 'error'; code: string; message: string };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const MODES: readonly string[] = ['1v1', '3v3', '5v5'];

/** Parse and validate one client message. Returns null for anything malformed, oversized or out of range. */
export function parseClientMsg(raw: string): ClientMsg | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) return null;
  let m: Record<string, unknown>;
  try { m = JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  switch (m.t) {
    case 'hello':
      if (m.v !== PROTOCOL || typeof m.name !== 'string' || m.name.length > 40 || typeof m.hero !== 'string' || m.hero.length > 16) return null;
      if (m.token !== undefined && (typeof m.token !== 'string' || !/^[0-9a-f]{32}$/.test(m.token))) return null;
      if (m.ticket !== undefined && (typeof m.ticket !== 'string' || m.ticket.length > MAX_TICKET || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(m.ticket))) return null;
      return { t: 'hello', v: PROTOCOL, name: m.name, hero: m.hero, token: m.token as string | undefined, ticket: m.ticket as string | undefined };
    case 'queue':
      if (typeof m.mode !== 'string' || !MODES.includes(m.mode)) return null;
      if (m.code !== undefined && (typeof m.code !== 'string' || !/^[A-Z0-9]{4,8}$/.test(m.code))) return null;
      return { t: 'queue', mode: m.mode as Mode, code: m.code as string | undefined };
    case 'leave':
      return { t: 'leave' };
    case 'party':
      if (m.op === 'create' || m.op === 'leave') return { t: 'party', op: m.op };
      if (m.op === 'join' && typeof m.code === 'string' && PARTY_CODE.test(m.code)) return { t: 'party', op: 'join', code: m.code };
      return null;
    case 'input': {
      if (!isNum(m.seq) || !isNum(m.mx) || !isNum(m.my) || !isNum(m.aim)) return null;
      if (!isBool(m.fire) || !isBool(m.quiet) || !isBool(m.reload) || !isBool(m.ability)) return null;
      if ((m.nade !== undefined && !isBool(m.nade)) || (m.nd !== undefined && !isNum(m.nd)) || (m.na !== undefined && !isNum(m.na))) return null;
      return { t: 'input', seq: m.seq, mx: m.mx, my: m.my, aim: m.aim, fire: m.fire, quiet: m.quiet, reload: m.reload, ability: m.ability, ...(m.nade === true ? { nade: true, nd: m.nd as number | undefined, ...(m.na !== undefined ? { na: m.na as number } : {}) } : {}) };
    }
    case 'ping':
      return isNum(m.at) ? { t: 'ping', at: m.at } : null;
    default:
      return null;
  }
}

/** A client's controls as sim input: the move vector is clamped to length 1 and the aim normalised. */
export function toActorInput(m: Extract<ClientMsg, { t: 'input' }>): ActorInput {
  let mx = m.mx, my = m.my;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const aim = Math.atan2(Math.sin(m.aim), Math.cos(m.aim));
  // Throw distance: clamped again in the sim; a missing or absurd value throws at the touch default.
  const nd = m.nd !== undefined && m.nd >= 0 && m.nd <= 30 ? m.nd : undefined;
  const na = m.na !== undefined ? Math.atan2(Math.sin(m.na), Math.cos(m.na)) : undefined;
  return { moveX: mx, moveY: my, aim, firing: m.fire, quiet: m.quiet, reload: m.reload, ability: m.ability, grenade: !!m.nade, throwDist: nd, throwAim: na };
}

