// Tactical diagrams drawn from the game's real numbers (TUNING, HEROES, WEAPONS). 1 m = `k` px. Build time only.
import { TUNING, HEROES, WEAPONS, damageAt, type HeroDef } from './facts';
import { esc, n } from './html';

const V = TUNING.vision, S = TUNING.sound;

/** One operator's light cone: walking (base), steady (narrower, longer) and running (wider, shorter). */
export function coneSvg(h: HeroDef): string {
  const k = 22, pad = 18, R = h.vision.range * (1 + V.focusRange);
  const W = Math.round(R * k + pad * 2 + 40), H = 260, cx = pad + 10, cy = H / 2;
  const wedge = (range: number, deg: number, cls: string) => {
    const a = (deg / 2) * Math.PI / 180, r = range * k;
    return `<path class="${cls}" d="M${cx} ${cy} L${cx + r * Math.cos(-a)} ${cy + r * Math.sin(-a)} A${r} ${r} 0 0 1 ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)} Z"/>`;
  };
  const run = wedge(h.vision.range * (1 - V.runRange), h.vision.coneDeg * (1 + V.focusCone), 'cone-run');
  const walk = wedge(h.vision.range, h.vision.coneDeg, 'cone-walk');
  const steady = wedge(h.vision.range * (1 + V.focusRange), h.vision.coneDeg * (1 - V.focusCone), 'cone-steady');
  const near = `<circle class="cone-near" cx="${cx}" cy="${cy}" r="${V.nearRadius * k}"/>`;
  const ticks = Array.from({ length: Math.floor(R) + 1 }, (_, i) => `<line class="tick" x1="${cx + i * k}" y1="${H - 26}" x2="${cx + i * k}" y2="${H - (i % 5 ? 22 : 16)}"/>`).join('');
  return `<svg class="dg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(h.name)}'s vision cone: ${h.vision.coneDeg} degrees to ${h.vision.range} metres walking, ${n(h.vision.coneDeg * (1 - V.focusCone))} degrees to ${n(h.vision.range * (1 + V.focusRange))} metres steady, ${n(h.vision.coneDeg * (1 + V.focusCone))} degrees to ${n(h.vision.range * (1 - V.runRange))} metres running.">
${run}${walk}${steady}${near}<circle class="me" cx="${cx}" cy="${cy}" r="${TUNING.movement.radius * k}"/>
<line class="axis" x1="${cx}" y1="${H - 26}" x2="${cx + R * k}" y2="${H - 26}"/>${ticks}<text class="lbl" x="${cx + 5 * k}" y="${H - 6}" text-anchor="middle">5 m</text><text class="lbl" x="${cx + 10 * k}" y="${H - 6}" text-anchor="middle">${R >= 10 ? '10 m' : ''}</text>
<text class="lbl steady" x="${cx + h.vision.range * (1 + V.focusRange) * k}" y="${cy - 6}" text-anchor="end">steady ${n(h.vision.range * (1 + V.focusRange))} m</text>
<text class="lbl" x="${cx + 8}" y="22">walking: ${h.vision.coneDeg}&#176; to ${h.vision.range} m</text>
<text class="lbl run" x="${cx + 8}" y="40">running: ${n(h.vision.coneDeg * (1 + V.focusCone))}&#176; to ${n(h.vision.range * (1 - V.runRange))} m</text>
<text class="lbl near" x="${cx + V.nearRadius * k + 6}" y="${cy + 30}">always seen within ${V.nearRadius} m</text></svg>`;
}

