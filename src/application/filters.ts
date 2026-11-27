import type { Priority, Task } from '../domain/index.ts';

export interface BoardFilters {
  readonly search: string;
  readonly priority: Priority | 'all';
  readonly tag: string;
}

export const ALL_TAGS = 'all';

export const DEFAULT_FILTERS: BoardFilters = { search: '', priority: 'all', tag: ALL_TAGS };

export function hasActiveFilters(filters: BoardFilters): boolean {
  return filters.search.trim() !== '' || filters.priority !== 'all' || filters.tag !== ALL_TAGS;
}

export function filterTasks(tasks: readonly Task[], filters: BoardFilters): readonly Task[] {
  const query = filters.search.trim().toLowerCase();

  return tasks.filter((task) => {
    if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
    if (filters.tag !== ALL_TAGS && !task.tags.includes(filters.tag)) return false;
    if (query === '') return true;
    return (
      task.title.toLowerCase().includes(query) || task.description.toLowerCase().includes(query)
    );
  });
}
