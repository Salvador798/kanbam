import { validateDueDate } from './due-date.ts';
import {
  COLUMN_IDS,
  COLUMN_TITLES,
  DEFAULT_COLUMNS,
} from './types.ts';
import type {
  AddSubtaskInput,
  BoardState,
  ColumnDefinition,
  ColumnId,
  CreateTaskInput,
  DomainError,
  DomainErrorCode,
  Result,
  Subtask,
  SubtaskProgress,
  Task,
  UpdateTaskPatch,
  WipEvaluation,
} from './types.ts';
import {
  isValidColumnId,
  isValidPriority,
  validateDescription,
  validateSubtaskTitle,
  validateTags,
  validateTaskTitle,
} from './validation.ts';

let fallbackIdSequence = 0;

function domainFail(
  code: DomainErrorCode,
  message: string,
  field?: string,
): Result<never, DomainError> {
  return {
    ok: false,
    error: field === undefined ? { code, message } : { code, message, field },
  };
}

function cloneSubtask(subtask: Subtask): Subtask {
  return {
    id: subtask.id,
    title: subtask.title,
    completed: subtask.completed,
  };
}

function cloneTask(task: Task): Task {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    columnId: task.columnId,
    order: task.order,
    priority: task.priority,
    tags: [...task.tags],
    dueDate: task.dueDate,
    subtasks: task.subtasks.map(cloneSubtask),
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function cloneColumn(column: ColumnDefinition): ColumnDefinition {
  return {
    id: column.id,
    title: column.title,
    order: column.order,
    wipLimit: column.wipLimit,
  };
}

function generateUniqueId(prefix: string, existingIds: ReadonlySet<string>): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (typeof randomUuid === 'string' && randomUuid.length > 0 && !existingIds.has(randomUuid)) {
    return randomUuid;
  }

  let candidate: string;
  do {
    fallbackIdSequence += 1;
    candidate = `${prefix}-${Date.now().toString(36)}-${fallbackIdSequence.toString(36)}`;
  } while (existingIds.has(candidate));

  return candidate;
}

function findColumnDefinition(board: BoardState, columnId: ColumnId): ColumnDefinition {
  const found = board.columns.find((col) => col.id === columnId);
  if (found) {
    return found;
  }
  const fallback = DEFAULT_COLUMNS.find((col) => col.id === columnId);
  if (fallback) {
    return fallback;
  }
  return {
    id: columnId,
    title: COLUMN_TITLES[columnId],
    order: COLUMN_IDS.indexOf(columnId),
    wipLimit: null,
  };
}

function reindexTasks(tasks: readonly Task[]): Task[] {
  return tasks.map((task, index) => ({
    ...cloneTask(task),
    order: index,
  }));
}

export function createBoard(
  columns: readonly ColumnDefinition[] = DEFAULT_COLUMNS,
  tasks: readonly Task[] = [],
): BoardState {
  return {
    columns: columns.map(cloneColumn),
    tasks: tasks.map(cloneTask),
  };
}

export function getColumnWipEvaluation(
  column: ColumnDefinition,
  taskCount: number,
): WipEvaluation {
  const count = Math.max(0, Math.trunc(taskCount));
  const limit = column.wipLimit;

  if (limit === null) {
    return {
      status: 'unlimited',
      count,
      limit: null,
      isAtOrOverLimit: false,
      wouldExceedOnAdd: false,
    };
  }

  if (count < limit) {
    return {
      status: 'within_limit',
      count,
      limit,
      isAtOrOverLimit: false,
      wouldExceedOnAdd: false,
    };
  }

  if (count === limit) {
    return {
      status: 'at_limit',
      count,
      limit,
      isAtOrOverLimit: true,
      wouldExceedOnAdd: true,
    };
  }

  return {
    status: 'exceeded',
    count,
    limit,
    isAtOrOverLimit: true,
    wouldExceedOnAdd: true,
  };
}

export function getBoardWipEvaluations(board: BoardState): Record<ColumnId, WipEvaluation> {
  const counts: Record<ColumnId, number> = {
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
  };

  for (const task of board.tasks) {
    if (isValidColumnId(task.columnId)) {
      counts[task.columnId] += 1;
    }
  }

  return {
    todo: getColumnWipEvaluation(findColumnDefinition(board, 'todo'), counts.todo),
    in_progress: getColumnWipEvaluation(
      findColumnDefinition(board, 'in_progress'),
      counts.in_progress,
    ),
    in_review: getColumnWipEvaluation(findColumnDefinition(board, 'in_review'), counts.in_review),
    done: getColumnWipEvaluation(findColumnDefinition(board, 'done'), counts.done),
  };
}

