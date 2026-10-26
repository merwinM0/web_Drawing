import { expect, test } from "bun:test";
import { PRESETS, defaultSettings, pressureMode, rectangularOutline, roundOutline, samplePoint, validStrokeSettings, type Stroke } from "../src/brushes";
import { renderStroke } from "../src/brush-render";
import { EditorStore } from "../src/document";
import { exportDocument, renderHTML } from "../src/export";

const base: Stroke = { kind: "pen", brush: "round", color: "#123456", width: 20, opacity: 1, smoothing: .4, pressureMode: "constant", points: [{ x: 20, y: 30 }, { x: 60, y: 30 }, { x: 100, y: 30 }] };
const bounds = { width: 160, height: 80 };

test("提供四种画笔、三种橡皮，各自有可复制的独立默认设置", () => {
  expect(PRESETS.filter(item => item.kind === "pen")).toHaveLength(4);
  expect(PRESETS.filter(item => item.kind === "eraser")).toHaveLength(3);
  const settings = defaultSettings("marker");
  expect(settings.opacity).toBe(.35);
  settings.width = 100;
  expect(defaultSettings("marker").width).toBe(28);
});

test("只有笔设备采集真实压力，鼠标和触控用模拟模式，关闭后保持恒定", () => {
  expect(pressureMode(true, "pen")).toBe("stylus");
  expect(pressureMode(true, "mouse")).toBe("simulated");
  expect(pressureMode(true, "touch")).toBe("simulated");
  expect(pressureMode(false, "pen")).toBe("constant");
  expect(samplePoint({ x: 1, y: 2 }, .8, "mouse")).toEqual({ x: 1, y: 2 });
  expect(samplePoint({ x: 1, y: 2 }, .8, "pen").pressure).toBe(.8);
  expect(samplePoint({ x: 1, y: 2 }, 0, "pen", { x: 0, y: 0, pressure: .8 }, true).pressure).toBe(.8);
  expect(samplePoint({ x: 1, y: 2 }, NaN, "pen").pressure).toBe(.5);
});

test("墨笔压力和鼠标模拟会改变轮廓，圆头笔不受压力影响", () => {
  const stroke = (pressure: number): Stroke => ({ ...base, brush: "ink", pressureMode: "stylus", points: base.points.map(point => ({ ...point, pressure })) });
  expect(roundOutline(stroke(.1))).not.toBe(roundOutline(stroke(.9)));
  expect(roundOutline({ ...stroke(.1), brush: "round" })).toBe(roundOutline({ ...stroke(.9), brush: "round" }));
  expect(roundOutline({ ...base, brush: "ink", pressureMode: "simulated" })).not.toBe(roundOutline({ ...base, brush: "ink", pressureMode: "constant" }));
});

test("所有画笔支持单点，无空值、NaN 或无穷坐标", () => {
  for (const item of PRESETS) {
    const mark: Stroke = { ...base, kind: item.kind, brush: item.id, points: [{ x: 20, y: 30, pressure: .5 }] };
    const output = renderStroke(mark, item.id, bounds);
    expect(output.content).toContain('d="M ');
    expect(output.content).not.toMatch(/NaN|Infinity|undefined/);
  }
});

test("方形笔头连续扫过对角线，荧光笔使用更扁的笔头", () => {
  const mark: Stroke = { ...base, brush: "block", points: [{ x: 20, y: 20 }, { x: 100, y: 70 }] };
  expect(rectangularOutline(mark)).toContain("10.00 10.00");
  expect(rectangularOutline(mark)).toContain("110.00 80.00");
  expect(rectangularOutline({ ...mark, brush: "marker" })).toContain("10.00 16.40");
});

test("铅笔纹理固定种子，柔边橡皮使用限制在区域内的羽化滤镜", () => {
  const pencil = renderStroke({ ...base, brush: "pencil" }, "pencil", bounds);
  expect(pencil.definitions).toContain('seed="17"');
  expect(pencil.definitions).toContain("feTurbulence");
  expect(pencil).toEqual(renderStroke({ ...base, brush: "pencil" }, "pencil", bounds));
  const soft = renderStroke({ ...base, kind: "eraser", brush: "soft", opacity: .5 }, "soft", bounds);
  expect(soft.definitions).toContain("feGaussianBlur");
  expect(soft.definitions).toContain('filterUnits="userSpaceOnUse" x="0" y="0" width="160" height="80"');
  expect(soft.content).toContain('fill="black" opacity="0.5"');
});

test("荧光笔整条路径只应用一次透明度，不因路径子段重叠而加深", () => {
  const { content } = renderStroke({ ...base, brush: "marker", opacity: .35 }, "marker", bounds);
  expect(content.match(/<path /g)).toHaveLength(1);
  expect(content.match(/opacity=/g)).toHaveLength(1);
  expect(content).toContain('opacity="0.35"');
});

test("模型拒绝跨类型预设、非法透明度/平滑度/压力，同时兼容旧笔画", () => {
  const store = new EditorStore();
  store.create({ x: 0, y: 0, ...bounds }, "region");
  for (const mark of [
    { ...base, brush: "soft" }, { ...base, opacity: -1 }, { ...base, smoothing: NaN },
    { ...base, points: [{ x: 10, y: 10, pressure: 2 }] }, { ...base, pressureMode: "unknown" },
  ] as Stroke[]) {
    expect(validStrokeSettings(mark)).toBe(false);
    expect(store.appendMark("region", mark)).toBe(false);
  }
  const legacy = { kind: "pen" as const, points: [{ x: 10, y: 10 }], width: 4, color: "red" };
  expect(store.appendMark("region", legacy)).toBe(true);
  expect(renderStroke(legacy, "legacy", bounds).content).toContain('stroke="red" stroke-width="4"');
});

test("预设、压力、透明度随笔画保存、撤销和导出，离线文件不引用库", () => {
  const store = new EditorStore();
  store.create({ x: 0, y: 0, ...bounds }, "region");
  const mark: Stroke = { ...base, brush: "ink", pressureMode: "stylus", opacity: .7, points: base.points.map(point => ({ ...point, pressure: .8 })) };
  store.appendMark("region", mark);
  store.undo();
  expect(store.selected!.marks).toHaveLength(0);
  store.redo();
  expect(store.selected!.marks[0]).toEqual(mark);
  const output = exportDocument(store.state.regions);
  expect(output.version).toBe(2);
  expect(output.regions[0]!.marks[0]).toEqual(mark);
  const html = renderHTML(store.state.regions);
  expect(html).toContain('data-brush="ink"');
  expect(html).not.toContain("node_modules");
  expect(html).not.toContain('<script src=');
});
