// Library accuracy audit (owner 2026-10-21, t23u): the library and the in-game docs state the current rules, from the
// game's config: online shards, the kill cap and damage bonus, the tactical map's every-hostile rule, controls, and
// no stale claims left over from older rules. Hand-written prose numbers that duplicate config are pinned here.
import { describe, it, expect } from 'vitest';
import { PAGES, buildIndex, strip } from '../src/library/pages';
import { renderBody } from '../src/library/render';
import { search } from '../src/library/search';
import { DOCS, docsHtml } from '../src/ui/docs';
import { REWARDS, PRACTICE_REWARDS, rewardBreakdown } from '../src/config/progression';
import { TUNING } from '../src/config/tuning';
import { WEAPONS } from '../src/config/weapons';
import { HEROES } from '../src/config/heroes';
import { MAPS, MAP_IDS } from '../src/config/maps';
import { BASE_HP } from '../src/config/power';
import { SERVER } from '../src/library/facts';

const text = (slug: string) => strip(renderBody(PAGES.find((p) => p.slug === slug)!)).replace(/\s+/g, ' ');
const all = PAGES.map((p) => text(p.slug)).join(' ');
const docs = [false, true].map((t) => strip(docsHtml(t, null, '')).replace(/\s+/g, ' ')).join(' ');
const index = buildIndex();
const top = (q: string, n = 3) => search(index, q, n).map((h) => `${h.e.p}#${h.e.s}`);
const pay = (won: boolean, kills: number) => rewardBreakdown({ won, kills, damage: 0, seconds: 60, leftEarly: false, capped: false }).shards;

describe('rewards are the config values (online shards 10 / 10 / 30)', () => {
  it('the Rewards table and worked examples come from REWARDS and rewardBreakdown', () => {
    expect([REWARDS.shardsPlay, REWARDS.shardsPerKill, REWARDS.shardsWin]).toEqual([10, 10, 30]);
    const r = text('rewards');
    expect(r).toMatch(new RegExp(`Match played ${REWARDS.xpPlay} ${REWARDS.shardsPlay} ${PRACTICE_REWARDS.xpPlay} ${PRACTICE_REWARDS.shardsPlay}`));
    expect(r).toContain(`Victory +${REWARDS.xpWin} +${REWARDS.shardsWin} +${PRACTICE_REWARDS.xpWin} +${PRACTICE_REWARDS.shardsWin}`);
    expect(r).toContain(`Per kill (up to ${REWARDS.maxKills}) +${REWARDS.xpPerKill} +${REWARDS.shardsPerKill}`);
    expect(r).toContain(`1 per ${REWARDS.damagePerShard} (up to ${REWARDS.damageShardsMax})`);
    for (const [label, won, k] of [['Win, 0 kills', true, 0], ['Win, 1 kill', true, 1], ['Win, 3 kills', true, 3], ['Win, 5 kills', true, 5], ['Loss, 0 kills', false, 0], ['Loss, 3 kills', false, 3], ['Loss, 5 kills', false, 5]] as const)
      expect(r).toContain(`${label} ${pay(won, k)} `);
    expect(r).toContain(`Win, 7 kills (counts ${REWARDS.maxKills}) ${pay(true, 7)} `);
    expect([pay(true, 0), pay(true, 5), pay(false, 5)]).toEqual([40, 90, 60]);
  });
  it('the in-game docs state the same numbers', () => {
    expect(docs).toContain(`${REWARDS.shardsPlay} shards and ${REWARDS.xpPlay} XP for a completed match, ${REWARDS.shardsPerKill} shards and ${REWARDS.xpPerKill} XP per kill (up to ${REWARDS.maxKills} kills), ${REWARDS.shardsWin} shards and ${REWARDS.xpWin} XP for a win`);
    expect(docs).toContain(`1 shard per ${REWARDS.damagePerShard} damage dealt (up to ${REWARDS.damageShardsMax})`);
    expect(docs).toContain(`Up to ${REWARDS.dailyCap} paid matches a day`);
  });
});

describe('the tactical map shows every hostile (owner 2026-10-21), and the rest of the map', () => {
  it('How to play, the FAQ and the in-game FAQ say so', () => {
    const h = text('how-to-play');
    expect(h).toMatch(/every living hostile on the whole map at its current spot/);
    for (const k of ['area names', 'the zone', 'stocked supplies', 'you and your side', 'last known', 'Visor', 'game view itself still hides hostiles behind walls']) expect(h).toContain(k);
    expect(text('faq')).toMatch(/shows every living hostile on the whole map/);
    expect(docs).toMatch(/every living hostile on the whole map at its current spot while the map is open, seen or not/);
    expect(docs).toMatch(/The tactical map is the one exception/);
  });
});

