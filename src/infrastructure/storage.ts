import type { Result } from '../domain/index.ts';
import { err, ok } from './result.ts';
import type { StorageError } from './schema.ts';

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const QUOTA_ERROR_NAMES: readonly string[] = ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'];

function isStorageAdapter(value: unknown): value is StorageAdapter {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'getItem') === 'function' &&
    typeof Reflect.get(value, 'setItem') === 'function'
  );
}

/** Resolves the browser `localStorage`, or `null` when absent or access is denied. */
export function resolveDefaultStorage(): StorageAdapter | null {
  try {
    const candidate: unknown = Reflect.get(globalThis, 'localStorage');
    return isStorageAdapter(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function isQuotaError(error: unknown): boolean {
  return error instanceof Error && QUOTA_ERROR_NAMES.includes(error.name);
}

export function unavailableStorageError(): StorageError {
  return {
    code: 'STORAGE_UNAVAILABLE',
    message: 'El almacenamiento local no está disponible en este navegador.',
  };
}

export function readItem(storage: StorageAdapter, key: string): Result<string | null, StorageError> {
  try {
    return ok(storage.getItem(key));
  } catch {
    return err(unavailableStorageError());
  }
}

export function writeItem(
  storage: StorageAdapter,
  key: string,
  value: string,
): Result<void, StorageError> {
  try {
    storage.setItem(key, value);
    return ok(undefined);
  } catch (error) {
    return err(
      isQuotaError(error)
        ? {
            code: 'STORAGE_QUOTA_EXCEEDED',
            message: 'No hay espacio suficiente en el almacenamiento local para guardar el tablero.',
          }
        : {
            code: 'STORAGE_WRITE_FAILED',
            message: 'No se pudo guardar el tablero en el almacenamiento local.',
          },
    );
  }
}
