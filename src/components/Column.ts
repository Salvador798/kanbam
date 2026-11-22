import type { ColumnDefinition, Task } from '../core/types.ts';
import { escapeHtml, htmlToElement } from '../utils/dom.ts';
import { TaskCard } from './TaskCard.ts';

export interface ColumnProps {
  column: ColumnDefinition;
  tasks: Task[];
  hasActiveFilters: boolean;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
}

export function Column({
  column,
  tasks,
  hasActiveFilters,
  onEditTask,
  onDeleteTask,
}: ColumnProps): HTMLElement {
  const emptyText = hasActiveFilters
    ? 'Sin coincidencias con los filtros'
    : 'No hay tarjetas aquí';

  const section = htmlToElement(`
    <section class="column" data-column-id="${column.id}">
      <div class="column-header">
        <div class="column-title-group">
          <span class="column-dot" aria-hidden="true"></span>
          <h2 class="column-title">${escapeHtml(column.title)}</h2>
          <span class="column-count">${tasks.length}</span>
        </div>
      </div>
      <div class="column-list" data-column-id="${column.id}"></div>
    </section>
  `);

  const list = section.querySelector<HTMLDivElement>('.column-list');
  if (list) {
    if (tasks.length === 0) {
      list.append(htmlToElement(`<p class="column-empty">${emptyText}</p>`));
    } else {
      const cards = tasks.map((task) =>
        TaskCard({ task, onEdit: onEditTask, onDelete: onDeleteTask }),
      );
      list.append(...cards);
    }
  }

  return section;
}
