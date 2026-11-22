import { store } from '../core/store.ts';
import { COLUMNS, type Task } from '../core/types.ts';
import { htmlToElement } from '../utils/dom.ts';
import { Column } from './Column.ts';

export interface BoardProps {
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function Board({ onEditTask, onDeleteTask }: BoardProps): HTMLElement {
  const main = htmlToElement('<main class="board"></main>');
  const hasActiveFilters = store.hasActiveFilters();

  const columns = COLUMNS.map((column) =>
    Column({
      column,
      tasks: store.getFilteredTasksByColumn(column.id),
      hasActiveFilters,
      onEditTask,
      onDeleteTask,
    }),
  );

  main.append(...columns);
  return main;
}
