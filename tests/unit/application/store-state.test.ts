import { describe, expect, it, vi } from 'vitest';
import type { BoardState } from '../../../src/domain/index.ts';
import { createTestStore } from './support.ts';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe('store subscription', () => {
  it('notifies once per committed change with the new state', () => {
    const { store } = createTestStore([{ title: 'A' }]);
    const listener = vi.fn();
    store.subscribe(listener);

    store.addTask({ title: 'B' });

    expect(listener).toHaveBeenCalledTimes(1);
    const state = listener.mock.calls[0]?.[0];
    expect(state.board.tasks.map((task: { title: string }) => task.title)).toEqual(['A', 'B']);
    expect(state).toBe(store.getState());
  });

  it('stops notifying after unsubscribe and ignores failed mutations', () => {
    const { store } = createTestStore([{ title: 'A' }]);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.addTask({ title: '   ' });
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
    store.addTask({ title: 'B' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('never mutates previous state objects', () => {
    const { store } = createTestStore([{ title: 'A' }, { title: 'B' }]);
    const before = deepFreeze(store.getState());
    const snapshot = structuredClone(before.board);
    const first = store.getColumnTasks('todo')[0];
    if (!first) throw new Error('missing task');

    store.updateTask(first.id, { title: 'Editada' });
    store.addSubtask(first.id, 'Paso');
    store.moveTask(first.id, 'done', 0);
    store.deleteTask(first.id);
    store.undo();

    expect(before.board).toEqual(snapshot);
    expect(store.getState()).not.toBe(before);
  });

  it('exposes filters, theme and history flags in the state', () => {
    const { store } = createTestStore([{ title: 'A' }], { theme: 'dark' });
    const initial = store.getState();
    expect(initial.theme).toBe('dark');
    expect(initial.canUndo).toBe(false);

    store.setFilters({ search: 'a' });

    expect(store.getState().filters.search).toBe('a');
    expect(initial.filters.search).toBe('');
  });
});

describe('store use cases', () => {
  it('adds, renames, toggles and removes subtasks', () => {
    const { store } = createTestStore([{ title: 'A' }]);
    const task = store.getColumnTasks('todo')[0];
    if (!task) throw new Error('missing task');

    expect(store.addSubtask(task.id, 'Paso uno').ok).toBe(true);
    const subtask = store.getColumnTasks('todo')[0]?.subtasks[0];
    if (!subtask) throw new Error('missing subtask');
    expect(subtask.title).toBe('Paso uno');

    expect(store.renameSubtask(task.id, subtask.id, 'Paso 1').ok).toBe(true);
    expect(store.toggleSubtask(task.id, subtask.id).ok).toBe(true);
    const after = store.getColumnTasks('todo')[0]?.subtasks[0];
    expect(after).toMatchObject({ title: 'Paso 1', completed: true });

    expect(store.removeSubtask(task.id, subtask.id).ok).toBe(true);
    expect(store.getColumnTasks('todo')[0]?.subtasks).toEqual([]);
  });

  it('returns errors instead of throwing for unknown targets', () => {
    const { store } = createTestStore([{ title: 'A' }]);

    expect(store.addSubtask('nope', 'x').ok).toBe(false);
    expect(store.renameSubtask('nope', 's', 'x').ok).toBe(false);
    expect(store.toggleSubtask('nope', 's').ok).toBe(false);
    expect(store.removeSubtask('nope', 's').ok).toBe(false);
    expect(store.reorderTask('nope', 0).ok).toBe(false);
  });

  it('moves between columns to a target index', () => {
    const { store } = createTestStore([
      { title: 'A', columnId: 'todo' },
      { title: 'X', columnId: 'done' },
      { title: 'Y', columnId: 'done' },
    ]);
    const a = store.getColumnTasks('todo')[0];
    if (!a) throw new Error('missing task');

    store.moveTask(a.id, 'done', 1);

    expect(store.getColumnTasks('done').map((task) => task.title)).toEqual(['X', 'A', 'Y']);
    expect(store.getColumnTasks('todo')).toEqual([]);
  });

  it('reorders within a column to a target index', () => {
    const { store } = createTestStore([{ title: 'A' }, { title: 'B' }, { title: 'C' }]);
    const a = store.getColumnTasks('todo')[0];
    if (!a) throw new Error('missing task');

    expect(store.reorderTask(a.id, 2).ok).toBe(true);
    expect(store.getColumnTasks('todo').map((task) => task.title)).toEqual(['B', 'C', 'A']);
    expect(store.reorderTask(a.id, 7).ok).toBe(false);
  });
});

describe('WIP evaluations', () => {
  it('keeps moves allowed and surfaces exceeded columns as a warning', () => {
    const { store } = createTestStore([
      { title: '1', columnId: 'in_review' },
      { title: '2', columnId: 'in_review' },
      { title: '3', columnId: 'todo' },
    ]);
    expect(store.getWipEvaluations().in_review.status).toBe('at_limit');

    const task = store.getColumnTasks('todo')[0];
    if (!task) throw new Error('missing task');
    const moved = store.moveTask(task.id, 'in_review');

    expect(moved.ok).toBe(true);
    expect(store.getWipEvaluations().in_review).toMatchObject({ status: 'exceeded', count: 3, limit: 2 });
    expect(store.getState().wip.in_review.isAtOrOverLimit).toBe(true);
    expect(store.getWipEvaluations().todo.status).toBe('unlimited');
  });
});

describe('undo / redo', () => {
  it('undoes and redoes every kind of mutation, persisting and notifying', () => {
    const { store, persistence } = createTestStore([{ title: 'A' }, { title: 'B' }]);
    const original: BoardState = store.getBoard();
    const a = store.getColumnTasks('todo')[0];
    if (!a) throw new Error('missing task');

    store.addTask({ title: 'C' });
    store.updateTask(a.id, { title: 'A2' });
    store.addSubtask(a.id, 'S');
    store.moveTask(a.id, 'done');
    store.reorderTask(store.getColumnTasks('todo')[0]?.id ?? '', 1);
    store.deleteTask(a.id);
    const final = store.getBoard();
    const listener = vi.fn();
    store.subscribe(listener);
    const savesBefore = persistence.saved.length;

    while (store.canUndo()) expect(store.undo().ok).toBe(true);
    expect(store.getBoard()).toEqual(original);
    expect(persistence.saved.at(-1)).toEqual(original);
    expect(persistence.saved.length).toBeGreaterThan(savesBefore);
    expect(listener).toHaveBeenCalled();

    while (store.canRedo()) expect(store.redo().ok).toBe(true);
    expect(store.getBoard()).toEqual(final);
  });

  it('notifies exactly once per undo and redo and reports flags', () => {
    const { store } = createTestStore([{ title: 'A' }]);
    store.addTask({ title: 'B' });
    const listener = vi.fn();
    store.subscribe(listener);

    store.undo();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ canUndo: false, canRedo: true });

    store.redo();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getState()).toMatchObject({ canUndo: true, canRedo: false });
  });

  it('fails without side effects when there is nothing to undo or redo', () => {
    const { store } = createTestStore([{ title: 'A' }]);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.undo().ok).toBe(false);
    expect(store.redo().ok).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('clears the redo stack on a new mutation', () => {
    const { store } = createTestStore([{ title: 'A' }]);
    store.addTask({ title: 'B' });
    store.undo();
    expect(store.canRedo()).toBe(true);

    store.addTask({ title: 'C' });

    expect(store.canRedo()).toBe(false);
  });

  it('does not record failed mutations', () => {
    const { store } = createTestStore([{ title: 'A' }]);

    store.addTask({ title: '  ' });
    store.deleteTask('nope');
    store.moveTask('nope', 'done');

    expect(store.canUndo()).toBe(false);
  });

  it('does not record filter or theme changes', () => {
    const { store } = createTestStore([{ title: 'A' }]);

    store.setFilters({ search: 'a' });
    store.toggleTheme();

    expect(store.canUndo()).toBe(false);
  });

  it('keeps a mutation in history when only persisting failed', () => {
    const { store, persistence } = createTestStore([{ title: 'A' }]);
    persistence.failSaves = true;

    const result = store.addTask({ title: 'B' });

    expect(result.ok).toBe(false);
    expect(store.canUndo()).toBe(true);
  });

  it('bounds the history to 50 entries', () => {
    const { store } = createTestStore();
    for (let index = 0; index < 60; index += 1) store.addTask({ title: `T${index}` });

    let undone = 0;
    while (store.canUndo()) {
      store.undo();
      undone += 1;
    }

    expect(undone).toBe(50);
    expect(store.getBoard().tasks).toHaveLength(10);
  });

  it('resets history on import and on demo restore', () => {
    const { store } = createTestStore([{ title: 'A' }]);
    const json = store.exportJson();
    store.addTask({ title: 'B' });
    store.undo();
    expect(store.canUndo() || store.canRedo()).toBe(true);

    expect(store.importJson(json).ok).toBe(true);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);

    store.addTask({ title: 'C' });
    expect(store.canUndo()).toBe(true);
    expect(store.resetDemo().ok).toBe(true);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
  });
});
