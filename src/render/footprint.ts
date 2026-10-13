// Where cover is drawn, in u. RC-8: the drawn crate or barrier fills its collision tile (inset 0.02 u for the
// keyline), so the edge you see is the edge that stops your body and your bullets. Before RC-8 a barrier was drawn
// as a thin 0.6 u slab across a full 1 u collision tile (bullets stopped on empty-looking floor).
export const COVER_INSET = 0.02;

export function coverDrawBox(_kind: 'crate' | 'barrier', x: number, y: number) {
  return { x0: x + COVER_INSET, y0: y + COVER_INSET, x1: x + 1 - COVER_INSET, y1: y + 1 - COVER_INSET };
}
