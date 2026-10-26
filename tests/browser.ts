import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "playwright";
import type { DrawingDocument, Mark, Region } from "../src/document";
import { renderSVG } from "../src/render";
import { checkBrushes } from "./brush-browser";
import { checkLibrary } from "./library-browser";

const probe = Bun.serve({ port: 0, fetch: () => new Response() });
const port = probe.port!;
probe.stop(true);
const server = Bun.spawn(["bun", process.env.E2E_STATIC ? "tests/static-server.ts" : "server.ts"], { env: { ...process.env, PORT: String(port) }, stdout: "ignore", stderr: "inherit" });
const url = `http://localhost:${port}`;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

async function point(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.locator("#artboard").evaluate((element, input) => {
    const p = new DOMPoint(input.x, input.y).matrixTransform((element as SVGSVGElement).getScreenCTM()!);
    return { x: p.x, y: p.y };
  }, { x, y });
}
async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await point(page, ...from);
  const b = await point(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}
async function download(page: Page, id: string): Promise<string> {
  const waiting = page.waitForEvent("download");
  // Programmatic click also allows checking export during an active draft.
  await page.evaluate(id => document.getElementById(id)!.click(), id);
  const file = await waiting;
  return Bun.file((await file.path())!).text();
}
async function drawing(page: Page): Promise<DrawingDocument> {
  return JSON.parse(await download(page, "export-json"));
}
async function countMarks(page: Page): Promise<number> {
  return (await drawing(page)).regions.reduce((sum, region) => sum + region.marks.length, 0);
}

