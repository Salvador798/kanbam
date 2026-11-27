import type { BoardStore } from '../../application/index.ts';
import { isValidColumnId } from '../../domain/index.ts';

function getCardAfterPointer(list: HTMLElement, clientY: number): HTMLElement | null {
  const cards = Array.from(
    list.querySelectorAll<HTMLElement>('.task-card:not(.dragging)'),
  );

  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (clientY < midpoint) {
      return card;
    }
  }

  return null;
}

export function setupBoardDnd(
  container: HTMLElement,
  store: BoardStore,
  onError: (message: string) => void,
): void {
  let draggedTaskId: string | null = null;

  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';

  const clearVisualState = () => {
    container
      .querySelectorAll('.column.drag-over')
      .forEach((col) => col.classList.remove('drag-over'));
    container
      .querySelectorAll('.task-card.dragging')
      .forEach((card) => card.classList.remove('dragging'));
    indicator.remove();
  };

  container.addEventListener('dragstart', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const card = target.closest<HTMLElement>('.task-card');
    const taskId = card?.dataset.taskId;
    if (!card || !taskId) return;

    draggedTaskId = taskId;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', taskId);
    }

    requestAnimationFrame(() => {
      card.classList.add('dragging');
    });
  });

  container.addEventListener('dragover', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const column = target.closest<HTMLElement>('.column');
    const list = column?.querySelector<HTMLElement>('.column-list');
    if (!column || !list) return;

    // necesario para que el navegador permita el drop
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    container.querySelectorAll('.column.drag-over').forEach((col) => {
      if (col !== column) col.classList.remove('drag-over');
    });
    column.classList.add('drag-over');

    const afterCard = getCardAfterPointer(list, event.clientY);
    if (afterCard) {
      list.insertBefore(indicator, afterCard);
    } else {
      list.append(indicator);
    }
  });

  container.addEventListener('dragleave', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const column = target.closest<HTMLElement>('.column');
    if (!column) return;

    // evita quitar la clase al pasar por hijos internos
    const related = event.relatedTarget;
    if (!(related instanceof Node) || !column.contains(related)) {
      column.classList.remove('drag-over');
      if (column.contains(indicator)) {
        indicator.remove();
      }
    }
  });

  container.addEventListener('drop', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const column = target.closest<HTMLElement>('.column');
    const list = column?.querySelector<HTMLElement>('.column-list');
    const targetColumn = column?.dataset.columnId;
    if (!column || !list || !targetColumn || !isValidColumnId(targetColumn)) return;

    event.preventDefault();

    const taskId = draggedTaskId ?? event.dataTransfer?.getData('text/plain');
    if (!taskId) {
      clearVisualState();
      return;
    }

    const afterCard = getCardAfterPointer(list, event.clientY);
    const afterTaskId = afterCard?.dataset.taskId;

    const remainingInCol = store
      .getColumnTasks(targetColumn)
      .filter((t) => t.id !== taskId);

    const targetIndex = afterTaskId
      ? remainingInCol.findIndex((t) => t.id === afterTaskId)
      : remainingInCol.length;

    clearVisualState();
    draggedTaskId = null;

    const moved = store.moveTask(
      taskId,
      targetColumn,
      targetIndex === -1 ? remainingInCol.length : targetIndex,
    );
    if (!moved.ok) onError(moved.error.message);
  });

  container.addEventListener('dragend', () => {
    clearVisualState();
    draggedTaskId = null;
  });
}