export function getSubtaskProgress(subtasks: readonly Subtask[]): SubtaskProgress {
  const total = subtasks.length;
  const completed = subtasks.reduce((acc, subtask) => (subtask.completed ? acc + 1 : acc), 0);
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

  return {
    completed,
    total,
    percentage,
    label: `${completed}/${total}`,
  };
}

export function getTasksByColumn(board: BoardState, columnId: ColumnId): readonly Task[] {
  return board.tasks
    .filter((task) => task.columnId === columnId)
    .sort((a, b) => a.order - b.order)
    .map(cloneTask);
}

export function createTask(
  board: BoardState,
  input: CreateTaskInput,
  options?: { enforceWipLimit?: boolean },
): Result<BoardState, DomainError> {
  const columnId = input.columnId ?? 'todo';
  if (!isValidColumnId(columnId)) {
    return domainFail('INVALID_COLUMN', 'La columna especificada no es válida.', 'columnId');
  }

  const priority = input.priority ?? 'medium';
  if (!isValidPriority(priority)) {
    return domainFail('INVALID_PRIORITY', 'La prioridad especificada no es válida.', 'priority');
  }

  const titleResult = validateTaskTitle(input.title);
  if (!titleResult.ok) {
    return titleResult;
  }

  const descriptionResult = validateDescription(input.description ?? '');
  if (!descriptionResult.ok) {
    return descriptionResult;
  }

  const tagsResult = validateTags(input.tags ?? []);
  if (!tagsResult.ok) {
    return tagsResult;
  }

  const dueDateResult = validateDueDate(input.dueDate ?? null);
  if (!dueDateResult.ok) {
    return dueDateResult;
  }

  const subtaskIds = new Set<string>();
  const subtasks: Subtask[] = [];
  for (const subInput of input.subtasks ?? []) {
    const subTitleResult = validateSubtaskTitle(subInput.title);
    if (!subTitleResult.ok) {
      return subTitleResult;
    }

    const trimmedSubId = subInput.id?.trim();
    const subId =
      trimmedSubId !== undefined && trimmedSubId.length > 0 && !subtaskIds.has(trimmedSubId)
        ? trimmedSubId
        : generateUniqueId('sub', subtaskIds);
    subtaskIds.add(subId);

    subtasks.push({
      id: subId,
      title: subTitleResult.value,
      completed: Boolean(subInput.completed),
    });
  }

  const columnTasks = getTasksByColumn(board, columnId);
  if (options?.enforceWipLimit === true) {
    const columnDef = findColumnDefinition(board, columnId);
    const wipEvaluation = getColumnWipEvaluation(columnDef, columnTasks.length);
    if (wipEvaluation.wouldExceedOnAdd) {
      return domainFail(
        'WIP_LIMIT_EXCEEDED',
        `La columna "${columnDef.title}" alcanzó su límite WIP (${columnDef.wipLimit}).`,
        'columnId',
      );
    }
  }

  const existingTaskIds = new Set(board.tasks.map((task) => task.id));
  const trimmedTaskId = input.id?.trim();
  const taskId =
    trimmedTaskId !== undefined && trimmedTaskId.length > 0 && !existingTaskIds.has(trimmedTaskId)
      ? trimmedTaskId
      : generateUniqueId('task', existingTaskIds);

  const now = input.now ?? new Date().toISOString();
  const newTask: Task = {
    id: taskId,
    title: titleResult.value,
    description: descriptionResult.value,
    columnId,
    order: columnTasks.length,
    priority,
    tags: tagsResult.value,
    dueDate: dueDateResult.value,
    subtasks,
    createdAt: now,
    updatedAt: now,
  };

  return {
    ok: true,
    value: {
      columns: board.columns.map(cloneColumn),
      tasks: [...board.tasks.map(cloneTask), newTask],
    },
  };
}

