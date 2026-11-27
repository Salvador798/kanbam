import { createDebounced } from '../../application/index.ts';
import type { BoardStore } from '../../application/index.ts';
import {
  DUE_DATE_STATUS_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  isValidPriority,
} from '../../domain/index.ts';
import { createDisclosure } from '../utils/disclosure.ts';
import { appendOptions, htmlToElement, requireElement } from '../utils/dom.ts';
import { createIcon } from '../utils/icons.ts';
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
const DUE_FILTER_STATUSES = ['on_track', 'due_soon', 'overdue', 'none'] as const;

function isDueFilterStatus(value: string): value is (typeof DUE_FILTER_STATUSES)[number] {
  return (DUE_FILTER_STATUSES as readonly string[]).includes(value);
}

export function Toolbar({
  store,
  onNewTask,
  onRequestResetDemo,
  onNotify,
}: ToolbarProps): ToolbarHandle {
  const header = htmlToElement(`
    <header class="toolbar">
      <div class="toolbar-brand">
        <h1>Kanbam</h1>
      </div>

      <button class="btn btn-primary toolbar-new" type="button" data-action="new-task" title="Atajo: tecla N">
        Nueva tarjeta
      </button>

      <div class="disclosure toolbar-menu" data-role="menu-root">
        <button class="btn btn-ghost btn-icon" type="button" data-role="menu-trigger" aria-label="Más opciones" title="Más opciones"></button>
        <div class="disclosure-panel menu-panel" id="more-menu" role="group" aria-label="Más opciones">
          <button class="btn btn-ghost menu-item" type="button" data-action="export">Exportar</button>
          <button class="btn btn-ghost menu-item" type="button" data-action="import">Importar</button>
          <button class="btn btn-ghost menu-item" type="button" data-action="reset-demo">Restaurar demo</button>
          <button class="btn btn-ghost menu-item" type="button" data-action="theme">Tema oscuro</button>
          <input type="file" accept=".json,application/json" data-role="import-file" hidden />
        </div>
      </div>

      <div class="toolbar-search">
        <input
          class="input search-input"
          type="search"
          data-role="search"
          placeholder="Buscar tarjetas"
          aria-label="Buscar tarjetas por título o descripción"
        />
      </div>

      <div class="disclosure toolbar-filters" data-role="filters-root">
        <button class="btn btn-outline" type="button" data-role="filters-trigger">
          <span>Filtros</span>
          <span class="filter-count" data-role="filter-count" aria-hidden="true" hidden></span>
        </button>
        <div class="disclosure-panel filters-panel" id="filters-panel" role="group" aria-label="Filtros">
          <select class="select" data-role="priority" aria-label="Filtrar por prioridad">
            <option value="all">Prioridad: todas</option>
          </select>
          <select class="select" data-role="label" aria-label="Filtrar por etiqueta">
            <option value="all">Etiqueta: todas</option>
          </select>
          <select class="select" data-role="due" aria-label="Filtrar por fecha límite">
            <option value="all">Fecha límite: todas</option>
          </select>
          <button class="btn btn-ghost btn-sm" type="button" data-action="clear-filters" hidden>
            Limpiar filtros
          </button>
        </div>
      </div>

      <div class="toolbar-history" role="group" aria-label="Historial de cambios">
        <button class="btn btn-ghost btn-icon" type="button" data-action="undo" aria-label="Deshacer" title="Deshacer (Ctrl+Z)" disabled></button>
        <button class="btn btn-ghost btn-icon" type="button" data-action="redo" aria-label="Rehacer" title="Rehacer (Ctrl+Y)" disabled></button>
      </div>
    </header>
  `);

  const searchInput = requireElement<HTMLInputElement>(header, '[data-role="search"]');
  const prioritySelect = requireElement<HTMLSelectElement>(header, '[data-role="priority"]');
  const labelSelect = requireElement<HTMLSelectElement>(header, '[data-role="label"]');
  const dueSelect = requireElement<HTMLSelectElement>(header, '[data-role="due"]');
  const clearFiltersBtn = requireElement<HTMLButtonElement>(header, '[data-action="clear-filters"]');
  const filtersRoot = requireElement<HTMLElement>(header, '[data-role="filters-root"]');
  const filtersTrigger = requireElement<HTMLButtonElement>(header, '[data-role="filters-trigger"]');
  const filtersPanel = requireElement<HTMLElement>(header, '#filters-panel');
  const filterCount = requireElement<HTMLElement>(header, '[data-role="filter-count"]');
  const menuRoot = requireElement<HTMLElement>(header, '[data-role="menu-root"]');
  const menuTrigger = requireElement<HTMLButtonElement>(header, '[data-role="menu-trigger"]');
  const menuPanel = requireElement<HTMLElement>(header, '#more-menu');
  const newTaskBtn = requireElement<HTMLButtonElement>(header, '[data-action="new-task"]');
  const undoBtn = requireElement<HTMLButtonElement>(header, '[data-action="undo"]');
  const redoBtn = requireElement<HTMLButtonElement>(header, '[data-action="redo"]');
  const exportBtn = requireElement<HTMLButtonElement>(header, '[data-action="export"]');
  const importBtn = requireElement<HTMLButtonElement>(header, '[data-action="import"]');
  const importInput = requireElement<HTMLInputElement>(header, '[data-role="import-file"]');
  const resetDemoBtn = requireElement<HTMLButtonElement>(header, '[data-action="reset-demo"]');
  const themeBtn = requireElement<HTMLButtonElement>(header, '[data-action="theme"]');

  undoBtn.append(createIcon('undo'));
  redoBtn.append(createIcon('redo'));
  menuTrigger.append(createIcon('more'));

  createDisclosure(filtersRoot, filtersTrigger, filtersPanel);
  const menu = createDisclosure(menuRoot, menuTrigger, menuPanel);

  /** Menu actions close the menu first so focus is back on the trigger before dialogs open. */
  const fromMenu = (action: () => void) => () => {
    menu.close(true);
    action();
  };

  appendOptions(
    prioritySelect,
    PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
  );
  appendOptions(labelSelect, TAG_OPTIONS);
  appendOptions(
    dueSelect,
    DUE_FILTER_STATUSES.map((value) => ({ value, label: DUE_DATE_STATUS_LABELS[value] })),
  );

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

  dueSelect.addEventListener('change', () => {
    const value = dueSelect.value;
    store.setFilters({ dueStatus: isDueFilterStatus(value) ? value : 'all' });
  });

  clearFiltersBtn.addEventListener('click', () => {
    pushSearch.cancel();
    searchInput.value = '';
    pushedSearch = '';
    store.clearFilters();
    // the clear button hides itself once filters are gone: keep focus inside the panel
    prioritySelect.focus();
  });

  const runHistory = (action: () => ReturnType<BoardStore['undo']>): void => {
    const result = action();
    if (!result.ok) onNotify(result.error.message, 'error');
  };

  undoBtn.addEventListener('click', () => runHistory(() => store.undo()));
  redoBtn.addEventListener('click', () => runHistory(() => store.redo()));

  newTaskBtn.addEventListener('click', onNewTask);
  resetDemoBtn.addEventListener('click', fromMenu(onRequestResetDemo));
  themeBtn.addEventListener('click', fromMenu(() => store.toggleTheme()));

  exportBtn.addEventListener('click', fromMenu(() => {
    const json = store.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `kanbam-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();

    URL.revokeObjectURL(url);
    onNotify('Tablero exportado a JSON.', 'success');
  }));

  importBtn.addEventListener('click', fromMenu(() => importInput.click()));

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
    dueSelect.value = filters.dueStatus;

    undoBtn.disabled = !store.canUndo();
    redoBtn.disabled = !store.canRedo();
    clearFiltersBtn.hidden = !store.hasActiveFilters();
    const activeCount = [filters.priority, filters.tag, filters.dueStatus].filter(
      (value) => value !== 'all',
    ).length;
    filterCount.hidden = activeCount === 0;
    filterCount.textContent = String(activeCount);
    filtersTrigger.setAttribute(
      'aria-label',
      activeCount === 0
        ? 'Filtros'
        : `Filtros, ${activeCount} ${activeCount === 1 ? 'activo' : 'activos'}`,
    );
    themeBtn.textContent = theme === 'dark' ? 'Tema claro' : 'Tema oscuro';
  };

  sync();

  return { element: header, sync };
}
