export interface CardRect {
  readonly top: number;
  readonly height: number;
}

/**
 * Computes where a dragged card lands inside a column.
 *
 * `cardRects` are the column's cards in order (including the dragged card when
 * it comes from the same column). A card counts as "above the pointer" once the
 * pointer is strictly below its vertical midpoint.
 *
 * When `draggedIndex` is given (same-column drag) the result is the FINAL index
 * after the dragged card is removed and reinserted, which is the semantics
 * expected by the store's `moveTask` / `reorderTask`. Otherwise it is the
 * insertion index in the target column (0..cardRects.length).
 */
export function computeDropIndex(
  pointerY: number,
  cardRects: readonly CardRect[],
  draggedIndex?: number,
): number {
  const insertion = cardRects.filter((rect) => pointerY > rect.top + rect.height / 2).length;
  if (draggedIndex === undefined) {
    return insertion;
  }
  return insertion > draggedIndex ? insertion - 1 : insertion;
}

/**
 * Translates an insertion position among the VISIBLE cards (dragged card excluded) into the
 * final index in the store's full column list, so drops stay precise while filters hide cards.
 *
 * `fullIds`: every task id of the target column without the dragged one, in order.
 * `visibleIds`: the visible subset of `fullIds`, in order. `visibleIndex`: 0..visibleIds.length.
 */
export function resolveStoreIndex(
  fullIds: readonly string[],
  visibleIds: readonly string[],
  visibleIndex: number,
): number {
  const before = visibleIds[visibleIndex];
  if (before !== undefined) {
    const found = fullIds.indexOf(before);
    return found === -1 ? fullIds.length : found;
  }
  const last = visibleIds[visibleIds.length - 1];
  if (last === undefined) {
    return fullIds.length;
  }
  const found = fullIds.indexOf(last);
  return found === -1 ? fullIds.length : found + 1;
}
