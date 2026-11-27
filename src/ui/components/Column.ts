import type { ColumnDefinition, Task, WipEvaluation } from '../../domain/index.ts';
import type { MoveAction } from '../interaction/index.ts';
import { el } from '../utils/dom.ts';
import { getWipView } from '../view-model.ts';
import { TaskCard } from './TaskCard.ts';

export interface ColumnProps {
  column: ColumnDefinition;
  tasks: readonly Task[];
  wip: WipEvaluation;
  hasActiveFilters: boolean;
  onEditTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  getMoves?: (task: Task) => Readonly<Record<MoveAction, boolean>>;
}

export function Column({
  column,
  tasks,
  wip,
  hasActiveFilters,
  onEditTask,
  onDeleteTask,
  getMoves,
}: ColumnProps): HTMLElement {
  const titleId = `column-title-${column.id}`;

  const section = el('section', { className: 'column', attrs: { 'aria-labelledby': titleId } });
  section.dataset.columnId = column.id;
  section.dataset.wipStatus = wip.status;

  const title = el('h2', { className: 'column-title', text: column.title, attrs: { id: titleId } });
  const view = getWipView(wip);

  // one accessible name for the whole counter; the visible parts are decorative duplicates
  const countLabel = `${tasks.length} ${tasks.length === 1 ? 'tarjeta' : 'tarjetas'}`;
  const meta = el('span', {
    className: 'column-meta',
    attrs: { role: 'img', 'aria-label': view?.ariaLabel ?? countLabel },
  });
  if (view !== null && view.statusText !== null) {
    meta.append(el('span', { className: 'wip-status', text: view.statusText, attrs: { 'aria-hidden': 'true' } }));
  }
  meta.append(
    el('span', {
      className: 'column-count',
      text: view === null ? String(tasks.length) : view.text,
      attrs: { 'aria-hidden': 'true' },
    }),
  );

  const header = el('div', { className: 'column-header' }, title, meta);

  const fill = el('span', { className: 'capacity-fill' });
  if (wip.limit !== null) {
    fill.style.setProperty('--fill', String(Math.min(1, wip.count / wip.limit)));
  }
  const capacity = el('div', { className: 'capacity', attrs: { 'aria-hidden': 'true' } }, fill);

  const list = el('div', { className: 'column-list' });
  list.dataset.columnId = column.id;

  if (tasks.length === 0) {
    list.append(
      el('p', {
        className: 'column-empty',
        text: hasActiveFilters
          ? 'Sin coincidencias con los filtros.'
          : 'Sin tarjetas. Arrastra una aquí o crea una nueva.',
      }),
    );
  } else {
    list.append(
      ...tasks.map((task) =>
        TaskCard({
          task,
          columnTitle: column.title,
          onEdit: onEditTask,
          onDelete: onDeleteTask,
          moves: getMoves?.(task),
        }),
      ),
    );
  }

  section.append(header, capacity, list);
  return section;
}
