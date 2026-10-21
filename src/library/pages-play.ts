// Game modes, multiplayer, progression, rewards, medals, controls, FAQ. Numbers from facts.ts.
import { TUNING, MODES, SERVER, INPUT, REWARDS, PRACTICE_REWARDS, RATING, xpForNext, rewardBreakdown, UPGRADES, UPGRADE_IDS, MEDALS, PERKS, PERK_IDS, GRENADES, soloHostiles } from './facts';
import type { Page } from './types';
import { esc, n, table, facts, note, ul, ol, link, shot } from './html';
import { medalSvg, RARITY_LABEL } from '../ui/art';

const M = TUNING.match;

export const gameModes: Page = {
  slug: 'game-modes', title: 'Game modes', group: 'Play', summary: 'Vs bots, 1v1, 3v3 and 5v5, and CHOG Training.',
  keywords: ['modes', 'solo', 'pvp', 'online', '1v1', '3v3', '5v5'],
  sections: [
    { id: 'modes', title: 'All modes', html: table(['Mode', 'Who', 'Online', 'Needs'], MODES.map((m) => [esc(m.label), esc(m.players), m.online ? 'Yes' : 'No (plays in your browser)', m.holders ? 'Every player a verified Chog holder (server-enforced)' : m.online ? 'The game server to be reachable' : 'Nothing: works without signing in'])) },
    { id: 'solo', title: 'Vs bots (solo)', keywords: ['solo', 'bots', 'offline', 'practice', 'how do i win'], html: `<p>The default game: you and two AI teammates against ${soloHostiles('room-zero')} hostile bots in the location you picked. Your side wins when every hostile is down; you lose when you are eliminated. Your AI teammates are other roster operators from different departments, and the squad changes between rooms. Hostile bots each start with a perk.</p>${note('Signed in, a solo run pays practice rewards (smaller than online, capped per day). See ' + link('rewards', 'Rewards') + '.')}` },
    { id: '1v1', title: '1v1', keywords: ['duel', '1v1'], html: `<p>One player each side. There are no revives in 1v1: 0 health eliminates at once. The last side standing wins.</p>` },
    { id: '3v3', title: '3v3', keywords: ['3v3', 'team'], html: `<p>Three players each side. A downed player can be revived by a teammate. Squads of friends can queue together (see ${link('multiplayer', 'Multiplayer')}).</p>` },
    { id: '5v5', title: '5v5 (holders only)', keywords: ['5v5', 'holders', 'nft', 'verified'], html: `<p>Five each side, for verified Chog holders only. The server checks it for every player in the room, and for every member of a squad that queues. A labelled DEMO token only plays in demo rooms and earns nothing.</p>${note('The library does not verify anyone. Holder status is decided on the game server when you queue.', 'rule')}` },
    { id: 'end', title: 'How a match ends', keywords: ['how do i win', 'time limit'], html: facts([['Vs bots', 'All hostiles down (win) or you eliminated (loss)'], ['Online', 'The last side with someone standing'], ['Online time limit', `${SERVER.matchLimitSec} s, then the side with more health standing wins; the danger zone normally ends it first`]]) },
    { id: 'training', title: 'CHOG Training', html: `<p>One drill per superpower, for a Chog that carries it (or DEMO). See ${link('chog-traits', 'CHOG Training', 'training')}.</p>` },
    { id: 'perks', title: 'Perks', keywords: ['perk', 'soft soles', 'keen ears', 'field kit', 'marker'], html: `${table(['Perk', 'Effect'], PERK_IDS.map((id) => [esc(PERKS[id].name), esc(PERKS[id].text)]), 'Perks')}<p>Who starts with one: solo hostile bots, and every player online (fixed by the match). A perk can also be found in a fallen player's bag: stand on it for ${TUNING.perks.swapSeconds} s to swap.</p>` },
  ],
  related: ['multiplayer', 'how-to-play', 'rewards'],
};

