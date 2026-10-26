import type { DrawingDocument, Region } from "./document";
import { HEIGHT, WIDTH } from "./geometry";
import { renderSVG } from "./render";

export function exportDocument(regions: Region[]): DrawingDocument {
  return { version: 2, width: WIDTH, height: HEIGHT, regions: structuredClone(regions) };
}

/** Prevent user-controlled names/payloads from closing the JSON script element. */
export function scriptJSON(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export function renderHTML(regions: Region[]): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>我的区域画布</title>
<style>html,body{margin:0;min-height:100%;background:#f6f7fb}body{display:grid;place-items:center;min-height:100vh}svg{display:block;width:min(100%,1200px);height:auto;background:white}[data-region-id]:focus-visible{outline:2px solid #5045d3;outline-offset:2px}</style></head><body>
${renderSVG(regions, true)}
<script type="application/json" id="drawing-document">${scriptJSON(exportDocument(regions))}</script>
<script>
// Integration hook only: no URLs, scripts or business actions are executed.
const drawing = JSON.parse(document.getElementById('drawing-document').textContent);
const byId = new Map(drawing.regions.map(region => [region.id, region]));
document.querySelectorAll('[data-region-id]').forEach(element => {
  const activate = () => {
    const region = byId.get(element.dataset.regionId);
    element.dispatchEvent(new CustomEvent('webdrawing:region-activate', {
      bubbles: true, detail: { regionId: region.id, binding: region.binding }
    }));
  };
  element.addEventListener('click', activate);
  element.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
  });
});
</script></body></html>`;
}

export function download(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
