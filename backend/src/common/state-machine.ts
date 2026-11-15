/** `same`: already there, so a repeated request is harmless */
export type TransitionOutcome = 'apply' | 'same' | 'invalid';

export interface Transitions<S extends string> {
  decide(from: S, to: S): TransitionOutcome;
}

/** The allowed moves of a stored status; the state diagrams in docs/diagrams/state show the same */
export function defineTransitions<S extends string>(
  table: Record<S, readonly S[]>,
): Transitions<S> {
  return {
    decide: (from, to) => {
      if (from === to) return 'same';
      return table[from].includes(to) ? 'apply' : 'invalid';
    },
  };
}