export const multiplayer: Page = {
  slug: 'multiplayer', title: 'Multiplayer', group: 'Play', summary: 'Matchmaking, squads and codes, reconnecting, and what leaving costs.',
  keywords: ['online', 'pvp', 'matchmaking', 'queue', 'party', 'friends'],
  sections: [
    { id: 'queue', title: 'Matchmaking', keywords: ['matchmaking', 'queue', 'rating', 'mmr'], html: `${ul([
      `Like meets like: players within ${M.band} rating points at first, widening by ${M.widenPerSec} points for every second the longest waiter has queued.`,
      `Your chosen location is tried first. After ${M.anyMapAfterSec} s you can also meet players who picked another location, on the location of whoever waited longest.`,
      `New accounts (fewer than ${M.newMatches} saved online matches) count no higher than the start rating, so a first match is not against a veteran.`,
      `If nobody is found in ${SERVER.queueTimeoutSec} s the queue gives up and the game offers Vs bots instead.`,
      `A ${SERVER.countdownSec} s countdown starts the match, so every player has the map and roster.`,
    ])}` },
    { id: 'squads', title: 'Squads and squad codes', keywords: ['squad', 'party', 'code', 'friends', 'invite', 'play with friends'], html: `${ul([
      `Create a squad to get a ${SERVER.squadCodeLength}-character code; friends join with it. Codes use letters and digits that cannot be confused (no 0, O, 1 or I).`,
      `A squad holds up to ${SERVER.squadMax}. You cannot join a squad that is in a queue or a match.`,
      'For 5v5 every squad member needs a verified Chog.',
      'A private room code plays who you invite: it ignores rating and pays no rewards.',
    ])}` },
    { id: 'reconnect', title: 'Disconnects and reconnecting', keywords: ['disconnect', 'reconnect', 'lag', 'drop', 'quit'], html: `${ul([
      `If your connection drops mid-match, your operator stays in the match (standing idle) for ${SERVER.reconnectGraceSec} s while the game reconnects you.`,
      `The game keeps trying for ${SERVER.clientRetrySec} s. If it cannot, it says so: "Could not reconnect. The match went on without you."`,
      `A connection that sends nothing for ${SERVER.idleTimeoutSec} s is closed.`,
      'Leaving while still standing counts as a quit: the match pays no rewards.',
    ])}` },
    { id: 'netcode', title: 'Fair play', keywords: ['server', 'authoritative', 'cheat', 'wallhack'], html: `<p>Online matches run on the game server; for the game view it sends each player only what that player may know (hostiles they can see, teammates' spots, their own Visor dots), so the game view and HUD never show a hostile through walls. The tactical map is the one exception: it also gets every living hostile's position. The server sends ${60 / SERVER.snapEvery} updates a second.</p>` },
  ],
  related: ['game-modes', 'progression', 'rewards'],
};

const xpRows = Array.from({ length: 6 }, (_, i) => [`${i + 1} to ${i + 2}`, `${xpForNext(i + 1)} XP`]);
export const progression: Page = {
  slug: 'progression', title: 'Progression', group: 'Account', summary: 'XP and levels, shards and upgrades, and rating.',
  keywords: ['level', 'xp', 'shards', 'upgrades', 'rank', 'rating', 'unlock'],
  sections: [
    { id: 'account', title: 'Your account', html: `<p>Progression lives on your account: sign in to keep it. As a guest you can play Vs bots; your medals last for the session. Ownership of a Chog never moves XP or currency.</p>` },
    { id: 'levels', title: 'XP and levels', keywords: ['xp', 'level'], html: `<p>Each level needs 50 XP more than the last: ${xpForNext(1)} XP from level 1 to 2, then ${xpForNext(2)}, ${xpForNext(3)} and so on, up to level 99.</p>${table(['Level', 'XP needed'], xpRows, 'XP per level')}` },
    { id: 'upgrades', title: 'Shards and upgrades', keywords: ['shards', 'upgrades', 'currency', 'buy'], html: `<p>Shards are earned by playing and spent on upgrades. The same upgrades are open to every player; nothing is sold for money.</p>${table(['Upgrade', 'Effect', 'Ranks', 'Cost per rank (shards)'], UPGRADE_IDS.map((id) => [esc(UPGRADES[id].name), esc(UPGRADES[id].text), UPGRADES[id].ranks, UPGRADES[id].costs.join(', ')]), 'Upgrades')}` },
    { id: 'rating', title: 'Rating', keywords: ['rating', 'elo', 'mmr', 'ranked'], html: `<p>Online matches of at least ${REWARDS.minSeconds} s outside private rooms move your rating, also after the daily reward cap (a quit counts as a loss): it starts at ${RATING.start} and changes Elo-style (K = ${RATING.k}) on your side's average against the other side's. A Chog tier counts as slightly stronger when the change is worked out (${Object.entries(RATING.tierOffset).filter(([, v]) => v).map(([k, v]) => `${k === 'legendary' ? '1:1' : k} +${v}`).join(', ')}), so beating a weaker profile earns less.</p>` },
    { id: 'unlocks', title: 'What is unlocked', html: `<p>All five locations, all seven operators and every mode except 5v5 are open from the start. There are no loot boxes or season passes. Medals record what you have done; they do not unlock gear.</p>` },
  ],
  related: ['rewards', 'medals', 'multiplayer'],
};

