import type { BoardStore } from '../../application/index.ts';
import { PRIORITIES, PRIORITY_LABELS, isValidColumnId, isValidPriority } from '../../domain/index.ts';
import type { ColumnId, Task } from '../../domain/index.ts';
import { appendOptions, htmlToElement, requireElement } from '../utils/dom.ts';
import { NO_TAG, TAG_OPTIONS } from '../utils/tags.ts';

export interface TaskModalHandle {
  element: HTMLElement;
  openCreate: (defaultColumn?: ColumnId) => void;
  openEdit: (task: Task) => void;
  close: () => void;
  isOpen: () => boolean;
}

export interface TaskModalProps {
  store: BoardStore;
  onSaved?: (mode: 'create' | 'edit') => void;
  /** Called when a change was applied in memory but could not be persisted. */
  onWarning?: (message: string) => void;
}

export function createTaskModal({ store, onSaved, onWarning }: TaskModalProps): TaskModalHandle {
  const backdrop = htmlToElement(`
    <div class="modal-backdrop" aria-hidden="true">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div class="modal-header">
          <h2 id="task-modal-title">Nueva tarjeta</h2>
          <button class="btn btn-ghost btn-sm" type="button" data-action="close" aria-label="Cerrar">
            ×
          </button>
        </div>

        <form class="form-grid" novalidate>
          <div class="field">
            <label for="task-title-input">Título *</label>
            <input
              id="task-title-input"
              class="input"
              name="title"
              type="text"
              maxlength="120"
              placeholder="Ej. Ajustar diseño en móvil"
              required
            />
            <span class="field-error" data-role="title-error" hidden></span>
          </div>

          <div class="field">
            <label for="task-desc-input">Descripción</label>
            <textarea
              id="task-desc-input"
              class="textarea"
              name="description"
              rows="3"
              maxlength="400"
              placeholder="Detalles opcionales..."
            ></textarea>
          </div>

          <div class="form-row">
            <div class="field">
              <label for="task-priority-input">Prioridad</label>
              <select id="task-priority-input" class="select" name="priority">
              </select>
            </div>

            <div class="field">
              <label for="task-label-input">Etiqueta</label>
              <select id="task-label-input" class="select" name="label">
              </select>
            </div>
          </div>

          <div class="field">
            <label for="task-column-input">Columna</label>
            <select id="task-column-input" class="select" name="columnId">
            </select>
          </div>

          <div class="modal-actions">
            <button class="btn" type="button" data-action="close">Cancelar</button>
            <button class="btn btn-primary" type="submit" data-role="submit-btn">
              Crear tarjeta
            </button>
          </div>
        </form>
      </div>
    </div>
  `);

  const heading = requireElement<HTMLHeadingElement>(backdrop, '#task-modal-title');
  const form = requireElement<HTMLFormElement>(backdrop, 'form');
  const titleInput = requireElement<HTMLInputElement>(backdrop, '#task-title-input');
  const descInput = requireElement<HTMLTextAreaElement>(backdrop, '#task-desc-input');
  const priorityInput = requireElement<HTMLSelectElement>(backdrop, '#task-priority-input');
  const labelInput = requireElement<HTMLSelectElement>(backdrop, '#task-label-input');
  const columnInput = requireElement<HTMLSelectElement>(backdrop, '#task-column-input');
  const titleError = requireElement<HTMLSpanElement>(backdrop, '[data-role="title-error"]');
  const submitBtn = requireElement<HTMLButtonElement>(backdrop, '[data-role="submit-btn"]');

  appendOptions(
    priorityInput,
    PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
  );
  appendOptions(labelInput, [{ value: NO_TAG, label: 'Sin etiqueta' }, ...TAG_OPTIONS]);
  appendOptions(
    columnInput,
    store.getColumns().map((column) => ({ value: column.id, label: column.title })),
  );

  backdrop.inert = true;

  let editingTask: Task | null = null;

  const setOpen = (open: boolean) => {
    backdrop.classList.toggle('is-open', open);
    backdrop.setAttribute('aria-hidden', String(!open));
    backdrop.inert = !open;
  };

  const clearError = () => {
    titleError.textContent = '';
    titleError.hidden = true;
  };

  const showError = (message: string) => {
    titleError.textContent = message;
    titleError.hidden = false;
  };

  const close = () => {
    setOpen(false);
    editingTask = null;
    clearError();
  };

  const syncTagOption = (tag: string) => {
    // tasks loaded from imports can carry tags outside the suggestion list
    if (tag !== NO_TAG && !Array.from(labelInput.options).some((option) => option.value === tag)) {
      appendOptions(labelInput, [{ value: tag, label: tag }]);
    }
  };

  const openCreate = (defaultColumn: ColumnId = 'todo') => {
    editingTask = null;
    heading.textContent = 'Nueva tarjeta';
    submitBtn.textContent = 'Crear tarjeta';
    form.reset();
    priorityInput.value = 'medium';
    labelInput.value = 'Feature';
    columnInput.value = defaultColumn;
    clearError();
    setOpen(true);
    requestAnimationFrame(() => titleInput.focus());
  };

  const openEdit = (task: Task) => {
    editingTask = task;
    heading.textContent = 'Editar tarjeta';
    submitBtn.textContent = 'Guardar cambios';
    titleInput.value = task.title;
    descInput.value = task.description;
    priorityInput.value = task.priority;
    const primaryTag = task.tags[0] ?? NO_TAG;
    syncTagOption(primaryTag);
    labelInput.value = primaryTag;
    columnInput.value = task.columnId;
    clearError();
    setOpen(true);
    requestAnimationFrame(() => titleInput.focus());
  };

  titleInput.addEventListener('input', clearError);

  backdrop.querySelectorAll('[data-action="close"]').forEach((btn) => {
    btn.addEventListener('click', close);
  });

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const title = titleInput.value.trim();
    if (!title) {
      showError('El título es obligatorio.');
      titleInput.focus();
      return;
    }

    const priority = priorityInput.value;
    const columnId = columnInput.value;
    if (!isValidPriority(priority) || !isValidColumnId(columnId)) return;

    // the select edits the primary tag; any additional tags of the task are preserved
    const selectedTag = labelInput.value;
    const extraTags = (editingTask?.tags ?? []).slice(1).filter((tag) => tag !== selectedTag);
    const tags = selectedTag === NO_TAG ? extraTags : [selectedTag, ...extraTags];

    const payload = {
      title,
      description: descInput.value.trim(),
      priority,
      columnId,
      tags,
    };

    const mode: 'create' | 'edit' = editingTask ? 'edit' : 'create';
    const result = editingTask ? store.updateTask(editingTask.id, payload) : store.addTask(payload);

    if (!result.ok) {
      if (!result.error.applied) {
        showError(result.error.message);
        return;
      }
      close();
      onWarning?.(result.error.message);
      return;
    }

    close();
    onSaved?.(mode);
  });

  return {
    element: backdrop,
    openCreate,
    openEdit,
    close,
    isOpen: () => backdrop.classList.contains('is-open'),
  };
}

