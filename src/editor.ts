import { BrushPanel } from "./brush-panel";
import { CanvasController } from "./canvas";
import { ColorWheel } from "./color-wheel";
import { EditorStore, type DrawingDocument, type Tool } from "./document";
import { $ } from "./dom";
import { download, exportDocument, renderHTML } from "./export";
import type { Rect } from "./geometry";
import { renderSVG } from "./render";
import { RegionPanel } from "./sidebar";

export class Editor {
  readonly store: EditorStore;
  private tool: Tool = "region";
  private colors: ColorWheel;
  private brushes: BrushPanel;
  private panel: RegionPanel;
  private canvas: CanvasController;
  active = false;
  constructor(private onChange: () => void) {
    this.store = new EditorStore();
    this.colors = new ColorWheel(() => { this.cancel(); this.render(); });
    this.brushes = new BrushPanel(() => { this.cancel(); this.render(); }, () => this.colors.value);
    this.panel = new RegionPanel(this.store, () => { this.cancel(); this.render(); }, id => {
      this.cancel(); this.store.select(id); this.tool = "pen"; this.render();
    }, rect => this.create(rect));
    this.canvas = new CanvasController(this.store, this.brushes, () => this.tool, rect => this.create(rect), () => this.render(), message => this.hint(message));
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) button.addEventListener("click", () => this.setTool(button.dataset.tool as Tool));
    $("undo").addEventListener("click", () => this.travel());
    $("redo").addEventListener("click", () => this.travel(true));
    $("export-svg").addEventListener("click", () => download(`<?xml version="1.0" encoding="UTF-8"?>\n${renderSVG(this.store.state.regions)}`, "web-drawing.svg", "image/svg+xml;charset=utf-8"));
    $("export-json").addEventListener("click", () => download(JSON.stringify(this.document, null, 2), "web-drawing.json", "application/json;charset=utf-8"));
    $("export").addEventListener("click", () => download(renderHTML(this.store.state.regions), "web-drawing.html", "text/html;charset=utf-8"));
    for (const id of ["export", "export-json", "export-svg"]) $(id).addEventListener("click", () => { $<HTMLDetailsElement>("export-menu").open = false; });
    document.addEventListener("keydown", event => this.key(event));
  }
  get document(): DrawingDocument { return exportDocument(this.store.state.regions); }
  get color(): string { return this.colors.value; }
  get pendingChanges(): boolean {
    const selected = this.store.selected;
    return !!selected && ($<HTMLInputElement>("region-name").value !== selected.name
      || ["x", "y"].some(axis => Number($<HTMLInputElement>(`region-${axis}`).value) !== Math.round(selected.rect[axis as "x" | "y"] * 10) / 10));
  }
  open(document: DrawingDocument, color: string): void {
    this.cancel(); this.store.load(document.regions); this.colors.set(color);
    this.tool = document.regions.length ? "pen" : "region";
    this.active = true; this.render();
  }
  cancel(): void { this.canvas?.cancel(); this.canvas?.render(); }
  private hint(message: string): void { $("mode-hint").textContent = message; }
  private create(rect: Rect): void {
    this.cancel();
    if (this.store.create(rect)) this.tool = "pen";
    this.render();
  }
  private setTool(next: Tool): void { this.cancel(); this.tool = next; this.render(); }
  private travel(redo = false): void {
    this.cancel();
    if (redo) this.store.redo(); else this.store.undo();
    if (!this.store.selected && (this.tool === "pen" || this.tool === "eraser")) this.tool = "region";
    this.render();
  }
  private render(): void {
    this.brushes.render(this.tool); this.colors.setDisabled(this.tool !== "pen");
    this.canvas?.render(); this.panel.render();
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
      const active = button.dataset.tool === this.tool;
      button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
    }
    const selected = this.store.selected;
    this.hint(this.tool === "region" ? "拖拽创建区域（至少 12 × 12 px），完成后自动切换画笔。"
      : this.tool === "select" ? "拖动框移动整层；方向键微调，Shift + 方向键移动 10 px。重叠处优先选择最上层。"
      : !selected ? "请先框选或选择已有区域。"
      : `当前：${selected.name} · ${this.tool === "pen" ? "只在此框内绘画，超出部分会裁剪。" : "只擦除此框已有笔画，不影响其他区域。"}`);
    $("status-mode").textContent = this.tool === "region" ? "框选新区域" : this.tool === "select" ? "选择与移动" : `${selected?.name ?? "未选择区域"} · ${this.tool === "pen" ? "画笔" : "橡皮"}`;
    $("status-count").textContent = `${this.store.state.regions.length} 个区域 · ${this.store.state.regions.reduce((sum, region) => sum + region.marks.filter(mark => mark.kind === "pen").length, 0)} 条笔画`;
    $<HTMLButtonElement>("undo").disabled = !this.store.canUndo;
    $<HTMLButtonElement>("redo").disabled = !this.store.canRedo;
    this.onChange();
  }
  private key(event: KeyboardEvent): void {
    if (!this.active || document.querySelector("dialog[open]")) return;
    if (event.key === "Escape") { this.setTool(this.store.selected ? "pen" : "region"); return; }
    const target = event.target as HTMLElement;
    if (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
      event.preventDefault(); this.travel(key === "y" || event.shiftKey);
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const tools: Record<string, Tool> = { v: "select", r: "region", p: "pen", e: "eraser" };
      if (tools[key]) this.setTool(tools[key]);
      const selected = this.store.selected;
      if ((key === "delete" || key === "backspace") && selected) {
        event.preventDefault(); this.cancel(); this.store.removeSelected();
        if (!this.store.selected) this.tool = "region";
        this.render();
      }
      const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (this.tool === "select" && selected && directions[event.key]) {
        event.preventDefault(); this.cancel();
        const [x, y] = directions[event.key]!, step = event.shiftKey ? 10 : 1;
        this.store.move(selected.id, { x: selected.rect.x + x * step, y: selected.rect.y + y * step });
        this.render();
      }
    }
  }
}