const R = REWARDS, PR = PRACTICE_REWARDS;
const EXAMPLES: [string, boolean, number][] = [['Win, 0 kills', true, 0], ['Win, 1 kill', true, 1], ['Win, 3 kills', true, 3], ['Win, 5 kills', true, 5], [`Win, 7 kills (counts ${REWARDS.maxKills})`, true, 7], ['Loss, 0 kills', false, 0], ['Loss, 3 kills', false, 3], ['Loss, 5 kills', false, 5]];
export const rewards: Page = {
  slug: 'rewards', title: 'Rewards', group: 'Account', summary: 'What a match pays, line by line, online and in solo practice.',
  keywords: ['rewards', 'xp', 'shards', 'earn', 'payout', 'shard rewards'],
  sections: [
    { id: 'table', title: 'What a match pays', html: table(['Line', 'Online XP', 'Online shards', 'Practice XP', 'Practice shards'], [
      ['Match played', R.xpPlay, R.shardsPlay, PR.xpPlay, PR.shardsPlay], ['Victory', `+${R.xpWin}`, `+${R.shardsWin}`, `+${PR.xpWin}`, `+${PR.shardsWin}`],
      [`Per kill (up to ${R.maxKills})`, `+${R.xpPerKill}`, `+${R.shardsPerKill}`, `+${PR.xpPerKill}`, `+${PR.shardsPerKill}`],
      ['Damage dealt', '0', `1 per ${R.damagePerShard} (up to ${R.damageShardsMax})`, '0', `1 per ${PR.damagePerShard} (up to ${PR.damageShardsMax})`],
    ], 'Rewards per match') + `<p>Kills past ${R.maxKills} in one match pay nothing more, and damage adds at most ${R.damageShardsMax} shards online (${PR.damageShardsMax} in practice). The results screen shows exactly these lines.</p>` },
    { id: 'examples', title: 'Online shards, worked out', keywords: ['shards', 'how many shards', 'shard rewards', 'kill reward', 'victory reward', 'online rewards'], html: `${table(['Match (no damage dealt)', 'Online shards', 'Online XP'], EXAMPLES.map(([label, won, kills]) => { const b = rewardBreakdown({ won, kills, damage: 0, seconds: 60, leftEarly: false, capped: false }); return [label, `${b.shards}`, `${b.xp}`]; }), 'Online shards by result')}<p>Each line is ${R.shardsPlay} for the match${R.shardsPerKill ? `, ${R.shardsPerKill} a kill` : ''} and ${R.shardsWin} for the win, from the same rule the server pays with. Damage dealt adds 1 shard per ${R.damagePerShard} up to ${R.damageShardsMax} on top. A win always adds the victory bonus, but a loss with many kills can pay more than a win with none.</p>` },
    { id: 'limits', title: 'When a match pays nothing', keywords: ['no reward', 'cap', 'daily'], html: ul([
      `Shorter than ${R.minSeconds} s.`, 'You left while still standing.', `Over the daily cap: ${R.dailyCap} rewarded online matches and ${PR.dailyCap} rewarded practice runs per rolling 24 h (later ones still count for history and medals).`,
      'Private room codes, DEMO tokens and Training.', 'A practice run without a valid start ticket, or one that claims more time than passed.',
    ]) },
  ],
  related: ['progression', 'medals', 'game-modes'],
};

