import type { BoardState, Result } from '../domain/index.ts';
import { isPersistedBoardEnvelope, sanitizeBoard } from './guards.ts';
import { extractLegacyTheme, migrateLegacyBoard } from './legacy.ts';
import { migrateBoardPayload } from './migrations.ts';
import { err } from './result.ts';
import {
  BOARD_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  LEGACY_BOARD_STORAGE_KEY,
} from './schema.ts';
import type { PersistedBoardEnvelope, StorageError } from './schema.ts';
import { createSeedBoard } from './seed.ts';
import { readItem, resolveDefaultStorage, unavailableStorageError, writeItem } from './storage.ts';
import type { StorageAdapter } from './storage.ts';
import { THEME_STORAGE_KEY, adoptLegacyTheme } from './theme.ts';

export interface BoardRepositoryOptions {
  /** `undefined` uses the browser `localStorage`; `null` forces an unavailable storage. */
  readonly storage?: StorageAdapter | null;
  readonly storageKey?: string;
  readonly legacyStorageKey?: string;
  readonly themeStorageKey?: string;
  readonly now?: () => string;
  readonly referenceDate?: () => Date;
}

export type LoadStatus =
  | 'loaded'
  | 'seeded'
  | 'migrated'
  | 'recovered_from_corruption'
  | 'recovered_from_storage_error';

export interface LoadResult {
  readonly status: LoadStatus;
  readonly board: BoardState;
  readonly warning?: string;
}

interface LegacyMigration {
  readonly board: BoardState;
  readonly skipped: number;
  readonly theme: 'light' | 'dark' | null;
}

export interface BoardRepository {
  load(): LoadResult;
  save(board: BoardState): Result<void, StorageError>;
  resetDemo(referenceDate?: Date): Result<void, StorageError>;
}

const CORRUPTION_WARNING =
  'Los datos guardados estaban dañados o eran incompatibles. Se cargó el tablero de demostración.';

function skippedWarning(skipped: number): string {
  return skipped === 1
    ? 'Se omitió 1 tarea del tablero anterior porque sus datos no eran válidos.'
    : `Se omitieron ${skipped} tareas del tablero anterior porque sus datos no eran válidos.`;
}

function joinWarnings(...parts: readonly (string | undefined)[]): string | undefined {
  const present = parts.filter((part): part is string => part !== undefined);
  return present.length > 0 ? present.join(' ') : undefined;
}

type ParsedJson = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

function parseStoredJson(raw: string): ParsedJson {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

export function createLocalStorageBoardRepository(
  options: BoardRepositoryOptions = {},
): BoardRepository {
  const storage = options.storage === undefined ? resolveDefaultStorage() : options.storage;
  const storageKey = options.storageKey ?? BOARD_STORAGE_KEY;
  const now = options.now ?? ((): string => new Date().toISOString());
  const legacyKey = options.legacyStorageKey ?? LEGACY_BOARD_STORAGE_KEY;
  const themeKey = options.themeStorageKey ?? THEME_STORAGE_KEY;
  const referenceDate = options.referenceDate ?? ((): Date => new Date());

  function save(board: BoardState): Result<void, StorageError> {
    if (storage === null) {
      return err(unavailableStorageError());
    }
    const envelope: PersistedBoardEnvelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: now(),
      board,
    };
    return writeItem(storage, storageKey, JSON.stringify(envelope));
  }

  function recover(status: LoadStatus, warning: string): LoadResult {
    return { status, board: createSeedBoard(referenceDate()), warning };
  }

  function seed(): LoadResult {
    const board = createSeedBoard(referenceDate());
    const saved = save(board);
    return saved.ok
      ? { status: 'seeded', board }
      : { status: 'recovered_from_storage_error', board, warning: saved.error.message };
  }

  function upgrade(envelope: PersistedBoardEnvelope): LoadResult {
    const saved = save(envelope.board);
    return saved.ok
      ? { status: 'migrated', board: envelope.board }
      : { status: 'migrated', board: envelope.board, warning: saved.error.message };
  }

  function readLegacyMigration(current: StorageAdapter): LegacyMigration | null {
    const stored = readItem(current, legacyKey);
    if (!stored.ok || stored.value === null) {
      return null;
    }
    const parsed = parseStoredJson(stored.value);
    if (!parsed.ok) {
      return null;
    }
    const migrated = migrateLegacyBoard(parsed.value, now());
    return migrated.ok ? { ...migrated.value, theme: extractLegacyTheme(parsed.value) } : null;
  }

  /** Removes the legacy key only after the new data (and theme) are safely persisted. */
  function retireLegacy(current: StorageAdapter, theme: LegacyMigration['theme']): void {
    if (theme !== null && !adoptLegacyTheme(current, themeKey, theme)) {
      return;
    }
    try {
      current.removeItem?.(legacyKey);
    } catch {
      // a leftover legacy key is harmless: the current key always wins
    }
  }

  function migrateLegacy(current: StorageAdapter): LoadResult | null {
    const legacy = readLegacyMigration(current);
    if (legacy === null) {
      return null;
    }
    const skipped = legacy.skipped > 0 ? skippedWarning(legacy.skipped) : undefined;
    const saved = save(legacy.board);
    if (!saved.ok) {
      const warning = joinWarnings(skipped, saved.error.message);
      return { status: 'migrated', board: legacy.board, warning };
    }
    retireLegacy(current, legacy.theme);
    return { status: 'migrated', board: legacy.board, warning: skipped };
  }

  function load(): LoadResult {
    if (storage === null) {
      return recover('recovered_from_storage_error', unavailableStorageError().message);
    }
    const stored = readItem(storage, storageKey);
    if (!stored.ok) {
      return recover('recovered_from_storage_error', stored.error.message);
    }
    if (stored.value === null) {
      return migrateLegacy(storage) ?? seed();
    }
    const parsed = parseStoredJson(stored.value);
    if (!parsed.ok) {
      return recover('recovered_from_corruption', CORRUPTION_WARNING);
    }
    if (isPersistedBoardEnvelope(parsed.value)) {
      return { status: 'loaded', board: sanitizeBoard(parsed.value.board) };
    }
    const migrated = migrateBoardPayload(parsed.value);
    return migrated.ok
      ? upgrade(migrated.value)
      : recover('recovered_from_corruption', CORRUPTION_WARNING);
  }

  function resetDemo(date: Date = referenceDate()): Result<void, StorageError> {
    return save(createSeedBoard(date));
  }

  return { load, save, resetDemo };
}
