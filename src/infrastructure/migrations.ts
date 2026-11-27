import { DEFAULT_COLUMNS } from '../domain/index.ts';
import type { Result } from '../domain/index.ts';
import { isPersistedBoardEnvelope, isRecord, sanitizeBoard } from './guards.ts';
import { err, ok } from './result.ts';
import { CURRENT_SCHEMA_VERSION } from './schema.ts';
import type { PersistedBoardEnvelope, SchemaError } from './schema.ts';

type MigrationStep = (payload: Record<string, unknown>) => Record<string, unknown>;

const LEGACY_UPDATED_AT = '1970-01-01T00:00:00.000Z';

function migrateV0ToV1(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: 1,
    updatedAt: LEGACY_UPDATED_AT,
    board: { columns: DEFAULT_COLUMNS, tasks: payload.tasks },
  };
}

function migrateV1ToV2(payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload, schemaVersion: 2 };
}

/** Index N upgrades a payload from schema version N to N + 1. */
const MIGRATION_STEPS: readonly MigrationStep[] = [migrateV0ToV1, migrateV1ToV2];

function invalidSchema(): SchemaError {
  return {
    code: 'INVALID_SCHEMA',
    message: 'Los datos del tablero no tienen una estructura válida.',
  };
}

function detectSchemaVersion(payload: Record<string, unknown>): Result<number, SchemaError> {
  if (!('schemaVersion' in payload)) {
    return Array.isArray(payload.tasks) ? ok(0) : err(invalidSchema());
  }
  const version = payload.schemaVersion;
  if (
    typeof version === 'number' &&
    Number.isInteger(version) &&
    version >= 1 &&
    version <= CURRENT_SCHEMA_VERSION
  ) {
    return ok(version);
  }
  return err({
    code: 'UNSUPPORTED_SCHEMA_VERSION',
    message: 'La versión del esquema de datos no es compatible con esta aplicación.',
  });
}

export function migrateBoardPayload(payload: unknown): Result<PersistedBoardEnvelope, SchemaError> {
  if (!isRecord(payload)) {
    return err(invalidSchema());
  }
  const version = detectSchemaVersion(payload);
  if (!version.ok) {
    return version;
  }
  const migrated = MIGRATION_STEPS.slice(version.value).reduce(
    (current, step) => step(current),
    payload,
  );
  return isPersistedBoardEnvelope(migrated)
    ? ok({ ...migrated, board: sanitizeBoard(migrated.board) })
    : err(invalidSchema());
}
