import { describe, expect, it } from 'vitest';
import { computeDropIndex, resolveStoreIndex } from '../../../src/ui/interaction/drop-position.ts';

const rects = [
  { top: 0, height: 100 },
  { top: 110, height: 100 },
  { top: 220, height: 100 },
];

describe('computeDropIndex', () => {
  it('returns 0 for an empty column', () => {
    expect(computeDropIndex(500, [])).toBe(0);
  });

  it('inserts before the first card above its midpoint', () => {
    expect(computeDropIndex(10, rects)).toBe(0);
    expect(computeDropIndex(-50, rects)).toBe(0);
  });

  it('treats the midpoint as insert-before', () => {
    expect(computeDropIndex(50, rects)).toBe(0);
    expect(computeDropIndex(51, rects)).toBe(1);
  });

  it('inserts between cards', () => {
    expect(computeDropIndex(105, rects)).toBe(1);
    expect(computeDropIndex(215, rects)).toBe(2);
  });

  it('appends below the last midpoint', () => {
    expect(computeDropIndex(271, rects)).toBe(3);
    expect(computeDropIndex(9999, rects)).toBe(3);
  });

  describe('dragging within the same column', () => {
    it('keeps the position when dropping around itself', () => {
      expect(computeDropIndex(105, rects, 1)).toBe(1);
      expect(computeDropIndex(215, rects, 1)).toBe(1);
    });

    it('adjusts down by one when moving below itself', () => {
      expect(computeDropIndex(9999, rects, 0)).toBe(2);
      expect(computeDropIndex(215, rects, 0)).toBe(1);
    });

    it('does not adjust when moving above itself', () => {
      expect(computeDropIndex(10, rects, 2)).toBe(0);
      expect(computeDropIndex(105, rects, 2)).toBe(1);
    });

    it('never exceeds the last index', () => {
      expect(computeDropIndex(9999, rects, 2)).toBe(2);
    });
  });
});

describe('resolveStoreIndex', () => {
  const full = ['a', 'b', 'c', 'd'];

  it('is the visible index when nothing is filtered', () => {
    expect(resolveStoreIndex(full, full, 0)).toBe(0);
    expect(resolveStoreIndex(full, full, 2)).toBe(2);
    expect(resolveStoreIndex(full, full, 4)).toBe(4);
  });

  it('maps a visible position to the position of the card it precedes', () => {
    expect(resolveStoreIndex(full, ['b', 'd'], 0)).toBe(1);
    expect(resolveStoreIndex(full, ['b', 'd'], 1)).toBe(3);
  });

  it('places after the last visible card when dropped at the end', () => {
    expect(resolveStoreIndex(full, ['b', 'c'], 2)).toBe(3);
  });

  it('appends to the column when no card is visible', () => {
    expect(resolveStoreIndex(full, [], 0)).toBe(4);
    expect(resolveStoreIndex([], [], 0)).toBe(0);
  });
});
