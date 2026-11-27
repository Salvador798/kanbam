export {
  BOARD_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  EXPORT_APP_ID,
  LEGACY_BOARD_STORAGE_KEY,
} from './schema.ts';
export type {
  ExportedBoardEnvelope,
  PersistedBoardEnvelope,
  SchemaError,
  SchemaErrorCode,
  StorageError,
  StorageErrorCode,
} from './schema.ts';

export {
  isBoardState,
  isColumnDefinition,
  isExportedBoardEnvelope,
  isPersistedBoardEnvelope,
  isSubtask,
  isTask,
} from './guards.ts';

export { migrateBoardPayload } from './migrations.ts';
export { extractLegacyTheme, migrateLegacyBoard } from './legacy.ts';
export type { LegacyMigration } from './legacy.ts';
export { exportBoardToJson, importBoardFromJson } from './serialization.ts';
export { createSeedBoard } from './seed.ts';

export type { StorageAdapter } from './storage.ts';
export { createLocalStorageBoardRepository } from './repository.ts';
export type {
  BoardRepository,
  BoardRepositoryOptions,
  LoadResult,
  LoadStatus,
} from './repository.ts';

export { THEME_STORAGE_KEY, createLocalStorageThemeRepository } from './theme.ts';
export type { ThemeRepository } from './theme.ts';
