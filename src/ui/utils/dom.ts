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
