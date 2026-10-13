// Menu art (RC-7, redrawn RC-8): the operator seen from above, drawn from the SAME parts as the in-game body
// (src/ui/chogShape.ts) in the PROVISIONAL CHOG palette (src/config/brand.ts), gun forward under its lamp cone.
// SVG strings, so there are no image files to load or lose. Original art: nothing is copied from CHOG artwork.
import type { HeroDef } from '../config/heroes';
import type { MedalDef, Rarity } from './medals';
import { BRAND as B, type BrandToken } from '../config/brand';
import { chogParts, place, type ChogParts, type Oval } from './chogShape';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

// Barrel length and width per gun, in the 100-wide portrait box (same order as the in-game barrels).
const GUN: Record<string, { len: number; w: number }> = {
  rifle: { len: 30, w: 6 }, smg: { len: 21, w: 7 }, shotgun: { len: 25, w: 10 }, marksman: { len: 40, w: 5 },
};

const f2 = (n: number) => n.toFixed(2);
const path = (pts: number[]) => `M${pts.map(f2).join(' ')}Z`.replace(/^M([^ ]+) ([^ ]+)/, 'M$1 $2 L');
function ovalPts(o: Oval, n = 18): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(o.x + Math.cos(a) * o.rx, o.y + Math.sin(a) * o.ry); }
  return out;
}

/** The operator body at (cx, cy), radius r, facing up (as in the portraits). `ring`: ally ring colour or none. */
export function operatorSvg(parts: ChogParts, cx: number, cy: number, r: number, ring: string | null): string {
  const up = -Math.PI / 2;
  const at = (p: { x: number; y: number }) => place([p.x, p.y], cx, cy, up, r);
  const c = (t: BrandToken) => B[t];
  let svg = ring ? `<circle cx="${cx}" cy="${cy}" r="${f2(r * 1.42)}" fill="none" stroke="${ring}" stroke-width="${f2(r * 0.12)}"/>` : '';
  svg += `<path d="${path(place(parts.body, cx, cy, up, r))}" fill="${c('purple')}" stroke="${c('bgDeep')}" stroke-width="${f2(r * 0.12)}" stroke-linejoin="round"/>`;
  svg += `<path d="${path(place(parts.body, cx, cy, up, r * 0.97))}" fill="none" stroke="${c('purpleBright')}" stroke-width="${f2(r * 0.05)}"/>`;
  for (const g of parts.gear) if (g.poly) svg += `<path d="${path(place(g.poly, cx, cy, up, r))}" fill="${c(g.fill)}"${g.stroke ? ` stroke="${c(g.stroke)}" stroke-width="${f2(r * 0.06)}"` : ''}/>`;
  svg += `<path d="${path(place(ovalPts(parts.face), cx, cy, up, r))}" fill="${c('cream')}"/>`;
  for (const g of parts.gear) if (g.dot) { const [x, y] = at(g.dot); svg += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(g.dot.r * r)}" fill="${c(g.fill)}"${g.stroke ? ` stroke="${c(g.stroke)}" stroke-width="${f2(r * 0.05)}"` : ''}/>`; }
  for (const e of parts.eyes) {
    const [x, y] = at(e);
    const [gx, gy] = at({ x: e.x + 0.04, y: e.y - 0.04 });
    svg += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(e.r * r)}" fill="${c('bgDeep')}"/><circle cx="${f2(gx)}" cy="${f2(gy)}" r="${f2(e.r * r * 0.38)}" fill="${c('cream')}"/>`;
  }
  for (const k of parts.cheeks) { const [x, y] = at(k); svg += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(k.r * r)}" fill="${c('pink')}" opacity=".85"/>`; }
  for (const h of parts.hands) { const [x, y] = at(h); svg += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(h.r * r)}" fill="${c('pink')}" stroke="${c('bgDeep')}" stroke-width="${f2(r * 0.05)}"/>`; }
  return svg;
}