const rarityCount = (r: string) => MEDALS.filter((m) => m.rarity === r).length;
export const medals: Page = {
  slug: 'medals', title: 'Medals', group: 'Account', summary: `All ${MEDALS.length} medals and exactly what each one asks.`,
  keywords: ['medals', 'achievements', 'badges', 'trophies'],
  sections: [
    { id: 'about', title: 'About medals', html: `<p>${MEDALS.length} medals: ${rarityCount('common')} common, ${rarityCount('uncommon')} uncommon, ${rarityCount('rare')} rare and ${rarityCount('epic')} epic. They are earned from tracked play only, are permanent once earned, and pay nothing: a medal is a record of play. Signed in, they are awarded and stored on the server.</p>` },
    { id: 'collection', title: 'The collection', keywords: MEDALS.map((m) => m.name.toLowerCase()), html: `<div class="medal-tools" data-medal-tools><label for="medal-q">Find a medal</label><input id="medal-q" type="search" placeholder="Name or requirement" autocomplete="off"><div class="seg" role="group" aria-label="Rarity"><button type="button" data-rarity="all" aria-pressed="true">All</button>${(['common', 'uncommon', 'rare', 'epic'] as const).map((r) => `<button type="button" data-rarity="${r}" aria-pressed="false">${RARITY_LABEL[r]}</button>`).join('')}</div><p class="small" data-medal-count aria-live="polite">${MEDALS.length} medals</p></div>
<ul class="medal-grid">${MEDALS.map((m) => `<li class="medal r-${m.rarity}" data-rarity="${m.rarity}" data-text="${esc(`${m.name} ${m.text}`.toLowerCase())}">${medalSvg(m, true)}<div><b>${esc(m.name)}</b><span class="rar">${RARITY_LABEL[m.rarity]}</span><p>${esc(m.text)}</p></div></li>`).join('')}</ul>` },
  ],
  related: ['progression', 'rewards', 'faq'],
};

const KEY_ROWS: [string, string][] = [['W A S D', 'Move'], ['Shift (hold)', 'Creep: quieter, slower'], ['Mouse', 'Aim'], ['Left click (hold)', 'Fire'], ['R', 'Reload'], ['Space or Q', 'Ability'], ['G (hold, release) or right click', 'Throw a grenade at the cursor'], ['M', 'Tactical map (M or Esc closes it)'], ['Esc or P', 'Pause'], ['Enter or Space', 'Confirm on menus']];
function keyboardSvg(): string {
  const k = (x: number, y: number, t: string, w = 44, hi = false) => `<rect class="${hi ? 'k hi' : 'k'}" x="${x}" y="${y}" width="${w}" height="40" rx="6"/><text class="kt" x="${x + w / 2}" y="${y + 26}" text-anchor="middle">${t}</text>`;
  return `<svg class="dg kb" viewBox="0 0 640 230" width="640" height="230" role="img" aria-label="Keyboard: W A S D move, Shift creep, Space or Q ability, R reload, G grenade, M map, Esc pause; mouse aims, left click fires, right click throws a grenade.">
${k(20, 20, 'Esc')}${k(118, 70, 'Q', 44, true)}${k(168, 70, 'W', 44, true)}${k(218, 70, 'E')}${k(268, 70, 'R', 44, true)}${k(140, 120, 'A', 44, true)}${k(190, 120, 'S', 44, true)}${k(240, 120, 'D', 44, true)}${k(290, 120, 'F')}${k(340, 120, 'G', 44, true)}${k(20, 170, 'Shift', 100, true)}${k(130, 170, 'Space', 200, true)}${k(390, 170, 'M', 44, true)}${k(340, 70, 'P', 44, true)}
<rect class="k" x="520" y="40" width="90" height="140" rx="45"/><path class="k-line" d="M520 100 H610 M565 40 V100"/><path class="k-hi" d="M522 98 V92 A43 43 0 0 1 563 42 V98 Z"/><path class="k-hi2" d="M567 98 V42 A43 43 0 0 1 608 92 V98 Z"/>
<text class="kl" x="565" y="205" text-anchor="middle">L: fire &#183; R: grenade</text><text class="kl" x="190" y="60" text-anchor="middle">move</text><text class="kl" x="230" y="225" text-anchor="middle">ability (or Q)</text><text class="kl" x="412" y="225" text-anchor="middle">map</text><text class="kl" x="70" y="225" text-anchor="middle">creep</text></svg>`;
}
function touchSvg(): string {
  return `<svg class="dg kb" viewBox="0 0 640 300" width="640" height="300" role="img" aria-label="Touch layout, phone held sideways: left thumb anywhere on the left half moves; right thumb aims and fires when pushed past the inner ring; ability, grenade and reload buttons on the right; MAP and pause at the top.">
<rect class="phone" x="10" y="10" width="620" height="280" rx="28"/><rect class="screen" x="40" y="26" width="560" height="248" rx="10"/>
<circle class="stick" cx="150" cy="200" r="56"/><circle class="thumb" cx="170" cy="188" r="20"/><text class="kl" x="150" y="128" text-anchor="middle">MOVE (left thumb)</text><text class="kl small" x="150" y="268" text-anchor="middle">push under 60%: creep</text>
<circle class="stick" cx="420" cy="190" r="56"/><circle class="ring" cx="420" cy="190" r="${56 * INPUT.aimDeadzone}"/><circle class="thumb fire" cx="456" cy="168" r="20"/><text class="kl" x="420" y="118" text-anchor="middle">AIM + FIRE (right thumb)</text><text class="kl small" x="420" y="268" text-anchor="middle">fires past the inner ring (${Math.round(INPUT.aimDeadzone * 100)}%)</text>
<circle class="btn-c" cx="540" cy="150" r="24"/><text class="kl small" x="540" y="155" text-anchor="middle">ABILITY</text><circle class="btn-c" cx="520" cy="222" r="20"/><text class="kl small" x="520" y="227" text-anchor="middle">NADE</text><circle class="btn-c" cx="572" cy="220" r="18"/><text class="kl small" x="572" y="225" text-anchor="middle">R</text>
<rect class="btn-c" x="56" y="40" width="80" height="30" rx="6"/><text class="kl small" x="96" y="60" text-anchor="middle">MAP</text><rect class="btn-c" x="550" y="40" width="34" height="30" rx="6"/><text class="kl small" x="567" y="60" text-anchor="middle">II</text></svg>`;
}

