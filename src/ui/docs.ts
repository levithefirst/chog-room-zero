// GP Game Docs (owner 2026-10-17: "users should not need GitHub"): how Room Zero works, in the game, from the same
// numbers the game runs on (TUNING, the medal and upgrade tables), so a doc line can never drift from the rule it
// describes. One searchable list of short sections; each opens in place (details/summary: keyboard and screen reader
// friendly, no script needed to read it). Pure: tests/gp-docs.test.ts.
import { TUNING } from '../config/tuning';
import { allKeys, mainKey, moveKeys } from '../input/bindings';
import { BASE_HP, GRENADES, UPGRADES, UPGRADE_IDS } from '../config/power';
import { MAPS, MAP_IDS } from '../config/maps';
import { PRACTICE_REWARDS, PRACTICE_SHARDS_PER_DAY, REWARDS } from '../config/progression';
import { MEDALS } from './medals';
import { HEROES } from '../config/heroes';
import { THREAT_RANGE } from './downed';
import { PERKS, PERK_IDS } from '../config/perks';
import { CHALLENGE_REWARDS } from '../config/challenges';
import { RANKS, SUPERPOWERS, SUPERPOWER_IDS, rankLine } from '../config/superpowers';
import { DRILLS } from '../sim/training';
import { esc } from './screens';

export interface DocSection { id: string; title: string; html: (touch: boolean) => string }

const P = TUNING.pickups, R = TUNING.revive, L = TUNING.loot, Z = TUNING.zone;
const li = (items: string[]) => `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const rarityCount = (r: string) => MEDALS.filter((m) => m.rarity === r).length;
/** Hostile bots in a default (Vs bots) room: every location has the same count. */
const BOTS = Math.min(...MAP_IDS.map((id) => MAPS[id].botSpawns.length));
const SNARE = HEROES.find((h) => h.ability.kind === 'scream')!.ability;

export const DOCS: DocSection[] = [
  { id: 'how-to-play', title: 'How to Play', html: () => `<p>Room Zero is a dark, top-down room where every bullet travels and every wall blocks sight and shots.
