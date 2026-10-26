import { DEFAULT_COLOR } from "./colors";
import { confirmLeave } from "./dialogs";
import { $ } from "./dom";
import { Editor } from "./editor";
import { HomePage } from "./home";
import { DrawingRepository, type SavedDrawing } from "./persistence";
import { createThumbnail } from "./thumbnail";
import { safeId } from "./validation";

class DrawingApp {
  private repository = new DrawingRepository();
  private editor = new Editor(() => this.updateStatus());
  private home = new HomePage(this.repository, id => this.navigate(id), title => this.create(title));
  private project: SavedDrawing | null = null;
  private baseline = "";
  private currentHash = "";
  private routing = false;
  private queued = false;
  private saving: Promise<boolean> | null = null;
  constructor() {
    $("go-home").addEventListener("click", () => { location.hash = "#/"; });
    $("save-drawing").addEventListener("click", () => void this.save());
    $("drawing-title").addEventListener("input", () => this.updateStatus());
    document.addEventListener("input", event => { if ((event.target as HTMLElement).id.startsWith("region-")) this.updateStatus(); });
    $("notice-close").addEventListener("click", () => $("app-notice").classList.add("hidden"));
    window.addEventListener("hashchange", () => void this.route());
    window.addEventListener("beforeunload", event => {
      if (this.dirty) { event.preventDefault(); event.returnValue = ""; }
    });
    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && this.editor.active) {
        event.preventDefault();
        if (!document.querySelector("dialog[open]")) void this.save();
      }
    });
    if (!location.hash) history.replaceState(null, "", "#/");
    void this.route();
  }
  private navigate(id: string): void { location.hash = `#/drawing/${id}`; }
  private signature(): string {
    return JSON.stringify({ title: $<HTMLInputElement>("drawing-title").value.trim() || "未命名绘画", color: this.editor.color, regions: this.editor.store.state.regions });
  }
  private get dirty(): boolean { return this.editor.active && !!this.project && (this.signature() !== this.baseline || this.editor.pendingChanges); }
  private updateStatus(): void {
    if (!this.editor.active || !this.project) return;
    const text = this.saving ? "正在保存…" : this.dirty ? "有未保存修改" : "已保存到此浏览器";
    if ($("save-status").textContent !== text) $("save-status").textContent = text;
    $("save-status").classList.toggle("is-dirty", this.dirty);
    $<HTMLButtonElement>("save-drawing").disabled = !!this.saving;
    $("save-label").textContent = this.saving ? "保存中" : "保存";
    document.title = `${$<HTMLInputElement>("drawing-title").value || "未命名绘画"}${this.dirty ? " *" : ""} · Web Drawing`;
  }
  private notify(message: string): void {
    $("notice-text").textContent = message;
    $("app-notice").classList.remove("hidden");
  }
  private async create(title: string): Promise<void> {
    const drawing = await this.repository.save({ id: crypto.randomUUID(), title, revision: 0,
      document: { version: 2, width: 1200, height: 760, regions: [] }, color: DEFAULT_COLOR, thumbnail: null });
    this.navigate(drawing.id);
  }
  private save(): Promise<boolean> {
    if (this.saving) return this.saving;
    if (!this.project || !this.editor.active) return Promise.resolve(false);
    this.saving = this.performSave().finally(() => { this.saving = null; this.updateStatus(); });
    this.updateStatus();
    return this.saving;
  }
  private async performSave(): Promise<boolean> {
    (document.activeElement as HTMLElement | null)?.blur();
    this.editor.cancel();
    const project = this.project!;
    const titleInput = $<HTMLInputElement>("drawing-title");
    const title = titleInput.value;
    const data = this.editor.document, color = this.editor.color;
    try {
      const thumbnail = await createThumbnail(data.regions);
      const result = await this.repository.save({ id: project.id, revision: project.revision, title, document: data, color, thumbnail });
      this.project = result;
      if (titleInput.value === title) titleInput.value = result.title;
      this.baseline = JSON.stringify({ title: result.title, color, regions: data.regions });
      $("app-notice").classList.add("hidden");
      return true;
    } catch (error) { this.notify((error as Error).message); return false; }
  }
  private async mayLeave(): Promise<boolean> {
    (document.activeElement as HTMLElement | null)?.blur();
    if (this.saving) await this.saving;
    if (!this.dirty) return true;
    this.editor.cancel();
    const choice = await confirmLeave();
    return choice === "discard" || choice === "save" && await this.save();
  }
  private async route(): Promise<void> {
    if (this.routing) { this.queued = true; return; }
    this.routing = true;
    const target = location.hash || "#/";
    try {
      if (target === this.currentHash) return;
      if (!await this.mayLeave()) { history.replaceState(null, "", this.currentHash); return; }
      const match = /^#\/drawing\/([^/]+)$/.exec(target);
      if (match && safeId(match[1])) {
        try {
          const drawing = await this.repository.get(match[1]);
          this.project = drawing;
          $("home-page").classList.add("hidden"); $("workbench").classList.remove("hidden");
          $<HTMLInputElement>("drawing-title").value = drawing.title;
          this.editor.open(drawing.document, drawing.color);
          this.baseline = this.signature(); this.currentHash = target;
          this.updateStatus();
          document.querySelector<HTMLElement>(".canvas-area")?.focus({ preventScroll: true });
          return;
        } catch (error) { this.notify((error as Error).message); }
      }
      this.editor.cancel(); this.editor.active = false; this.project = null;
      $<HTMLDialogElement>("color-dialog").close();
      $<HTMLDetailsElement>("export-menu").open = false;
      $("workbench").classList.add("hidden"); $("home-page").classList.remove("hidden");
      this.currentHash = "#/"; history.replaceState(null, "", "#/");
      document.title = "我的绘画 · Web Drawing";
      await this.home.load(); $("home-heading").focus({ preventScroll: true });
    } catch (error) { this.notify((error as Error).message); }
    finally {
      this.routing = false;
      if (this.queued) { this.queued = false; void this.route(); }
    }
  }
}
new DrawingApp();
