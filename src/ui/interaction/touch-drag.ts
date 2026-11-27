export interface Point {
  readonly x: number;
  readonly y: number;
}

export const DRAG_START_THRESHOLD = 8;

export function hasExceededDragThreshold(
  start: Point,
  current: Point,
  threshold: number = DRAG_START_THRESHOLD,
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}
