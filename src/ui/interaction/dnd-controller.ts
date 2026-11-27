import type { BoardStore } from '../../application/index.ts';
import { isValidColumnId } from '../../domain/index.ts';
import type { ColumnId } from '../../domain/index.ts';
import { computeDropIndex, resolveStoreIndex } from './drop-position.ts';
import type { MoveRunner } from './move-runner.ts';

interface DropTarget {
  readonly column: HTMLElement;
  readonly list: HTMLElement;
  readonly columnId: ColumnId;
}

interface DropPlan {
  /** Card the indicator goes before (null = end of the list). */
  readonly before: HTMLElement | null;
  /** Final index of the dragged card among the visible cards (dragged one excluded). */
  readonly visibleIndex: number;
  readonly visibleIds: readonly string[];
}

function findDropTarget(target: EventTarget | null): DropTarget | null {
  if (!(target instanceof HTMLElement)) return null;
  const column = target.closest<HTMLElement>('.column');
  const list = column?.querySelector<HTMLElement>('.column-list') ?? null;
  const columnId = column?.dataset.columnId;
  if (!column || !list || columnId === undefined || !isValidColumnId(columnId)) return null;
  return { column, list, columnId };
}

function planDrop(list: HTMLElement, clientY: number, draggedTaskId: string): DropPlan {
  const cards = Array.from(list.querySelectorAll<HTMLElement>('.task-card'));
  const rects = cards.map((card) => card.getBoundingClientRect());
  const draggedIndex = cards.findIndex((card) => card.dataset.taskId === draggedTaskId);
  const insertion = computeDropIndex(clientY, rects);
  const visibleIndex = computeDropIndex(clientY, rects, draggedIndex === -1 ? undefined : draggedIndex);
  const visibleIds = cards
    .filter((card) => card.dataset.taskId !== draggedTaskId)
    .map((card) => card.dataset.taskId ?? '');
  return { before: cards[insertion] ?? null, visibleIndex, visibleIds };
}

/**
 * Native HTML5 drag & drop on the board container. Listeners are delegated and bound once, so
 * they survive the board re-render. Returns a function that removes them.
 */
export function setupBoardDnd(
  container: HTMLElement,
  store: BoardStore,
  runMove: MoveRunner,
): () => void {
  let draggedTaskId: string | null = null;

  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  indicator.setAttribute('aria-hidden', 'true');

  const clearVisualState = () => {
    container.querySelectorAll('.column.drag-over').forEach((col) => col.classList.remove('drag-over'));
    container.querySelectorAll('.task-card.dragging').forEach((card) => card.classList.remove('dragging'));
    indicator.remove();
  };

  const onDragStart = (event: DragEvent) => {
    if (!(event.target instanceof HTMLElement)) return;
    const card = event.target.closest<HTMLElement>('.task-card');
    const taskId = card?.dataset.taskId;
    if (!card || !taskId) return;

    draggedTaskId = taskId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', taskId);
    }
    // deferred so the browser snapshots the card before it is dimmed
    requestAnimationFrame(() => {
      if (draggedTaskId === taskId) card.classList.add('dragging');
    });
  };

  const onDragOver = (event: DragEvent) => {
    if (draggedTaskId === null) return;
    const drop = findDropTarget(event.target);
    if (!drop) return;

    // required for the browser to allow the drop
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    container.querySelectorAll('.column.drag-over').forEach((col) => {
      if (col !== drop.column) col.classList.remove('drag-over');
    });
    drop.column.classList.add('drag-over');

    const { before } = planDrop(drop.list, event.clientY, draggedTaskId);
    if (before) {
      if (indicator.nextElementSibling !== before) drop.list.insertBefore(indicator, before);
    } else if (indicator.parentElement !== drop.list || indicator.nextElementSibling !== null) {
      drop.list.append(indicator);
    }
  };

  const onDragLeave = (event: DragEvent) => {
    if (!(event.target instanceof HTMLElement)) return;
    const column = event.target.closest<HTMLElement>('.column');
    if (!column) return;
    // moving between children of the same column is not leaving it
    if (!(event.relatedTarget instanceof Node) || !column.contains(event.relatedTarget)) {
      column.classList.remove('drag-over');
      if (column.contains(indicator)) indicator.remove();
    }
  };

  const onDrop = (event: DragEvent) => {
    const drop = findDropTarget(event.target);
    if (!drop) return;
    event.preventDefault();

    const taskId = draggedTaskId ?? event.dataTransfer?.getData('text/plain') ?? '';
    const plan = taskId === '' ? null : planDrop(drop.list, event.clientY, taskId);
    clearVisualState();
    draggedTaskId = null;
    if (taskId === '' || plan === null) return;

    const dragged = store.getBoard().tasks.find((task) => task.id === taskId);
    if (!dragged) return;
    const fullIds = store
      .getColumnTasks(drop.columnId)
      .filter((task) => task.id !== taskId)
      .map((task) => task.id);
    const toIndex = resolveStoreIndex(fullIds, plan.visibleIds, plan.visibleIndex);

    if (dragged.columnId === drop.columnId) {
      const currentIndex = store.getColumnTasks(drop.columnId).findIndex((task) => task.id === taskId);
      if (currentIndex === toIndex) return;
      runMove(taskId, { type: 'reorder', columnId: drop.columnId, toIndex });
    } else {
      runMove(taskId, { type: 'move', toColumnId: drop.columnId, toIndex });
    }
  };

  const onDragEnd = () => {
    clearVisualState();
    draggedTaskId = null;
  };

  container.addEventListener('dragstart', onDragStart);
  container.addEventListener('dragover', onDragOver);
  container.addEventListener('dragleave', onDragLeave);
  container.addEventListener('drop', onDrop);
  container.addEventListener('dragend', onDragEnd);
  return () => {
    container.removeEventListener('dragstart', onDragStart);
    container.removeEventListener('dragover', onDragOver);
    container.removeEventListener('dragleave', onDragLeave);
    container.removeEventListener('drop', onDrop);
    container.removeEventListener('dragend', onDragEnd);
  };
}
