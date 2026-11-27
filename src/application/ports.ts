import type { BoardState, Result } from '../domain/index.ts';

export type Theme = 'light' | 'dark';

export interface PortError {
  readonly message: string;
}

export interface BoardLoadResult {
  readonly board: BoardState;
  readonly warning?: string;
}

/** Board persistence port. Structurally satisfied by the infrastructure `BoardRepository`. */
export interface BoardPersistence {
  load(): BoardLoadResult;
  save(board: BoardState): Result<void, PortError>;
  resetDemo(): Result<void, PortError>;
}

/** Theme preference port (a UI preference, intentionally outside the domain board). */
export interface ThemePersistence {
  load(): Theme;
  save(theme: Theme): void;
}

/** JSON export/import port. Wired to the infrastructure serialization in `main.ts`. */
export interface BoardSerializer {
  serialize(board: BoardState): string;
  deserialize(raw: string): Result<BoardState, PortError>;
}