export function updateTask(
  board: BoardState,
  taskId: string,
  patch: UpdateTaskPatch,
  options?: { now?: string; enforceWipLimit?: boolean },
): Result<BoardState, DomainError> {
  const existing = board.tasks.find((task) => task.id === taskId);
  if (!existing) {
    return domainFail('TASK_NOT_FOUND', 'No se encontró la tarea solicitada.');
  }

  let nextTitle = existing.title;
  if (patch.title !== undefined) {
    const titleResult = validateTaskTitle(patch.title);
    if (!titleResult.ok) {
      return titleResult;
    }
    nextTitle = titleResult.value;
  }

  let nextDescription = existing.description;
  if (patch.description !== undefined) {
    const descriptionResult = validateDescription(patch.description);
    if (!descriptionResult.ok) {
      return descriptionResult;
    }
    nextDescription = descriptionResult.value;
  }

  let nextPriority = existing.priority;
  if (patch.priority !== undefined) {
    if (!isValidPriority(patch.priority)) {
      return domainFail('INVALID_PRIORITY', 'La prioridad especificada no es válida.', 'priority');
    }
    nextPriority = patch.priority;
  }

  let nextTags = existing.tags;
  if (patch.tags !== undefined) {
    const tagsResult = validateTags(patch.tags);
    if (!tagsResult.ok) {
      return tagsResult;
    }
    nextTags = tagsResult.value;
  }

  let nextDueDate = existing.dueDate;
  if (patch.dueDate !== undefined) {
    const dueDateResult = validateDueDate(patch.dueDate);
    if (!dueDateResult.ok) {
      return dueDateResult;
    }
    nextDueDate = dueDateResult.value;
  }

  let nextColumnId = existing.columnId;
  if (patch.columnId !== undefined) {
    if (!isValidColumnId(patch.columnId)) {
      return domainFail('INVALID_COLUMN', 'La columna especificada no es válida.', 'columnId');
    }
    nextColumnId = patch.columnId;
  }

  const isColumnChanging = nextColumnId !== existing.columnId;
  if (isColumnChanging && options?.enforceWipLimit === true) {
    const targetColumnDef = findColumnDefinition(board, nextColumnId);
    const targetCount = getTasksByColumn(board, nextColumnId).length;
    const wipEvaluation = getColumnWipEvaluation(targetColumnDef, targetCount);
    if (wipEvaluation.wouldExceedOnAdd) {
      return domainFail(
        'WIP_LIMIT_EXCEEDED',
        `La columna "${targetColumnDef.title}" alcanzó su límite WIP (${targetColumnDef.wipLimit}).`,
        'columnId',
      );
    }
  }

  const now = options?.now ?? new Date().toISOString();
  const updatedTaskBase: Task = {
    ...cloneTask(existing),
    title: nextTitle,
    description: nextDescription,
    columnId: nextColumnId,
    priority: nextPriority,
    tags: [...nextTags],
    dueDate: nextDueDate,
    updatedAt: now,
  };

  if (!isColumnChanging) {
    return {
      ok: true,
      value: {
        columns: board.columns.map(cloneColumn),
        tasks: board.tasks.map((task) => (task.id === taskId ? updatedTaskBase : cloneTask(task))),
      },
    };
  }

  const remainingSource = reindexTasks(
    board.tasks
      .filter((task) => task.columnId === existing.columnId && task.id !== taskId)
      .sort((a, b) => a.order - b.order),
  );
  const targetTasks = reindexTasks([
    ...board.tasks
      .filter((task) => task.columnId === nextColumnId)
      .sort((a, b) => a.order - b.order),
    updatedTaskBase,
  ]);
  const unaffectedTasks = board.tasks
    .filter((task) => task.columnId !== existing.columnId && task.columnId !== nextColumnId)
    .map(cloneTask);

  return {
    ok: true,
    value: {
      columns: board.columns.map(cloneColumn),
      tasks: [...unaffectedTasks, ...remainingSource, ...targetTasks],
    },
  };
}

export function deleteTask(board: BoardState, taskId: string): Result<BoardState, DomainError> {
  const existing = board.tasks.find((task) => task.id === taskId);
  if (!existing) {
    return domainFail('TASK_NOT_FOUND', 'No se encontró la tarea solicitada.');
  }

  const remainingInColumn = reindexTasks(
    board.tasks
      .filter((task) => task.columnId === existing.columnId && task.id !== taskId)
      .sort((a, b) => a.order - b.order),
  );
  const otherTasks = board.tasks
    .filter((task) => task.columnId !== existing.columnId)
    .map(cloneTask);

  return {
    ok: true,
    value: {
      columns: board.columns.map(cloneColumn),
      tasks: [...otherTasks, ...remainingInColumn],
    },
  };
}

