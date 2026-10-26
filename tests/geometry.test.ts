import { expect, test } from "bun:test";
import { clampPoint, containsPoint, localPoint, pathData, regionRect, validRect } from "../src/geometry";

test("框选支持反向拖动，并约束在画布内", () => {
  expect(regionRect({ x: 200, y: 200 }, { x: 100, y: 140 })).toEqual({ x: 100, y: 140, width: 100, height: 60 });
  expect(regionRect({ x: -10, y: -10 }, { x: 1300, y: 800 })).toEqual({ x: 0, y: 0, width: 1200, height: 760 });
});

test("单击、过小和零宽高框选不创建默认组件", () => {
  expect(regionRect({ x: 20, y: 20 }, { x: 20, y: 20 })).toBeNull();
  expect(regionRect({ x: 20, y: 20 }, { x: 25, y: 50 })).toBeNull();
  expect(regionRect({ x: 20, y: 20 }, { x: 32, y: 32 })).not.toBeNull();
});

test("精确区域拒绝非有限值、越界和负数尺寸", () => {
  for (const rect of [
    { x: 1190, y: 0, width: 20, height: 20 }, { x: 0, y: 750, width: 20, height: 20 },
    { x: -1, y: 0, width: 20, height: 20 }, { x: 0, y: 0, width: -20, height: 20 },
    { x: NaN, y: 0, width: 20, height: 20 }, { x: 0, y: Infinity, width: 20, height: 20 },
  ]) expect(validRect(rect)).toBe(false);
});

test("命中包含边缘，局部坐标不钳制出框采样，避免边框伪线", () => {
  const rect = { x: 100, y: 50, width: 80, height: 60 };
  expect(containsPoint(rect, { x: 180, y: 110 })).toBe(true);
  expect(containsPoint(rect, { x: 181, y: 110 })).toBe(false);
  expect(localPoint(rect, { x: 90, y: 120 })).toEqual({ x: -10, y: 70 });
  expect(clampPoint({ x: -10, y: 800 })).toEqual({ x: 0, y: 760 });
});

test("空路径、单点、重复点和连续路径正常序列化", () => {
  expect(pathData([])).toBe("");
  expect(pathData([{ x: 1, y: 2 }])).toBe("M 1.0 2.0 L 1.01 2.0");
  expect(pathData([{ x: 1, y: 2 }, { x: 1, y: 2 }])).toBe("M 1.0 2.0 L 1.01 2.0");
  expect(pathData([{ x: 1, y: 2 }, { x: 4, y: 5 }])).toBe("M 1.0 2.0 L 4.0 5.0");
});
