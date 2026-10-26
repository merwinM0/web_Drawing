import { validStrokeSettings } from "./brushes";
import type { DrawingDocument, Mark, Region } from "./document";
import { validRect } from "./geometry";

export const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
function jsonData(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 1000 && value.every(item => jsonData(item, depth + 1));
  return object(value) && Object.keys(value).length <= 1000 && Object.values(value).every(item => jsonData(item, depth + 1));
}

/** Validate stored data before rendering. No imported markup or executable payloads. */
export function validateDocument(value: unknown): DrawingDocument {
  const invalid = () => { throw new Error("绘画数据损坏或版本不受支持，未修改原始数据。"); };
  if (!object(value) || value.version !== 2 || value.width !== 1200 || value.height !== 760 || !Array.isArray(value.regions) || value.regions.length > 256) return invalid();
  const ids = new Set<string>();
  let totalPoints = 0, totalMarks = 0;
  for (const item of value.regions) {
    if (!object(item) || !safeId(item.id) || ids.has(item.id) || typeof item.name !== "string" || !item.name.trim() || item.name.length > 40
      || !object(item.rect) || ![item.rect.x, item.rect.y, item.rect.width, item.rect.height].every(finite)
      || !validRect(item.rect as Region["rect"]) || !Array.isArray(item.marks)) return invalid();
    ids.add(item.id);
    totalMarks += item.marks.length;
    if (totalMarks > 20000) return invalid();
    if (item.binding !== null) {
      const binding = item.binding;
      if (!object(binding) || binding.event !== "activate" || typeof binding.action !== "string" || binding.action.length > 100
        || !object(binding.payload) || !jsonData(binding.payload) || JSON.stringify(binding.payload).length > 100000) return invalid();
    }
    for (const mark of item.marks) {
      if (!object(mark) || !["pen", "eraser"].includes(String(mark.kind)) || !finite(mark.width) || mark.width <= 0 || mark.width > 1000
        || typeof mark.color !== "string" || !/^(#[\da-f]{3}|#[\da-f]{6}|[a-z]{1,24})$/i.test(mark.color)
        || !Array.isArray(mark.points) || !mark.points.length) return invalid();
      totalPoints += mark.points.length;
      if (totalPoints > 500000) return invalid();
      if (!mark.points.every((point: unknown) => object(point) && finite(point.x) && finite(point.y) && Math.abs(point.x) <= 1e6 && Math.abs(point.y) <= 1e6)) return invalid();
      if (!validStrokeSettings(mark as Mark)) return invalid();
    }
  }
  // Only the validated document root is loaded; renderers pick explicit region/mark fields.
  return { version: 2, width: 1200, height: 760, regions: structuredClone(value.regions) as Region[] };
}