/** Footstep radii: run, run through a wall, creep, steady (silent). Concentric, to scale. */
export function soundSvg(): string {
  const k = 14, R = S.runStep, W = Math.round(R * k * 2 + 260), H = Math.round(R * k * 2 + 40), cx = R * k + 20, cy = H / 2;
  const ring = (r: number, cls: string) => `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r * k}"/>`;
  const rows: [string, string, string][] = [
    ['ring-run', `Running: footsteps carry ${S.runStep} m`, ''],
    ['ring-wall', `Running, heard through a wall: ${n(S.runStep * S.wallFactor)} m`, ''],
    ['ring-creep', `Creeping (Shift): ${S.quietStep} m`, ''],
    ['me', 'Steady (standing or under ' + TUNING.movement.steadySpeed + ' m/s): silent feet', ''],
  ];
  const legend = rows.map(([c, t], i) => `<g transform="translate(${cx + R * k + 24} ${40 + i * 30})"><circle class="${c} key" cx="8" cy="-4" r="7"/><text class="lbl" x="22" y="0">${t}</text></g>`).join('');
  return `<svg class="dg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Footstep sound radii to scale: running ${S.runStep} metres, through a wall ${n(S.runStep * S.wallFactor)} metres, creeping ${S.quietStep} metres, steady silent.">
${ring(S.runStep, 'ring-run')}${ring(S.runStep * S.wallFactor, 'ring-wall')}${ring(S.quietStep, 'ring-creep')}<circle class="me" cx="${cx}" cy="${cy}" r="${TUNING.movement.radius * k * 1.4}"/>
<line class="axis" x1="${cx}" y1="${cy}" x2="${cx + S.runStep * k}" y2="${cy}"/><text class="lbl" x="${cx + S.runStep * k / 2}" y="${cy - 6}" text-anchor="middle">${S.runStep} m</text>${legend}</svg>`;
}

/** All sounds a player makes, as bars to scale. */
export function soundBarsSvg(): string {
  const items: [string, number][] = [['Gunshot', S.shot], ['Grenade blast', TUNING.grenade.boomSound], ['Death', S.death], ['Bullet impact', S.impact], ['Running step', S.runStep], ['Grenade bounce', TUNING.grenade.bounceSound], ['Ability use', S.ability], ['Pickup', S.pickup], ['Reload', S.reload], ['Grenade throw', TUNING.grenade.throwSound], ['Creeping step', S.quietStep]];
  const k = 14, W = 160 + 22 * k + 60, H = items.length * 26 + 30;
  const bars = items.map(([t, r], i) => `<text class="lbl" x="150" y="${24 + i * 26}" text-anchor="end">${t}</text><rect class="bar" x="160" y="${11 + i * 26}" width="${r * k}" height="16" rx="2"/><text class="lbl val" x="${166 + r * k}" y="${24 + i * 26}">${r} m</text>`).join('');
  return `<svg class="dg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="How far each sound carries in the open: ${items.map(([t, r]) => `${t} ${r} metres`).join(', ')}.">${bars}</svg>`;
}

/** Line of sight vs half cover: sight passes a crate, bullets stop unless the shooter is within the lean distance. */
export function coverSvg(): string {
  const k = 36, lean = TUNING.combat.coverLean, W = 640, H = 250;
  const crateX = 300, y1 = 70, y2 = 185;
  const shooterFar = 70, shooterNear = crateX - lean * k + 4;
  return `<svg class="dg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Half cover: a crate never blocks sight, but stops bullets unless the shooter stands within ${lean} metres of it and shoots over. A wall blocks both.">
<text class="lbl" x="16" y="26">Far from the crate: you can SEE over it, your bullets STOP on it</text>
<line class="los" x1="${shooterFar}" y1="${y1}" x2="560" y2="${y1}"/><line class="shot stop" x1="${shooterFar}" y1="${y1 + 8}" x2="${crateX - 2}" y2="${y1 + 8}"/>
<rect class="crate" x="${crateX}" y="${y1 - 16}" width="${k * 0.9}" height="40"/><circle class="me" cx="${shooterFar}" cy="${y1}" r="12"/><circle class="foe" cx="560" cy="${y1}" r="12"/>
<text class="lbl" x="16" y="${y2 - 44}">Within ${lean} m of it: you lean over, the shot goes through</text>
<rect class="lean" x="${crateX - lean * k}" y="${y2 - 22}" width="${lean * k}" height="44"/><text class="lbl small" x="${crateX - lean * k / 2}" y="${y2 + 40}" text-anchor="middle">${lean} m</text>
<line class="los" x1="${shooterNear}" y1="${y2}" x2="560" y2="${y2}"/><line class="shot" x1="${shooterNear}" y1="${y2 + 8}" x2="548" y2="${y2 + 8}"/>
<rect class="crate" x="${crateX}" y="${y2 - 16}" width="${k * 0.9}" height="40"/><circle class="me" cx="${shooterNear}" cy="${y2}" r="12"/><circle class="foe" cx="560" cy="${y2}" r="12"/>
<g transform="translate(400 222)"><line class="los" x1="0" y1="0" x2="26" y2="0"/><text class="lbl small" x="32" y="4">sight</text><line class="shot" x1="80" y1="0" x2="106" y2="0"/><text class="lbl small" x="112" y="4">bullets</text></g></svg>`;
}

