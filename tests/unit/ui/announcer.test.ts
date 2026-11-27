import { describe, expect, it, vi } from 'vitest';
import { createAnnouncer, createAnnouncementQueue } from '../../../src/ui/interaction/announcer.ts';

describe('createAnnouncementQueue', () => {
  it('clears first and then sets the message on the next tick, even for repeats', () => {
    const calls: string[] = [];
    const schedule = vi.fn((fn: () => void) => fn());
    const q = createAnnouncementQueue((t) => calls.push(t), schedule);
    q.announce('Hola');
    q.announce('Hola');
    expect(calls).toEqual(['', 'Hola', '', 'Hola']);
  });

  it('ignores empty messages', () => {
    const calls: string[] = [];
    createAnnouncementQueue((t) => calls.push(t), (fn) => fn()).announce('  ');
    expect(calls).toEqual([]);
  });
});

describe('createAnnouncer', () => {
  it('appends a polite hidden live region and removes it on destroy', () => {
    const region = {
      setAttribute: vi.fn(),
      className: '',
      style: {} as Record<string, string>,
      textContent: '',
      remove: vi.fn(),
    };
    const doc = { createElement: vi.fn(() => region) };
    const container = { append: vi.fn(), ownerDocument: doc };
    const announcer = createAnnouncer(container as unknown as HTMLElement);
    expect(container.append).toHaveBeenCalledWith(region);
    expect(region.setAttribute).toHaveBeenCalledWith('aria-live', 'polite');
    expect(region.setAttribute).toHaveBeenCalledWith('role', 'status');
    announcer.destroy();
    expect(region.remove).toHaveBeenCalled();
  });
});
