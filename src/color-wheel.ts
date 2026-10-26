import { DEFAULT_COLOR, hexToHSV, hsvToHex, hsvToRGB, normalizeHex, type HSV } from "./colors";
import { drawColorWheel, SV_SIZE, SV_START, WHEEL_SIZE } from "./color-wheel-canvas";
import { $ } from "./dom";

export class ColorWheel {
  private hsv: HSV = hexToHSV(DEFAULT_COLOR);
  private dialog = $<HTMLDialogElement>("color-dialog");
  private canvas = $<HTMLCanvasElement>("color-wheel");
  private dragging: { kind: "hue" | "sv"; pointerId: number } | null = null;
  constructor(private onChange: () => void) {
    $("color-trigger").addEventListener("click", () => {
      this.render(); this.dialog.showModal(); $<HTMLInputElement>("color-hue").focus();
    });
    for (const id of ["color-close", "color-done"]) $(id).addEventListener("click", () => this.dialog.close());
    for (const [id, key, scale] of [["hue", "h", 1], ["saturation", "s", 100], ["value", "v", 100]] as const) {
      $<HTMLInputElement>(`color-${id}`).addEventListener("input", event => {
        this.hsv[key] = Number((event.target as HTMLInputElement).value) / scale;
        this.changed();
      });
    }
    const hex = $<HTMLInputElement>("color-hex");
    hex.addEventListener("input", () => {
      const value = normalizeHex(hex.value);
      hex.setAttribute("aria-invalid", String(!value));
      $("color-error").textContent = value ? "" : "请输入 3 位或 6 位十六进制颜色。";
      if (value) { this.hsv = hexToHSV(value, this.hsv.h); this.changed(false); }
    });
    hex.addEventListener("blur", () => { hex.setAttribute("aria-invalid", "false"); $("color-error").textContent = ""; this.render(); });
    for (const swatch of document.querySelectorAll<HTMLButtonElement>("[data-color]")) {
      swatch.style.setProperty("--swatch", swatch.dataset.color!);
      swatch.addEventListener("click", () => this.set(swatch.dataset.color!, true));
    }
    this.canvas.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !event.isPrimary || this.dragging) return;
      const point = this.point(event);
      const radius = Math.hypot(point.x - 120, point.y - 120);
      const kind = radius >= 88 && radius <= 116 ? "hue" : point.x >= SV_START && point.x <= SV_START + SV_SIZE && point.y >= SV_START && point.y <= SV_START + SV_SIZE ? "sv" : null;
      if (!kind) return;
      event.preventDefault();
      this.dragging = { kind, pointerId: event.pointerId };
      this.canvas.setPointerCapture(event.pointerId);
      this.applyPointer(event);
    });
    this.canvas.addEventListener("pointermove", event => { if (event.pointerId === this.dragging?.pointerId) this.applyPointer(event); });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) this.canvas.addEventListener(type, event => {
      if (event.pointerId !== this.dragging?.pointerId) return;
      this.dragging = null;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    });
    this.dialog.addEventListener("close", () => { this.dragging = null; });
    this.render();
  }
  get value(): string { return hsvToHex(this.hsv); }
  set(value: string, notify = false): void {
    this.hsv = hexToHSV(value, this.hsv.h);
    this.render();
    if (notify) this.onChange();
  }
  setDisabled(disabled: boolean): void { $<HTMLButtonElement>("color-trigger").disabled = disabled; }
  private point(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * WHEEL_SIZE / rect.width, y: (event.clientY - rect.top) * WHEEL_SIZE / rect.height };
  }
  private applyPointer(event: PointerEvent): void {
    const point = this.point(event);
    if (this.dragging?.kind === "hue") this.hsv.h = (Math.atan2(point.x - 120, 120 - point.y) * 180 / Math.PI + 360) % 360;
    else {
      this.hsv.s = Math.max(0, Math.min(1, (point.x - SV_START) / SV_SIZE));
      this.hsv.v = Math.max(0, Math.min(1, 1 - (point.y - SV_START) / SV_SIZE));
    }
    this.changed();
  }
  private changed(updateHex = true): void { this.render(updateHex); this.onChange(); }
  private render(updateHex = true): void {
    const hex = this.value;
    drawColorWheel(this.canvas, this.hsv);
    $("color-trigger").style.setProperty("--swatch", hex);
    $("color-trigger").setAttribute("aria-label", `画笔颜色，当前 ${hex.toUpperCase()}`);
    $("color-current").style.setProperty("--swatch", hex);
    $("color-rgb").textContent = `RGB ${hsvToRGB(this.hsv).join(" · ")}`;
    if (updateHex) $<HTMLInputElement>("color-hex").value = hex.toUpperCase();
    for (const [id, value] of [["hue", this.hsv.h], ["saturation", this.hsv.s * 100], ["value", this.hsv.v * 100]] as const) {
      $<HTMLInputElement>(`color-${id}`).value = String(Math.round(value));
      $(`color-${id}-value`).textContent = id === "hue" ? `${Math.round(value)}°` : `${Math.round(value)}%`;
    }
    $("color-saturation").style.setProperty("--range-color", hsvToHex({ h: this.hsv.h, s: 1, v: 1 }));
    $("color-value").style.setProperty("--range-color", hsvToHex({ h: this.hsv.h, s: this.hsv.s, v: 1 }));
  }
}
