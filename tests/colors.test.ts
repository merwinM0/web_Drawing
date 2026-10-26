import { expect, test } from "bun:test";
import { hexToHSV, hsvToHex, hsvToRGB, normalizeHex } from "../src/colors";

test("HEX 输入归一化并拒绝非法颜色", () => {
  expect(normalizeHex(" AbC ")).toBe("#aabbcc");
  expect(normalizeHex("#A0B1C2")).toBe("#a0b1c2");
  for (const invalid of ["red", "#12", "#abcdefg", "#gggggg", "url(x)", ""]) expect(normalizeHex(invalid)).toBeNull();
});
test("HSV 主色、灰度和色相周期转换", () => {
  expect(hsvToRGB({ h: 0, s: 1, v: 1 })).toEqual([255, 0, 0]);
  expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
  expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe("#0000ff");
  expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
  expect(hsvToHex({ h: -120, s: 1, v: 1 })).toBe("#0000ff");
  expect(hsvToHex({ h: 200, s: 0, v: .5 })).toBe("#808080");
});
test("RGB / HSV 往返无漂移，灰色保留之前的色相", () => {
  for (const hex of ["#232c49", "#ffffff", "#000000", "#e85d45", "#318777", "#8c60a5"]) expect(hsvToHex(hexToHSV(hex))).toBe(hex);
  expect(hexToHSV("#808080", 240).h).toBe(240);
  expect(() => hexToHSV("invalid")).toThrow();
});
