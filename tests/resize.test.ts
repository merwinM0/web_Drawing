import { expect, test } from "bun:test";
import { EditorStore } from "../src/document";
import { exportDocument } from "../src/export";
import { resizedRect } from "../src/geometry";
import { hitResizeHandle, renderResizeHandles, resizeFromDrag } from "../src/region-resize";
import { renderSVG } from "../src/render";
import { validateDocument } from "../src/validation";

const rect = { x: 100, y: 80, width: 300, height: 200 };
function fixture(): EditorStore {
  const store = new EditorStore();
  store.create(rect, "first");
  store.appendMark("first", { kind: "pen", brush: "pencil", color: "#232c49", width: 18, opacity: .8, pressureMode: "stylus", smoothing: .4, points: [{ x: 150, y: 50, pressure: .3 }, { x: 450, y: 150, pressure: .9 }] });
  store.appendMark("first", { kind: "eraser", brush: "soft", color: "#000000", width: 28, opacity: .5, points: [{ x: 180, y: 50 }, { x: 200, y: 70 }] });
  store.selected!.binding = { event: "activate", action: "test-action", payload: { key: 1 } };
  store.create({ x: 500, y: 100, width: 100, height: 100 }, "second");
  store.select("first");
  return store;
}

test("调整范围固定左上角，支持自由宽高但限制最小尺寸和画布边界", () => {
  expect(resizedRect(rect, { width: 500, height: 300 })).toEqual({ ...rect, width: 500, height: 300 });
  expect(resizedRect(rect, { width: -100, height: 0 })).toEqual({ ...rect, width: 12, height: 12 });
  expect(resizedRect(rect, { width: 9999, height: 9999 })).toEqual({ ...rect, width: 1100, height: 680 });
});

test("三种拖柄分别只影响宽、高或两者，使用起笔偏移避免跳变", () => {
  expect(resizeFromDrag(rect, { x: 398, y: 175 }, { x: 448, y: 215 }, "e")).toEqual({ ...rect, width: 350 });
  expect(resizeFromDrag(rect, { x: 250, y: 278 }, { x: 300, y: 328 }, "s")).toEqual({ ...rect, height: 250 });
  expect(resizeFromDrag(rect, { x: 402, y: 282 }, { x: 352, y: 242 }, "se")).toEqual({ ...rect, width: 250, height: 160 });
});

test("拖柄按 CSS 像素容差命中，小框选择最近拖柄，框内普通点击不误缩放", () => {
  expect(hitResizeHandle(rect, { x: 406, y: 180 }, 12)).toBe("e");
  expect(hitResizeHandle(rect, { x: 250, y: 280 }, 12)).toBe("s");
  expect(hitResizeHandle(rect, { x: 400, y: 280 }, 12)).toBe("se");
  expect(hitResizeHandle(rect, { x: 250, y: 180 }, 12)).toBeUndefined();
  expect(hitResizeHandle({ x: 0, y: 0, width: 12, height: 12 }, { x: 12, y: 12 }, 60)).toBe("se");
  expect(renderResizeHandles(rect, 8).match(/data-resize-handle=/g)).toHaveLength(3);
});

test("缩小和扩大不重写笔画、线宽、压力、橡皮、绑定、位置或层级", () => {
  const store = fixture(), before = structuredClone(store.state.regions);
  expect(store.resize("first", { width: 80, height: 30 })).toBe(true);
  expect(store.selected).toEqual({ ...before[0]!, rect: { ...rect, width: 80, height: 30 } });
  expect(store.state.regions[1]).toEqual(before[1]);
  expect(store.state.regions.map(region => region.id)).toEqual(["first", "second"]);
  store.resize("first", { width: 300, height: 200 });
  expect(store.state.regions).toEqual(before);
});

test("一次有效范围修改只有一个历史步骤，无效与相同范围不会污染历史", () => {
  const store = fixture();
  store.resize("first", { width: 100, height: 100 });
  expect(store.resize("first", { width: 100, height: 100 })).toBe(false);
  expect(store.resize("first", { width: NaN, height: 100 })).toBe(false);
  expect(store.resize("missing", { width: 20, height: 20 })).toBe(false);
  store.undo(); expect(store.selected!.rect).toEqual(rect);
  store.redo(); expect(store.selected!.rect).toEqual({ ...rect, width: 100, height: 100 });
});

test("缩小后的框仍保存隐藏笔画，允许原起笔点出框，重开再扩大可恢复", () => {
  const store = fixture(), original = structuredClone(store.selected!);
  store.resize("first", { width: 30, height: 30 });
  const saved = validateDocument(exportDocument(store.state.regions));
  expect(saved.regions[0]!.marks).toEqual(original.marks);
  const reopened = new EditorStore(); reopened.load(saved.regions);
  reopened.resize("first", rect);
  expect(reopened.state.regions[0]).toEqual(original);
  const svg = renderSVG(saved.regions);
  expect(svg).toContain('clipPathUnits="userSpaceOnUse"><rect width="30" height="30"');
  expect(svg).toContain('transform="translate(100 80)"');
  expect(svg).not.toContain("scale(");
  expect(svg).not.toContain("resize-handle");
});
