import type { Priority, Task } from '../core/types.ts';
import { escapeHtml, htmlToElement } from '../utils/dom.ts';

const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TaskCard({ task, onEdit, onDelete }: TaskCardProps): HTMLElement {
  const card = htmlToElement(`
    <article class="task-card" draggable="true" data-task-id="${escapeHtml(task.id)}">
      <div class="task-badges">
        <span class="badge badge-label-${task.label.toLowerCase()}">${escapeHtml(task.label)}</span>
        <span class="badge badge-prio-${task.priority}">${PRIORITY_LABELS[task.priority]}</span>
      </div>
      <h3 class="task-title">${escapeHtml(task.title)}</h3>
      ${task.description.trim() !== '' ? `<p class="task-desc">${escapeHtml(task.description)}</p>` : ''}
      <div class="task-footer">
        <button class="btn btn-ghost btn-sm" type="button" data-action="edit">Editar</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="delete">Eliminar</button>
      </div>
    </article>
  `);

  card.querySelector('[data-action="edit"]')?.addEventListener('click', () => onEdit(task));
  card.querySelector('[data-action="delete"]')?.addEventListener('click', () => onDelete(task));

  return card;
}
