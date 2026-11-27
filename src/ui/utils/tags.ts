import { DEFAULT_TAG_SUGGESTIONS } from '../../domain/index.ts';
import type { SelectOption } from './dom.ts';

export const NO_TAG = '';

export const TAG_OPTIONS: readonly SelectOption[] = DEFAULT_TAG_SUGGESTIONS.map((tag) => ({
  value: tag,
  label: tag,
}));
