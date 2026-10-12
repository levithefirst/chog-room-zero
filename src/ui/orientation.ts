// The portrait "rotate your phone" prompt (index.html: @media (orientation: portrait) and (max-width: 820px)).
// Kept in sync with that CSS rule; main.ts pauses play while it is shown, so nobody dies behind the prompt.
export const ROTATE_QUERY = '(orientation: portrait) and (max-width: 820px)';
export function rotatePromptShown(w: number, h: number): boolean {
  return h > w && w <= 820;
}
