import { describe, expect, it } from 'vitest';
import {
  addSubtask,
  createBoard,
  createTask,
  deleteTask,
  getBoardWipEvaluations,
  getDueDateEvaluation,
  getSubtaskProgress,
  getTasksByColumn,
  moveTask,
  removeSubtask,
  toggleSubtask,
  updateSubtaskTitle,
  updateTask,
} from '../../src/domain/index.ts';
import type { Result, Task } from '../../src/domain/index.ts';
import {
  BOARD_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  createLocalStorageBoardRepository,
  createSeedBoard,
  exportBoardToJson,
  importBoardFromJson,
  isPersistedBoardEnvelope,
} from '../../src/infrastructure/index.ts';
import type { StorageAdapter } from '../../src/infrastructure/index.ts';

function unwrapOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

function unwrapErr<T, E>(result: Result<T, E>): E {
  if (result.ok) {
    throw new Error(`Expected error result, got ok: ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

function createMemoryStorage(initial: Record<string, string> = {}): {
  readonly adapter: StorageAdapter;
  readonly dump: () => Record<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    adapter: {
      getItem: (key: string): string | null => store.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        store.set(key, value);
      },
      removeItem: (key: string): void => {
        store.delete(key);
      },
    },
    dump: (): Record<string, string> => Object.fromEntries(store.entries()),
  };
}

function makeLegacyTask(overrides: Partial<Task> & { readonly id: string }): Task {
  return {
    id: overrides.id,
    title: overrides.title ?? `Tarea legada ${overrides.id}`,
    description: overrides.description ?? 'Descripción migrada',
    columnId: overrides.columnId ?? 'todo',
    order: overrides.order ?? 0,
    priority: overrides.priority ?? 'medium',
    tags: overrides.tags ?? ['Docs'],
    dueDate: overrides.dueDate ?? '2026-11-29',
    subtasks: overrides.subtasks ?? [
      { id: 'sub-leg-1', title: 'Paso completado', completed: true },
      { id: 'sub-leg-2', title: 'Paso pendiente', completed: false },
    ],
    createdAt: overrides.createdAt ?? '2026-10-01T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-10-01T10:00:00.000Z',
  };
}

describe('Tier 3 — Cross-Feature Combinations & Runtime Isolation', () => {
  it('T3-01: Columns/WIP x Move/Reorder x Update enforcement and release lifecycle', () => {
    let board = createBoard();
    board = unwrapOk(createTask(board, { title: 'Pendiente', columnId: 'todo', priority: 'high' }));
    board = unwrapOk(createTask(board, { title: 'Revisión 1', columnId: 'in_review', priority: 'low' }));
    board = unwrapOk(createTask(board, { title: 'Revisión 2', columnId: 'in_review', priority: 'medium' }));

    expect(getBoardWipEvaluations(board).in_review.status).toBe('at_limit');

    const pendingId = getTasksByColumn(board, 'todo')[0]?.id ?? '';
    const rev1Id = getTasksByColumn(board, 'in_review')[0]?.id ?? '';
    const rev2Id = getTasksByColumn(board, 'in_review')[1]?.id ?? '';

    expect(unwrapErr(moveTask(board, pendingId, 'in_review', 0, { enforceWipLimit: true })).code).toBe(
      'WIP_LIMIT_EXCEEDED',
    );

    // Same-column reorder succeeds even at WIP limit
    board = unwrapOk(moveTask(board, rev2Id, 'in_review', 0, { enforceWipLimit: true }));
    expect(getTasksByColumn(board, 'in_review').map((t) => t.id)).toEqual([rev2Id, rev1Id]);

    // Moving a task out via updateTask lowers WIP below limit
    board = unwrapOk(updateTask(board, rev1Id, { columnId: 'done' }, { enforceWipLimit: true }));
    expect(getBoardWipEvaluations(board).in_review.status).toBe('within_limit');

    // Previously blocked move now succeeds
    board = unwrapOk(moveTask(board, pendingId, 'in_review', 1, { enforceWipLimit: true }));
    expect(getBoardWipEvaluations(board).in_review.status).toBe('at_limit');
    expect(getTasksByColumn(board, 'in_review').map((t) => t.id)).toEqual([rev2Id, pendingId]);
  });

  it('T3-02: Tags x Subtasks x Task Update preserves subtasks while normalizing updated tags', () => {
    let board = unwrapOk(
      createTask(createBoard(), {
        title: 'Diseñar componentes',
        columnId: 'todo',
        priority: 'medium',
        tags: [' UI ', 'UI', 'Bug'],
      }),
    );
    const taskId = board.tasks[0]?.id ?? '';
    expect(board.tasks[0]?.tags).toEqual(['UI', 'Bug']);

    board = unwrapOk(addSubtask(board, taskId, { title: 'Sub 1' }));
    board = unwrapOk(addSubtask(board, taskId, { title: 'Sub 2' }));
    board = unwrapOk(addSubtask(board, taskId, { title: 'Sub 3' }));
    const sub1Id = board.tasks[0]?.subtasks[0]?.id ?? '';
    board = unwrapOk(toggleSubtask(board, taskId, sub1Id));

    board = unwrapOk(
      updateTask(board, taskId, {
        title: 'Diseñar componentes accesibles',
        tags: ['Feature', ' Testing ', 'Feature'],
      }),
    );

    const updatedTask = board.tasks[0];
    expect(updatedTask?.title).toBe('Diseñar componentes accesibles');
    expect(updatedTask?.tags).toEqual(['Feature', 'Testing']);
    expect(updatedTask?.subtasks).toHaveLength(3);
    expect(getSubtaskProgress(updatedTask?.subtasks ?? [])).toEqual({
      completed: 1,
      total: 3,
      percentage: 33,
      label: '1/3',
    });
  });

  it('T3-03: Due Dates x Seed Data x Reference Date evaluates temporal drift purely', () => {
    const dayZero = new Date('2026-11-27T12:00:00.000Z');
    const fiveDaysLater = '2026-12-02';
    const seed = createSeedBoard(dayZero);
    const seedSnapshot = structuredClone(seed);

    const dueSoonAtDayZero = seed.tasks.filter(
      (t) => getDueDateEvaluation(t.dueDate, '2026-11-27').status === 'due_soon',
    );
    expect(dueSoonAtDayZero.length).toBeGreaterThanOrEqual(1);

    for (const task of dueSoonAtDayZero) {
      expect(getDueDateEvaluation(task.dueDate, fiveDaysLater).status).toBe('overdue');
    }
    expect(seed).toEqual(seedSnapshot);
  });

  it('T3-04: Task Delete x Move/Reorder x Contiguous Order across columns', () => {
    let board = createBoard();
    board = unwrapOk(createTask(board, { title: 'T0', columnId: 'todo', priority: 'low' }));
    board = unwrapOk(createTask(board, { title: 'T1', columnId: 'todo', priority: 'medium' }));
    board = unwrapOk(createTask(board, { title: 'T2', columnId: 'todo', priority: 'high' }));
    board = unwrapOk(createTask(board, { title: 'T3', columnId: 'todo', priority: 'low' }));

    const todoTasks = getTasksByColumn(board, 'todo');
    const id0 = todoTasks[0]?.id ?? '';
    const id1 = todoTasks[1]?.id ?? '';

    board = unwrapOk(moveTask(board, id1, 'in_progress'));
    board = unwrapOk(deleteTask(board, id0));

    const remainingTodo = getTasksByColumn(board, 'todo');
    expect(remainingTodo.map((t) => [t.title, t.order])).toEqual([
      ['T2', 0],
      ['T3', 1],
    ]);

    const inProgress = getTasksByColumn(board, 'in_progress');
    expect(inProgress.map((t) => [t.title, t.order])).toEqual([['T1', 0]]);
  });

  it('T3-05: Subtask Operations x localStorage Persistence preserves progress and updatedAt', () => {
    const mem = createMemoryStorage();
    const repoA = createLocalStorageBoardRepository({ storage: mem.adapter });
    let board = unwrapOk(
      createTask(createBoard(), {
        title: 'Checklist persistida',
        columnId: 'in_progress',
        priority: 'high',
      }),
    );
    const taskId = board.tasks[0]?.id ?? '';

    board = unwrapOk(addSubtask(board, taskId, { title: 'Paso 1' }, { now: '2026-11-27T10:00:00.000Z' }));
    board = unwrapOk(addSubtask(board, taskId, { title: 'Paso 2' }, { now: '2026-11-27T10:05:00.000Z' }));
    const sub1 = board.tasks[0]?.subtasks[0]?.id ?? '';
    const sub2 = board.tasks[0]?.subtasks[1]?.id ?? '';

    board = unwrapOk(toggleSubtask(board, taskId, sub1, '2026-11-27T10:10:00.000Z'));
    board = unwrapOk(updateSubtaskTitle(board, taskId, sub1, 'Paso 1 verificado', '2026-11-27T10:15:00.000Z'));
    board = unwrapOk(removeSubtask(board, taskId, sub2, '2026-11-27T10:20:00.000Z'));

    expect(repoA.save(board).ok).toBe(true);

    const repoB = createLocalStorageBoardRepository({ storage: mem.adapter });
    const loaded = repoB.load();
    expect(loaded.status).toBe('loaded');

    const reloadedTask = loaded.board.tasks[0];
    expect(reloadedTask?.updatedAt).toBe('2026-11-27T10:20:00.000Z');
    expect(reloadedTask?.subtasks).toHaveLength(1);
    expect(reloadedTask?.subtasks[0]?.title).toBe('Paso 1 verificado');
    expect(getSubtaskProgress(reloadedTask?.subtasks ?? [])).toEqual({
      completed: 1,
      total: 1,
      percentage: 100,
      label: '1/1',
    });
  });

  it('T3-06: Legacy v0/v1 Migration x Tags/Subtasks/Due Dates x Persistence', () => {
    const legacyTask = makeLegacyTask({
      id: 'leg-task-1',
      tags: ['Refactor', 'Testing'],
      dueDate: '2026-11-29',
    });

    // Test v0 { tasks } payload
    const memV0 = createMemoryStorage({
      [BOARD_STORAGE_KEY]: JSON.stringify({ tasks: [legacyTask] }),
    });
    const repoV0 = createLocalStorageBoardRepository({ storage: memV0.adapter });
    const loadedV0 = repoV0.load();

    expect(loadedV0.status).toBe('migrated');
    const migratedTaskV0 = loadedV0.board.tasks[0];
    expect(migratedTaskV0?.tags).toEqual(['Refactor', 'Testing']);
    expect(getSubtaskProgress(migratedTaskV0?.subtasks ?? []).label).toBe('1/2');
    expect(getDueDateEvaluation(migratedTaskV0?.dueDate ?? null, '2026-11-27').status).toBe('due_soon');

    const storedAfterV0: unknown = JSON.parse(memV0.dump()[BOARD_STORAGE_KEY] ?? '{}');
    expect(isPersistedBoardEnvelope(storedAfterV0)).toBe(true);
    if (isPersistedBoardEnvelope(storedAfterV0)) {
      expect(storedAfterV0.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    }

    // Test v1 envelope payload
    const memV1 = createMemoryStorage({
      [BOARD_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-10-10T10:00:00.000Z',
        board: createBoard(undefined, [legacyTask]),
      }),
    });
    const repoV1 = createLocalStorageBoardRepository({ storage: memV1.adapter });
    const loadedV1 = repoV1.load();
    expect(loadedV1.status).toBe('migrated');
    expect(loadedV1.board.tasks[0]?.tags).toEqual(['Refactor', 'Testing']);
  });

  it('T3-07: Corrupt Storage Recovery x Demo Reset x Export/Import Round-Trip', () => {
    const mem = createMemoryStorage({
      [BOARD_STORAGE_KEY]: 'corrupt{{{json',
    });
    const fixedRef = new Date('2026-11-27T12:00:00.000Z');
    const repo = createLocalStorageBoardRepository({
      storage: mem.adapter,
      referenceDate: () => fixedRef,
    });

    const recovered = repo.load();
    expect(recovered.status).toBe('recovered_from_corruption');
    expect(recovered.board.tasks).toHaveLength(7);

    expect(repo.resetDemo(fixedRef).ok).toBe(true);
    const reloaded = repo.load();
    expect(reloaded.status).toBe('loaded');

    const exported = exportBoardToJson(reloaded.board, '2026-11-27T15:00:00.000Z');
    const imported = unwrapOk(importBoardFromJson(exported));
    expect(imported).toEqual(createSeedBoard(fixedRef));
  });

  it('T3-08: Storage Quota Failure x Domain State Integrity leaves prior persisted snapshot intact', () => {
    const mem = createMemoryStorage();
    const healthyRepo = createLocalStorageBoardRepository({ storage: mem.adapter });
    const initialBoard = unwrapOk(
      createTask(createBoard(), { title: 'Estado seguro previo', columnId: 'todo', priority: 'medium' }),
    );
    expect(healthyRepo.save(initialBoard).ok).toBe(true);
    const snapshotRaw = mem.dump()[BOARD_STORAGE_KEY];

    const quotaAdapter: StorageAdapter = {
      getItem: (key) => mem.adapter.getItem(key),
      setItem: () => {
        const quotaErr = new Error('Quota exceeded');
        quotaErr.name = 'QuotaExceededError';
        throw quotaErr;
      },
    };
    const quotaRepo = createLocalStorageBoardRepository({ storage: quotaAdapter });
    const loaded = quotaRepo.load();
    expect(loaded.status).toBe('loaded');

    let inMemoryBoard = unwrapOk(
      createTask(loaded.board, { title: 'Nueva en memoria', columnId: 'todo', priority: 'high' }),
    );
    const newId = getTasksByColumn(inMemoryBoard, 'todo')[1]?.id ?? '';
    inMemoryBoard = unwrapOk(moveTask(inMemoryBoard, newId, 'in_progress'));

    const saveErr = unwrapErr(quotaRepo.save(inMemoryBoard));
    expect(saveErr.code).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(inMemoryBoard.tasks).toHaveLength(2);
    expect(mem.dump()[BOARD_STORAGE_KEY]).toBe(snapshotRaw);
  });

  it('T3-09: Export x Manual JSON Tampering x Strict Import Non-Mutation', () => {
    const mem = createMemoryStorage();
    const repo = createLocalStorageBoardRepository({ storage: mem.adapter });
    const board = unwrapOk(
      createTask(createBoard(), {
        title: 'Tablero protegido',
        columnId: 'todo',
        priority: 'high',
        dueDate: '2026-12-10',
      }),
    );
    expect(repo.save(board).ok).toBe(true);

    const exportedObj = JSON.parse(exportBoardToJson(board, '2026-11-27T15:00:00.000Z')) as {
      app: string;
      schemaVersion: number;
      exportedAt: string;
      board: { columns: readonly unknown[]; tasks: Task[] };
    };

    // Tamper 1: wrong app
    const wrongApp = JSON.stringify({ ...exportedObj, app: 'other' });
    expect(unwrapErr(importBoardFromJson(wrongApp)).code).toBe('INVALID_SCHEMA');

    // Tamper 2: invalid calendar dueDate
    const badDate = JSON.stringify({
      ...exportedObj,
      board: {
        ...exportedObj.board,
        tasks: exportedObj.board.tasks.map((t) => ({ ...t, dueDate: '2026-02-30' })),
      },
    });
    expect(unwrapErr(importBoardFromJson(badDate)).code).toBe('INVALID_SCHEMA');

    // Tamper 3: duplicate task ID
    const firstTask = exportedObj.board.tasks[0];
    const dupIds = JSON.stringify({
      ...exportedObj,
      board: {
        ...exportedObj.board,
        tasks: firstTask ? [firstTask, { ...firstTask, order: 1 }] : [],
      },
    });
    expect(unwrapErr(importBoardFromJson(dupIds)).code).toBe('INVALID_SCHEMA');

    expect(repo.load().board).toEqual(board);
  });

  it('T3-10: WIP exceeded Board x Export x Import preserves exceeded status accurately', () => {
    let board = createBoard();
    board = unwrapOk(
      createTask(board, { title: 'Rev 1', columnId: 'in_review', priority: 'low' }, { enforceWipLimit: false }),
    );
    board = unwrapOk(
      createTask(board, { title: 'Rev 2', columnId: 'in_review', priority: 'medium' }, { enforceWipLimit: false }),
    );
    board = unwrapOk(
      createTask(board, { title: 'Rev 3', columnId: 'in_review', priority: 'high' }, { enforceWipLimit: false }),
    );

    expect(getBoardWipEvaluations(board).in_review.status).toBe('exceeded');

    const json = exportBoardToJson(board, '2026-11-27T15:30:00.000Z');
    const imported = unwrapOk(importBoardFromJson(json));

    expect(getBoardWipEvaluations(imported).in_review.status).toBe('exceeded');
    expect(getTasksByColumn(imported, 'in_review')).toHaveLength(3);
  });

  it('T3-11: Custom StorageAdapter key isolation across multiple repository instances', () => {
    const sharedStorage = createMemoryStorage();
    const repoA = createLocalStorageBoardRepository({
      storage: sharedStorage.adapter,
      storageKey: 'kanbam:board:a',
      referenceDate: () => new Date('2026-11-27T12:00:00.000Z'),
    });
    const repoB = createLocalStorageBoardRepository({
      storage: sharedStorage.adapter,
      storageKey: 'kanbam:board:b',
      referenceDate: () => new Date('2026-11-27T12:00:00.000Z'),
    });

    const boardB = unwrapOk(
      createTask(createBoard(), { title: 'Exclusiva B', columnId: 'done', priority: 'low' }),
    );
    expect(repoB.save(boardB).ok).toBe(true);

    expect(repoA.load().status).toBe('seeded');
    expect(repoA.resetDemo().ok).toBe(true);

    const loadedB = repoB.load();
    expect(loadedB.status).toBe('loaded');
    expect(loadedB.board.tasks).toHaveLength(1);
    expect(loadedB.board.tasks[0]?.title).toBe('Exclusiva B');
  });

  it('T3-12: Empty Board (tasks: []) x Persistence x Export/Import does not accidentally re-seed', () => {
    const mem = createMemoryStorage();
    const repo = createLocalStorageBoardRepository({ storage: mem.adapter });
    const emptyBoard = createBoard();

    expect(repo.save(emptyBoard).ok).toBe(true);

    const repoReload = createLocalStorageBoardRepository({ storage: mem.adapter });
    const reloaded = repoReload.load();
    expect(reloaded.status).toBe('loaded');
    expect(reloaded.board.tasks).toEqual([]);
    expect(reloaded.board.columns).toHaveLength(4);

    const exported = exportBoardToJson(reloaded.board, '2026-11-27T15:40:00.000Z');
    const imported = unwrapOk(importBoardFromJson(exported));
    expect(imported.tasks).toEqual([]);
    expect(imported.columns).toHaveLength(4);
  });

  it('T3-13: Runtime browser-global isolation check verifies pure domain runs with window/localStorage undefined', () => {
    expect(Reflect.get(globalThis, 'window')).toBeUndefined();
    expect(Reflect.get(globalThis, 'localStorage')).toBeUndefined();

    let board = createBoard();
    board = unwrapOk(
      createTask(board, {
        title: 'Dominio puro sin navegador',
        description: 'Ejecutado en Node sin DOM ni localStorage',
        columnId: 'todo',
        priority: 'high',
        tags: ['Testing', 'Refactor'],
        dueDate: '2026-11-30',
      }),
    );
    const taskId = board.tasks[0]?.id ?? '';
    board = unwrapOk(addSubtask(board, taskId, { title: 'Validar aislamiento' }));
    const subId = board.tasks[0]?.subtasks[0]?.id ?? '';
    board = unwrapOk(toggleSubtask(board, taskId, subId));
    board = unwrapOk(updateTask(board, taskId, { description: 'Verificado en entorno puro' }));
    board = unwrapOk(moveTask(board, taskId, 'in_progress', 0, { enforceWipLimit: true }));

    expect(getBoardWipEvaluations(board).in_progress.status).toBe('within_limit');
    expect(getDueDateEvaluation(board.tasks[0]?.dueDate ?? null, '2026-11-27').status).toBe('due_soon');
    expect(getSubtaskProgress(board.tasks[0]?.subtasks ?? []).label).toBe('1/1');

    board = unwrapOk(deleteTask(board, taskId));
    expect(board.tasks).toHaveLength(0);
  });
});
