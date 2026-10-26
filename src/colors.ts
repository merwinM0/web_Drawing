export type HSV = { h: number; s: number; v: number };
export const DEFAULT_COLOR = "#232c49";
export const normalizeHex = (value: string): string | null => {
  const input = value.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(input)) return `#${[...input].map(char => char + char).join("").toLowerCase()}`;
  return /^[\da-f]{6}$/i.test(input) ? `#${input.toLowerCase()}` : null;
};
export function hsvToRGB({ h, s, v }: HSV): [number, number, number] {
  const hue = ((h % 360) + 360) % 360 / 60;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(hue % 2 - 1));
  const colors = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]];
  return colors[Math.floor(hue)]!.map(channel => Math.round((channel + v - chroma) * 255)) as [number, number, number];
}
export function hsvToHex(color: HSV): string {
  return `#${hsvToRGB(color).map(value => value.toString(16).padStart(2, "0")).join("")}`;
}
export function hexToHSV(hex: string, previousHue = 0): HSV {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error("请输入有效的 HEX 颜色。");
  const [r, g, b] = [1, 3, 5].map(index => parseInt(normalized.slice(index, index + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = previousHue;
  if (delta) h = 60 * (max === r ? (g - b) / delta % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
  return { h: (h + 360) % 360, s: max ? delta / max : 0, v: max };
}
