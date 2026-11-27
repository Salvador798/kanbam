import {
  MAX_TAGS_PER_TASK,
  PRIORITY_LABELS,
  TAG_MAX_LENGTH,
  getDueDateEvaluation,
  getSubtaskProgress,
} from '../domain/index.ts';
import type { DueDateStatus, Task, WipEvaluation } from '../domain/index.ts';

/** Pure presentation helpers: no DOM access, so they can be unit tested in Node. */

export interface DueBadge {
  readonly status: Exclude<DueDateStatus, 'none'>;
  readonly label: string;
  /** Visible text, e.g. "Vencida · 12/03/2026". */
  readonly text: string;
}

/** Formats a stored `YYYY-MM-DD` calendar date as `DD/MM/YYYY` without timezone shifts. */
export function formatCalendarDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function getDueBadge(dueDate: string | null, referenceDate?: Date): DueBadge | null {
  if (dueDate === null) return null;
  const evaluation = getDueDateEvaluation(dueDate, referenceDate);
  if (evaluation.status === 'none') return null;
  return {
    status: evaluation.status,
    label: evaluation.label,
    text: `${evaluation.label} · ${formatCalendarDate(dueDate)}`,
  };
}

export interface WipView {
  readonly text: string;
  readonly warning: boolean;
  /** Visible status word shown next to the counter so the state is not color-only. */
  readonly statusText: string | null;
  readonly ariaLabel: string;
}

export function getWipView(evaluation: WipEvaluation): WipView | null {
  if (evaluation.limit === null) return null;
  const text = `${evaluation.count}/${evaluation.limit}`;
  const base = `Límite WIP: ${evaluation.count} de ${evaluation.limit}`;
  if (evaluation.status === 'exceeded') {
    return { text, warning: true, statusText: 'Excedido', ariaLabel: `${base}, límite excedido` };
  }
  if (evaluation.status === 'at_limit') {
    return { text, warning: true, statusText: 'Al límite', ariaLabel: `${base}, límite alcanzado` };
  }
  return { text, warning: false, statusText: null, ariaLabel: base };
}

export function getSubtaskSummary(task: Pick<Task, 'subtasks'>): string | null {
  if (task.subtasks.length === 0) return null;
  const progress = getSubtaskProgress(task.subtasks);
  return `${progress.completed}/${progress.total}`;
}

/** Accessible name for a card: the task plus its key metadata. */
export function describeTask(task: Task, columnTitle?: string, referenceDate?: Date): string {
  const parts = [task.title, `Prioridad ${PRIORITY_LABELS[task.priority]}`];
  if (columnTitle !== undefined) parts.push(`Columna ${columnTitle}`);
  if (task.tags.length > 0) parts.push(`Etiquetas: ${task.tags.join(', ')}`);
  const due = getDueBadge(task.dueDate, referenceDate);
  if (due) parts.push(`Fecha límite: ${due.text}`);
  const summary = getSubtaskSummary(task);
  if (summary !== null) parts.push(`Subtareas completadas ${summary}`);
  return parts.join('. ');
}

export interface TagParseResult {
  readonly tags: readonly string[];
  readonly error: string | null;
}

/**
 * Merges free-text tag input (comma separated) into the current list. Duplicates are ignored
 * case-insensitively; invalid input leaves the list unchanged and reports an error.
 */
export function addTagsFromText(current: readonly string[], raw: string): TagParseResult {
  const candidates = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const next = [...current];

  for (const candidate of candidates) {
    if (candidate.length > TAG_MAX_LENGTH) {
      return {
        tags: current,
        error: `Cada etiqueta puede tener como máximo ${TAG_MAX_LENGTH} caracteres.`,
      };
    }
    const exists = next.some((tag) => tag.toLowerCase() === candidate.toLowerCase());
    if (exists) continue;
    if (next.length >= MAX_TAGS_PER_TASK) {
      return {
        tags: current,
        error: `Una tarjeta puede tener como máximo ${MAX_TAGS_PER_TASK} etiquetas.`,
      };
    }
    next.push(candidate);
  }

  return { tags: next, error: null };
}

export function removeTag(current: readonly string[], tag: string): readonly string[] {
  return current.filter((candidate) => candidate !== tag);
}
