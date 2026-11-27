import type { BoardStore, StoreResult } from '../../application/index.ts';
import {
  DEFAULT_TAG_SUGGESTIONS,
  DESCRIPTION_MAX_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
  SUBTASK_TITLE_MAX_LENGTH,
  TAG_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  isValidColumnId,
  isValidPriority,
  validateDescription,
  validateDueDate,
  validateSubtaskTitle,
  validateTags,
  validateTaskTitle,
} from '../../domain/index.ts';
import type { ColumnId, Subtask, Task } from '../../domain/index.ts';
import { appendOptions, el, htmlToElement, requireElement, setFieldError } from '../utils/dom.ts';
import { rememberFocus } from '../utils/focus.ts';
import { addTagsFromText, removeTag } from '../view-model.ts';

export interface TaskModalHandle {
  element: HTMLDialogElement;
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

interface DraftSubtask {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

type FieldName = 'title' | 'description' | 'tags' | 'dueDate' | 'subtasks';

const TEMPLATE = `
  <dialog class="dialog task-dialog" aria-labelledby="task-dialog-title">
    <form class="dialog-form" novalidate>
      <div class="dialog-header">
        <h2 id="task-dialog-title">Nueva tarjeta</h2>
        <button class="btn btn-ghost btn-sm" type="button" data-action="close" aria-label="Cerrar">×</button>
      </div>

      <div class="dialog-body">
        <p class="form-error" id="task-form-error" role="alert" hidden></p>

        <div class="field">
          <label for="task-title-input">Título <span aria-hidden="true">*</span></label>
          <input id="task-title-input" class="input" name="title" type="text" autocomplete="off"
            required aria-required="true" placeholder="Ej. Ajustar diseño en móvil" />
          <span class="field-error" id="task-title-error" hidden></span>
        </div>

        <div class="field">
          <label for="task-desc-input">Descripción</label>
          <textarea id="task-desc-input" class="textarea" name="description" rows="3"
            placeholder="Detalles opcionales..."></textarea>
          <span class="field-error" id="task-desc-error" hidden></span>
        </div>

        <div class="form-row">
          <div class="field">
            <label for="task-priority-input">Prioridad</label>
            <select id="task-priority-input" class="select" name="priority"></select>
          </div>
          <div class="field">
            <label for="task-column-input">Columna</label>
            <select id="task-column-input" class="select" name="columnId"></select>
          </div>
        </div>

        <div class="field">
          <label for="task-due-input">Fecha límite (opcional)</label>
          <input id="task-due-input" class="input" name="dueDate" type="date" />
          <span class="field-error" id="task-due-error" hidden></span>
        </div>

        <div class="field" role="group" aria-labelledby="task-tags-label">
          <span class="field-label" id="task-tags-label">Etiquetas</span>
          <ul class="chip-list" data-role="chips" aria-label="Etiquetas seleccionadas"></ul>
          <div class="tag-entry">
            <input id="task-tag-input" class="input" type="text" autocomplete="off"
              maxlength="${TAG_MAX_LENGTH}" aria-label="Nueva etiqueta"
              placeholder="Escribe una etiqueta y pulsa Enter" />
            <button class="btn btn-sm" type="button" data-action="add-tag">Añadir</button>
          </div>
          <div class="tag-suggestions" role="group" aria-label="Etiquetas sugeridas" data-role="suggestions"></div>
          <span class="field-error" id="task-tags-error" hidden></span>
        </div>

        <fieldset class="field subtasks">
          <legend>Subtareas <span data-role="subtask-count"></span></legend>
          <ul class="subtask-list" data-role="subtasks"></ul>
          <div class="tag-entry">
            <input id="task-subtask-input" class="input" type="text" autocomplete="off"
              maxlength="${SUBTASK_TITLE_MAX_LENGTH}" aria-label="Nueva subtarea"
              placeholder="Añadir subtarea y pulsar Enter" />
            <button class="btn btn-sm" type="button" data-action="add-subtask">Añadir</button>
          </div>
          <span class="field-hint" data-role="subtask-hint" hidden>
            En una tarjeta existente, los cambios en subtareas se guardan al instante.
          </span>
          <span class="field-error" id="task-subtasks-error" hidden></span>
        </fieldset>
      </div>

      <div class="dialog-actions">
        <button class="btn" type="button" data-action="close">Cancelar</button>
        <button class="btn btn-primary" type="submit" data-role="submit-btn">Crear tarjeta</button>
      </div>
    </form>
  </dialog>
`;

export function createTaskModal({ store, onSaved, onWarning }: TaskModalProps): TaskModalHandle {
  const dialog = htmlToElement<HTMLDialogElement>(TEMPLATE);
  const query = <T extends Element>(selector: string): T => requireElement<T>(dialog, selector);

  const heading = query<HTMLHeadingElement>('#task-dialog-title');
  const form = query<HTMLFormElement>('form');
  const formError = query<HTMLParagraphElement>('#task-form-error');
  const titleInput = query<HTMLInputElement>('#task-title-input');
  const descInput = query<HTMLTextAreaElement>('#task-desc-input');
  const priorityInput = query<HTMLSelectElement>('#task-priority-input');
  const columnInput = query<HTMLSelectElement>('#task-column-input');
  const dueInput = query<HTMLInputElement>('#task-due-input');
  const tagInput = query<HTMLInputElement>('#task-tag-input');
  const chipList = query<HTMLUListElement>('[data-role="chips"]');
  const suggestions = query<HTMLDivElement>('[data-role="suggestions"]');
  const subtaskList = query<HTMLUListElement>('[data-role="subtasks"]');
  const subtaskInput = query<HTMLInputElement>('#task-subtask-input');
  const subtaskCount = query<HTMLSpanElement>('[data-role="subtask-count"]');
  const subtaskHint = query<HTMLSpanElement>('[data-role="subtask-hint"]');
  const submitBtn = query<HTMLButtonElement>('[data-role="submit-btn"]');

  const fields: Record<FieldName, { control: HTMLElement; error: HTMLElement }> = {
    title: { control: titleInput, error: query('#task-title-error') },
    description: { control: descInput, error: query('#task-desc-error') },
    tags: { control: tagInput, error: query('#task-tags-error') },
    dueDate: { control: dueInput, error: query('#task-due-error') },
    subtasks: { control: subtaskInput, error: query('#task-subtasks-error') },
  };

  titleInput.maxLength = TITLE_MAX_LENGTH;
  descInput.maxLength = DESCRIPTION_MAX_LENGTH;
  appendOptions(
    priorityInput,
    PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
  );
  appendOptions(
    columnInput,
    store.getColumns().map((column) => ({ value: column.id, label: column.title })),
  );

  let editingTaskId: string | null = null;
  let tags: readonly string[] = [];
  let draftSubtasks: readonly DraftSubtask[] = [];
  let draftSeq = 0;
  let restoreFocus: (() => void) | null = null;

  const setError = (field: FieldName, message: string | null) =>
    setFieldError(fields[field].control, fields[field].error, message);

  const setFormError = (message: string | null) => {
    formError.textContent = message ?? '';
    formError.hidden = message === null;
  };

  const clearErrors = () => {
    (Object.keys(fields) as FieldName[]).forEach((field) => setError(field, null));
    setFormError(null);
  };

  /** Returns an error message to display, or null when applied (warning when not persisted). */
  const outcome = (result: StoreResult): string | null => {
    if (result.ok) return null;
    if (result.error.applied) {
      onWarning?.(result.error.message);
      return null;
    }
    return result.error.message;
  };

  // ---- tags ----------------------------------------------------------------------------

  const renderTags = () => {
    chipList.replaceChildren(
      ...tags.map((tag) => {
        const remove = el('button', {
          className: 'chip-remove',
          text: '×',
          attrs: { type: 'button', 'aria-label': `Quitar etiqueta ${tag}` },
        });
        remove.addEventListener('click', () => {
          tags = removeTag(tags, tag);
          setError('tags', null);
          renderTags();
          tagInput.focus();
        });
        return el(
          'li',
          { className: 'chip' },
          el('span', { text: tag }),
          remove,
        );
      }),
    );

    const lowered = tags.map((tag) => tag.toLowerCase());
    suggestions.replaceChildren(
      ...DEFAULT_TAG_SUGGESTIONS.filter((tag) => !lowered.includes(tag.toLowerCase())).map(
        (tag) => {
          const button = el('button', {
            className: 'btn btn-ghost btn-sm suggestion',
            text: `+ ${tag}`,
            attrs: { type: 'button', 'aria-label': `Añadir etiqueta ${tag}` },
          });
          button.addEventListener('click', () => commitTags(tag));
          return button;
        },
      ),
    );
  };

  const commitTags = (raw: string): boolean => {
    const parsed = addTagsFromText(tags, raw);
    if (parsed.error !== null) {
      setError('tags', parsed.error);
      return false;
    }
    setError('tags', null);
    tags = parsed.tags;
    renderTags();
    return true;
  };

  const commitTagInput = () => {
    if (tagInput.value.trim() === '') return;
    if (commitTags(tagInput.value)) tagInput.value = '';
  };

  tagInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitTagInput();
    }
  });
  query('[data-action="add-tag"]').addEventListener('click', () => {
    commitTagInput();
    tagInput.focus();
  });

  // ---- subtasks ------------------------------------------------------------------------

  const currentSubtasks = (): readonly Subtask[] => {
    if (editingTaskId === null) return draftSubtasks;
    return store.getBoard().tasks.find((task) => task.id === editingTaskId)?.subtasks ?? [];
  };

  const addSubtask = (title: string): string | null => {
    if (editingTaskId !== null) return outcome(store.addSubtask(editingTaskId, title));
    const valid = validateSubtaskTitle(title);
    if (!valid.ok) return valid.error.message;
    draftSeq += 1;
    draftSubtasks = [
      ...draftSubtasks,
      { id: `draft-${draftSeq}`, title: valid.value, completed: false },
    ];
    return null;
  };

  const toggleSubtask = (id: string): string | null => {
    if (editingTaskId !== null) return outcome(store.toggleSubtask(editingTaskId, id));
    draftSubtasks = draftSubtasks.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s));
    return null;
  };

  const renameSubtask = (id: string, title: string): string | null => {
    if (editingTaskId !== null) return outcome(store.renameSubtask(editingTaskId, id, title));
    const valid = validateSubtaskTitle(title);
    if (!valid.ok) return valid.error.message;
    draftSubtasks = draftSubtasks.map((s) => (s.id === id ? { ...s, title: valid.value } : s));
    return null;
  };

  const removeSubtask = (id: string): string | null => {
    if (editingTaskId !== null) return outcome(store.removeSubtask(editingTaskId, id));
    draftSubtasks = draftSubtasks.filter((s) => s.id !== id);
    return null;
  };

  const updateSubtaskCount = () => {
    const subtasks = currentSubtasks();
    const done = subtasks.filter((s) => s.completed).length;
    subtaskCount.textContent = subtasks.length === 0 ? '' : `(${done}/${subtasks.length})`;
  };

  const renderSubtasks = () => {
    subtaskList.replaceChildren(
      ...currentSubtasks().map((subtask) => {
        const row = el('li', { className: 'subtask-row' });
        const checkbox = el('input', {
          attrs: { type: 'checkbox', 'aria-label': `Completar subtarea: ${subtask.title}` },
        });
        checkbox.checked = subtask.completed;
        row.classList.toggle('is-done', subtask.completed);

        const titleField = el('input', {
          className: 'input subtask-title',
          attrs: {
            type: 'text',
            'aria-label': 'Título de la subtarea',
            maxlength: String(SUBTASK_TITLE_MAX_LENGTH),
          },
        });
        titleField.value = subtask.title;

        const remove = el('button', {
          className: 'btn btn-ghost btn-sm',
          text: 'Quitar',
          attrs: { type: 'button', 'aria-label': `Quitar subtarea: ${subtask.title}` },
        });

        checkbox.addEventListener('change', () => {
          const error = toggleSubtask(subtask.id);
          setError('subtasks', error);
          if (error !== null) checkbox.checked = !checkbox.checked;
          row.classList.toggle('is-done', checkbox.checked);
          updateSubtaskCount();
        });

        // committed on `change` without re-rendering, so a click on "Quitar" is never lost
        titleField.addEventListener('change', () => {
          const error = renameSubtask(subtask.id, titleField.value);
          setError('subtasks', error);
          if (error !== null) titleField.value = subtask.title;
        });
        titleField.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          titleField.dispatchEvent(new Event('change'));
        });

        remove.addEventListener('click', () => {
          const error = removeSubtask(subtask.id);
          setError('subtasks', error);
          renderSubtasks();
          subtaskInput.focus();
        });

        row.append(checkbox, titleField, remove);
        return row;
      }),
    );
    updateSubtaskCount();
  };

  const commitSubtaskInput = () => {
    if (subtaskInput.value.trim() === '') {
      setError('subtasks', 'Escribe el título de la subtarea.');
      return;
    }
    const error = addSubtask(subtaskInput.value);
    setError('subtasks', error);
    if (error === null) {
      subtaskInput.value = '';
      renderSubtasks();
    }
    subtaskInput.focus();
  };

  subtaskInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitSubtaskInput();
  });
  query('[data-action="add-subtask"]').addEventListener('click', commitSubtaskInput);

  // ---- open / close --------------------------------------------------------------------

  const present = () => {
    restoreFocus = rememberFocus();
    renderTags();
    renderSubtasks();
    subtaskHint.hidden = editingTaskId === null;
    dialog.showModal();
    titleInput.focus();
  };

  const close = () => {
    if (dialog.open) dialog.close();
  };

  dialog.addEventListener('close', () => {
    editingTaskId = null;
    draftSubtasks = [];
    clearErrors();
    const restore = restoreFocus;
    restoreFocus = null;
    restore?.();
  });

  const resetFields = () => {
    form.reset();
    tagInput.value = '';
    subtaskInput.value = '';
    clearErrors();
  };

  const openCreate = (defaultColumn: ColumnId = 'todo') => {
    if (dialog.open) return;
    editingTaskId = null;
    tags = [];
    draftSubtasks = [];
    heading.textContent = 'Nueva tarjeta';
    submitBtn.textContent = 'Crear tarjeta';
    resetFields();
    priorityInput.value = 'medium';
    columnInput.value = defaultColumn;
    present();
  };

  const openEdit = (task: Task) => {
    if (dialog.open) return;
    editingTaskId = task.id;
    tags = task.tags;
    heading.textContent = 'Editar tarjeta';
    submitBtn.textContent = 'Guardar cambios';
    resetFields();
    titleInput.value = task.title;
    descInput.value = task.description;
    priorityInput.value = task.priority;
    columnInput.value = task.columnId;
    dueInput.value = task.dueDate ?? '';
    present();
  };

  dialog.querySelectorAll('[data-action="close"]').forEach((button) => {
    button.addEventListener('click', close);
  });

  // close on backdrop click, but not when a text selection drag ends outside the card
  let pressedOnBackdrop = false;
  dialog.addEventListener('mousedown', (event) => {
    pressedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && pressedOnBackdrop) close();
    pressedOnBackdrop = false;
  });

  titleInput.addEventListener('input', () => setError('title', null));
  descInput.addEventListener('input', () => setError('description', null));
  dueInput.addEventListener('input', () => setError('dueDate', null));

  // ---- submit --------------------------------------------------------------------------

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    setFormError(null);

    if (tagInput.value.trim() !== '' && !commitTags(tagInput.value)) {
      tagInput.focus();
      return;
    }
    tagInput.value = '';

    const title = validateTaskTitle(titleInput.value);
    const description = validateDescription(descInput.value.trim());
    const tagCheck = validateTags(tags);
    const dueDate = validateDueDate(dueInput.value === '' ? null : dueInput.value);
    const priority = priorityInput.value;
    const columnId = columnInput.value;

    setError('title', title.ok ? null : title.error.message);
    setError('description', description.ok ? null : description.error.message);
    setError('tags', tagCheck.ok ? null : tagCheck.error.message);
    setError('dueDate', dueDate.ok ? null : dueDate.error.message);

    if (!title.ok) return void titleInput.focus();
    if (!description.ok) return void descInput.focus();
    if (!tagCheck.ok) return void tagInput.focus();
    if (!dueDate.ok) return void dueInput.focus();
    if (!isValidPriority(priority) || !isValidColumnId(columnId)) return;

    const payload = {
      title: title.value,
      description: description.value,
      priority,
      columnId,
      tags: tagCheck.value,
      dueDate: dueDate.value,
    };

    const mode: 'create' | 'edit' = editingTaskId === null ? 'create' : 'edit';
    const result =
      editingTaskId === null
        ? store.addTask({
            ...payload,
            subtasks: draftSubtasks.map(({ title: subtaskTitle, completed }) => ({
              title: subtaskTitle,
              completed,
            })),
          })
        : store.updateTask(editingTaskId, payload);

    if (!result.ok) {
      if (!result.error.applied) {
        setFormError(result.error.message);
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
    element: dialog,
    openCreate,
    openEdit,
    close,
    isOpen: () => dialog.open,
  };
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  /** `danger` styles the confirm button as destructive. */
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
}

