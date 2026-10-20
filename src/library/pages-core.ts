// Library pages: home, start here, how to play, combat, movement & sound, weapons. Every number is read from facts.ts.
import { TUNING, WEAPONS, HEROES, MAPS, MAP_IDS, SPEED, BASE_HP, GRENADES, weaponFacts, soloHostiles, mitigate } from './facts';
import type { Page } from './types';
import { esc, n, table, facts, ul, link, href, shot, figure } from './html';
import { coneSvg, soundSvg, soundBarsSvg, coverSvg, falloffSvg, zoneSvg } from './diagrams';
import { mapSvg } from './mapdata';

const T = TUNING, S = T.sound, P = T.pickups, Rv = T.revive, G = T.grenade, Z = T.zone;
const zoneTotal = Z.safeSeconds + Z.stages.reduce((a, s) => a + s.warn + s.shrink, 0);
const benja = HEROES[0];

export const home: Page = {
  slug: '', title: 'The Official Game Library', group: 'Start',
  summary: 'Everything you need to play Chog: Room Zero: rules, maps, operators and progression, written from the game itself.',
  lead: `<section class="hero" aria-labelledby="hero-h">
<p class="kicker">CHOG: ROOM ZERO</p>
<h1 id="hero-h">THE OFFICIAL<br>GAME LIBRARY</h1>
<p class="sub">A dark, top-down tactical shooter where what you see, what you hear and what you give away decide the fight. Every rule and number on these pages is read from the game's own code.</p>
<div class="cta"><a class="btn primary" href="/">PLAY ROOM ZERO</a><a class="btn" href="${href('start-here')}">START HERE</a><a class="btn" href="${href('maps')}">EXPLORE THE MAPS</a></div>
${shot('hud-desktop', 'A solo match on Office, straight from the game.', true).replace('class="shot"', 'class="shot hero-shot"')}
</section>`,
  sections: [
    { id: 'explore', title: 'Explore the library', html: `<div class="cards">
${[
    ['start-here', 'Start here', 'Ten short sections, about five minutes, everything a first room needs.', shotOr('hud-desktop', 'room-zero')],
    ['maps', 'Maps', 'Five locations, each a map guide you can zoom, pan and layer.', mini('office')],
    ['chog-traits', 'Operators and CHOG traits', 'Seven operators, one ability each, and the six superpowers.', shotOr('deploy', 'supermarket')],
    ['combat', 'Combat', 'Health, armour, cover, revives, grenades and the danger zone.', shotOr('armour-break', 'metro')],
    ['movement-sound', 'Movement and sound', 'Information is a resource: every step you take can be heard.', shotOr('sound-rings', 'construction')],
    ['medals', 'Medals', 'All 40 medals, searchable and filterable by rarity.', shotOr('victory', 'room-zero')],
  ].map(([s, t, d, img]) => `<a class="card" href="${href(s)}">${img}<span class="card-t">${t}</span><span class="card-d">${d}</span></a>`).join('')}
</div>` },
    { id: 'new', title: 'New to Room Zero?', keywords: ['what is room zero', 'what is this game', 'how do i start', 'where do i find the answer', 'where do i learn more', 'beginner', 'new player'], html: `<div class="qa">
<div><h3>What is it?</h3><p>A top-down tactical shooter played in short rooms. By default you and two AI teammates enter a dark location against ${soloHostiles('room-zero')} hostile bots. Your side wins when every hostile is down. Online, it is 1v1, 3v3 or 5v5 against other players, and the last side standing wins.</p></div>
<div><h3>Why is it different?</h3><p>You only see what your light and a clear line show you. Walls block sight and bullets. Every step, shot and reload makes a sound that carries a set distance, and the other side hears it too. Bullets travel; they are not instant. Winning is about information as much as aim.</p></div>
<div><h3>How do I start?</h3><p>Press <a href="/">PLAY ROOM ZERO</a> above (it opens the game), pick an operator, choose <b>Vs bots</b> and press Play. On a PC: WASD to move, the mouse to aim, hold the left button to fire. On a phone, hold it sideways: left thumb moves, right thumb aims and fires.</p></div>
<div><h3>Where do I learn more?</h3><p>${link('start-here', 'Start here')} covers a first room in five minutes. ${link('how-to-play', 'How to play')} explains a whole match. ${link('controls', 'Controls')} lists every key and touch button. Press <kbd>/</kbd> to search.</p></div>
</div>` },
  ],
  related: ['start-here', 'how-to-play', 'maps'],
};

