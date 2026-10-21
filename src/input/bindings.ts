// Keyboard + mouse bindings (owner 2026-10-21: PC is a first-class input mode with rebindable keys). Every game action
// the PC player drives goes through here: input.ts reads the bindings, the HUD and the help screens print them, and
// Settings > Controls changes them. A binding is a KeyboardEvent.code, or Mouse0 / Mouse1 / Mouse2 for the buttons.
// Kept on this device only (a preference, owner 2026-10-14: localStorage holds preferences, never progression).
// Touch has no bindings: its controls are the sticks and buttons on the HUD (src/input/input.ts).

export type Action = 'up' | 'down' | 'left' | 'right' | 'creep' | 'fire' | 'reload' | 'ability' | 'grenade' | 'map' | 'pause';

/** The order Settings lists them in, with what each does. LOCKED: WASD move, mouse aim, left click fires, Space ability. */
export const ACTIONS: readonly { id: Action; label: string }[] = [
  { id: 'up', label: 'Move up' }, { id: 'down', label: 'Move down' }, { id: 'left', label: 'Move left' }, { id: 'right', label: 'Move right' },
  { id: 'creep', label: 'Creep (quiet walk)' }, { id: 'fire', label: 'Fire' }, { id: 'reload', label: 'Reload' },
  { id: 'ability', label: 'Ability' }, { id: 'grenade', label: 'Grenade' }, { id: 'map', label: 'Tactical map' }, { id: 'pause', label: 'Pause' },
];

/** Up to two bindings per action (a main and an alternate). */
export const SLOTS = 2;
export type Bindings = Record<Action, string[]>;

export const DEFAULT_BINDINGS: Readonly<Bindings> = {
  up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  creep: ['ShiftLeft', 'ShiftRight'], fire: ['Mouse0'], reload: ['KeyR'], ability: ['Space', 'KeyQ'],
  grenade: ['KeyG', 'Mouse2'], map: ['KeyM'], pause: ['Escape', 'KeyP'],
};

/** Never bindable: Escape always pauses and closes (it also cancels a rebind), Enter confirms menus, Tab moves focus. */
export const RESERVED = new Set(['Escape', 'Enter', 'NumpadEnter', 'Tab', 'MetaLeft', 'MetaRight', 'ContextMenu']);

const STORE = 'chog.bindings';
const copy = (b: Readonly<Bindings>): Bindings => Object.fromEntries(ACTIONS.map(({ id }) => [id, [...b[id]]])) as Bindings;

/** The bindings in use. Mutated in place by rebind/reset so every reader sees the change at once. */
export const bindings: Bindings = copy(DEFAULT_BINDINGS);

const valid = (c: unknown): c is string => typeof c === 'string' && /^(Mouse[0-2]|[A-Za-z][A-Za-z0-9]{0,24})$/.test(c) && !RESERVED.has(c);

/** Pure: a stored value -> bindings. Anything malformed falls back to the default for that action; a code bound twice
 *  keeps its first action only; Escape is always kept on pause. */
export function parseBindings(raw: unknown): Bindings {
  const out = copy(DEFAULT_BINDINGS);
  if (!raw || typeof raw !== 'object') return out;
  for (const { id } of ACTIONS) {
    const v = (raw as Record<string, unknown>)[id];
    if (Array.isArray(v)) out[id] = v.filter(valid).slice(0, SLOTS);
  }
  // A code on two actions (a hand-edited or partial store) stays on the first one only.
  const seen = new Set<string>();
  for (const { id } of ACTIONS) { out[id] = out[id].filter((c) => !seen.has(c)); out[id].forEach((c) => seen.add(c)); }
  if (!out.pause.includes('Escape')) out.pause = ['Escape', ...out.pause.filter((c) => c !== 'Escape')].slice(0, SLOTS);
  return out;
}