In the default game it is <b>you and 2 AI teammates against ${BOTS} hostiles</b>. Your side wins when all of them are down. You lose when you are out.</p>
${li([`Everyone has ${BASE_HP.free} health and up to ${TUNING.combat.armorCap} armour (a verified Chog without a mapped superpower: ${BASE_HP.chog} health).`,
    `About ${Z.safeSeconds} s in, a danger zone starts closing. Outside it you lose health every second, and the HUD says <b>Outside zone</b>. Its stages warn for ${Z.stages.map((s) => s.warn).join(' / ')} s and close over ${Z.stages.map((s) => s.shrink).join(' / ')} s (every interval 20% longer than before 2026-10-18).`,
    'Light is information: you only see what your lamp and the room let you see. Sound tells you the rest.',
    'Pickups and fallen hostiles\' kit keep you going. Your teammates use them too.'])}` },
  { id: 'combat', title: 'Combat', html: () => li([
    'Bullets are real projectiles: they fly, they can be dodged, and walls stop them. Low crates stop shots unless you stand right behind one and fire over it.',
    `Armour takes ${Math.round(TUNING.combat.armorSoak * 100)}% of each hit until it runs out (armour-piercing guns take less); the rest comes off your health.`,
    'Moving loosens your aim. Standing still tightens it, and a quick turn makes it loose for a moment.',
    `Your body turns at a set speed. A new shot waits until you face within ${TUNING.combat.fireMaxLagDeg}° of where you aim, so a flick behind you fires that way, a moment later, never the wrong way.`,
    'Damage falls off with distance; every gun has its own range, spread and reload.',
    `Grenades: ${GRENADES.free} for free players (more by verified Chog tier, up to ${GRENADES.legendary}). They roll, bounce off walls, fly over low cover, and explode on a fuse; a wall between you and the blast blocks it.`,
    `Getting hit nudges you, it never stops you. Only two things slow you: a Snare (to ${Math.round((SNARE.amount ?? 1) * 100)}% speed for ${SNARE.seconds} s, shown under your health) and being downed (a crawl).`,
  ]) },
  { id: 'movement', title: 'Movement', html: (t) => li([
    'Movement has weight: a short run-up, a quick stop, faster reversals.',
    `Creep to move quietly at ${Math.round(TUNING.movement.quietSpeedScale * 100)}% speed (${t ? 'a half push on the left stick' : `hold ${allKeys('creep')}`}).`,
    'Stand still for a moment and you are steady: tight aim, a longer lamp, silent feet.',
    'Brush a crate corner and you slide round it instead of sticking.',
  ]) },
  { id: 'vision', title: 'Vision & Information', html: () => li([
    'Your lamp is a cone of light that walls really cut. Right next to you, you always see.',
    `Some locations have lit areas (a bright store floor, a platform, floodlights): a body standing in one is seen from up to ${TUNING.vision.litRange} m by anyone facing it with a clear line. The dark hides you; the light gives you away. Room Zero is all dark.`,
    'Heard marks show noises you heard, not saw: footprints (steps), a burst (a shot), two dots (a reload). A tick around you means it came through a wall.',
    'A red dotted ring is where a hostile you lost could be by now. It grows as they could have moved and fades as you forget.',
    'AI teammates call what they see and hear ("Contact, north", "Lost him", "Behind us!"), and when they come to get you up.',
    'In the game view nobody sees through walls, including the bots: every bot decision comes from what it saw, heard or was told. The tactical map is the one exception: while it is open it shows every living hostile on the whole map.',
    'Top right, the feed lists the last knock-outs and downs (✸ for a grenade) for a few seconds. Online it never says where they happened.',
  ]) },
  { id: 'sound', title: 'Sound', html: () => li([
    `Footsteps carry about ${TUNING.sound.quietStep} m creeping and ${TUNING.sound.runStep} m running; standing still is silent.`,
    `The floor changes it: carpet muffles steps to ${Math.round(TUNING.sound.surface.carpet * 100)}%, a deck, a stair or a service tunnel carries them to ${Math.round(TUNING.sound.surface.deck * 100)}%.`,
    'Shots are heard far away, and a muzzle flash gives a shooter away to anyone with a clear line to it.',
    'Walls muffle sound: through a wall you hear less far and only roughly where.',
    'Reloading, pickups, revives and grenades all make noise. So does a downed player.',
  ]) },
  { id: 'squads', title: 'Squads', html: () => li([
    'Create a squad on the hub and share its 5-character code (letters and digits); friends join with it. The leader queues for the squad.',
    'Up to 5 in a squad. Everyone plays on the same side.',
    'In the default game your two AI teammates are your squad: they cover the arcs you are not watching, revive you and take what they need.',
    `When you are below ${Math.round(TUNING.bots.guard.hpBelow * 100)}% health and one of them knows of a threat near you, the nearest stands between you and where it thinks the threat is (your HUD says who is covering you). It guards against what it heard or saw, never where the hostile really is.`,
  ]) },
  { id: 'revives', title: 'Revives', html: () => li([
    `At 0 health with a teammate still standing you are <b>downed</b>, not out. You have <b>${R.bleedSeconds} seconds</b>. The card at the top counts down, names the teammate coming for you and how far they are (else your nearest one), and warns of a hostile you know is within ${THREAT_RANGE} m.`,
    `A teammate within ${R.range} m who holds fire gets you up in ${R.seconds} s, back at ${Math.round(R.hpShare * 100)}% health. While they do, your countdown waits.`,
    'A hit on either of you, the rescuer firing, or the rescuer stepping away stops the revive; it starts again from zero.',
    'Downed you can only crawl: no shooting, reloading, abilities, grenades or pickups. Hostiles can finish you.',
    'When the countdown ends you are eliminated from this match (BLED OUT, never signed out); the run goes on to its result. In 1v1, or as the last one standing, 0 health is out at once.',
    'To revive someone: stand next to them and stop shooting. AI teammates go when it is safe and they can make it in time.',
  ]) },
  { id: 'enemies', title: 'Enemy Teams', html: () => li([
    `The ${BOTS} hostiles play as a squad: they patrol, search the rooms they have not checked, hold angles, regroup, and go for pickups when they need them.`,
    'When one of them sees you, it tells the others where it saw you (a moment later). They come to that spot, never straight to where you are now.',
    'They use cover, break line of sight, investigate sounds and back off when hurt. They never get to shoot you from further than you can see.',
    'They walk their jobs, so you can hear them coming.',
    `Every bot, hostile or teammate, deals ${Math.round(TUNING.bots.damageMul * 100)}% of a weapon's damage (bullets and grenades). Real players online deal full damage.`,
    'Hit by someone you could not see (behind you, or online a longer sight than yours): the red arc points at them, shows how far they are ("9 m"), and their muzzle flash rings them for a moment.',
  ]) },
  { id: 'pickups', title: 'Pickups', html: () => li([
    `Health +${P.health.amount}, armour +${P.armor.amount}, ammo: two magazines, a grenade. Each is back ${P.health.respawn} s after it is taken, on another spot of its area, never next to anyone.`,
    'Walk over one to take it: no button. If you are full, it stays for someone else, and the HUD says FULL.',
    `At full health a health pickup still adds up to +${Math.round(P.overhealShare * 100)}% (overheal); armour can go ${P.overArmor} over. The extra stays until damage takes it.`,
    'Each pickup comes back somewhere else in its area, so the safe routes and the contested middle both pay.',
  ]) },
  { id: 'loot', title: 'Enemy Loot', html: () => li([
    `Anyone who is eliminated drops a bag of what they carried: their ammo, their grenades, the armour left on them, and a field dressing (+${L.dressing} health).`,
    `The bag lies where they fell for ${L.seconds} s (its ring runs down). Walk over it: you take what you can use, the rest stays for your teammates.`,
    'Ammo converts to your own gun, magazine for magazine. Nothing is ever made up: a bag holds only what the fallen had, including its perk (see Perks).',
    'Your AI teammates go for a bag when they need what is in it and it is safe; online, the server decides every take.',
  ]) },
  { id: 'perks', title: 'Perks', html: () => `<p>A perk is a one-slot edge you carry for this match only. It never changes health, armour, damage or speed, and it works for any operator.</p>
${li([...PERK_IDS.map((k) => `<b>${PERKS[k].name}</b>: ${PERKS[k].text}`),
    'Who has one: in the default game every hostile carries one; online every player starts with one (fixed by the match, shown under your health). You and your AI teammates start without one.',
    'Kill the carrier and its perk is in the bag (the label names it). An empty slot takes it on touch.',
    `Already carrying one? Stand still on the bag for ${TUNING.perks.swapSeconds} s to swap: yours goes into the bag. Standing still in the open is the price.`,
    'AI teammates take a perk when their slot is empty, and never swap one they have.',
  ])}` },
  { id: 'superpowers', title: 'CHOG Superpowers', html: () => `<p>A verified Chog whose real traits carry one of these gets it in its one ability slot, in place of the operator's ability. Its rarity is the power's rank: rarer lasts longer, reaches further or comes back sooner. It never adds health, armour or weapon damage. Free players keep everything else: the same maps, weapons, pickups, upgrades and matches, at ${BASE_HP.free} health.</p>
<p>A verified Chog that carries none of these traits (the ten 1:1s among them) plays its operator's ability (a 1:1 its signature) and has the CHOG baseline: <b>${BASE_HP.chog} health</b> instead of ${BASE_HP.free}. That is the only CHOG health rule, and it does not depend on rarity.</p>
<table class="howto"><tr><th>Power</th><th>From the trait</th><th>Counter</th></tr>${SUPERPOWER_IDS.map((id) => { const d = SUPERPOWERS[id]; return `<tr><td><b>${esc(d.name)}</b> (${d.role})<br><small>${esc(d.text)}</small></td><td>${esc(d.trait)}</td><td>${esc(d.counter)}</td></tr>`; }).join('')}</table>
<p>By rank (Common to Legendary):</p>${li(SUPERPOWER_IDS.map((id) => `<b>${esc(SUPERPOWERS[id].name)}</b>: ${RANKS.map((r) => esc(rankLine(id, r))).join(' · ')}`))}
${li([
    'Your enemy can read it: the match intro names each opponent\'s power, and a coloured diamond by their health bar shows it (red Laser, violet X-Ray, pink Bubble, green Drool, gold Aura). Nothing about a player you cannot see is shown.',
    `<b>Visor</b> (Visor Eyes) is information: always on, it puts every hostile within its radius (${SUPERPOWERS.visor.ranks.common.range} m at Common) on a small map under your health, through walls. It never shows their body, health or what they carry, and it does no damage. A hostile on your tracker sees TRACKED under its health.`,
    '<b>X-Ray</b> is an attack: a beam that crosses walls after a long charge. It shows you nothing behind the wall, and its target sees the violet line cross them. No collection trait carries X-Ray yet: it is in DEMO and Training only.',
    'Visor tells you where; X-Ray hits through the wall. They are different powers from different traits.',
    'A Chog with several power traits picks one on the Class panel. A Chog with none plays its operator\'s ability.',
    `CHOG Training (the TRAINING button on YOUR CHOG, for a verified Chog with a power; or DEMO, labelled): one drill per power (${SUPERPOWER_IDS.map((id) => `${esc(SUPERPOWERS[id].name)}: ${esc(DRILLS[id].name)}, ${DRILLS[id].seconds} s`).join('; ')}), its real numbers with a shorter cooldown. Training earns and records nothing.`,
  ])}` },
  { id: 'locations', title: 'Locations', html: () => `<p>Pick one of the ${MAP_IDS.length} locations on the hub before you press Play (on a phone: the LOCATION button), for the default game and for 1v1, 3v3 and 5v5. Every location is open to everyone; online you only meet players who picked the same one. Each one fights differently:</p>
${li(MAP_IDS.map((id) => `<b>${esc(MAPS[id].name)}</b> (${esc(MAPS[id].tag)}): ${esc(MAPS[id].blurb)}`))}
${li([
    'Rails (railings, track edges, open window frames): you see and shoot across them, you cannot walk through them.',
    'Decks (scaffolding, the slab): high ground. A shot fired from a deck clears the crates and barriers below it, and a deck has no cover of its own but its columns.',
    `Stairs: the only way onto a deck, at ${Math.round(TUNING.movement.stairsMul * 100)}% speed, and loud. Hold the top, or get caught on them.`,
  ])}` },
  { id: 'medals', title: 'Medals', html: () => `<p>${MEDALS.length} medals: ${rarityCount('common')} common, ${rarityCount('uncommon')} uncommon, ${rarityCount('rare')} rare, ${rarityCount('epic')} epic.
Commons come from playing; rare and epic ones need runs most players rarely have (a clear in under 25 seconds, a last stand, a run without a scratch).</p>
${li(['Signed in, medals are awarded and kept on your account (any device). As a guest they last for the session.', 'Online medals come from matches the server saved, never from the browser.',
    'Pin up to three on your player card.'])}` },
  { id: 'upgrades', title: 'Upgrades', html: () => `<p>Shards buy upgrade ranks. Free players and Chog holders buy the same upgrades at the same prices; nothing is sold.</p>
${li(UPGRADE_IDS.map((id) => `<b>${esc(UPGRADES[id].name)}</b>: ${esc(UPGRADES[id].text)}, ${UPGRADES[id].ranks} ranks, first rank ${UPGRADES[id].costs[0]} shards.`))}` },
  { id: 'rewards', title: 'Rewards', html: () => li([
    `Daily: three challenges a day (the same for everyone, new at 00:00 UTC), easy, medium and hard, paying ${CHALLENGE_REWARDS[1].shards}, ${CHALLENGE_REWARDS[2].shards} and ${CHALLENGE_REWARDS[3].shards} shards once each. They count your verified solo runs and online matches of the day (the hub card shows how far you are). Nothing carries over and nothing is lost if you skip a day.`,
    `Online match: ${REWARDS.shardsPlay} shards and ${REWARDS.xpPlay} XP for a completed match, ${REWARDS.shardsPerKill} shards and ${REWARDS.xpPerKill} XP per kill (up to ${REWARDS.maxKills} kills), ${REWARDS.shardsWin} shards and ${REWARDS.xpWin} XP for a win, and 1 shard per ${REWARDS.damagePerShard} damage dealt (up to ${REWARDS.damageShardsMax}). Up to ${REWARDS.dailyCap} paid matches a day; a match under ${REWARDS.minSeconds} s pays nothing.`,
    `Solo (signed in): ${PRACTICE_REWARDS.shardsPlay} shards and ${PRACTICE_REWARDS.xpPlay} XP a run, ${PRACTICE_REWARDS.shardsPerKill} shards and ${PRACTICE_REWARDS.xpPerKill} XP per kill (up to ${PRACTICE_REWARDS.maxKills}), ${PRACTICE_REWARDS.shardsWin} shards and ${PRACTICE_REWARDS.xpWin} XP for a clear, 1 shard per ${PRACTICE_REWARDS.damagePerShard} damage (up to ${PRACTICE_REWARDS.damageShardsMax}); up to ${PRACTICE_REWARDS.dailyCap} paid runs and ${PRACTICE_SHARDS_PER_DAY.toLocaleString('en-US')} practice shards a day.`,
    'A loss where you fought still moves you forward. Quitting, private rooms and demo play pay nothing.',
    'The results screen shows every line, your new totals and the upgrades your shards already cover.',
  ]) },
  { id: 'chog', title: 'CHOG', html: () => li([
    'You never need a wallet or an NFT to play solo, 1v1 or 3v3.',
    'A verified Chog Genesis holder gets the superpower its Chog\'s real traits carry, in place of the operator\'s ability (see CHOG Superpowers). Rarity is the power\'s rank. No Chog changes health, armour or weapon damage.',
    'The ten 1:1 Chogs have their own signature ability instead. Ownership is checked on the server, on Monad, every time.',
    '5v5 is for verified holders only. Your Chog keeps its own match history, separate from your account.',
    'There is nothing to buy: Chog power cannot be bought in the game, and $CHOG plays no part in a match.',
  ]) },
  { id: 'matchmaking', title: 'Matchmaking', html: () => li([
    'Online, the game server runs the match: movement, shots, damage, pickups, loot and revives are decided there.',
    'You are matched by rating. A Chog adds no health, armour or damage, so its tier does not change who you meet.',
    'A private code (squad) plays who you invite. Private rooms pay nothing and move no rating.',
    'Lost connection? You have a short time to come back to the same match; your operator stands still meanwhile.',
  ]) },
  { id: 'leaderboards', title: 'Leaderboards', html: () => li([
    '<b>Solo</b>: kills in your checked solo runs (signed in, timed by the server, capped). Then clears, then fewer runs.',
    '<b>Online</b>: kills in saved online matches. Then wins, then fewer matches.',
    'Your own rank is always shown at the top, however far down you are.',
    'Rather not be listed? Switch "Shown to others" off on the leaderboard. You still see your own rank.',
  ]) },
  { id: 'controls', title: 'Controls', html: (t) => `<table class="howto">${t
    ? '<tr><td>Move</td><td>Left thumb (half push: creep)</td></tr><tr><td>Aim and fire</td><td>Right thumb; push past the ring to fire, back inside to stop</td></tr><tr><td>Ability</td><td>Ability button</td></tr><tr><td>Grenade</td><td>Grenade button (drag it to aim the throw)</td></tr><tr><td>Reload</td><td>Reload button</td></tr><tr><td>Tactical map</td><td>MAP button under your health; RETURN closes it. Pinch to zoom, drag to pan</td></tr>'
    : `<tr><td>Move</td><td>${esc(moveKeys())} (${esc(allKeys('creep'))}: creep)</td></tr><tr><td>Aim</td><td>Mouse</td></tr><tr><td>Fire</td><td>${esc(allKeys('fire'))}</td></tr><tr><td>Ability</td><td>${esc(allKeys('ability'))}</td></tr><tr><td>Grenade</td><td>${esc(allKeys('grenade'))}: hold the key and release, or click: lands at the cursor</td></tr><tr><td>Reload</td><td>${esc(allKeys('reload'))}</td></tr><tr><td>Tactical map</td><td>${esc(allKeys('map'))} or the MAP button (${esc(mainKey('map'))}, Esc or RETURN closes it). Wheel to zoom, drag to pan</td></tr><tr><td>Pause</td><td>${esc(allKeys('pause'))}</td></tr><tr><td>Change keys</td><td>Settings, Controls</td></tr>`}</table>` },
  { id: 'modes', title: 'Game Modes', html: () => li([
    `<b>Vs bots</b>: you and 2 AI teammates against ${BOTS} hostiles. No sign-in needed.`,
    '<b>1v1</b> and <b>3v3</b>: online against people, open to everyone.',
    '<b>5v5</b>: online, verified Chog holders only (every player on both sides).',
    `Seven free operators (${HEROES.map((h) => esc(h.name)).join(', ')}), each with one ability.`,
  ]) },
  { id: 'faq', title: 'FAQ', html: () => `<dl class="faq">
<dt>Why did I slow down?</dt><dd>A Snare (the status under your health says so, for 2 s) or you were downed (the card at the top). A hit alone never slows you.</dd>
<dt>Why is my health going down?</dt><dd>You are outside the danger zone (the HUD says Outside zone and the screen edge pulses red), or you are downed and bleeding out. Nothing else takes health without a hit.</dd>
<dt>Why didn't my shot fire straight away?</dt><dd>You turned a long way: the shot waits until your body faces where you aim (a fraction of a second), so it goes where you meant.</dd>
<dt>Why can't I move?</dt><dd>A Bubble caged you or Drool glued you to a wall (the status under your health says which and for how long). You can still aim and shoot.</dd>
<dt>What does the tactical map show?</dt><dd>The whole location as it is played: walls, doors, cover, rails, decks and stairs, the named areas, stocked supplies and the danger zone. You and your side always, and every living hostile on the whole map at its current spot while the map is open, seen or not. A "last known" circle still marks where you lost one, and Visor marks still show if you hold the Visor. The game view itself still hides hostiles behind walls. The match keeps running while it is open, and your operator stands still.</dd>
<dt>Can I play without a wallet?</dt><dd>Yes: solo, 1v1 and 3v3 never need one.</dd>
<dt>Where is my rank?</dt><dd>Leaderboard, at the top: sign in and finish a run (Solo) or a match (Online).</dd>
<dt>Do I lose my progress as a guest?</dt><dd>A guest's runs last for the session. Sign in (Google or wallet) to keep XP, shards, upgrades, medals and your rank.</dd>
<dt>What match stats does the game send?</dt><dd>At the end of a match, one anonymous record: mode, operator, how long, how you went out, shots and hits, revives, loot, trigger-to-shot time, and your device type (touch or mouse, screen size, browser family). No name, account, wallet or IP. It is tied to a random id kept in this browser so the totals can count players. Switch it off in Settings (Share match stats).</dd>
</dl>` },
];