export const controls: Page = {
  slug: 'controls', title: 'Controls', group: 'Help', summary: 'Every key and touch control, from the game\'s input code.',
  keywords: ['keys', 'keyboard', 'mouse', 'touch', 'mobile', 'tablet', 'bindings', 'buttons'],
  sections: [
    { id: 'desktop', title: 'Desktop (keyboard and mouse)', keywords: ['pc', 'keyboard', 'wasd', 'hotkeys'], html: `<figure class="diagram">${keyboardSvg()}<figcaption>The keys the game reads.</figcaption></figure>${table(['Input', 'Action'], KEY_ROWS.map(([a, b]) => [`<kbd>${esc(a)}</kbd>`, esc(b)]), 'Keyboard and mouse')}<p>Grenades on PC land where the cursor is (${TUNING.grenade.minThrow} to ${TUNING.grenade.maxThrow} m); holding G shows where it will land.</p>` },
    { id: 'touch', title: 'Phone (touch)', keywords: ['mobile', 'phone', 'touch', 'twin stick', 'landscape', 'mobile', 'phone', 'can i play on mobile'], html: `<figure class="diagram">${touchSvg()}<figcaption>The touch layout (schematic). The game plays in landscape; held upright, the screen is turned for you.</figcaption></figure>${ul([
      'Left thumb: the move stick follows your thumb if it drifts past the rim. Push less than 60% of the way to creep.',
      `Right thumb: aim. It fires once you push past ${Math.round(INPUT.aimDeadzone * 100)}% of the stick; inside that it only turns you. There is no auto-fire.`,
      'With the aim thumb lifted you face where you walk.',
      `Ability button: tap. Grenade button: tap to throw ${TUNING.grenade.touchThrow} m along your aim, or drag from it to aim the throw. Reload button: R.`,
      'MAP opens the tactical map; the pause button is top right.'])}${shot('touch-hud', 'The touch HUD on an 844 x 390 landscape phone (emulated).')}` },
    { id: 'tablet', title: 'Tablet', keywords: ['ipad', 'tablet'], html: `<p>Tablets use the touch controls above. With a keyboard and mouse attached, the desktop controls work too.</p>` },
    { id: 'settings', title: 'Settings that change controls', keywords: ['settings', 'stick size', 'hud size', 'motion', 'rebind', 'change keys', 'key bindings'], html: ul(['PC keys: Settings, Change keys lets you rebind each action; the keys above are the defaults, and Reset to defaults restores them.', 'Stick size for touch.', 'HUD size (85% to 130%) and Motion (System, Reduced or Full: Reduced removes screen shake, pulses and entrances).']) },
  ],
  related: ['start-here', 'movement-sound', 'faq'],
};

