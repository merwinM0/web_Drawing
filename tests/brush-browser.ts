import assert from "node:assert/strict";
import type { Page } from "playwright";
import type { DrawingDocument, Mark, Region } from "../src/document";
import { renderSVG } from "../src/render";

type Helpers = {
  point: (page: Page, x: number, y: number) => Promise<{ x: number; y: number }>;
  drag: (page: Page, from: [number, number], to: [number, number]) => Promise<void>;
  drawing: (page: Page) => Promise<DrawingDocument>;
  download: (page: Page, id: string) => Promise<string>;
};
async function range(page: Page, id: string, value: number): Promise<void> {
  await page.locator(`#${id}`).evaluate((input, value) => {
    (input as HTMLInputElement).value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}
async function pixels(page: Page, marks: Mark[], positions: [number, number][]): Promise<number[][]> {
  const region: Region = { id: "raster", name: "像素回归", rect: { x: 20, y: 20, width: 160, height: 120 }, marks, binding: null };
  return page.evaluate(async ({ svg, positions }) => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1200; canvas.height = 760;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return positions.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data));
    } finally { URL.revokeObjectURL(url); }
  }, { svg: renderSVG([region]), positions });
}

export async function checkBrushes(page: Page, helpers: Helpers): Promise<void> {
  const { drag, drawing, point, download } = helpers;
  await page.reload();
  await page.waitForSelector('[data-tool="region"][aria-pressed="true"]');
  await drag(page, [100, 100], [900, 500]);
  for (const [index, id] of ["round", "ink", "pencil", "marker"].entries()) {
    await page.locator("#pen-preset").selectOption(id);
    if (id === "ink") {
      await range(page, "stroke-size", 30);
      await range(page, "stroke-opacity", 60);
      await range(page, "stroke-smoothing", 80);
    }
    await drag(page, [200, 180 + index * 70], [1100, 180 + index * 70]);
    const mark = (await drawing(page)).regions[0]!.marks.at(-1)!;
    assert.equal(mark.brush, id);
    assert.equal(mark.pressureMode, id === "ink" || id === "pencil" ? "simulated" : "constant");
    assert.equal(await page.locator(`#region-layer [data-brush="${id}"]`).count(), 1);
  }
  await page.locator("#pen-preset").selectOption("ink");
  assert.equal(await page.locator("#stroke-size").inputValue(), "30", "每种画笔记住自己的大小");
  assert.equal(await page.locator("#stroke-opacity").inputValue(), "60");
  assert.equal(await page.locator("#stroke-smoothing").inputValue(), "80");
  await page.getByLabel("启用压感", { exact: true }).uncheck();
  await drag(page, [240, 430], [650, 430]);
  assert.equal((await drawing(page)).regions[0]!.marks.at(-1)!.pressureMode, "constant");
  await page.getByLabel("启用压感", { exact: true }).check();

  // Chromium pen events exercise real pressure capture, not mouse pressure=.5.
  const cdp = await page.context().newCDPSession(page);
  for (const [index, [x, force]] of [[250, .1], [350, .75], [500, .4], [600, 0]].entries()) {
    const location = await point(page, x!, 460);
    await cdp.send("Input.dispatchMouseEvent", {
      type: index === 0 ? "mousePressed" : index === 3 ? "mouseReleased" : "mouseMoved",
      ...location, button: "left", buttons: index === 3 ? 0 : 1, clickCount: 1, pointerType: "pen", force,
    });
  }
  await cdp.detach();
  const penMark = (await drawing(page)).regions[0]!.marks.at(-1)!;
  assert.equal(penMark.pressureMode, "stylus");
  assert(penMark.points.some(sample => Math.abs((sample.pressure ?? 0) - .75) < .01));
  assert.equal(penMark.points.at(-1)!.pressure, penMark.points.at(-2)!.pressure, "抬笔 pressure=0 不压扁最后一段");

  await page.getByRole("button", { name: "橡皮擦", exact: true }).click();
  for (const [index, id] of ["hard", "soft", "block"].entries()) {
    await page.locator("#eraser-preset").selectOption(id);
    if (id === "soft") { await range(page, "stroke-size", 60); await range(page, "stroke-opacity", 40); }
    await drag(page, [240, 180 + index * 70], [700, 180 + index * 70]);
    assert.equal((await drawing(page)).regions[0]!.marks.at(-1)!.brush, id);
  }
  await page.locator("#eraser-preset").selectOption("soft");
  assert.equal(await page.locator("#stroke-size").inputValue(), "60");
  assert.equal(await page.locator("#stroke-opacity").inputValue(), "40");
  const location = await point(page, 400, 300);
  await page.mouse.move(location.x, location.y);
  assert.equal(await page.locator("#brush-cursor circle").count(), 2, "柔边橡皮显示笔头和羽化范围");
  const beforeUndo = (await drawing(page)).regions[0]!.marks.length;
  await page.locator("#undo").click();
  assert.equal((await drawing(page)).regions[0]!.marks.length, beforeUndo - 1);
  await page.locator("#redo").click();
  assert.equal((await drawing(page)).regions[0]!.marks.length, beforeUndo);
  const svg = await download(page, "export-svg");
  assert(!svg.includes("brush-cursor") && !svg.includes("brush-filter-preview"));
  assert(svg.includes("feTurbulence") && svg.includes("feGaussianBlur"));
  const html = await download(page, "export");
  const offline = await page.context().newPage();
  const requests: string[] = [];
  offline.on("request", request => requests.push(request.url()));
  await offline.setContent(html);
  assert.equal(await offline.locator("[data-brush]").count(), beforeUndo);
  assert.deepEqual(requests, [], "导出网页不应加载外部笔刷依赖");
  await offline.close();
  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/brushes.png`, fullPage: true });
  console.log("通过：四种画笔、三种橡皮、独立设置、真实压力采集、草稿/历史和离线笔触导出");

  const line: Mark = { kind: "pen", brush: "round", color: "#000000", width: 70, smoothing: 0, pressureMode: "constant", points: [{ x: 0, y: 50 }, { x: 180, y: 50 }] };
  const erase: Mark = { ...line, kind: "eraser", brush: "hard", width: 30, opacity: .5, points: [{ x: 40, y: 50 }, { x: 110, y: 50 }] };
  const once = await pixels(page, [line, erase], [[90, 70]]);
  const twice = await pixels(page, [line, erase, erase], [[90, 70]]);
  assert(Math.abs(once[0]![0]! - 128) < 3);
  assert(Math.abs(twice[0]![0]! - 191) < 3, "低强度橡皮重复擦除应继续减淡");
  const soft = await pixels(page, [line, { ...erase, brush: "soft", opacity: 1 }], [[90, 70], [90, 90], [19, 70]]);
  assert(soft[0]![0]! > soft[1]![0]! + 80, "柔边橡皮边缘应渐变而不是硬边");
  assert.deepEqual(soft[2], [255, 255, 255, 255], "羽化不得越出框");
  const after = await pixels(page, [line, erase, { ...line, color: "#0000ff", width: 4 }], [[90, 70]]);
  assert.deepEqual(after[0], [0, 0, 255, 255], "后画笔画不受先前擦除强度影响");
  const marker = await pixels(page, [{ ...line, brush: "marker", color: "#ff0000", width: 30, opacity: .35, points: [{ x: 10, y: 50 }, { x: 130, y: 50 }, { x: 10, y: 50 }] }], [[90, 70]]);
  assert(Math.abs(marker[0]![1]! - 166) < 3, "荧光笔同笔画折返不重复加深");
  const grain = await pixels(page, [{ ...line, brush: "pencil", width: 24 }], Array.from({ length: 70 }, (_, i) => [50 + i, 70]));
  const grays = grain.map(pixel => pixel[0]!);
  assert(Math.max(...grays) - Math.min(...grays) > 20, "铅笔应有可见颗粒纹理");
  for (const brush of ["round", "ink", "pencil", "marker"] as const) {
    const outside = await pixels(page, [{ ...line, brush, pressureMode: "simulated", width: 60 }], [[19, 70], [180, 70]]);
    assert(outside.every(pixel => pixel.join(",") === "255,255,255,255"), `${brush} 越界`);
  }
  console.log("通过：新笔触真实像素回归——透明度叠加、柔边羽化、铅笔纹理、边界裁剪和擦除时序");
}