/** The Game Docs screen: a search box and every section (one opened, if asked). */
export function docsHtml(touch: boolean, open: string | null, topbar: string): string {
  const items = DOCS.map((d) => `<details class="doc" id="doc-${d.id}" data-doc="${d.id}"${d.id === open ? ' open' : ''}><summary>${esc(d.title)}</summary><div class="doc-body">${d.html(touch)}</div></details>`).join('');
  return `<div class="screen docs">${topbar}<div class="scroll-body"><section class="hub-card wide">
<input id="docsq" class="field small" type="search" placeholder="Search the docs" aria-label="Search the docs" autocomplete="off" spellcheck="false" />
<p class="note small" id="docsnone" hidden>Nothing matches.</p><div class="docs-list">${items}</div>
<p class="note small docs-lib"><a id="docslib" href="/library/" target="_blank" rel="noopener">Open the full game library</a>: maps, operators, weapons and medals, with search.</p></section></div></div>`;
}

/** Live filter: sections whose title or text contain every word of the query (case-insensitive). Returns how many. */
export function filterDocs(root: ParentNode, q: string): number {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  root.querySelectorAll<HTMLDetailsElement>('details.doc').forEach((d) => {
    const text = (d.textContent ?? '').toLowerCase();
    const ok = words.every((w) => text.includes(w));
    d.hidden = !ok;
    if (ok) shown++;
    if (words.length && ok) d.open = true;
  });
  return shown;
}
