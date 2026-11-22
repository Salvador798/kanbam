export type ColumnId = "todo" | "in-progress" | "in-review" | "done";

export type Priority = "low" | "medium" | "high";

export type TaskLabel = "UI" | "Bug" | "Feature" | "Docs";

export type Theme = "light" | "dark";

export interface ColumnDefinition {
  id: ColumnId;
  title: string;
}

export const COLUMNS: readonly ColumnDefinition[] = [
  { id: "todo", title: "Por hacer" },
  { id: "in-progress", title: "En progreso" },
  { id: "in-review", title: "En revisión" },
  { id: "done", title: "Completado" },
] as const;

export const PRIORITIES: readonly { value: Priority; label: string }[] = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
] as const;

export const LABELS: readonly TaskLabel[] = [
  "UI",
  "Bug",
  "Feature",
  "Docs",
] as const;

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  label: TaskLabel;
  columnId: ColumnId;
  createdAt: number;
}

export interface BoardState {
  version: number;
  tasks: Task[];
  theme: Theme;
}

export interface BoardFilters {
  search: string;
  priority: Priority | "all";
  label: TaskLabel | "all";
}

export type NewTaskInput = Omit<Task, "id" | "createdAt">;
export type UpdateTaskInput = Partial<Omit<Task, "id" | "createdAt">>;