export const faq: Page = {
  slug: 'faq', title: 'FAQ', group: 'Help', summary: 'Short answers, each backed by the game\'s rules.',
  keywords: ['questions', 'help', 'faq'],
  sections: [
    { id: 'win', title: 'How do I win?', keywords: ['how do i win', 'win', 'objective'], html: `<p>Vs bots: down every hostile (your AI teammates' downs count). Online: be the last side standing. ${link('how-to-play', 'More', 'win')}.</p>` },
    { id: 'armour', title: 'What does armour do?', keywords: ['armor', 'armour'], html: `<p>It soaks ${Math.round(TUNING.combat.armorSoak * 100)}% of each hit (less the weapon's armour pen) until it runs out. ${link('combat', 'Health and armour', 'health')}.</p>` },
    { id: 'revive', title: 'Can I be revived?', keywords: ['revive', 'downed'], html: `<p>Yes, while a teammate still stands (Vs bots, 3v3, 5v5). Not in 1v1, and not as the last of your side. ${link('combat', 'Downed and revive', 'revive')}.</p>` },
    { id: 'see', title: 'Why can\'t I see the enemy?', keywords: ['invisible', 'cant see', 'fog'], html: `<p>You only see inside your light cone along a clear line (walls block it), within ${TUNING.vision.nearRadius} m of you, or someone standing in a lit area. ${link('movement-sound', 'Vision', 'vision')}.</p>` },
    { id: 'heard', title: 'Can they hear me?', keywords: ['footsteps', 'quiet'], html: `<p>Yes, by the same rules you hear them: running steps ${TUNING.sound.runStep} m, creeping ${TUNING.sound.quietStep} m, standing still nothing, a shot ${TUNING.sound.shot} m.</p>` },
    { id: 'nft', title: 'Do I need an NFT?', keywords: ['nft', 'chog', 'wallet', 'holder', 'chog trait'], html: `<p>No. Vs bots, 1v1 and 3v3 are open to everyone with the same operators. 5v5 is for verified Chog holders. A Chog's traits can give a superpower in the ability slot, never extra health, armour or damage. ${link('chog-traits', 'CHOG traits', 'chog-traits')}.</p>` },
    { id: 'grenades', title: 'How many grenades do I get?', keywords: ['grenade'], html: `<p>${GRENADES.free} for everyone; more for a verified Chog by tier, up to ${GRENADES.legendary}. Grenade pickups add one, up to your capacity.</p>` },
    { id: 'leave', title: 'What happens if I disconnect?', keywords: ['disconnect', 'reconnect'], html: `<p>Your operator waits ${SERVER.reconnectGraceSec} s for you while the game reconnects. ${link('multiplayer', 'Disconnects', 'reconnect')}.</p>` },
    { id: 'pay', title: 'Why did a match pay nothing?', keywords: ['no rewards'], html: `<p>It was under ${REWARDS.minSeconds} s, you left while standing, you were over the daily cap, or it was private, DEMO or Training. ${link('rewards', 'Rewards', 'limits')}.</p>` },
    { id: 'buy', title: 'Can I buy anything?', keywords: ['buy', 'purchase', 'pay to win', 'shop'], html: `<p>No. There are no purchases in the game: upgrades cost shards earned by playing, and are the same for everyone.</p>` },
    { id: 'map', title: 'Is there a minimap?', keywords: ['map', 'minimap', 'tactical map', 'enemies on map', 'see enemies'], html: `<p>There is a full-screen tactical map: press <kbd>M</kbd> or MAP. It shows every living hostile on the whole map while it is open. ${link('how-to-play', 'The tactical map', 'tactical-map')}.</p>` },
  ],
  related: ['start-here', 'controls', 'combat'],
};

export const PLAY_PAGES = [gameModes, multiplayer, progression, rewards, medals, controls, faq];
export const _unused = [ol, n];
