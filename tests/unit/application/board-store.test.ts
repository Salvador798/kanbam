import { describe, expect, it, vi } from 'vitest';
import { createBoardStore } from '../../../src/application/index.ts';
import type { BoardStore } from '../../../src/application/index.ts';
import {
  BOARD_STORAGE_KEY,
  createLocalStorageBoardRepository,
  createLocalStorageThemeRepository,
  exportBoardToJson,
  importBoardFromJson,
} from '../../../src/infrastructure/index.ts';
import type { StorageAdapter } from '../../../src/infrastructure/index.ts';

function createMemoryStorage(initial: Record<string, string> = {}): StorageAdapter & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function setup(storage: StorageAdapter = createMemoryStorage()): BoardStore {
  return createBoardStore({
    boards: createLocalStorageBoardRepository({ storage }),
    themes: createLocalStorageThemeRepository(storage),
    serializer: { serialize: (board) => exportBoardToJson(board), deserialize: importBoardFromJson },
  });
}

describe('board store', () => {
  it('seeds the board on first load and persists it', () => {
    const storage = createMemoryStorage();
    const store = setup(storage);

    expect(store.getBoard().tasks.length).toBeGreaterThan(0);
    expect(storage.data.has(BOARD_STORAGE_KEY)).toBe(true);
    expect(store.getStartupWarning()).toBeUndefined();
  });

  it('exposes a startup warning when stored data is corrupt', () => {
    const store = setup(createMemoryStorage({ [BOARD_STORAGE_KEY]: '{not json' }));

    expect(store.getStartupWarning()).toBeTypeOf('string');
    expect(store.getBoard().tasks.length).toBeGreaterThan(0);
  });

  it('adds a task through the domain, persists it and notifies subscribers', () => {
    const storage = createMemoryStorage();
    const store = setup(storage);
    const listener = vi.fn();
    store.subscribe(listener);

    const result = store.addTask({ title: '  Nueva tarea  ', tags: ['UI'], columnId: 'done' });

    expect(result.ok).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    const added = store.getColumnTasks('done').find((task) => task.title === 'Nueva tarea');
    expect(added?.tags).toEqual(['UI']);
    expect(storage.data.get(BOARD_STORAGE_KEY)).toContain('Nueva tarea');
  });

  it('surfaces a domain error without throwing, mutating or persisting', () => {
    const storage = createMemoryStorage();
    const store = setup(storage);
    const before = store.getBoard();
    const persisted = storage.data.get(BOARD_STORAGE_KEY);
    const listener = vi.fn();
    store.subscribe(listener);

    const result = store.addTask({ title: '   ' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBeTruthy();
      expect(result.error.applied).toBe(false);
    }
    expect(store.getBoard()).toBe(before);
    expect(storage.data.get(BOARD_STORAGE_KEY)).toBe(persisted);
    expect(listener).not.toHaveBeenCalled();
  });

  it('reports a missing task on update, delete and move', () => {
    const store = setup();

    expect(store.updateTask('nope', { title: 'x' }).ok).toBe(false);
    expect(store.deleteTask('nope').ok).toBe(false);
    expect(store.moveTask('nope', 'done').ok).toBe(false);
  });

  it('updates, moves and deletes tasks', () => {
    const store = setup();
    const task = store.getColumnTasks('todo')[0];
    expect(task).toBeDefined();
    if (!task) return;

    expect(store.updateTask(task.id, { title: 'Renombrada' }).ok).toBe(true);
    expect(store.moveTask(task.id, 'done', 0).ok).toBe(true);
    expect(store.getColumnTasks('done')[0]?.title).toBe('Renombrada');
    expect(store.deleteTask(task.id).ok).toBe(true);
    expect(store.getBoard().tasks.some((t) => t.id === task.id)).toBe(false);
  });

  it('keeps the in-memory change and flags it as applied when persistence fails', () => {
    const storage = createMemoryStorage();
    const store = setup(storage);
    storage.setItem = () => {
      throw new Error('boom');
    };

    const result = store.addTask({ title: 'Sin guardar' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.applied).toBe(true);
    expect(store.getBoard().tasks.some((task) => task.title === 'Sin guardar')).toBe(true);
  });

  it('filters by search text, priority and tag combined', () => {
    const store = setup();
    store.addTask({ title: 'Alpha uno', priority: 'high', tags: ['Bug'], columnId: 'todo' });
    store.addTask({ title: 'Alpha dos', priority: 'low', tags: ['Bug'], columnId: 'todo' });

    store.setFilters({ search: 'alpha', priority: 'high', tag: 'Bug' });

    expect(store.hasActiveFilters()).toBe(true);
    expect(store.getVisibleColumnTasks('todo').map((task) => task.title)).toEqual(['Alpha uno']);
    expect(store.getColumnTasks('todo').length).toBeGreaterThan(1);

    store.clearFilters();
    expect(store.hasActiveFilters()).toBe(false);
  });

  it('toggles and persists the theme', () => {
    const storage = createMemoryStorage();
    const store = setup(storage);
    expect(store.getTheme()).toBe('light');

    store.toggleTheme();

    expect(store.getTheme()).toBe('dark');
    expect(setup(storage).getTheme()).toBe('dark');
  });

  it('exports and re-imports a board, and rejects invalid JSON with a message', () => {
    const store = setup();
    store.addTask({ title: 'Para exportar' });
    const json = store.exportJson();

    const other = setup();
    expect(other.importJson(json).ok).toBe(true);
    expect(other.getBoard().tasks.some((task) => task.title === 'Para exportar')).toBe(true);

    const bad = other.importJson('no es json');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.message).toBeTruthy();
  });

  it('restores the demo board and clears filters', () => {
    const store = setup();
    store.addTask({ title: 'Temporal' });
    store.setFilters({ search: 'x' });

    expect(store.resetDemo().ok).toBe(true);

    expect(store.getBoard().tasks.some((task) => task.title === 'Temporal')).toBe(false);
    expect(store.hasActiveFilters()).toBe(false);
  });
});
