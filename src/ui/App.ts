import { MOVE_HELP_ID } from './components/TaskCard.ts';
import {
  bindShortcuts,
  createAnnouncer,
  createMoveRunner,
  setupBoardDnd,
  setupMoveControls,
} from './interaction/index.ts';
import { Board } from './components/Board.ts';
import { createConfirmModal, createTaskModal } from './components/TaskModal.ts';
import { createToast } from './components/Toast.ts';
import { Toolbar } from './components/Toolbar.ts';
import type { BoardStore } from '../application/index.ts';
import type { Task } from '../domain/index.ts';
import { htmlToElement, requireElement } from './utils/dom.ts';
import { rememberFocus } from './utils/focus.ts';

export function App(store: BoardStore): HTMLElement {
  const shell = htmlToElement(`
    <div class="app-shell">
      <p id="${MOVE_HELP_ID}" class="visually-hidden">
        Para mover la tarjeta enfocada usa Alt más las flechas: izquierda y derecha cambian de
        columna, arriba y abajo cambian el orden.
      </p>
      <div data-slot="board"></div>
      <footer class="app-footer">
        <details class="shortcuts-help">
          <summary>Atajos de teclado</summary>
          <dl class="shortcuts-list">
            <dt><kbd>N</kbd></dt><dd>Nueva tarjeta</dd>
            <dt><kbd>/</kbd></dt><dd>Buscar</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>Z</kbd></dt><dd>Deshacer</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>Y</kbd> o <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd></dt><dd>Rehacer</dd>
            <dt><kbd>Alt</kbd> + <kbd>←</kbd> <kbd>→</kbd></dt><dd>Mover la tarjeta enfocada de columna</dd>
            <dt><kbd>Alt</kbd> + <kbd>↑</kbd> <kbd>↓</kbd></dt><dd>Reordenar la tarjeta enfocada</dd>
            <dt><kbd>Esc</kbd></dt><dd>Cerrar diálogos</dd>
          </dl>
        </details>
      </footer>
    </div>
  `);

  const toast = createToast();
  const boardContainer = requireElement<HTMLDivElement>(shell, '[data-slot="board"]');
  const announcer = createAnnouncer(shell);
  const runMove = createMoveRunner(store, announcer, (message) => toast.show(message, 'error'));
  setupBoardDnd(boardContainer, store, runMove);
  setupMoveControls(boardContainer, store, runMove);

  const confirmModal = createConfirmModal();
  const taskModal = createTaskModal({
    store,
    onSaved: (mode) => {
      toast.show(mode === 'create' ? 'Tarjeta creada.' : 'Cambios guardados.', 'success');
    },
    onWarning: (message) => toast.show(message, 'error'),
  });

  const handleRequestResetDemo = () => {
    confirmModal.open({
      title: 'Restaurar tablero demo',
      message: 'Se reemplazarán las tarjetas actuales por las de ejemplo.',
      confirmText: 'Restaurar',
      tone: 'primary',
      onConfirm: () => {
        const result = store.resetDemo();
        if (result.ok) {
          toast.show('Demo restaurada.', 'info');
        } else {
          toast.show(result.error.message, 'error');
        }
      },
    });
  };

  const toolbar = Toolbar({
    store,
    onNewTask: () => taskModal.openCreate(),
    onRequestResetDemo: handleRequestResetDemo,
    onNotify: (message, type) => toast.show(message, type),
  });

  shell.prepend(toolbar.element);
  shell.append(taskModal.element, confirmModal.element, toast.element);

  const handleEdit = (task: Task) => {
    taskModal.openEdit(task);
  };

  const handleDelete = (task: Task) => {
    confirmModal.open({
      title: 'Eliminar tarjeta',
      message: `¿Seguro que quieres eliminar "${task.title}"?`,
      confirmText: 'Eliminar',
      onConfirm: () => {
        const result = store.deleteTask(task.id);
        if (result.ok) {
          toast.show('Tarjeta eliminada.', 'info', {
            actionLabel: 'Deshacer',
            onAction: () => {
              const undone = store.undo();
              toast.show(
                undone.ok ? 'Eliminación deshecha.' : undone.error.message,
                undone.ok ? 'success' : 'error',
              );
            },
          });
        } else {
          toast.show(result.error.message, 'error');
        }
      },
    });
  };

  const render = () => {
    document.documentElement.dataset.theme = store.getTheme();
    toolbar.sync();
    const restoreFocus = boardContainer.contains(document.activeElement) ? rememberFocus() : null;
    boardContainer.replaceChildren(
      Board({
        store,
        onEditTask: handleEdit,
        onDeleteTask: handleDelete,
      }),
    );
    restoreFocus?.();
  };

  const searchInput = requireElement<HTMLInputElement>(toolbar.element, '[data-role="search"]');
  const travel = (action: 'undo' | 'redo') => {
    if (action === 'undo' ? !store.canUndo() : !store.canRedo()) return;
    const result = action === 'undo' ? store.undo() : store.redo();
    if (result.ok) {
      toast.show(action === 'undo' ? 'Cambio deshecho.' : 'Cambio rehecho.', 'info');
    } else {
      toast.show(result.error.message, 'error');
    }
  };

  // Escape is intentionally not bound: <dialog> closes itself and must not be preventDefault-ed
  bindShortcuts(
    document,
    {
      'new-task': () => taskModal.openCreate(),
      'focus-search': () => searchInput.focus(),
      undo: () => travel('undo'),
      redo: () => travel('redo'),
    },
    () => document.querySelector('dialog[open]') !== null,
  );

  store.subscribe(render);
  render();

  const startupWarning = store.getStartupWarning();
  if (startupWarning !== undefined) {
    toast.show(startupWarning, 'error');
  }

  return shell;
}
