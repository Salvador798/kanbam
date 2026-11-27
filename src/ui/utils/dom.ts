/**
 * Builds an element from a STATIC template. Never interpolate user-provided or
 * persisted data into `html`; use `textContent` / DOM APIs for that instead.
 */
export function htmlToElement<T extends HTMLElement = HTMLElement>(html: string): T {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const element = template.content.firstElementChild;
  if (!(element instanceof HTMLElement)) {
    throw new Error('La plantilla HTML debe tener un elemento raíz.');
  }
  return element as T;
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export function appendOptions(select: HTMLSelectElement, options: readonly SelectOption[]): void {
  select.append(...options.map((option) => new Option(option.label, option.value)));
}

export function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`No se encontró el elemento ${selector}`);
  }
  return element;
}

export interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
}

/** Builds an element with `textContent` only: user data never goes through innerHTML. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: readonly (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.className !== undefined) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    element.setAttribute(name, value);
  }
  element.append(...children);
  return element;
}

/** Shows or clears an inline field error, keeping `aria-invalid` / `aria-describedby` in sync. */
export function setFieldError(
  control: HTMLElement,
  errorElement: HTMLElement,
  message: string | null,
): void {
  if (message === null) {
    errorElement.textContent = '';
    errorElement.hidden = true;
    control.removeAttribute('aria-invalid');
    control.removeAttribute('aria-describedby');
    return;
  }
  errorElement.textContent = message;
  errorElement.hidden = false;
  control.setAttribute('aria-invalid', 'true');
  control.setAttribute('aria-describedby', errorElement.id);
}
