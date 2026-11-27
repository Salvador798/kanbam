import { el } from '../utils/dom.ts';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastOptions {
  /** Optional action button, e.g. "Deshacer". */
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  /** Milliseconds before auto-dismiss. */
  readonly duration?: number;
}

export interface ToastHandle {
  element: HTMLElement;
  show: (message: string, type?: ToastType, options?: ToastOptions) => void;
  dismiss: () => void;
}

const DEFAULT_DURATION_MS = 3200;
const ACTION_DURATION_MS = 7000;

/** The live region is always in the DOM so assistive tech announces each new message. */
export function createToast(): ToastHandle {
  const region = el('div', {
    className: 'toast-region',
    attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
  });

  let timeoutId: number | undefined;
  let remaining = 0;
  let startedAt = 0;

  const clearTimer = () => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const dismiss = () => {
    clearTimer();
    region.replaceChildren();
  };

  const startTimer = (duration: number) => {
    clearTimer();
    remaining = duration;
    startedAt = Date.now();
    timeoutId = window.setTimeout(dismiss, duration);
  };

  // keep the toast while the pointer or keyboard focus is on it
  const pause = () => {
    if (timeoutId === undefined) return;
    remaining = Math.max(1000, remaining - (Date.now() - startedAt));
    clearTimer();
  };
  const resume = () => {
    if (timeoutId === undefined && region.firstElementChild) startTimer(remaining);
  };
  region.addEventListener('mouseenter', pause);
  region.addEventListener('focusin', pause);
  region.addEventListener('mouseleave', resume);
  region.addEventListener('focusout', resume);

  const show = (message: string, type: ToastType = 'info', options: ToastOptions = {}) => {
    const item = el('div', { className: `toast toast-${type}` }, el('span', { text: message }));

    const { actionLabel, onAction } = options;
    if (actionLabel !== undefined && onAction !== undefined) {
      const action = el('button', {
        className: 'toast-action',
        text: actionLabel,
        attrs: { type: 'button' },
      });
      action.addEventListener('click', () => {
        dismiss();
        onAction();
      });
      item.append(action);
    }

    region.replaceChildren(item);
    startTimer(
      options.duration ?? (actionLabel !== undefined ? ACTION_DURATION_MS : DEFAULT_DURATION_MS),
    );
  };

  return { element: region, show, dismiss };
}