function mini(id: (typeof MAP_IDS)[number]): string { return `<span class="card-img map-mini" aria-hidden="true">${mapSvg(id, { mini: true, idPrefix: `card-${id}` })}</span>`; }
function shotOr(name: string, id: (typeof MAP_IDS)[number]): string {
  const s = shot(name, '');
  if (!s) return mini(id);
  return `<span class="card-img">${s.replace(/<figcaption>[\s\S]*<\/figcaption>/, '').replace(/<svg class="callouts"[\s\S]*?<\/svg>/, '').replace('<figure class="shot">', '').replace('</figure>', '')}</span>`;
}

export const startHere: Page = {
  slug: 'start-here', title: 'Start here', group: 'Start',
  summary: 'Your first room in about five minutes: ten short sections.',
  sections: [
    { id: 'goal', title: '1. The goal', keywords: ['how do i win', 'win', 'objective'], html: `<p>In the default game (<b>Vs bots</b>) you and two AI teammates face ${soloHostiles('room-zero')} hostile bots. <b>Your side wins when every hostile is down.</b> You lose if you are eliminated, and the danger zone can eliminate you too. Online, the last side standing wins.</p>` },
    { id: 'operator', title: '2. Pick an operator', html: `<p>Seven operators, each with one weapon and one ability. All of them start at ${BASE_HP.free} health; they differ in armour, speed, sight and weapon. ${benja.name} (${WEAPONS[benja.weapon].name}, ${benja.ability.name}) is the all-rounder. See ${link('chog-traits', 'Operators and CHOG traits')}.</p>` },
    { id: 'move', title: '3. Move', html: `<p>WASD on a PC, the left thumb on touch. Running is ${SPEED.run} m/s for the standard operator. Hold <kbd>Shift</kbd> (or push the stick less than ${Math.round(T.movement.quietStickThreshold * 100)}% of the way) to creep at ${Math.round(SPEED.creepShare * 100)}% speed: much quieter.</p>` },
    { id: 'aim', title: '4. Aim and fire', keywords: ['shoot', 'fire'], html: `<p>Aim with the mouse and hold the left button to fire. On touch, the right thumb aims; it fires once you push past ${Math.round(0.35 * 100)}% of the stick, so a small push only turns you. Bullets travel and can be dodged. Standing still tightens your aim; running loosens it.</p>` },
    { id: 'light', title: '5. Your light is your sight', keywords: ['vision', 'see', 'cone'], html: `<p>You see inside your light cone, along a clear line, and anything within ${T.vision.nearRadius} m of you. Walls block sight. Crates and barriers do not. A muzzle flash shows the shooter to anyone with a clear line, at any range, for ${T.perception.flashSeconds} s.</p>` },
    { id: 'sound', title: '6. Sound gives you away', keywords: ['footsteps', 'noise', 'hear'], html: `<p>Running footsteps carry ${S.runStep} m, creeping ${S.quietStep} m, and standing still makes none. A shot carries ${S.shot} m. Hostiles hear the same rules you do. Sounds you hear show as marks; through a wall you only get a direction.</p>` },
    { id: 'cover', title: '7. Use cover', html: `<p>Crates and barriers are half cover: they stop bullets but not sight. Standing within ${T.combat.coverLean} m of one lets you shoot over it. Walls stop everything.</p>` },
    { id: 'supplies', title: '8. Health, armour and supplies', keywords: ['armor', 'armour', 'health', 'pickup', 'ammo'], html: `<p>Armour soaks ${Math.round(T.combat.armorSoak * 100)}% of each hit until it runs out. Walk over supplies to take them: health +${P.health.amount}, armour +${P.armor.amount}, ammo two magazines, grenades +${P.grenade.amount}. Each one is back ${P.health.respawn} s after it is taken, somewhere else in its area.</p>` },
    { id: 'downed', title: '9. Downed, not out', keywords: ['revive', 'downed'], html: `<p>With a teammate still standing, reaching 0 health downs you instead. You crawl, cannot shoot, and bleed out over ${Rv.bleedSeconds} s. A teammate who stands next to you (${Rv.range} m) without firing revives you in ${Rv.seconds} s.</p>` },
    { id: 'zone', title: '10. Watch the danger zone', keywords: ['zone', 'circle', 'storm'], html: `<p>After ${Z.safeSeconds} s a circle starts to close in three stages. Outside it you take damage that grows from ${Z.stages[0].dps} to ${Z.finalDps} a second. The next circle is shown a few seconds before it closes: move when it appears.</p>` },
    { id: 'next', title: 'Next steps', html: ul([link('how-to-play', 'How to play: a whole match, step by step'), link('controls', 'Controls: every key and touch button'), link('maps', 'Maps: learn a location before you play it')]) },
  ],
  related: ['how-to-play', 'controls', 'combat'],
};

