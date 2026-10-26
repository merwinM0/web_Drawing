import { expect, test } from "bun:test";
import { IDBFactory } from "fake-indexeddb";
import { DrawingRepository, type SaveInput } from "../src/persistence";
import { validateDocument } from "../src/validation";

const input = (id = "drawing-one"): SaveInput => ({
  id, title: "我的绘画", revision: 0, color: "#318777", thumbnail: null,
  document: { version: 2, width: 1200, height: 760, regions: [{ id: "region-one", name: "区域 1", rect: { x: 100, y: 50, width: 300, height: 200 }, binding: null,
    marks: [{ kind: "pen", brush: "ink", width: 14, color: "#318777", pressureMode: "stylus", opacity: .8, smoothing: .4, points: [{ x: 10, y: 10, pressure: .3 }, { x: 400, y: 50, pressure: .8 }] }] }] },
});
function repository(factory = new IDBFactory()): DrawingRepository { return new DrawingRepository("test-drawings", factory as unknown as globalThis.IDBFactory); }

test("创建、保存、重新打开，完整保留坐标、笔刷、压力和当前颜色", async () => {
  const factory = new IDBFactory();
  const first = repository(factory);
  const record = await first.save(input());
  expect(record.revision).toBe(1);
  expect(record.createdAt).toBeGreaterThan(0);
  expect(await first.get(record.id)).toEqual(record);
  await first.close();
  const reopened = repository(factory);
  expect(await reopened.get(record.id)).toEqual(record);
  const updated = await reopened.save({ ...record, title: "新名称", document: { ...record.document, regions: record.document.regions.map(region => ({ ...region, rect: { ...region.rect, x: 200 } })) } });
  expect(updated.revision).toBe(2);
  expect(updated.createdAt).toBe(record.createdAt);
  expect(updated.document.regions[0]!.rect.x).toBe(200);
  expect(updated.document.regions[0]!.marks).toEqual(record.document.regions[0]!.marks);
  await reopened.close();
});
test("多作品隔离，列表完整，删除后其他作品仍然保留", async () => {
  const repo = repository();
  await repo.save(input("a")); await repo.save({ ...input("b"), title: "另一个作品" });
  expect((await repo.list()).drawings).toHaveLength(2);
  await repo.remove("a");
  expect((await repo.list()).drawings.map(item => item.id)).toEqual(["b"]);
  await expect(repo.get("a")).rejects.toThrow("找不到");
  await repo.close();
});
test("并发版本冲突不会覆盖较新保存，也不会复活已删除作品", async () => {
  const repo = repository();
  const initial = await repo.save(input());
  const newer = await repo.save({ ...initial, title: "另一页面保存" });
  await expect(repo.save({ ...initial, title: "过时内容" })).rejects.toThrow("其他页面");
  expect((await repo.get(initial.id)).title).toBe(newer.title);
  await repo.remove(initial.id);
  await expect(repo.save({ ...newer, title: "删除后覆盖" })).rejects.toThrow("删除");
  await repo.close();
});
test("同时写入的事务只允许一个版本成功，不产生丢失更新", async () => {
  const factory = new IDBFactory(), first = repository(factory), second = repository(factory);
  const initial = await first.save(input());
  const results = await Promise.allSettled([first.save({ ...initial, title: "并发一" }), second.save({ ...initial, title: "并发二" })]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  expect((await first.get(initial.id)).revision).toBe(2);
  await first.close(); await second.close();
});

test("无效数据不能覆盖已有记录；非法 ID、颜色及不支持版本会被拒绝", async () => {
  const repo = repository();
  const saved = await repo.save(input());
  await expect(repo.save({ ...saved, document: { ...saved.document, version: 99 } as any })).rejects.toThrow("版本");
  await expect(repo.save({ ...saved, color: "url(x)" })).rejects.toThrow("颜色");
  await expect(repo.save({ ...saved, id: 'bad"id' })).rejects.toThrow("参数");
  expect(await repo.get(saved.id)).toEqual(saved);
  await repo.close();
});
test("受损记录保留在库内，但不会被渲染或静默覆盖", async () => {
  const factory = new IDBFactory();
  const repo = repository(factory);
  const record = await repo.save(input());
  await new Promise<void>((resolve, reject) => {
    const request = factory.open("test-drawings", 1);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("drawings", "readwrite");
      tx.objectStore("drawings").put({ ...record, id: "corrupt", document: { ...record.document, version: 99 } });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => reject(tx.error);
    };
  });
  const listed = await repo.list();
  expect(listed.drawings).toHaveLength(1); expect(listed.invalidCount).toBe(1);
  await expect(repo.get("corrupt")).rejects.toThrow("版本");
  await expect(repo.save({ ...input("corrupt"), revision: 1 })).rejects.toThrow("版本");
  expect((await repo.list()).invalidCount).toBe(1);
  await repo.close();
});
test("存储不可用时给出明确错误，不伪装成保存成功", async () => {
  const repo = new DrawingRepository("missing", undefined);
  await expect(repo.list()).rejects.toThrow("不支持");
});
test("文档校验拒绝非法几何、重复 ID、笔触和绑定，允许越界轨迹采样", () => {
  expect(validateDocument(input().document)).toEqual(input().document);
  const malformed = () => structuredClone(input().document);
  const geometry = malformed(); geometry.regions[0]!.rect.x = -1;
  expect(() => validateDocument(geometry)).toThrow();
  const duplicate = malformed(); duplicate.regions.push(duplicate.regions[0]!);
  expect(() => validateDocument(duplicate)).toThrow();
  const injectedId = malformed(); injectedId.regions[0]!.id = "unsafe)";
  expect(() => validateDocument(injectedId)).toThrow();
  const mark = malformed(); mark.regions[0]!.marks[0]!.opacity = NaN;
  expect(() => validateDocument(mark)).toThrow();
  const pressure = malformed(); pressure.regions[0]!.marks[0]!.points[0]!.pressure = 2;
  expect(() => validateDocument(pressure)).toThrow();
  const binding = malformed(); binding.regions[0]!.binding = { event: "activate", action: "test", payload: { circular: null } };
  binding.regions[0]!.binding!.payload.circular = binding.regions[0]!.binding!.payload;
  expect(() => validateDocument(binding)).toThrow();
});
