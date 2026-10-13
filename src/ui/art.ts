// Menu art (RC-7), all original and drawn from the in-game look: the operator token seen from above (teal team ring,
// pale body, accent ring, its own gun) under its lamp cone. SVG strings, so there are no image files to load or lose.
import type { HeroDef } from '../config/heroes';
import type { MedalDef, Rarity } from './medals';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

// Barrel length and width per gun, in the 100-wide portrait box (same order as the in-game barrels).
const GUN: Record<string, { len: number; w: number }> = {
  rifle: { len: 30, w: 6 }, smg: { len: 21, w: 7 }, shotgun: { len: 25, w: 10 }, marksman: { len: 40, w: 5 },
};

/** Operator portrait: the token from above, gun forward, lamp cone ahead. `uid` keeps gradient ids unique per page. */
export function portraitSvg(h: HeroDef, uid: string, accentOverride?: number | null): string {
  const acc = hex(accentOverride ?? h.accent);
  const g = GUN[h.weapon] ?? GUN.rifle;
  // Cone width follows the hero's real cone (Wick narrow, Mop wide).
  const half = Math.tan((h.vision.coneDeg / 2) * Math.PI / 180) * 58;
  return `<svg viewBox="0 0 100 120" class="portrait" aria-hidden="true">
<defs><radialGradient id="c${uid}" cx="50" cy="76" r="70" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff3cf" stop-opacity=".55"/><stop offset="1" stop-color="#fff3cf" stop-opacity="0"/></radialGradient>
<linearGradient id="b${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2026"/><stop offset="1" stop-color="#0d1013"/></linearGradient></defs>
<rect width="100" height="120" rx="6" fill="url(#b${uid})"/>
<path d="M0 30H100M0 60H100M0 90H100M33 0V120M66 0V120" stroke="#ffffff" stroke-opacity=".05"/>
<path d="M50 76 L${50 - half} 18 Q50 6 ${50 + half} 18 Z" fill="url(#c${uid})"/>
<ellipse cx="54" cy="83" rx="22" ry="17" fill="#000" opacity=".4"/>
<rect x="${50 - g.w / 2}" y="${76 - 18 - g.len}" width="${g.w}" height="${g.len + 4}" rx="1.5" fill="#3a372f" stroke="#0b0f12" stroke-width="2"/>
<circle cx="50" cy="76" r="22" fill="none" stroke="#38e0c2" stroke-width="2.4" opacity=".9"/>
<circle cx="50" cy="76" r="19" fill="#e6dfcc" stroke="#0b0f12" stroke-width="2.4"/>
<circle cx="50" cy="76" r="10.5" fill="none" stroke="${acc}" stroke-width="3"/>
</svg>`;
}

/** The small round token used for the player chip (favourite operator, or a neutral token). */
export function tokenSvg(accent: number | null): string {
  return `<svg viewBox="0 0 40 40" class="token" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="#38e0c2" stroke-width="2"/>
<circle cx="20" cy="20" r="14" fill="#e6dfcc" stroke="#0b0f12" stroke-width="2"/><circle cx="20" cy="20" r="7.5" fill="none" stroke="${accent === null ? '#5c574e' : hex(accent)}" stroke-width="2.5"/></svg>`;
}

const RARITY: Record<Rarity, string> = { common: '#b9a27a', rare: '#8fb0c8', epic: '#f2d98a' };

/** Medal badge: hexagon in the rarity colour with the medal's initials; dim and locked until earned. */
export function medalSvg(m: MedalDef, unlocked: boolean): string {
  const c = RARITY[m.rarity];
  const ini = m.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return `<svg viewBox="0 0 48 52" class="medal-badge${unlocked ? '' : ' locked'}" aria-hidden="true">
<path d="M24 2 L45 14 V38 L24 50 L3 38 V14 Z" fill="${unlocked ? '#1c1d1e' : '#141516'}" stroke="${unlocked ? c : '#3a3832'}" stroke-width="3"/>
<path d="M24 9 L39 17.5 V34.5 L24 43 L9 34.5 V17.5 Z" fill="none" stroke="${unlocked ? c : '#3a3832'}" stroke-opacity=".45" stroke-width="1.5"/>
${unlocked ? `<text x="24" y="31" text-anchor="middle" font-family="Barlow Cond, Arial Narrow, sans-serif" font-weight="600" font-size="15" fill="${c}">${ini}</text>`
    : '<path d="M18 26v-4a6 6 0 0 1 12 0v4M16 26h16v11H16z" fill="none" stroke="#5c574e" stroke-width="2.2"/>'}
</svg>`;
}

