import { store } from '../core/store.ts';
import {
  COLUMNS,
  LABELS,
  PRIORITIES,
  type ColumnId,
  type Priority,
  type Task,
  type TaskLabel,
} from '../core/types.ts';
import { escapeHtml, htmlToElement } from '../utils/dom.ts';

export interface TaskModalHandle {
  element: HTMLElement;
  openCreate: (defaultColumn?: ColumnId) => void;
  openEdit: (task: Task) => void;
  close: () => void;
  isOpen: () => boolean;
}

export function createTaskModal(onSaved?: (mode: 'create' | 'edit') => void): TaskModalHandle {
  const priorityOptions = PRIORITIES.map(
    (p) => `<option value="${p.value}">${escapeHtml(p.label)}</option>`,
  ).join('');

  const labelOptions = LABELS.map(
    (l) => `<option value="${l}">${escapeHtml(l)}</option>`,
  ).join('');

  const columnOptions = COLUMNS.map(
    (c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`,
  ).join('');

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
                ${priorityOptions}
              </select>
            </div>

            <div class="field">
              <label for="task-label-input">Etiqueta</label>
              <select id="task-label-input" class="select" name="label">
                ${labelOptions}
              </select>
            </div>
          </div>

          <div class="field">
            <label for="task-column-input">Columna</label>
            <select id="task-column-input" class="select" name="columnId">
              ${columnOptions}
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

  const heading = backdrop.querySelector<HTMLHeadingElement>('#task-modal-title')!;
  const form = backdrop.querySelector<HTMLFormElement>('form')!;
  const titleInput = backdrop.querySelector<HTMLInputElement>('#task-title-input')!;
  const descInput = backdrop.querySelector<HTMLTextAreaElement>('#task-desc-input')!;
  const priorityInput = backdrop.querySelector<HTMLSelectElement>('#task-priority-input')!;
  const labelInput = backdrop.querySelector<HTMLSelectElement>('#task-label-input')!;
  const columnInput = backdrop.querySelector<HTMLSelectElement>('#task-column-input')!;
  const titleError = backdrop.querySelector<HTMLSpanElement>('[data-role="title-error"]')!;
  const submitBtn = backdrop.querySelector<HTMLButtonElement>('[data-role="submit-btn"]')!;

  backdrop.inert = true;

  let editingTaskId: string | null = null;

  const setOpen = (open: boolean) => {
    backdrop.classList.toggle('is-open', open);
    backdrop.setAttribute('aria-hidden', String(!open));
    backdrop.inert = !open;
  };

  const clearError = () => {
    titleError.textContent = '';
    titleError.hidden = true;
  };

  const close = () => {
    setOpen(false);
    editingTaskId = null;
    clearError();
  };

  const openCreate = (defaultColumn: ColumnId = 'todo') => {
    editingTaskId = null;
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
    editingTaskId = task.id;
    heading.textContent = 'Editar tarjeta';
    submitBtn.textContent = 'Guardar cambios';
    titleInput.value = task.title;
    descInput.value = task.description;
    priorityInput.value = task.priority;
    labelInput.value = task.label;
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
      titleError.textContent = 'El título es obligatorio.';
      titleError.hidden = false;
      titleInput.focus();
      return;
    }

    const payload = {
      title,
      description: descInput.value.trim(),
      priority: priorityInput.value as Priority,
      label: labelInput.value as TaskLabel,
      columnId: columnInput.value as ColumnId,
    };

    const mode: 'create' | 'edit' = editingTaskId ? 'edit' : 'create';

    if (editingTaskId) {
      store.updateTask(editingTaskId, payload);
    } else {
      store.addTask(payload);
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

  const titleEl = backdrop.querySelector<HTMLHeadingElement>('#confirm-modal-title')!;
  const messageEl = backdrop.querySelector<HTMLParagraphElement>('[data-role="message"]')!;
  const confirmBtn = backdrop.querySelector<HTMLButtonElement>('[data-action="confirm"]')!;

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