try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch { /* server starting */ }
    await Bun.sleep(100);
  }
  assert(ready, "开发服务器未启动");
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("dialog", dialog => void dialog.accept());
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(url);
  await page.locator("#new-drawing").click();
  await page.locator("#new-title").fill("回归绘画");
  await page.locator("#new-submit").click();
  await page.locator("#workbench").waitFor({ state: "visible" });
  await page.waitForSelector('[data-tool="region"][aria-pressed="true"]');
  assert.equal(await page.locator('[data-tool="button"]').count(), 0);
  await page.getByRole("button", { name: "画笔", exact: true }).click();
  await drag(page, [50, 50], [150, 150]);
  assert.equal((await drawing(page)).regions.length, 0, "未框选不能画背景");

  await page.getByRole("button", { name: "框选新区域", exact: true }).click();
  await drag(page, [400, 300], [100, 100]);
  assert.equal(await page.locator('[data-tool="pen"]').getAttribute("aria-pressed"), "true");
  await drag(page, [150, 180], [600, 180]);
  assert.equal(await countMarks(page), 1);
  await drag(page, [500, 200], [150, 200]);
  assert.equal(await countMarks(page), 1, "必须从选中框内起笔");
  const first = (await drawing(page)).regions[0]!;
  assert.deepEqual(Object.fromEntries(Object.entries(first.rect).map(([key, value]) => [key, Math.round(value)])), { x: 100, y: 100, width: 300, height: 200 });
  assert(first.marks[0]!.points.at(-1)!.x > first.rect.width, "保留越界路径，由裁剪而非逐点钳制限制显示");

  await page.keyboard.press("r");
  await drag(page, [200, 150], [500, 350]);
  const second = (await drawing(page)).regions[1]!;
  await drag(page, [240, 220], [480, 220]);
  assert.equal(await countMarks(page), 2);
  await page.locator(`[data-region-select="${first.id}"]`).click();
  await page.getByRole("button", { name: "上移一层", exact: true }).click();
  assert.deepEqual((await drawing(page)).regions.map(region => region.id), [second.id, first.id]);
  await page.keyboard.press("v");
  const overlap = await point(page, 250, 200);
  await page.mouse.click(overlap.x, overlap.y);
  assert.equal(await page.locator(".layer-item.selected").getAttribute("data-region-select"), first.id);
  await page.locator(`[data-region-select="${second.id}"]`).click();
  await page.keyboard.press("e");
  await drag(page, [250, 220], [450, 220]);
  let data = await drawing(page);
  assert.deepEqual(data.regions.find(region => region.id === second.id)!.marks.map(mark => mark.kind), ["pen", "eraser"]);
  assert.equal(data.regions.find(region => region.id === first.id)!.marks.length, 1);

  // Draft cancellation and preview-free export.
  await page.keyboard.press("p");
  const start = await point(page, 240, 230);
  const end = await point(page, 470, 250);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  assert.equal(await countMarks(page), 3, "导出不包含未完成笔画");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(await countMarks(page), 3, "Esc 不提交临时笔画");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.locator("#artboard").dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  assert.equal(await countMarks(page), 3, "pointercancel 不提交临时笔画");

  const name = page.getByLabel("区域名称", { exact: true });
  await name.fill('<img src=x onerror="alert(1)">');
  await name.press("Tab");
  assert.equal(await page.locator("#layer-list img").count(), 0);
  await page.locator(`[data-region-select="${second.id}"]`).click();
  await page.keyboard.press("Delete");
  assert.equal((await drawing(page)).regions.length, 1);
  await page.keyboard.press("Control+z");
  assert.equal((await drawing(page)).regions.length, 2);
  await page.keyboard.press("Control+Shift+z");
  assert.equal((await drawing(page)).regions.length, 1);
  await page.keyboard.press("Control+z");
  data = await drawing(page);
  assert.equal(data.regions.length, 2);
  const editorAccessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  assert.deepEqual(editorAccessibility.violations.map(issue => issue.id), [], "区域属性面板存在无障碍问题");
  const svg = await download(page, "export-svg");
  assert(!svg.includes("editor-overlay") && !svg.includes("region-outline"));
  assert(svg.includes("clipPath") && svg.includes("mask"));
  const html = await download(page, "export");
  const exported = await context.newPage();
  await exported.setContent(html);
  await exported.evaluate(() => {
    (window as any).activations = [];
    document.addEventListener("webdrawing:region-activate", event => (window as any).activations.push((event as CustomEvent).detail));
  });
  await exported.locator(`[data-region-id="${second.id}"]`).focus();
  await exported.keyboard.press("Enter");
  assert.deepEqual(await exported.evaluate(() => (window as any).activations[0]), { regionId: second.id, binding: null });
  await exported.locator(`[data-region-id="${first.id}"]`).click({ position: { x: 100, y: 100 }, force: true });
  assert.equal(await exported.evaluate(() => (window as any).activations.at(-1).regionId), first.id);
  await exported.close();
  console.log("通过：框选、绘画限制、重叠层级、橡皮隔离、撤销重做、取消草稿和离线导出事件");

  // Real raster samples ensure clipping/masks are correct, not just SVG strings.
  const line = (kind: "pen" | "eraser", color: string, x1: number, x2: number, width: number): Mark => ({ kind, color, width, points: [{ x: x1, y: 50 }, { x: x2, y: 50 }] });
  const fixture: Region[] = [
    { id: "lower", name: "底层", rect: { x: 20, y: 20, width: 100, height: 100 }, binding: null, marks: [line("pen", "#ff0000", 10, 200, 20)] },
    { id: "upper", name: "上层", rect: { x: 70, y: 20, width: 100, height: 100 }, binding: null, marks: [line("pen", "#00ff00", 10, 200, 20), line("eraser", "#000000", 20, 70, 12), line("pen", "#0000ff", 55, 65, 4)] },
  ];
  const pixels = await page.evaluate(async markup => {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
    try {
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1200; canvas.height = 760;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      return [10, 60, 115, 130, 140, 160, 180].map(x => Array.from(context.getImageData(x, 70, 1, 1).data));
    } finally { URL.revokeObjectURL(url); }
  }, renderSVG(fixture));
  assert.deepEqual(pixels, [[255, 255, 255, 255], [255, 0, 0, 255], [255, 0, 0, 255], [0, 0, 255, 255], [255, 255, 255, 255], [0, 255, 0, 255], [255, 255, 255, 255]]);
  console.log("通过：真实像素验证裁剪、透明橡皮、下层显露、后画笔画和图层叠加");

  await checkBrushes(page, { point, drag, drawing, download });

  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.reload();
    await page.waitForSelector('[data-tool="region"][aria-pressed="true"]');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px 页面横向溢出`);
    const toolbar = await page.locator(".toolbar").boundingBox();
    assert(toolbar && toolbar.x + toolbar.width <= width + 1, `${width}px 工具栏溢出`);
    if (width === 320) {
      await page.getByRole("button", { name: "展开侧边栏", exact: true }).click();
      await page.locator("#precise-create summary").click();
      await page.locator('[name="x"]').fill("1100");
      await page.getByRole("button", { name: "创建并选中", exact: true }).click();
      assert.equal((await drawing(page)).regions.length, 0, "精确创建拒绝超出画布的区域");
      assert((await page.locator("#form-error").textContent())?.includes("画布内"));
      await page.locator('[name="x"]').fill("60");
      await page.getByRole("button", { name: "创建并选中", exact: true }).click();
      assert.equal((await drawing(page)).regions.length, 1, "小屏可用表单创建区域");
      await page.getByRole("button", { name: "收起侧边栏", exact: true }).click();
    }
    if (width !== 320) {
      await drag(page, [100, 100], [700, 450]);
    }
    await page.getByRole("button", { name: "画笔", exact: true }).click();
    await page.locator("#pen-preset").selectOption("ink");
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(accessibility.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) })), [], `${width}px 存在无障碍问题`);
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${width}.png`, fullPage: true });
  }
  await checkLibrary(browser, url, { point, drag, drawing, download });
  assert.deepEqual(errors, [], "浏览器不应有运行错误");
  console.log("通过：320 / 768 / 1024 / 1440 响应式布局、小屏精确创建与 axe WCAG 2.1 AA 检查");
} finally {
  await browser?.close();
  server.kill();
  await server.exited;
}
