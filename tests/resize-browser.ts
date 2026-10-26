import assert from "node:assert/strict";
import type { Browser, Page } from "playwright";
import type { Region } from "../src/document";
import { renderSVG } from "../src/render";
import type { Helpers } from "./brush-browser";

async function raster(page: Page, region: Region): Promise<number[][]> {
  return page.evaluate(async svg => {
    const image = new Image(), url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      image.src = url; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 760;
      const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
      return [[80, 90], [280, 90], [80, 140], [280, 140], [80, 83], [80, 87], [150, 90]].map(([x, y]) => Array.from(context.getImageData(x!, y!, 1, 1).data));
    } finally { URL.revokeObjectURL(url); }
  }, renderSVG([region]));
}

export async function checkResize(browser: Browser, url: string, helpers: Helpers): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("dialog", dialog => void dialog.accept());
  const { drag, drawing, point, download } = helpers;
  const model = async () => (await drawing(page)).regions[0]!;
  const dimensions = async () => {
    const { x, y, width, height } = (await model()).rect;
    return [x, y, width, height].map(Math.round);
  };
  try {
    await page.goto(url); await page.locator("#home-empty").waitFor({ state: "visible" });
    assert.equal(await page.locator(".home-brand .brand-mark > span").count(), 3, "首页恢复三层叠框 Logo");
    assert.equal(await page.locator(".home-brand .brand-mark").textContent(), "", "Logo 不再使用字体符号替代");
    assert.equal(await page.locator(".home-brand .brand-mark").evaluate(element => getComputedStyle(element).backgroundColor), "rgb(99, 89, 233)");
    await page.locator("#new-drawing").click(); await page.locator("#new-title").fill("裁剪范围回归"); await page.locator("#new-submit").click();
    await page.locator("#workbench").waitFor({ state: "visible" });
    assert.equal(await page.locator(".work-brand .brand-mark > span").count(), 3, "工作台共用恢复后的 Logo");
    await drag(page, [100, 100], [500, 400]); await drag(page, [160, 180], [600, 180]);
    await page.keyboard.press("e"); await drag(page, [200, 180], [400, 180]);
    const original = structuredClone(await model());
    await page.keyboard.press("v"); assert.equal(await page.locator("[data-resize-handle]").count(), 3);
    const a = await point(page, 500, 400), b = await point(page, 650, 500);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 });
    assert.deepEqual(await dimensions(), [100, 100, 400, 300], "范围预览未完成时不写入模型或导出");
    assert(Math.abs(Number(await page.locator("#region-layer clipPath rect").getAttribute("width")) - 550) < .1, "拖动预览应立即改变裁剪窗口");
    await page.mouse.up(); assert.deepEqual(await dimensions(), [100, 100, 550, 400]);
    assert.deepEqual((await model()).marks, original.marks);
    await page.keyboard.press("p"); assert.equal(await page.locator("[data-resize-handle]").count(), 0, "画笔模式不展示或抢占缩放拖柄");
    await drag(page, [600, 300], [620, 350]);
    const marks = structuredClone((await model()).marks);
    assert.equal(marks.length, 3, "扩大后可在新增范围起笔");
    await page.keyboard.press("v");
    await drag(page, [650, 300], [450, 340]); assert.deepEqual(await dimensions(), [100, 100, 350, 400], "右侧拖柄只调宽度");
    await drag(page, [275, 500], [300, 450]); assert.deepEqual(await dimensions(), [100, 100, 350, 350], "下侧拖柄只调高度");
    await page.keyboard.press("Control+z"); assert.deepEqual(await dimensions(), [100, 100, 350, 400], "一次拖动只增加一个历史步骤");
    await page.keyboard.press("Control+Shift+z");
    const start = await point(page, 450, 450), end = await point(page, 560, 560);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y);
    await page.keyboard.press("Escape"); await page.mouse.up(); assert.deepEqual(await dimensions(), [100, 100, 350, 350]);
    await page.keyboard.press("v"); await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y);
    await page.locator("#artboard").dispatchEvent("pointercancel", { pointerId: 1 }); await page.mouse.up();
    assert.deepEqual(await dimensions(), [100, 100, 350, 350], "取消指针不提交范围修改");
    await page.locator("#region-width").fill("9999"); await page.locator("#region-width").press("Tab");
    assert.equal((await dimensions())[2], 1100);
    await page.locator("#region-height").fill("1"); await page.locator("#region-height").press("Tab");
    assert.equal((await dimensions())[3], 12);
    await page.locator("#region-height").fill("200"); await page.locator("#region-height").press("Tab");
    await page.locator("#region-width").fill("180"); await page.keyboard.press("Control+s");
    await page.waitForFunction(() => document.getElementById("save-status")?.textContent === "已保存到此浏览器");
    assert.deepEqual((await model()).marks, marks, "缩小时隐藏内容不能被删除或重写");
    await page.reload(); await page.locator("#workbench").waitFor({ state: "visible" });
    assert.deepEqual(await dimensions(), [100, 100, 180, 200]); assert.deepEqual((await model()).marks, marks);
    await drag(page, [400, 150], [200, 180]); assert.equal((await model()).marks.length, 3, "缩小后不能从框外起笔");
    await page.locator("#region-width").fill("550"); await page.locator("#region-width").press("Tab");
    await page.locator("#region-height").fill("400"); await page.locator("#region-height").press("Tab");
    assert.deepEqual((await model()).marks, marks, "重新扩大后仍使用原始坐标、宽度和压力");
    await page.getByRole("button", { name: "选择区域", exact: true }).click();
    const svg = await download(page, "export-svg"); assert(!svg.includes("resize-handle") && !svg.includes("scale("));
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/region-resize.png`, fullPage: true });
    const desktopHandle = await page.locator('[data-resize-handle="se"]').boundingBox(); assert(desktopHandle);
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.waitForFunction(() => Math.abs(document.querySelector('[data-resize-handle="se"]')!.getBoundingClientRect().width - 8) < .1);
    const resizedHandle = await page.locator('[data-resize-handle="se"]').boundingBox(); assert(resizedHandle);
    assert(Math.abs(resizedHandle.width - desktopHandle.width) < .1, "拖柄屏幕尺寸不随画布缩小");
    const touchStart = await point(page, 650, 500), touchEnd = await point(page, 750, 550);
    const touch = await context.newCDPSession(page);
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchStart] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [touchEnd] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false }); await touch.detach();
    assert.deepEqual(await dimensions(), [100, 100, 650, 450], "小屏触控可调整范围");
    assert.deepEqual((await model()).marks, marks);

    const region: Region = { id: "pixels", name: "范围", binding: null, rect: { x: 50, y: 50, width: 300, height: 160 }, marks: [
      { kind: "pen", brush: "round", width: 12, color: "#000000", pressureMode: "constant", smoothing: 0, points: [{ x: 10, y: 40 }, { x: 280, y: 40 }] },
      { kind: "pen", brush: "pencil", width: 20, color: "#000000", pressureMode: "constant", points: [{ x: 10, y: 90 }, { x: 280, y: 90 }] },
      { kind: "eraser", brush: "soft", width: 24, color: "#000000", opacity: .7, points: [{ x: 90, y: 40 }, { x: 110, y: 40 }] },
    ] };
    const before = await raster(page, region);
    const cropped = await raster(page, { ...region, rect: { ...region.rect, width: 140, height: 120 } });
    for (const index of [0, 2, 4, 5, 6]) assert.deepEqual(cropped[index], before[index], "缩小不改变剩余墨迹的位置、线宽、纹理或橡皮效果");
    assert.deepEqual(cropped[1], [255, 255, 255, 255]); assert.deepEqual(cropped[3], [255, 255, 255, 255]);
    assert.notDeepEqual(before[1], cropped[1]); assert.notDeepEqual(before[3], cropped[3]);
    assert.deepEqual(await raster(page, region), before, "恢复范围后可还原隐藏笔画");
    assert.deepEqual(errors, []);
    console.log("通过：原叠框 Logo、范围拖柄/宽高输入、缩小保留/扩大恢复、不缩放像素、取消/撤销、存储与导出");
  } finally { await context.close(); }
}