/** Operator portrait: the operator from above, gun forward, lamp cone ahead. `uid` keeps gradient ids unique per page. */
export function portraitSvg(h: HeroDef, uid: string, accentOverride?: number | null): string {
  const acc = accentOverride == null ? null : hex(accentOverride);
  const g = GUN[h.weapon] ?? GUN.rifle;
  // Cone width follows the hero's real cone (Wick narrow, Mop wide).
  const half = Math.tan((h.vision.coneDeg / 2) * Math.PI / 180) * 58;
  return `<svg viewBox="0 0 100 120" class="portrait" aria-hidden="true">
<defs><radialGradient id="c${uid}" cx="50" cy="76" r="70" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${B.creamWarm}" stop-opacity=".5"/><stop offset="1" stop-color="${B.creamWarm}" stop-opacity="0"/></radialGradient>
<linearGradient id="b${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${B.bgElevated}"/><stop offset="1" stop-color="${B.bgDeep}"/></linearGradient></defs>
<rect width="100" height="120" rx="6" fill="url(#b${uid})"/>
<path d="M0 30H100M0 60H100M0 90H100M33 0V120M66 0V120" stroke="${B.border}" stroke-opacity=".07"/>
<path d="M50 76 L${50 - half} 18 Q50 6 ${50 + half} 18 Z" fill="url(#c${uid})"/>
<ellipse cx="53" cy="82" rx="22" ry="17" fill="#000" opacity=".4"/>
<rect x="${50 + 8 - g.w / 2}" y="${76 - 10 - g.len}" width="${g.w}" height="${g.len + 4}" rx="1.5" fill="${B.bgElevated}" stroke="${B.bgDeep}" stroke-width="2"/>
${operatorSvg(chogParts(h.id), 50, 76, 17, B.ally)}
${acc ? `<circle cx="74" cy="100" r="5" fill="${acc}" stroke="${B.bgDeep}" stroke-width="1.5"/>` : ''}
</svg>`;
}

/** The small round token used for the player chip (favourite operator, or a neutral token). */
export function tokenSvg(accent: number | null, heroId?: string): string {
  if (heroId) return `<svg viewBox="0 0 40 40" class="token" aria-hidden="true">${operatorSvg(chogParts(heroId), 20, 21, 12, B.ally)}</svg>`;
  return `<svg viewBox="0 0 40 40" class="token" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="${B.ally}" stroke-width="2"/>
<circle cx="20" cy="20" r="14" fill="${B.bgElevated}" stroke="${B.bgDeep}" stroke-width="2"/><circle cx="20" cy="20" r="7.5" fill="none" stroke="${accent === null ? B.disabled : hex(accent)}" stroke-width="2.5"/></svg>`;
}

// Rarity: cream, bright purple, pink (tokens); the initials and the label carry it too, not colour alone.
const RARITY: Record<Rarity, string> = { common: B.creamWarm, rare: B.purpleBright, epic: B.pink };

