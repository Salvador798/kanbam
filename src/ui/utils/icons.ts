const SVG_NS = 'http://www.w3.org/2000/svg';

export type IconName =
  | 'undo'
  | 'redo'
  | 'more'
  | 'arrow-left'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down';

interface IconSpec {
  readonly paths: readonly string[];
  readonly strokeWidth: number;
}

const ICONS: Readonly<Record<IconName, IconSpec>> = {
  undo: { paths: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'], strokeWidth: 1.75 },
  redo: { paths: ['m15 14 5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'], strokeWidth: 1.75 },
  more: { paths: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'], strokeWidth: 3 },
  'arrow-left': { paths: ['M19 12H5', 'm11 6-6 6 6 6'], strokeWidth: 1.75 },
  'arrow-right': { paths: ['M5 12h14', 'm13 6 6 6-6 6'], strokeWidth: 1.75 },
  'arrow-up': { paths: ['M12 19V5', 'm6 11 6-6 6 6'], strokeWidth: 1.75 },
  'arrow-down': { paths: ['M12 5v14', 'm6 13 6 6 6-6'], strokeWidth: 1.75 },
};

/** Decorative inline icon (static geometry only): the owning control carries the accessible name. */
export function createIcon(name: IconName): SVGSVGElement {
  const { paths, strokeWidth } = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icon');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
