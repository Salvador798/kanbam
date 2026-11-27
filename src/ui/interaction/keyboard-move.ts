import { COLUMN_TITLES } from '../../domain/index.ts';
import type { BoardState, ColumnId, Task } from '../../domain/index.ts';

export type MoveIntent =
  | { readonly type: 'reorder'; readonly columnId: ColumnId; readonly toIndex: number }
  | { readonly type: 'move'; readonly toColumnId: ColumnId; readonly toIndex: number };

export interface KeyModifiers {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
}

function columnTasks(board: BoardState, columnId: ColumnId): readonly Task[] {
  return board.tasks.filter((t) => t.columnId === columnId).sort((a, b) => a.order - b.order);
}

function resolveReorder(
  board: BoardState,
  task: Task,
  delta: -1 | 1,
): MoveIntent | null {
  const siblings = columnTasks(board, task.columnId);
  const from = siblings.findIndex((t) => t.id === task.id);
  const toIndex = from + delta;
  if (from < 0 || toIndex < 0 || toIndex >= siblings.length) {
    return null;
  }
  return { type: 'reorder', columnId: task.columnId, toIndex };
}

/** Moves to the adjacent column keeping the same index, clamped to the end of the target. */
function resolveColumnMove(board: BoardState, task: Task, delta: -1 | 1): MoveIntent | null {
  const columns = [...board.columns].sort((a, b) => a.order - b.order);
  const current = columns.findIndex((c) => c.id === task.columnId);
  const target = columns[current + delta];
  if (current < 0 || !target) {
    return null;
  }
  const from = columnTasks(board, task.columnId).findIndex((t) => t.id === task.id);
  const toIndex = Math.min(from, columnTasks(board, target.id).length);
  return { type: 'move', toColumnId: target.id, toIndex };
}

export function resolveKeyboardMove(
  board: BoardState,
  taskId: string,
  key: string,
  modifiers: KeyModifiers,
): MoveIntent | null {
  if (modifiers.altKey !== true || modifiers.ctrlKey || modifiers.metaKey || modifiers.shiftKey) {
    return null;
  }
  const task = board.tasks.find((t) => t.id === taskId);
  if (!task) {
    return null;
  }
  switch (key) {
    case 'ArrowUp':
      return resolveReorder(board, task, -1);
    case 'ArrowDown':
      return resolveReorder(board, task, 1);
    case 'ArrowLeft':
      return resolveColumnMove(board, task, -1);
    case 'ArrowRight':
      return resolveColumnMove(board, task, 1);
    default:
      return null;
  }
}

/** Builds the aria-live message. `board` is the state BEFORE the intent is applied. */
export function describeMove(board: BoardState, taskId: string, intent: MoveIntent): string {
  const task = board.tasks.find((t) => t.id === taskId);
  if (!task) {
    return 'Tarea no encontrada';
  }
  const position = intent.toIndex + 1;
  if (intent.type === 'reorder') {
    const total = columnTasks(board, intent.columnId).length;
    return `«${task.title}» movida a la posición ${position} de ${total} en ${COLUMN_TITLES[intent.columnId]}`;
  }
  const total = columnTasks(board, intent.toColumnId).length + 1;
  return `«${task.title}» movida a ${COLUMN_TITLES[intent.toColumnId]}, posición ${position} de ${total}`;
}
