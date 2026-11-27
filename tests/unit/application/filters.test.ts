import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filterTasks, hasActiveFilters } from '../../../src/application/index.ts';
import type { BoardFilters } from '../../../src/application/index.ts';
import { TODAY, buildBoard } from './support.ts';

const board = buildBoard([
  { title: 'Diseño de la pantalla', description: 'Maqueta inicial', priority: 'high', tags: ['UI'], dueDate: '2026-03-01' },
  { title: 'Corregir error', description: 'Fallo al guardar', priority: 'low', tags: ['Bug'], dueDate: '2026-03-12' },
  { title: 'Documentar API', description: '', priority: 'medium', tags: ['Docs'], dueDate: '2026-04-30' },
  { title: 'Sin fecha', priority: 'high', tags: ['UI', 'Bug'], subtasks: [{ title: 'Revisar Acentuación' }] },
]);

function titles(patch: Partial<BoardFilters>): string[] {
  return filterTasks(board.tasks, { ...DEFAULT_FILTERS, ...patch }, TODAY).map((task) => task.title);
}

describe('filterTasks', () => {
  it('returns everything with default filters', () => {
    expect(titles({})).toHaveLength(4);
  });

  it('searches title, description and subtask titles ignoring case and accents', () => {
    expect(titles({ search: 'DISENO' })).toEqual(['Diseño de la pantalla']);
    expect(titles({ search: 'fallo' })).toEqual(['Corregir error']);
    expect(titles({ search: 'acentuacion' })).toEqual(['Sin fecha']);
    expect(titles({ search: 'revisión' })).toEqual([]);
  });

  it('filters by priority and tag', () => {
    expect(titles({ priority: 'high' })).toEqual(['Diseño de la pantalla', 'Sin fecha']);
    expect(titles({ tag: 'Bug' })).toEqual(['Corregir error', 'Sin fecha']);
  });

  it('filters by due date status using the reference date', () => {
    expect(titles({ dueStatus: 'overdue' })).toEqual(['Diseño de la pantalla']);
    expect(titles({ dueStatus: 'due_soon' })).toEqual(['Corregir error']);
    expect(titles({ dueStatus: 'on_track' })).toEqual(['Documentar API']);
    expect(titles({ dueStatus: 'none' })).toEqual(['Sin fecha']);
  });

  it('combines every filter', () => {
    expect(titles({ search: 'pantalla', priority: 'high', tag: 'UI', dueStatus: 'overdue' })).toEqual([
      'Diseño de la pantalla',
    ]);
    expect(titles({ search: 'pantalla', priority: 'low' })).toEqual([]);
  });
});

describe('hasActiveFilters', () => {
  it('is false for defaults and whitespace-only search', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, search: '   ' })).toBe(false);
  });

  it.each<Partial<BoardFilters>>([
    { search: 'a' },
    { priority: 'low' },
    { tag: 'UI' },
    { dueStatus: 'overdue' },
  ])('is true when %o is set', (patch) => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, ...patch })).toBe(true);
  });
});
