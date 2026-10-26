import { expect, test } from "bun:test";
import { EditorStore, type Mark } from "../src/document";
import { exportDocument, renderHTML, scriptJSON } from "../src/export";
import { renderOutlines, renderRegions, renderSVG } from "../src/render";

const pen = (color: string): Mark => ({ kind: "pen", points: [{ x: 10, y: 10 }, { x: 300, y: 10 }], width: 10, color });
function fixture(): EditorStore {
  const store = new EditorStore();
  store.create({ x: 50, y: 60, width: 200, height: 100 }, "first");
  store.appendMark("first", pen("red"));
  store.appendMark("first", { ...pen("black"), kind: "eraser" });
  store.appendMark("first", pen("blue"));
  store.create({ x: 100, y: 80, width: 200, height: 100 }, "second");
  store.appendMark("second", pen("green"));
  return store;
}

test("每框具有独立裁剪和局部坐标，导出顺序与图层顺序相同", () => {
  const markup = renderSVG(fixture().state.regions);
  expect(markup).toContain('clipPathUnits="userSpaceOnUse"><rect width="200" height="100"');
  expect(markup).toContain('transform="translate(50 60)"');
  expect(markup).toContain('clip-path="url(#region-clip-first)"');
  expect(markup.indexOf('data-region-id="first"')).toBeLessThan(markup.indexOf('data-region-id="second"'));
  expect(markup).not.toContain("region-outline");
  expect(markup).not.toContain("editor-overlay");
});

test("橡皮仅遮罩本框之前的笔画，不覆盖后画笔画或其他区域", () => {
  const markup = renderRegions(fixture().state.regions);
  expect(markup).toContain('<g mask="url(#region-erase-first-1)"><path');
  expect(markup).toContain('stroke="red" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></g><path');
  expect(markup).toContain('stroke="blue"');
  expect(markup).not.toContain("region-erase-second");
});

test("临时笔画只用于预览，不进入文档或导出结果", () => {
  const store = fixture();
  const preview = { regionId: "second", mark: pen("#abcdef") };
  expect(renderRegions(store.state.regions, preview)).toContain("#abcdef");
  expect(renderSVG(store.state.regions)).not.toContain("#abcdef");
  expect(store.selected?.marks).toHaveLength(1);
});

test("导出 HTML 保留区域数据、整个框的命中面和按区域激活的事件接口", () => {
  const store = fixture();
  const data = exportDocument(store.state.regions);
  expect(data).toMatchObject({ version: 1, width: 1200, height: 760 });
  data.regions[0]!.name = "外部修改";
  expect(store.state.regions[0]!.name).toBe("区域 1");
  const html = renderHTML(store.state.regions);
  expect(html).toContain('id="drawing-document"');
  expect(html).toContain("webdrawing:region-activate");
  expect(html).toContain("regionId: region.id, binding: region.binding");
  expect(html).toContain("data-region-hitbox");
  expect(html).toContain('tabindex="0" role="group"');
  expect(html).not.toContain("data-button-id");
  expect(html).not.toContain("region-outline");
});

test("名称和未来绑定内容在 SVG 与 HTML 中安全转义", () => {
  const store = fixture();
  store.rename('</script><img src=x onerror="alert(1)">');
  store.selected!.binding = { event: "activate", action: "test", payload: { text: "</script><script>alert(1)</script>" } };
  const html = renderHTML(store.state.regions);
  expect(html).not.toContain("<img");
  expect(html).not.toContain("<script>alert(1)");
  expect(html).toContain("&lt;/script&gt;");
  const serialized = scriptJSON(exportDocument(store.state.regions));
  expect(serialized).not.toContain("</script>");
  expect(JSON.parse(serialized).regions[1].binding.payload.text).toBe("</script><script>alert(1)</script>");
  expect(renderOutlines(store.state.regions, store.state.selectedRegionId)).not.toContain("<img");
});
