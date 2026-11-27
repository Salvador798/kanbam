export interface TimerApi<Handle> {
  setTimeout(callback: () => void, delayMs: number): Handle;
  clearTimeout(handle: Handle): void;
}

export interface Debounced<Args extends readonly unknown[]> {
  (...args: Args): void;
  /** Drops the pending call, if any. */
  cancel(): void;
  /** Runs the pending call right away, if any. */
  flush(): void;
}

// Resolved lazily so test doubles installed on `globalThis` (fake timers) are honoured.
const DEFAULT_TIMERS: TimerApi<unknown> = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createDebounced<Args extends readonly unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): Debounced<Args>;
export function createDebounced<Args extends readonly unknown[], Handle>(
  fn: (...args: Args) => void,
  waitMs: number,
  timers: TimerApi<Handle>,
): Debounced<Args>;
export function createDebounced<Args extends readonly unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
  timers: TimerApi<unknown> = DEFAULT_TIMERS,
): Debounced<Args> {
  let handle: unknown;
  let scheduled = false;
  let pending: Args | undefined;

  const cancel = (): void => {
    if (scheduled) timers.clearTimeout(handle);
    scheduled = false;
    handle = undefined;
    pending = undefined;
  };

  const flush = (): void => {
    const args = pending;
    cancel();
    if (args !== undefined) fn(...args);
  };

  const debounced = (...args: Args): void => {
    if (scheduled) timers.clearTimeout(handle);
    pending = args;
    scheduled = true;
    handle = timers.setTimeout(flush, waitMs);
  };

  return Object.assign(debounced, { cancel, flush });
}
