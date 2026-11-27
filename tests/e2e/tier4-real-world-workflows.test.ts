import { describe, expect, it } from 'vitest';
import {
  COLUMN_IDS,
  addSubtask,
  createBoard,
  createTask,
  deleteTask,
  getBoardWipEvaluations,
  getDueDateEvaluation,
  getSubtaskProgress,
  getTasksByColumn,
  moveTask,
  toggleSubtask,
  updateTask,
} from '../../src/domain/index.ts';
import type { Result, Task } from '../../src/domain/index.ts';
import {
  BOARD_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  createLocalStorageBoardRepository,
  exportBoardToJson,
  importBoardFromJson,
  isBoardState,
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

describe('Tier 4 — Real-World Neutral-Spanish Kanban Workflows', () => {
  it('T4-01: Ciclo completo de sprint en español con WIP estricto y subtareas', () => {
    const mem = createMemoryStorage();
    const fixedRef = new Date('2026-11-27T12:00:00.000Z');
    const repo = createLocalStorageBoardRepository({
      storage: mem.adapter,
      referenceDate: () => fixedRef,
      now: () => '2026-11-27T16:00:00.000Z',
    });

    const initialLoad = repo.load();
    expect(initialLoad.status).toBe('seeded');
    expect(initialLoad.board.tasks).toHaveLength(7);

    let board = initialLoad.board;
    // Ensure `in_review` (wipLimit: 2) reaches exact capacity (`at_limit`)
    const inReviewCol = board.columns.find((c) => c.id === 'in_review');
    const reviewLimit = inReviewCol?.wipLimit ?? 2;
    while (getTasksByColumn(board, 'in_review').length < reviewLimit) {
      const candidate = getTasksByColumn(board, 'todo')[0] ?? getTasksByColumn(board, 'in_progress')[0];
      if (!candidate) {
        board = unwrapOk(
          createTask(board, {
            title: 'Revisar accesibilidad de tarjetas',
            columnId: 'in_review',
            priority: 'high',
            tags: ['UI'],
          }),
        );
      } else {
        board = unwrapOk(moveTask(board, candidate.id, 'in_review', undefined, { enforceWipLimit: true }));
      }
    }
    expect(getBoardWipEvaluations(board).in_review.status).toBe('at_limit');

    // Create a pending task in `todo` and verify strict WIP blocks moving it into `in_review`
    board = unwrapOk(
      createTask(board, {
        title: 'Auditar contraste en modo oscuro',
        columnId: 'todo',
        priority: 'high',
        tags: ['UI', 'Testing'],
      }),
    );
    const pendingTask = getTasksByColumn(board, 'todo').find(
      (t) => t.title === 'Auditar contraste en modo oscuro',
    );
    const pendingId = pendingTask?.id ?? '';
    expect(
      unwrapErr(moveTask(board, pendingId, 'in_review', 0, { enforceWipLimit: true })).code,
    ).toBe('WIP_LIMIT_EXCEEDED');

    // Prepare an `in_review` task with 3 subtasks and complete all of them (`3/3`, 100%)
    const reviewTarget = getTasksByColumn(board, 'in_review')[0];
    const reviewTargetId = reviewTarget?.id ?? '';
    while ((board.tasks.find((t) => t.id === reviewTargetId)?.subtasks.length ?? 0) < 3) {
      const currentCount = board.tasks.find((t) => t.id === reviewTargetId)?.subtasks.length ?? 0;
      board = unwrapOk(
        addSubtask(board, reviewTargetId, { title: `Verificación ${currentCount + 1}` }),
      );
    }
    const subtasksToComplete = board.tasks.find((t) => t.id === reviewTargetId)?.subtasks ?? [];
    for (const sub of subtasksToComplete) {
      if (!sub.completed) {
        board = unwrapOk(toggleSubtask(board, reviewTargetId, sub.id, '2026-11-27T16:05:00.000Z'));
      }
    }
    const completedTask = board.tasks.find((t) => t.id === reviewTargetId);
    const completedProgress = getSubtaskProgress(completedTask?.subtasks ?? []);
    expect(completedProgress.percentage).toBe(100);
    expect(completedProgress.label).toBe(
      `${completedProgress.total}/${completedProgress.total}`,
    );

    // Move completed card from `in_review` to `done` (Completado), freeing capacity
    board = unwrapOk(
      moveTask(board, reviewTargetId, 'done', 0, {
        enforceWipLimit: true,
        now: '2026-11-27T16:10:00.000Z',
      }),
    );
    expect(getBoardWipEvaluations(board).in_review.status).toBe('within_limit');

    // Now the blocked task moves cleanly into `in_review`
    board = unwrapOk(
      moveTask(board, pendingId, 'in_review', 0, {
        enforceWipLimit: true,
        now: '2026-11-27T16:15:00.000Z',
      }),
    );
    expect(repo.save(board).ok).toBe(true);

    // Reload in a fresh repository instance and verify persisted final sprint state
    const freshRepo = createLocalStorageBoardRepository({ storage: mem.adapter });
    const reloaded = freshRepo.load();
    expect(reloaded.status).toBe('loaded');
    expect(reloaded.board).toEqual(board);
    expect(getTasksByColumn(reloaded.board, 'done')[0]?.id).toBe(reviewTargetId);
    expect(getTasksByColumn(reloaded.board, 'in_review')[0]?.id).toBe(pendingId);
  });

  it('T4-02: Creación, refinamiento, etiquetado y control de vencimientos', () => {
    const mem = createMemoryStorage();
    const fixedRef = new Date('2026-11-27T12:00:00.000Z');
    const repo = createLocalStorageBoardRepository({
      storage: mem.adapter,
      referenceDate: () => fixedRef,
    });

    let board = repo.load().board;
    board = unwrapOk(
      createTask(board, {
        title: '  Corregir fuga de memoria en caché  ',
        columnId: 'todo',
        priority: 'high',
        tags: [' Bug ', 'Refactor', 'Bug'],
        dueDate: '2026-11-29',
      }),
    );

    const created = getTasksByColumn(board, 'todo').find(
      (t) => t.title === 'Corregir fuga de memoria en caché',
    );
    const createdId = created?.id ?? '';
    expect(created?.tags).toEqual(['Bug', 'Refactor']);
    expect(getDueDateEvaluation(created?.dueDate ?? null, fixedRef)).toMatchObject({
      status: 'due_soon',
      label: 'Próxima a vencer',
    });

    board = unwrapOk(addSubtask(board, createdId, { title: 'Reproducir fuga con perfilador' }));
    board = unwrapOk(addSubtask(board, createdId, { title: 'Liberar referencias al desmontar' }));

    board = unwrapOk(
      updateTask(
        board,
        createdId,
        { description: 'Limpiar suscripciones pendientes al cerrar vista' },
        { now: '2026-11-27T17:00:00.000Z' },
      ),
    );
    board = unwrapOk(
      moveTask(board, createdId, 'in_progress', 0, { now: '2026-11-27T17:05:00.000Z' }),
    );
    expect(repo.save(board).ok).toBe(true);

    const reloaded = createLocalStorageBoardRepository({ storage: mem.adapter }).load();
    expect(reloaded.status).toBe('loaded');
    const inProgress = getTasksByColumn(reloaded.board, 'in_progress');
    expect(inProgress[0]?.id).toBe(createdId);
    expect(inProgress[0]?.tags).toEqual(['Bug', 'Refactor']);
    expect(inProgress[0]?.subtasks).toHaveLength(2);
    for (const colId of COLUMN_IDS) {
      const colTasks = getTasksByColumn(reloaded.board, colId);
      expect(colTasks.map((t) => t.order)).toEqual(colTasks.map((_, idx) => idx));
    }
  });

  it('T4-03: Migración de usuario legado (v0 -> v2) y respaldo .json', () => {
    const legacyTasks: readonly Task[] = [
      {
        id: 'leg-1',
        title: 'Configurar variables de entorno',
        description: 'Definir archivo de ejemplo para desarrollo local',
        columnId: 'todo',
        order: 0,
        priority: 'high',
        tags: ['Docs', 'Feature'],
        dueDate: '2026-12-05',
        subtasks: [
          { id: 'leg-sub-1', title: 'Documentar claves requeridas', completed: true },
          { id: 'leg-sub-2', title: 'Validar valores por defecto', completed: false },
        ],
        createdAt: '2026-09-15T10:00:00.000Z',
        updatedAt: '2026-09-15T10:00:00.000Z',
      },
      {
        id: 'leg-2',
        title: 'Revisar mensajes de error en español',
        description: 'Unificar tono neutro en validaciones',
        columnId: 'in_progress',
        order: 0,
        priority: 'medium',
        tags: ['UI'],
        dueDate: null,
        subtasks: [],
        createdAt: '2026-09-16T11:00:00.000Z',
        updatedAt: '2026-09-16T11:00:00.000Z',
      },
    ];

    const mem = createMemoryStorage({
      [BOARD_STORAGE_KEY]: JSON.stringify({ tasks: legacyTasks }),
    });
    const fixedRef = new Date('2026-11-27T12:00:00.000Z');
    const repo = createLocalStorageBoardRepository({
      storage: mem.adapter,
      referenceDate: () => fixedRef,
    });

    const migratedLoad = repo.load();
    expect(migratedLoad.status).toBe('migrated');
    expect(migratedLoad.board.tasks).toHaveLength(2);
    expect(migratedLoad.board.columns).toHaveLength(4);

    // Edit migrated task and export backup
    const editedBoard = unwrapOk(
      updateTask(
        migratedLoad.board,
        'leg-1',
        { title: 'Configurar variables de entorno (actualizado)' },
        { now: '2026-11-27T18:00:00.000Z' },
      ),
    );
    expect(repo.save(editedBoard).ok).toBe(true);
    const backupJson = exportBoardToJson(editedBoard, '2026-11-27T18:05:00.000Z');

    // Reset to 7-card Spanish demo
    expect(repo.resetDemo(fixedRef).ok).toBe(true);
    const demoLoaded = repo.load();
    expect(demoLoaded.status).toBe('loaded');
    expect(demoLoaded.board.tasks).toHaveLength(7);

    // Restore backup from JSON and verify zero data loss
    const restoredBoard = unwrapOk(importBoardFromJson(backupJson));
    expect(repo.save(restoredBoard).ok).toBe(true);

    const finalLoad = createLocalStorageBoardRepository({ storage: mem.adapter }).load();
    expect(finalLoad.status).toBe('loaded');
    expect(finalLoad.board).toEqual(editedBoard);
    expect(finalLoad.board.tasks.find((t) => t.id === 'leg-1')?.subtasks).toHaveLength(2);
  });

  it('T4-04: Resiliencia ante almacenamiento corrupto y fallo de cuota', () => {
    const healthyMem = createMemoryStorage();
    const fixedRef = new Date('2026-11-27T12:00:00.000Z');
    const healthyRepo = createLocalStorageBoardRepository({
      storage: healthyMem.adapter,
      referenceDate: () => fixedRef,
    });

    const initialBoard = unwrapOk(
      createTask(createBoard(), {
        title: 'Tarjeta inicial válida',
        columnId: 'todo',
        priority: 'medium',
      }),
    );
    expect(healthyRepo.save(initialBoard).ok).toBe(true);

    // Simulate manual tampering / corruption in localStorage
    healthyMem.adapter.setItem(BOARD_STORAGE_KEY, '{corrupto');
    const recoveredLoad = healthyRepo.load();
    expect(recoveredLoad.status).toBe('recovered_from_corruption');
    expect(recoveredLoad.board.tasks).toHaveLength(7);
    expect(recoveredLoad.warning?.length).toBeGreaterThan(0);

    // Swap in a quota-exhausted storage adapter
    const quotaAdapter: StorageAdapter = {
      getItem: (key) => healthyMem.adapter.getItem(key),
      setItem: () => {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      },
    };
    const quotaRepo = createLocalStorageBoardRepository({
      storage: quotaAdapter,
      referenceDate: () => fixedRef,
    });

    const inMemoryWork = unwrapOk(
      createTask(recoveredLoad.board, {
        title: 'Trabajo no guardado por cuota',
        columnId: 'todo',
        priority: 'high',
      }),
    );
    const quotaSaveErr = unwrapErr(quotaRepo.save(inMemoryWork));
    expect(quotaSaveErr.code).toBe('STORAGE_QUOTA_EXCEEDED');
    expect(isBoardState(inMemoryWork)).toBe(true);
    expect(inMemoryWork.tasks).toHaveLength(8);

    // Recover onto a healthy adapter and persist successfully
    const recoveredStorage = createMemoryStorage();
    const recoveryRepo = createLocalStorageBoardRepository({ storage: recoveredStorage.adapter });
    expect(recoveryRepo.save(inMemoryWork).ok).toBe(true);
    const verified = recoveryRepo.load();
    expect(verified.status).toBe('loaded');
    expect(verified.board).toEqual(inMemoryWork);
  });

  it('T4-05: Validación defensiva en flujo de importación corrupta sin pérdida de trabajo', () => {
    const mem = createMemoryStorage();
    const repo = createLocalStorageBoardRepository({ storage: mem.adapter });

    let customBoard = createBoard();
    customBoard = unwrapOk(
      createTask(customBoard, {
        title: 'Diseñar contrato de eventos',
        columnId: 'todo',
        priority: 'high',
        tags: ['Docs'],
      }),
    );
    customBoard = unwrapOk(
      createTask(customBoard, {
        title: 'Implementar adaptador seguro',
        columnId: 'in_progress',
        priority: 'medium',
        tags: ['Feature'],
      }),
    );
    customBoard = unwrapOk(
      createTask(customBoard, {
        title: 'Verificar cobertura de pruebas',
        columnId: 'done',
        priority: 'low',
        tags: ['Testing'],
      }),
    );
    expect(repo.save(customBoard).ok).toBe(true);

    const invalidImports: readonly { readonly raw: string; readonly expectedCode: string }[] = [
      { raw: '{sintaxis-rota', expectedCode: 'INVALID_JSON' },
      {
        raw: JSON.stringify({
          app: 'otro',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          exportedAt: '2026-11-27T12:00:00.000Z',
          board: customBoard,
        }),
        expectedCode: 'INVALID_SCHEMA',
      },
      {
        raw: JSON.stringify({
          app: 'kanbam',
          schemaVersion: 99,
          exportedAt: '2026-11-27T12:00:00.000Z',
          board: customBoard,
        }),
        expectedCode: 'UNSUPPORTED_SCHEMA_VERSION',
      },
      {
        raw: JSON.stringify({
          app: 'kanbam',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          exportedAt: '2026-11-27T12:00:00.000Z',
          board: {
            columns: customBoard.columns,
            tasks: customBoard.tasks.map((t, idx) =>
              idx === 0 ? { ...t, dueDate: '2026-02-30' } : t,
            ),
          },
        }),
        expectedCode: 'INVALID_SCHEMA',
      },
    ];

    for (const attempt of invalidImports) {
      const err = unwrapErr(importBoardFromJson(attempt.raw));
      expect(err.code).toBe(attempt.expectedCode);
    }

    const reloaded = repo.load();
    expect(reloaded.status).toBe('loaded');
    expect(reloaded.board).toEqual(customBoard);
    expect(reloaded.board.tasks).toHaveLength(3);
  });

  it('T4-06: Limpieza de backlog y reordenamiento masivo multi-columna', () => {
    const mem = createMemoryStorage();
    const fixedRef = new Date('2026-11-27T12:00:00.000Z');
    const repo = createLocalStorageBoardRepository({
      storage: mem.adapter,
      referenceDate: () => fixedRef,
    });

    let board = repo.load().board;

    // Add 2 new backlog items in `todo`
    board = unwrapOk(
      createTask(board, {
        title: 'Prioridad 1: Corregir bloqueo de teclado',
        columnId: 'todo',
        priority: 'high',
        tags: ['Bug', 'UI'],
        dueDate: '2026-11-28',
      }),
    );
    board = unwrapOk(
      createTask(board, {
        title: 'Prioridad 2: Optimizar exportación JSON',
        columnId: 'todo',
        priority: 'medium',
        tags: ['Refactor'],
      }),
    );

    // Delete 1 obsolete task from `todo` (oldest existing task)
    const todoBeforeDelete = getTasksByColumn(board, 'todo');
    const obsoleteId = todoBeforeDelete[0]?.id ?? '';
    board = unwrapOk(deleteTask(board, obsoleteId));

    // Reorder the two new priority items to indices 0 and 1 in `todo`
    const prio1Id =
      getTasksByColumn(board, 'todo').find((t) =>
        t.title.startsWith('Prioridad 1'),
      )?.id ?? '';
    const prio2Id =
      getTasksByColumn(board, 'todo').find((t) =>
        t.title.startsWith('Prioridad 2'),
      )?.id ?? '';

    board = unwrapOk(moveTask(board, prio1Id, 'todo', 0));
    board = unwrapOk(moveTask(board, prio2Id, 'todo', 1));
    expect(getTasksByColumn(board, 'todo').slice(0, 2).map((t) => t.id)).toEqual([prio1Id, prio2Id]);

    // Promote top task across the full workflow: todo -> in_progress -> in_review -> done
    board = unwrapOk(moveTask(board, prio1Id, 'in_progress', 0));
    board = unwrapOk(moveTask(board, prio1Id, 'in_review', 0));
    board = unwrapOk(moveTask(board, prio1Id, 'done', 0));

    // Verify zero duplicate IDs, contiguous order in all 4 columns, and accurate WIP evaluations
    const allIds = new Set(board.tasks.map((t) => t.id));
    expect(allIds.size).toBe(board.tasks.length);

    const wipEvaluations = getBoardWipEvaluations(board);
    for (const colId of COLUMN_IDS) {
      const colTasks = getTasksByColumn(board, colId);
      expect(colTasks.map((t) => t.order)).toEqual(colTasks.map((_, idx) => idx));
      expect(wipEvaluations[colId]).toBeDefined();
    }
    expect(getTasksByColumn(board, 'done')[0]?.id).toBe(prio1Id);

    // Save, export, and re-import to verify lossless round-trip
    expect(repo.save(board).ok).toBe(true);
    const exportedJson = exportBoardToJson(board, '2026-11-27T19:00:00.000Z');
    const reimported = unwrapOk(importBoardFromJson(exportedJson));
    expect(reimported).toEqual(board);
    expect(isBoardState(reimported)).toBe(true);
  });
});
