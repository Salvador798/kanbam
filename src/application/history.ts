export const HISTORY_LIMIT = 50;

/** Immutable bounded undo/redo stacks; `past` is oldest-first, `future` is next-first. */
export interface History<T> {
  readonly past: readonly T[];
  readonly future: readonly T[];
}

export interface HistoryStep<T> {
  readonly history: History<T>;
  readonly value: T;
}

export function emptyHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/** Records the state that is being replaced by a new mutation; a new mutation drops the redo stack. */
export function recordChange<T>(history: History<T>, previous: T, limit = HISTORY_LIMIT): History<T> {
  return { past: [...history.past, previous].slice(-limit), future: [] };
}

export function undoStep<T>(history: History<T>, current: T): HistoryStep<T> | null {
  const value = history.past.at(-1);
  if (value === undefined) return null;
  return {
    value,
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
  };
}

export function redoStep<T>(history: History<T>, current: T): HistoryStep<T> | null {
  const value = history.future[0];
  if (value === undefined) return null;
  return {
    value,
    history: { past: [...history.past, current], future: history.future.slice(1) },
  };
}
