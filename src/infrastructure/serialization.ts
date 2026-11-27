import type { BoardState, Result } from '../domain/index.ts';
import { isRecord } from './guards.ts';
import { migrateLegacyBoard } from './legacy.ts';
import { migrateBoardPayload } from './migrations.ts';
import { err, ok } from './result.ts';
import { CURRENT_SCHEMA_VERSION, EXPORT_APP_ID } from './schema.ts';
import type { ExportedBoardEnvelope, SchemaError } from './schema.ts';

export function exportBoardToJson(
  board: BoardState,
  exportedAt: string = new Date().toISOString(),
): string {
  const envelope: ExportedBoardEnvelope = {
    app: EXPORT_APP_ID,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt,
    board,
  };
  return JSON.stringify(envelope, null, 2);
}

function parseJson(raw: string): Result<unknown, SchemaError> {
  try {
    return ok(JSON.parse(raw));
  } catch {
    return err({ code: 'INVALID_JSON', message: 'El archivo no contiene JSON válido.' });
  }
}

/** The MVP exported its raw state: `{ version, tasks, theme }` with no `app` marker. */
function isLegacyExport(payload: unknown): boolean {
  return (
    isRecord(payload) &&
    !('app' in payload) &&
    !('schemaVersion' in payload) &&
    Array.isArray(payload.tasks)
  );
}

export function importBoardFromJson(raw: string): Result<BoardState, SchemaError> {
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    return parsed;
  }
  const payload = parsed.value;
  if (isLegacyExport(payload)) {
    const legacy = migrateLegacyBoard(payload);
    return legacy.ok ? ok(legacy.value.board) : legacy;
  }
  if (!isRecord(payload) || payload.app !== EXPORT_APP_ID || !('schemaVersion' in payload)) {
    return err({
      code: 'INVALID_SCHEMA',
      message: 'El archivo no es un respaldo válido de este tablero.',
    });
  }
  const migrated = migrateBoardPayload({
    schemaVersion: payload.schemaVersion,
    updatedAt: payload.exportedAt,
    board: payload.board,
  });
  return migrated.ok ? ok(migrated.value.board) : migrated;
}
