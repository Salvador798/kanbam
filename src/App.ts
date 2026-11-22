import { Board } from './components/Board.ts';
import { createConfirmModal, createTaskModal } from './components/TaskModal.ts';
import { createToast } from './components/Toast.ts';
import { Toolbar } from './components/Toolbar.ts';
import { store } from './core/store.ts';
import type { Task } from './core/types.ts';
import { setupBoardDnd } from './utils/dnd.ts';
import { htmlToElement } from './utils/dom.ts';

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function App(): HTMLElement {
  const shell = htmlToElement(`
    <div class="app-shell">
      <div data-slot="board"></div>
    </div>
  `);

  const boardContainer = shell.querySelector<HTMLDivElement>('[data-slot="board"]')!;
  setupBoardDnd(boardContainer);

  const toast = createToast();
  const confirmModal = createConfirmModal();
  const taskModal = createTaskModal((mode) => {
    toast.show(
      mode === 'create' ? 'Tarjeta creada.' : 'Cambios guardados.',
      'success',
    );
  });

  const handleRequestResetDemo = () => {
    confirmModal.open({
      title: 'Restaurar tablero demo',
      message: 'Se reemplazarán las tarjetas actuales por las de ejemplo.',
      confirmText: 'Restaurar',
      onConfirm: () => {
        store.resetDemo();
        toast.show('Demo restaurada.', 'info');
      },
    });
  };

  const toolbar = Toolbar({
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
        store.deleteTask(task.id);
        toast.show('Tarjeta eliminada.', 'info');
      },
    });
  };

  const render = () => {
    document.documentElement.dataset.theme = store.getState().theme;
    toolbar.sync();
    boardContainer.replaceChildren(
      Board({
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

  return shell;
}
