import { confirmDelete } from "./dialogs";
import { $ } from "./dom";
import { DrawingRepository, type SavedDrawing } from "./persistence";

export class HomePage {
  private drawings: SavedDrawing[] = [];
  private search = "";
  constructor(private repository: DrawingRepository, private open: (id: string) => void, create: (title: string) => Promise<void>) {
    const dialog = $<HTMLDialogElement>("new-dialog");
    for (const id of ["new-drawing", "new-empty"]) $(id).addEventListener("click", () => {
      $<HTMLInputElement>("new-title").value = "";
      $("new-error").textContent = "";
      dialog.showModal(); $("new-title").focus();
    });
    $("new-cancel").addEventListener("click", () => dialog.close());
    dialog.addEventListener("cancel", event => { if ($<HTMLButtonElement>("new-submit").disabled) event.preventDefault(); });
    $("new-form").addEventListener("submit", async event => {
      event.preventDefault();
      const button = $<HTMLButtonElement>("new-submit");
      button.disabled = true; button.textContent = "正在创建…";
      $<HTMLButtonElement>("new-cancel").disabled = true;
      $<HTMLInputElement>("new-title").disabled = true;
      try {
        await create($<HTMLInputElement>("new-title").value.trim() || "未命名绘画");
        dialog.close();
      } catch (error) { $("new-error").textContent = (error as Error).message; }
      finally {
        button.disabled = false; button.textContent = "创建绘画";
        $<HTMLButtonElement>("new-cancel").disabled = false; $<HTMLInputElement>("new-title").disabled = false;
      }
    });
    $("drawing-search").addEventListener("input", event => { this.search = (event.target as HTMLInputElement).value; this.render(); });
    $("home-retry").addEventListener("click", () => void this.load());
  }
  async load(): Promise<void> {
    $("home-loading").classList.remove("hidden"); $("drawing-list").setAttribute("aria-busy", "true");
    $("home-error").classList.add("hidden"); $("home-empty").classList.add("hidden");
    try {
      const result = await this.repository.list();
      this.drawings = result.drawings;
      $("home-warning").textContent = result.invalidCount ? `${result.invalidCount} 份记录数据损坏或版本不支持，已保留原始数据，未覆盖。` : "";
      this.render();
    } catch (error) {
      $("home-error-text").textContent = (error as Error).message;
      $("home-error").classList.remove("hidden");
      $("drawing-list").replaceChildren();
    } finally {
      $("home-loading").classList.add("hidden"); $("drawing-list").setAttribute("aria-busy", "false");
    }
  }
  private render(): void {
    const visible = this.drawings.filter(drawing => drawing.title.toLocaleLowerCase().includes(this.search.trim().toLocaleLowerCase()));
    $("drawing-total").textContent = `${this.drawings.length} 份绘画`;
    $("home-empty").classList.toggle("hidden", this.drawings.length > 0);
    $("search-empty").classList.toggle("hidden", visible.length > 0 || !this.drawings.length);
    const cards = visible.map(drawing => {
      const card = document.createElement("article"); card.className = "drawing-card";
      const open = document.createElement("button"); open.type = "button"; open.className = "drawing-open";
      open.dataset.drawingId = drawing.id; open.setAttribute("aria-label", `打开绘画：${drawing.title}`);
      const preview = document.createElement("div"); preview.className = "drawing-thumbnail";
      if (drawing.thumbnail) {
        const image = document.createElement("img"); image.src = drawing.thumbnail; image.alt = ""; image.loading = "lazy"; preview.append(image);
      } else {
        const blank = document.createElement("span"); blank.className = "thumbnail-blank"; blank.textContent = "空白画布"; preview.append(blank);
      }
      const copy = document.createElement("div"); copy.className = "drawing-copy";
      const title = document.createElement("strong"); title.textContent = drawing.title;
      const info = document.createElement("span"); info.textContent = `${drawing.document.regions.length} 个区域 · 1200 × 760`;
      copy.append(title, info); open.append(preview, copy); open.addEventListener("click", () => this.open(drawing.id));
      const footer = document.createElement("div"); footer.className = "drawing-footer";
      const time = document.createElement("time"); time.dateTime = new Date(drawing.updatedAt).toISOString();
      time.textContent = `保存于 ${new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(drawing.updatedAt)}`;
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "text-btn danger-text";
      remove.textContent = "删除"; remove.setAttribute("aria-label", `删除绘画：${drawing.title}`);
      remove.addEventListener("click", async () => {
        if (!await confirmDelete(drawing.title)) return;
        try { await this.repository.remove(drawing.id); await this.load(); $("home-heading").focus(); }
        catch (error) { $("home-warning").textContent = (error as Error).message; }
      });
      footer.append(time, remove); card.append(open, footer); return card;
    });
    $("drawing-list").replaceChildren(...cards);
  }
}
