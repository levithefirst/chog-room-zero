// Weapons. Each one changes how you fight, not just a number. Values are PROPOSALS to tune by hand.
// Damage falls off linearly from falloffStart to falloffEnd (u), down to minDamageMul of base.
export type WeaponSound = 'rifle' | 'shotgun' | 'marksman' | 'smg';

export interface WeaponDef {
  id: string;
  name: string;
  damage: number;
  pellets: number;
  falloffStart: number;
  falloffEnd: number;
  minDamageMul: number;
  fireInterval: number;
  // Max deviation either side of the aim, degrees (uniform). Shotgun pellets spread evenly across it.
  spreadDeg: number;
  /** CF-B steady rule: extra spread at full run (scales with speed). Chosen so a running shot at the measured fight
   * range (~5 u) lands about half the time with the rifle family, while a steady one lands every time. */
  moveSpreadDeg: number;
  magazine: number;
  reserve: number;
  reloadSeconds: number;
  bulletSpeed: number;
  bulletLife: number;
  // Share of damage that ignores armour (0..1).
  armorPen: number;
  // Passes through half cover (crates, barriers). Never through walls. RC-8 (owner, 2026-10-13: "solid boxes and walls
  // block sniper shots"): false for every weapon. The flag stays so the rule is explicit and tested, not implied.
  piercesCover: boolean;
  sound: WeaponSound;
  // Presentation: barrel length (u) and tracer width so each gun reads differently.
  barrel: number;
  tracer: number;
  /** Burst weapons: rounds per trigger pull and the gap between them; fireInterval is then the gap between bursts. */
  burst?: number;
  burstGap?: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  // Auto rifle: the honest middle. Accurate in bursts, fine at most ranges.
  rifle: {
    id: 'rifle', name: 'Auto rifle', damage: 18, pellets: 1, falloffStart: 9, falloffEnd: 18, minDamageMul: 0.6,
    fireInterval: 0.11, spreadDeg: 2.5, moveSpreadDeg: 5, magazine: 24, reserve: 72, reloadSeconds: 1.8,
    bulletSpeed: 32, bulletLife: 0.7, armorPen: 0.2, piercesCover: false, sound: 'rifle', barrel: 0.8, tracer: 0.07,
  },
  // Pump shotgun: seven pellets, brutal inside ~4.5 u, weak past 8 u. Rewards corners and doors.
  // P1F rebalance (docs/design/weapons-ttk.md): falloffStart 3->4.5, spread 9->8 so it wins the 4 u duel vs marksman.
  // P1FT (real-sim duels, tests/p1ft-duels.test.ts): it still lost to the rifle at <=4 u (0-38%); damage 12->14,
  // pellets 7->8, spread 8->7.5 -> wins <=4 u vs the rifle, the rifle keeps 6 u+, the marksman keeps its lanes.
  shotgun: {
    id: 'shotgun', name: 'Pump shotgun', damage: 14, pellets: 8, falloffStart: 4.5, falloffEnd: 8, minDamageMul: 0.2,
    fireInterval: 0.8, spreadDeg: 7.5, moveSpreadDeg: 2, magazine: 5, reserve: 20, reloadSeconds: 2.2,
    bulletSpeed: 26, bulletLife: 0.4, armorPen: 0, piercesCover: false, sound: 'shotgun', barrel: 0.65, tracer: 0.05,
  },
  // Marksman: slow, heavy, long reach. Punishes anyone who peeks a long lane. Crates and slabs stop it (RC-8).
  marksman: {
    id: 'marksman', name: 'Marksman rifle', damage: 55, pellets: 1, falloffStart: 22, falloffEnd: 30, minDamageMul: 0.85,
    fireInterval: 0.75, spreadDeg: 0.5, moveSpreadDeg: 9, magazine: 5, reserve: 20, reloadSeconds: 2.1,
    bulletSpeed: 46, bulletLife: 0.65, armorPen: 0.5, piercesCover: false, sound: 'marksman', barrel: 1.05, tracer: 0.09,
  },
  // SMG: fast and loose, strong when moving close, falls apart at range. Damage 11->12 with the free roster: Tabsu
  // lost Mop's Slip and the scripted player won 1 of 40 (tests/rc-victory.test.ts floor is 2); now 4 of 40.
  smg: {
    id: 'smg', name: 'SMG', damage: 12, pellets: 1, falloffStart: 5, falloffEnd: 12, minDamageMul: 0.45,
    fireInterval: 0.07, spreadDeg: 5.5, moveSpreadDeg: 2.5, magazine: 30, reserve: 90, reloadSeconds: 1.5,
    bulletSpeed: 30, bulletLife: 0.5, armorPen: 0.1, piercesCover: false, sound: 'smg', barrel: 0.55, tracer: 0.05,
  },
  // Burst carbine (Yot): three accurate rounds per pull. Reaches further than the rifle, but a missed burst costs
  // the whole cycle and it loses the point-blank trade to shotguns.
  carbine: {
    id: 'carbine', name: 'Burst carbine', damage: 20, pellets: 1, falloffStart: 12, falloffEnd: 22, minDamageMul: 0.7,
    fireInterval: 0.36, spreadDeg: 1.6, moveSpreadDeg: 5, magazine: 24, reserve: 72, reloadSeconds: 2.0, burst: 3, burstGap: 0.07,
    bulletSpeed: 36, bulletLife: 0.7, armorPen: 0.25, piercesCover: false, sound: 'rifle', barrel: 0.85, tracer: 0.07,
  },
  // Drum LMG (Toad): a 60-round drum that holds a lane, loose at range, and the longest reload (2.6 s) to bait.
  // CF: run penalty 3.5 (total 7 deg at a run, like the rifle's 7.5): at +5 Toad won 1 of 40 autopilot runs, 2 at 3.5.
  // Measured: 4.5 deg and a 3.2 s reload left Toad at 0-1 of 40 (tests/rc-victory.test.ts); 15 dmg made him win
  // 74% of all duels (tests/gr-roster.test.ts).
  lmg: {
    id: 'lmg', name: 'Drum LMG', damage: 14, pellets: 1, falloffStart: 8, falloffEnd: 16, minDamageMul: 0.55,
    fireInterval: 0.1, spreadDeg: 3.5, moveSpreadDeg: 3.5, magazine: 60, reserve: 120, reloadSeconds: 2.6,
    bulletSpeed: 30, bulletLife: 0.65, armorPen: 0.15, piercesCover: false, sound: 'rifle', barrel: 0.95, tracer: 0.07,
  },
  // Sawn-off (Bill): two shells that win any fight inside ~4 u, nothing past 6.5 u, then a reload. Duel matrix
  // (tests/gr-roster.test.ts): 15 dmg / 11 deg / 2.5-5.5 u lost even at 3 u, so it hits harder and tighter.
  // SB: 18 -> 9 per pellet, spread 8 -> 5.5. At 18 one shell (162) took any hero but Tonashiro from full health to
  // zero, faster than a reaction (bots wait 0.4-0.65 s), and the CF map made point blank the common first contact:
  // Bill won 33 of 40 autopilot runs (next best 8). Measured lever by lever (40 seeds): shell gap 0.45 s -> 30 wins,
  // speed 1.0 -> 24, no Rush -> 30, a 9 u lamp -> 26, a uniform fairness reach -> 31; damage alone 12-15 -> 16-21
  // (still one-shots the 85 hp heroes). Now no shell kills from full health (81 max, the lowest hero has 85); the
  // second shell is the kill, 0.25 s later, and the tighter fan makes both land when Bill picks the corner: 8 of 40
  // wins (Benja 8), best duel 78%, average 27% (tests/gr-roster.test.ts). Strafing in the open, a shotgun loses.
  sawnoff: {
    id: 'sawnoff', name: 'Sawn-off', damage: 9, pellets: 9, falloffStart: 3.5, falloffEnd: 6.5, minDamageMul: 0.2,
    fireInterval: 0.25, spreadDeg: 5.5, moveSpreadDeg: 2, magazine: 2, reserve: 18, reloadSeconds: 1.5,
    bulletSpeed: 26, bulletLife: 0.32, armorPen: 0, piercesCover: false, sound: 'shotgun', barrel: 0.45, tracer: 0.05,
  },
};

/** Damage of one pellet after travelling `dist` u. */
export function damageAt(w: WeaponDef, dist: number): number {
  if (dist <= w.falloffStart) return w.damage;
  if (dist >= w.falloffEnd) return w.damage * w.minDamageMul;
  const t = (dist - w.falloffStart) / (w.falloffEnd - w.falloffStart);
  return w.damage * (1 - t * (1 - w.minDamageMul));
}
