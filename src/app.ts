import { EditorStore, hitTest, type Mark, type Tool } from "./document";
import { $ } from "./dom";
import { download, exportDocument, renderHTML } from "./export";
import { containsPoint, localPoint, regionRect, type Point, type Rect } from "./geometry";
import { renderOutlines, renderRegions, renderSVG } from "./render";
import { RegionPanel } from "./sidebar";

type Draft =
  | { tool: "region"; start: Point; end: Point; pointerId: number }
  | { tool: "pen" | "eraser"; regionId: string; rect: Rect; mark: Mark; pointerId: number };
const store = new EditorStore();
const artboard = $<SVGSVGElement>("artboard");
const colorInput = $<HTMLInputElement>("stroke-color");
const sizeInput = $<HTMLInputElement>("stroke-size");
let tool: Tool = "region";
let draft: Draft | null = null;
let frame = 0;
const panel = new RegionPanel(store, () => { cancelDraft(); renderUI(); }, id => {
  cancelDraft();
  store.select(id);
  tool = "pen";
  renderUI();
}, createRegion);

function hint(message: string): void { $("mode-hint").textContent = message; }
function getPoint(event: PointerEvent): Point {
  const matrix = artboard.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}
function cancelDraft(): void {
  const pointerId = draft?.pointerId;
  draft = null;
  if (pointerId !== undefined && artboard.hasPointerCapture(pointerId)) artboard.releasePointerCapture(pointerId);
  cancelAnimationFrame(frame);
  frame = 0;
}
function renderCanvas(): void {
  const preview = draft && draft.tool !== "region" ? { regionId: draft.regionId, mark: draft.mark } : undefined;
  $("region-layer").innerHTML = renderRegions(store.state.regions, preview);
  const rect = draft?.tool === "region" ? regionRect(draft.start, draft.end) ?? undefined : undefined;
  $("editor-overlay").innerHTML = renderOutlines(store.state.regions, store.state.selectedRegionId, rect);
  $("canvas-empty").classList.toggle("hidden", store.state.regions.length > 0 || draft !== null);
}
function renderUI(): void {
  renderCanvas();
  panel.render();
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    const active = button.dataset.tool === tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  artboard.style.cursor = tool === "select" ? "default" : "crosshair";
  const selected = store.selected;
  hint(tool === "region" ? "拖拽创建区域（至少 12 × 12 px），完成后自动切换画笔。"
    : tool === "select" ? "点击选择最上层区域；重叠处的下层区域请从左侧图层列表选择。"
    : !selected ? "请先框选一个区域，或从左侧列表选择已有区域。"
    : `当前：${selected.name} · ${tool === "pen" ? "只在此框内绘画，超出部分会裁剪。" : "只擦除此框内已有的笔画，不影响其他区域。"}`);
  $("status-mode").textContent = tool === "region" ? "框选新区域" : tool === "select" ? "选择区域" : `${selected?.name ?? "未选择区域"} · ${tool === "pen" ? "画笔" : "橡皮"}`;
  $("status-count").textContent = `${store.state.regions.length} 个区域 · ${store.state.regions.reduce((sum, region) => sum + region.marks.filter(mark => mark.kind === "pen").length, 0)} 条笔画`;
  $<HTMLButtonElement>("undo").disabled = !store.canUndo;
  $<HTMLButtonElement>("redo").disabled = !store.canRedo;
}
function setTool(next: Tool): void { cancelDraft(); tool = next; renderUI(); }
function createRegion(rect: Rect): void {
  cancelDraft();
  if (store.create(rect)) tool = "pen";
  renderUI();
}
function travelHistory(redo = false): void {
  cancelDraft();
  if (redo) store.redo(); else store.undo();
  if (!store.selected && (tool === "pen" || tool === "eraser")) tool = "region";
  renderUI();
}

