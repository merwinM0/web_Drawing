import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "playwright";
import type { Helpers } from "./brush-browser";

async function saved(page: Page): Promise<void> {
  await page.locator("#save-drawing").click();
  await page.waitForFunction(() => document.getElementById("save-status")?.textContent === "已保存到此浏览器");
}
export async function checkLibrary(browser: Browser, url: string, helpers: Helpers): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => void dialog.accept());
  const { drag, drawing, point } = helpers;
  const create = async (title: string) => {
    await page.locator("#new-drawing").click(); await page.locator("#new-title").fill(title); await page.locator("#new-submit").click();
    await page.locator("#workbench").waitFor({ state: "visible" });
    return page.url().split("/").at(-1)!;
  };
  try {
    await page.goto(url);
    await page.locator("#home-empty").waitFor({ state: "visible" });
    assert.equal(await page.locator(".drawing-card").count(), 0);
    const firstId = await create("晚风手稿");
    await drag(page, [100, 100], [500, 350]);
    assert.equal(await page.locator('input[type="color"]').count(), 0, "不能使用默认颜色选择器");
    await page.locator("#color-trigger").click();
    await page.locator("#color-dialog").waitFor({ state: "visible" });
    const wheel = await page.locator("#color-wheel").boundingBox();
    assert(wheel);
    const at = (x: number, y: number) => ({ x: wheel.x + x * wheel.width / 240, y: wheel.y + y * wheel.height / 240 });
    const hue = at(120 + 101 * Math.sin(2 * Math.PI / 3), 120 - 101 * Math.cos(2 * Math.PI / 3));
    await page.mouse.click(hue.x, hue.y);
    assert(Math.abs(Number(await page.locator("#color-hue").inputValue()) - 120) <= 1);
    const sv = at(150, 90); await page.mouse.click(sv.x, sv.y);
    assert(Math.abs(Number(await page.locator("#color-saturation").inputValue()) - 73) <= 1);
    await page.locator("#color-hue").focus(); await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#color-hue").inputValue(), "121", "色轮具有等价键盘入口");
    await page.locator("#color-hex").fill("#12Z");
    assert.equal(await page.locator("#color-hex").getAttribute("aria-invalid"), "true");
    await page.locator("#color-hex").fill("#318777");
    const pickerA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(pickerA11y.violations.map(issue => issue.id), [], "色轮无障碍检查失败");
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/color-wheel.png` });
    await page.locator("#color-done").click();
    await drag(page, [150, 180], [450, 260]);
    let data = await drawing(page);
    const original = structuredClone(data.regions[0]!);
    assert.equal(original.marks[0]!.color, "#318777");
    await page.keyboard.press("v"); await drag(page, [200, 200], [330, 270]);
    data = await drawing(page);
    const moved = data.regions[0]!;
    assert.equal(moved.id, original.id); assert.deepEqual(moved.marks, original.marks);
    assert.equal(Math.round(moved.rect.x), 230); assert.equal(Math.round(moved.rect.y), 170);
    await page.keyboard.press("Control+z"); assert.equal(Math.round((await drawing(page)).regions[0]!.rect.x), 100);
    await page.keyboard.press("Control+Shift+z");
    const start = await point(page, 300, 230), end = await point(page, 420, 310);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y);
    await page.keyboard.press("Escape"); await page.mouse.up();
    assert.equal(Math.round((await drawing(page)).regions[0]!.rect.x), 230, "取消移动不会写入模型");
    await page.keyboard.press("v"); await page.keyboard.press("Shift+ArrowRight"); await page.keyboard.press("ArrowDown");
    assert.equal(Math.round((await drawing(page)).regions[0]!.rect.x), 240);
    await page.locator("#region-x").fill("9999"); await page.locator("#region-x").press("Tab");
    assert.equal(Math.round((await drawing(page)).regions[0]!.rect.x), 800, "移动不允许区域出画布");
    await page.locator("#region-x").fill("260"); await page.locator("#region-x").press("Tab");
    await page.keyboard.press("Control+s");
    await page.waitForFunction(() => document.getElementById("save-status")?.textContent === "已保存到此浏览器");
    const snapshot = await drawing(page);
    await page.reload(); await page.locator("#workbench").waitFor({ state: "visible" });
    assert.deepEqual(await drawing(page), snapshot, "重新打开恢复完整可编辑文档");
    assert((await page.locator("#color-trigger").getAttribute("aria-label"))?.includes("#318777"));
    assert.equal(await page.locator("#undo").isDisabled(), true, "历史不跨打开或作品共享");
    await page.keyboard.press("v"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Control+z");
    assert.equal(await page.locator("#save-status").textContent(), "已保存到此浏览器", "撤销到保存点应清除未保存状态");

    // The keyboard save must flush a still-focused region name input.
    await page.locator("#region-name").fill("手绘区"); await page.keyboard.press("Control+s");
    await page.waitForFunction(() => document.getElementById("save-status")?.textContent === "已保存到此浏览器");
    assert.equal((await drawing(page)).regions[0]!.name, "手绘区");
    await page.locator("#drawing-title").fill("晚风手稿 · 未保存");
    await page.locator("#go-home").click(); await page.locator("#confirm-cancel").click();
    assert.equal(await page.locator("#workbench").isVisible(), true, "取消导航应保留工作台");
    await page.locator("#go-home").click(); await page.locator("#confirm-discard").click();
    await page.locator("#home-page").waitFor({ state: "visible" });
    await page.locator(`[data-drawing-id="${firstId}"]`).waitFor();
    assert.equal(await page.locator(`[data-drawing-id="${firstId}"] img`).count(), 1, "保存生成缩略图");
    assert((await page.locator(`[data-drawing-id="${firstId}"]`).textContent())?.includes("晚风手稿"));
    const secondId = await create("植物观察");
    await drag(page, [200, 150], [700, 500]); await drag(page, [250, 250], [600, 430]);
    await page.locator("#go-home").click(); await page.locator("#confirm-save").click();
    await page.locator("#home-page").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelectorAll(".drawing-card").length === 2);
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/home.png`, fullPage: true });
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px 首页溢出`);
      const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      assert.deepEqual(a11y.violations.map(issue => issue.id), [], `${width}px 首页无障碍检查失败`);
      if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/home-${width}.png`, fullPage: true });
      if (width === 320) {
        await page.setViewportSize({ width: 320, height: 720 });
        await page.locator(`[data-drawing-id="${firstId}"]`).click();
        await page.locator("#workbench").waitFor({ state: "visible" });
        await page.locator("#color-trigger").click();
        const bounds = await page.locator("#color-dialog").boundingBox();
        assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320 && bounds.y >= 0 && bounds.y + bounds.height <= 721, "小屏色轮必须在视口内且可滚动");
        const ring = await page.locator("#color-wheel").boundingBox(); assert(ring);
        const touch = await context.newCDPSession(page);
        await touch.send("Emulation.setTouchEmulationEnabled", { enabled: true });
        await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: ring.x + ring.width / 2, y: ring.y + ring.height * 19 / 240 }] });
        await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        assert.equal(await page.locator("#color-hue").inputValue(), "0", "触控可操作自绘色轮");
        await touch.send("Emulation.setTouchEmulationEnabled", { enabled: false }); await touch.detach();
        await page.locator("#color-hex").fill("#318777"); await page.locator("#color-hex").press("Tab");
        if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/color-wheel-320.png` });
        await page.locator("#color-close").click(); await page.locator("#go-home").click();
        await page.locator(`[data-drawing-id="${firstId}"]`).waitFor();
        await page.setViewportSize({ width: 320, height: 1000 });
      }
    }
    await page.locator("#drawing-search").fill("不存在"); assert.equal(await page.locator(".drawing-card").count(), 0);
    await page.locator("#drawing-search").fill("");
    await page.locator(`[data-drawing-id="${firstId}"]`).click();
    await page.locator("#workbench").waitFor({ state: "visible" });
    assert.equal((await drawing(page)).regions[0]!.id, original.id, "多作品数据互不串联");

    // Simulated quota failure preserves old storage and keeps changes dirty.
    await page.locator("#drawing-title").fill("晚风手稿 · 更新");
    await page.evaluate(() => {
      (window as any).originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = () => { throw new DOMException("模拟：存储空间不足", "QuotaExceededError"); };
    });
    await page.locator("#save-drawing").click();
    await page.waitForFunction(() => document.getElementById("notice-text")?.textContent?.includes("空间不足"));
    assert((await page.locator("#save-status").textContent())?.includes("未保存"));
    await page.evaluate(() => { IDBObjectStore.prototype.put = (window as any).originalPut; });
    await saved(page);
    const other = await context.newPage(); other.on("dialog", dialog => void dialog.accept());
    await other.goto(page.url()); await other.locator("#workbench").waitFor({ state: "visible" });
    await page.locator("#drawing-title").fill("晚风手稿 · 最终版"); await saved(page);
    await other.locator("#drawing-title").fill("过时的页面"); await other.locator("#save-drawing").click();
    await other.waitForFunction(() => document.getElementById("notice-text")?.textContent?.includes("其他页面"));
    await other.close({ runBeforeUnload: true });
    await page.reload(); await page.locator("#workbench").waitFor({ state: "visible" });
    assert.equal(await page.locator("#drawing-title").inputValue(), "晚风手稿 · 最终版");
    await page.evaluate(() => { location.hash = "#/drawing/nonexistent"; });
    await page.locator("#home-page").waitFor({ state: "visible" });
    assert((await page.locator("#notice-text").textContent())?.includes("找不到"));
    const card = page.locator(`.drawing-card:has([data-drawing-id="${secondId}"])`);
    await card.getByRole("button", { name: "删除绘画：植物观察", exact: true }).click();
    await page.locator("#confirm-discard").click();
    await page.waitForFunction(() => document.querySelectorAll(".drawing-card").length === 1);
    await page.reload(); await page.locator(`[data-drawing-id="${firstId}"]`).waitFor();
    assert.equal(await page.locator(".drawing-card").count(), 1);
    assert.deepEqual(errors, [], "绘画库流程中不应有运行错误");
    const denied = await browser.newContext();
    try {
      await denied.addInitScript(() => Object.defineProperty(window, "indexedDB", { get() { throw new DOMException("存储权限受限", "SecurityError"); } }));
      const restricted = await denied.newPage();
      await restricted.goto(url); await restricted.locator("#home-error").waitFor({ state: "visible" });
      await restricted.locator("#new-drawing").click(); await restricted.locator("#new-submit").click();
      await restricted.waitForFunction(() => !!document.getElementById("new-error")?.textContent);
      assert.equal(await restricted.locator("#workbench").isVisible(), false, "存储受限不能伪装成创建成功");
    } finally { await denied.close(); }
    console.log("通过：首页创建/列表/搜索/删除、区域移动与微调、圆形色轮、手动保存/恢复、未保存提醒、配额失败和跨页面冲突保护");
  } finally { await context.close(); }
}
