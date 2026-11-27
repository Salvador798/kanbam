import { extractLegacyTheme } from './legacy.ts';
import { LEGACY_BOARD_STORAGE_KEY } from './schema.ts';
import { resolveDefaultStorage } from './storage.ts';
import type { StorageAdapter } from './storage.ts';

export const THEME_STORAGE_KEY = 'kanbam:theme';

type ThemeValue = 'light' | 'dark';

export interface ThemeRepository {
  load(): ThemeValue;
  save(theme: ThemeValue): void;
}

/** Initial theme when nothing was saved: follows the OS preference, `light` if unknown. */
function systemTheme(): ThemeValue {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Stores a theme carried over from the MVP, only when no preference exists yet.
 * Returns whether the value is now persisted under `storageKey`.
 */
export function adoptLegacyTheme(
  storage: StorageAdapter,
  storageKey: string,
  theme: ThemeValue,
): boolean {
  try {
    if (storage.getItem(storageKey) === null) {
      storage.setItem(storageKey, theme);
    }
    return true;
  } catch {
    return false;
  }
}

/** The MVP embedded the theme in its board payload; read it without touching that key. */
function readLegacyTheme(storage: StorageAdapter): ThemeValue | null {
  try {
    const raw = storage.getItem(LEGACY_BOARD_STORAGE_KEY);
    return raw === null ? null : extractLegacyTheme(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persists the light/dark preference; any storage failure silently degrades to `light`. */
export function createLocalStorageThemeRepository(
  storage: StorageAdapter | null = resolveDefaultStorage(),
  storageKey: string = THEME_STORAGE_KEY,
): ThemeRepository {
  return {
    load() {
      try {
        if (storage === null) {
          return systemTheme();
        }
        const stored = storage.getItem(storageKey);
        if (stored !== null) {
          return stored === 'dark' ? 'dark' : 'light';
        }
        const legacy = readLegacyTheme(storage);
        if (legacy === null) {
          return systemTheme();
        }
        adoptLegacyTheme(storage, storageKey, legacy);
        return legacy;
      } catch {
        return 'light';
      }
    },
    save(theme) {
      try {
        storage?.setItem(storageKey, theme);
      } catch {
        // the preference is best-effort; losing it is harmless
      }
    },
  };
}