export function moveTask(
  board: BoardState,
  taskId: string,
  targetColumnId: ColumnId,
  targetIndex?: number,
  options?: { now?: string; enforceWipLimit?: boolean },
): Result<BoardState, DomainError> {
  const existing = board.tasks.find((task) => task.id === taskId);
  if (!existing) {
    return domainFail('TASK_NOT_FOUND', 'No se encontró la tarea solicitada.');
  }

  if (!isValidColumnId(targetColumnId)) {
    return domainFail('INVALID_COLUMN', 'La columna de destino no es válida.', 'columnId');
  }

  const isSameColumn = existing.columnId === targetColumnId;
  const sourceTasks = getTasksByColumn(board, existing.columnId);
  const targetTasks = isSameColumn ? sourceTasks : getTasksByColumn(board, targetColumnId);

  if (targetIndex !== undefined) {
    const maxIndex = isSameColumn ? sourceTasks.length - 1 : targetTasks.length;
    if (
      typeof targetIndex !== 'number' ||
      !Number.isInteger(targetIndex) ||
      targetIndex < 0 ||
      targetIndex > maxIndex
    ) {
      return domainFail(
        'INVALID_POSITION',
        'La posición de destino está fuera de los límites permitidos.',
        'order',
      );
    }
  }

  if (!isSameColumn && options?.enforceWipLimit === true) {
    const targetColumnDef = findColumnDefinition(board, targetColumnId);
    const wipEvaluation = getColumnWipEvaluation(targetColumnDef, targetTasks.length);
    if (wipEvaluation.wouldExceedOnAdd) {
      return domainFail(
        'WIP_LIMIT_EXCEEDED',
        `La columna "${targetColumnDef.title}" alcanzó su límite WIP (${targetColumnDef.wipLimit}).`,
        'columnId',
      );
    }
  }

  const now = options?.now ?? new Date().toISOString();
  const movedTask: Task = {
    ...cloneTask(existing),
    columnId: targetColumnId,
    updatedAt: now,
  };

  if (isSameColumn) {
    const withoutMoved = sourceTasks.filter((task) => task.id !== taskId);
    const insertIndex = targetIndex ?? sourceTasks.length - 1;
    const reordered = [
      ...withoutMoved.slice(0, insertIndex),
      movedTask,
      ...withoutMoved.slice(insertIndex),
    ];
    const reindexedColumn = reindexTasks(reordered);
    const otherTasks = board.tasks
      .filter((task) => task.columnId !== targetColumnId)
      .map(cloneTask);

    return {
      ok: true,
      value: {
        columns: board.columns.map(cloneColumn),
        tasks: [...otherTasks, ...reindexedColumn],
      },
    };
  }

  const reindexedSource = reindexTasks(sourceTasks.filter((task) => task.id !== taskId));
  const insertIndex = targetIndex ?? targetTasks.length;
  const reorderedTarget = [
    ...targetTasks.slice(0, insertIndex),
    movedTask,
    ...targetTasks.slice(insertIndex),
  ];
  const reindexedTarget = reindexTasks(reorderedTarget);
  const unaffectedTasks = board.tasks
    .filter((task) => task.columnId !== existing.columnId && task.columnId !== targetColumnId)
    .map(cloneTask);

  return {
    ok: true,
    value: {
      columns: board.columns.map(cloneColumn),
      tasks: [...unaffectedTasks, ...reindexedSource, ...reindexedTarget],
    },
  };
}