/** Medal badge: hexagon in the rarity colour with the medal's initials; dim and locked until earned. */
export function medalSvg(m: MedalDef, unlocked: boolean): string {
  const c = RARITY[m.rarity];
  const ini = m.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return `<svg viewBox="0 0 48 52" class="medal-badge${unlocked ? '' : ' locked'}" aria-hidden="true">
<path d="M24 2 L45 14 V38 L24 50 L3 38 V14 Z" fill="${unlocked ? B.bgElevated : B.bgPanel}" stroke="${unlocked ? c : B.disabled}" stroke-width="3"/>
<path d="M24 9 L39 17.5 V34.5 L24 43 L9 34.5 V17.5 Z" fill="none" stroke="${unlocked ? c : B.disabled}" stroke-opacity=".45" stroke-width="1.5"/>
${unlocked ? `<text x="24" y="31" text-anchor="middle" font-family="Barlow Cond, Arial Narrow, sans-serif" font-weight="600" font-size="15" fill="${c}">${ini}</text>`
    : '<path d="M18 26v-4a6 6 0 0 1 12 0v4M16 26h16v11H16z" fill="none" stroke="${B.disabled}" stroke-width="2.2"/>'}
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
<rect x="30" y="18" width="200" height="104" rx="12" fill="${B.bgPanel}" stroke="${B.cream}" stroke-opacity=".5" stroke-width="2"/>
<rect x="40" y="26" width="180" height="88" rx="4" fill="${B.bgElevated}"/>
<path d="M130 70 L104 34 Q130 26 156 34 Z" fill="${B.creamWarm}" opacity=".18"/>
<circle cx="130" cy="72" r="8" fill="${B.cream}" stroke="${B.ally}" stroke-width="2"/>
<circle cx="78" cy="88" r="20" fill="none" stroke="${B.cream}" stroke-opacity=".45" stroke-width="2"/>
<circle cx="84" cy="84" r="8" fill="${B.cream}" fill-opacity=".8"/>
<circle cx="178" cy="78" r="20" fill="none" stroke="${B.cream}" stroke-opacity=".45" stroke-width="2"/>
<circle cx="178" cy="78" r="7" fill="none" stroke="${B.pink}" stroke-width="1.6"/>
<circle cx="194" cy="68" r="8" fill="${B.pink}"/>
<circle cx="204" cy="100" r="7" fill="none" stroke="${B.pink}" stroke-width="2"/><circle cx="214" cy="84" r="5.5" fill="none" stroke="${B.border}" stroke-width="1.6"/>
<path d="M8 120 Q20 96 60 92 L74 100 Q46 112 34 136 Z" fill="${B.purpleDeep}" stroke="${B.cream}" stroke-opacity=".35"/>
<path d="M252 120 Q240 96 200 88 L186 96 Q214 110 226 136 Z" fill="${B.purpleDeep}" stroke="${B.cream}" stroke-opacity=".35"/>
<text x="78" y="133" text-anchor="middle" fill="${B.pink}" font-family="Barlow Cond, sans-serif" font-size="11" font-weight="600">MOVE</text>
<text x="180" y="133" text-anchor="middle" fill="${B.pink}" font-family="Barlow Cond, sans-serif" font-size="11" font-weight="600">AIM + FIRE</text>
</svg>`;
  }
  const key = (x: number, y: number, k: string, w = 22) => `<rect x="${x}" y="${y}" width="${w}" height="22" rx="4" fill="${B.bgElevated}" stroke="${B.cream}" stroke-opacity=".55" stroke-width="1.5"/><text x="${x + w / 2}" y="${y + 15.5}" text-anchor="middle" fill="${B.cream}" font-family="Plex Mono, monospace" font-size="11" font-weight="600">${k}</text>`;
  return `<svg viewBox="0 0 260 140" class="controls" role="img" aria-label="WASD moves, mouse aims, click fires, Space ability, R reload">
${key(46, 22, 'W')}${key(20, 48, 'A')}${key(46, 48, 'S')}${key(72, 48, 'D')}${key(20, 80, 'SHIFT', 48)}${key(20, 108, 'SPACE', 74)}${key(104, 108, 'R')}
<text x="104" y="64" fill="${B.pink}" font-family="Barlow Cond, sans-serif" font-size="11" font-weight="600">MOVE</text>
<text x="74" y="96" fill="${B.border}" font-family="Barlow Cond, sans-serif" font-size="10">creep</text>
<text x="132" y="124" fill="${B.border}" font-family="Barlow Cond, sans-serif" font-size="10">ability · reload</text>
<rect x="186" y="26" width="46" height="72" rx="23" fill="${B.bgElevated}" stroke="${B.cream}" stroke-opacity=".55" stroke-width="1.5"/>
<path d="M186 54 H232 M209 26 V54" stroke="${B.cream}" stroke-opacity=".55" stroke-width="1.5"/>
<path d="M188 52 V49 A21 21 0 0 1 207 28 H207 V52 Z" fill="${B.pink}" opacity=".85"/>
<text x="209" y="116" text-anchor="middle" fill="${B.pink}" font-family="Barlow Cond, sans-serif" font-size="11" font-weight="600">AIM · HOLD TO FIRE</text>
</svg>`;
}
