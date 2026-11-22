import { store } from '../core/store.ts';
import { LABELS, PRIORITIES, type Priority, type TaskLabel } from '../core/types.ts';
import { escapeHtml, htmlToElement } from '../utils/dom.ts';
import type { ToastType } from './Toast.ts';

export interface ToolbarProps {
  onNewTask: () => void;
  onRequestResetDemo: () => void;
  onNotify: (message: string, type?: ToastType) => void;
}

export interface ToolbarHandle {
  element: HTMLElement;
  sync: () => void;
}

export function Toolbar({
  onNewTask,
  onRequestResetDemo,
  onNotify,
}: ToolbarProps): ToolbarHandle {
  const priorityOptions = PRIORITIES.map(
    (p) => `<option value="${p.value}">${escapeHtml(p.label)}</option>`,
  ).join('');

  const labelOptions = LABELS.map(
    (l) => `<option value="${l}">${escapeHtml(l)}</option>`,
  ).join('');

  const header = htmlToElement(`
    <header class="toolbar">
      <div class="toolbar-brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <h1>Kanbam</h1>
      </div>

      <div class="toolbar-filters">
        <input
          class="input search-input"
          type="search"
          data-role="search"
          placeholder="Buscar por título o descripción..."
          aria-label="Buscar tareas"
        />
        <select class="select" data-role="priority" aria-label="Filtrar por prioridad">
          <option value="all">Prioridad: Todas</option>
          ${priorityOptions}
        </select>
        <select class="select" data-role="label" aria-label="Filtrar por etiqueta">
          <option value="all">Etiqueta: Todas</option>
          ${labelOptions}
        </select>
        <button class="btn btn-ghost btn-sm" type="button" data-action="clear-filters" hidden>
          Limpiar filtros
        </button>
      </div>

      <div class="toolbar-actions">
        <button class="btn btn-primary" type="button" data-action="new-task" title="Atajo: tecla N">
          + Nueva tarjeta
        </button>
        <button class="btn" type="button" data-action="export">Exportar</button>
        <button class="btn" type="button" data-action="import">Importar</button>
        <button class="btn" type="button" data-action="reset-demo">Restaurar demo</button>
        <button class="btn" type="button" data-action="theme" aria-label="Cambiar tema">
          Tema oscuro
        </button>
        <input type="file" accept=".json,application/json" data-role="import-file" hidden />
      </div>
    </header>
  `);

  const searchInput = header.querySelector<HTMLInputElement>('[data-role="search"]')!;
  const prioritySelect = header.querySelector<HTMLSelectElement>('[data-role="priority"]')!;
  const labelSelect = header.querySelector<HTMLSelectElement>('[data-role="label"]')!;
  const clearFiltersBtn = header.querySelector<HTMLButtonElement>('[data-action="clear-filters"]')!;
  const newTaskBtn = header.querySelector<HTMLButtonElement>('[data-action="new-task"]')!;
  const exportBtn = header.querySelector<HTMLButtonElement>('[data-action="export"]')!;
  const importBtn = header.querySelector<HTMLButtonElement>('[data-action="import"]')!;
  const importInput = header.querySelector<HTMLInputElement>('[data-role="import-file"]')!;
  const resetDemoBtn = header.querySelector<HTMLButtonElement>('[data-action="reset-demo"]')!;
  const themeBtn = header.querySelector<HTMLButtonElement>('[data-action="theme"]')!;

  searchInput.addEventListener('input', () => {
    store.setFilters({ search: searchInput.value });
  });

  prioritySelect.addEventListener('change', () => {
    store.setFilters({ priority: prioritySelect.value as Priority | 'all' });
  });

  labelSelect.addEventListener('change', () => {
    store.setFilters({ label: labelSelect.value as TaskLabel | 'all' });
  });

  clearFiltersBtn.addEventListener('click', () => {
    store.clearFilters();
  });

  newTaskBtn.addEventListener('click', onNewTask);
  resetDemoBtn.addEventListener('click', onRequestResetDemo);
  themeBtn.addEventListener('click', () => store.toggleTheme());

  exportBtn.addEventListener('click', () => {
    const json = store.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `kanbam-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();

    URL.revokeObjectURL(url);
    onNotify('Tablero exportado a JSON.', 'success');
  });

  importBtn.addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = store.importJson(text);
      if (imported) {
        onNotify('Tablero importado.', 'success');
      } else {
        onNotify('El archivo JSON no tiene un formato válido.', 'error');
      }
    } catch {
      onNotify('No se pudo leer el archivo.', 'error');
    } finally {
      importInput.value = '';
    }
  });

  const sync = () => {
    const filters = store.getFilters();
    const theme = store.getState().theme;

    if (searchInput.value !== filters.search) searchInput.value = filters.search;
    prioritySelect.value = filters.priority;
    labelSelect.value = filters.label;

    clearFiltersBtn.hidden = !store.hasActiveFilters();
    themeBtn.textContent = theme === 'dark' ? 'Tema claro' : 'Tema oscuro';
  };

  sync();

  return { element: header, sync };
}
