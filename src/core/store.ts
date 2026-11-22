import {
  isValidBoardState,
  loadBoardState,
  resetDemoState,
  saveBoardState,
} from './storage.ts';
import type {
  BoardFilters,
  BoardState,
  ColumnId,
  NewTaskInput,
  Task,
  Theme,
  UpdateTaskInput,
} from './types.ts';

type Listener = () => void;

const DEFAULT_FILTERS: BoardFilters = {
  search: '',
  priority: 'all',
  label: 'all',
};

class KanbanStore {
  private state: BoardState;
  private filters: BoardFilters;
  private listeners: Set<Listener> = new Set();

  constructor() {
    this.state = loadBoardState();
    this.filters = { ...DEFAULT_FILTERS };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(persist = true): void {
    if (persist) {
      saveBoardState(this.state);
    }
    this.listeners.forEach((listener) => listener());
  }

  getState(): BoardState {
    return this.state;
  }

  getFilters(): BoardFilters {
    return this.filters;
  }

  hasActiveFilters(): boolean {
    return (
      this.filters.search.trim() !== '' ||
      this.filters.priority !== 'all' ||
      this.filters.label !== 'all'
    );
  }

  getTasksByColumn(columnId: ColumnId): Task[] {
    return this.state.tasks.filter((task) => task.columnId === columnId);
  }

  getFilteredTasksByColumn(columnId: ColumnId): Task[] {
    const query = this.filters.search.trim().toLowerCase();

    return this.state.tasks.filter((task) => {
      if (task.columnId !== columnId) return false;

      if (this.filters.priority !== 'all' && task.priority !== this.filters.priority) {
        return false;
      }

      if (this.filters.label !== 'all' && task.label !== this.filters.label) {
        return false;
      }

      if (query !== '') {
        const inTitle = task.title.toLowerCase().includes(query);
        const inDesc = task.description.toLowerCase().includes(query);
        if (!inTitle && !inDesc) return false;
      }

      return true;
    });
  }

  addTask(input: NewTaskInput): void {
    const title = input.title.trim();
    if (!title) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      title,
      description: input.description.trim(),
      priority: input.priority,
      label: input.label,
      columnId: input.columnId,
      createdAt: Date.now(),
    };

    this.state = {
      ...this.state,
      tasks: [...this.state.tasks, newTask],
    };
    this.notify();
  }

  updateTask(id: string, patch: UpdateTaskInput): void {
    const nextTitle = patch.title !== undefined ? patch.title.trim() : undefined;
    if (nextTitle !== undefined && nextTitle === '') return;

    let updated = false;
    const nextTasks = this.state.tasks.map((task) => {
      if (task.id !== id) return task;
      updated = true;
      return {
        ...task,
        ...patch,
        title: nextTitle ?? task.title,
        description:
          patch.description !== undefined ? patch.description.trim() : task.description,
      };
    });

    if (!updated) return;

    this.state = { ...this.state, tasks: nextTasks };
    this.notify();
  }

  deleteTask(id: string): void {
    const nextTasks = this.state.tasks.filter((task) => task.id !== id);
    if (nextTasks.length === this.state.tasks.length) return;

    this.state = { ...this.state, tasks: nextTasks };
    this.notify();
  }

  moveTask(taskId: string, targetColumn: ColumnId, targetIndex?: number): void {
    const taskToMove = this.state.tasks.find((t) => t.id === taskId);
    if (!taskToMove) return;

    const remainingTasks = this.state.tasks.filter((t) => t.id !== taskId);
    const movedTask: Task = { ...taskToMove, columnId: targetColumn };

    if (targetIndex === undefined) {
      this.state = {
        ...this.state,
        tasks: [...remainingTasks, movedTask],
      };
      this.notify();
      return;
    }

    // busca la posicion real dentro de la columna destino
    const columnIndices: number[] = [];
    remainingTasks.forEach((task, index) => {
      if (task.columnId === targetColumn) {
        columnIndices.push(index);
      }
    });

    const clampedIndex = Math.max(0, targetIndex);
    let insertAt: number;

    if (columnIndices.length === 0) {
      insertAt = remainingTasks.length;
    } else if (clampedIndex >= columnIndices.length) {
      insertAt = columnIndices[columnIndices.length - 1] + 1;
    } else {
      insertAt = columnIndices[clampedIndex];
    }

    const nextTasks = [...remainingTasks];
    nextTasks.splice(insertAt, 0, movedTask);

    this.state = { ...this.state, tasks: nextTasks };
    this.notify();
  }

  setFilters(patch: Partial<BoardFilters>): void {
    this.filters = { ...this.filters, ...patch };
    this.notify(false);
  }

  clearFilters(): void {
    this.filters = { ...DEFAULT_FILTERS };
    this.notify(false);
  }

  toggleTheme(): void {
    const nextTheme: Theme = this.state.theme === 'light' ? 'dark' : 'light';
    this.state = { ...this.state, theme: nextTheme };
    this.notify();
  }

  resetDemo(): void {
    this.state = resetDemoState(this.state.theme);
    this.filters = { ...DEFAULT_FILTERS };
    this.notify(false);
  }

  exportJson(): string {
    return JSON.stringify(this.state, null, 2);
  }

  importJson(rawJson: string): boolean {
    try {
      const parsed: unknown = JSON.parse(rawJson);
      if (!isValidBoardState(parsed)) return false;

      this.state = parsed;
      this.filters = { ...DEFAULT_FILTERS };
      this.notify();
      return true;
    } catch {
      return false;
    }
  }
}

export const store = new KanbanStore();
