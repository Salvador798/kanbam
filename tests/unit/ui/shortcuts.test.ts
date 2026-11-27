import { describe, expect, it, vi } from 'vitest';
import { bindShortcuts, resolveShortcut } from '../../../src/ui/interaction/shortcuts.ts';
import type { ShortcutEventLike } from '../../../src/ui/interaction/shortcuts.ts';

function ev(key: string, extra: Partial<ShortcutEventLike> = {}): ShortcutEventLike {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    targetTagName: 'BODY',
    targetIsContentEditable: false,
    ...extra,
  };
}

describe('resolveShortcut with a modal open', () => {
  it('only keeps Escape while a modal is open', () => {
    expect(resolveShortcut(ev('n', { isModalOpen: true }))).toBeNull();
    expect(resolveShortcut(ev('/', { isModalOpen: true }))).toBeNull();
    expect(resolveShortcut(ev('z', { ctrlKey: true, isModalOpen: true }))).toBeNull();
    expect(resolveShortcut(ev('y', { ctrlKey: true, isModalOpen: true }))).toBeNull();
    expect(resolveShortcut(ev('Escape', { isModalOpen: true }))).toBe('close');
  });

  it('bindShortcuts consults the isModalOpen callback', () => {
    let listener: (e: KeyboardEvent) => void = () => undefined;
    const target = {
      addEventListener: (_t: 'keydown', l: (e: KeyboardEvent) => void) => {
        listener = l;
      },
      removeEventListener: () => undefined,
    };
    let open = true;
    const onNew = vi.fn();
    bindShortcuts(target, { 'new-task': onNew }, () => open);
    const e = {
      key: 'n', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
      target: { tagName: 'BODY', isContentEditable: false }, preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    listener(e);
    expect(onNew).not.toHaveBeenCalled();
    open = false;
    listener(e);
    expect(onNew).toHaveBeenCalledOnce();
  });
});

describe('resolveShortcut', () => {
  it('maps plain keys', () => {
    expect(resolveShortcut(ev('n'))).toBe('new-task');
    expect(resolveShortcut(ev('N'))).toBe('new-task');
    expect(resolveShortcut(ev('/'))).toBe('focus-search');
    expect(resolveShortcut(ev('Escape'))).toBe('close');
  });

  it('maps undo and redo', () => {
    expect(resolveShortcut(ev('z', { ctrlKey: true }))).toBe('undo');
    expect(resolveShortcut(ev('z', { metaKey: true }))).toBe('undo');
    expect(resolveShortcut(ev('y', { ctrlKey: true }))).toBe('redo');
    expect(resolveShortcut(ev('z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(resolveShortcut(ev('Z', { metaKey: true, shiftKey: true }))).toBe('redo');
  });

  it('does not treat Cmd+Y as redo', () => {
    expect(resolveShortcut(ev('y', { metaKey: true }))).toBeNull();
  });

  it('ignores plain keys with modifiers', () => {
    expect(resolveShortcut(ev('n', { ctrlKey: true }))).toBeNull();
    expect(resolveShortcut(ev('n', { altKey: true }))).toBeNull();
    expect(resolveShortcut(ev('/', { metaKey: true }))).toBeNull();
  });

  it('ignores Alt combos for undo/redo', () => {
    expect(resolveShortcut(ev('z', { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it.each(['INPUT', 'TEXTAREA', 'SELECT', 'input'])('ignores typing keys in %s', (tag) => {
    expect(resolveShortcut(ev('n', { targetTagName: tag }))).toBeNull();
    expect(resolveShortcut(ev('/', { targetTagName: tag }))).toBeNull();
    expect(resolveShortcut(ev('z', { ctrlKey: true, targetTagName: tag }))).toBeNull();
    expect(resolveShortcut(ev('y', { ctrlKey: true, targetTagName: tag }))).toBeNull();
  });

  it('ignores typing keys in contenteditable', () => {
    expect(resolveShortcut(ev('n', { targetIsContentEditable: true }))).toBeNull();
  });

  it('always allows Escape', () => {
    expect(resolveShortcut(ev('Escape', { targetTagName: 'INPUT' }))).toBe('close');
    expect(resolveShortcut(ev('Escape', { targetIsContentEditable: true }))).toBe('close');
  });

  it('returns null for other keys', () => {
    expect(resolveShortcut(ev('a'))).toBeNull();
  });
});

describe('bindShortcuts', () => {
  function fakeTarget() {
    let listener: ((e: KeyboardEvent) => void) | null = null;
    const target = {
      addEventListener: vi.fn((_t: string, l: (e: KeyboardEvent) => void) => {
        listener = l;
      }),
      removeEventListener: vi.fn(),
    };
    return { target, fire: (e: KeyboardEvent) => listener?.(e) };
  }

  function keyEvent(key: string, tag = 'BODY'): KeyboardEvent {
    return {
      key,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      target: { tagName: tag, isContentEditable: false },
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
  }

  it('calls the handler, prevents default, and unbinds', () => {
    const { target, fire } = fakeTarget();
    const onNew = vi.fn();
    const unbind = bindShortcuts(target, { 'new-task': onNew });
    const e = keyEvent('n');
    fire(e);
    expect(onNew).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalled();
    fire(keyEvent('n', 'INPUT'));
    expect(onNew).toHaveBeenCalledOnce();
    unbind();
    expect(target.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('does not prevent default when no handler is registered', () => {
    const { target, fire } = fakeTarget();
    bindShortcuts(target, {});
    const e = keyEvent('n');
    fire(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
});
