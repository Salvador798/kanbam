import { PRIORITY_LABELS } from '../../domain/index.ts';
import type { Task } from '../../domain/index.ts';
import { el } from '../utils/dom.ts';
import type { MoveAction } from '../interaction/index.ts';
import { tagBadgeClass } from '../utils/tags.ts';
import { describeTask, getDueBadge, getSubtaskSummary } from '../view-model.ts';

export interface TaskCardProps {
  task: Task;
  columnTitle?: string;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** Which "Mover" buttons are enabled (disabled at the edges of the board). */
  moves?: Readonly<Record<MoveAction, boolean>>;
}

/** Id of the visually hidden paragraph (rendered once by `App`) describing Alt+arrow movement. */
export const MOVE_HELP_ID = 'kanban-move-help';

const MOVE_BUTTONS: ReadonlyArray<{ action: MoveAction; symbol: string; label: string }> = [
  { action: 'move-left', symbol: '←', label: 'Mover a la columna anterior' },
  { action: 'move-up', symbol: '↑', label: 'Mover hacia arriba' },
  { action: 'move-down', symbol: '↓', label: 'Mover hacia abajo' },
  { action: 'move-right', symbol: '→', label: 'Mover a la columna siguiente' },
];

function MoveControls(task: Task, moves: Readonly<Record<MoveAction, boolean>>): HTMLElement {
  const group = el('div', {
    className: 'task-move',
    attrs: { role: 'group', 'aria-label': `Mover tarjeta: ${task.title}` },
  });
  for (const { action, symbol, label } of MOVE_BUTTONS) {
    const button = el('button', {
      className: 'btn btn-ghost btn-sm task-move-btn',
      text: symbol,
      attrs: { type: 'button', 'aria-label': `${label}: ${task.title}`, title: label },
    });
    button.dataset.action = action;
    button.disabled = !moves[action];
    group.append(button);
  }
  return group;
}

function createActionButton(
  label: string,
  ariaLabel: string,
  action: string,
  handler: () => void,
): HTMLButtonElement {
  const button = el('button', {
    className: 'btn btn-ghost btn-sm',
    text: label,
    attrs: { type: 'button', 'aria-label': ariaLabel },
  });
  button.dataset.action = action;
  button.addEventListener('click', handler);
  return button;
}

/**
 * Card contract for other layers: `article.task-card[data-task-id][data-column-id]`, focusable
 * (`tabindex=0`) with an accessible name; action buttons use `data-action="edit|delete"`.
 */
export function TaskCard({ task, columnTitle, onEdit, onDelete, moves }: TaskCardProps): HTMLElement {
  const card = el('article', {
    className: 'task-card',
    attrs: {
      tabindex: '0',
      'aria-label': describeTask(task, columnTitle),
      'aria-describedby': MOVE_HELP_ID,
    },
  });
  card.draggable = true;
  card.dataset.taskId = task.id;
  card.dataset.columnId = task.columnId;
  card.dataset.priority = task.priority;

  const badges = el('div', { className: 'task-badges' });
  badges.append(
    el('span', {
      className: `badge badge-prio-${task.priority}`,
      text: `Prioridad ${PRIORITY_LABELS[task.priority]}`,
    }),
  );
  for (const tag of task.tags) {
    badges.append(el('span', { className: `badge ${tagBadgeClass(tag)}`.trim(), text: tag }));
  }

  card.append(badges, el('h3', { className: 'task-title', text: task.title }));
  if (task.description.trim() !== '') {
    card.append(el('p', { className: 'task-desc', text: task.description }));
  }

  const meta = el('div', { className: 'task-meta' });
  const due = getDueBadge(task.dueDate);
  if (due) {
    meta.append(
      el('span', { className: `due-badge due-${due.status}`, text: due.text }),
    );
  }
  const summary = getSubtaskSummary(task);
  if (summary !== null) {
    meta.append(
      el('span', {
        className: 'subtask-progress',
        text: `Subtareas ${summary}`,
        attrs: { title: 'Subtareas completadas / total' },
      }),
    );
  }
  if (meta.childElementCount > 0) card.append(meta);

  card.append(
    el(
      'div',
      { className: 'task-footer' },
      ...(moves ? [MoveControls(task, moves)] : []),
      createActionButton('Editar', `Editar tarjeta: ${task.title}`, 'edit', () => onEdit(task)),
      createActionButton('Eliminar', `Eliminar tarjeta: ${task.title}`, 'delete', () =>
        onDelete(task),
      ),
    ),
  );

  return card;
}
