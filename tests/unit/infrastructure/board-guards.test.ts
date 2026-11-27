import { describe, expect, it } from 'vitest';
import type { BoardState } from '../../../src/domain/index.ts';
import {
  BOARD_STORAGE_KEY,
  createLocalStorageBoardRepository,
  createSeedBoard,
  exportBoardToJson,
  importBoardFromJson,
  isBoardState,
} from '../../../src/infrastructure/index.ts';
import type { StorageAdapter } from '../../../src/infrastructure/index.ts';

const REFERENCE = new Date('2026-03-10T12:00:00.000Z');

const TASK_KEYS = [
  'columnId',
  'createdAt',
  'description',
  'dueDate',
  'id',
  'order',
  'priority',
  'subtasks',
  'tags',
  'title',
  'updatedAt',
];
const SUBTASK_KEYS = ['completed', 'id', 'title'];
const COLUMN_KEYS = ['id', 'order', 'title', 'wipLimit'];

function dirtyBoardJson(): string {
  const board = createSeedBoard(REFERENCE);
  const dirty = {
    ...board,
    extra: 1,
    columns: board.columns.map((column) => ({ ...column, extra: 'x' })),
    tasks: board.tasks.map((task) => ({
      ...task,
      extra: true,
      subtasks: task.subtasks.map((subtask) => ({ ...subtask, extra: [] })),
    })),
  };
  return JSON.stringify({
    app: JSON.parse(exportBoardToJson(board)).app,
    schemaVersion: 2,
    exportedAt: '2026-03-10T12:00:00.000Z',
    board: dirty,
  });
}

function expectOnlyKnownKeys(board: BoardState): void {
  expect(Object.keys(board).sort()).toEqual(['columns', 'tasks']);
  board.columns.forEach((column) => expect(Object.keys(column).sort()).toEqual(COLUMN_KEYS));
  board.tasks.forEach((task) => {
    expect(Object.keys(task).sort()).toEqual(TASK_KEYS);
    task.subtasks.forEach((subtask) => expect(Object.keys(subtask).sort()).toEqual(SUBTASK_KEYS));
  });
}

function withDuplicateOrder(board: BoardState): BoardState {
  const [first, second, ...rest] = board.tasks.filter((task) => task.columnId === 'todo');
  if (!first || !second) throw new Error('seed needs two todo tasks');
  const clash = { ...second, order: first.order };
  const others = board.tasks.filter((task) => task.columnId !== 'todo');
  return { ...board, tasks: [...others, first, clash, ...rest] };
}

describe('board guards hardening', () => {
  it('strips unknown properties from imported boards', () => {
    const result = importBoardFromJson(dirtyBoardJson());

    expect(result.ok).toBe(true);
    if (result.ok) expectOnlyKnownKeys(result.value);
  });

  it('strips unknown properties from boards loaded from storage', () => {
    const board = createSeedBoard(REFERENCE);
    const dirty = { ...board, tasks: board.tasks.map((task) => ({ ...task, extra: 1 })) };
    const raw = JSON.stringify({
      schemaVersion: 2,
      updatedAt: '2026-03-10T12:00:00.000Z',
      board: dirty,
    });
    const data = new Map([[BOARD_STORAGE_KEY, raw]]);
    const storage: StorageAdapter = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
    };

    const loaded = createLocalStorageBoardRepository({ storage }).load();

    expectOnlyKnownKeys(loaded.board);
  });

  it('rejects two tasks sharing an order inside the same column', () => {
    const board = withDuplicateOrder(createSeedBoard(REFERENCE));

    expect(isBoardState(board)).toBe(false);
    expect(importBoardFromJson(exportBoardToJson(board)).ok).toBe(false);
  });

  it('accepts equal orders in different columns', () => {
    expect(isBoardState(createSeedBoard(REFERENCE))).toBe(true);
  });
});