export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic' };

/**
 * Controls diagram for How to play. Touch: a landscape phone held in two hands, left thumb on the move stick, right
 * thumb pushing past the fire ring, the Ability and Reload buttons in right-thumb reach. PC: WASD, mouse, Space, R.
 */
export function controlsSvg(touch: boolean): string {
  if (touch) {
    return `<svg viewBox="0 0 260 140" class="controls" role="img" aria-label="Left thumb moves, right thumb aims and fires">
<rect x="30" y="18" width="200" height="104" rx="12" fill="#101418" stroke="#e6dfcc" stroke-opacity=".5" stroke-width="2"/>
<rect x="40" y="26" width="180" height="88" rx="4" fill="#161b20"/>
<path d="M130 70 L104 34 Q130 26 156 34 Z" fill="#fff3cf" opacity=".18"/>
<circle cx="130" cy="72" r="8" fill="#e6dfcc" stroke="#38e0c2" stroke-width="2"/>
<circle cx="78" cy="88" r="20" fill="none" stroke="#e6dfcc" stroke-opacity=".45" stroke-width="2"/>
<circle cx="84" cy="84" r="8" fill="#e6dfcc" fill-opacity=".8"/>
<circle cx="178" cy="78" r="20" fill="none" stroke="#e6dfcc" stroke-opacity=".45" stroke-width="2"/>
<circle cx="178" cy="78" r="7" fill="none" stroke="#f2d98a" stroke-width="1.6"/>
<circle cx="194" cy="68" r="8" fill="#f2d98a"/>
<circle cx="204" cy="100" r="7" fill="none" stroke="#f2d98a" stroke-width="2"/><circle cx="214" cy="84" r="5.5" fill="none" stroke="#9a9384" stroke-width="1.6"/>
<path d="M8 120 Q20 96 60 92 L74 100 Q46 112 34 136 Z" fill="#2a2f35" stroke="#e6dfcc" stroke-opacity=".35"/>
<path d="M252 120 Q240 96 200 88 L186 96 Q214 110 226 136 Z" fill="#2a2f35" stroke="#e6dfcc" stroke-opacity=".35"/>
<text x="78" y="133" text-anchor="middle" fill="#f2d98a" font-family="Barlow Cond, sans-serif" font-size="11" font-weight="600">MOVE</text>
<text x="180" y="133" text-anchor="middle" fill="#f2d98a" font-family="Barlow Cond, sans-serif" font-size="11" font-weight="600">AIM + FIRE</text>
</svg>`;
  }
  const key = (x: number, y: number, k: string, w = 22) => `<rect x="${x}" y="${y}" width="${w}" height="22" rx="4" fill="#161b20" stroke="#e6dfcc" stroke-opacity=".55" stroke-width="1.5"/><text x="${x + w / 2}" y="${y + 15.5}" text-anchor="middle" fill="#ece5d3" font-family="Plex Mono, monospace" font-size="11" font-weight="600">${k}</text>`;
  return `<svg viewBox="0 0 260 140" class="controls" role="img" aria-label="WASD moves, mouse aims, click fires, Space ability, R reload">
${key(46, 22, 'W')}${key(20, 48, 'A')}${key(46, 48, 'S')}${key(72, 48, 'D')}${key(20, 80, 'SHIFT', 48)}${key(20, 108, 'SPACE', 74)}${key(104, 108, 'R')}
<text x="104" y="64" fill="#f2d98a" font-family="Barlow Cond, sans-serif" font-size="11" font-weight="600">MOVE</text>
<text x="74" y="96" fill="#9a9384" font-family="Barlow Cond, sans-serif" font-size="10">creep</text>
<text x="132" y="124" fill="#9a9384" font-family="Barlow Cond, sans-serif" font-size="10">ability · reload</text>
<rect x="186" y="26" width="46" height="72" rx="23" fill="#161b20" stroke="#e6dfcc" stroke-opacity=".55" stroke-width="1.5"/>
<path d="M186 54 H232 M209 26 V54" stroke="#e6dfcc" stroke-opacity=".55" stroke-width="1.5"/>
<path d="M188 52 V49 A21 21 0 0 1 207 28 H207 V52 Z" fill="#f2d98a" opacity=".85"/>
<text x="209" y="116" text-anchor="middle" fill="#f2d98a" font-family="Barlow Cond, sans-serif" font-size="11" font-weight="600">AIM · HOLD TO FIRE</text>
</svg>`;
}
