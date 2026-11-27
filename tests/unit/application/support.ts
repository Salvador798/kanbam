import { createBoardStore } from '../../../src/application/index.ts';
import type { BoardPersistence, BoardStore, Theme } from '../../../src/application/index.ts';
import { createBoard, createTask } from '../../../src/domain/index.ts';
import type { BoardState, CreateTaskInput } from '../../../src/domain/index.ts';
import { exportBoardToJson, importBoardFromJson } from '../../../src/infrastructure/index.ts';

export const NOW = '2026-03-10T12:00:00.000Z';
export const TODAY = new Date('2026-03-10T12:00:00.000Z');

export function buildBoard(inputs: readonly CreateTaskInput[]): BoardState {
  return inputs.reduce((board, input) => {
    const created = createTask(board, { now: NOW, ...input });
    if (!created.ok) throw new Error(created.error.message);
    return created.value;
  }, createBoard());
}

export interface TestPersistence extends BoardPersistence {
  readonly saved: BoardState[];
  failSaves: boolean;
}

export function createTestPersistence(board: BoardState): TestPersistence {
  const saved: BoardState[] = [];
  const persistence: TestPersistence = {
    saved,
    failSaves: false,
    load: () => ({ board }),
    save: (next) => {
      saved.push(next);
      return persistence.failSaves ? { ok: false, error: { message: 'disk full' } } : { ok: true, value: undefined };
    },
    resetDemo: () => ({ ok: true, value: undefined }),
  };
  return persistence;
}

export function createTestStore(
  inputs: readonly CreateTaskInput[] = [],
  options: { theme?: Theme } = {},
): { store: BoardStore; persistence: TestPersistence } {
  const persistence = createTestPersistence(buildBoard(inputs));
  const store = createBoardStore({
    boards: persistence,
    themes: { load: () => options.theme ?? 'light', save: () => undefined },
    serializer: { serialize: (board) => exportBoardToJson(board), deserialize: importBoardFromJson },
    referenceDate: () => TODAY,
  });
  return { store, persistence };
}

export function titlesIn(store: BoardStore, columnId: 'todo' | 'in_progress' | 'in_review' | 'done'): string[] {
  return store.getColumnTasks(columnId).map((task) => task.title);
}
