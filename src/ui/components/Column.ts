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

function WipIndicator(wip: WipEvaluation): HTMLElement | null {
  const view = getWipView(wip);
  if (view === null) return null;

  const indicator = el(
    'span',
    {
      className: view.warning ? 'wip-indicator is-warning' : 'wip-indicator',
      attrs: { 'aria-label': view.ariaLabel, role: 'img' },
    },
    el('span', { text: `WIP ${view.text}`, attrs: { 'aria-hidden': 'true' } }),
  );
  if (view.statusText !== null) {
    indicator.append(el('span', { className: 'wip-status', text: view.statusText, attrs: { 'aria-hidden': 'true' } }));
  }
  indicator.dataset.wipStatus = wip.status;
  return indicator;
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
  if (wip.isAtOrOverLimit) section.classList.add('is-wip-warning');

  const title = el('h2', { className: 'column-title', text: column.title, attrs: { id: titleId } });
  const count = el('span', {
    className: 'column-count',
    text: String(tasks.length),
    attrs: { 'aria-label': `${tasks.length} ${tasks.length === 1 ? 'tarjeta' : 'tarjetas'}` },
  });
  const titleGroup = el(
    'div',
    { className: 'column-title-group' },
    el('span', { className: 'column-dot', attrs: { 'aria-hidden': 'true' } }),
    title,
    count,
  );

  const header = el('div', { className: 'column-header' }, titleGroup);
  const indicator = WipIndicator(wip);
  if (indicator) header.append(indicator);

  const list = el('div', { className: 'column-list' });
  list.dataset.columnId = column.id;

  if (tasks.length === 0) {
    list.append(
      el('p', {
        className: 'column-empty',
        text: hasActiveFilters ? 'Sin coincidencias con los filtros' : 'No hay tarjetas aquí',
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

  section.append(header, list);
  return section;
}
