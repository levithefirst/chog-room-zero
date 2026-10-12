// Restart gate for the end-of-run summary. Pure (no DOM), so it is unit-tested.
// Rule: restart input is ignored for `lockMs` after the summary appears, and only a press that STARTS after
// the lock ends counts. A button held (or spammed) through the death therefore never skips the summary:
// the player has to release and press again.

export const SUMMARY_LOCK_MS = 750;

export interface SummaryGate {
  /** The summary just appeared at `now` (ms). */
  open(now: number): void;
  /** A new press began at `now` (ms). Key auto-repeat must not be reported. */
  press(now: number): void;
  /** May the current press restart? */
  canRestart(): boolean;
}

export function createSummaryGate(lockMs = SUMMARY_LOCK_MS): SummaryGate {
  let lockUntil = Infinity;
  let lastPress = -Infinity;
  return {
    open(now) {
      lockUntil = now + lockMs;
      lastPress = -Infinity;
    },
    press(now) {
      lastPress = now;
    },
    canRestart() {
      return lastPress >= lockUntil;
    },
  };
}

/**
 * RC-1 (PR7-FLOW-003): EVERY input on the end-of-run screen (Again, Change Chog, any button or card, Enter/Space,
 * keys 1-4, touch) is ignored until the gate opens: 0.75 s lock, then a fresh press. Other phases are not gated.
 */
export function overlayInputAllowed(phase: string, gate: SummaryGate): boolean {
  return phase !== 'results' && phase !== 'recap' ? true : phase === 'results' && gate.canRestart();
}
