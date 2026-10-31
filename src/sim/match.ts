// Match flow as a small table, so every transition is tested and the UI cannot reach an odd state.
export type Phase = 'title' | 'select' | 'loading' | 'play' | 'pause' | 'recap' | 'results';
export type MatchEvent = 'start' | 'pick' | 'loaded' | 'pause' | 'resume' | 'died' | 'won' | 'recapDone' | 'restart' | 'quit' | 'menu';

const TABLE: Record<Phase, Partial<Record<MatchEvent, Phase>>> = {
  title: { start: 'select' },
  select: { pick: 'loading', quit: 'title' },
  loading: { loaded: 'play' },
  play: { pause: 'pause', died: 'recap', won: 'results' },
  pause: { resume: 'play', restart: 'loading', quit: 'title' },
  recap: { recapDone: 'results' },
  results: { restart: 'loading', quit: 'select', menu: 'title' },
};

/** Next phase, or the same phase when the event does not apply. */
export function nextPhase(p: Phase, e: MatchEvent): Phase {
  return TABLE[p][e] ?? p;
}

/** The sim only advances in play. Pause truly freezes it. */
export function simRuns(p: Phase): boolean {
  return p === 'play';
}
