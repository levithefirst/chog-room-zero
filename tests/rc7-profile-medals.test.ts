// RC-7: guest profile, settings and medals are pure over a key-value store: validated, persisted, never fabricated.
import { HEROES } from '../src/config/heroes';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, PROFILE_KEY, SETTINGS_KEY, displayName, linkIdentity, loadProfile, loadSettings, newProfileId, saveProfile, saveSettings, togglePin, validateNickname } from '../src/ui/profile';
import { MEDALS, MEDALS_KEY, awardMedals, loadMedals, medalProgress, type RunFacts } from '../src/ui/medals';
import { loadRecords, recordBest } from '../src/ui/records';
import { nextPhase } from '../src/sim/match';

function mem() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; }
const run = (o: Partial<RunFacts> = {}): RunFacts => ({ hero: 'benja', won: false, seconds: 30, kills: 0, bullets: 0, hits: 0, damageTaken: 10, hpLeft: 50, pickups: 0, abilities: 0, ...o });
// Record then award, the order main.ts uses at match end.
function finish(s: ReturnType<typeof mem>, f: RunFacts) {
  const { records } = recordBest(s, { ...f });
  return awardMedals(s, records, f, '2026-10-13T00:00:00.000Z');
}

describe('RC-7 nickname', () => {
  it('accepts 3-16 letters, numbers, space, dot, dash, underscore; trims and collapses spaces', () => {
    expect(validateNickname('  Night   Owl ')).toEqual({ ok: true, value: 'Night Owl' });
    expect(validateNickname('k.e-t_t1e')).toEqual({ ok: true, value: 'k.e-t_t1e' });
    expect(validateNickname('ab').ok).toBe(false);
    expect(validateNickname('x'.repeat(17)).ok).toBe(false);
    expect(validateNickname('<script>').ok).toBe(false);
    expect(validateNickname('___').ok).toBe(false);
  });
});

