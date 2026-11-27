import type { BoardStore } from '../../application/index.ts';
import type { Task } from '../../domain/index.ts';
import { htmlToElement } from '../utils/dom.ts';
import { MOVE_ACTIONS, resolveKeyboardMove } from '../interaction/index.ts';
import type { MoveAction } from '../interaction/index.ts';
import { Column } from './Column.ts';

export interface BoardProps {
  store: BoardStore;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function Board({ store, onEditTask, onDeleteTask }: BoardProps): HTMLElement {
  const main = htmlToElement('<main class="board" aria-label="Tablero Kanban"></main>');
  const hasActiveFilters = store.hasActiveFilters();
  const wip = store.getState().wip;

  const board = store.getBoard();
  const getMoves = (task: Task): Record<MoveAction, boolean> => {
    const canMove = (action: MoveAction) =>
      resolveKeyboardMove(board, task.id, MOVE_ACTIONS[action], { altKey: true }) !== null;
    return {
      'move-left': canMove('move-left'),
      'move-up': canMove('move-up'),
      'move-down': canMove('move-down'),
      'move-right': canMove('move-right'),
    };
  };

  main.append(
    ...store.getColumns().map((column) =>
      Column({
        column,
        tasks: store.getVisibleColumnTasks(column.id),
        wip: wip[column.id],
        hasActiveFilters,
        onEditTask,
        onDeleteTask,
        getMoves,
      }),
    ),
  );
  return main;
}
