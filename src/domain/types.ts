export const COLUMN_IDS = ['todo', 'in_progress', 'in_review', 'done'] as const;

export type ColumnId = (typeof COLUMN_IDS)[number];

export const COLUMN_TITLES: Record<ColumnId, string> = {
  todo: 'Por hacer',
  in_progress: 'En progreso',
  in_review: 'En revisión',
  done: 'Completado',
};

export interface ColumnDefinition {
  readonly id: ColumnId;
  readonly title: string;
  readonly order: number;
  readonly wipLimit: number | null;
}

export const DEFAULT_COLUMNS: readonly ColumnDefinition[] = [
  { id: 'todo', title: COLUMN_TITLES.todo, order: 0, wipLimit: null },
  { id: 'in_progress', title: COLUMN_TITLES.in_progress, order: 1, wipLimit: 3 },
  { id: 'in_review', title: COLUMN_TITLES.in_review, order: 2, wipLimit: 2 },
  { id: 'done', title: COLUMN_TITLES.done, order: 3, wipLimit: null },
];

export const PRIORITIES = ['low', 'medium', 'high'] as const;

export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

export type DueDateStatus = 'none' | 'on_track' | 'due_soon' | 'overdue';

export const DUE_DATE_STATUS_LABELS: Record<DueDateStatus, string> = {
  none: 'Sin fecha',
  on_track: 'En plazo',
  due_soon: 'Próxima a vencer',
  overdue: 'Vencida',
};

export const DUE_SOON_THRESHOLD_DAYS = 3;

export const DEFAULT_TAG_SUGGESTIONS = [
  'UI',
  'Bug',
  'Feature',
  'Docs',
  'Refactor',
  'Testing',
] as const;

export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 2000;
export const TAG_MAX_LENGTH = 32;
export const MAX_TAGS_PER_TASK = 10;
export const SUBTASK_TITLE_MAX_LENGTH = 120;

export type WipStatus = 'unlimited' | 'within_limit' | 'at_limit' | 'exceeded';

export interface Subtask {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export interface SubtaskProgress {
  readonly completed: number;
  readonly total: number;
  readonly percentage: number;
  readonly label: string;
}

export interface Task {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly columnId: ColumnId;
  readonly order: number;
  readonly priority: Priority;
  readonly tags: readonly string[];
  readonly dueDate: string | null;
  readonly subtasks: readonly Subtask[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BoardState {
  readonly columns: readonly ColumnDefinition[];
  readonly tasks: readonly Task[];
}

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export type DomainErrorCode =
  | 'EMPTY_TITLE'
  | 'TITLE_TOO_LONG'
  | 'DESCRIPTION_TOO_LONG'
  | 'INVALID_COLUMN'
  | 'INVALID_PRIORITY'
  | 'INVALID_TAG'
  | 'TOO_MANY_TAGS'
  | 'INVALID_DUE_DATE'
  | 'EMPTY_SUBTASK_TITLE'
  | 'SUBTASK_TITLE_TOO_LONG'
  | 'TASK_NOT_FOUND'
  | 'SUBTASK_NOT_FOUND'
  | 'INVALID_WIP_LIMIT'
  | 'WIP_LIMIT_EXCEEDED'
  | 'INVALID_POSITION';

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
  readonly field?: string;
}

export interface WipEvaluation {
  readonly status: WipStatus;
  readonly count: number;
  readonly limit: number | null;
  readonly isAtOrOverLimit: boolean;
  readonly wouldExceedOnAdd: boolean;
}

export interface DueDateEvaluation {
  readonly status: DueDateStatus;
  readonly label: string;
  readonly daysRemaining: number | null;
}

export interface SubtaskInput {
  readonly id?: string;
  readonly title: string;
  readonly completed?: boolean;
}

export interface CreateTaskInput {
  readonly id?: string;
  readonly title: string;
  readonly description?: string;
  readonly columnId?: ColumnId;
  readonly priority?: Priority;
  readonly tags?: readonly string[];
  readonly dueDate?: string | null;
  readonly subtasks?: readonly SubtaskInput[];
  readonly now?: string;
}

export interface UpdateTaskPatch {
  readonly title?: string;
  readonly description?: string;
  readonly columnId?: ColumnId;
  readonly priority?: Priority;
  readonly tags?: readonly string[];
  readonly dueDate?: string | null;
}

export interface AddSubtaskInput {
  readonly id?: string;
  readonly title: string;
  readonly completed?: boolean;
}