export const howToPlay: Page = {
  slug: 'how-to-play', title: 'How to play', group: 'Play',
  summary: 'A whole match from the hub to the results screen.',
  sections: [
    { id: 'hub', title: 'The hub', keywords: ['start my first match', 'start a match', 'first match', 'begin', 'play button'], html: `<p>The hub is where you pick your operator, the mode and the location. <b>Vs bots</b> works without signing in. 1v1 and 3v3 are online; 5v5 is for verified Chog holders. The location is a preference: see ${link('multiplayer', 'Multiplayer')} for how online matching uses it.</p>` },
    { id: 'deploy', title: 'Deploy', html: `<p>The loading screen is a briefing: the location, the objective, your operator's ability and its cooldown, and a tip.</p>${shot('deploy', 'The deploy briefing: map, objective, ability and class.')}` },
    { id: 'win', title: 'How to win', keywords: ['how do i win', 'win condition', 'victory', 'objective'], html: `${facts([['Vs bots', `Down all ${soloHostiles('room-zero')} hostiles. Your AI teammates' downs count for your side.`], ['Online', 'The last side with anyone standing wins.'], ['Time limit online', `${240} s; then the side with more health standing wins (the zone normally ends it first).`], ['Lose', 'You are eliminated (shot, bled out, or caught by the zone).']])}` },
    { id: 'hud', title: 'Reading the HUD', keywords: ['hud', 'health bar', 'ammo'], html: `<p>Top left: health (ticks every 25), armour, your operator and mode. Top middle: hostiles left and the zone timer. Bottom: weapon and ammo, ability (with its cooldown seconds) and grenades. The MAP button under the vitals opens the full-screen tactical map.</p>${shot('hud-desktop', 'The desktop HUD (captured at 1600 by 900), with numbered callouts measured from the HUD elements of the game.')}` },
    { id: 'states', title: 'HUD warnings', keywords: ['low health', 'armour break', 'reload', 'empty'], html: `<p>The HUD changes when something needs you: low health is spelled out and pulses, the armour bar marks the moment it breaks, and the weapon panel warns when ammo is low or out and while you reload.</p>${shot('low-health', 'Low health: the bar turns red and says so.')}${shot('armour-break', 'Armour break: the armour bar empties and flashes.')}${shot('reload', 'Reloading: the weapon panel shows the reload.')}${shot('ability-cd', 'Ability used: the button counts down its cooldown, and Ping\'s sonar ring spreads out.')}` },
    { id: 'tactical-map', title: 'The tactical map', keywords: ['map', 'minimap', 'tactical map', 'm key'], html: `<p>Press <kbd>M</kbd> or the MAP button for a full-screen map of the location in play. It shows the layout, area names, the zone and stocked supplies, you and your side, and hostiles only while you actually have them (seen, last known, or Visor dots). It never shows anyone you could not know about. Your operator stops while it is open.</p>${shot('tactical-map', 'The tactical map (M) over a live match.')}` },
    { id: 'end', title: 'End of a room', html: `<p>A defeat shows a short recap of how you went down, then the results. The results list what the run paid in XP and shards, line by line, and any medals earned.</p>${shot('victory', 'Victory: the results screen with the run summary.')}${shot('death', 'Defeat: the recap after going down.')}` },
  ],
  related: ['start-here', 'combat', 'game-modes'],
};

const armorEx = mitigate(55, 18, 0.2);
export const combat: Page = {
  slug: 'combat', title: 'Combat', group: 'Know',
  summary: 'Health, armour, damage, cover, revives, grenades, supplies and the danger zone.',
  sections: [
    { id: 'health', title: 'Health and armour', keywords: ['armor', 'armour', 'health', 'hp', 'shield'], html: `${facts([
      ['Health', `${BASE_HP.free} for every operator; ${BASE_HP.chog} for a verified Chog with no mapped superpower`],
      ['Armour', `Each operator starts with its own (0 to 55); capacity ${T.combat.armorCap}`],
      ['Armour soak', `${Math.round(T.combat.armorSoak * 100)}% of each hit, less the weapon's armour pen, until the armour is gone`],
      ['Overheal', `Health pickups can take you to +${Math.round(P.overhealShare * 100)}% over your maximum; armour to ${P.overArmor} over its cap. The extra does not drain.`],
    ])}<p>Example: an auto-rifle bullet (18 damage, 20% armour pen) on 55 armour takes ${n(armorEx.armor)} armour and ${n(armorEx.hp)} health.</p>` },
    { id: 'damage', title: 'Damage and range', keywords: ['falloff', 'range', 'damage'], html: `<p>Bullets travel at a set speed and live for a set time, so long shots arrive late and can be dodged. Damage falls off with distance, down to a floor for each weapon. Hostile bots deal ${Math.round(T.bots.damageMul * 100)}% damage.</p>${figure(falloffSvg(), 'Damage per bullet or pellet against distance, from each weapon\'s numbers.')}<p>${link('weapons', 'All weapon numbers')}.</p>` },
    { id: 'accuracy', title: 'Steady aim', keywords: ['spread', 'accuracy', 'moving'], html: `<p>Below ${SPEED.steadySpeed} m/s for ${SPEED.steadySeconds} s you are <b>steady</b>: your gun is tight, your light reaches further and your feet are silent. Running adds spread (each weapon has its own amount). Turning hard also adds spread: firing waits until your body is within ${T.combat.fireMaxLagDeg}&#176; of where you aim.</p>` },
    { id: 'cover', title: 'Cover and line of sight', keywords: ['cover', 'crate', 'los', 'line of sight', 'wall'], html: `${figure(coverSvg(), `Sight passes over a crate; bullets stop on it unless you stand within ${T.combat.coverLean} m and shoot over.`)}${ul([
      '<b>Walls</b> block movement, sight, bullets and grenade blasts.',
      `<b>Crates and barriers</b> (half cover) block movement and bullets, never sight. A shooter within ${T.combat.coverLean} m of one shoots over it. A crate between you and a grenade halves the blast.`,
      '<b>Rails</b> (railings, track edges) block movement only: sight, bullets and grenades pass.',
      '<b>Decks</b> are raised floor: a shot fired from a deck clears every crate and barrier below. <b>Stairs</b> are the only way up and slow you to ' + Math.round(SPEED.stairsShare * 100) + '% speed.',
      'No weapon shoots through cover or walls.',
    ])}` },
    { id: 'revive', title: 'Downed and revive', keywords: ['revive', 'downed', 'bleed out', 'rescue', 'teammate'], html: `${facts([
      ['When', 'At 0 health while a teammate still stands (Vs bots with your AI squad; online 3v3 and 5v5)'],
      ['Downed', `A ${Rv.downHp}-point pool that bleeds out over ${Rv.bleedSeconds} s; hits drain it faster`],
      ['While downed', `Crawl at ${Math.round(Rv.crawl * 100)}% speed; no shooting, reloading, ability or pickups`],
      ['Revive', `A standing teammate within ${Rv.range} m who is not firing, for ${Rv.seconds} s; you get up at ${Math.round(Rv.hpShare * 100)}% health with no armour`],
      ['Interrupted by', 'Any hit on either of you, the rescuer firing, or stepping away (progress restarts)'],
      ['No revive', '1v1, and the last player standing on a side: 0 health eliminates at once'],
    ])}<p>The bleed-out pauses while someone is reviving. AI teammates come to revive you when nothing they can see is close and they have time to reach you.</p>` },
    { id: 'grenades', title: 'Grenades', keywords: ['grenade', 'nade', 'throw'], html: `${facts([
      ['Carried', `${GRENADES.free} for everyone; a verified Chog carries more by tier (${GRENADES.common} to ${GRENADES.legendary})`],
      ['Throw', `${G.minThrow} to ${G.maxThrow} m (PC: to the cursor; touch: ${G.touchThrow} m along your aim, or drag the button to aim)`],
      ['Fuse', `${G.fuseSeconds} s`], ['Blast', `${G.damage} at the centre to ${G.edgeDamage} at the ${G.radius} m edge; ${Math.round(G.armorPen * 100)}% ignores armour`],
      ['Cover', 'A crate or slab in between halves it; a wall blocks it. It is lobbed over crates and bounces off walls.'],
      ['Between throws', `${G.throwCooldown} s`], ['Sound', `Throw ${G.throwSound} m, bounce ${G.bounceSound} m, blast ${G.boomSound} m`],
    ])}` },
    { id: 'supplies', title: 'Supplies and kill loot', keywords: ['pickup', 'supplies', 'ammo', 'loot', 'health pack'], html: `${table(['Supply', 'Gives', 'Back after'], [
      ['Health', `+${P.health.amount} health`, `${P.health.respawn} s`], ['Armour', `+${P.armor.amount} armour`, `${P.armor.respawn} s`],
      ['Ammo', `${P.ammo.mags} magazines into reserve`, `${P.ammo.respawn} s`], ['Grenade', `+${P.grenade.amount} (up to your capacity)`, `${P.grenade.respawn} s`],
    ], 'Supplies')}${ul([
      'Taken on touch, no button. A health or armour pickup is only taken if it would add at least ' + P.minGain + '.',
      'Each comes back on another tile of its area, never next to someone standing. Online, the server decides when one is there.',
      `A downed hostile drops a bag of what it carried plus a +${T.loot.dressing} health dressing, for ${T.loot.seconds} s.`,
    ])}` },
    { id: 'zone', title: 'The danger zone', keywords: ['zone', 'circle', 'storm', 'gas'], html: `${figure(zoneSvg(), 'The danger-zone schedule, from the game\'s zone settings.')}${table(['Stage', 'Shown for', 'Closes over', 'Circle radius', 'Damage outside'], Z.stages.map((s, i) => [`${i + 1}`, `${s.warn} s`, `${s.shrink} s`, `${s.radius} m`, `${s.dps} a second`]), 'Zone stages')}<p>Open play lasts ${Z.safeSeconds} s. The last circle is reached about ${Math.round(zoneTotal)} s in; outside it you take ${Z.finalDps} a second. Each location has its own possible final centres (shown in its ${link('maps', 'map guide')}).</p>` },
    { id: 'bots', title: 'Hostile bots', keywords: ['ai', 'bots', 'enemies'], html: ul([
      `React ${T.perception.reactionMin} to ${T.perception.reactionMax} s after they see you, and miss first: their aim settles over ${T.bots.aimSettleSeconds} s.`,
      `Deal ${Math.round(T.bots.damageMul * 100)}% damage. At most ${T.perception.attackTokens} shoot at you at once; the rest flank or hold.`,
      `Hear and see by the same rules as you. Being shot tells them a direction, not your spot.`,
      `Each carries ${G.botCount} grenade. Below half health they break line of sight, reposition or go for health.`,
    ]) },
  ],
  related: ['weapons', 'movement-sound', 'chog-traits'],
};

