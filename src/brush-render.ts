import { rectangularOutline, roundOutline, type Stroke } from "./brushes";
import { pathData } from "./geometry";
import { escapeXML } from "./xml";

export type StrokeRendering = { definitions: string; content: string };

/** SVG-only output: exported files do not need perfect-freehand or a network. */
export function renderStroke(mark: Stroke, key: string, bounds: { width: number; height: number }): StrokeRendering {
  const color = escapeXML(mark.kind === "eraser" ? "black" : mark.color);
  const opacity = mark.opacity ?? 1;
  // Preserve the exact visual semantics of pre-brush (version 1) documents.
  if (!mark.brush) {
    const alpha = opacity === 1 ? "" : ` opacity="${opacity}"`;
    return { definitions: "", content: `<path d="${pathData(mark.points)}" fill="none" stroke="${color}" stroke-width="${mark.width}" stroke-linecap="round" stroke-linejoin="round"${alpha}/>` };
  }
  const shape = mark.brush === "marker" || mark.brush === "block" ? rectangularOutline(mark) : roundOutline(mark);
  let definitions = "";
  let filter = "";
  const id = escapeXML(`brush-filter-${key}`);
  const area = `filterUnits="userSpaceOnUse" x="0" y="0" width="${bounds.width}" height="${bounds.height}"`;
  if (mark.brush === "pencil") {
    definitions = `<filter id="${id}" ${area} color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="17" result="grain"/><feColorMatrix in="grain" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1.6 0 0 0 -.35" result="grain-alpha"/><feComposite in="SourceGraphic" in2="grain-alpha" operator="in"/></filter>`;
    filter = ` filter="url(#${id})"`;
  } else if (mark.brush === "soft") {
    definitions = `<filter id="${id}" ${area}><feGaussianBlur stdDeviation="${(mark.width * .18).toFixed(2)}"/></filter>`;
    filter = ` filter="url(#${id})"`;
  }
  return { definitions, content: `<path data-brush="${mark.brush}" d="${shape}" fill="${color}" opacity="${opacity}"${filter}/>` };
}