describe('search finds the right section', () => {
  it.each([
    ['shards', 'rewards#examples'], ['rewards', 'rewards#table'], ['tactical map', 'how-to-play#tactical-map'], ['enemies on map', 'how-to-play#tactical-map'],
    ['how many shards', 'rewards#examples'], ['see enemies on the map', 'how-to-play#tactical-map'],
  ])('%s -> %s in the top 3', (q, want) => { expect(top(q)).toContain(want); });
});

describe('no stale claims', () => {
  it.each([
    [/win always pays more than any loss/i], [/a win always beats any loss/i], [/never shows (anyone|what) you could not know|never shows what your own eyes/i],
    [/hostiles only while you actually have them/i], [/shows only what you know/i], [/nothing on screen shows a hostile through walls/i],
    [/takes days to max/i], [/\b2 days\b/], [/matches that pay rewards also move your rating/i], [/5-letter code/],
  ])('%s', (re) => { expect(all).not.toMatch(re); expect(docs).not.toMatch(re); });
  it('no old online shard values (10 played / 25 win / 3 a kill)', () => {
    expect(text('rewards')).not.toMatch(/Victory \+60 \+25 /);
    expect(text('rewards')).not.toMatch(/Per kill \(up to 5\) \+10 \+3 /);
  });
});

describe('controls match the input code', () => {
  it('desktop: ability Space or Q, pause Esc or P, map M; the map closes with M, Esc or RETURN', () => {
    // In-game docs print the live (rebindable, Claude H40+) bindings; with the defaults: "Space / Q", "Esc / P".
    expect(docs).toContain('Ability Space / Q');
    expect(docs).toContain('Pause Esc / P');
    expect(docs).toMatch(/M, Esc or RETURN closes it/);
    expect(text('controls')).toMatch(/Space or Q Ability/);
    expect(text('controls')).toMatch(/Esc or P Pause/);
    // Claude's rebindable PC keys (0c0e504): the library names the Controls screen and that the table shows defaults.
    expect(text('controls')).toMatch(/Settings, Change keys lets you rebind each action/);
  });
});

describe('numbers derived from config (were hard-coded)', () => {
  it('online time limit, aim threshold, armour range, rifle example, solo hostiles', () => {
    expect(text('how-to-play')).toContain(`Time limit online ${SERVER.matchLimitSec} s`);
    const armour = HEROES.map((h) => h.maxArmor);
    expect(text('combat')).toContain(`(${Math.min(...armour)} to ${Math.max(...armour)})`);
    expect(text('combat')).toContain(`(${WEAPONS.rifle.damage} damage, ${Math.round(WEAPONS.rifle.armorPen * 100)}% armour pen) on ${Math.max(...armour)} armour`);
    const bots = MAPS['room-zero'].botSpawns.length;
    for (const id of MAP_IDS) expect(MAPS[id].botSpawns.length).toBe(bots);
    expect(docs).toContain(`against ${bots} hostiles`);
    const snare = HEROES.find((h) => h.ability.kind === 'scream')!.ability;
    expect(docs).toContain(`Snare (to ${Math.round((snare.amount ?? 1) * 100)}% speed for ${snare.seconds} s`);
  });
  it('prose numbers that still duplicate config are pinned (maps and operator notes)', () => {
    const S = TUNING.sound, V = TUNING.vision;
    expect(S.runStep).toBe(8);
    expect(+(S.runStep * S.wallFactor).toFixed(1)).toBe(6.4);
    expect(+(S.runStep * S.surface.carpet).toFixed(1)).toBe(5.6);
    expect(+(S.runStep * S.surface.deck).toFixed(1)).toBe(10.4);
    expect(V.litRange).toBe(22);
    const by = (id: string) => HEROES.find((h) => h.id === id)!;
    expect(by('toad').maxArmor).toBe(Math.max(...HEROES.map((h) => h.maxArmor)));
    expect(WEAPONS[by('toad').weapon].magazine).toBe(60);
    expect(by('ray').ability.radius).toBe(4);
    expect(by('tabsu').ability.seconds).toBe(1);
    expect(Math.round(by('tabsu').speed * 100)).toBe(110);
    expect(by('tonashiro').maxArmor).toBe(40);
    expect(TUNING.abilities.mendAmount).toBe(35);
    expect(TUNING.abilities.barrierSeconds).toBe(12);
    expect(by('bill').ability.seconds).toBe(3);
    expect(Math.round(((by('bill').ability.amount ?? 1) - 1) * 100)).toBe(20);
    expect(Math.round(by('bill').speed * 100)).toBe(108);
    expect(WEAPONS.sawnoff.damage * WEAPONS.sawnoff.pellets).toBeLessThan(BASE_HP.free);
  });
});

describe('every in-game docs section still renders', () => {
  it('has text for every section, touch and desktop', () => {
    for (const d of DOCS) for (const t of [false, true]) expect(strip(d.html(t)).trim().length, d.id).toBeGreaterThan(40);
  });
});
