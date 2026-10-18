// GP Game Docs (owner 2026-10-17): the 19 sections, in the game, from the game's own numbers, searchable.
import { describe, expect, it } from 'vitest';
import { DOCS, docsHtml } from '../src/ui/docs';
import { TUNING } from '../src/config/tuning';
import { MEDALS } from '../src/ui/medals';

const WANT = ['How to Play', 'Combat', 'Movement', 'Vision & Information', 'Sound', 'Squads', 'Revives', 'Enemy Teams', 'Pickups', 'Enemy Loot', 'Perks', 'CHOG Superpowers', 'Medals', 'Upgrades', 'Rewards', 'CHOG', 'Matchmaking', 'Leaderboards', 'Controls', 'Game Modes', 'FAQ'];

describe('Game Docs', () => {
  it('has every section the owner asked for, in order, with unique ids and real content on both platforms', () => {
    expect(DOCS.map((d) => d.title)).toEqual(WANT);
    expect(new Set(DOCS.map((d) => d.id)).size).toBe(WANT.length);
    for (const d of DOCS) for (const t of [true, false]) expect(d.html(t).replace(/<[^>]+>/g, '').trim().length, d.title).toBeGreaterThan(80);
  });
  it('quotes the rules the game runs on (revive window, loot timeout, pickup timers, medal count)', () => {
    const text = (id: string) => DOCS.find((d) => d.id === id)!.html(false).replace(/<[^>]+>/g, '');
    expect(text('revives')).toContain(`${TUNING.revive.bleedSeconds} seconds`);
    expect(text('revives')).toContain(`${TUNING.revive.seconds} s`);
    expect(text('loot')).toContain(`${TUNING.loot.seconds} s`);
    expect(text('pickups')).toContain(`${TUNING.pickups.ammo.respawn} s`);
    expect(text('medals')).toContain(`${MEDALS.length} medals`);
    expect(text('faq')).toMatch(/Snare/);
  });
  it('controls differ for touch and PC; the screen has a search box and opens the asked section', () => {
    const c = DOCS.find((d) => d.id === 'controls')!;
    expect(c.html(true)).toContain('Right thumb');
    expect(c.html(false)).toContain('WASD');
    const h = docsHtml(false, 'revives', '<header></header>');
    expect(h).toContain('id="docsq"');
    expect(h).toContain('id="doc-revives" data-doc="revives" open');
    expect((h.match(/<details class="doc"/g) ?? []).length).toBe(WANT.length);
  });
  it('CHOG is explained only where it matters to play (never a sales pitch)', () => {
    const all = DOCS.map((d) => d.html(false)).join(' ').toLowerCase();
    for (const banned of [/\bbuy now\b/, /\bmint\b/, /\bfloor price\b/, /\bto the moon\b/, /\binvest(ment)?\b/]) expect(all).not.toMatch(banned);
  });
});

describe('CHOG Superpowers doc (owner 2026-10-18)', () => {
  it('names every power, its trait, its counter and every rank\'s numbers from the power table', async () => {
    const { SUPERPOWERS, SUPERPOWER_IDS, RANKS, rankLine } = await import('../src/config/superpowers');
    const h = DOCS.find((d) => d.id === 'superpowers')!.html(false);
    for (const id of SUPERPOWER_IDS) {
      expect(h).toContain(SUPERPOWERS[id].name);
      for (const r of RANKS) expect(h).toContain(rankLine(id, r));
    }
    expect(h).toMatch(/never adds health, armour or weapon damage/);
    expect(h).toMatch(/shows you nothing behind them/);
  });
});
