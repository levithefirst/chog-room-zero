// V2 (forensic report §3.16 + defect check 2026-10-18): after Resume the hidden pause card keeps its buttons and the
// one that was pressed keeps focus. Enter on it must never act during play (a hidden "Leave match" left the online
// match with the screen still in play), and a key pressed while paused is not an order for the resumed match.
import { describe, expect, it, beforeAll } from 'vitest';
import { createSummaryGate, overlayInputAllowed } from '../src/input/gate';

class Doc extends EventTarget { visibilityState = 'visible'; }
beforeAll(() => {
  const win = new EventTarget() as unknown as Record<string, unknown>;
  Object.assign(win, { innerWidth: 1280, innerHeight: 720 });
  Object.assign(globalThis, { window: win, document: new Doc(), matchMedia: () => ({ matches: false }) });
});
const key = (type: string, code: string) => Object.assign(new Event(type), { code, key: code === 'Space' ? ' ' : code, repeat: false, preventDefault() {} });

describe('hidden menus never act during play', () => {
  it('no overlay press (tap, click or key on a focused button) is accepted while playing', () => {
    const g = createSummaryGate();
    expect(overlayInputAllowed('play', g)).toBe(false);
    expect(overlayInputAllowed('pause', g)).toBe(true);
    expect(overlayInputAllowed('title', g)).toBe(true);
  });
  it('Space pressed on the pause card does not fire the ability when play resumes', async () => {
    const { createInput } = await import('../src/input/input');
    const inp = createInput(new EventTarget() as unknown as HTMLElement);
    (window as unknown as EventTarget).dispatchEvent(key('keydown', 'Space'));
    (window as unknown as EventTarget).dispatchEvent(key('keyup', 'Space'));
    inp.holdFireUntilRelease(); // go('resume')
    expect(inp.read(640, 360).ability).toBe(false);
    // A fresh press after resuming works.
    (window as unknown as EventTarget).dispatchEvent(key('keydown', 'Space'));
    expect(inp.read(640, 360).ability).toBe(true);
    inp.dispose();
  });
});