const hz = HEROES.map((h) => [esc(h.name), `${h.vision.coneDeg}&#176;`, `${h.vision.range} m`, `${n(h.vision.range * (1 + T.vision.focusRange))} m`, `${n(SPEED.run * h.speed)} m/s`]);
export const movementSound: Page = {
  slug: 'movement-sound', title: 'Movement and sound', group: 'Know',
  summary: 'Information is a resource: what you see, what you hear and what you give away.',
  sections: [
    { id: 'info', title: 'Information is a resource', html: `<p>Everyone plays by the same perception rules, bots included. You learn where hostiles are by seeing them, hearing them, or being told by a teammate, and every piece of that information fades. Moving quietly, holding still and choosing when to shoot decide what the other side learns about you.</p>` },
    { id: 'speed', title: 'Moving', keywords: ['creep', 'walk', 'run', 'sprint', 'speed', 'stairs'], html: `${facts([
      ['Run', `${SPEED.run} m/s for a standard operator (each operator scales it)`], ['Creep', `Hold Shift (touch: push the stick under ${Math.round(T.movement.quietStickThreshold * 100)}%): ${Math.round(SPEED.creepShare * 100)}% speed`],
      ['Steady', `Under ${SPEED.steadySpeed} m/s for ${SPEED.steadySeconds} s: tight aim, longer light, silent feet`], ['Stairs', `${Math.round(SPEED.stairsShare * 100)}% speed`],
      ['Turning', `Your body turns toward your aim at ${T.movement.turnRateDegPerSec}&#176;/s`],
    ])}` },
    { id: 'footsteps', title: 'Footsteps', keywords: ['footsteps', 'steps', 'noise', 'quiet', 'creep'], html: `${figure(soundSvg(), 'Footstep radii to scale.')}<p>Floors matter: carpet carries a run only ${Math.round(S.surface.carpet * 100)}% as far (${n(S.runStep * S.surface.carpet)} m), while decks, stairs and Metro service tunnels ring to ${Math.round(S.surface.deck * 100)}% (${n(S.runStep * S.surface.deck)} m). A wall in between shrinks any sound to ${Math.round(S.wallFactor * 100)}% of its radius.</p>${shot('sound-rings', 'Sound marks in play: heard footsteps and your own noise ring.')}` },
    { id: 'sounds', title: 'Every sound', keywords: ['gunshot', 'reload sound', 'hearing'], html: `${figure(soundBarsSvg(), 'How far each sound carries in the open.')}` },
    { id: 'vision', title: 'Vision and your light', keywords: ['vision', 'cone', 'fov', 'lamp', 'sight', 'lit'], html: `${figure(coneSvg(benja), `${benja.name}'s light cone: walking, steady and running, to scale.`)}${table(['Operator', 'Cone', 'Range', 'Steady range', 'Run speed'], hz, 'Sight and speed by operator')}${ul([
      `Anything within ${T.vision.nearRadius} m is always seen.`, `Lit areas: someone standing in one is seen from up to ${T.vision.litRange} m by anyone facing them with a clear line.`,
      `A muzzle flash with a clear line reveals the shooter for ${T.perception.flashSeconds} s, at any range.`, 'Walls block sight; crates, barriers and rails do not.'])}` },
    { id: 'marks', title: 'Marks, rings and last known', keywords: ['marks', 'ring', 'last known', 'heard', 'spotted'], html: ul([
      'A heard sound with a clear line leaves a mark near its source; the louder and sharper the sound, the closer the guess.',
      `Through a wall you get a direction only: a tick on a ring around you (within about ${T.intel.dirErrDeg}&#176;).`,
      `When a hostile leaves your sight its outline stays as LAST KNOWN, and a red dotted ring grows at ${T.intel.spreadSpeed} m/s to show where it could be now. A sighting fades over ${T.intel.lastKnownSeconds} s.`,
      'A teammate\'s sighting shows as a SPOTTED mark at roughly the place they saw it.',
      `Your own noise shows as a ring that expands to its true radius: what you just gave away.`,
    ]) },
    { id: 'ping', title: 'Ping (Benja)', keywords: ['ping', 'sonar', 'reveal'], html: `<p>Ping is ${benja.name}'s ability, not a chat or map marker. It reveals hostiles within ${T.abilities.sonarRadius} m for ${T.abilities.sonarSeconds} s, and the ping itself can be heard ${T.abilities.sonarSound} m away. Cooldown ${benja.ability.cooldown} s.</p>` },
    { id: 'callouts', title: 'AI teammate call-outs', keywords: ['callouts', 'comms', 'teammates talk'], html: `<p>Your AI teammates call out only what they perceive themselves (contacts, footsteps, shots, reloading, being hurt, coming to revive you), one voice at a time. A teammate who hears a call turns to cover that way.</p>` },
  ],
  related: ['combat', 'controls', 'maps'],
};

