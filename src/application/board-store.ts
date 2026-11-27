import { createTask, deleteTask, getTasksByColumn, moveTask, updateTask } from '../domain/index.ts';
import type {
  BoardState,
  ColumnDefinition,
  ColumnId,
  CreateTaskInput,
  DomainError,
  Result,
  Task,
  UpdateTaskPatch,
} from '../domain/index.ts';
import { DEFAULT_FILTERS, filterTasks, hasActiveFilters } from './filters.ts';
import type { BoardFilters } from './filters.ts';
import type { BoardPersistence, BoardSerializer, Theme, ThemePersistence } from './ports.ts';

/**
 * `applied: true` means the in-memory board changed but persisting it failed,
 * so the UI should keep the change and warn the user.
 */
export interface StoreError {
  readonly message: string;
  readonly applied: boolean;
}

export type StoreResult = Result<void, StoreError>;

export interface BoardStoreDeps {
  readonly boards: BoardPersistence;
  readonly themes: ThemePersistence;
  readonly serializer: BoardSerializer;
}

export interface BoardStore {
  subscribe(listener: () => void): () => void;
  getBoard(): BoardState;
  getColumns(): readonly ColumnDefinition[];
  getTheme(): Theme;
  getFilters(): BoardFilters;
  hasActiveFilters(): boolean;
  /** Warning produced while loading persisted data (corruption, storage unavailable). */
  getStartupWarning(): string | undefined;
  getColumnTasks(columnId: ColumnId): readonly Task[];
  getVisibleColumnTasks(columnId: ColumnId): readonly Task[];
  addTask(input: CreateTaskInput): StoreResult;
  updateTask(taskId: string, patch: UpdateTaskPatch): StoreResult;
  deleteTask(taskId: string): StoreResult;
  moveTask(taskId: string, columnId: ColumnId, index?: number): StoreResult;
  setFilters(patch: Partial<BoardFilters>): void;
  clearFilters(): void;
  toggleTheme(): void;
  resetDemo(): StoreResult;
  exportJson(): string;
  importJson(raw: string): StoreResult;
}

const OK: StoreResult = { ok: true, value: undefined };

/**
 * Application store: every mutation delegates to a pure domain function and handles its
 * `Result`. WIP limits are not enforced (the original board accepted any number of cards).
 */
export function createBoardStore(deps: BoardStoreDeps): BoardStore {
  const loaded = deps.boards.load();
  let board: BoardState = loaded.board;
  let theme: Theme = deps.themes.load();
  let filters: BoardFilters = DEFAULT_FILTERS;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    listeners.forEach((listener) => listener());
  };

  const fail = (error: DomainError | { readonly message: string }): StoreResult => ({
    ok: false,
    error: { message: error.message, applied: false },
  });

  const commit = (next: BoardState): StoreResult => {
    board = next;
    const saved = deps.boards.save(next);
    notify();
    return saved.ok ? OK : { ok: false, error: { message: saved.error.message, applied: true } };
  };

  const mutate = (result: Result<BoardState, DomainError>): StoreResult =>
    result.ok ? commit(result.value) : fail(result.error);

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getBoard: () => board,
    getColumns: () => [...board.columns].sort((a, b) => a.order - b.order),
    getTheme: () => theme,
    getFilters: () => filters,
    hasActiveFilters: () => hasActiveFilters(filters),
    getStartupWarning: () => loaded.warning,
    getColumnTasks: (columnId) => getTasksByColumn(board, columnId),
    getVisibleColumnTasks: (columnId) => filterTasks(getTasksByColumn(board, columnId), filters),

    addTask: (input) => mutate(createTask(board, input)),
    updateTask: (taskId, patch) => mutate(updateTask(board, taskId, patch)),
    deleteTask: (taskId) => mutate(deleteTask(board, taskId)),
    moveTask: (taskId, columnId, index) => mutate(moveTask(board, taskId, columnId, index)),

    setFilters(patch) {
      filters = { ...filters, ...patch };
      notify();
    },
    clearFilters() {
      filters = DEFAULT_FILTERS;
      notify();
    },
    toggleTheme() {
      theme = theme === 'light' ? 'dark' : 'light';
      deps.themes.save(theme);
      notify();
    },
    resetDemo() {
      const reset = deps.boards.resetDemo();
      if (!reset.ok) return fail(reset.error);
      board = deps.boards.load().board;
      filters = DEFAULT_FILTERS;
      notify();
      return OK;
    },
    exportJson: () => deps.serializer.serialize(board),
    importJson(raw) {
      const parsed = deps.serializer.deserialize(raw);
      if (!parsed.ok) return fail(parsed.error);
      filters = DEFAULT_FILTERS;
      return commit(parsed.value);
    },
  };
}
