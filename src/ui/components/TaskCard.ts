import { PRIORITY_LABELS } from '../../domain/index.ts';
import type { Task } from '../../domain/index.ts';
import { tagBadgeClass } from '../utils/tags.ts';

export interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createActionButton(label: string, action: string, handler: () => void): HTMLButtonElement {
  const button = createElement('button', 'btn btn-ghost btn-sm', label);
  button.type = 'button';
  button.dataset.action = action;
  button.addEventListener('click', handler);
  return button;
}

export function TaskCard({ task, onEdit, onDelete }: TaskCardProps): HTMLElement {
  const card = createElement('article', 'task-card');
  card.draggable = true;
  card.dataset.taskId = task.id;

  const badges = createElement('div', 'task-badges');
  for (const tag of task.tags) {
    badges.append(createElement('span', `badge ${tagBadgeClass(tag)}`.trim(), tag));
  }
  badges.append(
    createElement('span', `badge badge-prio-${task.priority}`, PRIORITY_LABELS[task.priority]),
  );

  const footer = createElement('div', 'task-footer');
  footer.append(
    createActionButton('Editar', 'edit', () => onEdit(task)),
    createActionButton('Eliminar', 'delete', () => onDelete(task)),
  );

  card.append(badges, createElement('h3', 'task-title', task.title));
  if (task.description.trim() !== '') {
    card.append(createElement('p', 'task-desc', task.description));
  }
  card.append(footer);

  return card;
}