describe('RC-7 profile', () => {
  it('creates a stable 8-character id once and keeps it across loads', () => {
    const s = mem();
    const a = loadProfile(s);
    expect(a.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(loadProfile(s).id).toBe(a.id);
    expect(displayName(a)).toBe(`Guest-${a.id.slice(0, 4)}`);
  });
  it('saves a callsign, favourite and up to three pins; rejects a tampered callsign on load', () => {
    const s = mem();
    let p = loadProfile(s);
    p = { ...p, nickname: 'Sniper', favourite: 'ray' };
    for (const m of ['a', 'b', 'c', 'd']) p = togglePin(p, m);
    expect(p.pinned).toEqual(['b', 'c', 'd']);
    p = togglePin(p, 'c');
    expect(p.pinned).toEqual(['b', 'd']);
    saveProfile(s, p);
    expect(loadProfile(s)).toMatchObject({ nickname: 'Sniper', favourite: 'ray', pinned: ['b', 'd'] });
    s.m.set(PROFILE_KEY, JSON.stringify({ ...p, nickname: '<img onerror=x>' }));
    expect(loadProfile(s).nickname).toBeNull();
  });
  it('links a verified identity once (same provider + subject never twice)', () => {
    let p = loadProfile(mem());
    const g = { provider: 'google' as const, subject: '123', label: 'a@b.c' };
    p = linkIdentity(linkIdentity(p, g), g);
    expect(p.linked).toHaveLength(1);
  });
  it('new ids use only the readable alphabet', () => {
    expect(newProfileId(() => Uint8Array.from([0, 1, 31, 32, 63, 255, 18, 8]))).toBe('01Z0ZZJ8');
  });
  it('survives corrupt or blocked storage', () => {
    const s = mem(); s.m.set(PROFILE_KEY, '{bad'); s.m.set(SETTINGS_KEY, '{bad');
    expect(loadProfile(s).id).toHaveLength(8);
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    const blocked = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(() => loadProfile(blocked)).not.toThrow();
  });
});

describe('RC-7 settings', () => {
  it('persists valid values and drops invalid ones', () => {
    const s = mem();
    saveSettings(s, { volume: 0.3, vibration: false, quality: 'high', stick: 'large', tips: false });
    expect(loadSettings(s)).toEqual({ volume: 0.3, vibration: false, quality: 'high', stick: 'large', tips: false });
    s.m.set(SETTINGS_KEY, JSON.stringify({ volume: 7, quality: 'ultra', stick: 'huge', tips: 'yes' }));
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('RC-7 medals', () => {
  it('unlock only from real tracked play, once, and persist', () => {
    const s = mem();
    let r = finish(s, run({ kills: 1 }));
    expect(r.earned.map((m) => m.id)).toEqual(['first-blood']);
    r = finish(s, run({ kills: 1 }));
    expect(r.earned).toEqual([]); // never awarded twice
    expect(Object.keys(loadMedals(s))).toEqual(['first-blood']);
    expect(JSON.parse(s.m.get(MEDALS_KEY)!)['first-blood']).toBe('2026-10-13T00:00:00.000Z');
  });
  it('one-run medals check the run that just ended', () => {
    const s = mem();
    const r = finish(s, run({ won: true, kills: 5, seconds: 25, bullets: 20, hits: 12, damageTaken: 0, hpLeft: 100, pickups: 3, abilities: 3 }));
    // GP: 36 medals; this run also makes Hat Trick, Brawler and Ace (all five yours, nobody lost).
    expect(r.earned.map((m) => m.id).sort()).toEqual(['ace', 'brawler', 'cleared', 'first-blood', 'hat-trick', 'in-and-out', 'scavenger', 'steady-hand', 'toolkit', 'untouched'].sort());
    expect(r.unlocked['close-call']).toBeUndefined();
    expect(r.unlocked.survivor).toBeUndefined();
  });
  it('boundaries: 30 s is not under 30 (GP: was 60), 49% is not 50%, 9 bullets is too few, 16 health is not 15', () => {
    const s = mem();
    const r = finish(s, run({ won: true, kills: 5, seconds: 30, bullets: 100, hits: 49, damageTaken: 1, hpLeft: 16 }));
    for (const id of ['in-and-out', 'steady-hand', 'close-call', 'untouched']) expect(r.unlocked[id]).toBeUndefined();
    const t = finish(mem(), run({ won: true, kills: 5, seconds: 29, bullets: 9, hits: 9, hpLeft: 15 }));
    expect(t.unlocked['in-and-out']).toBeDefined();
    expect(t.unlocked['steady-hand']).toBeUndefined();
    expect(t.unlocked['close-call']).toBeDefined();
  });
  it('a loss never awards a clear medal; Survivor counts time alive even in a loss', () => {
    const r = finish(mem(), run({ won: false, seconds: 95, damageTaken: 0, hpLeft: 0 }));
    expect(r.unlocked.untouched).toBeUndefined();
    expect(r.unlocked.cleared).toBeUndefined();
    expect(r.unlocked.survivor).toBeDefined();
  });
  it('career medals show progress and unlock at the goal (Full Squad needs a clear with each operator)', () => {
    const s = mem();
    const ids = HEROES.map((h) => h.id);
    for (const hero of ids.slice(0, -1)) finish(s, run({ hero, won: true, kills: 5 }));
    const recs = loadRecords(s);
    const squad = MEDALS.find((m) => m.id === 'full-squad')!;
    expect(medalProgress(squad, recs, loadMedals(s))).toBe(6);
    expect(medalProgress(MEDALS.find((m) => m.id === 'exterminator')!, recs, loadMedals(s))).toBe(25); // 30 kills, capped at the goal
    expect(loadMedals(s)['full-squad']).toBeUndefined();
    const r = finish(s, run({ hero: ids[6], won: true, kills: 5 }));
    expect(r.earned.map((m) => m.id)).toContain('full-squad');
    expect(medalProgress(squad, loadRecords(s), r.unlocked)).toBe(7);
  });
});

describe('RC-7 flow', () => {
  it('results -> Menu goes to the title; Again and Change Chog keep their targets', () => {
    expect(nextPhase('results', 'menu')).toBe('title');
    expect(nextPhase('results', 'restart')).toBe('loading');
    expect(nextPhase('results', 'quit')).toBe('select');
    expect(nextPhase('play', 'menu')).toBe('play');
  });
});

import { TIP_GAP_SECONDS, TIP_START_SECONDS, loadShownTips, nextTip, saveShownTips, tipText, type TipState } from '../src/ui/tips';

describe('RC-7 contextual tips', () => {
  const base: TipState = { t: 20, sinceLastHint: 10, hintShowing: false, wantedPickup: null, ammo: 20, magazine: 24, reserve: 48, reloading: false, abilityReady: false, hurt: false, blockedShot: false };
  it('never over the opening instruction, another pill, or right after one', () => {
    expect(nextTip({ ...base, hurt: true, t: TIP_START_SECONDS - 0.1 }, new Set())).toBeNull();
    expect(nextTip({ ...base, hurt: true, hintShowing: true }, new Set())).toBeNull();
    expect(nextTip({ ...base, hurt: true, sinceLastHint: TIP_GAP_SECONDS - 0.1 }, new Set())).toBeNull();
  });
  it('shows each tip only for real state, urgent first, and never twice', () => {
    expect(nextTip(base, new Set())).toBeNull();
    expect(nextTip({ ...base, wantedPickup: 'armor', hurt: true }, new Set())).toBe('hurt');
    expect(nextTip({ ...base, wantedPickup: 'armor', hurt: true }, new Set(['hurt']))).toBe('pickup-armor');
    expect(nextTip({ ...base, ammo: 6 }, new Set())).toBe('reload');
    expect(nextTip({ ...base, ammo: 6, reserve: 0 }, new Set())).toBeNull(); // nothing to reload with
    expect(nextTip({ ...base, ammo: 6, reloading: true }, new Set())).toBeNull();
    expect(nextTip({ ...base, abilityReady: true, t: 11 }, new Set())).toBeNull();
    expect(nextTip({ ...base, abilityReady: true }, new Set())).toBe('ability');
  });
  it('words follow the platform and the operator, and shown tips persist', () => {
    expect(tipText('reload', true, { kind: 'mend', name: 'Patch' })).toContain('Reload</b> button');
    expect(tipText('reload', false, { kind: 'mend', name: 'Patch' })).toContain('<b>R</b>');
    expect(tipText('ability', false, { kind: 'sonar', name: 'Ping' })).toMatch(/Ping.*Space.*14 m/);
    const s = mem();
    saveShownTips(s, new Set(['hurt', 'cover']));
    expect([...loadShownTips(s)].sort()).toEqual(['cover', 'hurt']);
  });
});
