import type { BoardStore } from '../../application/index.ts';
import type { Announcer } from './announcer.ts';
import { describeMove } from './keyboard-move.ts';
import type { MoveIntent } from './keyboard-move.ts';

export type MoveRunner = (taskId: string, intent: MoveIntent) => boolean;

/**
 * Single path for every way of moving a card (drag & drop, Alt+arrows, "Mover" buttons):
 * applies the intent to the store, announces it (message built from the board BEFORE the move)
 * and reports failures through `onError`.
 */
export function createMoveRunner(
  store: BoardStore,
  announcer: Pick<Announcer, 'announce'>,
  onError: (message: string) => void,
): MoveRunner {
  return (taskId, intent) => {
    const message = describeMove(store.getBoard(), taskId, intent);
    const result =
      intent.type === 'reorder'
        ? store.reorderTask(taskId, intent.toIndex)
        : store.moveTask(taskId, intent.toColumnId, intent.toIndex);
    if (!result.ok) {
      onError(result.error.message);
      return false;
    }
    announcer.announce(message);
    return true;
  };
}
