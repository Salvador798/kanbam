import type { ColumnDefinition, Task } from '../../domain/index.ts';
import { TaskCard } from './TaskCard.ts';

export interface ColumnProps {
  column: ColumnDefinition;
  tasks: readonly Task[];
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
  const section = document.createElement('section');
  section.className = 'column';
  section.dataset.columnId = column.id;

  const dot = document.createElement('span');
  dot.className = 'column-dot';
  dot.setAttribute('aria-hidden', 'true');

  const title = document.createElement('h2');
  title.className = 'column-title';
  title.textContent = column.title;

  const count = document.createElement('span');
  count.className = 'column-count';
  count.textContent = String(tasks.length);

  const titleGroup = document.createElement('div');
  titleGroup.className = 'column-title-group';
  titleGroup.append(dot, title, count);

  const header = document.createElement('div');
  header.className = 'column-header';
  header.append(titleGroup);

  const list = document.createElement('div');
  list.className = 'column-list';
  list.dataset.columnId = column.id;

  if (tasks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'column-empty';
    empty.textContent = hasActiveFilters
      ? 'Sin coincidencias con los filtros'
      : 'No hay tarjetas aquí';
    list.append(empty);
  } else {
    list.append(
      ...tasks.map((task) => TaskCard({ task, onEdit: onEditTask, onDelete: onDeleteTask })),
    );
  }

  section.append(header, list);
  return section;
}