/** Damage per pellet over distance, every weapon, to scale (damageAt from src/config/weapons.ts). */
export function falloffSvg(): string {
  const W = 680, H = 300, x0 = 54, y0 = 20, pw = 580, ph = 230, maxD = 32, maxDmg = 60;
  const X = (d: number) => x0 + (d / maxD) * pw, Y = (v: number) => y0 + ph - (v / maxDmg) * ph;
  const ws = Object.values(WEAPONS);
  const lines = ws.map((w, i) => {
    const pts = Array.from({ length: 65 }, (_, j) => { const d = (j / 64) * maxD; return `${X(d).toFixed(1)},${Y(damageAt(w, d)).toFixed(1)}`; }).join(' ');
    return `<polyline class="fo fo${i}" points="${pts}"/><text class="lbl fo-t fo${i}" x="${X(2)}" y="${Y(w.damage) - 4}">${esc(w.name)}</text>`;
  }).join('');
  const gx = [0, 5, 10, 15, 20, 25, 30].map((d) => `<line class="grid" x1="${X(d)}" y1="${y0}" x2="${X(d)}" y2="${y0 + ph}"/><text class="lbl small" x="${X(d)}" y="${y0 + ph + 18}" text-anchor="middle">${d} m</text>`).join('');
  const gy = [0, 20, 40, 60].map((v) => `<line class="grid" x1="${x0}" y1="${Y(v)}" x2="${x0 + pw}" y2="${Y(v)}"/><text class="lbl small" x="${x0 - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  return `<svg class="dg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Damage of one bullet or pellet against distance for every weapon. ${ws.map((w) => `${w.name}: ${w.damage} up to ${w.falloffStart} metres, ${n(w.damage * w.minDamageMul)} from ${w.falloffEnd} metres`).join('. ')}.">${gx}${gy}${lines}<text class="lbl small" x="${x0}" y="12">damage per bullet or pellet</text></svg>`;
}

/** The danger-zone schedule as a timeline (TUNING.zone). */
export function zoneSvg(): string {
  const Z = TUNING.zone, segs: { t: string; s: number; cls: string }[] = [{ t: 'Open play', s: Z.safeSeconds, cls: 'z-open' }];
  Z.stages.forEach((st, i) => { segs.push({ t: `Warning ${i + 1}`, s: st.warn, cls: 'z-warn' }); segs.push({ t: `Closing to ${st.radius} m (${st.dps}/s outside)`, s: st.shrink, cls: 'z-shrink' }); });
  const total = segs.reduce((a, b) => a + b.s, 0), W = 680, k = (W - 20) / total;
  let x = 10;
  const bars = segs.map((sg, i) => { const w = sg.s * k; const r = `<rect class="${sg.cls}" x="${x.toFixed(1)}" y="40" width="${w.toFixed(1)}" height="34"><title>${sg.t}: ${n(sg.s)} s</title></rect>${w > 34 ? `<text class="lbl small" x="${(x + w / 2).toFixed(1)}" y="62" text-anchor="middle">${n(sg.s)} s</text>` : ''}${i % 2 ? '' : ''}`; x += w; return r; }).join('');
  return `<svg class="dg" viewBox="0 0 ${W} 120" width="${W}" height="120" role="img" aria-label="Danger zone schedule: ${segs.map((s) => `${s.t} ${n(s.s)} seconds`).join(', ')}; then ${Z.finalDps} damage a second outside the last circle. ${n(total)} seconds to the last circle.">
<text class="lbl" x="10" y="26">0 s</text><text class="lbl" x="${W - 10}" y="26" text-anchor="end">${n(total)} s: last circle, ${Z.finalDps}/s outside</text>${bars}
<g transform="translate(10 100)"><rect class="z-open" width="14" height="10"/><text class="lbl small" x="20" y="10">open play</text><rect class="z-warn" x="110" width="14" height="10"/><text class="lbl small" x="130" y="10">next circle shown</text><rect class="z-shrink" x="260" width="14" height="10"/><text class="lbl small" x="280" y="10">circle closing</text></g></svg>`;
}

export const ALL_HEROES = HEROES;
