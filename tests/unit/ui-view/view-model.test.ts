import { describe, expect, it } from 'vitest';
import { createTask, createBoard, getBoardWipEvaluations } from '../../../src/domain/index.ts';
import type { Task } from '../../../src/domain/index.ts';
import {
  addTagsFromText,
  describeTask,
  formatCalendarDate,
  getDueBadge,
  getSubtaskSummary,
  getWipView,
  removeTag,
} from '../../../src/ui/view-model.ts';

const TODAY = new Date('2026-03-10T12:00:00.000Z');

function makeTask(overrides: Partial<Parameters<typeof createTask>[1]> = {}): Task {
  const created = createTask(createBoard(), { title: 'Diseñar login', now: '2026-03-01T00:00:00.000Z', ...overrides });
  if (!created.ok) throw new Error(created.error.message);
  const task = created.value.tasks[0];
  if (!task) throw new Error('task not created');
  return task;
}

describe('getDueBadge', () => {
  it('returns null without a due date', () => {
    expect(getDueBadge(null, TODAY)).toBeNull();
  });

  it.each([
    ['2026-03-09', 'overdue', 'Vencida'],
    ['2026-03-12', 'due_soon', 'Próxima a vencer'],
    ['2026-04-30', 'on_track', 'En plazo'],
  ] as const)('maps %s to %s', (date, status, label) => {
    const badge = getDueBadge(date, TODAY);
    expect(badge?.status).toBe(status);
    expect(badge?.label).toBe(label);
  });

  it('includes the formatted date in the visible text', () => {
    expect(getDueBadge('2026-03-09', TODAY)?.text).toBe('Vencida · 09/03/2026');
  });
});

describe('formatCalendarDate', () => {
  it('reorders ISO dates and leaves other input untouched', () => {
    expect(formatCalendarDate('2026-12-01')).toBe('01/12/2026');
    expect(formatCalendarDate('mañana')).toBe('mañana');
  });
});

describe('getWipView', () => {
  const wip = getBoardWipEvaluations(createBoard());

  it('is null for columns without a limit', () => {
    expect(getWipView(wip.todo)).toBeNull();
  });

  it('shows count/limit without warning while within the limit', () => {
    const view = getWipView({ ...wip.in_progress, count: 1, status: 'within_limit', isAtOrOverLimit: false });
    expect(view).toMatchObject({ text: '1/3', warning: false, statusText: null });
  });

  it('warns with text at and over the limit', () => {
    expect(getWipView({ ...wip.in_progress, count: 3, status: 'at_limit', isAtOrOverLimit: true })).toMatchObject({
      text: '3/3',
      warning: true,
      statusText: 'Al límite',
    });
    const over = getWipView({ ...wip.in_progress, count: 4, status: 'exceeded', isAtOrOverLimit: true });
    expect(over).toMatchObject({ text: '4/3', warning: true, statusText: 'Excedido' });
    expect(over?.ariaLabel).toContain('excedido');
  });
});

describe('getSubtaskSummary / describeTask', () => {
  it('summarises completed/total and hides it with no subtasks', () => {
    expect(getSubtaskSummary(makeTask())).toBeNull();
    const task = makeTask({
      subtasks: [{ title: 'a', completed: true }, { title: 'b' }],
    });
    expect(getSubtaskSummary(task)).toBe('1/2');
  });

  it('builds an accessible name with the relevant metadata', () => {
    const task = makeTask({
      priority: 'high',
      tags: ['UI', 'Bug'],
      dueDate: '2026-03-09',
      subtasks: [{ title: 'a', completed: true }],
    });
    const name = describeTask(task, 'Por hacer', TODAY);
    expect(name).toContain('Diseñar login');
    expect(name).toContain('Prioridad Alta');
    expect(name).toContain('Columna Por hacer');
    expect(name).toContain('Etiquetas: UI, Bug');
    expect(name).toContain('Vencida');
    expect(name).toContain('Subtareas completadas 1/1');
  });
});

describe('tag input parsing', () => {
  it('splits on commas, trims and ignores case-insensitive duplicates', () => {
    const result = addTagsFromText(['UI'], ' bug, ui ,, Docs ');
    expect(result).toEqual({ tags: ['UI', 'bug', 'Docs'], error: null });
  });

  it('rejects over-long tags and keeps the list unchanged', () => {
    const result = addTagsFromText(['UI'], 'x'.repeat(40));
    expect(result.tags).toEqual(['UI']);
    expect(result.error).not.toBeNull();
  });

  it('rejects more than the maximum number of tags', () => {
    const current = Array.from({ length: 10 }, (_, index) => `t${index}`);
    expect(addTagsFromText(current, 'extra').error).not.toBeNull();
    expect(addTagsFromText(current, 't1').error).toBeNull();
  });

  it('removes a tag by value', () => {
    expect(removeTag(['a', 'b'], 'a')).toEqual(['b']);
  });
});