export interface ConfirmModalHandle {
  element: HTMLDialogElement;
  open: (options: ConfirmOptions) => void;
  close: () => void;
  isOpen: () => boolean;
}

export function createConfirmModal(): ConfirmModalHandle {
  const dialog = htmlToElement<HTMLDialogElement>(`
    <dialog class="dialog confirm-dialog" role="alertdialog"
      aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
      <div class="dialog-form">
        <div class="dialog-header">
          <h2 id="confirm-dialog-title">Confirmar</h2>
        </div>
        <p class="dialog-message" id="confirm-dialog-message"></p>
        <div class="dialog-actions">
          <button class="btn" type="button" data-action="cancel">Cancelar</button>
          <button class="btn btn-danger" type="button" data-action="confirm">Confirmar</button>
        </div>
      </div>
    </dialog>
  `);

  const titleEl = requireElement<HTMLHeadingElement>(dialog, '#confirm-dialog-title');
  const messageEl = requireElement<HTMLParagraphElement>(dialog, '#confirm-dialog-message');
  const confirmBtn = requireElement<HTMLButtonElement>(dialog, '[data-action="confirm"]');
  const cancelBtn = requireElement<HTMLButtonElement>(dialog, '[data-action="cancel"]');

  let pendingConfirm: (() => void) | null = null;
  let restoreFocus: (() => void) | null = null;

  const close = () => {
    if (dialog.open) dialog.close();
  };

  dialog.addEventListener('close', () => {
    pendingConfirm = null;
    const restore = restoreFocus;
    restoreFocus = null;
    restore?.();
  });

  cancelBtn.addEventListener('click', close);

  let pressedOnBackdrop = false;
  dialog.addEventListener('mousedown', (event) => {
    pressedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && pressedOnBackdrop) close();
    pressedOnBackdrop = false;
  });

  confirmBtn.addEventListener('click', () => {
    const action = pendingConfirm;
    pendingConfirm = null;
    // close first so focus returns to the page before the action may re-render it
    close();
    action?.();
  });

  return {
    element: dialog,
    open: ({ title, message, confirmText = 'Confirmar', tone = 'danger', onConfirm }) => {
      if (dialog.open) return;
      titleEl.textContent = title;
      messageEl.textContent = message;
      confirmBtn.textContent = confirmText;
      confirmBtn.className = tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary';
      pendingConfirm = onConfirm;
      restoreFocus = rememberFocus();
      dialog.showModal();
      // the safe choice gets initial focus for a destructive confirmation
      cancelBtn.focus();
    },
    close,
    isOpen: () => dialog.open,
  };
}
