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
  magazine: number;
  reserve: number;
  reloadSeconds: number;
  bulletSpeed: number;
  bulletLife: number;
  // Share of damage that ignores armour (0..1).
  armorPen: number;
  // Passes through half cover (crates, barriers). Never through walls.
  piercesCover: boolean;
  sound: WeaponSound;
  // Presentation: barrel length (u) and tracer width so each gun reads differently.
  barrel: number;
  tracer: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  // Auto rifle: the honest middle. Accurate in bursts, fine at most ranges.
  rifle: {
    id: 'rifle', name: 'Auto rifle', damage: 18, pellets: 1, falloffStart: 9, falloffEnd: 18, minDamageMul: 0.6,
    fireInterval: 0.11, spreadDeg: 2.5, magazine: 24, reserve: 72, reloadSeconds: 1.8,
    bulletSpeed: 32, bulletLife: 0.7, armorPen: 0.2, piercesCover: false, sound: 'rifle', barrel: 0.8, tracer: 0.07,
  },
  // Pump shotgun: seven pellets, brutal inside 3 u, weak past 8 u. Rewards corners and doors.
  shotgun: {
    id: 'shotgun', name: 'Pump shotgun', damage: 12, pellets: 7, falloffStart: 3, falloffEnd: 8, minDamageMul: 0.2,
    fireInterval: 0.8, spreadDeg: 9, magazine: 5, reserve: 20, reloadSeconds: 2.2,
    bulletSpeed: 26, bulletLife: 0.4, armorPen: 0, piercesCover: false, sound: 'shotgun', barrel: 0.65, tracer: 0.05,
  },
  // Marksman: slow, heavy, punches through crates. Punishes anyone who peeks a long lane.
  marksman: {
    id: 'marksman', name: 'Marksman rifle', damage: 55, pellets: 1, falloffStart: 22, falloffEnd: 30, minDamageMul: 0.85,
    fireInterval: 0.75, spreadDeg: 0.5, magazine: 5, reserve: 20, reloadSeconds: 2.1,
    bulletSpeed: 46, bulletLife: 0.65, armorPen: 0.5, piercesCover: true, sound: 'marksman', barrel: 1.05, tracer: 0.09,
  },
  // SMG: fast and loose, strong when moving close, falls apart at range.
  smg: {
    id: 'smg', name: 'SMG', damage: 11, pellets: 1, falloffStart: 5, falloffEnd: 12, minDamageMul: 0.45,
    fireInterval: 0.07, spreadDeg: 5.5, magazine: 30, reserve: 90, reloadSeconds: 1.5,
    bulletSpeed: 30, bulletLife: 0.5, armorPen: 0.1, piercesCover: false, sound: 'smg', barrel: 0.55, tracer: 0.05,
  },
};

/** Damage of one pellet after travelling `dist` u. */
export function damageAt(w: WeaponDef, dist: number): number {
  if (dist <= w.falloffStart) return w.damage;
  if (dist >= w.falloffEnd) return w.damage * w.minDamageMul;
  const t = (dist - w.falloffStart) / (w.falloffEnd - w.falloffStart);
  return w.damage * (1 - t * (1 - w.minDamageMul));
}
