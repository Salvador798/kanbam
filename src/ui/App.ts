import { Board } from './components/Board.ts';
import { createConfirmModal, createTaskModal } from './components/TaskModal.ts';
import { createToast } from './components/Toast.ts';
import { Toolbar } from './components/Toolbar.ts';
import type { BoardStore } from '../application/index.ts';
import type { Task } from '../domain/index.ts';
import { setupBoardDnd } from './utils/dnd.ts';
import { htmlToElement, requireElement } from './utils/dom.ts';

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function App(store: BoardStore): HTMLElement {
  const shell = htmlToElement(`
    <div class="app-shell">
      <div data-slot="board"></div>
    </div>
  `);

  const toast = createToast();
  const boardContainer = requireElement<HTMLDivElement>(shell, '[data-slot="board"]');
  setupBoardDnd(boardContainer, store, (message) => toast.show(message, 'error'));

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
          toast.show('Tarjeta eliminada.', 'info');
        } else {
          toast.show(result.error.message, 'error');
        }
      },
    });
  };

  const render = () => {
    document.documentElement.dataset.theme = store.getTheme();
    toolbar.sync();
    boardContainer.replaceChildren(
      Board({
        store,
        onEditTask: handleEdit,
        onDeleteTask: handleDelete,
      }),
    );
  };

  // atajos: Escape cierra modales, N abre nueva tarjeta
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (confirmModal.isOpen()) {
        confirmModal.close();
      } else if (taskModal.isOpen()) {
        taskModal.close();
      }
      return;
    }

    if (
      (event.key === 'n' || event.key === 'N') &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !taskModal.isOpen() &&
      !confirmModal.isOpen() &&
      !isTypingInField(event.target)
    ) {
      event.preventDefault();
      taskModal.openCreate();
    }
  });

  store.subscribe(render);
  render();

  const startupWarning = store.getStartupWarning();
  if (startupWarning !== undefined) {
    toast.show(startupWarning, 'error');
  }

  return shell;
}
