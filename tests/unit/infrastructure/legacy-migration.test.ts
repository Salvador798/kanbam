import { describe, expect, it } from 'vitest';
import {
  BOARD_STORAGE_KEY,
  LEGACY_BOARD_STORAGE_KEY,
  THEME_STORAGE_KEY,
  createLocalStorageBoardRepository,
  createLocalStorageThemeRepository,
  importBoardFromJson,
  isBoardState,
  migrateLegacyBoard,
} from '../../../src/infrastructure/index.ts';
import type { StorageAdapter } from '../../../src/infrastructure/index.ts';

const NOW = '2026-01-01T00:00:00.000Z';
const CREATED_MS = Date.UTC(2025, 5, 1, 12, 0, 0);

function legacyTask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 't1',
    title: 'Tarea',
    description: 'Detalle',
    priority: 'high',
    label: 'Bug',
    columnId: 'in-progress',
    createdAt: CREATED_MS,
    ...overrides,
  };
}

function legacyPayload(tasks: unknown[], theme = 'light'): Record<string, unknown> {
  return { version: 1, tasks, theme };
}

function createMemoryStorage(
  initial: Record<string, string> = {},
  options: { failSetKeys?: string[]; withRemove?: boolean } = {},
): StorageAdapter & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  const base: StorageAdapter & { data: Map<string, string> } = {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (options.failSetKeys?.includes(key)) {
        throw new Error('write blocked');
      }
      data.set(key, value);
    },
  };
  if (options.withRemove !== false) {
    base.removeItem = (key) => {
      data.delete(key);
    };
  }
  return base;
}

function migrate(raw: unknown) {
  const result = migrateLegacyBoard(raw, NOW);
  if (!result.ok) {
    throw new Error('expected a successful migration');
  }
  return result.value;
}

describe('migrateLegacyBoard', () => {
  it('maps every field of a legacy task', () => {
    const { board, skipped } = migrate(legacyPayload([legacyTask()]));
    expect(skipped).toBe(0);
    expect(board.tasks).toEqual([
      {
        id: 't1',
        title: 'Tarea',
        description: 'Detalle',
        columnId: 'in_progress',
        order: 0,
        priority: 'high',
        tags: ['Bug'],
        dueDate: null,
        subtasks: [],
        createdAt: new Date(CREATED_MS).toISOString(),
        updatedAt: new Date(CREATED_MS).toISOString(),
      },
    ]);
    expect(board.columns).toHaveLength(4);
    expect(isBoardState(board)).toBe(true);
  });

  it('maps legacy column ids', () => {
    const { board } = migrate(
      legacyPayload([
        legacyTask({ id: 'a', columnId: 'todo' }),
        legacyTask({ id: 'b', columnId: 'in-progress' }),
        legacyTask({ id: 'c', columnId: 'in-review' }),
        legacyTask({ id: 'd', columnId: 'done' }),
      ]),
    );
    expect(board.tasks.map((task) => task.columnId)).toEqual([
      'todo',
      'in_progress',
      'in_review',
      'done',
    ]);
  });

  it('assigns order by position within each column', () => {
    const { board } = migrate(
      legacyPayload([
        legacyTask({ id: 'a', columnId: 'todo' }),
        legacyTask({ id: 'b', columnId: 'done' }),
        legacyTask({ id: 'c', columnId: 'todo' }),
        legacyTask({ id: 'bad', columnId: 'todo', title: '' }),
        legacyTask({ id: 'd', columnId: 'todo' }),
      ]),
    );
    const orders = Object.fromEntries(board.tasks.map((task) => [task.id, task.order]));
    expect(orders).toEqual({ a: 0, b: 0, c: 1, d: 2 });
  });

  it('omits empty or invalid labels', () => {
    const { board } = migrate(
      legacyPayload([
        legacyTask({ id: 'a', label: '' }),
        legacyTask({ id: 'b', label: 42 }),
        legacyTask({ id: 'c', label: 'x'.repeat(100) }),
        legacyTask({ id: 'd', label: undefined }),
      ]),
    );
    expect(board.tasks.map((task) => task.tags)).toEqual([[], [], [], []]);
  });

  it('normalizes string timestamps and falls back to now', () => {
    const { board } = migrate(
      legacyPayload([
        legacyTask({ id: 'a', createdAt: '2025-03-04T05:06:07.000Z' }),
        legacyTask({ id: 'b', createdAt: 'not a date' }),
        legacyTask({ id: 'c', createdAt: Number.NaN }),
        legacyTask({ id: 'd', createdAt: 1e20 }),
        legacyTask({ id: 'e', createdAt: undefined }),
      ]),
    );
    expect(board.tasks.map((task) => task.createdAt)).toEqual([
      '2025-03-04T05:06:07.000Z',
      NOW,
      NOW,
      NOW,
      NOW,
    ]);
    expect(board.tasks.every((task) => task.updatedAt === task.createdAt)).toBe(true);
  });

  it('skips invalid tasks and counts them', () => {
    const { board, skipped } = migrate(
      legacyPayload([
        legacyTask({ id: 'ok' }),
        null,
        'text',
        legacyTask({ id: '' }),
        legacyTask({ id: 'no-title', title: '   ' }),
        legacyTask({ id: 'long', title: 'x'.repeat(500) }),
        legacyTask({ id: 'prio', priority: 'urgent' }),
        legacyTask({ id: 'col', columnId: 'archived' }),
        legacyTask({ id: 'desc', description: 5 }),
        legacyTask({ id: 'ok' }),
      ]),
    );
    expect(board.tasks.map((task) => task.id)).toEqual(['ok']);
    expect(skipped).toBe(9);
    expect(isBoardState(board)).toBe(true);
  });

  it('migrates an empty board', () => {
    const { board, skipped } = migrate(legacyPayload([]));
    expect(board.tasks).toEqual([]);
    expect(skipped).toBe(0);
  });

  it.each([null, 'x', 42, [], {}, { tasks: 'nope' }])('rejects unrecognizable payload %j', (raw) => {
    const result = migrateLegacyBoard(raw, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_SCHEMA');
    }
  });
});

