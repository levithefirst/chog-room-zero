// V2 playtest telemetry (owner V2 §4: "make feel measurable"; report rank 1). One anonymous record per match, sent once
// at the end (RULES 8), only if the player has not switched "Share match stats" off. No account id, no name, no
// address, no IP: an install id (random, kept in this browser, reset by clearing site data) so returning players and
// matches per player can be counted, the operator, the mode and what happened. Shared by the client (builds it) and
// the API (validates and clamps it before storing it in room_zero.match_reports).

export type ReportMode = 'solo' | '1v1' | '3v3' | '5v5';
export type ReportOutcome = 'won' | 'lost' | 'quit' | 'disconnect';
/** How the player went out: a shot (or grenade), the zone, bleeding out, or not at all. */
export type ReportCause = 'shot' | 'zone' | 'bled' | null;
/** Who got the player: a hostile bot, a person online, or nobody. Never which person. */
export type ReportKiller = 'bot' | 'player' | null;

export interface MatchReport {
  v: 1;
  anon: string;
  mode: ReportMode;
  hero: string;
  outcome: ReportOutcome;
  seconds: number;
  cause: ReportCause;
  killer: ReportKiller;
  /** The killer's first hit landed before you had any read on it (seen, heard or told): "shot from the dark". */
  noCue: boolean;
  damageTaken: number;
  firstContactS: number | null;
  /** Your bullets fired and landed (a pellet counts as a bullet). */
  bullets: number;
  hits: number;
  /** Trigger press to your own shot leaving, ms (median of this match; online includes the round trip). */
  fireDelayMs: number | null;
  kills: number;
  /** Your side's AI teammates: kills, revives given, bags taken, how many went out. */
  aiKills: number;
  aiRevives: number;
  aiLoots: number;
  aiLost: number;
  /** Revives you gave and got; times you went down and bled out. */
  revives: number;
  revived: number;
  downs: number;
  bledOut: number;
  /** Bags you took from, and bags that ran out with something still in them. */
  loots: number;
  lootExpired: number;
  zoneDeaths: number;
  perk: string | null;
  rttMs: number | null;
  queueS: number | null;
  device: { input: 'touch' | 'pc'; screen: 's' | 'm' | 'l'; browser: 'chrome' | 'safari' | 'firefox' | 'other' };
}

const MODES: ReportMode[] = ['solo', '1v1', '3v3', '5v5'];
const OUTCOMES: ReportOutcome[] = ['won', 'lost', 'quit', 'disconnect'];
const int = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : null);
const oneOf = <T extends string>(v: unknown, xs: readonly T[]): T | null => (typeof v === 'string' && (xs as readonly string[]).includes(v) ? (v as T) : null);
const word = (v: unknown, max = 16): string | null => (typeof v === 'string' && /^[a-z0-9-]{1,32}$/.test(v) ? v.slice(0, max) : null);

/** The server's check: the exact shape, every number clamped to what a match can hold, or null. */
export function validReport(raw: unknown): MatchReport | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || r.v !== 1) return null;
  const anon = typeof r.anon === 'string' && /^[A-Za-z0-9_-]{16,40}$/.test(r.anon) ? r.anon : null;
  const mode = oneOf(r.mode, MODES), outcome = oneOf(r.outcome, OUTCOMES), hero = word(r.hero);
  const d = (r.device ?? {}) as Record<string, unknown>;
  const input = oneOf(d.input, ['touch', 'pc'] as const), screen = oneOf(d.screen, ['s', 'm', 'l'] as const), browser = oneOf(d.browser, ['chrome', 'safari', 'firefox', 'other'] as const);
  const seconds = int(r.seconds, 0, 1800);
  if (!anon || !mode || !outcome || !hero || !input || !screen || !browser || seconds === null) return null;
  const n = (k: string, hi: number) => int(r[k], 0, hi) ?? 0;
  const opt = (k: string, hi: number) => (r[k] === null || r[k] === undefined ? null : int(r[k], 0, hi));
  return {
    v: 1, anon, mode, hero, outcome, seconds,
    cause: r.cause === null ? null : oneOf(r.cause, ['shot', 'zone', 'bled'] as const),
    killer: r.killer === null ? null : oneOf(r.killer, ['bot', 'player'] as const),
    noCue: r.noCue === true,
    damageTaken: n('damageTaken', 5000), firstContactS: opt('firstContactS', 1800),
    bullets: n('bullets', 20000), hits: Math.min(n('hits', 20000), n('bullets', 20000)), fireDelayMs: opt('fireDelayMs', 5000),
    kills: n('kills', 10), aiKills: n('aiKills', 10), aiRevives: n('aiRevives', 50), aiLoots: n('aiLoots', 100), aiLost: n('aiLost', 2),
    revives: n('revives', 50), revived: n('revived', 50), downs: n('downs', 50), bledOut: n('bledOut', 1),
    loots: n('loots', 100), lootExpired: n('lootExpired', 50), zoneDeaths: n('zoneDeaths', 10),
    perk: word(r.perk), rttMs: opt('rttMs', 10000), queueS: opt('queueS', 600),
    device: { input, screen, browser },
  };
}

/** The browser family and screen size class from what the page can see (no fingerprinting beyond that). */
export function deviceClass(ua: string, w: number, h: number, touch: boolean): MatchReport['device'] {
  const m = Math.min(w, h);
  const browser = /firefox|fxios/i.test(ua) ? 'firefox' : /edg\/|chrome|crios|chromium/i.test(ua) ? 'chrome' : /safari/i.test(ua) ? 'safari' : 'other';
  return { input: touch ? 'touch' : 'pc', screen: m < 500 ? 's' : m < 900 ? 'm' : 'l', browser };
}

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};
