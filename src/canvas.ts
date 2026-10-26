import { BrushPanel } from "./brush-panel";
import { samplePoint } from "./brushes";
import { EditorStore, hitTest, type Mark, type Tool } from "./document";
import { $ } from "./dom";
import { containsPoint, HEIGHT, localPoint, movedRect, regionRect, WIDTH, type Point, type Rect } from "./geometry";
import { renderOutlines, renderRegions } from "./render";
import { hitResizeHandle, renderResizeHandles, resizeCursor, resizeFromDrag, type ResizeHandle } from "./region-resize";

type Draft =
  | { tool: "region"; start: Point; end: Point; pointerId: number }
  | { tool: "select"; start: Point; origin: Rect; rect: Rect; regionId: string; pointerId: number; handle?: ResizeHandle }
  | { tool: "pen" | "eraser"; regionId: string; rect: Rect; mark: Mark; pointerId: number };

export class CanvasController {
  private artboard = $<SVGSVGElement>("artboard");
  private draft: Draft | null = null;
  private cursor: Point | null = null;
  private frame = 0;
  constructor(private store: EditorStore, private brushes: BrushPanel, private tool: () => Tool,
    private create: (rect: Rect) => void, private refresh: () => void, private hint: (message: string) => void) {
    this.artboard.addEventListener("pointerdown", event => this.down(event));
    this.artboard.addEventListener("pointermove", event => this.move(event));
    this.artboard.addEventListener("pointerup", event => this.up(event));
    for (const type of ["pointercancel", "lostpointercapture"] as const) this.artboard.addEventListener(type, event => {
      if (this.draft?.pointerId === event.pointerId) { this.cancel(); this.render(); }
    });
    this.artboard.addEventListener("pointerleave", () => {
      this.cursor = null; this.renderCursor();
      if (!this.draft) $("coordinates").textContent = "X — · Y —";
    });
    window.addEventListener("blur", () => { this.cursor = null; this.cancel(); this.render(); });
    new ResizeObserver(() => this.render()).observe(this.artboard);
  }
  cancel(): void {
    const id = this.draft?.pointerId;
    this.draft = null;
    if (id !== undefined && this.artboard.hasPointerCapture(id)) this.artboard.releasePointerCapture(id);
    cancelAnimationFrame(this.frame); this.frame = 0;
  }
  render(): void {
    const draft = this.draft;
    const regions = draft?.tool === "select" ? this.store.state.regions.map(region => region.id === draft.regionId ? { ...region, rect: draft.rect } : region) : this.store.state.regions;
    const preview = draft && (draft.tool === "pen" || draft.tool === "eraser") ? { regionId: draft.regionId, mark: draft.mark } : undefined;
    $("region-layer").innerHTML = renderRegions(regions, preview);
    const selected = regions.find(region => region.id === this.store.state.selectedRegionId);
    const handles = this.tool() === "select" && selected ? renderResizeHandles(selected.rect, 8 / this.scale) : "";
    $("editor-overlay").innerHTML = renderOutlines(regions, this.store.state.selectedRegionId, draft?.tool === "region" ? regionRect(draft.start, draft.end) ?? undefined : undefined) + handles;
    $("canvas-empty").classList.toggle("hidden", regions.length > 0 || !!draft);
    this.renderCursor();
  }
  private get scale(): number {
    const matrix = this.artboard.getScreenCTM();
    return matrix ? Math.hypot(matrix.a, matrix.b) || 1 : 1;
  }
  private handleAt(point: Point): ResizeHandle | undefined {
    return this.store.selected ? hitResizeHandle(this.store.selected.rect, point, 12 / this.scale) : undefined;
  }
  private renderCursor(): void {
    const tool = this.tool(), draft = this.draft;
    const handle = draft?.tool === "select" ? draft.handle : this.cursor ? this.handleAt(this.cursor) : undefined;
    this.artboard.style.cursor = tool === "select" ? handle ? resizeCursor[handle] : draft ? "grabbing" : "grab" : tool === "region" ? "crosshair" : "none";
    const drawing = tool === "pen" || tool === "eraser";
    const visible = drawing && this.cursor && containsPoint({ x: 0, y: 0, width: WIDTH, height: HEIGHT }, this.cursor);
    $("brush-cursor").innerHTML = visible ? this.brushes.cursor(this.cursor!, !!this.store.selected && containsPoint(this.store.selected.rect, this.cursor!)) : "";
  }
  private point(event: PointerEvent): Point {
    const matrix = this.artboard.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }
  private sample(mark: Mark, rect: Rect, event: PointerEvent, released = false): void {
    const point = samplePoint(localPoint(rect, this.point(event)), event.pressure, event.pointerType, mark.points.at(-1), released);
    const last = mark.points.at(-1);
    if (!last || point.x !== last.x || point.y !== last.y || point.pressure !== last.pressure) mark.points.push(point);
  }
  private down(event: PointerEvent): void {
    if (event.button !== 0 || !event.isPrimary || this.draft) return;
    event.preventDefault();
    this.artboard.closest<HTMLElement>(".canvas-area")?.focus({ preventScroll: true });
    const start = this.point(event), tool = this.tool();
    if (tool === "select") {
      const handle = this.handleAt(start);
      const region = handle ? this.store.selected : hitTest(this.store.state.regions, start);
      this.store.select(region?.id ?? null);
      if (region) this.draft = { tool, start, origin: region.rect, rect: region.rect, regionId: region.id, pointerId: event.pointerId, handle };
      else { this.refresh(); return; }
    } else if (tool === "region") this.draft = { tool, start, end: start, pointerId: event.pointerId };
    else {
      const region = this.store.selected;
      if (!region || !containsPoint(region.rect, start)) {
        this.hint(region ? "请从当前区域框内起笔；按 V 可选择或拖动框。" : "请按 R 框选后再绘画。"); return;
      }
      const mark = this.brushes.createMark(tool, event.pointerType);
      this.sample(mark, region.rect, event);
      this.draft = { tool, regionId: region.id, rect: region.rect, mark, pointerId: event.pointerId };
    }
    this.cursor = start;
    this.artboard.setPointerCapture(event.pointerId);
    this.refresh();
  }
  private move(event: PointerEvent): void {
    if (!event.isPrimary) return;
    const point = this.point(event);
    this.cursor = point; this.renderCursor();
    $("coordinates").textContent = `X ${Math.round(point.x)} · Y ${Math.round(point.y)}`;
    const draft = this.draft;
    if (!draft || draft.pointerId !== event.pointerId) return;
    if (draft.tool === "region") draft.end = point;
    else if (draft.tool === "select") draft.rect = this.dragged(draft, point);
    else {
      const samples = event.getCoalescedEvents?.() ?? [];
      for (const sample of samples.length ? samples : [event]) this.sample(draft.mark, draft.rect, sample);
    }
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }
  private dragged(draft: Extract<Draft, { tool: "select" }>, point: Point): Rect {
    if (Math.hypot(point.x - draft.start.x, point.y - draft.start.y) < 2) return draft.origin;
    return draft.handle ? resizeFromDrag(draft.origin, draft.start, point, draft.handle)
      : movedRect(draft.origin, { x: draft.origin.x + point.x - draft.start.x, y: draft.origin.y + point.y - draft.start.y });
  }
  private up(event: PointerEvent): void {
    const draft = this.draft;
    if (!draft || draft.pointerId !== event.pointerId) return;
    const end = this.point(event);
    this.cancel();
    if (draft.tool === "region") {
      const rect = regionRect(draft.start, end);
      if (rect) this.create(rect);
      else { this.refresh(); this.hint("请拖出至少 12 × 12 px 的框。"); }
    } else {
      if (draft.tool === "select") {
        const rect = this.dragged(draft, end);
        if (draft.handle) this.store.resize(draft.regionId, rect);
        else this.store.move(draft.regionId, rect);
      }
      else { this.sample(draft.mark, draft.rect, event, true); this.store.appendMark(draft.regionId, draft.mark); }
      this.refresh();
    }
  }
}
