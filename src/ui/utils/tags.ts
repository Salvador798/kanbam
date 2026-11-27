import { DEFAULT_TAG_SUGGESTIONS } from '../../domain/index.ts';
import type { SelectOption } from './dom.ts';

export const NO_TAG = '';

export const TAG_OPTIONS: readonly SelectOption[] = DEFAULT_TAG_SUGGESTIONS.map((tag) => ({
  value: tag,
  label: tag,
}));

const STYLED_TAGS: readonly string[] = ['ui', 'bug', 'feature', 'docs'];

/** Returns a CSS modifier only for known tags, so arbitrary tag text never reaches a class name. */
export function tagBadgeClass(tag: string): string {
  const key = tag.toLowerCase();
  return STYLED_TAGS.includes(key) ? `badge-label-${key}` : '';
}
