import { getDueDateEvaluation } from '../domain/index.ts';
import type { DueDateStatus, Priority, Task } from '../domain/index.ts';

export interface BoardFilters {
  readonly search: string;
  readonly priority: Priority | 'all';
  readonly tag: string;
  readonly dueStatus: DueDateStatus | 'all';
}

export const ALL_TAGS = 'all';

export const DEFAULT_FILTERS: BoardFilters = {
  search: '',
  priority: 'all',
  tag: ALL_TAGS,
  dueStatus: 'all',
};

export function hasActiveFilters(filters: BoardFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.priority !== 'all' ||
    filters.tag !== ALL_TAGS ||
    filters.dueStatus !== 'all'
  );
}

/** Lowercases and strips diacritics so "Diseño" matches "diseno". */
function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function matchesSearch(task: Task, query: string): boolean {
  if (query === '') return true;
  const haystacks = [task.title, task.description, ...task.subtasks.map((sub) => sub.title)];
  return haystacks.some((text) => normalizeText(text).includes(query));
}

function matchesDueStatus(task: Task, status: BoardFilters['dueStatus'], referenceDate?: Date): boolean {
  return status === 'all' || getDueDateEvaluation(task.dueDate, referenceDate).status === status;
}

export function filterTasks(
  tasks: readonly Task[],
  filters: BoardFilters,
  referenceDate?: Date,
): readonly Task[] {
  const query = normalizeText(filters.search.trim());

  return tasks.filter(
    (task) =>
      (filters.priority === 'all' || task.priority === filters.priority) &&
      (filters.tag === ALL_TAGS || task.tags.includes(filters.tag)) &&
      matchesDueStatus(task, filters.dueStatus, referenceDate) &&
      matchesSearch(task, query),
  );
}