describe('repository legacy migration', () => {
  const legacyRaw = JSON.stringify(legacyPayload([legacyTask(), legacyTask({ id: 'bad', title: '' })], 'dark'));

  it('migrates, saves under the new key and removes the legacy key', () => {
    const storage = createMemoryStorage({ [LEGACY_BOARD_STORAGE_KEY]: legacyRaw });
    const result = createLocalStorageBoardRepository({ storage, now: () => NOW }).load();
    expect(result.status).toBe('migrated');
    expect(result.board.tasks.map((task) => task.id)).toEqual(['t1']);
    expect(result.warning).toMatch(/1/);
    expect(storage.data.has(LEGACY_BOARD_STORAGE_KEY)).toBe(false);
    expect(createLocalStorageBoardRepository({ storage }).load().status).toBe('loaded');
  });

  it('has no warning when nothing was skipped', () => {
    const storage = createMemoryStorage({
      [LEGACY_BOARD_STORAGE_KEY]: JSON.stringify(legacyPayload([legacyTask()])),
    });
    const result = createLocalStorageBoardRepository({ storage }).load();
    expect(result.status).toBe('migrated');
    expect(result.warning).toBeUndefined();
  });

  it('keeps the legacy key when the save fails but still returns the board', () => {
    const storage = createMemoryStorage(
      { [LEGACY_BOARD_STORAGE_KEY]: legacyRaw },
      { failSetKeys: [BOARD_STORAGE_KEY] },
    );
    const result = createLocalStorageBoardRepository({ storage }).load();
    expect(result.status).toBe('migrated');
    expect(result.board.tasks).toHaveLength(1);
    expect(result.warning).toBeDefined();
    expect(storage.data.get(LEGACY_BOARD_STORAGE_KEY)).toBe(legacyRaw);
  });

  it('keeps the legacy key when removeItem is unavailable', () => {
    const storage = createMemoryStorage({ [LEGACY_BOARD_STORAGE_KEY]: legacyRaw }, { withRemove: false });
    const result = createLocalStorageBoardRepository({ storage }).load();
    expect(result.status).toBe('migrated');
    expect(storage.data.has(BOARD_STORAGE_KEY)).toBe(true);
    expect(storage.data.get(LEGACY_BOARD_STORAGE_KEY)).toBe(legacyRaw);
  });

  it.each(['{not json', '"text"', '{"tasks":"x"}'])(
    'falls back to the seed and preserves corrupt legacy data %s',
    (corrupt) => {
      const storage = createMemoryStorage({ [LEGACY_BOARD_STORAGE_KEY]: corrupt });
      const result = createLocalStorageBoardRepository({ storage }).load();
      expect(result.status).toBe('seeded');
      expect(storage.data.get(LEGACY_BOARD_STORAGE_KEY)).toBe(corrupt);
    },
  );

  it('prefers the current key over the legacy key', () => {
    const storage = createMemoryStorage();
    const repository = createLocalStorageBoardRepository({ storage });
    repository.load();
    storage.data.set(LEGACY_BOARD_STORAGE_KEY, legacyRaw);
    const result = repository.load();
    expect(result.status).toBe('loaded');
    expect(result.board.tasks.some((task) => task.id === 't1')).toBe(false);
    expect(storage.data.get(LEGACY_BOARD_STORAGE_KEY)).toBe(legacyRaw);
  });

  it('carries the legacy embedded theme to the theme key', () => {
    const storage = createMemoryStorage({ [LEGACY_BOARD_STORAGE_KEY]: legacyRaw });
    createLocalStorageBoardRepository({ storage }).load();
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(createLocalStorageThemeRepository(storage).load()).toBe('dark');
  });

  it('does not override an existing theme preference', () => {
    const storage = createMemoryStorage({
      [LEGACY_BOARD_STORAGE_KEY]: legacyRaw,
      [THEME_STORAGE_KEY]: 'light',
    });
    createLocalStorageBoardRepository({ storage }).load();
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe('light');
  });
});

describe('theme repository legacy migration', () => {
  it('adopts the theme from a still-present legacy board without removing it', () => {
    const legacyRaw = JSON.stringify(legacyPayload([], 'dark'));
    const storage = createMemoryStorage({ [LEGACY_BOARD_STORAGE_KEY]: legacyRaw });
    expect(createLocalStorageThemeRepository(storage).load()).toBe('dark');
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(storage.data.get(LEGACY_BOARD_STORAGE_KEY)).toBe(legacyRaw);
  });

  it('defaults to light when the legacy payload is corrupt', () => {
    const storage = createMemoryStorage({ [LEGACY_BOARD_STORAGE_KEY]: '{oops' });
    expect(createLocalStorageThemeRepository(storage).load()).toBe('light');
  });
});

describe('legacy export import', () => {
  it('accepts the MVP JSON export', () => {
    const raw = JSON.stringify(legacyPayload([legacyTask(), legacyTask({ id: 'x', title: '' })]), null, 2);
    const result = importBoardFromJson(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tasks.map((task) => task.id)).toEqual(['t1']);
      expect(isBoardState(result.value)).toBe(true);
    }
  });

  it('still rejects unrelated JSON', () => {
    expect(importBoardFromJson('{"foo":1}').ok).toBe(false);
    expect(importBoardFromJson('{"tasks":"x"}').ok).toBe(false);
  });
});
