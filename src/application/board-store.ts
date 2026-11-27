import {
  addSubtask,
  createTask,
  deleteTask,
  getBoardWipEvaluations,
  getTasksByColumn,
  moveTask,
  removeSubtask,
  toggleSubtask,
  updateSubtaskTitle,
  updateTask,
} from '../domain/index.ts';
import type {
  BoardState,
  ColumnDefinition,
  ColumnId,
  CreateTaskInput,
  DomainError,
  Result,
  Task,
  UpdateTaskPatch,
  WipEvaluation,
} from '../domain/index.ts';
import { DEFAULT_FILTERS, filterTasks, hasActiveFilters } from './filters.ts';
import type { BoardFilters } from './filters.ts';
import { emptyHistory, recordChange, redoStep, undoStep } from './history.ts';
import type { History, HistoryStep } from './history.ts';
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
  /** Reference "today" for due-date filters; defaults to the current date. */
  readonly referenceDate?: () => Date;
}

/** Immutable snapshot: a new object is created for every committed change. */
export interface StoreState {
  readonly board: BoardState;
  readonly filters: BoardFilters;
  readonly theme: Theme;
  readonly wip: Readonly<Record<ColumnId, WipEvaluation>>;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type StoreListener = (state: StoreState) => void;

export interface BoardStore {
  subscribe(listener: StoreListener): () => void;
  getState(): StoreState;
  getBoard(): BoardState;
  getColumns(): readonly ColumnDefinition[];
  getTheme(): Theme;
  getFilters(): BoardFilters;
  hasActiveFilters(): boolean;
  /** Warning produced while loading persisted data (corruption, storage unavailable). */
  getStartupWarning(): string | undefined;
  getColumnTasks(columnId: ColumnId): readonly Task[];
  getVisibleColumnTasks(columnId: ColumnId): readonly Task[];
  /** WIP limits are a visual warning only: moves are never blocked. */
  getWipEvaluations(): Readonly<Record<ColumnId, WipEvaluation>>;
  addTask(input: CreateTaskInput): StoreResult;
  updateTask(taskId: string, patch: UpdateTaskPatch): StoreResult;
  deleteTask(taskId: string): StoreResult;
  moveTask(taskId: string, columnId: ColumnId, index?: number): StoreResult;
  /** Moves a task to `index` inside its own column. */
  reorderTask(taskId: string, index: number): StoreResult;
  addSubtask(taskId: string, title: string): StoreResult;
  renameSubtask(taskId: string, subtaskId: string, title: string): StoreResult;
  toggleSubtask(taskId: string, subtaskId: string): StoreResult;
  removeSubtask(taskId: string, subtaskId: string): StoreResult;
  undo(): StoreResult;
  redo(): StoreResult;
  canUndo(): boolean;
  canRedo(): boolean;
  setFilters(patch: Partial<BoardFilters>): void;
  clearFilters(): void;
  toggleTheme(): void;
  resetDemo(): StoreResult;
  exportJson(): string;
  importJson(raw: string): StoreResult;
}

const OK: StoreResult = { ok: true, value: undefined };
const TASK_NOT_FOUND = 'No se encontró la tarea solicitada.';

type Message = DomainError | { readonly message: string };
type Core = Pick<StoreState, 'board' | 'filters' | 'theme'>;

/**
 * Application store: every mutation delegates to a pure domain function and handles its
 * `Result`. WIP limits are not enforced. Undo/redo covers task, subtask, move and reorder
 * mutations; importing a file and restoring the demo reset the history because they replace
 * the whole board with unrelated data.
 */
export function createBoardStore(deps: BoardStoreDeps): BoardStore {
  const loaded = deps.boards.load();
  const referenceDate = deps.referenceDate ?? ((): Date => new Date());
  const listeners = new Set<StoreListener>();
  let history: History<BoardState> = emptyHistory();
  let state: StoreState = buildState({
    board: loaded.board,
    filters: DEFAULT_FILTERS,
    theme: deps.themes.load(),
  });

  function buildState(core: Core): StoreState {
    return {
      ...core,
      wip: getBoardWipEvaluations(core.board),
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    };
  }

  const publish = (patch: Partial<Core>): void => {
    state = buildState({ board: state.board, filters: state.filters, theme: state.theme, ...patch });
    listeners.forEach((listener) => listener(state));
  };

  const fail = (error: Message): StoreResult => ({
    ok: false,
    error: { message: error.message, applied: false },
  });

  const commit = (board: BoardState, extra: Partial<Core> = {}): StoreResult => {
    const saved = deps.boards.save(board);
    publish({ ...extra, board });
    return saved.ok ? OK : { ok: false, error: { message: saved.error.message, applied: true } };
  };

  const mutate = (result: Result<BoardState, DomainError>): StoreResult => {
    if (!result.ok) return fail(result.error);
    history = recordChange(history, state.board);
    return commit(result.value);
  };

  const travel = (step: HistoryStep<BoardState> | null, emptyMessage: string): StoreResult => {
    if (step === null) return fail({ message: emptyMessage });
    history = step.history;
    return commit(step.value);
  };

  const columnTasks = (columnId: ColumnId): readonly Task[] =>
    getTasksByColumn(state.board, columnId);

  const reorder = (taskId: string, index: number): StoreResult => {
    const task = state.board.tasks.find((candidate) => candidate.id === taskId);
    return task ? mutate(moveTask(state.board, taskId, task.columnId, index)) : fail({ message: TASK_NOT_FOUND });
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,
    getBoard: () => state.board,
    getColumns: () => [...state.board.columns].sort((a, b) => a.order - b.order),
    getTheme: () => state.theme,
    getFilters: () => state.filters,
    hasActiveFilters: () => hasActiveFilters(state.filters),
    getStartupWarning: () => loaded.warning,
    getColumnTasks: columnTasks,
    getVisibleColumnTasks: (columnId) =>
      filterTasks(columnTasks(columnId), state.filters, referenceDate()),
    getWipEvaluations: () => state.wip,

    addTask: (input) => mutate(createTask(state.board, input)),
    updateTask: (taskId, patch) => mutate(updateTask(state.board, taskId, patch)),
    deleteTask: (taskId) => mutate(deleteTask(state.board, taskId)),
    moveTask: (taskId, columnId, index) => mutate(moveTask(state.board, taskId, columnId, index)),
    reorderTask: reorder,
    addSubtask: (taskId, title) => mutate(addSubtask(state.board, taskId, { title })),
    renameSubtask: (taskId, subtaskId, title) =>
      mutate(updateSubtaskTitle(state.board, taskId, subtaskId, title)),
    toggleSubtask: (taskId, subtaskId) => mutate(toggleSubtask(state.board, taskId, subtaskId)),
    removeSubtask: (taskId, subtaskId) => mutate(removeSubtask(state.board, taskId, subtaskId)),

    undo: () => travel(undoStep(history, state.board), 'No hay nada que deshacer.'),
    redo: () => travel(redoStep(history, state.board), 'No hay nada que rehacer.'),
    canUndo: () => state.canUndo,
    canRedo: () => state.canRedo,

    setFilters: (patch) => publish({ filters: { ...state.filters, ...patch } }),
    clearFilters: () => publish({ filters: DEFAULT_FILTERS }),
    toggleTheme() {
      const theme: Theme = state.theme === 'light' ? 'dark' : 'light';
      deps.themes.save(theme);
      publish({ theme });
    },
    resetDemo() {
      const reset = deps.boards.resetDemo();
      if (!reset.ok) return fail(reset.error);
      history = emptyHistory();
      publish({ board: deps.boards.load().board, filters: DEFAULT_FILTERS });
      return OK;
    },
    exportJson: () => deps.serializer.serialize(state.board),
    importJson(raw) {
      const parsed = deps.serializer.deserialize(raw);
      if (!parsed.ok) return fail(parsed.error);
      history = emptyHistory();
      return commit(parsed.value, { filters: DEFAULT_FILTERS });
    },
  };
}
