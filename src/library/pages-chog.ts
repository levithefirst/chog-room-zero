// Operators and CHOG traits (superpowers). Numbers from src/config/{heroes,superpowers,power,tuning}.ts.
import { HEROES, WEAPONS, DEPARTMENTS, SUPERPOWERS, SUPERPOWER_IDS, RANKS, BEAM, ORB, GRENADES, BASE_HP, TUNING, abilityFacts, SPEED, TIER_DEFS } from './facts';
import type { Page, Section } from './types';
import { esc, n, table, facts, note, ul, link } from './html';
import { portraitSvg } from '../ui/art';

/** Hand-written play notes per operator: only what its numbers support. */
const PLAY: Record<string, { use: string; style: string; strong: string; weak: string }> = {
  benja: { use: 'Before you push a room or when a fight goes quiet: Ping shows who is close.', style: 'The all-rounder. Take mid-range fights and use Ping to choose them.', strong: 'Full speed, a balanced rifle, and the only operator that can reveal hostiles through walls.', weak: 'Only 15 armour, and hostiles hear the ping.' },
  toad: { use: 'Slip out of a losing angle, or close the gap to a corner you want to hold.', style: 'The tank. Hold a lane with the 60-round drum and soak hits with the highest armour.', strong: '55 armour, the biggest magazine.', weak: 'The slowest operator (92% speed), the longest reload (2.6 s) and a loose gun at range.' },
  ray: { use: 'When someone rushes you inside 4 m: Snare slows them so you can step back into your range.', style: 'The sniper. Watch long lanes with the narrowest, longest light and the heaviest gun.', strong: 'The longest sight (12 m) and the most damage per bullet (55).', weak: 'Slow to fire, a narrow cone, and 9 degrees of extra spread when running.' },
  tabsu: { use: 'At the moment you would take a burst: Shell makes you untouchable for 1 s (you cannot shoot).', style: 'The flanker. Fast with a wide view; fight close and on the move.', strong: 'The fastest operator (110% speed), an 85 degree cone, an SMG that is strong close.', weak: 'No armour at all, and the SMG falls apart at range.' },
  tonashiro: { use: 'Between fights, or behind cover mid-fight: Patch is +35 health.', style: 'The bruiser. Take corners and doors where the shotgun wins.', strong: '40 armour, a shotgun that wins inside about 4.5 m, self-healing.', weak: 'The shortest sight (7.5 m, shared with Bill), weak past 8 m, a five-shell magazine.' },
  yot: { use: 'When you are caught in the open: Slab drops waist-high cover in front of you for 12 s.', style: 'The assault with reach. Burst carbine fights at range from cover you bring.', strong: 'Accurate bursts with more reach than the rifle, portable cover.', weak: 'A missed burst costs the whole cycle; loses close fights to shotguns.' },
  bill: { use: 'As you turn a corner into someone: Rush adds 20% damage for 3 s.', style: 'The close-range flanker. Get inside 4 m and fire both shells.', strong: 'Two shells that win any fight inside about 4 m; fast (108% speed); the widest cone (90 degrees).', weak: 'Nothing past 6.5 m, a two-shell magazine, 10 armour.' },
};

