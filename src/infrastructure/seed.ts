import type { BoardState, ColumnId, Priority, Subtask, Task } from '../domain/index.ts';
import { createBoard } from '../domain/index.ts';

const MS_PER_DAY = 86_400_000;

interface SeedTaskSpec {
  readonly title: string;
  readonly description: string;
  readonly columnId: ColumnId;
  readonly priority: Priority;
  readonly tags: readonly string[];
  readonly dueInDays: number | null;
  readonly subtasks: readonly (readonly [title: string, completed: boolean])[];
}

const SEED_TASK_SPECS: readonly SeedTaskSpec[] = [
  {
    title: 'Diseñar el flujo de bienvenida',
    description: 'Definir los pasos que verá una persona al abrir el tablero por primera vez.',
    columnId: 'todo',
    priority: 'medium',
    tags: ['UI', 'Docs'],
    dueInDays: 10,
    subtasks: [],
  },
  {
    title: 'Documentar la arquitectura por capas',
    description: 'Explicar la separación entre dominio, infraestructura y presentación.',
    columnId: 'todo',
    priority: 'low',
    tags: ['Docs'],
    dueInDays: null,
    subtasks: [],
  },
  {
    title: 'Implementar arrastrar y soltar',
    description: 'Permitir mover tarjetas entre columnas con ratón, teclado y pantalla táctil.',
    columnId: 'in_progress',
    priority: 'high',
    tags: ['Feature', 'UI'],
    dueInDays: 2,
    subtasks: [
      ['Soportar eventos de puntero', true],
      ['Añadir alternativa con teclado', false],
      ['Anunciar el movimiento a lectores de pantalla', false],
    ],
  },
  {
    title: 'Corregir el desbordamiento en columnas largas',
    description: 'Las columnas con muchas tarjetas pierden el desplazamiento vertical.',
    columnId: 'in_progress',
    priority: 'medium',
    tags: ['Bug'],
    dueInDays: -2,
    subtasks: [],
  },
  {
    title: 'Revisar las pruebas del repositorio local',
    description: 'Validar la migración de esquemas y la recuperación ante datos corruptos.',
    columnId: 'in_review',
    priority: 'high',
    tags: ['Testing'],
    dueInDays: 7,
    subtasks: [
      ['Cubrir migraciones desde versiones anteriores', true],
      ['Simular cuota de almacenamiento agotada', false],
    ],
  },
  {
    title: 'Configurar el entorno de desarrollo',
    description: 'Dejar listo el proyecto con TypeScript estricto y pruebas automatizadas.',
    columnId: 'done',
    priority: 'low',
    tags: ['Refactor'],
    dueInDays: -5,
    subtasks: [['Activar el modo estricto', true]],
  },
  {
    title: 'Definir el modelo de dominio del tablero',
    description: 'Modelar columnas, límites WIP, subtareas y fechas límite.',
    columnId: 'done',
    priority: 'medium',
    tags: ['Feature', 'Docs'],
    dueInDays: 14,
    subtasks: [],
  },
];

function formatDueDate(referenceDate: Date, offsetDays: number): string {
  const utcMidnight = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );
  return new Date(utcMidnight + offsetDays * MS_PER_DAY).toISOString().slice(0, 10);
}

function buildSubtasks(
  taskId: string,
  specs: SeedTaskSpec['subtasks'],
): readonly Subtask[] {
  return specs.map(([title, completed], index) => ({
    id: `${taskId}-sub-${index + 1}`,
    title,
    completed,
  }));
}

export function createSeedBoard(referenceDate: Date): BoardState {
  const timestamp = referenceDate.toISOString();
  const orderByColumn = new Map<ColumnId, number>();

  const tasks: readonly Task[] = SEED_TASK_SPECS.map((spec, index) => {
    const id = `seed-${index + 1}`;
    const order = orderByColumn.get(spec.columnId) ?? 0;
    orderByColumn.set(spec.columnId, order + 1);
    return {
      id,
      title: spec.title,
      description: spec.description,
      columnId: spec.columnId,
      order,
      priority: spec.priority,
      tags: spec.tags,
      dueDate: spec.dueInDays === null ? null : formatDueDate(referenceDate, spec.dueInDays),
      subtasks: buildSubtasks(id, spec.subtasks),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  return createBoard(undefined, tasks);
}
