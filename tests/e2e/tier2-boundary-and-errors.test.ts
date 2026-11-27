import { describe, expect, it } from 'vitest';
import {
  DESCRIPTION_MAX_LENGTH,
  DUE_SOON_THRESHOLD_DAYS,
  MAX_TAGS_PER_TASK,
  SUBTASK_TITLE_MAX_LENGTH,
  TAG_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  addSubtask,
  createBoard,
  createTask,
  deleteTask,
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
  validateDescription,
  validateDueDate,
  validateSubtaskTitle,
  validateTags,
  validateTaskTitle,
  validateWipLimit,
} from '../../src/domain/index.ts';
import type {
  ColumnId,
  Priority,
  Result,
  Subtask,
  Task,
} from '../../src/domain/index.ts';
import {
  BOARD_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  createLocalStorageBoardRepository,
  createSeedBoard,
  importBoardFromJson,
  isBoardState,
  isColumnDefinition,
  isExportedBoardEnvelope,
  isPersistedBoardEnvelope,
  isSubtask,
  isTask,
  migrateBoardPayload,
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

function createFailingStorage(options: {
  readonly onGetItem?: () => string | null;
  readonly onSetItem?: (key: string, value: string) => void;
  readonly onRemoveItem?: (key: string) => void;
}): StorageAdapter {
  return {
    getItem: (_key: string): string | null => {
      if (options.onGetItem) {
        return options.onGetItem();
      }
      return null;
    },
    setItem: (key: string, value: string): void => {
      if (options.onSetItem) {
        options.onSetItem(key, value);
      }
    },
    removeItem: (key: string): void => {
      if (options.onRemoveItem) {
        options.onRemoveItem(key);
      }
    },
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

describe('Tier 2 — Boundary Conditions & Error Handling', () => {
  describe('Area 1: Columns & WIP Limits', () => {
    it('T2-01: rejects invalid column IDs in isValidColumnId and createTask', () => {
      const invalidValues: readonly unknown[] = ['backlog', '', null, 123, 'Por hacer'];
      for (const value of invalidValues) {
        expect(isValidColumnId(value)).toBe(false);
      }

      const board = createBoard();
      const err = unwrapErr(
        createTask(board, {
          title: 'Tarea en columna inválida',
          columnId: 'backlog' as ColumnId,
          priority: 'medium',
        }),
      );
      expect(err.code).toBe('INVALID_COLUMN');
    });

    it('T2-02: rejects 0, negative, float, NaN, and Infinity WIP limits', () => {
      for (const badLimit of [0, -3, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const err = unwrapErr(validateWipLimit(badLimit));
        expect(err.code).toBe('INVALID_WIP_LIMIT');
      }
    });

    it('T2-03: blocks createTask when target column is at WIP limit and enforceWipLimit is true', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'Rev 1', columnId: 'in_review', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'Rev 2', columnId: 'in_review', priority: 'medium' }));

      const err = unwrapErr(
        createTask(
          board,
          { title: 'Rev 3 bloqueada', columnId: 'in_review', priority: 'high' },
          { enforceWipLimit: true },
        ),
      );
      expect(err.code).toBe('WIP_LIMIT_EXCEEDED');
      expect(getTasksByColumn(board, 'in_review')).toHaveLength(2);
    });

    it('T2-04: blocks updateTask changing columnId into full column when enforceWipLimit is true', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'En espera', columnId: 'todo', priority: 'medium' }));
      board = unwrapOk(createTask(board, { title: 'Prog 1', columnId: 'in_progress', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'Prog 2', columnId: 'in_progress', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'Prog 3', columnId: 'in_progress', priority: 'low' }));

      const todoId = getTasksByColumn(board, 'todo')[0]?.id ?? '';
      const err = unwrapErr(
        updateTask(board, todoId, { columnId: 'in_progress' }, { enforceWipLimit: true }),
      );
      expect(err.code).toBe('WIP_LIMIT_EXCEEDED');
      expect(getTasksByColumn(board, 'todo')).toHaveLength(1);
      expect(getTasksByColumn(board, 'in_progress')).toHaveLength(3);
    });

    it('T2-05: allows updateTask editing fields on a task inside an already exceeded column', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'Rev 1', columnId: 'in_review', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'Rev 2', columnId: 'in_review', priority: 'medium' }));
      board = unwrapOk(
        createTask(
          board,
          { title: 'Rev 3', columnId: 'in_review', priority: 'high' },
          { enforceWipLimit: false },
        ),
      );

      const targetId = getTasksByColumn(board, 'in_review')[0]?.id ?? '';
      const updated = unwrapOk(
        updateTask(board, targetId, { title: 'Rev 1 actualizada' }, { enforceWipLimit: true }),
      );
      expect(getTasksByColumn(updated, 'in_review')[0]?.title).toBe('Rev 1 actualizada');
    });
  });

  describe('Area 2: Task CRUD & Validation', () => {
    it('T2-06: rejects empty and whitespace-only titles on validateTaskTitle, createTask, and updateTask', () => {
      const board = unwrapOk(
        createTask(createBoard(), { title: 'Válida', columnId: 'todo', priority: 'low' }),
      );
      const taskId = board.tasks[0]?.id ?? '';

      for (const badTitle of ['', '   ', '\t\n ']) {
        expect(unwrapErr(validateTaskTitle(badTitle)).code).toBe('EMPTY_TITLE');
        expect(
          unwrapErr(createTask(board, { title: badTitle, columnId: 'todo', priority: 'low' })).code,
        ).toBe('EMPTY_TITLE');
        expect(unwrapErr(updateTask(board, taskId, { title: badTitle })).code).toBe('EMPTY_TITLE');
      }
    });

    it('T2-07: enforces TITLE_MAX_LENGTH (120) boundary after trimming', () => {
      expect(TITLE_MAX_LENGTH).toBe(120);
      const exact = 'a'.repeat(TITLE_MAX_LENGTH);
      const padded = `  ${exact}  `;
      const over = 'a'.repeat(TITLE_MAX_LENGTH + 1);

      expect(unwrapOk(validateTaskTitle(exact))).toBe(exact);
      expect(unwrapOk(validateTaskTitle(padded))).toBe(exact);
      expect(unwrapErr(validateTaskTitle(over)).code).toBe('TITLE_TOO_LONG');

      const created = unwrapOk(
        createTask(createBoard(), { title: padded, columnId: 'todo', priority: 'medium' }),
      );
      expect(created.tasks[0]?.title).toHaveLength(120);
      expect(
        unwrapErr(createTask(created, { title: over, columnId: 'todo', priority: 'medium' })).code,
      ).toBe('TITLE_TOO_LONG');
    });

    it('T2-08: enforces DESCRIPTION_MAX_LENGTH (2000) boundary', () => {
      expect(DESCRIPTION_MAX_LENGTH).toBe(2000);
      const exact = 'd'.repeat(DESCRIPTION_MAX_LENGTH);
      const over = 'd'.repeat(DESCRIPTION_MAX_LENGTH + 1);

      expect(unwrapOk(validateDescription(''))).toBe('');
      expect(unwrapOk(validateDescription(exact))).toBe(exact);
      expect(unwrapErr(validateDescription(over)).code).toBe('DESCRIPTION_TOO_LONG');

      const created = unwrapOk(
        createTask(createBoard(), {
          title: 'Desc límite',
          description: exact,
          columnId: 'todo',
          priority: 'low',
        }),
      );
      expect(created.tasks[0]?.description).toHaveLength(2000);
      expect(
        unwrapErr(
          createTask(created, {
            title: 'Desc excedida',
            description: over,
            columnId: 'todo',
            priority: 'low',
          }),
        ).code,
      ).toBe('DESCRIPTION_TOO_LONG');
    });

    it('T2-09: rejects invalid priority values including Spanish display labels', () => {
      for (const badPriority of ['urgent', 'Alta', '', null, 42]) {
        expect(isValidPriority(badPriority)).toBe(false);
      }

      const board = unwrapOk(
        createTask(createBoard(), { title: 'Base', columnId: 'todo', priority: 'low' }),
      );
      const taskId = board.tasks[0]?.id ?? '';

      expect(
        unwrapErr(
          createTask(board, {
            title: 'Mala prioridad',
            columnId: 'todo',
            priority: 'Alta' as Priority,
          }),
        ).code,
      ).toBe('INVALID_PRIORITY');
      expect(
        unwrapErr(updateTask(board, taskId, { priority: 'urgent' as Priority })).code,
      ).toBe('INVALID_PRIORITY');
    });

    it('T2-10: rejects updateTask and deleteTask when taskId does not exist', () => {
      const board = createBoard();

      expect(unwrapErr(updateTask(board, 'nonexistent-id', { title: 'Nuevo' })).code).toBe(
        'TASK_NOT_FOUND',
      );
      expect(unwrapErr(deleteTask(board, 'nonexistent-id')).code).toBe('TASK_NOT_FOUND');
    });

    it('T2-11: leaves input BoardState and nested tasks unmutated on failed CRUD operations', () => {
      const initial = unwrapOk(
        createTask(createBoard(), {
          title: 'Intacta',
          description: 'Original',
          columnId: 'todo',
          priority: 'medium',
          tags: ['UI'],
        }),
      );
      const snapshot = structuredClone(initial);
      const taskId = initial.tasks[0]?.id ?? '';

      expect(createTask(initial, { title: '   ', columnId: 'todo', priority: 'low' }).ok).toBe(false);
      expect(updateTask(initial, taskId, { title: '' }).ok).toBe(false);
      expect(deleteTask(initial, 'missing').ok).toBe(false);

      expect(initial).toEqual(snapshot);
    });
  });

  describe('Area 3: Multi-Tag Support', () => {
    it('T2-12: rejects empty and whitespace-only tags', () => {
      expect(unwrapErr(validateTags(['UI', '   '])).code).toBe('INVALID_TAG');
      expect(unwrapErr(validateTags([''])).code).toBe('INVALID_TAG');
    });

    it('T2-13: enforces TAG_MAX_LENGTH (32) boundary', () => {
      expect(TAG_MAX_LENGTH).toBe(32);
      const validTag = 'x'.repeat(TAG_MAX_LENGTH);
      const invalidTag = 'x'.repeat(TAG_MAX_LENGTH + 1);

      expect(unwrapOk(validateTags([validTag]))).toEqual([validTag]);
      expect(unwrapErr(validateTags([invalidTag])).code).toBe('INVALID_TAG');
    });

    it('T2-14: enforces MAX_TAGS_PER_TASK (10) boundary', () => {
      expect(MAX_TAGS_PER_TASK).toBe(10);
      const tenTags = Array.from({ length: 10 }, (_, i) => `tag-${i + 1}`);
      const elevenTags = Array.from({ length: 11 }, (_, i) => `tag-${i + 1}`);

      expect(unwrapOk(validateTags(tenTags))).toEqual(tenTags);
      expect(unwrapErr(validateTags(elevenTags)).code).toBe('TOO_MANY_TAGS');
    });

    it('T2-15: collapses whitespace-padded duplicate tags cleanly', () => {
      expect(unwrapOk(validateTags(['UI', ' UI ', '  UI\t']))).toEqual(['UI']);
    });

    it('T2-16: rejects invalid or excessive tags in createTask and updateTask without mutation', () => {
      const board = unwrapOk(
        createTask(createBoard(), {
          title: 'Con etiquetas válidas',
          columnId: 'todo',
          priority: 'medium',
          tags: ['UI'],
        }),
      );
      const taskId = board.tasks[0]?.id ?? '';
      const elevenTags = Array.from({ length: 11 }, (_, i) => `etiqueta-${i + 1}`);

      expect(
        unwrapErr(
          createTask(board, {
            title: 'Tag larga',
            columnId: 'todo',
            priority: 'low',
            tags: ['x'.repeat(33)],
          }),
        ).code,
      ).toBe('INVALID_TAG');

      expect(unwrapErr(updateTask(board, taskId, { tags: elevenTags })).code).toBe('TOO_MANY_TAGS');
      expect(board.tasks[0]?.tags).toEqual(['UI']);
    });
  });

  describe('Area 4: Optional Due Date & Expiration Status', () => {
    it('T2-17: rejects empty string and malformed date formats', () => {
      for (const badDate of [
        '',
        '2026/11/27',
        '27-11-2026',
        '2026-1-5',
        '2026-11-27T00:00:00Z',
        'no-es-fecha',
      ]) {
        expect(unwrapErr(validateDueDate(badDate)).code).toBe('INVALID_DUE_DATE');
      }
    });

    it('T2-18: rejects impossible calendar dates', () => {
      for (const impossible of ['2026-02-30', '2026-04-31', '2026-13-01', '2026-01-00', '2026-00-10']) {
        expect(unwrapErr(validateDueDate(impossible)).code).toBe('INVALID_DUE_DATE');
      }
    });

    it('T2-19: validates leap years accurately (2024-02-29 valid vs 2026-02-29 and 2100-02-29 invalid)', () => {
      expect(unwrapOk(validateDueDate('2024-02-29'))).toBe('2024-02-29');
      expect(unwrapErr(validateDueDate('2026-02-29')).code).toBe('INVALID_DUE_DATE');
      expect(unwrapErr(validateDueDate('2100-02-29')).code).toBe('INVALID_DUE_DATE');
    });

    it('T2-20: evaluates exact DUE_SOON_THRESHOLD_DAYS (3) boundary (+3 due_soon vs +4 on_track)', () => {
      expect(DUE_SOON_THRESHOLD_DAYS).toBe(3);
      const ref = '2026-11-27';

      const plusThree = getDueDateEvaluation('2026-11-30', ref);
      expect(plusThree.status).toBe('due_soon');
      expect(plusThree.label).toBe('Próxima a vencer');

      const plusFour = getDueDateEvaluation('2026-12-01', ref);
      expect(plusFour.status).toBe('on_track');
      expect(plusFour.label).toBe('En plazo');
    });

    it('T2-21: evaluates same-day (0d) as due_soon and yesterday (-1d) as overdue', () => {
      const ref = '2026-11-27';

      const sameDay = getDueDateEvaluation('2026-11-27', ref);
      expect(sameDay.status).toBe('due_soon');
      expect(sameDay.label).toBe('Próxima a vencer');

      const yesterday = getDueDateEvaluation('2026-11-26', ref);
      expect(yesterday.status).toBe('overdue');
      expect(yesterday.label).toBe('Vencida');
    });

    it('T2-22: rejects invalid dueDate in createTask and updateTask', () => {
      const board = unwrapOk(
        createTask(createBoard(), { title: 'Fecha válida', columnId: 'todo', priority: 'low' }),
      );
      const taskId = board.tasks[0]?.id ?? '';

      expect(
        unwrapErr(
          createTask(board, {
            title: 'Fecha imposible',
            columnId: 'todo',
            priority: 'medium',
            dueDate: '2026-02-30',
          }),
        ).code,
      ).toBe('INVALID_DUE_DATE');
      expect(unwrapErr(updateTask(board, taskId, { dueDate: '2026-04-31' })).code).toBe(
        'INVALID_DUE_DATE',
      );
    });
  });

  describe('Area 5: Subtasks & Progress', () => {
    it('T2-23: rejects empty or whitespace-only subtask titles across validator, add, and update', () => {
      let board = unwrapOk(
        createTask(createBoard(), { title: 'Con subtarea', columnId: 'todo', priority: 'medium' }),
      );
      const taskId = board.tasks[0]?.id ?? '';
      board = unwrapOk(addSubtask(board, taskId, { title: 'Inicial' }));
      const subtaskId = board.tasks[0]?.subtasks[0]?.id ?? '';

      for (const bad of ['', '   ', '\t\n']) {
        expect(unwrapErr(validateSubtaskTitle(bad)).code).toBe('EMPTY_SUBTASK_TITLE');
        expect(unwrapErr(addSubtask(board, taskId, { title: bad })).code).toBe('EMPTY_SUBTASK_TITLE');
        expect(unwrapErr(updateSubtaskTitle(board, taskId, subtaskId, bad)).code).toBe(
          'EMPTY_SUBTASK_TITLE',
        );
      }
    });

    it('T2-24: enforces SUBTASK_TITLE_MAX_LENGTH (120) boundary', () => {
      expect(SUBTASK_TITLE_MAX_LENGTH).toBe(120);
      const valid = 's'.repeat(SUBTASK_TITLE_MAX_LENGTH);
      const tooLong = 's'.repeat(SUBTASK_TITLE_MAX_LENGTH + 1);

      expect(unwrapOk(validateSubtaskTitle(valid))).toBe(valid);
      expect(unwrapErr(validateSubtaskTitle(tooLong)).code).toBe('SUBTASK_TITLE_TOO_LONG');

      const board = unwrapOk(
        createTask(createBoard(), { title: 'Padre', columnId: 'todo', priority: 'low' }),
      );
      const taskId = board.tasks[0]?.id ?? '';
      expect(unwrapErr(addSubtask(board, taskId, { title: tooLong })).code).toBe(
        'SUBTASK_TITLE_TOO_LONG',
      );
    });

    it('T2-25: returns TASK_NOT_FOUND for subtask operations targeting nonexistent taskId', () => {
      const board = createBoard();

      expect(unwrapErr(addSubtask(board, 'missing-task', { title: 'Sub' })).code).toBe('TASK_NOT_FOUND');
      expect(unwrapErr(updateSubtaskTitle(board, 'missing-task', 'sub-1', 'Nuevo')).code).toBe(
        'TASK_NOT_FOUND',
      );
      expect(unwrapErr(toggleSubtask(board, 'missing-task', 'sub-1')).code).toBe('TASK_NOT_FOUND');
      expect(unwrapErr(removeSubtask(board, 'missing-task', 'sub-1')).code).toBe('TASK_NOT_FOUND');
    });

    it('T2-26: returns SUBTASK_NOT_FOUND when taskId exists but subtaskId does not', () => {
      const board = unwrapOk(
        createTask(createBoard(), { title: 'Padre existente', columnId: 'todo', priority: 'low' }),
      );
      const taskId = board.tasks[0]?.id ?? '';

      expect(unwrapErr(updateSubtaskTitle(board, taskId, 'missing-sub', 'Nuevo')).code).toBe(
        'SUBTASK_NOT_FOUND',
      );
      expect(unwrapErr(toggleSubtask(board, taskId, 'missing-sub')).code).toBe('SUBTASK_NOT_FOUND');
      expect(unwrapErr(removeSubtask(board, taskId, 'missing-sub')).code).toBe('SUBTASK_NOT_FOUND');
    });

    it('T2-27: computes SubtaskProgress for empty, 1/3 rounding, and 100% completed lists', () => {
      expect(getSubtaskProgress([])).toEqual({
        completed: 0,
        total: 0,
        percentage: 0,
        label: '0/0',
      });

      const twoDone: readonly Subtask[] = [
        { id: '1', title: 'A', completed: true },
        { id: '2', title: 'B', completed: true },
      ];
      expect(getSubtaskProgress(twoDone)).toEqual({
        completed: 2,
        total: 2,
        percentage: 100,
        label: '2/2',
      });

      const oneOfThree: readonly Subtask[] = [
        { id: '1', title: 'A', completed: true },
        { id: '2', title: 'B', completed: false },
        { id: '3', title: 'C', completed: false },
      ];
      expect(getSubtaskProgress(oneOfThree)).toEqual({
        completed: 1,
        total: 3,
        percentage: 33,
        label: '1/3',
      });
    });

    it('T2-28: subtask updates on one task leave sibling task subtasks and original board unmutated', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'Tarea 1', columnId: 'todo', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'Tarea 2', columnId: 'todo', priority: 'medium' }));

      const id1 = board.tasks[0]?.id ?? '';
      const id2 = board.tasks[1]?.id ?? '';
      board = unwrapOk(addSubtask(board, id1, { title: 'Sub T1' }));
      board = unwrapOk(addSubtask(board, id2, { title: 'Sub T2' }));

      const sub1 = board.tasks[0]?.subtasks[0]?.id ?? '';
      const snapshot = structuredClone(board);
      const toggled = unwrapOk(toggleSubtask(board, id1, sub1));

      expect(board).toEqual(snapshot);
      expect(toggled.tasks.find((t) => t.id === id1)?.subtasks[0]?.completed).toBe(true);
      expect(toggled.tasks.find((t) => t.id === id2)?.subtasks).toEqual(
        snapshot.tasks.find((t) => t.id === id2)?.subtasks,
      );
    });
  });

  describe('Area 6: Task Move & Reorder', () => {
    it('T2-29: rejects moveTask for nonexistent taskId or invalid targetColumnId', () => {
      const board = unwrapOk(
        createTask(createBoard(), { title: 'Existente', columnId: 'todo', priority: 'low' }),
      );
      const existingId = board.tasks[0]?.id ?? '';

      expect(unwrapErr(moveTask(board, 'missing-id', 'in_progress')).code).toBe('TASK_NOT_FOUND');
      expect(unwrapErr(moveTask(board, existingId, 'invalid-col' as ColumnId)).code).toBe(
        'INVALID_COLUMN',
      );
    });

    it('T2-30: rejects negative, fractional, and NaN targetIndex values', () => {
      const board = unwrapOk(
        createTask(createBoard(), { title: 'Mover', columnId: 'todo', priority: 'medium' }),
      );
      const taskId = board.tasks[0]?.id ?? '';

      for (const badIndex of [-1, 1.5, Number.NaN]) {
        expect(unwrapErr(moveTask(board, taskId, 'in_progress', badIndex)).code).toBe(
          'INVALID_POSITION',
        );
      }
    });

    it('T2-31: rejects out-of-bounds targetIndex for cross-column and same-column moves', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'T1', columnId: 'todo', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'T2', columnId: 'todo', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'T3', columnId: 'todo', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'P1', columnId: 'in_progress', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'P2', columnId: 'in_progress', priority: 'low' }));

      const todo1Id = getTasksByColumn(board, 'todo')[0]?.id ?? '';

      // Cross-column into 2-task column: valid 0..2, invalid 3
      expect(unwrapErr(moveTask(board, todo1Id, 'in_progress', 3)).code).toBe('INVALID_POSITION');
      // Same-column with 3 tasks: valid 0..2, invalid 3
      expect(unwrapErr(moveTask(board, todo1Id, 'todo', 3)).code).toBe('INVALID_POSITION');
    });

    it('T2-32: blocks cross-column move into column at WIP limit when enforceWipLimit is true', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'En espera', columnId: 'in_progress', priority: 'high' }));
      board = unwrapOk(createTask(board, { title: 'Rev 1', columnId: 'in_review', priority: 'medium' }));
      board = unwrapOk(createTask(board, { title: 'Rev 2', columnId: 'in_review', priority: 'low' }));

      const movingId = getTasksByColumn(board, 'in_progress')[0]?.id ?? '';
      const err = unwrapErr(moveTask(board, movingId, 'in_review', 0, { enforceWipLimit: true }));

      expect(err.code).toBe('WIP_LIMIT_EXCEEDED');
      expect(getTasksByColumn(board, 'in_progress')).toHaveLength(1);
      expect(getTasksByColumn(board, 'in_review')).toHaveLength(2);
    });

    it('T2-33: allows same-column reorder even when column exceeds WIP limit with enforceWipLimit: true', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'R0', columnId: 'in_review', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'R1', columnId: 'in_review', priority: 'medium' }));
      board = unwrapOk(
        createTask(
          board,
          { title: 'R2', columnId: 'in_review', priority: 'high' },
          { enforceWipLimit: false },
        ),
      );

      const lastId = getTasksByColumn(board, 'in_review')[2]?.id ?? '';
      const reordered = unwrapOk(moveTask(board, lastId, 'in_review', 0, { enforceWipLimit: true }));

      expect(getTasksByColumn(reordered, 'in_review').map((t) => [t.title, t.order])).toEqual([
        ['R2', 0],
        ['R0', 1],
        ['R1', 2],
      ]);
    });

    it('T2-34: keeps contiguous 0..n-1 order on no-op same-column move to current index', () => {
      let board = createBoard();
      board = unwrapOk(createTask(board, { title: 'A', columnId: 'todo', priority: 'low' }));
      board = unwrapOk(createTask(board, { title: 'B', columnId: 'todo', priority: 'medium' }));
      board = unwrapOk(createTask(board, { title: 'C', columnId: 'todo', priority: 'high' }));

      const middleId = getTasksByColumn(board, 'todo')[1]?.id ?? '';
      const moved = unwrapOk(moveTask(board, middleId, 'todo', 1));

      expect(getTasksByColumn(moved, 'todo').map((t) => [t.title, t.order])).toEqual([
        ['A', 0],
        ['B', 1],
        ['C', 2],
      ]);
    });
  });

  describe('Area 7: Shielded localStorage Repository', () => {
    it('T2-35: handles storage: null safely on load, save, and resetDemo without throwing', () => {
      const repo = createLocalStorageBoardRepository({
        storage: null,
        referenceDate: () => new Date('2026-11-27T12:00:00.000Z'),
      });

      const loaded = repo.load();
      expect(loaded.status).toBe('recovered_from_storage_error');
      expect(loaded.board.tasks).toHaveLength(7);
      expect(loaded.warning?.length).toBeGreaterThan(0);

      const saveErr = unwrapErr(repo.save(loaded.board));
      expect(saveErr.code).toBe('STORAGE_UNAVAILABLE');

      const resetRes = repo.resetDemo();
      expect(resetRes.ok).toBe(false);
      if (!resetRes.ok) {
        expect(resetRes.error.code).toBe('STORAGE_UNAVAILABLE');
      }
    });

    it('T2-36: catches SecurityError from storage.getItem on load() and falls back to 7-card seed', () => {
      const failingStorage = createFailingStorage({
        onGetItem: () => {
          const securityErr = new Error('Access denied');
          securityErr.name = 'SecurityError';
          throw securityErr;
        },
      });
      const repo = createLocalStorageBoardRepository({ storage: failingStorage });

      const loaded = repo.load();
      expect(loaded.status).toBe('recovered_from_storage_error');
      expect(loaded.board.tasks).toHaveLength(7);
      expect(loaded.warning?.length).toBeGreaterThan(0);
    });

    it('T2-37: catches QuotaExceededError from storage.setItem on save()', () => {
      const quotaStorage = createFailingStorage({
        onSetItem: () => {
          const quotaErr = new Error('Storage quota exceeded');
          quotaErr.name = 'QuotaExceededError';
          throw quotaErr;
        },
      });
      const repo = createLocalStorageBoardRepository({ storage: quotaStorage });

      const err = unwrapErr(repo.save(createBoard()));
      expect(err.code).toBe('STORAGE_QUOTA_EXCEEDED');
    });

    it('T2-38: catches generic write failure from storage.setItem on save()', () => {
      const ioStorage = createFailingStorage({
        onSetItem: () => {
          throw new Error('I/O failure');
        },
      });
      const repo = createLocalStorageBoardRepository({ storage: ioStorage });

      const err = unwrapErr(repo.save(createBoard()));
      expect(err.code).toBe('STORAGE_WRITE_FAILED');
    });

    it('T2-39: recovers safely with 7-card seed when stored JSON string is corrupt', () => {
      const mem = createMemoryStorage({
        [BOARD_STORAGE_KEY]: '{broken-json',
      });
      const repo = createLocalStorageBoardRepository({
        storage: mem.adapter,
        referenceDate: () => new Date('2026-11-27T12:00:00.000Z'),
      });

      const loaded = repo.load();
      expect(loaded.status).toBe('recovered_from_corruption');
      expect(loaded.board.tasks).toHaveLength(7);
      expect(loaded.warning?.length).toBeGreaterThan(0);
    });
  });

  describe('Area 8: Seed Data & Demo Reset', () => {
    it('T2-40: produces deterministic seed output for a fixed referenceDate', () => {
      const ref = new Date('2026-11-27T00:00:00.000Z');
      const first = createSeedBoard(ref);
      const second = createSeedBoard(ref);

      expect(first).toEqual(second);
    });

    it('T2-41: adapts seed due dates relative to supplied referenceDate', () => {
      const refEarly = new Date('2025-01-10T12:00:00.000Z');
      const refLate = new Date('2027-06-15T12:00:00.000Z');

      const seedEarly = createSeedBoard(refEarly);
      const seedLate = createSeedBoard(refLate);

      const earlyDueDates = seedEarly.tasks.map((t) => t.dueDate).filter((d) => d !== null);
      const lateDueDates = seedLate.tasks.map((t) => t.dueDate).filter((d) => d !== null);
      expect(earlyDueDates).not.toEqual(lateDueDates);

      const lateStatuses = new Set(
        seedLate.tasks.map((t) => getDueDateEvaluation(t.dueDate, refLate).status),
      );
      expect(lateStatuses.has('on_track')).toBe(true);
      expect(lateStatuses.has('due_soon') || lateStatuses.has('overdue')).toBe(true);
    });

    it('T2-42: resetDemo recovers cleanly even when storage currently holds corrupt data', () => {
      const mem = createMemoryStorage({
        [BOARD_STORAGE_KEY]: 'not-valid-json{{{',
      });
      const fixedRef = new Date('2026-11-27T12:00:00.000Z');
      const repo = createLocalStorageBoardRepository({
        storage: mem.adapter,
        referenceDate: () => fixedRef,
      });

      const resetRes = repo.resetDemo(fixedRef);
      expect(resetRes.ok).toBe(true);

      const reloaded = repo.load();
      expect(reloaded.status).toBe('loaded');
      expect(reloaded.board.tasks).toHaveLength(7);
    });

    it('T2-43: resetDemo surfaces storage error cleanly without throwing when setItem fails', () => {
      const quotaStorage = createFailingStorage({
        onSetItem: () => {
          const err = new Error('Quota exceeded');
          err.name = 'QuotaExceededError';
          throw err;
        },
      });
      const repo = createLocalStorageBoardRepository({ storage: quotaStorage });

      const result = repo.resetDemo(new Date('2026-11-27T12:00:00.000Z'));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('STORAGE_QUOTA_EXCEEDED');
      }
    });

    it('T2-44: ensures every task and subtask in createSeedBoard passes domain validators', () => {
      const seed = createSeedBoard(new Date('2026-11-27T12:00:00.000Z'));

      for (const task of seed.tasks) {
        expect(isValidColumnId(task.columnId)).toBe(true);
        expect(isValidPriority(task.priority)).toBe(true);
        expect(validateTaskTitle(task.title).ok).toBe(true);
        expect(validateDescription(task.description).ok).toBe(true);
        expect(validateTags(task.tags).ok).toBe(true);
        expect(validateDueDate(task.dueDate).ok).toBe(true);
        for (const sub of task.subtasks) {
          expect(validateSubtaskTitle(sub.title).ok).toBe(true);
        }
      }
    });
  });

  describe('Area 9: Schema Versioning, Migrations & Runtime Type Guards', () => {
    it('T2-45: rejects unknown/future schema versions and recovers via repository load()', () => {
      const validBoard = createBoard();
      for (const futureVersion of [3, 99, 999]) {
        const err = unwrapErr(
          migrateBoardPayload({
            schemaVersion: futureVersion,
            updatedAt: '2026-11-27T12:00:00.000Z',
            board: validBoard,
          }),
        );
        expect(err.code).toBe('UNSUPPORTED_SCHEMA_VERSION');
      }

      const mem = createMemoryStorage({
        [BOARD_STORAGE_KEY]: JSON.stringify({
          schemaVersion: 99,
          updatedAt: '2026-11-27T12:00:00.000Z',
          board: validBoard,
        }),
      });
      const repo = createLocalStorageBoardRepository({ storage: mem.adapter });
      const loaded = repo.load();
      expect(loaded.status).toBe('recovered_from_corruption');
      expect(loaded.board.tasks).toHaveLength(7);
    });

    it('T2-46: rejects negative, zero, non-integer, NaN, and non-numeric schemaVersion values', () => {
      const validBoard = createBoard();
      for (const badVersion of [-1, 0, 1.5, '2', Number.NaN, null]) {
        const err = unwrapErr(
          migrateBoardPayload({
            schemaVersion: badVersion,
            updatedAt: '2026-11-27T12:00:00.000Z',
            board: validBoard,
          }),
        );
        expect(['UNSUPPORTED_SCHEMA_VERSION', 'INVALID_SCHEMA']).toContain(err.code);
      }
    });

    it('T2-47: rejects primitive, null, undefined, and array roots across guards and migrateBoardPayload', () => {
      for (const root of [null, undefined, 42, 'str', []]) {
        expect(isSubtask(root)).toBe(false);
        expect(isColumnDefinition(root)).toBe(false);
        expect(isTask(root)).toBe(false);
        expect(isBoardState(root)).toBe(false);
        expect(isPersistedBoardEnvelope(root)).toBe(false);
        expect(isExportedBoardEnvelope(root)).toBe(false);

        const err = unwrapErr(migrateBoardPayload(root));
        expect(err.code).toBe('INVALID_SCHEMA');
      }
    });

    it('T2-48: rejects tasks with invalid dueDate, invalid priority, or >10 tags', () => {
      const badDueDate = makeTask({ id: 't-date', dueDate: '2026-02-30' });
      const badPriority = { ...makeTask({ id: 't-prio' }), priority: 'critical' };
      const tooManyTags = makeTask({
        id: 't-tags',
        tags: Array.from({ length: 11 }, (_, i) => `t-${i}`),
      });

      for (const badTask of [badDueDate, badPriority, tooManyTags]) {
        expect(isTask(badTask)).toBe(false);
        const badBoard = { columns: createBoard().columns, tasks: [badTask] };
        expect(isBoardState(badBoard)).toBe(false);
        expect(
          unwrapErr(
            migrateBoardPayload({
              schemaVersion: CURRENT_SCHEMA_VERSION,
              updatedAt: '2026-11-27T12:00:00.000Z',
              board: badBoard,
            }),
          ).code,
        ).toBe('INVALID_SCHEMA');
      }
    });

    it('T2-49: rejects duplicate task IDs, duplicate subtask IDs, and duplicate column IDs in isBoardState', () => {
      const defaultCols = createBoard().columns;

      const dupTasks = {
        columns: defaultCols,
        tasks: [makeTask({ id: 'dup-id', order: 0 }), makeTask({ id: 'dup-id', order: 1 })],
      };
      expect(isBoardState(dupTasks)).toBe(false);

      const dupSubtasks = {
        columns: defaultCols,
        tasks: [
          makeTask({
            id: 't-1',
            subtasks: [
              { id: 'sub-dup', title: 'A', completed: false },
              { id: 'sub-dup', title: 'B', completed: true },
            ],
          }),
        ],
      };
      expect(isBoardState(dupSubtasks)).toBe(false);

      const dupColumns = {
        columns: [defaultCols[0], defaultCols[0], defaultCols[2], defaultCols[3]],
        tasks: [],
      };
      expect(isBoardState(dupColumns)).toBe(false);
    });

    it('T2-50: rejects missing required columns or invalid column wipLimit in isBoardState', () => {
      const defaultCols = createBoard().columns;

      const missingCol = {
        columns: defaultCols.filter((c) => c.id !== 'in_review'),
        tasks: [],
      };
      expect(isBoardState(missingCol)).toBe(false);

      const zeroWipCol = {
        columns: defaultCols.map((c) => (c.id === 'in_progress' ? { ...c, wipLimit: 0 } : c)),
        tasks: [],
      };
      expect(isBoardState(zeroWipCol)).toBe(false);
    });

    it('T2-51: rejects malformed v0 and v1 migration payloads', () => {
      const badV0NonArray = unwrapErr(migrateBoardPayload({ tasks: 'not-an-array' }));
      expect(['INVALID_SCHEMA', 'MIGRATION_FAILED']).toContain(badV0NonArray.code);

      const badV0EmptyTitle = unwrapErr(
        migrateBoardPayload({ tasks: [{ id: '1', title: '' }] }),
      );
      expect(['INVALID_SCHEMA', 'MIGRATION_FAILED']).toContain(badV0EmptyTitle.code);

      const badV1Board = unwrapErr(
        migrateBoardPayload({
          schemaVersion: 1,
          updatedAt: '2026-11-27T12:00:00.000Z',
          board: { columns: 'bad', tasks: [] },
        }),
      );
      expect(['INVALID_SCHEMA', 'MIGRATION_FAILED']).toContain(badV1Board.code);
    });
  });

  describe('Area 10: .json Export & Import', () => {
    it('T2-52: rejects empty, whitespace-only, malformed, and truncated JSON strings', () => {
      for (const raw of ['', '   ', '{bad json', '{"app":"kanbam"']) {
        expect(unwrapErr(importBoardFromJson(raw)).code).toBe('INVALID_JSON');
      }
    });

    it('T2-53: rejects missing or mismatched app identifier on import', () => {
      const board = createBoard();
      const wrongApp = JSON.stringify({
        app: 'other-app',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: '2026-11-27T12:00:00.000Z',
        board,
      });
      const missingApp = JSON.stringify({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        exportedAt: '2026-11-27T12:00:00.000Z',
        board,
      });

      expect(unwrapErr(importBoardFromJson(wrongApp)).code).toBe('INVALID_SCHEMA');
      expect(unwrapErr(importBoardFromJson(missingApp)).code).toBe('INVALID_SCHEMA');
    });

    it('T2-54: rejects unsupported, future, negative, and non-integer schemaVersion on import', () => {
      const board = createBoard();
      for (const badVersion of [3, -1, 2.5]) {
        const raw = JSON.stringify({
          app: 'kanbam',
          schemaVersion: badVersion,
          exportedAt: '2026-11-27T12:00:00.000Z',
          board,
        });
        expect(unwrapErr(importBoardFromJson(raw)).code).toBe('UNSUPPORTED_SCHEMA_VERSION');
      }
    });

    it('T2-55: rejects valid JSON envelope containing tampered task, invalid date, or duplicate IDs', () => {
      const baseCols = createBoard().columns;
      const payloads = [
        {
          app: 'kanbam',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          exportedAt: '2026-11-27T12:00:00.000Z',
          board: { columns: baseCols, tasks: [makeTask({ id: 't-1', title: '   ' })] },
        },
        {
          app: 'kanbam',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          exportedAt: '2026-11-27T12:00:00.000Z',
          board: { columns: baseCols, tasks: [makeTask({ id: 't-1', dueDate: '2026-02-30' })] },
        },
        {
          app: 'kanbam',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          exportedAt: '2026-11-27T12:00:00.000Z',
          board: {
            columns: baseCols,
            tasks: [makeTask({ id: 'dup', order: 0 }), makeTask({ id: 'dup', order: 1 })],
          },
        },
      ];

      for (const payload of payloads) {
        expect(unwrapErr(importBoardFromJson(JSON.stringify(payload))).code).toBe('INVALID_SCHEMA');
      }
    });

    it('T2-56: leaves existing repository state completely untouched after failed JSON import', () => {
      const mem = createMemoryStorage();
      const repo = createLocalStorageBoardRepository({ storage: mem.adapter });
      const savedBoard = unwrapOk(
        createTask(createBoard(), {
          title: 'Trabajo guardado',
          columnId: 'todo',
          priority: 'high',
        }),
      );
      expect(repo.save(savedBoard).ok).toBe(true);

      const failedImport = importBoardFromJson('{"app":"kanbam","schemaVersion":99}');
      expect(failedImport.ok).toBe(false);

      const loaded = repo.load();
      expect(loaded.status).toBe('loaded');
      expect(loaded.board).toEqual(savedBoard);
    });
  });
});