export interface ConfirmModalHandle {
  element: HTMLElement;
  open: (options: {
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
  }) => void;
  close: () => void;
  isOpen: () => boolean;
}

export function createConfirmModal(): ConfirmModalHandle {
  const backdrop = htmlToElement(`
    <div class="modal-backdrop" aria-hidden="true">
      <div class="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div class="modal-header">
          <h2 id="confirm-modal-title">Confirmar</h2>
          <button class="btn btn-ghost btn-sm" type="button" data-action="cancel" aria-label="Cerrar">
            ×
          </button>
        </div>
        <p class="modal-message" data-role="message"></p>
        <div class="modal-actions">
          <button class="btn" type="button" data-action="cancel">Cancelar</button>
          <button class="btn btn-danger" type="button" data-action="confirm">Eliminar</button>
        </div>
      </div>
    </div>
  `);

  backdrop.inert = true;

  const titleEl = requireElement<HTMLHeadingElement>(backdrop, '#confirm-modal-title');
  const messageEl = requireElement<HTMLParagraphElement>(backdrop, '[data-role="message"]');
  const confirmBtn = requireElement<HTMLButtonElement>(backdrop, '[data-action="confirm"]');

  let pendingConfirm: (() => void) | null = null;

  const setOpen = (open: boolean) => {
    backdrop.classList.toggle('is-open', open);
    backdrop.setAttribute('aria-hidden', String(!open));
    backdrop.inert = !open;
  };

  const close = () => {
    setOpen(false);
    pendingConfirm = null;
  };

  backdrop.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
    btn.addEventListener('click', close);
  });

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });

  confirmBtn.addEventListener('click', () => {
    const action = pendingConfirm;
    close();
    action?.();
  });

  return {
    element: backdrop,
    open: ({ title, message, confirmText = 'Confirmar', onConfirm }) => {
      titleEl.textContent = title;
      messageEl.textContent = message;
      confirmBtn.textContent = confirmText;
      pendingConfirm = onConfirm;
      setOpen(true);
      requestAnimationFrame(() => confirmBtn.focus());
    },
    close,
    isOpen: () => backdrop.classList.contains('is-open'),
  };
}
