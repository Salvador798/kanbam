import { htmlToElement } from '../utils/dom.ts';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastHandle {
  element: HTMLElement;
  show: (message: string, type?: ToastType) => void;
}

export function createToast(): ToastHandle {
  const toast = htmlToElement(`
    <div class="toast" role="status" aria-live="polite" hidden></div>
  `);

  let timeoutId: number | undefined;

  const show = (message: string, type: ToastType = 'info') => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }

    toast.textContent = message;
    toast.className = `toast toast-${type}`;
    toast.hidden = false;

    timeoutId = window.setTimeout(() => {
      toast.hidden = true;
      timeoutId = undefined;
    }, 3200);
  };

  return { element: toast, show };
}
