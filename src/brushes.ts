import { getStroke, getStrokePoints } from "perfect-freehand";
import type { Point } from "./geometry";

export type BrushId = "round" | "ink" | "pencil" | "marker";
export type EraserId = "hard" | "soft" | "block";
export type PresetId = BrushId | EraserId;
export type PressureMode = "constant" | "simulated" | "stylus";
export type Sample = Point & { pressure?: number };
export type BrushSettings = { brush: PresetId; width: number; opacity: number; smoothing: number; pressure: boolean };
export type Stroke = {
  kind: "pen" | "eraser"; points: Sample[]; width: number; color: string;
  brush?: PresetId; opacity?: number; smoothing?: number; pressureMode?: PressureMode;
};
export type Preset = { id: PresetId; name: string; kind: "pen" | "eraser"; width: number; opacity: number; pressure: boolean; description: string };
export const PRESETS: Preset[] = [
  { id: "round", name: "圆头笔", kind: "pen", width: 4, opacity: 1, pressure: false, description: "均匀圆头，适合勾线。平滑度越高，线条越稳定。" },
  { id: "ink", name: "压感墨笔", kind: "pen", width: 14, opacity: 1, pressure: true, description: "启用压感时，压感笔使用真实压力，鼠标按采样间距模拟粗细。" },
  { id: "pencil", name: "纹理铅笔", kind: "pen", width: 8, opacity: .8, pressure: true, description: "颗粒纹理与压感粗细，适合草稿。纹理为矢量滤镜，不是纸张物理模拟。" },
  { id: "marker", name: "荧光笔", kind: "pen", width: 28, opacity: .35, pressure: false, description: "扁平笔头、半透明叠色；单条笔画内部不会重复加深。" },
  { id: "hard", name: "硬边橡皮", kind: "eraser", width: 24, opacity: 1, pressure: false, description: "圆形硬边擦除；强度小于 100% 时可分次减淡。" },
  { id: "soft", name: "柔边橡皮", kind: "eraser", width: 48, opacity: 1, pressure: false, description: "带羽化边缘的透明擦除，可重复擦淡；羽化仍受区域边界裁剪。" },
  { id: "block", name: "方形橡皮", kind: "eraser", width: 32, opacity: 1, pressure: false, description: "固定方向的方形笔头，适合清理边角。" },
];
export function preset(id: PresetId): Preset { return PRESETS.find(item => item.id === id)!; }
export function defaultSettings(id: PresetId): BrushSettings {
  const item = preset(id);
  return { brush: id, width: item.width, opacity: item.opacity, smoothing: .4, pressure: item.pressure };
}
export function validStrokeSettings(mark: Stroke): boolean {
  return (mark.brush === undefined || PRESETS.some(item => item.id === mark.brush && item.kind === mark.kind))
    && [mark.opacity, mark.smoothing].every(value => value === undefined || Number.isFinite(value) && value >= 0 && value <= 1)
    && (mark.pressureMode === undefined || ["constant", "simulated", "stylus"].includes(mark.pressureMode))
    && mark.points.every(point => point.pressure === undefined || Number.isFinite(point.pressure) && point.pressure >= 0 && point.pressure <= 1);
}

/** Do not mistake mouse pressure=.5 for a pressure-capable pen. */
export function pressureMode(enabled: boolean, pointerType: string): PressureMode {
  return !enabled ? "constant" : pointerType === "pen" ? "stylus" : "simulated";
}
export function samplePoint(point: Point, pressure: number, pointerType: string, previous?: Sample, released = false): Sample {
  if (pointerType !== "pen") return point;
  const value = released && pressure === 0 ? previous?.pressure ?? .5 : pressure;
  return { ...point, pressure: Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .5 };
}

function options(mark: Stroke) {
  const variable = (mark.brush === "ink" || mark.brush === "pencil") && (mark.pressureMode === "simulated" || mark.pressureMode === "stylus");
  return {
    size: mark.width, thinning: variable ? mark.brush === "ink" ? .75 : .45 : 0,
    smoothing: mark.smoothing ?? .4, streamline: (mark.smoothing ?? .4) * .65,
    simulatePressure: mark.pressureMode === "simulated", last: true,
  };
}
function polygon(points: number[][]): string {
  return points.length ? `M ${points.map(point => `${point[0]!.toFixed(2)} ${point[1]!.toFixed(2)}`).join(" L ")} Z` : "";
}
export function roundOutline(mark: Stroke): string {
  return polygon(getStroke(mark.points.map(point => [point.x, point.y, point.pressure ?? .5]), options(mark)));
}

/** Convex hull of the two rectangular nibs: a gap-free sweep even on diagonals. */
function hull(points: Point[]): Point[] {
  const sorted = points.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (items: Point[]) => {
    const result: Point[] = [];
    for (const point of items) {
      while (result.length >= 2 && cross(result.at(-2)!, result.at(-1)!, point) <= 0) result.pop();
      result.push(point);
    }
    result.pop();
    return result;
  };
  return [...half(sorted), ...half(sorted.slice().reverse())];
}
export function rectangularOutline(mark: Stroke): string {
  const centers = mark.points.length === 1 ? mark.points : getStrokePoints(mark.points, options(mark)).map(item => ({ x: item.point[0], y: item.point[1] }));
  const halfWidth = mark.width / 2;
  const halfHeight = mark.brush === "marker" ? mark.width * .18 : halfWidth;
  const nib = (point: Point) => [-1, 1].flatMap(x => [-1, 1].map(y => ({ x: point.x + x * halfWidth, y: point.y + y * halfHeight })));
  return centers.map((point, index) => polygon(hull([...nib(centers[Math.max(0, index - 1)]!), ...nib(point)]).map(p => [p.x, p.y]))).join(" ");
}
