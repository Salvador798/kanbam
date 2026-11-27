import { describe, expect, it } from 'vitest';
import { describeMove, resolveKeyboardMove } from '../../../src/ui/interaction/keyboard-move.ts';
import type { BoardState, ColumnId, Task } from '../../../src/domain/index.ts';
import { DEFAULT_COLUMNS } from '../../../src/domain/index.ts';

function task(id: string, columnId: ColumnId, order: number, title = `T ${id}`): Task {
  return {
    id,
    title,
    description: '',
    columnId,
    order,
    priority: 'medium',
    tags: [],
    dueDate: null,
    subtasks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const board: BoardState = {
  columns: DEFAULT_COLUMNS,
  tasks: [
    task('a', 'todo', 0),
    task('b', 'todo', 1),
    task('c', 'todo', 2),
    task('d', 'in_progress', 0),
    task('e', 'done', 0, 'Final'),
  ],
};
const alt = { altKey: true };

describe('resolveKeyboardMove', () => {
  it('reorders up and down inside the column', () => {
    expect(resolveKeyboardMove(board, 'b', 'ArrowUp', alt)).toEqual({
      type: 'reorder',
      columnId: 'todo',
      toIndex: 0,
    });
    expect(resolveKeyboardMove(board, 'b', 'ArrowDown', alt)).toEqual({
      type: 'reorder',
      columnId: 'todo',
      toIndex: 2,
    });
  });

  it('returns null at the first and last position', () => {
    expect(resolveKeyboardMove(board, 'a', 'ArrowUp', alt)).toBeNull();
    expect(resolveKeyboardMove(board, 'c', 'ArrowDown', alt)).toBeNull();
  });

  it('moves to the adjacent column keeping the index when possible', () => {
    expect(resolveKeyboardMove(board, 'a', 'ArrowRight', alt)).toEqual({
      type: 'move',
      toColumnId: 'in_progress',
      toIndex: 0,
    });
  });

  it('clamps the index to the end of a shorter target column', () => {
    expect(resolveKeyboardMove(board, 'c', 'ArrowRight', alt)).toEqual({
      type: 'move',
      toColumnId: 'in_progress',
      toIndex: 1,
    });
  });

  it('moves to the previous column', () => {
    expect(resolveKeyboardMove(board, 'e', 'ArrowLeft', alt)).toEqual({
      type: 'move',
      toColumnId: 'in_review',
      toIndex: 0,
    });
  });

  it('returns null at the first and last column', () => {
    expect(resolveKeyboardMove(board, 'a', 'ArrowLeft', alt)).toBeNull();
    expect(resolveKeyboardMove(board, 'e', 'ArrowRight', alt)).toBeNull();
  });

  it('requires only Alt and a supported key', () => {
    expect(resolveKeyboardMove(board, 'b', 'ArrowUp', {})).toBeNull();
    expect(resolveKeyboardMove(board, 'b', 'ArrowUp', { altKey: true, ctrlKey: true })).toBeNull();
    expect(resolveKeyboardMove(board, 'b', 'ArrowUp', { altKey: true, shiftKey: true })).toBeNull();
    expect(resolveKeyboardMove(board, 'b', 'Enter', alt)).toBeNull();
  });

  it('returns null for an unknown task', () => {
    expect(resolveKeyboardMove(board, 'zzz', 'ArrowUp', alt)).toBeNull();
  });
});

describe('describeMove', () => {
  it('describes a reorder', () => {
    expect(describeMove(board, 'b', { type: 'reorder', columnId: 'todo', toIndex: 0 })).toBe(
      '«T b» movida a la posición 1 de 3 en Por hacer',
    );
  });

  it('describes a column move (target count includes the moved task)', () => {
    expect(
      describeMove(board, 'a', { type: 'move', toColumnId: 'in_progress', toIndex: 1 }),
    ).toBe('«T a» movida a En progreso, posición 2 de 2');
  });

  it('falls back for unknown tasks', () => {
    expect(describeMove(board, 'zzz', { type: 'reorder', columnId: 'todo', toIndex: 0 })).toBe(
      'Tarea no encontrada',
    );
  });
});