const opSections: Section[] = HEROES.map((h) => {
  const w = WEAPONS[h.weapon], a = abilityFacts(h.ability), p = PLAY[h.id];
  return {
    id: h.id, title: h.name, keywords: [h.dept, DEPARTMENTS[h.dept], h.ability.name, w.name, 'operator', 'character', 'hero'],
    html: `<div class="op">
<div class="op-art" aria-hidden="true">${portraitSvg(h, `lib-${h.id}`)}</div>
<div class="op-body"><p class="kicker">${esc(DEPARTMENTS[h.dept])} &middot; ${esc(w.name)}</p>
${facts([['Health', `${h.maxHp}`], ['Armour', `${h.maxArmor}`], ['Speed', `${Math.round(h.speed * 100)}% (${n(SPEED.run * h.speed)} m/s)`], ['Sight', `${h.vision.coneDeg}&#176; cone, ${h.vision.range} m`]])}
<h3>Ability: ${esc(a.name)}</h3><p>${esc(a.text)}</p>${facts(a.numbers)}
<h3>When to use it</h3><p>${esc(p.use)}</p>
<h3>Playstyle</h3><p>${esc(p.style)}</p>
<div class="sw"><div><h4>Strengths</h4><p>${esc(p.strong)}</p></div><div><h4>Weaknesses and limits</h4><p>${esc(p.weak)}</p></div></div>
</div></div>`,
  };
});

const rankRow = (id: (typeof SUPERPOWER_IDS)[number]) => {
  const sp = SUPERPOWERS[id];
  const cols: [string, (r: (typeof sp.ranks)['common']) => string][] = [['Cooldown', (r) => (r.cooldown ? `${r.cooldown} s` : 'always on')]];
  if (id === 'laser' || id === 'xray') cols.push(['Charge', (r) => `${r.charge} s`], ['Beam', (r) => `${r.seconds} s`], ['Length', (r) => `${r.range} m`], ['Damage/s', (r) => `${r.dps}`]);
  if (id === 'visor') cols.push(['Radius', (r) => `${r.range} m`]);
  if (id === 'bubble') cols.push(['Caged', (r) => `${r.seconds} s`], ['Flies', (r) => `${r.range} m`]);
  if (id === 'drool') cols.push(['Glued', (r) => `${r.seconds} s`], ['Flies', (r) => `${r.range} m`], ['Drag to wall', (r) => `${r.area} m`]);
  if (id === 'aura') cols.push(['Untouchable', (r) => `${r.seconds} s`]);
  return table(['Rank', ...cols.map((c) => c[0])], RANKS.map((rk) => [TIER_DEFS[rk].label === '1:1' ? 'Legendary' : TIER_DEFS[rk].label, ...cols.map((c) => c[1](sp.ranks[rk]))]), `${sp.name} by rank`);
};

const spSections: Section[] = SUPERPOWER_IDS.map((id) => {
  const sp = SUPERPOWERS[id];
  const extra = id === 'laser' || id === 'xray' ? `While the beam fires you turn at ${BEAM.turnDegPerSec}&#176;/s and move at ${Math.round(BEAM.moveMul * 100)}% speed; ${Math.round(BEAM.armorPen * 100)}% of beam damage ignores armour.` : id === 'bubble' || id === 'drool' ? `The ${id === 'bubble' ? 'bubble' : 'glob'} flies at ${ORB.speed[id]} m/s.` : '';
  return {
    id: `power-${id}`, title: sp.name, keywords: ['superpower', 'chog trait', 'trait', 'power', sp.trait, sp.role],
    html: `<p class="kicker">${esc(sp.role)} &middot; trait: ${esc(sp.trait)}</p><p>${esc(sp.text)} ${extra}</p>${facts([['What others see and hear', esc(sp.telegraph)], ['How to beat it', esc(sp.counter)]])}${rankRow(id)}`,
  };
});

export const chogTraits: Page = {
  slug: 'chog-traits', title: 'Operators and CHOG traits', group: 'Know',
  summary: 'Seven operators with one ability each, and the six superpowers a verified Chog\'s traits can carry.',
  keywords: ['chog trait', 'traits', 'nft', 'superpower', 'operators', 'characters', 'heroes', 'roster'],
  sections: [
    { id: 'roster', title: 'The roster', html: `<p>Seven free operators in five departments. Every operator and every free player starts at ${BASE_HP.free} health; departments differ by armour, speed, sight, weapon and ability. Hostile bots and your AI teammates use the same operators.</p>${table(['Operator', 'Department', 'Weapon', 'Armour', 'Speed', 'Ability', 'Cooldown'], HEROES.map((h) => [link('chog-traits', esc(h.name), h.id), esc(DEPARTMENTS[h.dept]), esc(WEAPONS[h.weapon].name), h.maxArmor, `${Math.round(h.speed * 100)}%`, esc(h.ability.name), `${h.ability.cooldown} s`]), 'Operators')}` },
    ...opSections,
    { id: 'chog-traits', title: 'CHOG traits and superpowers', keywords: ['chog trait', 'nft', 'holder', 'verified', 'demo', 'cosmetic'], html: `${ul([
      'A verified Chog whose real traits carry a power plays that superpower in the operator\'s single ability slot. It replaces the ability; it is never a second one.',
      'Its tier sets the power\'s rank (Common to Epic for collection Chogs). Tier never adds health, armour or damage.',
      `A verified Chog with no mapped power plays at ${BASE_HP.chog} health instead (no other edge). Grenade capacity rises by tier: ${GRENADES.free} free, ${GRENADES.common} / ${GRENADES.uncommon} / ${GRENADES.rare} / ${GRENADES.epic} / ${GRENADES.legendary} from Common up.`,
      'The ten 1:1 Chogs keep their own named signatures instead of a superpower.',
      'Every other trait is cosmetic: it does not change how you play.',
    ])}${note('Ownership is checked on the server, never in the browser. A labelled DEMO token can try the powers in Training and demo rooms; demo play earns nothing. This library does not show or verify anyone\'s Chog.', 'rule')}` },
    ...spSections,
    { id: 'training', title: 'CHOG Training', keywords: ['training', 'drill', 'practice power'], html: `<p>Training has one drill per superpower, for a verified Chog that carries it or a DEMO token: scripted dummies in a small room, the real rules and the power's real rank numbers. Only the cooldown is shortened so a drill gives enough tries, and the screen says so. Training earns nothing and records nothing. X-Ray Eyes and the Legendary rank exist only in DEMO and Training.</p>` },
  ],
  related: ['weapons', 'combat', 'game-modes'],
};

export const ROSTER_TUNING = TUNING;
