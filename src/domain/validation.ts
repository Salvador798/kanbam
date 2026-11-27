import {
  COLUMN_IDS,
  DESCRIPTION_MAX_LENGTH,
  MAX_TAGS_PER_TASK,
  PRIORITIES,
  SUBTASK_TITLE_MAX_LENGTH,
  TAG_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from './types.ts';
import type {
  ColumnId,
  DomainError,
  DomainErrorCode,
  Priority,
  Result,
} from './types.ts';

function fail(code: DomainErrorCode, message: string, field?: string): Result<never, DomainError> {
  return {
    ok: false,
    error: field === undefined ? { code, message } : { code, message, field },
  };
}

export function isValidColumnId(value: unknown): value is ColumnId {
  return typeof value === 'string' && (COLUMN_IDS as readonly string[]).includes(value);
}

export function isValidPriority(value: unknown): value is Priority {
  return typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value);
}

export function validateTaskTitle(title: string): Result<string, DomainError> {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return fail('EMPTY_TITLE', 'El título de la tarea no puede estar vacío.', 'title');
  }
  if (trimmed.length > TITLE_MAX_LENGTH) {
    return fail(
      'TITLE_TOO_LONG',
      `El título de la tarea no puede superar los ${TITLE_MAX_LENGTH} caracteres.`,
      'title',
    );
  }
  return { ok: true, value: trimmed };
}

export function validateDescription(description: string): Result<string, DomainError> {
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return fail(
      'DESCRIPTION_TOO_LONG',
      `La descripción no puede superar los ${DESCRIPTION_MAX_LENGTH} caracteres.`,
      'description',
    );
  }
  return { ok: true, value: description };
}

export function validateTags(tags: readonly string[]): Result<readonly string[], DomainError> {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawTag of tags) {
    const trimmed = rawTag.trim();
    if (trimmed.length === 0) {
      return fail('INVALID_TAG', 'Las etiquetas no pueden estar vacías.', 'tags');
    }
    if (trimmed.length > TAG_MAX_LENGTH) {
      return fail(
        'INVALID_TAG',
        `Cada etiqueta puede tener como máximo ${TAG_MAX_LENGTH} caracteres.`,
        'tags',
      );
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }

  if (normalized.length > MAX_TAGS_PER_TASK) {
    return fail(
      'TOO_MANY_TAGS',
      `Una tarea puede tener como máximo ${MAX_TAGS_PER_TASK} etiquetas.`,
      'tags',
    );
  }

  return { ok: true, value: normalized };
}

export function validateSubtaskTitle(title: string): Result<string, DomainError> {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return fail('EMPTY_SUBTASK_TITLE', 'El título de la subtarea no puede estar vacío.', 'subtasks');
  }
  if (trimmed.length > SUBTASK_TITLE_MAX_LENGTH) {
    return fail(
      'SUBTASK_TITLE_TOO_LONG',
      `El título de la subtarea no puede superar los ${SUBTASK_TITLE_MAX_LENGTH} caracteres.`,
      'subtasks',
    );
  }
  return { ok: true, value: trimmed };
}

export function validateWipLimit(wipLimit: number | null): Result<number | null, DomainError> {
  if (wipLimit === null) {
    return { ok: true, value: null };
  }
  if (typeof wipLimit !== 'number' || !Number.isInteger(wipLimit) || wipLimit < 1) {
    return fail(
      'INVALID_WIP_LIMIT',
      'El límite WIP debe ser nulo o un número entero mayor o igual a 1.',
      'wipLimit',
    );
  }
  return { ok: true, value: wipLimit };
}
