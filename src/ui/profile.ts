// Player card and settings (RC-7, master integration pass). The card (callsign, favourite operator, pinned medals) of a
// signed-in player is the account's, stored on the server; a guest's lives in a session memory store. Settings are the
// one thing kept in localStorage (device preferences). Pure over a KeyValueStore so it is unit-tested.
import type { KeyValueStore } from '../nft/history';

export interface LinkedIdentity {
  /** 'google' or 'wallet'. Verified by the server session (api/auth); never typed in by the player. */
  provider: 'google' | 'wallet';
  /** Stable id from the provider: Google `sub`, or the checksummed wallet address. */
  subject: string;
  /** What to show: an email or a shortened address. */
  label: string;
}

export interface Profile {
  id: string;
  nickname: string | null;
  /** Shown when there is no callsign: a signed-in account's "Player-XXXX" (a guest gets "Guest-XXXX"). */
  fallback?: string;
  favourite: string | null;
  pinned: string[];
  linked: LinkedIdentity[];
}

export type Quality = 'low' | 'medium' | 'high';
export type StickSize = 'small' | 'medium' | 'large';

export interface Settings {
  /** Master volume, 0..1 (mute is separate and kept by the audio module). */
  volume: number;
  /** Short buzz when you are hit, where the browser supports navigator.vibrate. */
  vibration: boolean;
  /** Render resolution cap: low 1x, medium 1.5x, high 2x device pixels. */
  quality: Quality;
  /** Touch stick travel for a full push. */
  stick: StickSize;
  /** In-match tips that explain a mechanic the first time you meet it. */
  tips: boolean;
  /** V2: send the anonymous end-of-match record (src/sim/report.ts). */
  shareStats: boolean;
}

export const PROFILE_KEY = 'chog-room-zero:profile:v1';
export const SETTINGS_KEY = 'chog-room-zero:settings:v1';
export const QUALITY_DPR: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };
// Full-push stick travel in px: 44 for small thumbs or short pushes, 56 default (RC-1 tuning), 72 for big phones.
export const STICK_PX: Record<StickSize, number> = { small: 44, medium: 56, large: 72 };
export const DEFAULT_SETTINGS: Settings = { volume: 1, vibration: true, quality: 'medium', stick: 'medium', tips: true, shareStats: true };

// Crockford base32 without I, L, O, U: readable aloud, no lookalikes.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newProfileId(rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  return Array.from(rand(8), (b) => ALPHABET[b % 32]).join('');
}

export const NICK_MIN = 3;
export const NICK_MAX = 16;

/** Cleans a typed callsign and says what is wrong with it, if anything. */
export function validateNickname(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (value.length < NICK_MIN) return { ok: false, error: `At least ${NICK_MIN} characters.` };
  if (value.length > NICK_MAX) return { ok: false, error: `At most ${NICK_MAX} characters.` };
  if (!/^[A-Za-z0-9 _.\-]+$/.test(value)) return { ok: false, error: 'Letters, numbers, space, dot, dash and underscore only.' };
  if (!/[A-Za-z0-9]/.test(value)) return { ok: false, error: 'Needs at least one letter or number.' };
  return { ok: true, value };
}

export function loadProfile(store: KeyValueStore): Profile {
  let p: Partial<Profile> | null = null;
  try { p = JSON.parse(store.getItem(PROFILE_KEY) ?? 'null') as Partial<Profile> | null; } catch { /* corrupt */ }
  const id = typeof p?.id === 'string' && /^[0-9A-Z]{8}$/.test(p.id) ? p.id : newProfileId();
  const nick = typeof p?.nickname === 'string' ? validateNickname(p.nickname) : null;
  const profile: Profile = {
    id,
    nickname: nick && nick.ok ? nick.value : null,
    favourite: typeof p?.favourite === 'string' ? p.favourite : null,
    pinned: Array.isArray(p?.pinned) ? p.pinned.filter((x): x is string => typeof x === 'string').slice(0, 3) : [],
    linked: Array.isArray(p?.linked) ? p.linked.filter((l): l is LinkedIdentity => !!l && (l.provider === 'google' || l.provider === 'wallet') && typeof l.subject === 'string' && typeof l.label === 'string') : [],
  };
  if (!p || p.id !== id) saveProfile(store, profile); // a new id is kept from the first launch on
  return profile;
}

export function saveProfile(store: KeyValueStore, p: Profile): void {
  try { store.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* storage blocked: kept for this session */ }
}

/** Shown name: the callsign, or a stable guest name from the profile id. */
export function displayName(p: Profile): string {
  return p.nickname ?? p.fallback ?? `Guest-${p.id.slice(0, 4)}`;
}

/** Pin or unpin a medal (max three, oldest pin drops off). */
export function togglePin(p: Profile, medal: string): Profile {
  const pinned = p.pinned.includes(medal) ? p.pinned.filter((m) => m !== medal) : [...p.pinned, medal].slice(-3);
  return { ...p, pinned };
}

/** Adds a verified identity; the same provider + subject is never stored twice. */
export function linkIdentity(p: Profile, id: LinkedIdentity): Profile {
  if (p.linked.some((l) => l.provider === id.provider && l.subject === id.subject)) return p;
  return { ...p, linked: [...p.linked, id] };
}

export function loadSettings(store: KeyValueStore): Settings {
  let s: Partial<Settings> | null = null;
  try { s = JSON.parse(store.getItem(SETTINGS_KEY) ?? 'null') as Partial<Settings> | null; } catch { /* corrupt */ }
  const d = DEFAULT_SETTINGS;
  return {
    volume: typeof s?.volume === 'number' && s.volume >= 0 && s.volume <= 1 ? s.volume : d.volume,
    vibration: typeof s?.vibration === 'boolean' ? s.vibration : d.vibration,
    quality: s?.quality === 'low' || s?.quality === 'medium' || s?.quality === 'high' ? s.quality : d.quality,
    stick: s?.stick === 'small' || s?.stick === 'medium' || s?.stick === 'large' ? s.stick : d.stick,
    tips: typeof s?.tips === 'boolean' ? s.tips : d.tips,
    shareStats: typeof s?.shareStats === 'boolean' ? s.shareStats : d.shareStats,
  };
}

export function saveSettings(store: KeyValueStore, s: Settings): void {
  try { store.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}
