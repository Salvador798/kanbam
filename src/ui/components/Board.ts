import type { BoardStore } from '../../application/index.ts';
import type { Task } from '../../domain/index.ts';
import { htmlToElement } from '../utils/dom.ts';
import { Column } from './Column.ts';

export interface BoardProps {
  store: BoardStore;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function Board({ store, onEditTask, onDeleteTask }: BoardProps): HTMLElement {
  const main = htmlToElement('<main class="board"></main>');
  const hasActiveFilters = store.hasActiveFilters();

  main.append(
    ...store.getColumns().map((column) =>
      Column({
        column,
        tasks: store.getVisibleColumnTasks(column.id),
        hasActiveFilters,
        onEditTask,
        onDeleteTask,
      }),
    ),
  );
  return main;
}
