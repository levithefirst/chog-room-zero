// H34 device capability layer (owner 2026-10-19: "Prefer capability detection over UA-only detection"). What the
// device can do, not what it calls itself: a coarse or fine pointer, hover, and a form factor from the screen's short
// side. The input mode (touch or keyboard and mouse) still follows the last thing you actually used (src/input/input.ts),
// so a touch laptop switches with you; these classes only size the UI. Body classes: dev-phone | dev-tablet |
// dev-desktop, can-hover. Layout height classes (compact, narrow) stay in src/ui/stage.ts.
export type FormFactor = 'phone' | 'tablet' | 'desktop';
export interface DeviceProfile { coarse: boolean; fine: boolean; hover: boolean; touchPoints: number; form: FormFactor }

type MM = (q: string) => { matches: boolean };

/** Pure: the profile from media queries and the screen size (css px). */
export function deviceProfile(w: number, h: number, mm: MM | null, touchPoints = 0): DeviceProfile {
  const q = (s: string) => !!mm && mm(s).matches;
  const coarse = q('(pointer: coarse)') || (q('(any-pointer: coarse)') && !q('(pointer: fine)'));
  const fine = q('(pointer: fine)') || q('(any-pointer: fine)');
  const hover = q('(hover: hover)');
  const short = Math.min(w, h);
  const touchy = coarse || touchPoints > 1;
  // Phone: a small screen. Tablet: a touch screen without hover up to 1100 px on its short side. Else desktop.
  const form: FormFactor = short < 500 ? 'phone' : touchy && !hover && short < 1100 ? 'tablet' : 'desktop';
  return { coarse, fine, hover, touchPoints, form };
}

export function applyDevice(p: DeviceProfile, cls: DOMTokenList = document.body.classList): void {
  for (const f of ['phone', 'tablet', 'desktop'] as const) cls.toggle(`dev-${f}`, p.form === f);
  cls.toggle('can-hover', p.hover);
}

export function currentDevice(): DeviceProfile {
  const mm = typeof matchMedia === 'function' ? (s: string) => matchMedia(s) : null;
  return deviceProfile(screen?.width ?? innerWidth, screen?.height ?? innerHeight, mm, navigator.maxTouchPoints ?? 0);
}
