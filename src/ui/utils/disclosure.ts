export interface DisclosureHandle {
  isOpen: () => boolean;
  open: () => void;
  /** Closes the panel; focus returns to the trigger unless `restoreFocus` is false. */
  close: (restoreFocus?: boolean) => void;
  toggle: () => void;
}

/**
 * Wires a trigger button to a floating panel: `aria-expanded` / `aria-controls`, closes on Escape,
 * outside pointer press and keyboard focus leaving the root. Escape only closes the panel.
 */
export function createDisclosure(
  root: HTMLElement,
  trigger: HTMLButtonElement,
  panel: HTMLElement,
): DisclosureHandle {
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panel.id);
  panel.hidden = true;

  const isOpen = () => !panel.hidden;

  const onPointerDown = (event: PointerEvent) => {
    if (event.target instanceof Node && !root.contains(event.target)) close(false);
  };
  const onFocusIn = (event: FocusEvent) => {
    if (event.target instanceof Node && !root.contains(event.target)) close(false);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close(true);
  };

  function open(): void {
    if (isOpen()) return;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function close(restoreFocus = true): void {
    if (!isOpen()) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('keydown', onKeyDown, true);
    if (restoreFocus) trigger.focus();
  }

  const toggle = () => (isOpen() ? close(true) : open());
  trigger.addEventListener('click', toggle);

  return { isOpen, open, close, toggle };
}
