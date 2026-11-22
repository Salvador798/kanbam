const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

export function htmlToElement<T extends HTMLElement = HTMLElement>(html: string): T {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const element = template.content.firstElementChild;
  if (!(element instanceof HTMLElement)) {
    throw new Error('La plantilla HTML debe tener un elemento raíz.');
  }
  return element as T;
}
