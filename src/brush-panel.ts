import { defaultSettings, preset, pressureMode, type BrushSettings, type PresetId, type Stroke } from "./brushes";
import { renderStroke } from "./brush-render";
import type { Tool } from "./document";
import { $ } from "./dom";
import type { Point } from "./geometry";

/** Settings are remembered separately for every brush and eraser preset. */
export class BrushPanel {
  private kind: "pen" | "eraser" = "pen";
  private selected: Record<"pen" | "eraser", PresetId> = { pen: "round", eraser: "hard" };
  private settings = new Map<PresetId, BrushSettings>();
  constructor(onChange: () => void) {
    for (const kind of ["pen", "eraser"] as const) {
      $<HTMLSelectElement>(`${kind}-preset`).addEventListener("change", event => {
        this.selected[kind] = (event.target as HTMLSelectElement).value as PresetId;
        onChange();
      });
    }
    for (const [id, field, scale] of [["stroke-size", "width", 1], ["stroke-opacity", "opacity", 100], ["stroke-smoothing", "smoothing", 100]] as const) {
      $<HTMLInputElement>(id).addEventListener("input", event => {
        this.current[field] = Number((event.target as HTMLInputElement).value) / scale;
        onChange();
      });
    }
    $("pressure-enabled").addEventListener("change", event => {
      this.current.pressure = (event.target as HTMLInputElement).checked;
      onChange();
    });
    $("stroke-color").addEventListener("input", onChange);
  }
  private get current(): BrushSettings {
    const id = this.selected[this.kind];
    if (!this.settings.has(id)) this.settings.set(id, defaultSettings(id));
    return this.settings.get(id)!;
  }
  createMark(kind: "pen" | "eraser", pointerType: string): Stroke {
    this.kind = kind;
    const settings = this.current;
    return {
      kind, brush: settings.brush, points: [], color: $<HTMLInputElement>("stroke-color").value,
      width: settings.width, opacity: settings.opacity, smoothing: settings.smoothing,
      pressureMode: pressureMode(preset(settings.brush).pressure && settings.pressure, pointerType),
    };
  }
  render(tool: Tool): void {
    const active = tool === "pen" || tool === "eraser";
    if (active) this.kind = tool;
    $("brushbar").classList.toggle("hidden", !active);
    $<HTMLInputElement>("stroke-color").disabled = tool !== "pen";
    const size = $<HTMLInputElement>("stroke-size");
    size.disabled = !active;
    size.max = this.kind === "pen" ? "100" : "160";
    size.value = String(this.current.width);
    $("size-value").textContent = String(this.current.width);
    if (!active) return;
    for (const kind of ["pen", "eraser"] as const) {
      $(`${kind}-preset-option`).classList.toggle("hidden", kind !== this.kind);
      $<HTMLSelectElement>(`${kind}-preset`).value = this.selected[kind];
    }
    const item = preset(this.current.brush);
    $("opacity-label").textContent = this.kind === "pen" ? "透明度" : "擦除强度";
    for (const [id, field] of [["opacity", "opacity"], ["smoothing", "smoothing"]] as const) {
      const value = String(Math.round(this.current[field] * 100));
      $<HTMLInputElement>(`stroke-${id}`).value = value;
      $(`${id}-value`).textContent = `${value}%`;
    }
    const pressure = $<HTMLInputElement>("pressure-enabled");
    pressure.disabled = !item.pressure;
    pressure.checked = item.pressure && this.current.pressure;
    $("brush-description").textContent = item.description;
    const mark = this.createMark(this.kind, "pen");
    mark.points = Array.from({ length: 25 }, (_, index) => ({ x: 12 + index * 5, y: 22 + Math.sin(index / 4) * 6, pressure: .2 + index / 30 }));
    mark.width = Math.min(20, mark.width);
    // A white sample on a dark swatch illustrates eraser strength/feathering.
    if (this.kind === "eraser") { mark.kind = "pen"; mark.color = "#ffffff"; }
    const preview = renderStroke(mark, "preview", { width: 144, height: 44 });
    $("brush-preview").innerHTML = `<defs>${preview.definitions}</defs>${this.kind === "eraser" ? '<rect width="144" height="44" fill="#626b80"/>' : ""}${preview.content}`;
  }
  cursor(point: Point, allowed: boolean): string {
    const { width, brush } = this.current;
    const common = `fill="none" stroke="${allowed ? "#22283d" : "#a93642"}" stroke-width="1" vector-effect="non-scaling-stroke"`;
    const x = point.x, y = point.y, r = width / 2;
    const shape = brush === "block" || brush === "marker"
      ? `<rect x="${x - r}" y="${y - (brush === "marker" ? width * .18 : r)}" width="${width}" height="${brush === "marker" ? width * .36 : width}" ${common}/>`
      : `<circle cx="${x}" cy="${y}" r="${r}" ${common}/>`;
    return shape + (brush === "soft" ? `<circle cx="${x}" cy="${y}" r="${r + width * .54}" ${common} stroke-dasharray="3 3"/>` : "");
  }
}
