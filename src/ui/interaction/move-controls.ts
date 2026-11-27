import type { BoardStore } from '../../application/index.ts';
import { resolveKeyboardMove } from './keyboard-move.ts';
import type { MoveRunner } from './move-runner.ts';

/** `data-action` of each "Mover" button and the arrow key whose intent it reuses. */
export const MOVE_ACTIONS = {
  'move-left': 'ArrowLeft',
  'move-up': 'ArrowUp',
  'move-down': 'ArrowDown',
  'move-right': 'ArrowRight',
} as const;

export type MoveAction = keyof typeof MOVE_ACTIONS;

function isMoveAction(value: string | undefined): value is MoveAction {
  return value !== undefined && value in MOVE_ACTIONS;
}

/** After the board re-renders, focus the card (or the same move button when still enabled). */
function refocus(container: HTMLElement, taskId: string, action?: MoveAction): void {
  const card = Array.from(container.querySelectorAll<HTMLElement>('.task-card')).find(
    (candidate) => candidate.dataset.taskId === taskId,
  );
  if (!card) return;
  const button =
    action === undefined
      ? null
      : card.querySelector<HTMLButtonElement>(`button[data-action="${action}"]:not(:disabled)`);
  (button ?? card).focus();
}

/**
 * Keyboard (Alt+arrows on a focused card) and click ("Mover" buttons) movement. Delegated
 * listeners bound once on the board container; returns a function that removes them.
 */
export function setupMoveControls(
  container: HTMLElement,
  store: BoardStore,
  runMove: MoveRunner,
): () => void {
  const move = (card: HTMLElement, key: string, action?: MoveAction) => {
    const taskId = card.dataset.taskId;
    if (taskId === undefined) return false;
    const intent = resolveKeyboardMove(store.getBoard(), taskId, key, { altKey: true });
    if (intent === null) return false;
    if (runMove(taskId, intent)) refocus(container, taskId, action);
    return true;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.altKey || !(event.target instanceof HTMLElement)) return;
    const card = event.target.closest<HTMLElement>('.task-card');
    if (!card) return;
    if (move(card, event.key)) event.preventDefault();
  };

  const onClick = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLElement)) return;
    const button = event.target.closest<HTMLButtonElement>('button[data-action]');
    const action = button?.dataset.action;
    const card = button?.closest<HTMLElement>('.task-card');
    if (!button || !card || !isMoveAction(action)) return;
    move(card, MOVE_ACTIONS[action], action);
  };

  container.addEventListener('keydown', onKeyDown);
  container.addEventListener('click', onClick);
  return () => {
    container.removeEventListener('keydown', onKeyDown);
    container.removeEventListener('click', onClick);
  };
}
