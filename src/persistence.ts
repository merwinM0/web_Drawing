import { DEFAULT_COLOR, normalizeHex } from "./colors";
import type { DrawingDocument } from "./document";
import { safeId, validateDocument } from "./validation";

export type SavedDrawing = {
  schema: 1; id: string; title: string; createdAt: number; updatedAt: number; revision: number;
  document: DrawingDocument; color: string; thumbnail: string | null;
};
export type SaveInput = { id: string; title: string; document: DrawingDocument; color: string; thumbnail: string | null; revision: number };

function availableFactory(): IDBFactory | undefined {
  try { return globalThis.indexedDB; } catch { return undefined; }
}
function decode(value: unknown): SavedDrawing {
  const item = value as SavedDrawing | undefined;
  if (!item || item.schema !== 1 || !safeId(item.id) || typeof item.title !== "string" || !item.title.trim() || item.title.length > 80
    || !Number.isFinite(item.createdAt) || item.createdAt <= 0 || item.createdAt > 8.64e15
    || !Number.isFinite(item.updatedAt) || item.updatedAt <= 0 || item.updatedAt > 8.64e15 || !Number.isSafeInteger(item.revision) || item.revision < 1) throw new Error("绘画记录损坏，未修改原始数据。");
  return {
    schema: 1, id: item.id, title: item.title, createdAt: item.createdAt, updatedAt: item.updatedAt, revision: item.revision,
    document: validateDocument(item.document), color: typeof item.color === "string" ? normalizeHex(item.color) ?? DEFAULT_COLOR : DEFAULT_COLOR,
    thumbnail: typeof item.thumbnail === "string" && item.thumbnail.length < 1e6 && /^data:image\/png;base64,[\w+/=]+$/.test(item.thumbnail) ? item.thumbnail : null,
  };
}

export class DrawingRepository {
  private connection: Promise<IDBDatabase> | undefined;
  constructor(private name = "web-drawing-projects", private factory: IDBFactory | undefined = availableFactory()) {}
  private open(): Promise<IDBDatabase> {
    if (!this.connection) {
      this.connection = new Promise<IDBDatabase>((resolve, reject) => {
        if (!this.factory) { reject(new Error("浏览器不支持本地绘画存储，请使用现代浏览器。")); return; }
        let blocked = false;
        const request = this.factory.open(this.name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("drawings", { keyPath: "id" });
        request.onsuccess = () => {
          if (blocked) { request.result.close(); return; }
          request.result.onversionchange = () => { request.result.close(); this.connection = undefined; };
          resolve(request.result);
        };
        request.onerror = () => reject(new Error("无法打开本地绘画库，请检查浏览器存储权限。"));
        request.onblocked = () => { blocked = true; reject(new Error("绘画库被其他页面占用，请关闭旧页面后重试。")); };
      }).catch(error => { this.connection = undefined; throw error; });
    }
    return this.connection;
  }
  async list(): Promise<{ drawings: SavedDrawing[]; invalidCount: number }> {
    const db = await this.open();
    const values = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction("drawings", "readonly");
      const request = tx.objectStore("drawings").getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(new Error("无法读取绘画列表，请重试。"));
    });
    const drawings: SavedDrawing[] = [];
    let invalidCount = 0;
    for (const value of values) {
      try { drawings.push(decode(value)); } catch { invalidCount++; }
    }
    return { drawings: drawings.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)), invalidCount };
  }
  async get(id: string): Promise<SavedDrawing> {
    const db = await this.open();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction("drawings", "readonly");
      const request = tx.objectStore("drawings").get(id);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(new Error("读取绘画失败，请重试。"));
    });
    if (!value) throw new Error("找不到这份绘画，它可能已被删除。");
    return decode(value);
  }
  async save(input: SaveInput): Promise<SavedDrawing> {
    if (!safeId(input.id) || typeof input.title !== "string" || !Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error("保存参数无效。");
    const document = validateDocument(input.document);
    const title = input.title.trim().slice(0, 80) || "未命名绘画";
    const color = normalizeHex(input.color);
    if (!color) throw new Error("画笔颜色无效，无法保存。");
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("drawings", "readwrite");
      const store = tx.objectStore("drawings");
      const request = store.get(input.id);
      let result: SavedDrawing;
      let failure: Error | undefined;
      request.onsuccess = () => {
        try {
          const previous = request.result ? decode(request.result) : undefined;
          if ((previous?.revision ?? 0) !== input.revision) throw new Error("此绘画已在其他页面更新或删除。请先导出当前内容，再重新打开，避免覆盖。");
          const now = Date.now();
          result = { schema: 1, id: input.id, title, document, color, thumbnail: input.thumbnail, createdAt: previous?.createdAt ?? now, updatedAt: now, revision: input.revision + 1 };
          store.put(result);
        } catch (error) { failure = error as Error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result!);
      tx.onabort = () => reject(failure ?? new Error("保存失败：本地存储空间不足或权限受限。当前内容仍在工作台，请先导出备份。"));
    });
  }
  async remove(id: string): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drawings", "readwrite");
      tx.objectStore("drawings").delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error("删除失败，请稍后重试。"));
    });
  }
  async close(): Promise<void> { (await this.connection)?.close(); this.connection = undefined; }
}
