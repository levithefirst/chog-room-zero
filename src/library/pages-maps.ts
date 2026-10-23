// Maps index and one page per location. Geometry, areas, spawns, lit areas and materials are measured from the game's
// own level (src/library/mapdata.ts); the hand-written notes only describe features that exist in that data.
import { MAPS, MAP_IDS, TUNING, type MapId } from './facts';
import type { Page } from './types';
import { esc, n, table, facts, note, ul, link, href, shot } from './html';
import { mapSvg, stats, areas, LAYERS } from './mapdata';

const S = TUNING.sound;
const KIND: Record<string, string> = { health: 'health', armor: 'armour', ammo: 'ammo', grenade: 'grenades' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface Notes { identity: string; locations: string; entrances: string; sightlines: string; cover: string; positions: string[]; sound: string; tactics: string[]; mistakes: string[] }

const NOTES: Record<MapId, Notes> = {
  'room-zero': {
    identity: 'A service basement mirrored down the middle, so neither side has the better half. The balanced baseline, and the darkest location: it has no lit areas, so every fight is a lamp-length fight.',
    locations: 'A spawn hall at each end. Offices in the north corners and storage in the south corners. Two side rooms per half. A north gallery and a south loading dock span the middle, each with a corridor beside it. A flank corridor runs north to south on each side of the central atrium.',
    entrances: 'Doorways connect every room to the corridors, so most rooms have more than one way in. The fastest routes between halves are the north and south corridors; the atrium is the short, exposed way through the middle.',
    sightlines: 'Wall pillars break up the straight lanes. In the dark you see your own light cone, not the lane.',
    cover: 'Crate lines and pillars in the atrium, zigzag cover along the dock.',
    positions: ['Open: the atrium, short and exposed from several sides.', 'Strong: a doorway into a side room, where anyone coming has to cross your light.', 'Dangerous: the long dock with its zigzag cover, where you can be shot from far along it.'],
    sound: 'Every floor carries sound the standard distance here (no carpet, decks or tunnels): a run is heard 8 m away, through a wall 6.4 m.',
    tactics: ['Creep the last few metres to a doorway; the dark hides you until your own light or noise gives you away.', 'Use the flank corridors to come at the atrium from the side instead of crossing it.', 'Let the hostiles make noise first: footsteps through a wall give you their direction.'],
    mistakes: ['Running through the atrium: it is open from several sides.', 'Firing at a sound you cannot see: your muzzle flash shows you to everyone with a clear line.'],
  },
  office: {
    identity: 'An office floor around a solid core: rooms and corridors, and the most doorways of any location. Carpet muffles footsteps, so it rewards creeping room to room.',
    locations: 'Private offices along the north, open plan and meeting rooms on each side, a server room and a print room in the south corners. Around the core: a ring corridor, the boardroom to the north, reception and the kitchen to the south, toilets in the core itself.',
    entrances: 'Rooms open onto the north and service corridors and the ring around the core. With this many doorways, expect contact at close range and from more than one side.',
    sightlines: 'Corridors give the long lines; inside rooms most lines are short. The open plan, the boardroom and reception are lit: someone standing in them is seen from up to 22 m by anyone facing them.',
    cover: 'Crates and barriers are spread through the rooms: the most barrier tiles of any location.',
    positions: ['Strong: a dark room beside a lit one: you see into the light, they do not see into the dark.', 'Dangerous: standing in a lit room, visible from far along any clear line.', 'Open: the ring corridor around the core, where contact comes from both directions.'],
    sound: 'Most rooms are carpeted: a run on carpet carries only 70% as far (5.6 m), so you can move faster here without being heard. Corridors and the core are tile and carry the full 8 m.',
    tactics: ['Move on carpet, stop on tile: the floor under you sets how far you are heard.', 'Clear a room from its doorway; with so many ways in, do not stand in the middle.', 'Use the ring to come round behind a fight at the core.'],
    mistakes: ['Holding a lit room: it shows you from 22 m.', 'Assuming one entrance: most rooms have several.'],
  },
  supermarket: {
    identity: 'Long aisles that cut across your path, a checkout comb at the front and a stockroom loop out back. The longest sightlines and most of the floor is lit: the location for long-range weapons.',
    locations: 'Stockroom and the receiving dock along the north, the back aisle, aisles north and south of the middle, the power aisle down the centre, action alley and the checkouts at the front, bagging behind them, produce down each side.',
    entrances: 'The aisles are the routes; the back aisle and action alley cross them. The checkout comb is a row of narrow gaps.',
    sightlines: 'The longest straight lines of any location run the length of the building. Most of the floor is lit, so a body standing there is seen from up to 22 m by anyone facing it.',
    cover: 'Crates and barriers along the aisles: the most crate tiles of any location.',
    positions: ['Dangerous: the length of a lit aisle, open from one end to the other.', 'Strong: an aisle end out of the light, with a long line ahead.', 'Open: the power aisle in the centre, crossed by everything.'],
    sound: 'Tile, concrete and dock floors: every step carries the standard distance.',
    tactics: ['Cross aisles quickly and stop out of the lit lane.', 'Hold an aisle end with a long-range weapon (Ray, Yot).', 'Use the stockroom loop out back to move between halves away from the lit floor.'],
    mistakes: ['Walking down the middle of a lit aisle.', 'Taking a shotgun fight down a long lane.'],
  },
  metro: {
    identity: 'Fare gates, stairs down to a long platform, a stalled train, and service tunnels that echo. Chokepoints and tunnels: you have to go through narrow places to get anywhere.',
    locations: 'Ticket halls in the north corners and the concourse between them, the control room on the north side, the platform with the stalled train (carriages and a middle car), a walkway, station rooms and the service tunnels along the south.',
    entrances: 'Stairs lead between levels and slow you to 65% speed: they are the chokepoints. Rails along the track edges block movement but not sight or bullets.',
    sightlines: 'The platform and track give very long straight lines. About half the floor is lit.',
    cover: 'Little cover for its size: walls do most of the blocking.',
    positions: ['Dangerous: on the stairs, slowed and in the open.', 'Strong: covering the top or bottom of a stair from out of the light.', 'Dangerous: the length of the platform, open and partly lit.'],
    sound: 'The service tunnels echo: a run carries 130% as far (10.4 m), so an ambush there is heard coming both ways.',
    tactics: ['Never stop on stairs: cross them and take a position off the line.', 'Shoot across the rails: they stop movement, not bullets.', 'Creep in the tunnels, or expect to be heard from 10 m.'],
    mistakes: ['Chasing through a stair choke into a held angle.', 'Running in the tunnels.'],
  },
  construction: {
    identity: 'Scaffolding and a raised slab over an open site. High ground: a shot fired from a deck clears every crate and barrier below it.',
    locations: 'A yard at each end, the ground floor, a north and a south strip along the edges, scaffolding to the north and south, the raised slab in the middle with the core north and south of it.',
    entrances: 'Stairs are the only way onto a deck: they slow you to 65% and are the chokepoints. Rails block movement only: you can see and shoot across them.',
    sightlines: 'The most open location: the longest average lines of sight. The high ground sees over the cover on the ground.',
    cover: 'Very little cover, and a deck has none of its own.',
    positions: ['Strong: a deck over a ground fight: your shots clear the crates below.', 'Dangerous: a deck you are shot on: it has no cover and decks and stairs ring out (10.4 m).', 'Open: the ground floor between scaffolds.'],
    sound: 'Decks and stairs ring out: a run on them carries 130% as far (10.4 m). The high ground is never taken quietly.',
    tactics: ['Take a deck when the stairs are clear, then fight from it over the crates below.', 'From the ground, hold the bottom of the stairs instead of contesting a deck.', 'Expect to be heard on a deck: creep, or move only when you want to be found.'],
    mistakes: ['Hiding behind a crate from someone on a deck: their shots clear it.', 'Standing still on open scaffolding with no cover.'],
  },
};

function viewer(id: MapId): string {
  const toggles = LAYERS.map((l) => `<label><input type="checkbox" data-layer-toggle="${l.id}" checked> ${esc(l.label)}</label>`).join('');
  return `<div class="map-guide" data-map-guide="${id}" role="group" aria-label="${esc(MAPS[id].name)} map guide">
<div class="mg-bar"><span class="mg-tag">MAP GUIDE</span><span class="mg-btns"><button type="button" data-mg="in" aria-label="Zoom in">+</button><button type="button" data-mg="out" aria-label="Zoom out">&minus;</button><button type="button" data-mg="fit">FIT</button></span></div>
<div class="mg-view" tabindex="0" aria-label="Map: drag or use the arrow keys to pan, the wheel, pinch or plus and minus to zoom">${mapSvg(id)}</div>
<details class="mg-layers" open><summary>Layers</summary><fieldset><legend class="sr">Show on the map</legend>${toggles}</fieldset></details>
<ul class="mg-legend" aria-label="Legend"><li><i class="lg-wall"></i>Wall</li><li><i class="lg-cover"></i>Crate / barrier</li><li><i class="lg-door"></i>Doorway</li><li><i class="lg-deck"></i>Deck</li><li><i class="lg-stairs"></i>Stairs</li><li><i class="lg-rail"></i>Rail</li><li><i class="lg-lit"></i>Lit area</li><li><i class="lg-alpha"></i>Online spawn west</li><li><i class="lg-bravo"></i>Online spawn east</li><li><i class="lg-solo"></i>Your solo start</li><li><i class="lg-bot"></i>Solo hostile start</li><li><i class="lg-zone"></i>Final-circle centre</li><li><i class="lg-pk"></i>Supply area</li></ul>
<p class="small">Drawn from the level the game plays on. Area names are the ones the in-game tactical map shows. Supply areas are where each kind of supply can appear; the exact tile changes every time one is taken.</p></div>`;
}

function mapPage(id: MapId): Page {
  const def = MAPS[id], s = stats(id), N = NOTES[id], a = areas(def);
  const supplies = new Map<string, Set<string>>();
  for (const ar of a) { const k = supplies.get(ar.label) ?? new Set(); ar.kinds.forEach((x) => k.add(KIND[x])); supplies.set(ar.label, k); }
  const shotName = `tmap-${id}`;
  return {
    slug: `maps/${id}`, title: def.name, group: 'Maps', summary: `${def.tag}. ${def.blurb}`,
    keywords: [def.name, def.tag, id, 'map', 'location'],
    sections: [
      { id: 'identity', title: 'Identity', html: `<p class="kicker">${esc(def.tag)}</p><p>${esc(N.identity)}</p>${facts([
        ['Size', `${s.w} x ${s.h} m`], ['Walkable floor', `${s.floor} m&sup2;`], ['Lit floor', `${Math.round(s.litShare * 100)}%`],
        ['Doorways', `${s.doors} tiles`], ['Crates / barriers', `${s.crates} / ${s.barriers} tiles`], ['Rails / decks / stairs', `${s.rails} / ${s.decks} / ${s.stairs} tiles`],
        ['Solo hostiles', `${s.hostiles}`], ['Supply areas', `${s.pickupZones}`]])}` },
      { id: 'viewer', title: 'Map guide', keywords: ['viewer', 'layout', 'zoom'], html: viewer(id) },
      { id: 'locations', title: 'Key locations', html: `<p>${esc(N.locations)}</p>${table(['Area', 'Supplies that appear there'], [...supplies.entries()].map(([k, v]) => [esc(cap(k)), [...v].join(', ')]), `${def.name} areas`)}` },
      { id: 'entrances', title: 'Entrances and chokepoints', keywords: ['chokepoint', 'doors', 'stairs'], html: `<p>${esc(N.entrances)}</p>` },
      { id: 'sightlines', title: 'Sightlines and engagement distance', keywords: ['sightline', 'range', 'distance'], html: `<p>${esc(N.sightlines)}</p>${facts([['Longest straight line', `${s.longestLane} m (a row or column with no wall)`], ['Average open line', `${n(s.meanOpen)} m (from every floor tile, the four straight lines to the nearest wall)`]])}<p class="small">Measured on the tile grid. Your light reaches ${7.5}-${12} m depending on the operator (more when steady), so in the dark the light, not the lane, sets the fight distance.</p>` },
      { id: 'cover', title: 'Cover', html: `<p>${esc(N.cover)} About ${n(((s.crates + s.barriers) / s.floor) * 100)} cover tiles per 100 m&sup2; of floor.</p>` },
      { id: 'positions', title: 'Open, dangerous and strong positions', html: ul(N.positions.map(esc)) },
      { id: 'sound', title: 'Sound', keywords: ['footsteps', 'carpet', 'tunnel', 'deck'], html: `<p>${esc(N.sound)}</p>` },
      { id: 'spawns', title: 'Spawns and the danger zone', keywords: ['spawn', 'zone'], html: `<p>Online, one side starts at the west end and the other at the east end; the layout is mirrored so both sides get the same map. In Vs bots you start at the marked solo start and the ${s.hostiles} hostiles start at their own points (${def.botSpawns.map((b) => esc(b.name)).join(', ')}). The last circle closes on one of ${s.zoneCentres} possible centres on open floor, marked in the map guide.</p>` },
      { id: 'tactics', title: 'Tactics', html: ul(N.tactics.map(esc)) },
      { id: 'mistakes', title: 'Common mistakes', html: ul(N.mistakes.map(esc)) },
      ...(shot(shotName, '') ? [{ id: 'in-game', title: 'In the game', html: shot(shotName, `${esc(def.name)} on the in-game tactical map.`) }] : []),
    ],
    related: ['maps', ...MAP_IDS.filter((x) => x !== id).slice(0, 2).map((x) => `maps/${x}`), 'movement-sound'],
  };
}

export const mapsIndex: Page = {
  slug: 'maps', title: 'Maps', group: 'Maps', summary: 'Five locations, open to everyone, each different in layout, light and sound.',
  keywords: ['maps', 'locations', 'levels', 'arena'],
  sections: [
    { id: 'all', title: 'The five locations', html: `<div class="cards maps">${MAP_IDS.map((id) => { const d = MAPS[id]; return `<a class="card" href="${href(`maps/${id}`)}"><span class="card-img map-mini" aria-hidden="true">${mapSvg(id, { mini: true, idPrefix: `idx-${id}` })}</span><span class="card-t">${esc(d.name)}</span><span class="card-k">${esc(d.tag)}</span><span class="card-d">${esc(d.blurb)}</span></a>`; }).join('')}</div>` },
    { id: 'compare', title: 'Compare', html: table(['Location', 'Size (m)', 'Lit floor', 'Longest line', 'Average line', 'Doorways', 'Cover tiles', 'Decks / stairs'], MAP_IDS.map((id) => { const s = stats(id); return [link(`maps/${id}`, esc(MAPS[id].name)), `${s.w} x ${s.h}`, `${Math.round(s.litShare * 100)}%`, `${s.longestLane} m`, `${n(s.meanOpen)} m`, s.doors, s.crates + s.barriers, `${s.decks} / ${s.stairs}`]; }), 'Locations compared (measured on the tiles)') },
    { id: 'shared', title: 'Rules on every map', html: ul([`Supplies come back ${TUNING.pickups.health.respawn} s after they are taken, on another tile of their area, never next to someone standing.`, 'Each layout is mirrored so both online sides get the same map.', `Floors change sound: carpet ${Math.round(S.surface.carpet * 100)}%, decks, stairs and tunnels ${Math.round(S.surface.deck * 100)}% of the usual footstep radius.`, 'The danger zone runs the same schedule everywhere, with each location\'s own final centres.']) },
  ],
  related: ['maps/room-zero', 'movement-sound', 'combat'],
};

export const MAP_PAGES = MAP_IDS.map(mapPage);
export const _note = note;
