interface FocusMemory {
  readonly element: Element | null;
  readonly taskId: string | undefined;
  readonly action: string | undefined;
}

/**
 * Remembers the focused element and returns a function that restores it. When the element was
 * replaced by a re-render, it falls back to the matching control inside the same task card.
 */
export function rememberFocus(): () => void {
  const active = document.activeElement;
  const element = active instanceof HTMLElement && active !== document.body ? active : null;
  const memory: FocusMemory = {
    element,
    taskId: element?.closest<HTMLElement>('[data-task-id]')?.dataset.taskId,
    action: element?.dataset.action,
  };
  return () => restoreFocus(memory);
}

function restoreFocus({ element, taskId, action }: FocusMemory): void {
  if (!(element instanceof HTMLElement)) return;
  if (element.isConnected) {
    element.focus();
    return;
  }
  if (taskId === undefined) return;
  const card = Array.from(document.querySelectorAll<HTMLElement>('[data-task-id]')).find(
    (candidate) => candidate.dataset.taskId === taskId,
  );
  if (!card) return;
  const control =
    action === undefined
      ? null
      : Array.from(card.querySelectorAll<HTMLElement>('[data-action]')).find(
          (candidate) => candidate.dataset.action === action,
        );
  (control ?? card).focus();
}
