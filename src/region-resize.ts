import { resizedRect, type Point, type Rect } from "./geometry";

export type ResizeHandle = "e" | "s" | "se";
export const resizeCursor: Record<ResizeHandle, string> = { e: "ew-resize", s: "ns-resize", se: "nwse-resize" };

function handles(rect: Rect): { handle: ResizeHandle; point: Point }[] {
  return [
    { handle: "se", point: { x: rect.x + rect.width, y: rect.y + rect.height } },
    { handle: "e", point: { x: rect.x + rect.width, y: rect.y + rect.height / 2 } },
    { handle: "s", point: { x: rect.x + rect.width / 2, y: rect.y + rect.height } },
  ];
}

/** A CSS-pixel hit radius converted to SVG units; choose nearest on tiny regions. */
export function hitResizeHandle(rect: Rect, point: Point, radius: number): ResizeHandle | undefined {
  let nearest: ResizeHandle | undefined;
  let distance = radius;
  for (const item of handles(rect)) {
    const delta = Math.hypot(point.x - item.point.x, point.y - item.point.y);
    if (delta <= distance) { nearest = item.handle; distance = delta; }
  }
  return nearest;
}

export function resizeFromDrag(rect: Rect, start: Point, end: Point, handle: ResizeHandle): Rect {
  return resizedRect(rect, {
    width: rect.width + (handle === "s" ? 0 : end.x - start.x),
    height: rect.height + (handle === "e" ? 0 : end.y - start.y),
  });
}

export function renderResizeHandles(rect: Rect, size: number): string {
  return handles(rect).map(({ handle, point }) => `<rect class="resize-handle" data-resize-handle="${handle}" x="${point.x - size / 2}" y="${point.y - size / 2}" width="${size}" height="${size}" rx="${size / 6}" vector-effect="non-scaling-stroke"/>`).join("");
}
