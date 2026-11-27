import { describe, expect, it } from 'vitest';
import {
  COLUMN_IDS,
  COLUMN_TITLES,
  DEFAULT_COLUMNS,
  DEFAULT_TAG_SUGGESTIONS,
  DUE_DATE_STATUS_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  addSubtask,
  createBoard,
  createTask,
  deleteTask,
  getBoardWipEvaluations,
  getColumnWipEvaluation,
  getDueDateEvaluation,
  getSubtaskProgress,
  getTasksByColumn,
  isValidColumnId,
  isValidPriority,
  moveTask,
  removeSubtask,
  toggleSubtask,
  updateSubtaskTitle,
  updateTask,
  validateDueDate,
  validateSubtaskTitle,
  validateTags,
  validateWipLimit,
} from '../../src/domain/index.ts';
import type {
  BoardState,
  ColumnDefinition,
  ColumnId,
  Result,
  Subtask,
  Task,
} from '../../src/domain/index.ts';
import {
  BOARD_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  createLocalStorageBoardRepository,
  createSeedBoard,
  exportBoardToJson,
  importBoardFromJson,
  isBoardState,
  isColumnDefinition,
  isExportedBoardEnvelope,
  isPersistedBoardEnvelope,
  isSubtask,
  isTask,
  migrateBoardPayload,
} from '../../src/infrastructure/index.ts';
import type {
  ExportedBoardEnvelope,
  PersistedBoardEnvelope,
  StorageAdapter,
} from '../../src/infrastructure/index.ts';

function unwrapOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
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

function makeTask(overrides: Partial<Task> & { readonly id: string }): Task {
  return {
    id: overrides.id,
    title: overrides.title ?? `Tarea ${overrides.id}`,
    description: overrides.description ?? '',
    columnId: overrides.columnId ?? 'todo',
    order: overrides.order ?? 0,
    priority: overrides.priority ?? 'medium',
    tags: overrides.tags ?? [],
    dueDate: overrides.dueDate ?? null,
    subtasks: overrides.subtasks ?? [],
    createdAt: overrides.createdAt ?? '2026-11-01T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-11-01T10:00:00.000Z',
  };
}

