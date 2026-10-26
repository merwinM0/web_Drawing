import { EditorStore } from "./document";
import { $ } from "./dom";
import { validRect, type Rect } from "./geometry";

export class RegionPanel {
  constructor(
    private store: EditorStore,
    private onEdit: () => void,
    private onSelect: (id: string) => void,
    private onCreate: (rect: Rect) => void,
  ) {
    $<HTMLInputElement>("region-name").addEventListener("change", event => {
      store.rename((event.target as HTMLInputElement).value);
      onEdit();
    });
    for (const axis of ["x", "y"] as const) {
      $<HTMLInputElement>(`region-${axis}`).addEventListener("change", event => {
        if (store.selected) store.move(store.selected.id, { ...store.selected.rect, [axis]: Number((event.target as HTMLInputElement).value) });
        onEdit();
      });
    }
    $("layer-up").addEventListener("click", () => { store.reorder(1); onEdit(); });
    $("layer-down").addEventListener("click", () => { store.reorder(-1); onEdit(); });
    $("delete-region").addEventListener("click", () => {
      store.removeSelected();
      onEdit();
      if (!store.selected) document.querySelector<HTMLButtonElement>('[data-tool="region"]')?.focus();
    });
    $("region-form").addEventListener("submit", event => {
      event.preventDefault();
      const data = new FormData(event.target as HTMLFormElement);
      const rect = { x: Number(data.get("x")), y: Number(data.get("y")), width: Number(data.get("width")), height: Number(data.get("height")) };
      if (!validRect(rect)) {
        $("form-error").textContent = "区域必须在 1200 × 760 画布内，宽高至少为 12 px。";
        return;
      }
      $("form-error").textContent = "";
      onCreate(rect);
    });
    $("toggle-sidebar").addEventListener("click", () => this.toggle());
    const compact = window.matchMedia("(max-width: 600px)");
    const collapseOnSmallScreen = () => {
      if (compact.matches && !$("sidebar").classList.contains("collapsed")) this.toggle();
    };
    compact.addEventListener("change", collapseOnSmallScreen);
    collapseOnSmallScreen();
  }

  private toggle(): void {
    const collapsed = $("sidebar").classList.toggle("collapsed");
    const toggle = $("toggle-sidebar");
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", collapsed ? "展开侧边栏" : "收起侧边栏");
    toggle.setAttribute("title", collapsed ? "展开侧边栏" : "收起侧边栏");
  }

  render(): void {
    const { regions, selectedRegionId } = this.store.state;
    const focusId = document.activeElement instanceof HTMLButtonElement ? document.activeElement.dataset.regionSelect : undefined;
    const rows = regions.slice().reverse().map((region, index) => {
      const row = document.createElement("button");
      row.type = "button";
      row.dataset.regionSelect = region.id;
      row.className = `layer-item${region.id === selectedRegionId ? " selected" : ""}`;
      row.setAttribute("aria-pressed", String(region.id === selectedRegionId));
      row.title = `${region.name} · 第 ${regions.length - index} 层`;
      const badge = document.createElement("span");
      badge.className = "layer-icon";
      badge.textContent = String(regions.length - index).padStart(2, "0");
      badge.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.className = "layer-copy";
      const title = document.createElement("strong");
      title.textContent = region.name;
      const detail = document.createElement("small");
      detail.textContent = `${region.marks.filter(mark => mark.kind === "pen").length} 条笔画 · 未绑定`;
      copy.append(title, detail);
      row.append(badge, copy);
      row.addEventListener("click", () => this.onSelect(region.id));
      return row;
    });
    $("layer-list").replaceChildren(...rows);
    rows.find(row => row.dataset.regionSelect === focusId)?.focus();
    $("layer-count").textContent = String(regions.length).padStart(2, "0");
    $("empty-layers").classList.toggle("hidden", regions.length > 0);
    const selected = this.store.selected;
    $("region-properties").classList.toggle("hidden", !selected);
    if (!selected) return;
    $<HTMLInputElement>("region-name").value = selected.name;
    const { x, y, width, height } = selected.rect;
    $("region-geometry").textContent = `${Math.round(width)} × ${Math.round(height)} px · V 拖动，方向键微调`;
    for (const [axis, value, max] of [["x", x, 1200 - width], ["y", y, 760 - height]] as const) {
      const input = $<HTMLInputElement>(`region-${axis}`);
      input.value = String(Math.round(value * 10) / 10); input.max = String(max);
    }
    const index = regions.findIndex(region => region.id === selectedRegionId);
    $<HTMLButtonElement>("layer-up").disabled = index === regions.length - 1;
    $<HTMLButtonElement>("layer-down").disabled = index === 0;
  }
}