export function loadBindings(store: Storage | null = safeStore()): void {
  let raw: unknown = null;
  try { raw = JSON.parse(store?.getItem(STORE) ?? 'null'); } catch { raw = null; }
  Object.assign(bindings, parseBindings(raw));
  notify();
}

function save(store: Storage | null = safeStore()): void {
  try { store?.setItem(STORE, JSON.stringify(bindings)); } catch { /* storage blocked: the change lasts this session */ }
}

/** The action a code drives, or null. */
export function actionOf(code: string): Action | null {
  for (const { id } of ACTIONS) if (bindings[id].includes(code)) return id;
  return null;
}
export const isBound = (code: string, a: Action) => bindings[a].includes(code);

/**
 * Binds `code` to `action` in `slot`. A code already used by another action moves here, and that action takes the
 * code this slot held (a swap), so no action is ever left without its main binding by accident. Returns false for a
 * reserved code. Escape stays on pause.
 */
export function rebind(action: Action, slot: number, code: string, store: Storage | null = safeStore()): boolean {
  if (!valid(code) || slot < 0 || slot >= SLOTS) return false;
  if (action === 'pause' && bindings.pause[slot] === 'Escape') return false;
  const old = bindings[action][slot] ?? null;
  const other = actionOf(code);
  if (other && other !== action) {
    const i = bindings[other].indexOf(code);
    if (old && !(other === 'pause' && old === 'Escape')) bindings[other][i] = old; else bindings[other].splice(i, 1);
  }
  const list = bindings[action].filter((c, i) => i === slot || c !== code);
  const at = Math.min(slot, list.length);
  if (at < list.length) list[at] = code; else list.push(code);
  bindings[action] = list.slice(0, SLOTS);
  save(store);
  notify();
  return true;
}

/** Removes the binding in `slot` (the main one can only be replaced, never left empty). */
export function unbind(action: Action, slot: number, store: Storage | null = safeStore()): void {
  if (slot === 0 || !bindings[action][slot]) return;
  bindings[action].splice(slot, 1);
  save(store);
  notify();
}

export function resetBindings(store: Storage | null = safeStore()): void {
  Object.assign(bindings, copy(DEFAULT_BINDINGS));
  try { store?.removeItem(STORE); } catch { /* ignore */ }
  notify();
}

/** Short printable name of a binding: KeyR -> R, ShiftLeft -> Shift, Mouse0 -> Left click. */
export function keyLabel(code: string): string {
  const m: Record<string, string> = { Mouse0: 'Left click', Mouse1: 'Middle click', Mouse2: 'Right click', Space: 'Space', Escape: 'Esc', Backspace: 'Backspace',
    ShiftLeft: 'Shift', ShiftRight: 'Right Shift', ControlLeft: 'Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Alt', AltRight: 'Right Alt', CapsLock: 'Caps',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' };
  if (m[code]) return m[code];
  const k = /^Key([A-Z])$/.exec(code) ?? /^Digit([0-9])$/.exec(code);
  if (k) return k[1];
  const n = /^Numpad(.+)$/.exec(code);
  if (n) return `Num ${n[1]}`;
  return code;
}

/** The main binding of an action, printed ('' when it has none). */
export const mainKey = (a: Action) => (bindings[a][0] ? keyLabel(bindings[a][0]) : '');
/** Every binding of an action, printed: "G / Right click". */
export const allKeys = (a: Action) => bindings[a].map(keyLabel).join(' / ');
/** The four movement keys as one label: WASD by default, else "W A S D" in order. */
export function moveKeys(): string {
  const k = (['up', 'left', 'down', 'right'] as const).map(mainKey);
  return k.join('') === 'WASD' ? 'WASD' : k.join(' ');
}

// Readers (the HUD, open help screens) refresh when the bindings change.
const listeners = new Set<() => void>();
export function onBindingsChange(fn: () => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
function notify(): void { for (const fn of listeners) fn(); }

function safeStore(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
