import {
  COLUMNS,
  LABELS,
  PRIORITIES,
  type BoardState,
  type ColumnId,
  type Priority,
  type Task,
  type TaskLabel,
  type Theme,
} from './types.ts';

const STORAGE_KEY = 'kanbam_board_v1';
export const CURRENT_BOARD_VERSION = 1;

const VALID_COLUMN_IDS: readonly string[] = COLUMNS.map((col) => col.id);
const VALID_PRIORITIES: readonly string[] = PRIORITIES.map((p) => p.value);
const VALID_LABELS: readonly string[] = [...LABELS];

const SEED_TASKS: readonly Task[] = [
  {
    id: 'seed-1',
    title: 'Armar estructura base del proyecto',
    description: 'Configurar Vite, TypeScript estricto y carpetas iniciales.',
    priority: 'high',
    label: 'Feature',
    columnId: 'done',
    createdAt: Date.now() - 1000 * 60 * 60 * 48,
  },
  {
    id: 'seed-2',
    title: 'Definir colores para modo claro y oscuro',
    description: 'Revisar contraste de textos, bordes y botones en ambos temas.',
    priority: 'medium',
    label: 'UI',
    columnId: 'done',
    createdAt: Date.now() - 1000 * 60 * 60 * 36,
  },
  {
    id: 'seed-3',
    title: 'Mover tarjetas arrastrando entre columnas',
    description: 'Permitir arrastrar a otra columna y reordenar en la misma.',
    priority: 'high',
    label: 'Feature',
    columnId: 'in-progress',
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    id: 'seed-4',
    title: 'Arreglar textos largos en pantallas pequeñas',
    description: 'Evitar que títulos sin espacios rompan el ancho de la tarjeta.',
    priority: 'low',
    label: 'Bug',
    columnId: 'in-review',
    createdAt: Date.now() - 1000 * 60 * 60 * 12,
  },
  {
    id: 'seed-5',
    title: 'Probar filtros combinados',
    description: 'Verificar buscador junto con prioridad y etiqueta.',
    priority: 'medium',
    label: 'Feature',
    columnId: 'todo',
    createdAt: Date.now() - 1000 * 60 * 60 * 6,
  },
  {
    id: 'seed-6',
    title: 'Validar archivo al importar respaldo',
    description: 'Mostrar aviso si el JSON subido no coincide con el formato esperado.',
    priority: 'medium',
    label: 'Bug',
    columnId: 'todo',
    createdAt: Date.now() - 1000 * 60 * 60 * 3,
  },
  {
    id: 'seed-7',
    title: 'Actualizar instrucciones del README',
    description: 'Agregar pasos de instalación y link de la demo desplegada.',
    priority: 'low',
    label: 'Docs',
    columnId: 'todo',
    createdAt: Date.now() - 1000 * 60 * 60,
  },
];

export function createDemoState(theme: Theme = 'light'): BoardState {
  return {
    version: CURRENT_BOARD_VERSION,
    tasks: SEED_TASKS.map((task) => ({ ...task })),
    theme,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isColumnId(value: unknown): value is ColumnId {
  return typeof value === 'string' && VALID_COLUMN_IDS.includes(value);
}

function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && VALID_PRIORITIES.includes(value);
}

function isTaskLabel(value: unknown): value is TaskLabel {
  return typeof value === 'string' && VALID_LABELS.includes(value);
}

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

function isValidTask(value: unknown): value is Task {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    value.id.trim().length > 0 &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    typeof value.description === 'string' &&
    isPriority(value.priority) &&
    isTaskLabel(value.label) &&
    isColumnId(value.columnId) &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt)
  );
}

export function isValidBoardState(value: unknown): value is BoardState {
  if (!isRecord(value)) return false;

  return (
    value.version === CURRENT_BOARD_VERSION &&
    isTheme(value.theme) &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isValidTask)
  );
}

export function loadBoardState(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createDemoState();
      saveBoardState(initial);
      return initial;
    }

    const parsed: unknown = JSON.parse(raw);
    if (isValidBoardState(parsed)) {
      return parsed;
    }

    // si lo guardado no sirve, volvemos al demo
    const fallback = createDemoState();
    saveBoardState(fallback);
    return fallback;
  } catch {
    return createDemoState();
  }
}

export function saveBoardState(state: BoardState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // puede fallar si el storage esta lleno o bloqueado
  }
}

export function resetDemoState(currentTheme: Theme = 'light'): BoardState {
  const demo = createDemoState(currentTheme);
  saveBoardState(demo);
  return demo;
}
