// Contextual tips (RC-7): each mechanic is explained once, at the moment the player first meets it, in the small
// hint pill (never over the play centre). Pure: main.ts feeds what is true this frame, this picks at most one tip.
// Shown tips are remembered on this device; Settings can turn tips off or replay them.
import type { KeyValueStore } from '../nft/history';
import type { AbilityKind } from '../config/heroes';
import type { PickupKind } from '../sim/world';
import { TUNING } from '../config/tuning';

export type TipId = 'pickup-health' | 'pickup-armor' | 'pickup-ammo' | 'reload' | 'hurt' | 'cover' | 'ability' | 'callout' | 'lastknown';

export interface TipState {
  /** Seconds since the run started. */
  t: number;
  /** Seconds since the last pill (any hint) went away. */
  sinceLastHint: number;
  /** A pill is on screen right now. */
  hintShowing: boolean;
  /** Closest pickup in the player's light (sight cone and range, within a few metres) that they would actually take. */
  wantedPickup: PickupKind | null;
  ammo: number;
  magazine: number;
  reserve: number;
  reloading: boolean;
  abilityReady: boolean;
  /** This frame: the player was hit. */
  hurt: boolean;
  /** This frame: one of the player's bullets was stopped by a crate or slab. */
  blockedShot: boolean;
  /** SB: a teammate made a call this frame. */
  callout?: boolean;
  /** SB: a hostile the player saw has just left every light (its LAST KNOWN ring is on screen). */
  lostContact?: boolean;
}

// Nothing over the opening instruction (the movement pill is shown for 6 s); one tip at a time, spaced out.
export const TIP_START_SECONDS = 7;
export const TIP_GAP_SECONDS = 3;

/** The tip to show now, or null. Urgent ones (being hit, a stopped shot) win over the rest. */
export function nextTip(s: TipState, shown: ReadonlySet<TipId>): TipId | null {
  if (s.t < TIP_START_SECONDS || s.hintShowing || s.sinceLastHint < TIP_GAP_SECONDS) return null;
  const want: TipId[] = [];
  if (s.hurt) want.push('hurt');
  if (s.blockedShot) want.push('cover');
  if (s.wantedPickup) want.push(`pickup-${s.wantedPickup}`);
  if (!s.reloading && s.reserve > 0 && s.ammo <= Math.floor(s.magazine * 0.25)) want.push('reload');
  if (s.callout) want.push('callout');
  if (s.lostContact) want.push('lastknown');
  if (s.abilityReady && s.t >= 12) want.push('ability');
  return want.find((id) => !shown.has(id)) ?? null;
}

const P = TUNING.pickups;

/** Tip text. `touch` picks the control words; `ability` is the operator's own ability. */
export function tipText(id: TipId, touch: boolean, ability: { kind: AbilityKind; name: string; text?: string }): string {
  const abilityKey = touch ? 'the ability button' : 'Space';
  switch (id) {
    case 'pickup-health': return `<b>Health</b> pack: walk over it to heal ${P.health.amount}.`;
    case 'pickup-armor': return `<b>Armour</b> soaks damage before health. Walk over it for +${P.armor.amount}.`;
    case 'pickup-ammo': return `<b>Ammo</b>: walk over it for ${P.ammo.mags} spare magazines.`;
    case 'reload': return `Magazine low. Reload with ${touch ? 'the <b>Reload</b> button' : '<b>R</b>'} before the next fight.`;
    case 'hurt': return 'Hit! The <b>red arc</b> points at the shooter. Break line of sight behind a wall.';
    case 'cover': return 'Crates and slabs <b>stop bullets</b>. Shoot over them from right behind.';
    case 'callout': return 'Your teammates <b>call</b> what they see and hear. A red diamond is where they saw it.';
    case 'lastknown': return 'Lost them. The <b>red dotted ring</b> is where they could be by now: it grows as you wait.';
    case 'ability': {
      const what: Partial<Record<AbilityKind, string>> = {
        mend: 'restores 35 health. Save it for after a fight.',
        dash: 'is a short, quiet burst of speed where you move.',
        sonar: 'shows every hostile within 14 m for 2.5 s. They hear it.',
        barrier: 'drops waist-high cover ahead. It stops bullets, not sight.',
      };
      // A 1:1 signature replaces the hero ability and explains itself.
      const sig = !(ability.kind in what) || !['Patch', 'Slip', 'Ping', 'Slab'].includes(ability.name);
      return `<b>${ability.name}</b> (${abilityKey}) ${sig && ability.text ? ability.text : what[ability.kind] ?? ''}`;
    }
  }
}

export const TIPS_KEY = 'chog-room-zero:tips:v1';

export function loadShownTips(store: KeyValueStore): Set<TipId> {
  try {
    const a = JSON.parse(store.getItem(TIPS_KEY) ?? '[]') as unknown;
    if (Array.isArray(a)) return new Set(a.filter((x): x is TipId => typeof x === 'string') as TipId[]);
  } catch { /* corrupt */ }
  return new Set();
}

export function saveShownTips(store: KeyValueStore, shown: ReadonlySet<TipId>): void {
  try { store.setItem(TIPS_KEY, JSON.stringify([...shown])); } catch { /* storage blocked */ }
}