export function addSubtask(
  board: BoardState,
  taskId: string,
  input: AddSubtaskInput,
  options?: { now?: string },
): Result<BoardState, DomainError> {
  const existing = board.tasks.find((task) => task.id === taskId);
  if (!existing) {
    return domainFail('TASK_NOT_FOUND', 'No se encontró la tarea solicitada.');
  }

  const titleResult = validateSubtaskTitle(input.title);
  if (!titleResult.ok) {
    return titleResult;
  }

  const existingSubtaskIds = new Set(existing.subtasks.map((sub) => sub.id));
  const trimmedSubId = input.id?.trim();
  const subtaskId =
    trimmedSubId !== undefined && trimmedSubId.length > 0 && !existingSubtaskIds.has(trimmedSubId)
      ? trimmedSubId
      : generateUniqueId('sub', existingSubtaskIds);

  const newSubtask: Subtask = {
    id: subtaskId,
    title: titleResult.value,
    completed: Boolean(input.completed),
  };

  const now = options?.now ?? new Date().toISOString();

  return {
    ok: true,
    value: {
      columns: board.columns.map(cloneColumn),
      tasks: board.tasks.map((task) =>
        task.id === taskId
          ? {
              ...cloneTask(task),
              subtasks: [...task.subtasks.map(cloneSubtask), newSubtask],
              updatedAt: now,
            }
          : cloneTask(task),
      ),
    },
  };
}

export function updateSubtaskTitle(
  board: BoardState,
  taskId: string,
  subtaskId: string,
  title: string,
  now?: string,
): Result<BoardState, DomainError> {
  const existing = board.tasks.find((task) => task.id === taskId);
  if (!existing) {
    return domainFail('TASK_NOT_FOUND', 'No se encontró la tarea solicitada.');
  }

  const subtaskExists = existing.subtasks.some((sub) => sub.id === subtaskId);
  if (!subtaskExists) {
    return domainFail('SUBTASK_NOT_FOUND', 'No se encontró la subtarea solicitada.');
  }

  const titleResult = validateSubtaskTitle(title);
  if (!titleResult.ok) {
    return titleResult;
  }

  const updatedAt = now ?? new Date().toISOString();

  return {
    ok: true,
    value: {
      columns: board.columns.map(cloneColumn),
      tasks: board.tasks.map((task) =>
        task.id === taskId
          ? {
              ...cloneTask(task),
              subtasks: task.subtasks.map((sub) =>
                sub.id === subtaskId ? { ...cloneSubtask(sub), title: titleResult.value } : cloneSubtask(sub),
              ),
              updatedAt,
            }
          : cloneTask(task),
      ),
    },
  };
}

export function toggleSubtask(
  board: BoardState,
  taskId: string,
  subtaskId: string,
  now?: string,
): Result<BoardState, DomainError> {
  const existing = board.tasks.find((task) => task.id === taskId);
  if (!existing) {
    return domainFail('TASK_NOT_FOUND', 'No se encontró la tarea solicitada.');
  }

  const subtaskExists = existing.subtasks.some((sub) => sub.id === subtaskId);
  if (!subtaskExists) {
    return domainFail('SUBTASK_NOT_FOUND', 'No se encontró la subtarea solicitada.');
  }

  const updatedAt = now ?? new Date().toISOString();

  return {
    ok: true,
    value: {
      columns: board.columns.map(cloneColumn),
      tasks: board.tasks.map((task) =>
        task.id === taskId
          ? {
              ...cloneTask(task),
              subtasks: task.subtasks.map((sub) =>
                sub.id === subtaskId ? { ...cloneSubtask(sub), completed: !sub.completed } : cloneSubtask(sub),
              ),
              updatedAt,
            }
          : cloneTask(task),
      ),
    },
  };
}

export function removeSubtask(
  board: BoardState,
  taskId: string,
  subtaskId: string,
  now?: string,
): Result<BoardState, DomainError> {
  const existing = board.tasks.find((task) => task.id === taskId);
  if (!existing) {
    return domainFail('TASK_NOT_FOUND', 'No se encontró la tarea solicitada.');
  }

  const subtaskExists = existing.subtasks.some((sub) => sub.id === subtaskId);
  if (!subtaskExists) {
    return domainFail('SUBTASK_NOT_FOUND', 'No se encontró la subtarea solicitada.');
  }

  const updatedAt = now ?? new Date().toISOString();

  return {
    ok: true,
    value: {
      columns: board.columns.map(cloneColumn),
      tasks: board.tasks.map((task) =>
        task.id === taskId
          ? {
              ...cloneTask(task),
              subtasks: task.subtasks.filter((sub) => sub.id !== subtaskId).map(cloneSubtask),
              updatedAt,
            }
          : cloneTask(task),
      ),
    },
  };
}
