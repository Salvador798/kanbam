import { describe, expect, it } from 'vitest';
import {
  DRAG_START_THRESHOLD,
  hasExceededDragThreshold,
} from '../../../src/ui/interaction/touch-drag.ts';

describe('hasExceededDragThreshold', () => {
  const start = { x: 100, y: 100 };

  it('uses 8px by default', () => {
    expect(DRAG_START_THRESHOLD).toBe(8);
  });

  it('is false for tiny movement', () => {
    expect(hasExceededDragThreshold(start, { x: 103, y: 104 })).toBe(false);
  });

  it('is true when the distance reaches the threshold', () => {
    expect(hasExceededDragThreshold(start, { x: 108, y: 100 })).toBe(true);
    expect(hasExceededDragThreshold(start, { x: 100, y: 91 })).toBe(true);
  });

  it('uses euclidean distance', () => {
    expect(hasExceededDragThreshold(start, { x: 106, y: 106 })).toBe(true);
    expect(hasExceededDragThreshold(start, { x: 105, y: 105 })).toBe(false);
  });

  it('accepts a custom threshold', () => {
    expect(hasExceededDragThreshold(start, { x: 103, y: 100 }, 3)).toBe(true);
  });
});
