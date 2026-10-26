export const WIDTH = 1200;
export const HEIGHT = 760;
export const MIN_REGION_SIZE = 12;

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

export function clampPoint(point: Point): Point {
  return {
    x: Math.max(0, Math.min(WIDTH, point.x)),
    y: Math.max(0, Math.min(HEIGHT, point.y)),
  };
}

/** Tiny clicks are not regions. Dragging in either direction stays on the canvas. */
export function regionRect(start: Point, end: Point): Rect | null {
  const a = clampPoint(start);
  const b = clampPoint(end);
  const rect = {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y),
  };
  return validRect(rect) ? rect : null;
}

export function validRect(rect: Rect): boolean {
  return Object.values(rect).every(Number.isFinite)
    && rect.x >= 0 && rect.y >= 0
    && rect.width >= MIN_REGION_SIZE && rect.height >= MIN_REGION_SIZE
    && rect.x + rect.width <= WIDTH && rect.y + rect.height <= HEIGHT;
}

export function containsPoint(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function localPoint(rect: Rect, point: Point): Point {
  // Do not clamp individual samples: clipping the actual path avoids false lines
  // along the border when the pointer leaves and re-enters the region.
  return { x: point.x - rect.x, y: point.y - rect.y };
}

export function movedRect(rect: Rect, position: Point): Rect {
  return {
    ...rect,
    x: Math.max(0, Math.min(WIDTH - rect.width, position.x)),
    y: Math.max(0, Math.min(HEIGHT - rect.height, position.y)),
  };
}

/** Keep the origin and ink coordinates fixed; only change the clipping window. */
export function resizedRect(rect: Rect, size: Pick<Rect, "width" | "height">): Rect {
  return {
    ...rect,
    width: Math.max(MIN_REGION_SIZE, Math.min(WIDTH - rect.x, size.width)),
    height: Math.max(MIN_REGION_SIZE, Math.min(HEIGHT - rect.y, size.height)),
  };
}

export function pathData(points: Point[]): string {
  if (points.length === 0) return "";
  const coords = (point: Point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  if (points.length === 1 || points.every(point => point.x === points[0]!.x && point.y === points[0]!.y)) {
    return `M ${coords(points[0]!)} L ${(points[0]!.x + 0.01).toFixed(2)} ${points[0]!.y.toFixed(1)}`;
  }
  return `M ${coords(points[0]!)} ` + points.slice(1).map(point => `L ${coords(point)}`).join(" ");
}
