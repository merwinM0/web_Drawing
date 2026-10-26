import { validStrokeSettings, type Stroke } from "./brushes";
import { containsPoint, movedRect, validRect, type Point, type Rect } from "./geometry";

export type Tool = "select" | "region" | "pen" | "eraser";
export type Mark = Stroke;
/** Reserved data contract. No business action is executed by the editor. */
export type RegionBinding = { event: "activate"; action: string; payload: Record<string, unknown> };
export type Region = {
  id: string;
  name: string;
  rect: Rect;
  marks: Mark[];
  binding: RegionBinding | null;
};
export type DocumentState = { regions: Region[]; selectedRegionId: string | null };
export type DrawingDocument = { version: 2; width: 1200; height: 760; regions: Region[] };

/** The array is the single source of truth for stacking: bottom → top. */
export function hitTest(regions: Region[], point: Point): Region | undefined {
  for (let index = regions.length - 1; index >= 0; index--) {
    if (containsPoint(regions[index]!.rect, point)) return regions[index];
  }
  return undefined;
}

export class EditorStore {
  state: DocumentState = { regions: [], selectedRegionId: null };
  private history: DocumentState[] = [structuredClone(this.state)];
  private index = 0;

  constructor(private onChange: () => void = () => {}) {}

  load(regions: Region[]): void {
    this.state = { regions: structuredClone(regions), selectedRegionId: regions.at(-1)?.id ?? null };
    this.history = [structuredClone(this.state)];
    this.index = 0;
  }

  get selected(): Region | undefined {
    return this.state.regions.find(region => region.id === this.state.selectedRegionId);
  }
  get canUndo(): boolean { return this.index > 0; }
  get canRedo(): boolean { return this.index < this.history.length - 1; }

  select(id: string | null): void {
    this.state.selectedRegionId = this.state.regions.some(region => region.id === id) ? id : null;
  }

  private commit(change: (state: DocumentState) => void): boolean {
    const next = structuredClone(this.state);
    change(next);
    if (JSON.stringify(next) === JSON.stringify(this.state)) return false;
    // Remember the selection immediately before this edit, without adding a
    // separate undo step for simply selecting a layer.
    this.history[this.index] = structuredClone(this.state);
    this.state = next;
    this.history = this.history.slice(0, this.index + 1);
    this.history.push(structuredClone(next));
    if (this.history.length > 80) this.history.shift();
    this.index = this.history.length - 1;
    this.onChange();
    return true;
  }

  create(rect: Rect, id: string = crypto.randomUUID()): boolean {
    if (!validRect(rect) || this.state.regions.some(region => region.id === id)) return false;
    return this.commit(state => {
      let number = 1;
      while (state.regions.some(region => region.name === `区域 ${number}`)) number++;
      state.regions.push({ id, name: `区域 ${number}`, rect: structuredClone(rect), marks: [], binding: null });
      state.selectedRegionId = id;
    });
  }

  appendMark(regionId: string, mark: Mark): boolean {
    const region = this.state.regions.find(item => item.id === regionId);
    if (!region || !validStrokeSettings(mark) || !mark.points.length || !Number.isFinite(mark.width) || mark.width <= 0
      || !mark.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))
      || !containsPoint({ x: 0, y: 0, width: region.rect.width, height: region.rect.height }, mark.points[0]!)) return false;
    return this.commit(state => {
      state.regions.find(region => region.id === regionId)?.marks.push(structuredClone(mark));
    });
  }

  move(id: string, position: Point): boolean {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
    return this.commit(state => {
      const region = state.regions.find(item => item.id === id);
      if (region) region.rect = movedRect(region.rect, position);
    });
  }

  rename(name: string): boolean {
    const clean = name.trim().slice(0, 40);
    if (!clean) return false;
    return this.commit(state => {
      const region = state.regions.find(region => region.id === state.selectedRegionId);
      if (region) region.name = clean;
    });
  }

  reorder(direction: -1 | 1): boolean {
    return this.commit(state => {
      const index = state.regions.findIndex(region => region.id === state.selectedRegionId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= state.regions.length) return;
      [state.regions[index], state.regions[target]] = [state.regions[target]!, state.regions[index]!];
    });
  }

  removeSelected(): boolean {
    if (!this.selected) return false;
    return this.commit(state => {
      const index = state.regions.findIndex(region => region.id === state.selectedRegionId);
      state.regions.splice(index, 1);
      state.selectedRegionId = state.regions[Math.min(index, state.regions.length - 1)]?.id ?? null;
    });
  }

  undo(): void { if (this.canUndo) this.restore(this.index - 1); }
  redo(): void { if (this.canRedo) this.restore(this.index + 1); }
  private restore(index: number): void {
    this.index = index;
    this.state = structuredClone(this.history[index]!);
    this.onChange();
  }
}
