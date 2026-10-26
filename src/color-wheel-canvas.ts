import { hsvToHex, type HSV } from "./colors";

export const WHEEL_SIZE = 240;
export const SV_START = 56;
export const SV_SIZE = 128;
export function drawColorWheel(canvas: HTMLCanvasElement, color: HSV): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = canvas.width / WHEEL_SIZE;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);
  context.lineWidth = 24;
  for (let h = 0; h < 360; h++) {
    context.beginPath();
    context.arc(120, 120, 101, (h - 90) * Math.PI / 180, (h - 88.8) * Math.PI / 180);
    context.strokeStyle = `hsl(${h} 100% 50%)`;
    context.stroke();
  }
  context.save();
  context.beginPath();
  context.roundRect(SV_START, SV_START, SV_SIZE, SV_SIZE, 8);
  context.clip();
  context.fillStyle = hsvToHex({ h: color.h, s: 1, v: 1 });
  context.fillRect(SV_START, SV_START, SV_SIZE, SV_SIZE);
  const saturation = context.createLinearGradient(SV_START, 0, SV_START + SV_SIZE, 0);
  saturation.addColorStop(0, "white"); saturation.addColorStop(1, "#ffffff00");
  context.fillStyle = saturation; context.fillRect(SV_START, SV_START, SV_SIZE, SV_SIZE);
  const value = context.createLinearGradient(0, SV_START, 0, SV_START + SV_SIZE);
  value.addColorStop(0, "#00000000"); value.addColorStop(1, "black");
  context.fillStyle = value; context.fillRect(SV_START, SV_START, SV_SIZE, SV_SIZE);
  context.restore();
  const marker = (x: number, y: number, radius: number) => {
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2);
    context.lineWidth = 4; context.strokeStyle = "#22283d99"; context.stroke();
    context.lineWidth = 2; context.strokeStyle = "white"; context.stroke();
  };
  const angle = color.h * Math.PI / 180;
  marker(120 + 101 * Math.sin(angle), 120 - 101 * Math.cos(angle), 6);
  marker(SV_START + color.s * SV_SIZE, SV_START + (1 - color.v) * SV_SIZE, 5);
}