describe('Tier 1 — Feature Coverage (Happy Path)', () => {
  describe('Area 1: Columns & WIP Limits', () => {
    it('T1-01: initializes default 4-column board with Spanish titles and WIP limits', () => {
      const board = createBoard();

      expect(board.tasks).toEqual([]);
      expect(board.columns).toHaveLength(4);
      expect(board.columns.map((c) => c.id)).toEqual(['todo', 'in_progress', 'in_review', 'done']);
      expect(board.columns.map((c) => c.order)).toEqual([0, 1, 2, 3]);
      expect(board.columns.map((c) => c.title)).toEqual([
        'Por hacer',
        'En progreso',
        'En revisión',
        'Completado',
      ]);
      expect(board.columns.map((c) => c.wipLimit)).toEqual([null, 3, 2, null]);
    });

    it('T1-02: exposes COLUMN_IDS, COLUMN_TITLES in neutral Spanish, and valid isValidColumnId guard', () => {
      expect(COLUMN_IDS).toEqual(['todo', 'in_progress', 'in_review', 'done']);
      expect(COLUMN_TITLES).toEqual({
        todo: 'Por hacer',
        in_progress: 'En progreso',
        in_review: 'En revisión',
        done: 'Completado',
      });
      for (const colId of COLUMN_IDS) {
        expect(isValidColumnId(colId)).toBe(true);
      }
    });

    it('T1-03: validates null and positive integer WIP limits', () => {
      expect(unwrapOk(validateWipLimit(null))).toBeNull();
      expect(unwrapOk(validateWipLimit(1))).toBe(1);
      expect(unwrapOk(validateWipLimit(5))).toBe(5);
    });

    it('T1-04: evaluates single-column WIP statuses (unlimited, within_limit, at_limit, exceeded)', () => {
      const unlimitedCol: ColumnDefinition = { id: 'todo', title: 'Por hacer', order: 0, wipLimit: null };
      const limitThreeCol: ColumnDefinition = { id: 'in_progress', title: 'En progreso', order: 1, wipLimit: 3 };
      const limitTwoCol: ColumnDefinition = { id: 'in_review', title: 'En revisión', order: 2, wipLimit: 2 };

      expect(getColumnWipEvaluation(unlimitedCol, 4).status).toBe('unlimited');
      expect(getColumnWipEvaluation(limitThreeCol, 2).status).toBe('within_limit');
      expect(getColumnWipEvaluation(limitTwoCol, 2).status).toBe('at_limit');
      expect(getColumnWipEvaluation(limitTwoCol, 3).status).toBe('exceeded');
    });

    it('T1-05: evaluates board-wide WIP across all 4 columns and permits soft warning mode', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'Revisión A', columnId: 'in_review', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'Revisión B', columnId: 'in_review', priority: 'medium' }));

      const beforeExceed = getBoardWipEvaluations(board);
      expect(Object.keys(beforeExceed).sort()).toEqual([...COLUMN_IDS].sort());
      expect(beforeExceed.todo.status).toBe('unlimited');
      expect(beforeExceed.in_progress.status).toBe('within_limit');
      expect(beforeExceed.in_review.status).toBe('at_limit');
      expect(beforeExceed.done.status).toBe('unlimited');

      const softBoard = unwrapOk(
        createTask(
          board,
          { title: 'Revisión C (suave)', columnId: 'in_review', priority: 'high' },
          { enforceWipLimit: false },
        ),
      );
      expect(getBoardWipEvaluations(softBoard).in_review.status).toBe('exceeded');
      expect(getTasksByColumn(softBoard, 'in_review')).toHaveLength(3);
    });
  });

  describe('Area 2: Task CRUD & Validation', () => {
    it('T1-06: exposes PRIORITIES, PRIORITY_LABELS in neutral Spanish, and valid isValidPriority guard', () => {
      expect(PRIORITIES).toEqual(['low', 'medium', 'high']);
      expect(PRIORITY_LABELS).toEqual({
        low: 'Baja',
        medium: 'Media',
        high: 'Alta',
      });
      for (const priority of PRIORITIES) {
        expect(isValidPriority(priority)).toBe(true);
      }
    });

    it('T1-07: creates a task with minimal required fields and sensible defaults', () => {
      const initial = createBoard();
      const updated = unwrapOk(
        createTask(initial, {
          title: 'Diseñar esquema',
          columnId: 'todo',
          priority: 'medium',
        }),
      );

      expect(initial.tasks).toHaveLength(0);
      expect(updated.tasks).toHaveLength(1);
      const created = updated.tasks[0];
      expect(created?.title).toBe('Diseñar esquema');
      expect(created?.description).toBe('');
      expect(created?.columnId).toBe('todo');
      expect(created?.order).toBe(0);
      expect(created?.priority).toBe('medium');
      expect(created?.tags).toEqual([]);
      expect(created?.dueDate).toBeNull();
      expect(created?.subtasks).toEqual([]);
      expect(created?.id.length).toBeGreaterThan(0);
      expect(created?.createdAt.length).toBeGreaterThan(0);
      expect(created?.updatedAt.length).toBeGreaterThan(0);
    });

    it('T1-08: creates a task with full enriched fields, trims title, and appends contiguous order', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'Primera tarea', columnId: 'todo', priority: 'low' }));

      board = unwrapOk(
        createTask(board, {
          title: '  Implementar guardas  ',
          description: 'Validar esquemas de entrada con precisión',
          columnId: 'todo',
          priority: 'high',
          tags: ['Feature', 'Testing'],
          dueDate: '2026-12-20',
        }),
      );

      const todoTasks = getTasksByColumn(board, 'todo');
      expect(todoTasks).toHaveLength(2);
      const second = todoTasks[1];
      expect(second?.title).toBe('Implementar guardas');
      expect(second?.description).toBe('Validar esquemas de entrada con precisión');
      expect(second?.priority).toBe('high');
      expect(second?.tags).toEqual(['Feature', 'Testing']);
      expect(second?.dueDate).toBe('2026-12-20');
      expect(second?.order).toBe(1);
    });

    it('T1-09: updates task title, description, priority, and updatedAt immutably', () => {
      const boardBefore = unwrapOk(
        createTask(createBoard(), {
          title: 'Borrador inicial',
          description: 'Texto previo',
          columnId: 'todo',
          priority: 'low',
        }),
      );
      const taskId = boardBefore.tasks[0]?.id ?? '';
      const fixedNow = '2026-11-27T16:00:00.000Z';

      const boardAfter = unwrapOk(
        updateTask(
          boardBefore,
          taskId,
          {
            title: '  Título refinado  ',
            description: 'Descripción actualizada',
            priority: 'high',
          },
          { now: fixedNow },
        ),
      );

      expect(boardBefore.tasks[0]?.title).toBe('Borrador inicial');
      expect(boardAfter.tasks[0]?.title).toBe('Título refinado');
      expect(boardAfter.tasks[0]?.description).toBe('Descripción actualizada');
      expect(boardAfter.tasks[0]?.priority).toBe('high');
      expect(boardAfter.tasks[0]?.updatedAt).toBe(fixedNow);
    });

    it('T1-10: deletes middle task and re-indexes remaining tasks contiguously without mutating input', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'Uno', columnId: 'todo', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'Dos', columnId: 'todo', priority: 'medium' }));
      board = unwrapOk(createTask(board, { title: 'Tres', columnId: 'todo', priority: 'high' }));
      board = unwrapOk(createTask(board, { title: 'En curso', columnId: 'in_progress', priority: 'low' }));

      const todoTasks = getTasksByColumn(board, 'todo');
      const middleId = todoTasks[1]?.id ?? '';

      const afterDelete = unwrapOk(deleteTask(board, middleId));

      expect(getTasksByColumn(board, 'todo')).toHaveLength(3);
      const remainingTodo = getTasksByColumn(afterDelete, 'todo');
      expect(remainingTodo.map((t) => t.title)).toEqual(['Uno', 'Tres']);
      expect(remainingTodo.map((t) => t.order)).toEqual([0, 1]);
      expect(getTasksByColumn(afterDelete, 'in_progress')).toHaveLength(1);
    });

    it('T1-11: queries tasks per column sorted ascending by order', () => {
      const board = createBoard(DEFAULT_COLUMNS, [
        makeTask({ id: 't-2', title: 'Segunda', columnId: 'todo', order: 1 }),
        makeTask({ id: 't-other', title: 'En revisión', columnId: 'in_review', order: 0 }),
        makeTask({ id: 't-1', title: 'Primera', columnId: 'todo', order: 0 }),
        makeTask({ id: 't-3', title: 'Tercera', columnId: 'todo', order: 2 }),
      ]);

      const todoSorted = getTasksByColumn(board, 'todo');
      expect(todoSorted.map((t) => t.id)).toEqual(['t-1', 't-2', 't-3']);
      expect(todoSorted.map((t) => t.order)).toEqual([0, 1, 2]);
    });
  });

  describe('Area 3: Multi-Tag Support', () => {
    it('T1-12: exposes expected preset tag suggestions', () => {
      expect(DEFAULT_TAG_SUGGESTIONS).toEqual(['UI', 'Bug', 'Feature', 'Docs', 'Refactor', 'Testing']);
    });

    it('T1-13: validates single and multiple clean tags', () => {
      expect(unwrapOk(validateTags(['UI']))).toEqual(['UI']);
      expect(unwrapOk(validateTags(['UI', 'Testing', 'Docs']))).toEqual(['UI', 'Testing', 'Docs']);
    });

    it('T1-14: trims surrounding whitespace from tags', () => {
      expect(unwrapOk(validateTags(['  UI  ', '\tBug\n']))).toEqual(['UI', 'Bug']);
    });

    it('T1-15: deduplicates repeated tags preserving first-seen order', () => {
      expect(unwrapOk(validateTags(['Feature', 'UI', 'Feature', 'UI', 'Docs']))).toEqual([
        'Feature',
        'UI',
        'Docs',
      ]);
    });

    it('T1-16: creates task with multiple tags and clears tags via updateTask', () => {
      const boardWithTask = unwrapOk(
        createTask(createBoard(), {
          title: 'Refactorizar vista',
          columnId: 'todo',
          priority: 'medium',
          tags: ['UI', 'Refactor'],
        }),
      );
      const taskId = boardWithTask.tasks[0]?.id ?? '';
      expect(boardWithTask.tasks[0]?.tags).toEqual(['UI', 'Refactor']);

      const clearedBoard = unwrapOk(updateTask(boardWithTask, taskId, { tags: [] }));
      expect(clearedBoard.tasks[0]?.tags).toEqual([]);
    });
  });

  describe('Area 4: Optional Due Date & Expiration Status', () => {
    it('T1-17: validates null and valid YYYY-MM-DD calendar date strings', () => {
      expect(unwrapOk(validateDueDate(null))).toBeNull();
      expect(unwrapOk(validateDueDate('2026-12-15'))).toBe('2026-12-15');
    });

    it('T1-18: evaluates null due date as none with Spanish label Sin fecha', () => {
      const evaluation = getDueDateEvaluation(null, '2026-11-27');
      expect(evaluation.status).toBe('none');
      expect(evaluation.label).toBe(DUE_DATE_STATUS_LABELS.none);
      expect(evaluation.label).toBe('Sin fecha');
    });

    it('T1-19: evaluates future due date (>3 days ahead) as on_track with Spanish label En plazo', () => {
      const evaluation = getDueDateEvaluation('2026-12-05', '2026-11-27');
      expect(evaluation.status).toBe('on_track');
      expect(evaluation.label).toBe(DUE_DATE_STATUS_LABELS.on_track);
      expect(evaluation.label).toBe('En plazo');
    });

    it('T1-20: evaluates near due date (1-3 days ahead) as due_soon with Spanish label Próxima a vencer', () => {
      const evaluation = getDueDateEvaluation('2026-11-29', '2026-11-27');
      expect(evaluation.status).toBe('due_soon');
      expect(evaluation.label).toBe(DUE_DATE_STATUS_LABELS.due_soon);
      expect(evaluation.label).toBe('Próxima a vencer');
    });

    it('T1-21: evaluates past due date with Date reference as overdue with Spanish label Vencida', () => {
      const evaluation = getDueDateEvaluation('2026-11-20', new Date('2026-11-27T12:00:00.000Z'));
      expect(evaluation.status).toBe('overdue');
      expect(evaluation.label).toBe(DUE_DATE_STATUS_LABELS.overdue);
      expect(evaluation.label).toBe('Vencida');
    });
  });

  describe('Area 5: Subtasks & Progress', () => {
    it('T1-22: validates and trims valid subtask title', () => {
      expect(unwrapOk(validateSubtaskTitle('  Escribir pruebas  '))).toBe('Escribir pruebas');
    });

    it('T1-23: adds a subtask to an existing task immutably and updates updatedAt', () => {
      const boardBefore = unwrapOk(
        createTask(createBoard(), {
          title: 'Preparar lanzamiento',
          columnId: 'todo',
          priority: 'high',
        }),
      );
      const taskId = boardBefore.tasks[0]?.id ?? '';
      const fixedNow = '2026-11-27T17:00:00.000Z';

      const boardAfter = unwrapOk(
        addSubtask(boardBefore, taskId, { title: 'Crear archivo' }, { now: fixedNow }),
      );

      expect(boardBefore.tasks[0]?.subtasks).toHaveLength(0);
      const subtasks = boardAfter.tasks[0]?.subtasks ?? [];
      expect(subtasks).toHaveLength(1);
      expect(subtasks[0]?.title).toBe('Crear archivo');
      expect(subtasks[0]?.completed).toBe(false);
      expect(boardAfter.tasks[0]?.updatedAt).toBe(fixedNow);
    });

    it('T1-24: updates subtask title while preserving completion state', () => {
      let board = unwrapOk(
        createTask(createBoard(), { title: 'Documentación', columnId: 'todo', priority: 'low' }),
      );
      const taskId = board.tasks[0]?.id ?? '';
      board = unwrapOk(addSubtask(board, taskId, { title: 'Borrador' }));
      const subtaskId = board.tasks[0]?.subtasks[0]?.id ?? '';
      board = unwrapOk(toggleSubtask(board, taskId, subtaskId));

      const fixedNow = '2026-11-27T18:00:00.000Z';
      const updated = unwrapOk(
        updateSubtaskTitle(board, taskId, subtaskId, '  Actualizar contrato  ', fixedNow),
      );

      expect(updated.tasks[0]?.subtasks[0]?.title).toBe('Actualizar contrato');
      expect(updated.tasks[0]?.subtasks[0]?.completed).toBe(true);
      expect(updated.tasks[0]?.updatedAt).toBe(fixedNow);
    });

    it('T1-25: toggles subtask completion state back and forth', () => {
      let board = unwrapOk(
        createTask(createBoard(), { title: 'Checklist', columnId: 'todo', priority: 'medium' }),
      );
      const taskId = board.tasks[0]?.id ?? '';
      board = unwrapOk(addSubtask(board, taskId, { title: 'Verificar casos' }));
      const subtaskId = board.tasks[0]?.subtasks[0]?.id ?? '';

      const firstToggle = unwrapOk(toggleSubtask(board, taskId, subtaskId, '2026-11-27T18:10:00.000Z'));
      expect(firstToggle.tasks[0]?.subtasks[0]?.completed).toBe(true);
      expect(firstToggle.tasks[0]?.updatedAt).toBe('2026-11-27T18:10:00.000Z');

      const secondToggle = unwrapOk(
        toggleSubtask(firstToggle, taskId, subtaskId, '2026-11-27T18:20:00.000Z'),
      );
      expect(secondToggle.tasks[0]?.subtasks[0]?.completed).toBe(false);
      expect(secondToggle.tasks[0]?.updatedAt).toBe('2026-11-27T18:20:00.000Z');
    });

    it('T1-26: removes subtask and computes SubtaskProgress label and percentage', () => {
      let board = unwrapOk(
        createTask(createBoard(), { title: 'Pruebas unitarias', columnId: 'in_progress', priority: 'high' }),
      );
      const taskId = board.tasks[0]?.id ?? '';
      board = unwrapOk(addSubtask(board, taskId, { title: 'Subtarea 1' }));
      board = unwrapOk(addSubtask(board, taskId, { title: 'Subtarea 2' }));
      board = unwrapOk(addSubtask(board, taskId, { title: 'Subtarea 3' }));

      const sub1 = board.tasks[0]?.subtasks[0]?.id ?? '';
      const sub2 = board.tasks[0]?.subtasks[1]?.id ?? '';

      board = unwrapOk(toggleSubtask(board, taskId, sub1));
      board = unwrapOk(removeSubtask(board, taskId, sub2, '2026-11-27T19:00:00.000Z'));

      const remaining = board.tasks[0]?.subtasks ?? [];
      expect(remaining).toHaveLength(2);
      expect(getSubtaskProgress(remaining)).toEqual({
        completed: 1,
        total: 2,
        percentage: 50,
        label: '1/2',
      });
    });
  });

  describe('Area 6: Task Move & Reorder', () => {
    it('T1-27: moves task across columns appending at end when targetIndex is omitted', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'Todo A', columnId: 'todo', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'Todo B', columnId: 'todo', priority: 'medium' }));
      board = unwrapOk(createTask(board, { title: 'Progreso 1', columnId: 'in_progress', priority: 'high' }));

      const todoAId = getTasksByColumn(board, 'todo')[0]?.id ?? '';
      const moved = unwrapOk(moveTask(board, todoAId, 'in_progress'));

      expect(getTasksByColumn(moved, 'todo').map((t) => [t.title, t.order])).toEqual([['Todo B', 0]]);
      expect(getTasksByColumn(moved, 'in_progress').map((t) => [t.title, t.order])).toEqual([
        ['Progreso 1', 0],
        ['Todo A', 1],
      ]);
    });

    it('T1-28: moves task across columns to explicit index 0 and middle index', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'Todo 1', columnId: 'todo', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'Todo 2', columnId: 'todo', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'Prog A', columnId: 'in_progress', priority: 'medium' }));
      board = unwrapOk(createTask(board, { title: 'Prog B', columnId: 'in_progress', priority: 'high' }));

      const todo1Id = getTasksByColumn(board, 'todo')[0]?.id ?? '';
      board = unwrapOk(moveTask(board, todo1Id, 'in_progress', 1));
      expect(getTasksByColumn(board, 'in_progress').map((t) => [t.title, t.order])).toEqual([
        ['Prog A', 0],
        ['Todo 1', 1],
        ['Prog B', 2],
      ]);

      const todo2Id = getTasksByColumn(board, 'todo')[0]?.id ?? '';
      const boardAtZero = unwrapOk(moveTask(board, todo2Id, 'in_progress', 0));
      expect(getTasksByColumn(boardAtZero, 'in_progress').map((t) => [t.title, t.order])).toEqual([
        ['Todo 2', 0],
        ['Prog A', 1],
        ['Todo 1', 2],
        ['Prog B', 3],
      ]);
    });

    it('T1-29: reorders task downward within the same column', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'A', columnId: 'todo', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'B', columnId: 'todo', priority: 'medium' }));
      board = unwrapOk(createTask(board, { title: 'C', columnId: 'todo', priority: 'high' }));

      const idA = getTasksByColumn(board, 'todo')[0]?.id ?? '';
      const reordered = unwrapOk(moveTask(board, idA, 'todo', 2));

      expect(getTasksByColumn(reordered, 'todo').map((t) => [t.title, t.order])).toEqual([
        ['B', 0],
        ['C', 1],
        ['A', 2],
      ]);
    });

    it('T1-30: reorders task upward within the same column', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'A', columnId: 'todo', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'B', columnId: 'todo', priority: 'medium' }));
      board = unwrapOk(createTask(board, { title: 'C', columnId: 'todo', priority: 'high' }));

      const idC = getTasksByColumn(board, 'todo')[2]?.id ?? '';
      const reordered = unwrapOk(moveTask(board, idC, 'todo', 0));

      expect(getTasksByColumn(reordered, 'todo').map((t) => [t.title, t.order])).toEqual([
        ['C', 0],
        ['A', 1],
        ['B', 2],
      ]);
    });

    it('T1-31: moves task across columns with enforceWipLimit: true when capacity allows', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'Origen', columnId: 'todo', priority: 'medium' }));
      board = unwrapOk(createTask(board, { title: 'Revisión 1', columnId: 'in_review', priority: 'high' }));

      const originId = getTasksByColumn(board, 'todo')[0]?.id ?? '';
      const fixedNow = '2026-11-27T19:30:00.000Z';
      const moved = unwrapOk(
        moveTask(board, originId, 'in_review', 0, { enforceWipLimit: true, now: fixedNow }),
      );

      expect(getTasksByColumn(board, 'todo')).toHaveLength(1);
      const inReview = getTasksByColumn(moved, 'in_review');
      expect(inReview.map((t) => [t.title, t.order])).toEqual([
        ['Origen', 0],
        ['Revisión 1', 1],
      ]);
      expect(inReview[0]?.updatedAt).toBe(fixedNow);
    });
  });

  describe('Area 7: Shielded localStorage Repository', () => {
    it('T1-32: seeds 7-card Spanish demo board and persists v2 envelope on empty storage', () => {
      const mem = createMemoryStorage();
      const repo = createLocalStorageBoardRepository({
        storage: mem.adapter,
        referenceDate: () => new Date('2026-11-27T12:00:00.000Z'),
        now: () => '2026-11-27T12:00:00.000Z',
      });

      const loaded = repo.load();
      expect(loaded.status).toBe('seeded');
      expect(loaded.board.tasks).toHaveLength(7);

      const rawPersisted = mem.dump()[BOARD_STORAGE_KEY];
      expect(rawPersisted).toBeDefined();
      const parsed: unknown = JSON.parse(rawPersisted ?? '{}');
      expect(isPersistedBoardEnvelope(parsed)).toBe(true);
      if (isPersistedBoardEnvelope(parsed)) {
        expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(parsed.board).toEqual(loaded.board);
      }
    });

    it('T1-33: performs save and reload round-trip across repository instances', () => {
      const mem = createMemoryStorage();
      const repoA = createLocalStorageBoardRepository({
        storage: mem.adapter,
        now: () => '2026-11-27T13:00:00.000Z',
      });
      const modified = unwrapOk(
        createTask(createBoard(), {
          title: 'Persistir tablero',
          columnId: 'in_progress',
          priority: 'high',
          tags: ['Feature'],
        }),
      );
      const saveResult = repoA.save(modified);
      expect(saveResult.ok).toBe(true);

      const repoB = createLocalStorageBoardRepository({ storage: mem.adapter });
      const reloaded = repoB.load();
      expect(reloaded.status).toBe('loaded');
      expect(reloaded.board).toEqual(modified);
    });

    it('T1-34: respects custom storageKey, now, and referenceDate dependencies', () => {
      const mem = createMemoryStorage();
      const customKey = 'kanbam:custom-e2e';
      const fixedNow = '2026-11-27T14:15:00.000Z';
      const fixedRef = new Date('2026-08-10T10:00:00.000Z');

      const repo = createLocalStorageBoardRepository({
        storage: mem.adapter,
        storageKey: customKey,
        now: () => fixedNow,
        referenceDate: () => fixedRef,
      });

      const loaded = repo.load();
      expect(loaded.status).toBe('seeded');
      expect(mem.dump()[BOARD_STORAGE_KEY]).toBeUndefined();

      const raw = mem.dump()[customKey];
      expect(raw).toBeDefined();
      const parsed: unknown = JSON.parse(raw ?? '{}');
      expect(isPersistedBoardEnvelope(parsed)).toBe(true);
      if (isPersistedBoardEnvelope(parsed)) {
        expect(parsed.updatedAt).toBe(fixedNow);
        expect(parsed.board).toEqual(createSeedBoard(fixedRef));
      }
    });

    it('T1-35: migrates valid v1 payload on load and persists upgraded v2 envelope', () => {
      const v1Board = unwrapOk(
        createTask(createBoard(), {
          title: 'Tarjeta v1 migrada',
          columnId: 'todo',
          priority: 'medium',
          tags: ['Docs'],
        }),
      );
      const v1Payload = {
        schemaVersion: 1,
        updatedAt: '2026-10-01T10:00:00.000Z',
        board: v1Board,
      };
      const mem = createMemoryStorage({
        [BOARD_STORAGE_KEY]: JSON.stringify(v1Payload),
      });

      const repo = createLocalStorageBoardRepository({
        storage: mem.adapter,
        now: () => '2026-11-27T15:00:00.000Z',
      });
      const loaded = repo.load();

      expect(loaded.status).toBe('migrated');
      expect(loaded.board.tasks).toHaveLength(1);
      expect(loaded.board.tasks[0]?.title).toBe('Tarjeta v1 migrada');

      const persisted: unknown = JSON.parse(mem.dump()[BOARD_STORAGE_KEY] ?? '{}');
      expect(isPersistedBoardEnvelope(persisted)).toBe(true);
      if (isPersistedBoardEnvelope(persisted)) {
        expect(persisted.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      }
    });

    it('T1-36: resetDemo replaces custom state with fresh 7-card seed board', () => {
      const mem = createMemoryStorage();
      const fixedRef = new Date('2026-11-27T12:00:00.000Z');
      const repo = createLocalStorageBoardRepository({
        storage: mem.adapter,
        referenceDate: () => fixedRef,
      });

      const custom = unwrapOk(
        createTask(createBoard(), { title: 'Única tarjeta temporal', columnId: 'todo', priority: 'low' }),
      );
      expect(repo.save(custom).ok).toBe(true);
      expect(repo.load().board.tasks).toHaveLength(1);

      const resetResult = repo.resetDemo(fixedRef);
      expect(resetResult.ok).toBe(true);

      const afterReset = repo.load();
      expect(afterReset.status).toBe('loaded');
      expect(afterReset.board.tasks).toHaveLength(7);
      expect(afterReset.board).toEqual(createSeedBoard(fixedRef));
    });
  });

  describe('Area 8: Seed Data & Demo Reset', () => {
    const fixedRef = new Date('2026-11-27T12:00:00.000Z');

    it('T1-37: createSeedBoard produces exactly 7 valid tasks with unique IDs and contiguous orders', () => {
      const board = createSeedBoard(fixedRef);

      expect(board.tasks).toHaveLength(7);
      expect(isBoardState(board)).toBe(true);

      const uniqueIds = new Set(board.tasks.map((t) => t.id));
      expect(uniqueIds.size).toBe(7);

      for (const columnId of COLUMN_IDS) {
        const colTasks = getTasksByColumn(board, columnId);
        expect(colTasks.map((t) => t.order)).toEqual(colTasks.map((_, idx) => idx));
      }
    });

    it('T1-38: seed covers all 4 workflow columns', () => {
      const board = createSeedBoard(fixedRef);

      for (const columnId of COLUMN_IDS) {
        expect(getTasksByColumn(board, columnId).length).toBeGreaterThanOrEqual(1);
      }
    });

    it('T1-39: seed covers all 3 priorities and multiple tags', () => {
      const board = createSeedBoard(fixedRef);
      const priorities = new Set(board.tasks.map((t) => t.priority));

      expect(priorities.has('low')).toBe(true);
      expect(priorities.has('medium')).toBe(true);
      expect(priorities.has('high')).toBe(true);

      const tasksWithTags = board.tasks.filter((t) => t.tags.length > 0);
      expect(tasksWithTags.length).toBeGreaterThanOrEqual(4);
    });

    it('T1-40: seed includes enriched subtasks with both completed and incomplete states', () => {
      const board = createSeedBoard(fixedRef);
      const allSubtasks = board.tasks.flatMap((t) => t.subtasks);

      expect(allSubtasks.length).toBeGreaterThanOrEqual(4);
      expect(allSubtasks.some((s) => s.completed)).toBe(true);
      expect(allSubtasks.some((s) => !s.completed)).toBe(true);
    });

    it('T1-41: seed covers varied due-date statuses and neutral Spanish copy', () => {
      const board = createSeedBoard(fixedRef);
      const statuses = new Set(
        board.tasks.map((t) => getDueDateEvaluation(t.dueDate, fixedRef).status),
      );

      expect(statuses.size).toBeGreaterThanOrEqual(3);
      expect(statuses.has('on_track')).toBe(true);
      expect(statuses.has('due_soon') || statuses.has('overdue')).toBe(true);

      for (const task of board.tasks) {
        expect(task.title.trim().length).toBeGreaterThan(0);
      }
      const joinedText = board.tasks.map((t) => `${t.title} ${t.description}`).join(' ');
      expect(/[áéíóúñÁÉÍÓÚÑ]|diseñar|implementar|validar|configurar|documentar|pruebas|tablero/i.test(joinedText)).toBe(
        true,
      );
    });
  });

  describe('Area 9: Schema Versioning, Migrations & Runtime Type Guards', () => {
    it('T1-42: verifies CURRENT_SCHEMA_VERSION === 2 and entity runtime type guards', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(2);

      const subtask: Subtask = { id: 'sub-1', title: 'Revisar tipos', completed: true };
      const column: ColumnDefinition = { id: 'todo', title: 'Por hacer', order: 0, wipLimit: null };
      const task: Task = makeTask({
        id: 'task-1',
        title: 'Validar entidad',
        tags: ['Testing'],
        dueDate: '2026-12-01',
        subtasks: [subtask],
      });
      const board: BoardState = createBoard(DEFAULT_COLUMNS, [task]);

      expect(isSubtask(subtask)).toBe(true);
      expect(isColumnDefinition(column)).toBe(true);
      expect(isTask(task)).toBe(true);
      expect(isBoardState(board)).toBe(true);
    });

    it('T1-43: validates persisted and exported board envelopes', () => {
      const board = createSeedBoard(new Date('2026-11-27T12:00:00.000Z'));
      const persisted: PersistedBoardEnvelope = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        updatedAt: '2026-11-27T12:00:00.000Z',
        board,
      };
      const exported: ExportedBoardEnvelope = {
        app: 'kanbam',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: '2026-11-27T12:00:00.000Z',
        board,
      };

      expect(isPersistedBoardEnvelope(persisted)).toBe(true);
      expect(isExportedBoardEnvelope(exported)).toBe(true);
    });

    it('T1-44: migrateBoardPayload passes through valid v2 envelope cleanly', () => {
      const board = createSeedBoard(new Date('2026-11-27T12:00:00.000Z'));
      const envelope: PersistedBoardEnvelope = {
        schemaVersion: 2,
        updatedAt: '2026-11-27T12:00:00.000Z',
        board,
      };

      const migrated = unwrapOk(migrateBoardPayload(envelope));
      expect(migrated.schemaVersion).toBe(2);
      expect(migrated.board).toEqual(board);
    });

    it('T1-45: migrateBoardPayload upgrades v1 persisted payload to v2', () => {
      const board = unwrapOk(
        createTask(createBoard(), {
          title: 'Migrar desde v1',
          columnId: 'in_progress',
          priority: 'high',
          tags: ['Refactor'],
          dueDate: '2026-12-10',
        }),
      );
      const v1Payload = {
        schemaVersion: 1,
        updatedAt: '2026-11-01T08:00:00.000Z',
        board,
      };

      const migrated = unwrapOk(migrateBoardPayload(v1Payload));
      expect(migrated.schemaVersion).toBe(2);
      expect(isPersistedBoardEnvelope(migrated)).toBe(true);
      expect(migrated.board.tasks[0]?.title).toBe('Migrar desde v1');
    });

    it('T1-46: migrateBoardPayload upgrades legacy unversioned v0 { tasks } payload to v2', () => {
      const legacyTask = makeTask({
        id: 'legacy-1',
        title: 'Tarea legada v0',
        columnId: 'todo',
        order: 0,
        priority: 'medium',
        tags: ['Docs'],
      });
      const v0Payload = {
        tasks: [legacyTask],
      };

      const migrated = unwrapOk(migrateBoardPayload(v0Payload));
      expect(migrated.schemaVersion).toBe(2);
      expect(migrated.board.columns).toHaveLength(4);
      expect(migrated.board.tasks).toHaveLength(1);
      expect(migrated.board.tasks[0]?.title).toBe('Tarea legada v0');
    });

    it('T1-47: isBoardState validates multi-column board containing subtasks, tags, and due dates', () => {
      let board = createBoard();
      board = unwrapOk(
        createTask(board, {
          title: 'Tarjeta A',
          columnId: 'todo',
          priority: 'low',
          tags: ['UI', 'Docs'],
          dueDate: '2026-12-15',
        }),
      );
      const taskId = board.tasks[0]?.id ?? '';
      board = unwrapOk(addSubtask(board, taskId, { title: 'Paso 1' }));
      board = unwrapOk(
        createTask(board, {
          title: 'Tarjeta B',
          columnId: 'done',
          priority: 'high',
          tags: ['Testing'],
          dueDate: null,
        }),
      );

      expect(isBoardState(board)).toBe(true);
    });
  });

  describe('Area 10: .json Export & Import', () => {
    it('T1-48: exportBoardToJson produces valid ExportedBoardEnvelope JSON with metadata', () => {
      const board = createSeedBoard(new Date('2026-11-27T12:00:00.000Z'));
      const exportedAt = '2026-11-27T15:00:00.000Z';
      const json = exportBoardToJson(board, exportedAt);
      const parsed: unknown = JSON.parse(json);

      expect(isExportedBoardEnvelope(parsed)).toBe(true);
      if (isExportedBoardEnvelope(parsed)) {
        expect(parsed.app).toBe('kanbam');
        expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
        expect(parsed.exportedAt).toBe(exportedAt);
        expect(parsed.board).toEqual(board);
      }
    });

    it('T1-49: exportBoardToJson -> importBoardFromJson round-trip preserves 7-card seed board', () => {
      const seed = createSeedBoard(new Date('2026-11-27T12:00:00.000Z'));
      const json = exportBoardToJson(seed, '2026-11-27T15:05:00.000Z');
      const imported = unwrapOk(importBoardFromJson(json));

      expect(imported).toEqual(seed);
    });

    it('T1-50: import preserves custom WIP limits, subtasks, tags, priorities, due dates, and order', () => {
      const customColumns: readonly ColumnDefinition[] = [
        { id: 'todo', title: COLUMN_TITLES.todo, order: 0, wipLimit: null },
        { id: 'in_progress', title: COLUMN_TITLES.in_progress, order: 1, wipLimit: 5 },
        { id: 'in_review', title: COLUMN_TITLES.in_review, order: 2, wipLimit: 1 },
        { id: 'done', title: COLUMN_TITLES.done, order: 3, wipLimit: null },
      ];
      let board = createBoard(customColumns);
      board = unwrapOk(
        createTask(board, {
          title: 'Tarjeta compleja',
          description: 'Con subtareas y etiquetas',
          columnId: 'in_progress',
          priority: 'high',
          tags: ['Feature', 'Testing'],
          dueDate: '2026-12-03',
        }),
      );
      const id1 = board.tasks[0]?.id ?? '';
      board = unwrapOk(addSubtask(board, id1, { title: 'Sub A' }));
      board = unwrapOk(addSubtask(board, id1, { title: 'Sub B' }));
      const subA = board.tasks[0]?.subtasks[0]?.id ?? '';
      board = unwrapOk(toggleSubtask(board, id1, subA));
      board = unwrapOk(
        createTask(board, {
          title: 'Segunda en progreso',
          columnId: 'in_progress',
          priority: 'low',
        }),
      );

      const json = exportBoardToJson(board, '2026-11-27T15:10:00.000Z');
      const imported = unwrapOk(importBoardFromJson(json));

      expect(imported).toEqual(board);
      const colIds: readonly ColumnId[] = ['in_progress'];
      expect(getTasksByColumn(imported, colIds[0] ?? 'in_progress').map((t) => t.order)).toEqual([0, 1]);
    });

    it('T1-51: importBoardFromJson supports valid v1 exported envelope via migration', () => {
      const v1Board = unwrapOk(
        createTask(createBoard(), {
          title: 'Respaldo v1',
          columnId: 'done',
          priority: 'medium',
          tags: ['Docs'],
        }),
      );
      const v1Export = {
        app: 'kanbam',
        schemaVersion: 1,
        exportedAt: '2026-10-15T09:00:00.000Z',
        board: v1Board,
      };

      const imported = unwrapOk(importBoardFromJson(JSON.stringify(v1Export)));
      expect(isBoardState(imported)).toBe(true);
      expect(imported.tasks).toHaveLength(1);
      expect(imported.tasks[0]?.title).toBe('Respaldo v1');
    });

    it('T1-52: exportBoardToJson works cleanly without exportedAt argument', () => {
      const board = createBoard();
      const json = exportBoardToJson(board);
      const parsed: unknown = JSON.parse(json);

      expect(isExportedBoardEnvelope(parsed)).toBe(true);
      if (isExportedBoardEnvelope(parsed)) {
        expect(parsed.exportedAt.length).toBeGreaterThan(0);
        expect(Number.isNaN(Date.parse(parsed.exportedAt))).toBe(false);
      }
    });
  });
});
