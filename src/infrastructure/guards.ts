import {
  COLUMN_IDS,
  isValidColumnId,
  isValidPriority,
  validateDescription,
  validateDueDate,
  validateSubtaskTitle,
  validateTags,
  validateTaskTitle,
  validateWipLimit,
} from '../domain/index.ts';
import type { BoardState, ColumnDefinition, Subtask, Task } from '../domain/index.ts';
import { CURRENT_SCHEMA_VERSION, EXPORT_APP_ID } from './schema.ts';
import type { ExportedBoardEnvelope, PersistedBoardEnvelope } from './schema.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function hasUniqueIds(items: readonly { readonly id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

export function isSubtask(value: unknown): value is Subtask {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.title === 'string' &&
    validateSubtaskTitle(value.title).ok &&
    typeof value.completed === 'boolean'
  );
}

export function isColumnDefinition(value: unknown): value is ColumnDefinition {
  return (
    isRecord(value) &&
    isValidColumnId(value.id) &&
    isNonEmptyString(value.title) &&
    isNonNegativeInteger(value.order) &&
    (value.wipLimit === null ||
      (typeof value.wipLimit === 'number' && validateWipLimit(value.wipLimit).ok))
  );
}

export function isTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    typeof value.title === 'string' &&
    validateTaskTitle(value.title).ok &&
    typeof value.description === 'string' &&
    validateDescription(value.description).ok &&
    isValidColumnId(value.columnId) &&
    isNonNegativeInteger(value.order) &&
    isValidPriority(value.priority) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string') &&
    validateTags(value.tags).ok &&
    (value.dueDate === null ||
      (typeof value.dueDate === 'string' && validateDueDate(value.dueDate).ok)) &&
    Array.isArray(value.subtasks) &&
    value.subtasks.every(isSubtask) &&
    hasUniqueIds(value.subtasks) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

export function isBoardState(value: unknown): value is BoardState {
  return (
    isRecord(value) &&
    Array.isArray(value.columns) &&
    value.columns.every(isColumnDefinition) &&
    value.columns.length === COLUMN_IDS.length &&
    hasUniqueIds(value.columns) &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isTask) &&
    hasUniqueIds(value.tasks)
  );
}

export function isPersistedBoardEnvelope(value: unknown): value is PersistedBoardEnvelope {
  return (
    isRecord(value) &&
    value.schemaVersion === CURRENT_SCHEMA_VERSION &&
    isTimestamp(value.updatedAt) &&
    isBoardState(value.board)
  );
}

export function isExportedBoardEnvelope(value: unknown): value is ExportedBoardEnvelope {
  return (
    isRecord(value) &&
    value.app === EXPORT_APP_ID &&
    value.schemaVersion === CURRENT_SCHEMA_VERSION &&
    isTimestamp(value.exportedAt) &&
    isBoardState(value.board)
  );
}
