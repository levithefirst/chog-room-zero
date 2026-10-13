// Online play protocol (RC-8). JSON over one WebSocket. The browser sends only intent (who it is, which queue, its
// controls); the server runs the match (src/net/room.ts) and decides movement, shots, damage, pickups, the zone and
// the result. Every client message is validated here before the server looks at it.
import type { ActorInput, Team } from '../sim/world';

export const PROTOCOL = 1;
export type Mode = '1v1' | '3v3' | '5v5';
export const MODE_SIZE: Record<Mode, number> = { '1v1': 2, '3v3': 6, '5v5': 10 };
export const MAX_MESSAGE_BYTES = 512;

export type ClientMsg =
  | { t: 'hello'; v: number; name: string; hero: string; token?: string }
  | { t: 'queue'; mode: Mode; code?: string }
  | { t: 'leave' }
  | { t: 'input'; seq: number; mx: number; my: number; aim: number; fire: boolean; quiet: boolean; reload: boolean; ability: boolean }
  | { t: 'ping'; at: number };

/** One actor as a client may see it. Enemies the client's team cannot see are left out of the snapshot. */
export interface NetActor {
  id: number; name: string; hero: string; team: Team;
  x: number; y: number; vx: number; vy: number; facing: number;
  hp: number; maxHp: number; armor: number; maxArmor: number; alive: boolean;
  ammo: number; reserve: number; reloadLeft: number; abilityCd: number; revealLeft: number;
  muzzle: number; hitFlash: number; deadFor: number; lastSpread: number; stepAcc: number;
  kills: number; connected: boolean;
}
export interface NetBullet { x: number; y: number; dx: number; dy: number; ox: number; oy: number; owner: number; weapon: string }
export interface NetSound { type: string; x: number; y: number; radius: number; source: number; team: Team; weapon?: string; blocked?: boolean }
export interface NetHit { target: number; by: number; x: number; y: number; fromX: number; fromY: number; killed: boolean }

export interface PlayerResult { id: number; name: string; hero: string; team: Team; kills: number; damageDealt: number; damageTaken: number; hits: number; bullets: number; alive: boolean; cause: string | null }

export type ServerMsg =
  | { t: 'welcome'; v: number; token: string; name: string; resumed: boolean }
  | { t: 'queued'; mode: Mode; have: number; need: number; code: string | null }
  | { t: 'queueTimeout' }
  | { t: 'match'; room: string; mode: Mode; you: number; team: Team; seed: number; friendlyFire: boolean; roster: { id: number; name: string; hero: string; team: Team }[]; startsIn: number; zone: { x: number; y: number; r: number }[] }
  | { t: 'snap'; tick: number; actors: NetActor[]; bullets: NetBullet[]; pickups: boolean[]; sounds: NetSound[]; hits: NetHit[]; barriers: { x0: number; y0: number; x1: number; y1: number; left: number }[] }
  | { t: 'over'; winner: Team | null; reason: 'eliminated' | 'time'; results: PlayerResult[] }
  | { t: 'pong'; at: number; tick: number }
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
      return { t: 'hello', v: PROTOCOL, name: m.name, hero: m.hero, token: m.token as string | undefined };
    case 'queue':
      if (typeof m.mode !== 'string' || !MODES.includes(m.mode)) return null;
      if (m.code !== undefined && (typeof m.code !== 'string' || !/^[A-Z0-9]{4,8}$/.test(m.code))) return null;
      return { t: 'queue', mode: m.mode as Mode, code: m.code as string | undefined };
    case 'leave':
      return { t: 'leave' };
    case 'input': {
      if (!isNum(m.seq) || !isNum(m.mx) || !isNum(m.my) || !isNum(m.aim)) return null;
      if (!isBool(m.fire) || !isBool(m.quiet) || !isBool(m.reload) || !isBool(m.ability)) return null;
      return { t: 'input', seq: m.seq, mx: m.mx, my: m.my, aim: m.aim, fire: m.fire, quiet: m.quiet, reload: m.reload, ability: m.ability };
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
  return { moveX: mx, moveY: my, aim, firing: m.fire, quiet: m.quiet, reload: m.reload, ability: m.ability };
}

