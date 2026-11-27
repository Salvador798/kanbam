import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebounced } from '../../../src/application/index.ts';

describe('createDebounced', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls once with the last arguments after the quiet period', () => {
    const fn = vi.fn();
    const debounced = createDebounced(fn, 200);

    debounced('a');
    vi.advanceTimersByTime(150);
    debounced('b');
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('b');
  });

  it('cancel drops the pending call', () => {
    const fn = vi.fn();
    const debounced = createDebounced(fn, 100);

    debounced('x');
    debounced.cancel();
    vi.advanceTimersByTime(500);

    expect(fn).not.toHaveBeenCalled();
  });

  it('flush runs the pending call immediately and only once', () => {
    const fn = vi.fn();
    const debounced = createDebounced(fn, 100);

    debounced('x');
    debounced.flush();
    vi.advanceTimersByTime(500);
    debounced.flush();

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('x');
  });

  it('uses injected timer functions', () => {
    const scheduled: Array<() => void> = [];
    const cleared: number[] = [];
    const fn = vi.fn();
    const debounced = createDebounced(fn, 50, {
      setTimeout: (callback) => scheduled.push(callback),
      clearTimeout: (handle) => {
        cleared.push(handle);
      },
    });

    debounced(1);
    debounced(2);

    expect(cleared).toEqual([1]);
    scheduled[1]?.();
    expect(fn).toHaveBeenCalledWith(2);
  });
});
