import { createDebounced } from '../../application/index.ts';
import type { BoardStore } from '../../application/index.ts';
import { PRIORITIES, PRIORITY_LABELS, isValidPriority } from '../../domain/index.ts';
import { appendOptions, htmlToElement, requireElement } from '../utils/dom.ts';
import { TAG_OPTIONS } from '../utils/tags.ts';
import type { ToastType } from './Toast.ts';

export interface ToolbarProps {
  store: BoardStore;
  onNewTask: () => void;
  onRequestResetDemo: () => void;
  onNotify: (message: string, type?: ToastType) => void;
}

export interface ToolbarHandle {
  element: HTMLElement;
  sync: () => void;
}

const SEARCH_DEBOUNCE_MS = 250;

export function Toolbar({
  store,
  onNewTask,
  onRequestResetDemo,
  onNotify,
}: ToolbarProps): ToolbarHandle {
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
        </select>
        <select class="select" data-role="label" aria-label="Filtrar por etiqueta">
          <option value="all">Etiqueta: Todas</option>
        </select>
        <button class="btn btn-ghost btn-sm" type="button" data-action="clear-filters" hidden>
          Limpiar filtros
        </button>
      </div>

      <div class="toolbar-actions">
        <button class="btn btn-primary" type="button" data-action="new-task" title="Atajo: tecla N">
          + Nueva tarjeta
        </button>
        <button class="btn" type="button" data-action="undo" disabled>Deshacer</button>
        <button class="btn" type="button" data-action="redo" disabled>Rehacer</button>
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

  const searchInput = requireElement<HTMLInputElement>(header, '[data-role="search"]');
  const prioritySelect = requireElement<HTMLSelectElement>(header, '[data-role="priority"]');
  const labelSelect = requireElement<HTMLSelectElement>(header, '[data-role="label"]');
  const clearFiltersBtn = requireElement<HTMLButtonElement>(header, '[data-action="clear-filters"]');
  const newTaskBtn = requireElement<HTMLButtonElement>(header, '[data-action="new-task"]');
  const undoBtn = requireElement<HTMLButtonElement>(header, '[data-action="undo"]');
  const redoBtn = requireElement<HTMLButtonElement>(header, '[data-action="redo"]');
  const exportBtn = requireElement<HTMLButtonElement>(header, '[data-action="export"]');
  const importBtn = requireElement<HTMLButtonElement>(header, '[data-action="import"]');
  const importInput = requireElement<HTMLInputElement>(header, '[data-role="import-file"]');
  const resetDemoBtn = requireElement<HTMLButtonElement>(header, '[data-action="reset-demo"]');
  const themeBtn = requireElement<HTMLButtonElement>(header, '[data-action="theme"]');

  appendOptions(
    prioritySelect,
    PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
  );
  appendOptions(labelSelect, TAG_OPTIONS);

  // value last pushed to the store: lets `sync` tell typing apart from an external change
  let pushedSearch = '';
  const pushSearch = createDebounced((value: string) => {
    pushedSearch = value;
    store.setFilters({ search: value });
  }, SEARCH_DEBOUNCE_MS);

  searchInput.addEventListener('input', () => pushSearch(searchInput.value));

  prioritySelect.addEventListener('change', () => {
    const value = prioritySelect.value;
    store.setFilters({ priority: isValidPriority(value) ? value : 'all' });
  });

  labelSelect.addEventListener('change', () => {
    store.setFilters({ tag: labelSelect.value });
  });

  clearFiltersBtn.addEventListener('click', () => {
    pushSearch.cancel();
    searchInput.value = '';
    pushedSearch = '';
    store.clearFilters();
  });

  const runHistory = (action: () => ReturnType<BoardStore['undo']>): void => {
    const result = action();
    if (!result.ok) onNotify(result.error.message, 'error');
  };

  undoBtn.addEventListener('click', () => runHistory(() => store.undo()));
  redoBtn.addEventListener('click', () => runHistory(() => store.redo()));

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
      if (imported.ok) {
        onNotify('Tablero importado.', 'success');
      } else {
        onNotify(imported.error.message, 'error');
      }
    } catch {
      onNotify('No se pudo leer el archivo.', 'error');
    } finally {
      importInput.value = '';
    }
  });

  const sync = () => {
    const filters = store.getFilters();
    const theme = store.getTheme();

    if (filters.search !== pushedSearch) {
      pushSearch.cancel();
      pushedSearch = filters.search;
      searchInput.value = filters.search;
    }
    prioritySelect.value = filters.priority;
    labelSelect.value = filters.tag;

    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
    clearFiltersBtn.hidden = !store.hasActiveFilters();
    themeBtn.textContent = theme === 'dark' ? 'Tema claro' : 'Tema oscuro';
  };

  sync();

  return { element: header, sync };
}
