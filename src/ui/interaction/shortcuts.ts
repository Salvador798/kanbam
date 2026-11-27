export type ShortcutAction = 'new-task' | 'focus-search' | 'undo' | 'redo' | 'close';

export interface ShortcutEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly targetTagName: string;
  readonly targetIsContentEditable: boolean;
  /** True while a modal dialog is open: every shortcut except Escape is ignored. */
  readonly isModalOpen?: boolean;
}

const TEXT_ENTRY_TAGS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTextEntry(event: ShortcutEventLike): boolean {
  return event.targetIsContentEditable || TEXT_ENTRY_TAGS.has(event.targetTagName.toUpperCase());
}

function resolveHistory(event: ShortcutEventLike): ShortcutAction | null {
  if (event.altKey) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (key === 'z' && (event.ctrlKey || event.metaKey)) {
    return event.shiftKey ? 'redo' : 'undo';
  }
  if (key === 'y' && event.ctrlKey && !event.shiftKey) {
    return 'redo';
  }
  return null;
}

function resolvePlain(event: ShortcutEventLike): ShortcutAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  if (event.key.toLowerCase() === 'n') {
    return 'new-task';
  }
  return event.key === '/' ? 'focus-search' : null;
}

export function resolveShortcut(event: ShortcutEventLike): ShortcutAction | null {
  if (event.key === 'Escape') {
    return 'close';
  }
  if (event.isModalOpen === true || isTextEntry(event)) {
    return null;
  }
  return resolveHistory(event) ?? resolvePlain(event);
}

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

export interface KeydownTarget {
  addEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void;
  removeEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void;
}

function toEventLike(event: KeyboardEvent, isModalOpen: boolean): ShortcutEventLike {
  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
  return {
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    targetTagName: target?.tagName ?? '',
    targetIsContentEditable: target?.isContentEditable === true,
    isModalOpen,
  };
}

export function bindShortcuts(
  target: KeydownTarget,
  handlers: ShortcutHandlers,
  isModalOpen: () => boolean = () => false,
): () => void {
  const listener = (event: KeyboardEvent): void => {
    const action = resolveShortcut(toEventLike(event, isModalOpen()));
    const handler = action === null ? undefined : handlers[action];
    if (handler) {
      event.preventDefault();
      handler();
    }
  };
  target.addEventListener('keydown', listener);
  return () => target.removeEventListener('keydown', listener);
}