const wrows = Object.values(WEAPONS).map((w) => { const f = weaponFacts(w); const user = HEROES.filter((h) => h.weapon === w.id).map((h) => h.name).join(', ');
  return [esc(w.name), esc(user), `${w.damage}${w.pellets > 1 ? ` x ${w.pellets}` : ''}${w.burst ? ` x ${w.burst}-round burst` : ''}`, `${w.falloffStart} to ${w.falloffEnd} m (to ${Math.round(w.minDamageMul * 100)}%)`, `${w.fireInterval} s`, `${w.magazine} / ${w.reserve}`, `${w.reloadSeconds} s`, `${Math.round(w.armorPen * 100)}%`, `${w.spreadDeg}&#176; (+${w.moveSpreadDeg}&#176; running)`, `${n(w.bulletSpeed * w.bulletLife)} m`, `${f.pullsToDown}`]; });
export const weapons: Page = {
  slug: 'weapons', title: 'Weapons', group: 'Know',
  summary: 'Seven weapons, one per operator, with every number from the game.',
  sections: [
    { id: 'table', title: 'All weapons', keywords: ['guns', 'stats', 'dps', 'magazine', 'reload'], html: `${table(['Weapon', 'Operator', 'Damage', 'Falloff', 'Fire interval', 'Mag / reserve', 'Reload', 'Armour pen', 'Spread', 'Reach', 'Pulls to down*'], wrows, 'Weapon numbers', 'wide')}<p class="small">* Trigger pulls to down a ${BASE_HP.free}-health operator with no armour at close range, every pellet hitting: derived from the numbers, not measured play. Reach = bullet speed x bullet life. Spread is either side of your aim.</p>` },
    { id: 'falloff', title: 'Damage over distance', html: figure(falloffSvg(), 'Every weapon\'s damage curve.') },
    { id: 'reload', title: 'Reloading', keywords: ['reload', 'ammo', 'empty', 'magazine'], html: `<p>Press <kbd>R</kbd> (or the RELOAD button on touch) any time. Reloading makes a sound that carries ${S.reload} m, and the weapon panel warns when the magazine is low or empty and while you reload. Ammo pickups add ${P.ammo.mags} magazines to your reserve.</p>` },
    ...Object.values(WEAPONS).map((w) => ({ id: w.id, title: w.name, keywords: [w.id], html: `${facts([['Damage', `${w.damage}${w.pellets > 1 ? ` per pellet, ${w.pellets} pellets` : ''}${w.burst ? `, ${w.burst}-round bursts ${w.burstGap} s apart` : ''}`], ['Full damage to', `${w.falloffStart} m; ${n(w.damage * w.minDamageMul)} from ${w.falloffEnd} m`], ['Magazine', `${w.magazine} (reserve ${w.reserve}), reload ${w.reloadSeconds} s`], ['Armour pen', `${Math.round(w.armorPen * 100)}%`]])}<p>${esc(weaponLine(w.id))}</p>` })),
  ],
  related: ['combat', 'chog-traits', 'movement-sound'],
};

function weaponLine(id: string): string {
  return ({
    rifle: 'The honest middle: accurate in bursts and fine at most ranges.',
    shotgun: 'Eight pellets that win the fight inside about 4.5 m and fade past 8 m. Rewards corners and doors.',
    marksman: 'Slow and heavy with the longest reach. Punishes anyone who peeks a long lane; crates and slabs still stop it.',
    smg: 'Fast and loose: strong close and on the move, weak at range.',
    carbine: 'Three accurate rounds per pull and more reach than the rifle, but a missed burst costs the whole cycle.',
    lmg: 'A 60-round drum that holds a lane, loose at range, with the longest reload to bait.',
    sawnoff: 'Two shells that win inside about 4 m and do nothing past 6.5 m. One shell never downs a full-health operator; the second is the kill.',
  } as Record<string, string>)[id] ?? '';
}

export const CORE = [home, startHere, howToPlay, combat, movementSound, weapons];
export { MAPS };
