import { expect, test } from "bun:test";
import { EditorStore, hitTest, type Mark } from "../src/document";

const rect = { x: 50, y: 50, width: 200, height: 120 };
const mark: Mark = { kind: "pen", points: [{ x: 10, y: 10 }, { x: 300, y: -20 }], width: 4, color: "#123456" };

function twoRegions(): EditorStore {
  const store = new EditorStore();
  store.create(rect, "lower");
  store.create({ ...rect, x: 100 }, "upper");
  return store;
}

test("初始没有绘画目标，新框具有独立 ID、局部笔画和空绑定", () => {
  const store = new EditorStore();
  expect(store.selected).toBeUndefined();
  expect(store.appendMark("background", mark)).toBe(false);
  store.create(rect, "one");
  expect(store.selected).toMatchObject({ id: "one", name: "区域 1", marks: [], binding: null });
  expect(store.create(rect, "one")).toBe(false);
  expect(store.create({ ...rect, width: 0 })).toBe(false);
});

test("新框在上，命中优先上层，调整层级不改变 ID、坐标或笔画归属", () => {
  const store = twoRegions();
  store.appendMark("lower", mark);
  store.select("lower");
  store.selected!.binding = { event: "activate", action: "test-action", payload: { key: "value" } };
  expect(hitTest(store.state.regions, { x: 120, y: 80 })?.id).toBe("upper");
  store.select("lower");
  expect(store.reorder(1)).toBe(true);
  expect(store.state.regions.map(region => region.id)).toEqual(["upper", "lower"]);
  expect(hitTest(store.state.regions, { x: 120, y: 80 })?.id).toBe("lower");
  expect(store.selected?.rect).toEqual(rect);
  expect(store.selected?.marks).toEqual([mark]);
  expect(store.selected?.binding).toEqual({ event: "activate", action: "test-action", payload: { key: "value" } });
  expect(store.reorder(1)).toBe(false);
  expect(hitTest(store.state.regions, { x: 0, y: 0 })).toBeUndefined();
});

test("笔画和橡皮只存入指定框，跨界轨迹保留用于 SVG 裁剪", () => {
  const store = twoRegions();
  store.appendMark("upper", mark);
  store.appendMark("upper", { ...mark, kind: "eraser" });
  expect(store.state.regions[0]!.marks).toEqual([]);
  expect(store.state.regions[1]!.marks.map(item => item.kind)).toEqual(["pen", "eraser"]);
  expect(store.appendMark("lower", { ...mark, points: [{ x: -1, y: 10 }] })).toBe(false);
  expect(store.appendMark("upper", { ...mark, points: [] })).toBe(false);
  expect(store.appendMark("upper", { ...mark, points: [{ x: NaN, y: 10 }] })).toBe(false);
  expect(store.appendMark("upper", { ...mark, width: 0 })).toBe(false);
});

test("撤销和重做覆盖绘画、层级、名称、删除，并恢复选中区域", () => {
  const store = twoRegions();
  store.appendMark("upper", mark);
  store.rename("操作区");
  store.reorder(-1);
  store.removeSelected();
  expect(store.state.regions.map(region => region.id)).toEqual(["lower"]);
  store.undo();
  expect(store.selected).toMatchObject({ id: "upper", name: "操作区", marks: [mark] });
  expect(store.state.regions.map(region => region.id)).toEqual(["upper", "lower"]);
  store.undo();
  expect(store.state.regions.map(region => region.id)).toEqual(["lower", "upper"]);
  store.undo();
  expect(store.selected?.name).toBe("区域 2");
  store.undo();
  expect(store.selected?.marks).toEqual([]);
  store.redo();
  expect(store.selected?.marks).toEqual([mark]);
});

test("撤销新建后恢复先前选择，删除最后一框可撤销", () => {
  const store = new EditorStore();
  store.create(rect, "first");
  store.create(rect, "second");
  store.undo();
  expect(store.selected?.id).toBe("first");
  store.removeSelected();
  expect(store.selected).toBeUndefined();
  store.undo();
  expect(store.selected?.id).toBe("first");
  expect(store.canRedo).toBe(true);
  store.rename("新名称");
  expect(store.canRedo).toBe(false);
});

test("输入数据与历史快照隔离，重复或空名称不污染历史", () => {
  const store = new EditorStore();
  const input = { ...rect };
  store.create(input, "one");
  input.x = 999;
  expect(store.selected?.rect.x).toBe(50);
  const inputMark = structuredClone(mark);
  store.appendMark("one", inputMark);
  inputMark.points[0]!.x = 999;
  expect(store.selected?.marks[0]!.points[0]!.x).toBe(10);
  expect(store.rename("  ")).toBe(false);
  expect(store.rename("区域 1")).toBe(false);
  store.undo();
  expect(store.selected?.marks).toEqual([]);
  store.redo();
  expect(store.selected?.marks[0]!.points[0]!.x).toBe(10);
});

test("移动区域同时保留身份、局部笔画和绑定，一次移动只有一个撤销步骤", () => {
  const store = twoRegions();
  store.appendMark("upper", mark);
  store.selected!.binding = { event: "activate", action: "example", payload: { key: 1 } };
  const before = structuredClone(store.selected!);
  expect(store.move("upper", { x: 400, y: 300 })).toBe(true);
  expect(store.selected).toEqual({ ...before, rect: { ...before.rect, x: 400, y: 300 } });
  store.undo();
  expect(store.selected).toEqual(before);
  store.redo();
  expect(store.selected!.rect.x).toBe(400);
  expect(store.move("upper", { x: 1e4, y: -10 })).toBe(true);
  expect(store.selected!.rect).toMatchObject({ x: 1000, y: 0 });
  expect(store.move("upper", { x: NaN, y: 0 })).toBe(false);
  expect(store.move("missing", { x: 10, y: 10 })).toBe(false);
});

test("重新打开文档会隔离输入并清空跨作品的历史", () => {
  const store = twoRegions();
  const saved = structuredClone(store.state.regions);
  store.rename("改动");
  store.load(saved);
  expect(store.canUndo).toBe(false);
  expect(store.canRedo).toBe(false);
  expect(store.selected!.id).toBe("upper");
  saved[1]!.name = "外部修改";
  expect(store.selected!.name).toBe("区域 2");
  store.load([]);
  expect(store.selected).toBeUndefined();
});

test("历史最多保留 80 个快照", () => {
  const store = new EditorStore();
  store.create(rect, "one");
  for (let i = 0; i < 100; i++) store.rename(`名称 ${i}`);
  let undos = 0;
  while (store.canUndo) { store.undo(); undos++; }
  expect(undos).toBe(79);
});
