import type { Mark, Region } from "./document";
import { HEIGHT, pathData, WIDTH, type Rect } from "./geometry";

export const SVG_NS = "http://www.w3.org/2000/svg";
export type MarkPreview = { regionId: string; mark: Mark };

export function escapeXML(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function path(mark: Mark, color = mark.color): string {
  return `<path d="${pathData(mark.points)}" fill="none" stroke="${escapeXML(color)}" stroke-width="${mark.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Both editing and export use the same clipping and chronological erasing. */
export function renderRegions(regions: Region[], preview?: MarkPreview, interactive = false): string {
  const definitions: string[] = [];
  const groups = regions.map(region => {
    const id = escapeXML(region.id);
    const clipId = `region-clip-${id}`;
    const { x, y, width, height } = region.rect;
    definitions.push(`<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><rect width="${width}" height="${height}"/></clipPath>`);
    const marks = preview?.regionId === region.id ? [...region.marks, preview.mark] : region.marks;
    let ink = "";
    marks.forEach((mark, index) => {
      if (mark.kind === "pen") ink += path(mark);
      else if (ink) {
        const maskId = `region-erase-${id}-${index}`;
        definitions.push(`<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" style="mask-type:luminance"><rect width="${width}" height="${height}" fill="white"/>${path(mark, "black")}</mask>`);
        // Only earlier ink in this region is erased; later strokes remain intact.
        ink = `<g mask="url(#${maskId})">${ink}</g>`;
      }
    });
    const accessibility = interactive ? ` tabindex="0" role="group" aria-label="${escapeXML(region.name)}"` : "";
    return `<g data-region-id="${id}" data-region-name="${escapeXML(region.name)}" data-binding="${escapeXML(JSON.stringify(region.binding))}" transform="translate(${x} ${y})"${accessibility}><g clip-path="url(#${clipId})"><rect data-region-hitbox="" width="${width}" height="${height}" fill="transparent"/>${ink}</g></g>`;
  });
  return `<defs>${definitions.join("")}</defs>${groups.join("")}`;
}

export function renderOutlines(regions: Region[], selectedId: string | null, draftRect?: Rect): string {
  const outlines = regions.map(region => {
    const { x, y, width, height } = region.rect;
    const active = region.id === selectedId;
    const label = region.name.slice(0, Math.max(1, Math.floor(width / 14)));
    return `<g class="region-outline${active ? " is-selected" : ""}"><rect x="${x}" y="${y}" width="${width}" height="${height}" vector-effect="non-scaling-stroke"/><text x="${x + 4}" y="${y >= 20 ? y - 6 : y + 16}">${escapeXML(label)}${active ? " · 当前" : ""}</text></g>`;
  });
  if (draftRect) {
    const { x, y, width, height } = draftRect;
    outlines.push(`<rect class="region-draft" x="${x}" y="${y}" width="${width}" height="${height}" vector-effect="non-scaling-stroke"/>`);
  }
  return outlines.join("");
}

export function renderSVG(regions: Region[], interactive = false): string {
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" aria-label="区域画布"><rect width="${WIDTH}" height="${HEIGHT}" fill="white"/>${renderRegions(regions, undefined, interactive)}</svg>`;
}
