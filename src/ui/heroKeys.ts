// Hero select: number keys 1..N pick the matching card (cards print "1 · Rifle"...). CHOG-UI-001.
// Uses the physical key code first (works on AZERTY, where Digit3 types '"'), then the typed key.
export function heroForKey(e: { key: string; code: string }, heroes: readonly { id: string }[]): string | null {
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code) ?? /^([0-9])$/.exec(e.key);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= heroes.length ? heroes[n - 1].id : null;
}