artboard.addEventListener("pointerdown", event => {
  if (event.button !== 0 || !event.isPrimary || draft) return;
  event.preventDefault();
  const start = getPoint(event);
  if (tool === "select") {
    store.select(hitTest(store.state.regions, start)?.id ?? null);
    renderUI();
    return;
  }
  if (tool === "region") draft = { tool, start, end: start, pointerId: event.pointerId };
  else {
    const selected = store.selected;
    if (!selected || !containsPoint(selected.rect, start)) {
      hint(selected ? "请从当前区域框内起笔；选择其他框请按 V 或点击左侧图层。" : "还没有选中区域，请按 R 框选后再绘画。");
      return;
    }
    draft = { tool, regionId: selected.id, rect: selected.rect, pointerId: event.pointerId, mark: {
      kind: tool, points: [localPoint(selected.rect, start)], color: colorInput.value,
      width: tool === "eraser" ? Math.max(10, Number(sizeInput.value) * 2) : Number(sizeInput.value),
    } };
  }
  artboard.setPointerCapture(event.pointerId);
  renderCanvas();
});
artboard.addEventListener("pointermove", event => {
  const point = getPoint(event);
  $("coordinates").textContent = `X ${Math.round(point.x)} · Y ${Math.round(point.y)}`;
  if (!draft || draft.pointerId !== event.pointerId) return;
  if (draft.tool === "region") draft.end = point;
  else draft.mark.points.push(localPoint(draft.rect, point));
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; renderCanvas(); });
});
artboard.addEventListener("pointerup", event => {
  if (!draft || draft.pointerId !== event.pointerId) return;
  const finished = draft;
  const end = getPoint(event);
  cancelDraft();
  if (finished.tool === "region") {
    const rect = regionRect(finished.start, end);
    if (rect) createRegion(rect);
    else { renderUI(); hint("未创建区域：请拖出至少 12 × 12 px 的框。"); }
  } else {
    finished.mark.points.push(localPoint(finished.rect, end));
    store.appendMark(finished.regionId, finished.mark);
    renderUI();
  }
});
for (const event of ["pointercancel", "lostpointercapture"] as const) {
  artboard.addEventListener(event, pointer => {
    if (draft?.pointerId === pointer.pointerId) { cancelDraft(); renderCanvas(); }
  });
}
artboard.addEventListener("pointerleave", () => { if (!draft) $("coordinates").textContent = "X — · Y —"; });
window.addEventListener("blur", () => { cancelDraft(); renderCanvas(); });
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
  button.addEventListener("click", () => setTool(button.dataset.tool as Tool));
}
$("undo").addEventListener("click", () => travelHistory());
$("redo").addEventListener("click", () => travelHistory(true));
sizeInput.addEventListener("input", () => { $("size-value").textContent = sizeInput.value; });
$("export-svg").addEventListener("click", () => download(`<?xml version="1.0" encoding="UTF-8"?>\n${renderSVG(store.state.regions)}`, "web-drawing.svg", "image/svg+xml;charset=utf-8"));
$("export-json").addEventListener("click", () => download(JSON.stringify(exportDocument(store.state.regions), null, 2), "web-drawing.json", "application/json;charset=utf-8"));
$("export").addEventListener("click", () => download(renderHTML(store.state.regions), "web-drawing.html", "text/html;charset=utf-8"));
document.addEventListener("keydown", event => {
  if (event.key === "Escape") { setTool(store.selected ? "pen" : "region"); return; }
  const target = event.target as HTMLElement;
  if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
    event.preventDefault();
    travelHistory(key === "y" || event.shiftKey);
  } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
    const shortcuts: Record<string, Tool> = { v: "select", r: "region", p: "pen", e: "eraser" };
    if (shortcuts[key]) setTool(shortcuts[key]);
    if ((key === "delete" || key === "backspace") && store.selected) {
      event.preventDefault();
      cancelDraft();
      store.removeSelected();
      if (!store.selected) tool = "region";
      renderUI();
    }
  }
});
renderUI();
