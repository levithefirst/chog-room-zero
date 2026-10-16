// CF experiment switches (owner 2026-10-16, docs/ROOM_ZERO_CORE_FEEL_AUDIT.md). Each one turns a core-feel change on
// (the shipping default) or off (the game as it was before CF), so its effect can be measured against the old game in
// the sim (tests/cf-lab.test.ts) and felt in the browser (?lab=A0,D0 in a debug build turns A and D off).
// The game server never reads the URL: online always plays the defaults.
export const LAB = {
  /** A: the human body turns toward the aim at TUNING.movement.turnRateDegPerSec, and spreads while it lags. */
  turn: true,
  /** B: per-weapon movement spread (WeaponDef.moveSpreadDeg) with a settle when you stop. Off: flat 2.5 deg. */
  steady: true,
  /** C: your own noise is drawn at its true hearing radius. */
  ownNoise: true,
  /** D: audible bot patrols, listen pauses, step noise by speed, typed heard marks, direction ticks, afterimages. */
  enemySound: true,
  /** E: darker unlit map, lamp shape by gait, pickups remembered not watched, teammate sightings as SPOTTED marks. */
  dark: true,
  /** F: the CF map (pillars, broken lanes, bots further from the spawn). Off: the RC-8 map and spawns. */
  pacing: true,
};

export type LabKey = keyof typeof LAB;
export const LAB_KEYS: Record<string, LabKey> = { A: 'turn', B: 'steady', C: 'ownNoise', D: 'enemySound', E: 'dark', F: 'pacing' };

/** `?lab=A0,E0`: switch experiments off (or `A1` on). Returns the letters it changed. */
export function applyLab(spec: string): string[] {
  const done: string[] = [];
  for (const part of spec.split(',')) {
    const m = /^([A-F])([01])$/.exec(part.trim().toUpperCase());
    if (!m) continue;
    LAB[LAB_KEYS[m[1]]] = m[2] === '1';
    done.push(m[0]);
  }
  return done;
}

/** Every switch back to the shipping default (tests reset between cases). */
export function resetLab(): void {
  for (const k of Object.values(LAB_KEYS)) LAB[k] = true;
}
