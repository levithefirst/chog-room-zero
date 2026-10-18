// GP Game Docs (owner 2026-10-17: "users should not need GitHub"): how Room Zero works, in the game, from the same
// numbers the game runs on (TUNING, the medal and upgrade tables), so a doc line can never drift from the rule it
// describes. One searchable list of short sections; each opens in place (details/summary: keyboard and screen reader
// friendly, no script needed to read it). Pure: tests/gp-docs.test.ts.
import { TUNING } from '../config/tuning';
import { GRENADES, UPGRADES, UPGRADE_IDS } from '../config/power';
import { PRACTICE_REWARDS, REWARDS } from '../config/progression';
import { MEDALS } from './medals';
import { HEROES } from '../config/heroes';
import { esc } from './screens';

export interface DocSection { id: string; title: string; html: (touch: boolean) => string }

const P = TUNING.pickups, R = TUNING.revive, L = TUNING.loot, Z = TUNING.zone;
const li = (items: string[]) => `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const rarityCount = (r: string) => MEDALS.filter((m) => m.rarity === r).length;

export const DOCS: DocSection[] = [
  { id: 'how-to-play', title: 'How to Play', html: () => `<p>Room Zero is a dark, top-down room where every bullet travels and every wall blocks sight and shots.
In the default game it is <b>you and 2 AI teammates against 5 hostiles</b>. Your side wins when all five are down. You lose when you are out.</p>
${li([`About ${Z.safeSeconds} s in, a danger zone starts closing. Outside it you lose health every second, and the HUD says <b>Outside zone</b>.`,
    'Light is information: you only see what your lamp and the room let you see. Sound tells you the rest.',
    'Pickups and fallen hostiles\' kit keep you going. Your teammates use them too.'])}` },
  { id: 'combat', title: 'Combat', html: () => li([
    'Bullets are real projectiles: they fly, they can be dodged, and walls stop them. Low crates stop shots unless you stand right behind one and fire over it.',
    `Armour takes ${Math.round(TUNING.combat.armorSoak * 100)}% of each hit until it runs out (armour-piercing guns take less); the rest comes off your health.`,
    'Moving loosens your aim. Standing still tightens it, and a quick turn makes it loose for a moment.',
    `Your body turns at a set speed. A new shot waits until you face within ${TUNING.combat.fireMaxLagDeg}° of where you aim, so a flick behind you fires that way, a moment later, never the wrong way.`,
    'Damage falls off with distance; every gun has its own range, spread and reload.',
    `Grenades: ${GRENADES.free} for free players (more by verified Chog tier, up to ${GRENADES.legendary}). They roll, bounce off walls, fly over low cover, and explode on a fuse; a wall between you and the blast blocks it.`,
    'Getting hit nudges you, it never stops you. Only two things slow you: a Snare (60% for 2 s, shown under your health) and being downed (a crawl).',
  ]) },
  { id: 'movement', title: 'Movement', html: (t) => li([
    'Movement has weight: a short run-up, a quick stop, faster reversals.',
    `Creep to move quietly at ${Math.round(TUNING.movement.quietSpeedScale * 100)}% speed (${t ? 'a half push on the left stick' : 'hold Shift'}).`,
    'Stand still for a moment and you are steady: tight aim, a longer lamp, silent feet.',
    'Brush a crate corner and you slide round it instead of sticking.',
  ]) },
  { id: 'vision', title: 'Vision & Information', html: () => li([
    'Your lamp is a cone of light that walls really cut. Right next to you, you always see.',
    'Heard marks show noises you heard, not saw: footprints (steps), a burst (a shot), two dots (a reload). A tick around you means it came through a wall.',
    'A red dotted ring is where a hostile you lost could be by now. It grows as they could have moved and fades as you forget.',
    'AI teammates call what they see and hear ("Contact, north", "Lost him", "Behind us!"), and when they come to get you up.',
    'Nobody sees through walls, including the bots: every bot decision comes from what it saw, heard or was told.',
  ]) },
  { id: 'sound', title: 'Sound', html: () => li([
    `Footsteps carry about ${TUNING.sound.quietStep} m creeping and ${TUNING.sound.runStep} m running; standing still is silent.`,
    'Shots are heard far away, and a muzzle flash gives a shooter away to anyone with a clear line to it.',
    'Walls muffle sound: through a wall you hear less far and only roughly where.',
    'Reloading, pickups, revives and grenades all make noise. So does a downed player.',
  ]) },
  { id: 'squads', title: 'Squads', html: () => li([
    'Create a squad on the hub and share its 5-letter code; friends join with it. The leader queues for the squad.',
    'Up to 5 in a squad. Everyone plays on the same side.',
    'In the default game your two AI teammates are your squad: they cover the arcs you are not watching, revive you and take what they need.',
  ]) },
  { id: 'revives', title: 'Revives', html: () => li([
    `At 0 health with a teammate still standing you are <b>downed</b>, not out. You have <b>${R.bleedSeconds} seconds</b> (the card at the top counts down).`,
    `A teammate within ${R.range} m who holds fire gets you up in ${R.seconds} s, back at ${Math.round(R.hpShare * 100)}% health. While they do, your countdown waits.`,
    'A hit on either of you, the rescuer firing, or the rescuer stepping away stops the revive; it starts again from zero.',
    'Downed you can only crawl: no shooting, reloading, abilities, grenades or pickups. Hostiles can finish you.',
    'When the countdown ends you are eliminated from this match (never signed out). In 1v1, or as the last one standing, 0 health is out at once.',
    'To revive someone: stand next to them and stop shooting. AI teammates go when it is safe and they can make it in time.',
  ]) },
  { id: 'enemies', title: 'Enemy Teams', html: () => li([
    'The five hostiles play as a squad: they patrol, search the rooms they have not checked, hold angles, regroup, and go for pickups when they need them.',
    'When one of them sees you, it tells the others where it saw you (a moment later). They come to that spot, never straight to where you are now.',
    'They use cover, break line of sight, investigate sounds and back off when hurt. They never get to shoot you from further than you can see.',
    'They walk their jobs, so you can hear them coming.',
    `Every bot, hostile or teammate, deals ${Math.round(TUNING.bots.damageMul * 100)}% of a weapon's damage (bullets and grenades). Real players online deal full damage.`,
    'Hit by someone you could not see (behind you, or online a longer sight than yours): the red arc points at them, shows how far they are ("9 m"), and their muzzle flash rings them for a moment.',
  ]) },
  { id: 'pickups', title: 'Pickups', html: () => li([
    `Health +${P.health.amount} (back after ${P.health.respawn} s), armour +${P.armor.amount} (${P.armor.respawn} s), ammo: two magazines (${P.ammo.respawn} s), a grenade (${P.grenade.respawn} s).`,
    'Walk over one to take it: no button. If you are full, it stays for someone else, and the HUD says FULL.',
    `At full health a health pickup still adds up to +${Math.round(P.overhealShare * 100)}% (overheal); armour can go ${P.overArmor} over. The extra stays until damage takes it.`,
    'Each pickup comes back somewhere else in its area, so the safe routes and the contested middle both pay.',
  ]) },
  { id: 'loot', title: 'Enemy Loot', html: () => li([
    `Anyone who is eliminated drops a bag of what they carried: their ammo, their grenades, the armour left on them, and a field dressing (+${L.dressing} health).`,
    `The bag lies where they fell for ${L.seconds} s (its ring runs down). Walk over it: you take what you can use, the rest stays for your teammates.`,
    'Ammo converts to your own gun, magazine for magazine. Nothing is ever made up: a bag holds only what the fallen had.',
    'Your AI teammates go for a bag when they need what is in it and it is safe; online, the server decides every take.',
  ]) },
  { id: 'medals', title: 'Medals', html: () => `<p>${MEDALS.length} medals: ${rarityCount('common')} common, ${rarityCount('uncommon')} uncommon, ${rarityCount('rare')} rare, ${rarityCount('epic')} epic.
Commons come from playing; rare and epic ones need runs most players rarely have (a clear in under 30 seconds, a last stand, a run without a scratch).</p>
${li(['Signed in, medals are awarded and kept on your account (any device). As a guest they last for the session.', 'Online medals come from matches the server saved, never from the browser.',
    'Pin up to three on your player card.'])}` },
  { id: 'upgrades', title: 'Upgrades', html: () => `<p>Shards buy upgrade ranks. Upgrades raise your free profile towards the lower Chog tiers; nothing is sold.</p>
${li(UPGRADE_IDS.map((id) => `<b>${esc(UPGRADES[id].name)}</b>: ${esc(UPGRADES[id].text)}, ${UPGRADES[id].ranks} ranks, first rank ${UPGRADES[id].costs[0]} shards.`))}` },
  { id: 'rewards', title: 'Rewards', html: () => li([
    `Online match: ${REWARDS.xpPlay} XP and ${REWARDS.shardsPlay} shards for playing, more for kills and damage, ${REWARDS.xpWin} XP and ${REWARDS.shardsWin} shards for a win.`,
    `Solo (signed in): ${PRACTICE_REWARDS.xpPlay} XP and ${PRACTICE_REWARDS.shardsPlay} shards a run, kills and damage pay a little, a clear pays most; up to ${PRACTICE_REWARDS.dailyCap} paid runs a day.`,
    'A loss where you fought still moves you forward. Quitting, private rooms and demo play pay nothing.',
    'The results screen shows every line, your new totals and the upgrades your shards already cover.',
  ]) },
  { id: 'chog', title: 'CHOG', html: () => li([
    'You never need a wallet or an NFT to play solo, 1v1 or 3v3.',
    'Verified Chog Genesis holders start stronger by their Chog\'s rarity, and the ten 1:1 Chogs have their own signature ability. Ownership is checked on the server, on Monad, every time.',
    '5v5 is for verified holders only. Your Chog keeps its own match history, separate from your account.',
    'There is nothing to buy: Chog power cannot be bought in the game, and $CHOG plays no part in a match.',
  ]) },
  { id: 'matchmaking', title: 'Matchmaking', html: () => li([
    'Online, the game server runs the match: movement, shots, damage, pickups, loot and revives are decided there.',
    'You are matched by rating, and a Chog tier counts at its measured strength, so the sides stay even.',
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
    ? '<tr><td>Move</td><td>Left thumb (half push: creep)</td></tr><tr><td>Aim and fire</td><td>Right thumb; push past the ring to fire, back inside to stop</td></tr><tr><td>Ability</td><td>Ability button</td></tr><tr><td>Grenade</td><td>Grenade button (drag it to aim the throw)</td></tr><tr><td>Reload</td><td>Reload button</td></tr>'
    : '<tr><td>Move</td><td>WASD (Shift: creep)</td></tr><tr><td>Aim</td><td>Mouse</td></tr><tr><td>Fire</td><td>Left click</td></tr><tr><td>Ability</td><td>Space</td></tr><tr><td>Grenade</td><td>Hold G and release, or right click: lands at the cursor</td></tr><tr><td>Reload</td><td>R</td></tr><tr><td>Pause</td><td>Esc</td></tr>'}</table>` },
  { id: 'modes', title: 'Game Modes', html: () => li([
    '<b>Vs bots</b>: you and 2 AI teammates against 5 hostiles. No sign-in needed.',
    '<b>1v1</b> and <b>3v3</b>: online against people, open to everyone.',
    '<b>5v5</b>: online, verified Chog holders only (every player on both sides).',
    `Seven free operators (${HEROES.map((h) => esc(h.name)).join(', ')}), each with one ability.`,
  ]) },
  { id: 'faq', title: 'FAQ', html: () => `<dl class="faq">
<dt>Why did I slow down?</dt><dd>A Snare (the status under your health says so, for 2 s) or you were downed (the card at the top). A hit alone never slows you.</dd>
<dt>Why is my health going down?</dt><dd>You are outside the danger zone (the HUD says Outside zone and the screen edge pulses red), or you are downed and bleeding out. Nothing else takes health without a hit.</dd>
<dt>Why didn't my shot fire straight away?</dt><dd>You turned a long way: the shot waits until your body faces where you aim (a fraction of a second), so it goes where you meant.</dd>
<dt>Can I play without a wallet?</dt><dd>Yes: solo, 1v1 and 3v3 never need one.</dd>
<dt>Where is my rank?</dt><dd>Leaderboard, at the top: sign in and finish a run (Solo) or a match (Online).</dd>
<dt>Do I lose my progress as a guest?</dt><dd>A guest's runs last for the session. Sign in (Google or wallet) to keep XP, shards, upgrades, medals and your rank.</dd>
</dl>` },
];

/** The Game Docs screen: a search box and every section (one opened, if asked). */
export function docsHtml(touch: boolean, open: string | null, topbar: string): string {
  const items = DOCS.map((d) => `<details class="doc" id="doc-${d.id}" data-doc="${d.id}"${d.id === open ? ' open' : ''}><summary>${esc(d.title)}</summary><div class="doc-body">${d.html(touch)}</div></details>`).join('');
  return `<div class="screen docs">${topbar}<div class="scroll-body"><section class="hub-card wide">
<input id="docsq" class="field small" type="search" placeholder="Search the docs" aria-label="Search the docs" autocomplete="off" spellcheck="false" />
<p class="note small" id="docsnone" hidden>Nothing matches.</p><div class="docs-list">${items}</div></section></div></div>`;
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
