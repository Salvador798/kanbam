import type { BoardState } from '../domain/index.ts';

export const CURRENT_SCHEMA_VERSION = 2;
export const BOARD_STORAGE_KEY = 'kanbam:board';
export const EXPORT_APP_ID = 'kanbam';

export interface PersistedBoardEnvelope {
  readonly schemaVersion: number;
  readonly updatedAt: string;
  readonly board: BoardState;
}

export interface ExportedBoardEnvelope {
  readonly app: string;
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly board: BoardState;
}

export type SchemaErrorCode = 'INVALID_JSON' | 'INVALID_SCHEMA' | 'UNSUPPORTED_SCHEMA_VERSION';

export interface SchemaError {
  readonly code: SchemaErrorCode;
  readonly message: string;
}

export type StorageErrorCode =
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'STORAGE_WRITE_FAILED';

export interface StorageError {
  readonly code: StorageErrorCode;
  readonly message: string;
}
