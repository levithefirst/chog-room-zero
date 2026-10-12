// Shotgun (Brick) vs marksman (Wick) seeded duel model at 2/4/6/9/12 u, stationary and strafing.
// THEORETICAL: uses the in-code weapon/hero numbers (damageAt, mitigate, spread, pellets, bullet speed/life,
// moveSpread) with both sides firing from t=0, aiming at the target's current position (no lead), 0.35 u body.
// Writes the table to docs/design/weapons-ttk.md's data block when TTK_OUT is set; always asserts the design gate.
import { describe, expect, it } from 'vitest';
import { WEAPONS, damageAt, type WeaponDef } from '../src/config/weapons';
import { heroById } from '../src/config/heroes';
import { TUNING } from '../src/config/tuning';
import { mitigate } from '../src/sim/world';

const R = TUNING.movement.radius, DEG = Math.PI / 180;
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

interface Side { w: WeaponDef; hp: number; armor: number; speed: number; cd: number; ammo: number; reload: number }
function side(heroId: string): Side {
  const h = heroById(heroId); const w = WEAPONS[h.weapon];
  return { w, hp: h.maxHp, armor: h.maxArmor, speed: TUNING.movement.maxSpeed * h.speed, cd: 0, ammo: w.magazine, reload: 0 };
}
/** One trigger pull from `a` at range d; target strafes at `tv` u/s perpendicular (both strafe when strafing). */
function fire(a: Side, t: Side, d: number, strafing: boolean, rnd: () => number) {
  const W = a.w, reach = W.bulletSpeed * W.bulletLife;
  if (d > reach) return;
  const sp = W.spreadDeg + (strafing ? TUNING.combat.moveSpreadDeg : 0);
  // Target lateral displacement during flight (no lead); strafes reverse, so the offset is uniform within +-(speed x flight time).
  const drift = strafing ? (t.speed * d / W.bulletSpeed) * (rnd() * 2 - 1) : 0;
  for (let i = 0; i < W.pellets; i++) {
    const base = W.pellets > 1 ? -sp + (2 * sp * i) / (W.pellets - 1) : 0;
    const jit = W.pellets > 1 ? (rnd() * 2 - 1) * (strafing ? TUNING.combat.moveSpreadDeg : 1) : (rnd() * 2 - 1) * sp;
    const lat = Math.tan((base + jit) * DEG) * d - drift;
    if (Math.abs(lat) > R) continue;
    const m = mitigate(t.armor, damageAt(W, d), W.armorPen);
    t.hp -= m.hp; t.armor -= m.armor;
  }
}
function duel(d: number, strafing: boolean, seed: number) {
  const rnd = lcg(seed), A = side('brick'), B = side('wick'), dt = 1 / 120;
  for (let time = 0; time < 12; time += dt) {
    for (const [s, o] of [[A, B], [B, A]] as const) {
      s.cd -= dt;
      if (s.reload > 0) { s.reload -= dt; if (s.reload <= 0) s.ammo = s.w.magazine; continue; }
      if (s.cd <= 0) { fire(s, o, d, strafing, rnd); s.ammo--; s.cd = s.w.fireInterval; if (s.ammo <= 0) s.reload = s.w.reloadSeconds; }
    }
    // Simultaneous resolution within the tick.
    if (A.hp <= 0 || B.hp <= 0) return { win: A.hp > 0 && B.hp <= 0 ? 'shotgun' : B.hp > 0 ? 'marksman' : 'trade', t: time };
  }
  return { win: 'none', t: 12 };
}
export function table(n = 400) {
  const rows: { d: number; mode: string; sg: number; mk: number; trade: number; none: number; ttk: number }[] = [];
  for (const strafing of [false, true]) for (const d of [2, 4, 6, 9, 12]) {
    let sg = 0, mk = 0, tr = 0, no = 0, tt = 0, tc = 0;
    for (let i = 0; i < n; i++) {
      const r = duel(d, strafing, 1000 + i * 7 + d);
      if (r.win === 'shotgun') sg++; else if (r.win === 'marksman') mk++; else if (r.win === 'trade') tr++; else no++;
      if (r.win !== 'none') { tt += r.t; tc++; }
    }
    rows.push({ d, mode: strafing ? 'strafing' : 'stationary', sg: sg / n, mk: mk / n, trade: tr / n, none: no / n, ttk: tc ? tt / tc : NaN });
  }
  return rows;
}
describe('weapons TTK (shotgun vs marksman)', () => {
  const rows = table();
  it('shotgun wins clearly at close range (2 and 4 u, both modes)', () => {
    for (const r of rows.filter((x) => x.d <= 4)) expect(r.sg).toBeGreaterThan(0.6);
  });
  it('marksman wins at long range (12 u)', () => {
    for (const r of rows.filter((x) => x.d === 12)) expect(r.mk).toBeGreaterThan(0.6);
  });
  it('is deterministic', () => {
    expect(table(40)).toEqual(table(40));
  });
  it('prints the table', async () => {
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    if (!env.TTK_OUT) return;
    const fs = await import('node:fs' as string);
    const md = ['| range (u) | mode | shotgun win | marksman win | trade | median-ish TTK (s, mean) |', '|---|---|---|---|---|---|',
      ...rows.map((r) => `| ${r.d} | ${r.mode} | ${(r.sg * 100).toFixed(0)}% | ${(r.mk * 100).toFixed(0)}% | ${(r.trade * 100).toFixed(0)}% | ${r.ttk.toFixed(2)} |`)].join('\n');
    fs.writeFileSync(env.TTK_OUT, md);
  });
});
