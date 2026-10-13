import { describe, expect, it } from 'vitest';
import { loadRecords, recordBest, RECORDS_KEY, fmtTime } from '../src/ui/records';

function mem() { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; }

describe('RC-1 personal bests', () => {
  it('tracks best win time and most kills per hero and overall', () => {
    const s = mem();
    recordBest(s, { hero: 'kettle', won: false, seconds: 30, kills: 2 });
    let r = recordBest(s, { hero: 'kettle', won: true, seconds: 80, kills: 5 });
    expect(r.newBest).toEqual({ time: true, kills: true });
    r = recordBest(s, { hero: 'kettle', won: true, seconds: 95, kills: 5 });
    expect(r.newBest).toEqual({ time: false, kills: false });
    r = recordBest(s, { hero: 'wick', won: true, seconds: 60, kills: 5 });
    expect(r.records.heroes.kettle).toMatchObject({ bestWinSeconds: 80, mostKills: 5, runs: 3, wins: 2 });
    expect(r.records.overall).toMatchObject({ bestWinSeconds: 60, mostKills: 5, runs: 4, wins: 3 });
    // RC-7 career totals: every run adds up (kills 2+5+5 for Kettle, time played 30+80+95).
    expect(r.records.heroes.kettle).toMatchObject({ kills: 12, seconds: 205 });
    expect(r.records.overall).toMatchObject({ kills: 17, seconds: 265 });
  });
  it('persists across a reload (fresh load from the same store) and works for guests (no token needed)', () => {
    const s = mem();
    recordBest(s, { hero: 'mop', won: true, seconds: 70, kills: 5 });
    const again = loadRecords({ getItem: (k) => s.m.get(k) ?? null, setItem: () => {} });
    expect(again.heroes.mop.bestWinSeconds).toBe(70);
  });
  it('survives corrupt or blocked storage', () => {
    const s = mem(); s.m.set(RECORDS_KEY, '{bad');
    expect(loadRecords(s).overall.runs).toBe(0);
    const blocked = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(() => recordBest(blocked as never, { hero: 'mop', won: false, seconds: 1, kills: 0 })).not.toThrow();
  });
  it('formats times', () => { expect(fmtTime(75)).toBe('1:15'); expect(fmtTime(null)).toBe('--'); });
  it('RC-7: adds career totals per run, and loads an older save without them as zeros', () => {
    const s = mem();
    s.m.set(RECORDS_KEY, JSON.stringify({ overall: { bestWinSeconds: 50, mostKills: 4, runs: 2, wins: 1 }, heroes: { wick: { bestWinSeconds: 50, mostKills: 4, runs: 2, wins: 1 } } }));
    const old = loadRecords(s);
    expect(old.overall).toMatchObject({ bestWinSeconds: 50, runs: 2, kills: 0, bullets: 0, pickups: 0 });
    const r = recordBest(s, { hero: 'wick', won: true, seconds: 40, kills: 5, bullets: 20, hits: 12, damageDealt: 400, damageTaken: 30, pickups: 2, abilities: 1 });
    expect(r.records.heroes.wick).toMatchObject({ runs: 3, wins: 2, bestWinSeconds: 40, kills: 5, bullets: 20, hits: 12, damageDealt: 400, damageTaken: 30, pickups: 2, abilities: 1, seconds: 40 });
    expect(r.records.overall.hits).toBe(12);
  });
});
