import { DEFAULT_COLUMNS, isValidPriority, validateTags } from '../domain/index.ts';
import type { BoardState, ColumnId, Result, Task } from '../domain/index.ts';
import { isBoardState, isRecord, isTask } from './guards.ts';
import { err, ok } from './result.ts';
import type { SchemaError } from './schema.ts';

export interface LegacyMigration {
  readonly board: BoardState;
  readonly skipped: number;
}

export type LegacyTheme = 'light' | 'dark';

const LEGACY_COLUMN_IDS: Readonly<Record<string, ColumnId>> = {
  todo: 'todo',
  'in-progress': 'in_progress',
  'in-review': 'in_review',
  done: 'done',
};

function invalidSchema(): SchemaError {
  return {
    code: 'INVALID_SCHEMA',
    message: 'Los datos del tablero anterior no tienen una estructura válida.',
  };
}

function mapColumnId(value: unknown): ColumnId | null {
  return typeof value === 'string' && Object.hasOwn(LEGACY_COLUMN_IDS, value)
    ? (LEGACY_COLUMN_IDS[value] ?? null)
    : null;
}

function toIsoTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return fallback;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function mapTags(label: unknown): readonly string[] {
  if (typeof label !== 'string' || label.length === 0) {
    return [];
  }
  return validateTags([label]).ok ? [label] : [];
}

function mapLegacyTask(raw: unknown, order: number, now: string): Task | null {
  if (!isRecord(raw)) {
    return null;
  }
  const columnId = mapColumnId(raw.columnId);
  if (columnId === null || !isValidPriority(raw.priority)) {
    return null;
  }
  const createdAt = toIsoTimestamp(raw.createdAt, now);
  const candidate = {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    columnId,
    order,
    priority: raw.priority,
    tags: mapTags(raw.label),
    dueDate: null,
    subtasks: [],
    createdAt,
    updatedAt: createdAt,
  };
  return isTask(candidate) ? candidate : null;
}

/** Reads the theme the MVP embedded inside its board payload, if any. */
export function extractLegacyTheme(raw: unknown): LegacyTheme | null {
  if (!isRecord(raw)) {
    return null;
  }
  return raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : null;
}

/**
 * Maps the MVP board (`kanbam_board_v1`, also its JSON export) onto the current domain.
 * Input is untrusted: invalid or duplicated tasks are skipped and counted, never repaired.
 */
export function migrateLegacyBoard(
  raw: unknown,
  now: string = new Date().toISOString(),
): Result<LegacyMigration, SchemaError> {
  if (!isRecord(raw) || !Array.isArray(raw.tasks)) {
    return err(invalidSchema());
  }
  const tasks: Task[] = [];
  const seenIds = new Set<string>();
  const nextOrder = new Map<ColumnId, number>();
  for (const item of raw.tasks as readonly unknown[]) {
    const columnId = isRecord(item) ? mapColumnId(item.columnId) : null;
    const order = columnId === null ? 0 : (nextOrder.get(columnId) ?? 0);
    const task = mapLegacyTask(item, order, now);
    if (task === null || seenIds.has(task.id)) {
      continue;
    }
    seenIds.add(task.id);
    nextOrder.set(task.columnId, order + 1);
    tasks.push(task);
  }
  const board: BoardState = { columns: DEFAULT_COLUMNS, tasks };
  return isBoardState(board)
    ? ok({ board, skipped: raw.tasks.length - tasks.length })
    : err(invalidSchema());
}
