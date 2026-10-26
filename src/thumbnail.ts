import type { Region } from "./document";
import { renderSVG } from "./render";

/** Thumbnail failure must never prevent saving the editable document. */
export async function createThumbnail(regions: Region[]): Promise<string | null> {
  const url = URL.createObjectURL(new Blob([renderSVG(regions)], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 360; canvas.height = 228;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch { return null; }
  finally { URL.revokeObjectURL(url); }
}
